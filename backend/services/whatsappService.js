// backend/services/whatsappService.js
const path = require('path');
const fs = require('fs');

let sock = null;
let currentStatus = 'disconnected'; // disconnected, connecting, connected
let currentQR = null;
let qrTimeout = null;

// Determine auth directory based on environment (development vs Electron AppData)
let authFolder;
if (process.env.ELECTRON_RUN_AS_NODE || process.env.NODE_ENV === 'development') {
    authFolder = path.join(__dirname, '..', 'auth_info_baileys');
} else {
    const userDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
    authFolder = path.join(userDataPath, 'HilalWholesalerShop', 'auth_info_baileys');
}

let reconnectTimer = null;
let reconnectCount = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function initWhatsApp(force = false) {
    if (!force && currentStatus === 'connecting' && sock) {
        return; // Avoid concurrent initializations
    }

    console.log(`[WhatsApp] Initializing WhatsApp Service... (Attempt ${reconnectCount + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    currentStatus = 'connecting';

    if (sock) {
        try {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.end(undefined);
        } catch (e) { }
        sock = null;
    }

    try {
        const {
            makeWASocket,
            useMultiFileAuthState,
            fetchLatestWaWebVersion,
            DisconnectReason,
            Browsers
        } = await import('@whiskeysockets/baileys');
        const pino = (await import('pino')).default;

        let version;
        try {
            const fetched = await fetchLatestWaWebVersion().catch(() => null);
            if (fetched && fetched.version) {
                version = fetched.version;
                console.log(`[WhatsApp] Using WA Web version ${version.join('.')}`);
            }
        } catch (e) {
            console.warn('[WhatsApp] Failed to fetch latest WA Web version, using default:', e);
        }

        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);

        sock = makeWASocket({
            ...(version ? { version } : {}),
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQR = qr;
                currentStatus = 'connecting';

                clearTimeout(qrTimeout);
                qrTimeout = setTimeout(() => {
                    currentQR = null;
                    console.log('[WhatsApp] QR code expired after 5 minutes.');
                }, 300000); // 5 minutes
            }

            if (connection === 'close') {
                const errorCode = lastDisconnect?.error instanceof Error
                    ? (lastDisconnect.error?.output?.statusCode)
                    : (lastDisconnect?.error?.output?.statusCode || null);
                const isLoggedOut = errorCode === DisconnectReason.loggedOut || errorCode === 405 || errorCode === 401 || errorCode === 500;

                console.log('[WhatsApp] Connection closed. Code:', errorCode, '| Logged out/Invalid:', isLoggedOut);
                currentStatus = 'disconnected';
                currentQR = null;

                if (isLoggedOut) {
                    reconnectCount = 0;
                    try {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                    } catch (e) { }
                    console.log('[WhatsApp] Stale auth folder cleared. Automatically generating fresh QR code...');
                    setTimeout(() => {
                        initWhatsApp(true);
                    }, 1000);
                } else {
                    if (reconnectCount < MAX_RECONNECT_ATTEMPTS) {
                        reconnectCount++;
                        const delay = Math.min(10000, reconnectCount * 3000);
                        console.log(`[WhatsApp] Scheduling reconnect in ${delay / 1000}s...`);
                        clearTimeout(reconnectTimer);
                        reconnectTimer = setTimeout(() => {
                            initWhatsApp();
                        }, delay);
                    } else {
                        console.log(`[WhatsApp] Max reconnect attempts reached (${MAX_RECONNECT_ATTEMPTS}). Pausing auto-reconnect.`);
                    }
                }
            } else if (connection === 'open') {
                console.log('[WhatsApp] Connected successfully!');
                currentStatus = 'connected';
                currentQR = null;
                reconnectCount = 0;
                clearTimeout(reconnectTimer);
                // Re-run scheduler so catch-up fires immediately if scheduled time already passed
                setTimeout(() => {
                    try {
                        const { scheduleReminderJob } = require('./schedulerService');
                        scheduleReminderJob();
                        console.log('[WhatsApp] Scheduler re-initialized after WA connect.');
                    } catch(e) {
                        console.error('[WhatsApp] Failed to re-init scheduler after connect:', e.message);
                    }
                }, 2000); // 2s delay to ensure connection is stable
            }
        });
    } catch (err) {
        console.error('[WhatsApp] Init Error:', err);
        currentStatus = 'disconnected';
    }
}

function getStatus() {
    return {
        status: currentStatus,
        qr: currentQR
    };
}

async function logout() {
    if (sock) {
        try {
            await sock.logout();
        } catch (e) { }
        sock = null;
    }
    currentStatus = 'disconnected';
    currentQR = null;
    try {
        fs.rmSync(authFolder, { recursive: true, force: true });
    } catch (e) { }
}

async function sendMessage(phoneNumber, message) {
    if (currentStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp is not connected. Please scan the QR code to connect.');
    }

    // Format phone number to JID (handle 0300... -> 92300...)
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedNumber.startsWith('0')) {
        formattedNumber = '92' + formattedNumber.substring(1);
    }

    const jid = `${formattedNumber}@s.whatsapp.net`;

    const [result] = await sock.onWhatsApp(jid);
    if (!result || !result.exists) {
        throw new Error(`Phone number (${phoneNumber}) is not registered on WhatsApp.`);
    }

    await sock.sendMessage(jid, { text: message });
    return true;
}

/**
 * Send a Document / PDF attachment to customer via WhatsApp Baileys
 */
async function sendDocument(phoneNumber, documentBuffer, fileName = 'Customer_Dues_Statement.pdf', caption = '', mimetype = 'application/pdf') {
    if (currentStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp is not connected. Please scan the QR code to connect.');
    }

    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedNumber.startsWith('0')) {
        formattedNumber = '92' + formattedNumber.substring(1);
    }

    const jid = `${formattedNumber}@s.whatsapp.net`;

    const [result] = await sock.onWhatsApp(jid);
    if (!result || !result.exists) {
        throw new Error(`Phone number (${phoneNumber}) is not registered on WhatsApp.`);
    }

    const buf = Buffer.isBuffer(documentBuffer) ? documentBuffer : Buffer.from(documentBuffer, 'base64');

    await sock.sendMessage(jid, {
        document: buf,
        mimetype: mimetype,
        fileName: fileName,
        caption: caption
    });
    return true;
}

module.exports = {
    initWhatsApp,
    getStatus,
    logout,
    sendMessage,
    sendDocument
};
