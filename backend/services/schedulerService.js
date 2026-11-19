// backend/services/schedulerService.js
const db = require('../database');
const { sendBulkDuesReminders } = require('./reminderService');

let schedulerInterval = null;
// Key format: "YYYY-MM-DD@HH:MM" — unique per day AND per configured time
// This allows re-firing when user changes the reminder time on the same day
let lastFiredKey = '';

/**
 * Parse any time string (12h or 24h) to HH:MM 24-hour format.
 * Examples: "06:58 PM" → "18:58", "18:58" → "18:58", "2:48 PM" → "14:48"
 */
function parseTimeTo24h(timeStr) {
    if (!timeStr) return '10:00';
    let str = timeStr.trim();
    const isPM = /pm/i.test(str);
    const isAM = /am/i.test(str);
    str = str.replace(/[apmAPM]/g, '').trim();
    const parts = str.split(':');
    let hour = parseInt(parts[0], 10) || 0;
    let minute = parseInt(parts[1], 10) || 0;
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function getNow() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const date = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    return { h, m, date, time24: `${h}:${m}` };
}

/**
 * Build a unique fire key for a given date + scheduled time.
 * Format: "2026-07-27@14:48" — one fire per day per configured time.
 */
function buildFiredKey(date, time24) {
    return `${date}@${time24}`;
}

/**
 * Start (or restart) the daily reminder scheduler.
 * Checks every 30 seconds. Also fires immediately (catch-up) if the scheduled
 * time already passed today and hasn't fired yet for this configured time.
 */
function scheduleReminderJob() {
    // Stop any previously running scheduler
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[WhatsApp Scheduler] Previous scheduler stopped.');
    }

    // Read current settings from DB
    db.all(`SELECT key, value FROM settings WHERE key IN ('wa_reminder_enabled', 'wa_reminder_time')`, [], async (err, rows) => {
        let enabled = 'false';
        let rawTime = '10:00';

        if (!err && rows) {
            rows.forEach(r => {
                if (r.key === 'wa_reminder_enabled') enabled = r.value;
                if (r.key === 'wa_reminder_time') rawTime = r.value;
            });
        }

        if (enabled !== 'true') {
            console.log('[WhatsApp Scheduler] Auto-reminders are disabled. Scheduler not started.');
            return;
        }

        const time24 = parseTimeTo24h(rawTime);
        console.log(`[WhatsApp Scheduler] ✅ Active — scheduled daily at ${time24} local time. Checking every 30s.`);

        // --- Catch-up: fire immediately if today's job for this time hasn't run yet ---
        const { h, m, date } = getNow();
        const currentMinutes = parseInt(h) * 60 + parseInt(m);
        const [schedH, schedM] = time24.split(':').map(Number);
        const scheduledMinutes = schedH * 60 + schedM;
        const catchUpKey = buildFiredKey(date, time24);

        if (currentMinutes >= scheduledMinutes && lastFiredKey !== catchUpKey) {
            console.log(`[WhatsApp Scheduler] ⏰ Catch-up: ${time24} already passed today (${date}). Running reminders now...`);
            try {
                const res = await sendBulkDuesReminders(true);
                // Only mark as fired if WA was actually connected (not skipped)
                if (res && res.success !== false) {
                    lastFiredKey = catchUpKey;
                } else if (res && res.message && res.message.includes('not connected')) {
                    console.log('[WhatsApp Scheduler] ⚠️ WA not connected during catch-up — will retry when WA connects.');
                } else {
                    lastFiredKey = catchUpKey;
                }
                console.log('[WhatsApp Scheduler] ✅ Catch-up done:', res.message || JSON.stringify(res));
            } catch (e) {
                console.error('[WhatsApp Scheduler] ❌ Catch-up error:', e.message);
            }
        }

        // --- Regular interval: fire at exact scheduled time each day ---
        schedulerInterval = setInterval(async () => {
            const { date, time24: currentTime } = getNow();
            const fireKey = buildFiredKey(date, time24);

            if (currentTime === time24 && lastFiredKey !== fireKey) {
                lastFiredKey = fireKey;
                console.log(`[WhatsApp Scheduler] ⏰ Triggered at ${time24} on ${date}. Running daily auto-reminders...`);
                try {
                    const res = await sendBulkDuesReminders(true);
                    console.log('[WhatsApp Scheduler] ✅ Done:', res.message || JSON.stringify(res));
                } catch (e) {
                    console.error('[WhatsApp Scheduler] ❌ Error running reminders:', e.message);
                }
            }
        }, 30000); // every 30 seconds
    });
}

let backupSchedulerInterval = null;
let lastBackupFiredKey = '';

/**
 * Executes an automated database backup (local snapshot and email if configured).
 */
async function runAutomaticBackup() {
    const fs = require('fs');
    const path = require('path');
    const emailService = require('./emailService');

    const userDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
    const appDataDir = path.join(userDataPath, 'HilalWholesalerShop');
    const defaultBackupDir = fs.existsSync(path.join(__dirname, '..', '..', 'Backups'))
        ? path.join(__dirname, '..', '..', 'Backups')
        : path.join(appDataDir, 'Backups');

    let backupDir = defaultBackupDir;
    try {
        const row = await new Promise(res => db.get("SELECT value FROM settings WHERE key = 'local_backup_folder'", [], (err, r) => res(r)));
        if (row && row.value && row.value.trim()) {
            const custom = path.resolve(row.value.trim());
            if (!fs.existsSync(custom)) fs.mkdirSync(custom, { recursive: true });
            backupDir = custom;
        }
    } catch (e) {}

    if (!fs.existsSync(backupDir)) {
        try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {
            backupDir = path.join(appDataDir, 'Backups');
            try { if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true }); } catch (e2) {}
        }
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `wholesale-autobackup-${timestamp}.db`;
    const targetPath = path.join(backupDir, backupFileName);

    let currentDbPath = db.filename || db.dbPath;
    if (!currentDbPath || !fs.existsSync(currentDbPath)) {
        const candidates = [
            path.join(appDataDir, 'wholesale.db'),
            path.join(__dirname, '..', 'wholesale.db'),
            path.join(__dirname, 'wholesale.db')
        ];
        currentDbPath = candidates.find(c => fs.existsSync(c)) || path.join(appDataDir, 'wholesale.db');
    }

    if (!fs.existsSync(currentDbPath)) {
        console.error('[Auto-Backup Scheduler] Live database file not found at:', currentDbPath);
        return { success: false, error: 'Live database file not found' };
    }

    await new Promise((resolve, reject) => {
        db.run('VACUUM INTO ?', [targetPath], (vErr) => {
            if (!vErr && fs.existsSync(targetPath)) return resolve();
            fs.copyFile(currentDbPath, targetPath, (cErr) => {
                if (cErr) return reject(cErr);
                resolve();
            });
        });
    });

    const nowIso = new Date().toISOString();
    db.run("INSERT INTO settings (key, value) VALUES ('local_backup_last_run_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [nowIso]);
    const fileStats = fs.existsSync(targetPath) ? fs.statSync(targetPath) : { size: 0 };
    console.log(`[Auto-Backup Scheduler] ✅ Successfully created local backup: ${backupFileName} (${(fileStats.size / (1024 * 1024)).toFixed(2)} MB)`);

    // If auto email backup is also enabled, send it via email
    db.all("SELECT key, value FROM settings WHERE key LIKE 'backup_email_%' OR key = 'shop_name'", [], async (sErr, settingsRows) => {
        if (sErr || !settingsRows) return;
        const map = {};
        settingsRows.forEach(r => { map[r.key] = r.value; });
        if (map['backup_email_auto_enabled'] === 'true' && map['backup_email_user'] && map['backup_email_pass']) {
            try {
                const emailConfig = {
                    service: map['backup_email_service'] || 'gmail',
                    host: map['backup_email_host'] || 'smtp.gmail.com',
                    port: parseInt(map['backup_email_port'], 10) || 465,
                    secure: map['backup_email_secure'] !== 'false',
                    user: map['backup_email_user'],
                    pass: map['backup_email_pass']
                };
                const recipient = map['backup_email_recipient'] || map['backup_email_user'];
                await emailService.sendBackupEmail(emailConfig, recipient, targetPath, {
                    shop_name: map['shop_name'] || 'Hilal Foods Solutions',
                    customNotes: 'Automated Daily Scheduled Backup'
                });
                db.run("INSERT INTO settings (key, value) VALUES ('backup_last_email_sent_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [nowIso]);
                console.log(`[Auto-Backup Scheduler] 📧 Dispatched automated backup email to ${recipient}`);
            } catch (emailErr) {
                console.error('[Auto-Backup Scheduler] Email dispatch error:', emailErr.message);
            }
        }
    });

    return { success: true, fileName: backupFileName, path: targetPath, size: fileStats.size };
}

/**
 * Starts or restarts the daily automatic backup scheduler.
 */
function scheduleAutoBackupJob() {
    if (backupSchedulerInterval) {
        clearInterval(backupSchedulerInterval);
        backupSchedulerInterval = null;
    }

    db.all(`SELECT key, value FROM settings WHERE key IN ('local_backup_auto_enabled', 'local_backup_time')`, [], (err, rows) => {
        let enabled = 'true';
        let rawTime = '23:59';

        if (!err && rows) {
            rows.forEach(r => {
                if (r.key === 'local_backup_auto_enabled') enabled = r.value;
                if (r.key === 'local_backup_time') rawTime = r.value;
            });
        }

        if (enabled !== 'true') {
            console.log('[Auto-Backup Scheduler] Automatic local backups are currently disabled in settings.');
            return;
        }

        const time24 = parseTimeTo24h(rawTime);
        console.log(`[Auto-Backup Scheduler] ✅ Active — scheduled daily at ${time24} local time.`);

        backupSchedulerInterval = setInterval(async () => {
            const { date, time24: currentTime } = getNow();
            const fireKey = buildFiredKey(date, time24);

            if (currentTime === time24 && lastBackupFiredKey !== fireKey) {
                lastBackupFiredKey = fireKey;
                console.log(`[Auto-Backup Scheduler] ⏰ Triggered at ${time24} on ${date}. Running daily auto-backup...`);
                try {
                    await runAutomaticBackup();
                } catch (e) {
                    console.error('[Auto-Backup Scheduler] ❌ Error executing daily backup:', e.message);
                }
            }
        }, 30000); // Check every 30 seconds
    });
}

module.exports = { scheduleReminderJob, scheduleAutoBackupJob, runAutomaticBackup };
