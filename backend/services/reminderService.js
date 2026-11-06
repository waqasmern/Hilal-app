// backend/services/reminderService.js
const { sendMessage, sendDocument, getStatus } = require('./whatsappService');
const db = require('../database');

/**
 * Format custom reminder message with template variables
 */
function buildReminderMessage(template, customerName, amount, shopName) {
    const defaultTemplate = "السلام علیکم {customer_name} صاحب،\n\nیہ {shop_name} کی طرف سے یاددہانی ہے۔ آپ کے ذمے ہمارے بقایا جات مبلغ Rs. {amount} ہیں۔\n\nبراہ کرم جلد از جلد واجب الادا رقم کی ادائیگی کا بندوبست فرمائیں۔ شکریہ!\n{shop_name}";
    const tpl = template || defaultTemplate;
    const formattedAmount = Math.round(parseFloat(amount) || 0).toLocaleString();
    return tpl
        .replace(/{customer_name}/g, customerName || 'Valued Customer')
        .replace(/{amount}/g, formattedAmount)
        .replace(/{shop_name}/g, shopName || 'Hilal Wholesaler Shop')
        .replace(/{restaurant_name}/g, shopName || 'Hilal Wholesaler Shop');
}

/**
 * Send a manual WhatsApp dues reminder to a specific customer by ID or Phone
 */
async function sendCustomerDuesReminder(customerId, customMessage, directPhone = '') {
    const waStatus = getStatus();
    if (waStatus.status !== 'connected') {
        throw new Error('WhatsApp is not connected. Please scan the QR code in Settings to connect WhatsApp.');
    }

    return new Promise((resolve, reject) => {
        db.get(`SELECT id, name, phone, mobile, balance FROM customers WHERE id = ?`, [customerId], async (err, customer) => {
            if (err || !customer) return reject(new Error('Customer not found'));

            const cleanPhone = (directPhone && String(directPhone).trim()) ||
                (customer.phone && String(customer.phone).trim()) ||
                (customer.mobile && String(customer.mobile).trim());

            if (!cleanPhone) return reject(new Error('Customer has no phone number saved'));

            db.all(`SELECT key, value FROM settings`, [], async (err, rows) => {
                let shopName = 'Hilal Wholesaler Shop';
                let waTemplate = null;
                if (!err && rows) {
                    rows.forEach(r => {
                        if (r.key === 'shop_name') shopName = r.value;
                        if (r.key === 'wa_reminder_template') waTemplate = r.value;
                    });
                }

                let messageText = customMessage;
                if (!messageText) {
                    if ((customer.balance || 0) > 0) {
                        messageText = buildReminderMessage(waTemplate, customer.name, customer.balance, shopName);
                    } else {
                        messageText = `السلام علیکم ${customer.name || 'محترم گاہک'} صاحب،\n\n${shopName} کے ریکارڈ کے مطابق آپ کا حساب بالکل کلیئر ہے اور کوئی بقایا رقم واجب الادا نہیں ہے۔\n\nہمارے ساتھ کاروبار کرنے کا بہت شکریہ!\n${shopName}`;
                    }
                }

                try {
                    await sendMessage(cleanPhone, messageText);

                    db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 0, 'sent', datetime('now', 'localtime'))`,
                        [customer.id, cleanPhone, customer.balance || 0, messageText], () => { });

                    resolve({ success: true, message: `WhatsApp message successfully sent to ${customer.name} (${cleanPhone})` });
                } catch (sendErr) {
                    db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 0, 'failed', datetime('now', 'localtime'))`,
                        [customer.id, cleanPhone, customer.balance || 0, messageText], () => { });
                    reject(sendErr);
                }
            });
        });
    });
}

/**
 * Generate a standalone standard A4 PDF Statement for customer dues / ledger
 */
function formatPdfDate(dateInput) {
    if (!dateInput) return '-';
    const s = String(dateInput).trim();
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    if (isNaN(d.getTime())) {
        const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const y = match[1];
            const m = parseInt(match[2], 10) - 1;
            const day = match[3];
            return `${day} ${months[m] || match[2]} ${y}`;
        }
        return s.substring(0, 10);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()] || '';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

function formatMoney(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStringWidth(str, font, size) {
    if (!str) return 0;
    const s = String(str);
    const isBold = font === '/F2' || (typeof font === 'string' && font.toLowerCase().includes('bold'));
    let totalUnits = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === ' ') totalUnits += 278;
        else if (c >= '0' && c <= '9') totalUnits += 556;
        else if (c >= 'A' && c <= 'Z') {
            if (isBold) {
                if (c === 'W') totalUnits += 1000;
                else if (c === 'M') totalUnits += 833;
                else if (c === 'I') totalUnits += 278;
                else if (c === 'J') totalUnits += 556;
                else if (c === 'F' || c === 'Z' || c === 'T') totalUnits += 611;
                else if (c === 'E' || c === 'P' || c === 'S' || c === 'X' || c === 'Y') totalUnits += 667;
                else if (c === 'G' || c === 'O' || c === 'Q') totalUnits += 778;
                else totalUnits += 722;
            } else {
                if (c === 'W') totalUnits += 944;
                else if (c === 'M') totalUnits += 833;
                else if (c === 'I') totalUnits += 278;
                else if (c === 'J') totalUnits += 500;
                else if (c === 'F' || c === 'Z' || c === 'T' || c === 'L') totalUnits += 556;
                else if (c === 'E' || c === 'P' || c === 'S' || c === 'X' || c === 'Y' || c === 'A' || c === 'B' || c === 'K' || c === 'V') totalUnits += 667;
                else if (c === 'G' || c === 'O' || c === 'Q') totalUnits += 778;
                else totalUnits += 722;
            }
        } else if (c >= 'a' && c <= 'z') {
            if (isBold) {
                if (c === 'm' || c === 'w') totalUnits += 833;
                else if (c === 'i' || c === 'l') totalUnits += 278;
                else if (c === 'f' || c === 't' || c === 'j' || c === 'r') totalUnits += 389;
                else totalUnits += 556;
            } else {
                if (c === 'm' || c === 'w') totalUnits += 778;
                else if (c === 'i' || c === 'l') totalUnits += 222;
                else if (c === 'f' || c === 't' || c === 'j' || c === 'r') totalUnits += 333;
                else totalUnits += 500;
            }
        } else if (c === '.' || c === ',' || c === ':' || c === ';') totalUnits += 278;
        else if (c === '-' || c === '/') totalUnits += 333;
        else if (c === '(' || c === ')') totalUnits += 333;
        else totalUnits += 500;
    }
    return (totalUnits / 1000) * (size || 8);
}

function generateCustomerLedgerPdf(shopName, customer, ledgerEntries, bankAccounts = [], shopDetails = {}) {
    let content = '';

    const drawLine = (x1, y1, x2, y2, gray, lineWidth) => {
        content += `${lineWidth || 0.5} w ${gray !== undefined ? gray : 0.7} G ${x1} ${y1} m ${x2} ${y2} l S\n`;
    };

    const drawRect = (x, y, w, h, r, g, b) => {
        content += `${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f\n`;
    };

    const text = (x, y, str, font, size, r, g, b) => {
        content += `BT ${font || '/F1'} ${size || 9} Tf ${r !== undefined ? r : 0.1} ${g !== undefined ? g : 0.1} ${b !== undefined ? b : 0.1} rg ${x} ${y} Td (${escapePdf(str)}) Tj ET\n`;
    };

    const textRight = (rightX, y, str, font, size, r, g, b) => {
        const s = String(str || '');
        const w = getStringWidth(s, font || '/F1', size || 8);
        const startX = Math.round(rightX - w);
        text(startX, y, s, font, size, r, g, b);
    };

    // Calculate Summary Metrics
    let totalBilled = 0;
    let paymentsReceived = 0;
    let cashRefunds = 0;
    let khataReturns = 0;
    (ledgerEntries || []).forEach(row => {
        const amt = parseFloat(row.amount) || 0;
        const isCashRefund = row.is_cash_refund !== undefined ? row.is_cash_refund : (row.type === 'return' && (row.payment_method === 'cash' || (row.description && row.description.includes('Cash Refund'))));
        if (row.type === 'charge' || row.type === 'opening_balance') totalBilled += amt;
        else if (row.type === 'payment') paymentsReceived += amt;
        else if (row.type === 'return') {
            if (isCashRefund) cashRefunds += amt;
            else khataReturns += amt;
        }
    });

    const totalCreditsApplied = paymentsReceived + khataReturns;
    const curBal = Number(customer.balance || 0);

    const todayStr = formatPdfDate(new Date());

    // Page boundaries: A4 [0 0 595 842]. Margins: Left=36, Right=559, Width=523.
    let y = 806;

    // 1. TOP HEADER: LEFT SIDE = CUSTOMER "To:", RIGHT SIDE = SHOP INFO
    const customerName = (customer.name || 'Customer').trim();
    const businessName = (customer.business_name || '').trim();
    const cleanPhone = (customer.mobile && String(customer.mobile).trim()) || (customer.phone && String(customer.phone).trim()) || '';
    const cleanAddress = (customer.address && String(customer.address).trim()) || 'Timergara';

    // LEFT SIDE: TO [CUSTOMER] (NO CREDIT LIMIT)
    text(40, y - 10, 'To:', '/F2', 10, 0.35, 0.35, 0.35);
    const mainCustomerTitle = (businessName || customerName).toUpperCase();
    text(40, y - 26, mainCustomerTitle, '/F2', 12, 0.1, 0.1, 0.1);

    let leftY = y - 39;
    if (businessName && customerName && businessName.toLowerCase() !== customerName.toLowerCase()) {
        text(40, leftY, `Attn: ${customerName}`, '/F1', 8.5, 0.35, 0.35, 0.35);
        leftY -= 12;
    }
    if (cleanPhone) {
        text(40, leftY, `Phone: ${cleanPhone}`, '/F1', 8.5, 0.35, 0.35, 0.35);
        leftY -= 12;
    }
    text(40, leftY, `Address: ${cleanAddress}`, '/F1', 8.5, 0.35, 0.35, 0.35);

    // RIGHT SIDE: OUR SHOP INFORMATION & STATEMENT META (Clean column alignment)
    const rightX = 355;
    text(rightX, y - 10, (shopName || 'Hilal Foods Solutions').toUpperCase(), '/F2', 12, 0.1, 0.1, 0.1);
    const shopAddr = (shopDetails.shopAddress || 'Main Bazaar, Timergara, KP, Pakistan');
    const shopPh = (shopDetails.shopPhone || '+92 300 1234567');
    text(rightX, y - 23, shopAddr, '/F1', 8.5, 0.35, 0.35, 0.35);
    text(rightX, y - 35, `Phone: ${shopPh}`, '/F1', 8.5, 0.35, 0.35, 0.35);
    text(rightX, y - 52, 'STATEMENT OF ACCOUNTS', '/F2', 12, 0.1, 0.1, 0.1);
    text(rightX, y - 66, `Statement Date: ${todayStr}`, '/F2', 8.5, 0.2, 0.2, 0.2);
    text(rightX, y - 78, `Customer ID: CUST-${String(customer.id || '1').padStart(4, '0')}`, '/F1', 8.5, 0.3, 0.3, 0.3);

    y = Math.min(leftY - 14, y - 90);

    // Clean horizontal divider line
    drawLine(36, y, 559, y, 0.75, 1);
    y -= 14;

    // 2. STATEMENT OF ACCOUNT TABLE (Matching the Image)
    // Dark Header Bar
    const headerH = 18;
    drawRect(36, y - headerH, 523, headerH, 0.22, 0.22, 0.22); // Charcoal / Dark Gray as in image

    text(42, y - 12, 'Date', '/F2', 8.5, 1, 1, 1);
    text(112, y - 12, 'Transactions', '/F2', 8.5, 1, 1, 1);
    text(195, y - 12, 'Details', '/F2', 8.5, 1, 1, 1);
    textRight(390, y - 12, 'Amount', '/F2', 8.5, 1, 1, 1);
    textRight(475, y - 12, 'Payments', '/F2', 8.5, 1, 1, 1);
    textRight(554, y - 12, 'Balance', '/F2', 8.5, 1, 1, 1);

    y -= headerH;

    // Table Rows
    let runningCalc = 0;
    const maxRows = 34;
    const rowsToRender = (ledgerEntries || []).slice(0, maxRows);

    rowsToRender.forEach((row, idx) => {
        const amt = parseFloat(row.amount) || 0;
        const isCashRefund = row.is_cash_refund !== undefined ? row.is_cash_refund : (row.type === 'return' && (row.payment_method === 'cash' || (row.description && row.description.includes('Cash Refund'))));
        if (row.type === 'charge' || row.type === 'opening_balance') runningCalc += amt;
        else if (row.type === 'payment' || (row.type === 'return' && !isCashRefund)) runningCalc -= amt;

        const rowH = 15.5;
        // Subtle zebra striping
        if (idx % 2 === 1) {
            drawRect(36, y - rowH, 523, rowH, 0.96, 0.96, 0.97);
        }

        const dateStr = formatPdfDate(row.payment_date || row.created_at);
        let transType = 'Invoice';
        let amountCol = '-';
        let paymentsCol = '-';

        if (row.type === 'opening_balance') {
            transType = '***Opening Balance***';
            amountCol = formatMoney(amt);
        } else if (row.type === 'charge') {
            transType = 'Invoice';
            amountCol = formatMoney(amt);
        } else if (row.type === 'payment') {
            transType = 'Payment Received';
            paymentsCol = formatMoney(amt);
        } else if (row.type === 'return') {
            if (isCashRefund) {
                transType = 'Cash Refund';
                paymentsCol = `${formatMoney(amt)}*`;
            } else {
                transType = 'Credit Note';
                amountCol = `(${formatMoney(amt)})`;
            }
        }

        const desc = (row.description || (row.type === 'charge' ? `Wholesale Invoice #${row.sale_id || ''}` : '')).substring(0, 32);
        const balVal = row.running_balance !== undefined ? row.running_balance : runningCalc;
        const balStr = formatMoney(balVal);

        text(42, y - 11, dateStr, '/F1', 8, 0.25, 0.25, 0.25);
        text(112, y - 11, transType, '/F1', 8, 0.15, 0.15, 0.15);
        text(195, y - 11, desc, '/F1', 7.5, 0.35, 0.35, 0.35);

        textRight(390, y - 11, amountCol, '/F1', 8, 0.15, 0.15, 0.15);
        textRight(475, y - 11, paymentsCol, '/F1', 8, 0.15, 0.15, 0.15);
        textRight(554, y - 11, balStr, '/F2', 8, 0.1, 0.1, 0.1);

        drawLine(36, y - rowH, 559, y - rowH, 0.90, 0.3);
        y -= rowH;
    });

    if (ledgerEntries.length === 0) {
        drawRect(36, y - 24, 523, 24, 0.99, 0.99, 0.99);
        text(210, y - 15, 'No transactions recorded for this account.', '/F1', 8, 0.5, 0.5, 0.5);
        y -= 24;
    }

    // 3. TOTAL SUMMARY ROW (Matching the Image)
    const summaryH = 18;
    drawRect(36, y - summaryH, 523, summaryH, 0.95, 0.95, 0.95);
    drawLine(36, y, 559, y, 0.75, 0.8);
    drawLine(36, y - summaryH, 559, y - summaryH, 0.75, 0.8);

    text(42, y - 12, 'Total', '/F2', 8.5, 0.1, 0.1, 0.1);
    textRight(390, y - 12, formatMoney(totalBilled), '/F2', 8.5, 0.1, 0.1, 0.1);
    textRight(475, y - 12, formatMoney(totalCreditsApplied), '/F2', 8.5, 0.1, 0.1, 0.1);
    textRight(554, y - 12, formatMoney(curBal), '/F2', 9, curBal > 0 ? 0.8 : 0.1, curBal > 0 ? 0.1 : 0.5, 0.1);

    y -= (summaryH + 12);

    // 4. BALANCE IN WORDS
    text(42, y - 10, 'Balance in Words: ', '/F2', 8.5, 0.35, 0.35, 0.35);
    const wordsText = curBal > 0 ? numberToWords(curBal) : (curBal < 0 ? `${numberToWords(Math.abs(curBal))} (Advance Credit)` : 'Zero Rupees Only (Fully Settled)');
    text(135, y - 10, wordsText, '/F2', 8.5, 0.1, 0.1, 0.1);

    y -= 20;

    // 5. BANK TRANSFER DETAILS (If configured)
    if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
        text(42, y - 4, 'BANK TRANSFER / PAYMENT DETAILS:', '/F2', 7.5, 0.2, 0.2, 0.2);
        y -= 8;
        const colW = Math.min(168, Math.floor(523 / bankAccounts.length));
        const bH = 34;
        const bY = y;
        bankAccounts.slice(0, 3).forEach((acc, i) => {
            const bx = 36 + (i * colW);
            drawRect(bx, bY - bH, colW - 6, bH, 0.97, 0.98, 0.99);
            text(bx + 6, bY - 10, acc.bank_name || 'Bank', '/F2', 7.5, 0.1, 0.15, 0.25);
            if (acc.account_title) text(bx + 6, bY - 18, `Title: ${acc.account_title}`, '/F1', 6.5, 0.35, 0.35, 0.35);
            text(bx + 6, bY - 26, `A/C: ${acc.account_number || ''}`, '/F2', 7, 0.15, 0.15, 0.15);
            if (acc.iban) text(bx + 6, bY - 32, `IBAN: ${acc.iban}`, '/F1', 6, 0.4, 0.4, 0.4);
        });
        y -= (bH + 12);
    }

    // 6. FOOTER & SIGN-OFF
    drawLine(36, y, 559, y, 0.85, 0.5);
    y -= 12;

    text(42, y, 'Note: This is a computer-generated statement of account. Please report discrepancies within 7 days.', '/F1', 7, 0.45, 0.45, 0.45);
    text(42, y - 10, 'Thank you for your business and partnership!', '/F2', 7.5, 0.2, 0.2, 0.2);
    text(370, y - 10, 'Authorized Signature & Stamp: ________________', '/F1', 7.5, 0.3, 0.3, 0.3);

    const contentLen = Buffer.byteLength(content, 'utf8');

    const pdfParts = [
        '%PDF-1.4\n',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj\n',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
        '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n',
        `6 0 obj << /Length ${contentLen} >>\nstream\n${content}\nendstream\nendobj\n`
    ];

    let offset = 0;
    const offsets = [];
    let body = '';
    pdfParts.forEach((part) => {
        offsets.push(offset);
        offset += Buffer.byteLength(part, 'utf8');
        body += part;
    });

    const xrefOffset = offset;
    let xref = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) {
        xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    const trailer = `trailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body + xref + trailer, 'utf8');
}

function generateSimpleStatementPdf(shopName, customerName, phone, balance, currency = 'Rs.') {
    return generateCustomerLedgerPdf(shopName, { name: customerName, phone: phone, balance: balance }, []);
}

/**
 * Send a Customer Dues Statement PDF attachment to a specific customer via WhatsApp
 */
async function sendCustomerDuesWithPdf(customerId, pdfBuffer, fileName = 'Customer_Statement.pdf', customMessage = '', directPhone = '', customLedger = null) {
    const waStatus = getStatus();
    if (waStatus.status !== 'connected') {
        throw new Error('WhatsApp is not connected. Please scan the QR code in Settings to connect WhatsApp.');
    }

    return new Promise((resolve, reject) => {
        db.get(`SELECT id, name, business_name, address, credit_limit, phone, mobile, balance FROM customers WHERE id = ?`, [customerId], async (err, customer) => {
            if (err || !customer) return reject(new Error('Customer not found'));

            const cleanPhone = (directPhone && String(directPhone).trim()) ||
                (customer.phone && String(customer.phone).trim()) ||
                (customer.mobile && String(customer.mobile).trim());

            if (!cleanPhone) return reject(new Error('Customer has no phone number saved'));

            const processPdf = (shopName, waTemplate, ledgerRows, bankAccounts = []) => {
                const captionText = customMessage || buildReminderMessage(waTemplate, customer.name, customer.balance, shopName);
                const finalBuffer = pdfBuffer || generateCustomerLedgerPdf(shopName, customer, ledgerRows || [], bankAccounts);
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
                const finalFileName = fileName || `${(customer.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}_Statement_${timestamp}.pdf`;

                sendDocument(cleanPhone, finalBuffer, finalFileName, captionText, 'application/pdf')
                    .then(() => {
                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'sent', datetime('now', 'localtime'))`,
                            [customer.id, cleanPhone, customer.balance, `[Statement PDF] ${finalFileName}`], () => { });

                        resolve({
                            success: true,
                            message: `PDF statement successfully sent via WhatsApp to ${customer.name} (${cleanPhone})`
                        });
                    })
                    .catch((sendErr) => {
                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'failed', datetime('now', 'localtime'))`,
                            [customer.id, cleanPhone, customer.balance, `[Statement PDF Failed] ${sendErr.message}`], () => { });
                        reject(sendErr);
                    });
            };

            db.all(`SELECT key, value FROM settings`, [], async (err, rows) => {
                let shopName = 'Hilal Wholesaler Shop';
                let waTemplate = null;
                let bankAccounts = [];
                if (!err && rows) {
                    rows.forEach(r => {
                        if (r.key === 'shop_name') shopName = r.value;
                        if (r.key === 'wa_reminder_template') waTemplate = r.value;
                        if (r.key === 'bank_accounts') {
                            try {
                                const parsed = JSON.parse(r.value);
                                if (Array.isArray(parsed)) bankAccounts = parsed;
                            } catch (e) { }
                        }
                    });
                }

                if (customLedger && Array.isArray(customLedger)) {
                    return processPdf(shopName, waTemplate, customLedger, bankAccounts);
                }

                db.all(`SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC, id ASC`, [customerId], (err, ledgerRows) => {
                    processPdf(shopName, waTemplate, ledgerRows || [], bankAccounts);
                });
            });
        });
    });
}

/**
 * Send bulk WhatsApp dues reminders to all customers with positive balance
 * @param {boolean} isAutomatedJob - whether this call is triggered by daily cron scheduler
 */
async function sendBulkDuesReminders(isAutomatedJob = false) {
    const waStatus = getStatus();
    if (waStatus.status !== 'connected') {
        console.log('[WhatsApp Reminder] WhatsApp is not connected. Skipping.');
        if (!isAutomatedJob) {
            throw new Error('WhatsApp is not connected. Please connect WhatsApp first.');
        }
        return { success: false, message: 'WhatsApp is not connected.' };
    }

    return new Promise((resolve, reject) => {
        db.all(`SELECT key, value FROM settings`, [], async (err, rows) => {
            let shopName = 'Hilal Wholesaler Shop';
            let waTemplate = null;
            let enabled = 'false';
            let frequencyDays = 1;

            if (!err && rows) {
                rows.forEach(r => {
                    if (r.key === 'shop_name') shopName = r.value;
                    if (r.key === 'wa_reminder_template') waTemplate = r.value;
                    if (r.key === 'wa_reminder_enabled') enabled = r.value;
                    if (r.key === 'wa_reminder_frequency') frequencyDays = parseInt(r.value) || 1;
                });
            }

            if (isAutomatedJob && enabled !== 'true') {
                console.log('[WhatsApp Reminder] Auto-reminders are disabled in settings.');
                return resolve({ success: true, count: 0, message: 'Auto-reminders are disabled.' });
            }

            db.all(`
                SELECT id, name, phone, mobile, balance 
                FROM customers 
                WHERE balance > 0 
                  AND (
                    (phone IS NOT NULL AND trim(phone) != '') OR 
                    (mobile IS NOT NULL AND trim(mobile) != '')
                  ) 
                  AND (is_deleted IS NULL OR is_deleted = 0)
            `, [], async (err, customers) => {
                if (err) return reject(err);
                if (!customers || customers.length === 0) {
                    return resolve({ success: true, count: 0, message: 'No customers found with outstanding balances' });
                }

                let successCount = 0;
                let failCount = 0;
                let skippedCount = 0;

                for (const customer of customers) {
                    const cleanPhone = (customer.phone && customer.phone.trim()) || (customer.mobile && customer.mobile.trim());
                    if (!cleanPhone) {
                        skippedCount++;
                        continue;
                    }

                    // Check last reminder date if automated job
                    if (isAutomatedJob) {
                        const lastRem = await new Promise((resCheck) => {
                            db.get(`SELECT sent_at FROM whatsapp_reminders WHERE customer_id = ? AND status = 'sent' ORDER BY id DESC LIMIT 1`, [customer.id], (e, row) => {
                                resCheck(row);
                            });
                        });

                        if (lastRem && lastRem.sent_at) {
                            const lastSentDate = new Date(lastRem.sent_at);
                            const now = new Date();
                            const diffDays = Math.ceil(Math.abs(now - lastSentDate) / (1000 * 60 * 60 * 24));
                            if (diffDays < frequencyDays) {
                                skippedCount++;
                                continue;
                            }
                        }
                    }

                    const messageText = buildReminderMessage(waTemplate, customer.name, customer.balance, shopName);
                    try {
                        await sendMessage(cleanPhone, messageText);
                        successCount++;

                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 0, 'sent', datetime('now', 'localtime'))`,
                            [customer.id, cleanPhone, customer.balance, messageText], () => { });

                        // Delay 3 seconds between messages to prevent rate limiting / spam flags
                        await new Promise(r => setTimeout(r, 3000));
                    } catch (e) {
                        failCount++;
                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 0, 'failed', datetime('now', 'localtime'))`,
                            [customer.id, cleanPhone, customer.balance, messageText], () => { });
                        console.error(`[WhatsApp Reminder] Failed to send to ${customer.name}:`, e.message);
                    }
                }

                resolve({
                    success: true,
                    total: customers.length,
                    sent: successCount,
                    skipped: skippedCount,
                    failed: failCount,
                    message: `Sent ${successCount} WhatsApp reminders (${skippedCount} skipped due to frequency, ${failCount} failed).`
                });
            });
        });
    });
}

function escapePdf(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function numberToWords(num) {
    if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
    num = Math.floor(Math.abs(num));
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function inWords(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
        if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
        if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
        return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    }
    return inWords(num) + ' Rupees Only';
}

function getPackagingSummary(items) {
    if (!items || items.length === 0) return 'Total Packages: 0';
    const counts = {};
    items.forEach(it => {
        const factor = parseFloat(it.conversion_factor) || 1;
        const qty = parseFloat(it.quantity) || 0;
        const uSymbol = it.base_unit || it.unit_symbol || it.unit_name || 'pcs';
        const packName = it.packaging_name || (factor > 1 ? 'Bulk' : uSymbol);
        counts[packName] = (counts[packName] || 0) + qty;
    });
    const parts = Object.entries(counts).map(([name, qty]) => `${qty} ${name}`);
    return 'Total Packages: ' + (parts.length > 0 ? parts.join(', ') : '0');
}

/**
 * Generate a standalone standard A4 PDF for a specific sale bill / invoice
 * Formatted exactly like the Wholesale Bill / Invoice Preview modal
 */
function generateSimpleBillPdf(shopData, sale, items, bankAccounts = []) {
    let content = '';

    const shopName = typeof shopData === 'object' ? (shopData.shop_name || 'Hilal Wholesaler Shop') : (shopData || 'Hilal Wholesaler Shop');
    const shopAddress = typeof shopData === 'object' ? (shopData.shop_address || 'Main Market, Timergara, Lower Dir, KP') : 'Main Market, Timergara, Lower Dir, KP';
    const shopPhone = typeof shopData === 'object' ? (shopData.shop_phone || '0945-825555 / 0306-0888300') : '0945-825555 / 0306-0888300';
    const shopEmail = typeof shopData === 'object' ? (shopData.shop_email || 'hilalwholesaler@gmail.com') : 'hilalwholesaler@gmail.com';

    const drawLine = (x1, y1, x2, y2, gray, lineWidth) => {
        content += `${lineWidth || 0.5} w ${gray !== undefined ? gray : 0.7} G ${x1} ${y1} m ${x2} ${y2} l S\n`;
    };

    const drawRect = (x, y, w, h, r, g, b) => {
        content += `${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f\n`;
    };

    const text = (x, y, str, font, size, r, g, b) => {
        content += `BT ${font || '/F1'} ${size || 9} Tf ${r || 0.1} ${g || 0.1} ${b || 0.1} rg ${x} ${y} Td (${escapePdf(str)}) Tj ET\n`;
    };

    let y = 800;

    // Header Accent Bar
    drawRect(40, y - 6, 515, 34, 0.98, 0.97, 0.94);
    text(48, y + 12, shopName.toUpperCase(), '/F2', 13, 0.72, 0.53, 0.04);
    text(48, y - 1, 'Wholesale Cash / Credit Memo', '/F2', 10, 0.2, 0.2, 0.2);
    text(360, y + 8, `Invoice: ${sale.invoice_no || ''}`, '/F2', 10, 0.1, 0.1, 0.1);
    text(360, y - 2, `Client: ${sale.customer_name || 'Wholesale Client'}`, '/F1', 9, 0.4, 0.4, 0.4);

    y -= 20;
    drawLine(40, y, 555, y, 0.75, 1);
    y -= 14;

    const leftX = 45;
    const rightX = 350;
    const infoY = y;

    // LEFT SIDE: Shop Name, Address, Phone, Gmail, Bank Accounts
    text(leftX, infoY, shopName.toUpperCase(), '/F2', 9.5, 0.1, 0.1, 0.1);
    text(leftX, infoY - 12, `Address: ${shopAddress}`, '/F1', 8, 0.3, 0.3, 0.3);
    text(leftX, infoY - 22, `Phone: ${shopPhone}`, '/F1', 8, 0.3, 0.3, 0.3);
    text(leftX, infoY - 32, `Email: ${shopEmail}`, '/F1', 8, 0.3, 0.3, 0.3);

    let curLeftY = infoY - 44;
    if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
        text(leftX, curLeftY, 'Bank Account(s) for Online Transfer:', '/F2', 8, 0.72, 0.53, 0.04);
        curLeftY -= 10;
        bankAccounts.slice(0, 2).forEach(acc => {
            text(leftX, curLeftY, `${acc.bank_name}: A/C ${acc.account_number}${acc.account_title ? ' (' + acc.account_title + ')' : ''}`, '/F1', 7.5, 0.2, 0.2, 0.2);
            curLeftY -= 9;
        });
    }

    // RIGHT SIDE: Invoice Details & Billed To Customer Details
    const invDate = sale.created_at ? (sale.created_at.includes('T') ? sale.created_at.split('T')[0] : sale.created_at.split(' ')[0]) : new Date().toLocaleDateString('en-GB');
    text(rightX, infoY, 'Invoice # : ', '/F2', 9);
    text(rightX + 65, infoY, sale.invoice_no || '', '/F2', 9, 0.72, 0.53, 0.04);

    text(rightX, infoY - 12, 'Invoice Date: ', '/F2', 8.5);
    text(rightX + 65, infoY - 12, invDate, '/F1', 8.5);

    const netAmt = parseFloat(sale.net_amount) || 0;
    const paidAmt = parseFloat(sale.amount_paid) || 0;
    const remAmt = sale.remaining_balance !== undefined && sale.remaining_balance !== null
        ? parseFloat(sale.remaining_balance)
        : Math.max(0, netAmt - paidAmt);
    let payStatus = 'PAID';
    if (remAmt <= 0 && (paidAmt >= netAmt || netAmt === 0)) payStatus = 'PAID';
    else if (paidAmt > 0 && remAmt > 0) payStatus = 'PARTIAL';
    else if (paidAmt <= 0) payStatus = 'PENDING';
    else {
        const ps = (sale.payment_status || '').toLowerCase();
        if (ps === 'paid') payStatus = 'PAID';
        else if (ps === 'partial') payStatus = 'PARTIAL';
        else payStatus = remAmt <= 0 ? 'PAID' : 'PENDING';
    }

    text(rightX, infoY - 23, 'Bill Status: ', '/F2', 8.5);
    if (payStatus === 'PAID') {
        text(rightX + 65, infoY - 23, 'PAID', '/F2', 8.5, 0.05, 0.55, 0.25);
    } else if (payStatus === 'PARTIAL') {
        text(rightX + 65, infoY - 23, 'PARTIAL', '/F2', 8.5, 0.72, 0.53, 0.04);
    } else {
        text(rightX + 65, infoY - 23, 'PENDING', '/F2', 8.5, 0.8, 0.15, 0.15);
    }

    text(rightX, infoY - 35, 'Customer Name: ', '/F2', 8.5);
    text(rightX + 75, infoY - 35, sale.customer_name || 'Walk-in Customer', '/F2', 8.5);

    text(rightX, infoY - 46, 'Contact Person: ', '/F1', 8);
    text(rightX + 75, infoY - 46, sale.customer_business || sale.business_name || sale.customer_name || 'Walk-in', '/F1', 8);

    text(rightX, infoY - 56, 'Mobile / Phone: ', '/F1', 8);
    text(rightX + 75, infoY - 56, sale.customer_phone || sale.customer_mobile || sale.phone || '—', '/F1', 8);

    text(rightX, infoY - 66, 'Address: ', '/F1', 8);
    text(rightX + 75, infoY - 66, sale.customer_address || '—', '/F1', 8);

    y = Math.min(curLeftY, infoY - 76) - 6;
    drawLine(40, y, 555, y, 0.8, 1);
    y -= 10;

    // Table Header
    drawRect(40, y - 5, 515, 18, 0.94, 0.94, 0.95);
    drawLine(40, y - 5, 555, y - 5, 0.7, 0.8);
    drawLine(40, y + 13, 555, y + 13, 0.7, 0.8);

    text(45, y, 'Product Description', '/F2', 8.5);
    text(220, y, 'Price', '/F2', 8.5);
    text(275, y, 'Quantity', '/F2', 8.5);
    text(345, y, 'Gross Amount', '/F2', 8.5);
    text(430, y, 'Disc.%', '/F2', 8.5);
    text(470, y, 'Disc.', '/F2', 8.5);
    text(510, y, 'Net Amount', '/F2', 8.5);

    y -= 18;

    (items || []).forEach((item, idx) => {
        const factor = parseFloat(item.conversion_factor) || 1;
        const isBulk = factor > 1;
        const uSymbol = item.base_unit || item.unit_symbol || item.unit_name || 'pcs';
        const packName = item.packaging_name || (isBulk ? 'Bulk' : uSymbol);
        const qty = parseFloat(item.quantity) || 0;
        const qtyDisplay = isBulk ? `${qty} ${packName} (${qty * factor} ${uSymbol})` : `${qty} ${uSymbol}`;
        const lineGross = (parseFloat(item.price) || 0) * qty;
        const lineDiscount = parseFloat(item.discount) || 0;
        const discPct = lineGross > 0 && lineDiscount > 0 ? ((lineDiscount / lineGross) * 100).toFixed(0) + '%' : '0%';
        const lineTotal = item.total !== undefined ? parseFloat(item.total) : (lineGross - lineDiscount);

        const pDesc = item.product_name || item.name || `Item #${idx + 1}`;
        const variantDesc = item.variant_name && item.variant_name !== 'Standard' ? ` (${item.variant_name})` : '';

        text(45, y, (pDesc + variantDesc).substring(0, 30), '/F2', 8.5);
        text(220, y, Number(item.price || 0).toFixed(0), '/F1', 8.5);
        text(275, y, qtyDisplay, '/F2', 8.5);
        text(345, y, Number(lineGross).toFixed(2), '/F1', 8.5);
        text(430, y, discPct, '/F1', 8.5);
        text(470, y, Number(lineDiscount).toFixed(0), '/F1', 8.5);
        text(510, y, Number(lineTotal).toFixed(2), '/F2', 8.5);

        y -= 4;
        drawLine(40, y, 555, y, 0.9, 0.4);
        y -= 14;
    });

    y -= 2;
    drawRect(40, y - 4, 515, 18, 0.97, 0.97, 0.97);
    drawLine(40, y - 4, 555, y - 4, 0.8, 0.5);
    drawLine(40, y + 14, 555, y + 14, 0.8, 0.5);
    text(220, y, getPackagingSummary(items), '/F2', 9, 0.2, 0.2, 0.2);

    y -= 25;

    const prevBal = sale.current_customer_balance !== undefined
        ? (parseFloat(sale.current_customer_balance) - (parseFloat(sale.remaining_balance) || 0))
        : 0;
    const grossAmt = sale.gross_amount !== undefined && sale.gross_amount !== null && parseFloat(sale.gross_amount) > 0
        ? parseFloat(sale.gross_amount)
        : (items || []).reduce((sum, it) => sum + ((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0)), 0);
    const discAmt = parseFloat(sale.discount) || 0;
    const specDiscAmt = parseFloat(sale.special_discount) || 0;
    const addCharges = parseFloat(sale.additional_charges) || 0;
    const netVal = parseFloat(sale.net_amount) || Math.max(0, grossAmt - discAmt - specDiscAmt + addCharges);
    const newBal = prevBal + (parseFloat(sale.remaining_balance) || 0);

    const balY = y;
    text(leftX, balY, 'Previous Balance : ', '/F2', 8.5);
    text(leftX + 90, balY, `Rs. ${Number(prevBal).toFixed(2)}`, '/F1', 8.5);

    text(leftX, balY - 14, 'Current Invoice: ', '/F2', 8.5);
    text(leftX + 90, balY - 14, `Rs. ${Number(netVal).toFixed(2)}`, '/F1', 8.5);

    drawLine(leftX, balY - 19, leftX + 170, balY - 19, 0.1, 1);
    text(leftX, balY - 30, 'New Balance: ', '/F2', 9.5);
    text(leftX + 90, balY - 30, `Rs. ${Number(newBal).toFixed(0)}`, '/F2', 9.5);

    const finX = 370;
    text(finX, balY, 'Gross Amount: ', '/F2', 8.5);
    text(finX + 85, balY, `Rs. ${Number(grossAmt).toFixed(2)}`, '/F1', 8.5);

    text(finX, balY - 13, 'Less Disc.: ', '/F2', 8.5);
    text(finX + 85, balY - 13, `Rs. ${Number(discAmt).toFixed(2)}`, '/F1', 8.5);

    text(finX, balY - 26, 'Less Special Disc.: ', '/F2', 8.5);
    text(finX + 85, balY - 26, `Rs. ${Number(specDiscAmt).toFixed(0)}`, '/F1', 8.5);

    text(finX, balY - 39, 'Add Charges : ', '/F2', 8.5);
    text(finX + 85, balY - 39, `Rs. ${Number(addCharges).toFixed(0)}`, '/F1', 8.5);

    drawLine(finX, balY - 44, 555, balY - 44, 0.7, 0.5);
    text(finX, balY - 55, 'Net Value: ', '/F2', 10);
    text(finX + 85, balY - 55, `Rs. ${Number(netVal).toFixed(2)}`, '/F2', 10, 0.72, 0.53, 0.04);

    y = balY - 68;
    drawLine(40, y, 555, y, 0.8, 1);
    y -= 14;

    text(45, y, 'Invoice Amount In Words: ', '/F2', 9);
    text(180, y, numberToWords(netVal), '/F2', 9);

    if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
        y -= 14;
        drawLine(40, y, 555, y, 0.85, 0.5);
        y -= 11;
        text(45, y, 'BANK DETAILS FOR ONLINE PAYMENT / TRANSFER:', '/F2', 8, 0.72, 0.53, 0.04);

        const colWidth = Math.min(160, Math.floor(510 / bankAccounts.length));
        y -= 12;
        const startBankY = y;

        bankAccounts.slice(0, 3).forEach((acc, i) => {
            const bx = 45 + (i * colWidth);
            const by = startBankY;
            drawRect(bx, by - 24, colWidth - 8, 33, 0.97, 0.97, 0.98);
            text(bx + 4, by + 2, acc.bank_name || 'Bank', '/F2', 8, 0.1, 0.1, 0.1);
            if (acc.account_title) {
                text(bx + 4, by - 6, `Title: ${acc.account_title}`, '/F1', 7, 0.3, 0.3, 0.3);
            }
            text(bx + 4, by - 14, `A/C: ${acc.account_number || ''}`, '/F2', 7.5, 0.1, 0.1, 0.1);
            if (acc.iban) {
                text(bx + 4, by - 21, `IBAN: ${acc.iban}`, '/F1', 6.5, 0.4, 0.4, 0.4);
            }
        });
        y -= 26;
    }

    const contentLen = Buffer.byteLength(content, 'utf8');

    const pdfParts = [
        '%PDF-1.4\n',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj\n',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
        '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n',
        `6 0 obj << /Length ${contentLen} >>\nstream\n${content}\nendstream\nendobj\n`
    ];

    let offset = 0;
    const offsets = [];
    let body = '';
    pdfParts.forEach((part) => {
        offsets.push(offset);
        offset += Buffer.byteLength(part, 'utf8');
        body += part;
    });

    const xrefOffset = offset;
    let xref = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) {
        xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    const trailer = `trailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body + xref + trailer, 'utf8');
}

/**
 * Send a specific Sale Bill PDF with remaining due details to customer via WhatsApp
 */
async function sendSaleBillReminder(saleId, customMessage, directPhone = '', customSale = null) {
    const waStatus = getStatus();
    if (waStatus.status !== 'connected') {
        throw new Error('WhatsApp is not connected. Please scan the QR code in Settings.');
    }

    return new Promise((resolve, reject) => {
        const processSale = (sale, items, shopName, bankAccounts = []) => {
            const cleanPhone = (directPhone && String(directPhone).trim()) ||
                (sale.customer_phone && String(sale.customer_phone).trim()) ||
                (sale.customer_mobile && String(sale.customer_mobile).trim());

            if (!cleanPhone) return reject(new Error('Customer has no phone number on record'));

            const formattedNet = Math.round(sale.net_amount || 0).toLocaleString();
            const formattedPaid = Math.round(sale.amount_paid || 0).toLocaleString();
            const formattedDue = Math.round(sale.remaining_balance || 0).toLocaleString();

            const messageText = customMessage ||
                `السلام علیکم ${sale.customer_name || 'محترم گاہک'} صاحب،\n\nیہ ${shopName} سے آپ کا بل نمبر *${sale.invoice_no}* ہے۔\n\n` +
                `کل رقم: Rs. ${formattedNet}\n` +
                `وصول شدہ: Rs. ${formattedPaid}\n` +
                `بقایا واجب الادا رقم: *Rs. ${formattedDue}*\n\n` +
                `شکریہ!\n${shopName}`;

            const billPdfBuffer = generateSimpleBillPdf(shopName, { ...sale, customer_phone: cleanPhone }, items || [], bankAccounts);

            sendDocument(cleanPhone, billPdfBuffer, `Invoice_${sale.invoice_no}.pdf`, messageText, 'application/pdf')
                .then(() => {
                    db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'sent', datetime('now', 'localtime'))`,
                        [sale.customer_id, cleanPhone, sale.remaining_balance || sale.net_amount, `[Bill PDF] ${sale.invoice_no}`], () => { });

                    resolve({ success: true, message: `Invoice #${sale.invoice_no} PDF sent to ${sale.customer_name} via WhatsApp!` });
                })
                .catch((e) => {
                    db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'failed', datetime('now', 'localtime'))`,
                        [sale.customer_id, cleanPhone, sale.remaining_balance || sale.net_amount, `[Bill PDF Failed] ${e.message}`], () => { });
                    reject(e);
                });
        };

        db.all(`SELECT key, value FROM settings`, [], async (err, rows) => {
            const shopData = {
                shop_name: 'Hilal Wholesaler Shop',
                shop_address: 'Main Market, Timergara, Lower Dir, KP',
                shop_phone: '0945-825555 / 0306-0888300',
                shop_email: 'hilalwholesaler@gmail.com'
            };
            let bankAccounts = [];
            if (!err && rows) {
                rows.forEach(r => {
                    if (r.key === 'shop_name') shopData.shop_name = r.value;
                    if (r.key === 'shop_address') shopData.shop_address = r.value;
                    if (r.key === 'shop_phone') shopData.shop_phone = r.value;
                    if (r.key === 'shop_email') shopData.shop_email = r.value;
                    if (r.key === 'bank_accounts') {
                        try {
                            const parsed = JSON.parse(r.value);
                            if (Array.isArray(parsed) && parsed.length > 0) bankAccounts = parsed;
                        } catch (e) { }
                    }
                });
            }

            if (!bankAccounts || bankAccounts.length === 0) {
                bankAccounts = [
                    {
                        bank_name: 'Meezan Bank',
                        account_title: shopData.shop_name || 'Hilal Wholesaler Shop',
                        account_number: '0101-0102030405',
                        iban: 'PK12MEZN0001010102030405',
                        branch: 'Timergara Branch'
                    }
                ];
            }

            const shopName = shopData.shop_name;

            if (customSale && customSale.items && customSale.items.length > 0) {
                return processSale(customSale, customSale.items, shopData, bankAccounts);
            }

            db.get(`
                SELECT s.*, c.name as customer_name, c.business_name as customer_business, c.address as customer_address, c.balance as current_customer_balance, c.phone as customer_phone, c.mobile as customer_mobile 
                FROM sales s 
                LEFT JOIN customers c ON s.customer_id = c.id 
                WHERE s.id = ?
            `, [saleId], async (err, sale) => {
                if (err || !sale) return reject(new Error('Sale bill not found'));

                db.all(`
                    SELECT si.*, pv.variant_name, p.name as product_name, pt.name as packaging_name, u.symbol as base_unit, pp.conversion_factor
                    FROM sale_items si
                    LEFT JOIN product_variants pv ON si.variant_id = pv.id
                    LEFT JOIN products p ON pv.product_id = p.id
                    LEFT JOIN packaging_types pt ON si.packaging_type_id = pt.id
                    LEFT JOIN units u ON pv.base_unit_id = u.id
                    LEFT JOIN product_packagings pp ON si.variant_id = pp.variant_id AND si.packaging_type_id = pp.packaging_type_id
                    WHERE si.sale_id = ?
                `, [saleId], async (err, items) => {
                    processSale(sale, items || [], shopData, bankAccounts);
                });
            });
        });
    });
}

/**
 * Generate a standalone standard A4 PDF Credit Note
 * Formatted cleanly according to user's reference voucher
 */
function generateCreditNotePdf(shopData, returnData, items, customer = {}, originalSale = {}) {
    let content = '';

    const shopName = typeof shopData === 'object' ? (shopData.shop_name || 'Hilal Wholesaler Shop') : (shopData || 'Hilal Wholesaler Shop');
    const shopAddress = typeof shopData === 'object' ? (shopData.shop_address || 'Main Market, Timergara, Lower Dir, KP') : 'Main Market, Timergara, Lower Dir, KP';
    const shopPhone = typeof shopData === 'object' ? (shopData.shop_phone || '0945-825555 / 0306-0888300') : '0945-825555 / 0306-0888300';
    const shopEmail = typeof shopData === 'object' ? (shopData.shop_email || 'hilalwholesaler@gmail.com') : 'hilalwholesaler@gmail.com';

    const drawLine = (x1, y1, x2, y2, gray, lineWidth) => {
        content += `${lineWidth || 0.5} w ${gray !== undefined ? gray : 0.7} G ${x1} ${y1} m ${x2} ${y2} l S\n`;
    };

    const drawRect = (x, y, w, h, r, g, b) => {
        content += `${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f\n`;
    };

    const text = (x, y, str, font, size, r, g, b) => {
        content += `BT ${font || '/F1'} ${size || 9} Tf ${r !== undefined ? r : 0.1} ${g !== undefined ? g : 0.1} ${b !== undefined ? b : 0.1} rg ${x} ${y} Td (${escapePdf(str)}) Tj ET\n`;
    };

    const textRight = (rightX, y, str, font, size, r, g, b) => {
        const charW = (size || 9) * 0.52;
        const width = String(str || '').length * charW;
        const x = Math.max(40, rightX - width);
        text(x, y, str, font, size, r, g, b);
    };

    let y = 800;

    // 1. TOP HEADER (Shop Details on left, CREDIT NOTE on right)
    text(45, y, shopName, '/F2', 11, 0.12, 0.12, 0.12);
    text(45, y - 13, shopAddress, '/F1', 8.5, 0.35, 0.35, 0.35);
    text(45, y - 24, 'Pakistan', '/F1', 8.5, 0.35, 0.35, 0.35);
    text(45, y - 35, shopEmail, '/F1', 8.5, 0.35, 0.35, 0.35);

    const cnNumber = `CN-${String(returnData.id || '1').padStart(5, '0')}`;
    textRight(550, y, 'CREDIT NOTE', '/F2', 20, 0.1, 0.1, 0.1);
    textRight(550, y - 16, `# ${cnNumber}`, '/F2', 9.5, 0.25, 0.25, 0.25);

    const creditAmount = parseFloat(returnData.total_refund) || 0;
    const curCustBal = Number(customer?.balance || 0);

    textRight(550, y - 34, 'Credits Remaining', '/F1', 7.5, 0.45, 0.45, 0.45);
    textRight(550, y - 46, `PKR ${creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '/F2', 11, 0.1, 0.1, 0.1);

    y -= 75;

    // 2. BILL TO & METADATA
    text(45, y, 'Bill To', '/F1', 8.5, 0.45, 0.45, 0.45);
    text(45, y - 13, customer.name || 'Walk-in Client', '/F2', 10, 0.1, 0.1, 0.1);
    if (customer.business_name && customer.business_name !== customer.name) {
        text(45, y - 25, customer.business_name, '/F2', 9, 0.25, 0.25, 0.25);
        text(45, y - 36, customer.address || 'Timergara', '/F1', 8.5, 0.4, 0.4, 0.4);
        if (customer.phone || customer.mobile) {
            text(45, y - 47, `Phone: ${customer.phone || customer.mobile}`, '/F1', 8.5, 0.4, 0.4, 0.4);
        }
    } else {
        text(45, y - 25, customer.address || 'Timergara', '/F1', 8.5, 0.4, 0.4, 0.4);
        if (customer.phone || customer.mobile) {
            text(45, y - 36, `Phone: ${customer.phone || customer.mobile}`, '/F1', 8.5, 0.4, 0.4, 0.4);
        }
    }

    const rawDate = returnData.created_at ? new Date(returnData.created_at) : new Date();
    const dateFormatted = rawDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const refInvoice = originalSale?.invoice_no || (returnData.remarks ? returnData.remarks.replace(/^Customer return for invoice /i, '').split(' ')[0] : 'Stock Return');

    textRight(470, y - 13, 'Credit Date :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 13, dateFormatted, '/F2', 9, 0.15, 0.15, 0.15);

    textRight(470, y - 26, 'Ref# :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 26, refInvoice, '/F1', 9, 0.2, 0.2, 0.2);

    textRight(470, y - 39, 'Return Type :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 39, `${returnData.return_type || 'saleable'} (${returnData.refund_method === 'cash' ? 'Cash' : 'Khata'})`, '/F2', 8.5, 0.2, 0.2, 0.2);

    y -= 65;

    // 3. TABLE HEADER (Dark Charcoal Bar)
    drawRect(40, y - 5, 515, 20, 0.22, 0.22, 0.22);
    text(48, y + 2, '#', '/F2', 8.5, 1, 1, 1);
    text(75, y + 2, 'Item & Description', '/F2', 8.5, 1, 1, 1);
    text(310, y + 2, 'Unit / Pkg', '/F2', 8.5, 1, 1, 1);
    text(390, y + 2, 'Qty', '/F2', 8.5, 1, 1, 1);
    text(450, y + 2, 'Rate', '/F2', 8.5, 1, 1, 1);
    textRight(548, y + 2, 'Amount', '/F2', 8.5, 1, 1, 1);

    y -= 20;

    // 4. TABLE ROWS
    (items || []).forEach((it, idx) => {
        const itemRate = parseFloat(it.refund_price || it.unit_price || it.price) || 0;
        const itemQty = parseFloat(it.quantity) || 0;
        const itemTotal = itemRate * itemQty;
        const uSymbol = it.packaging_name || it.unit_symbol || it.base_unit || 'pcs';
        const pName = it.product_name || it.name || 'Returned Product';
        const vName = it.variant_name && it.variant_name !== 'Standard' ? ` (${it.variant_name})` : '';
        const skuStr = it.sku ? `SKU : ${it.sku}` : '';

        text(48, y, String(idx + 1), '/F1', 8.5, 0.2, 0.2, 0.2);
        text(75, y, (pName + vName).substring(0, 42), '/F2', 8.5, 0.15, 0.15, 0.15);
        if (skuStr) {
            text(75, y - 10, skuStr, '/F1', 7, 0.45, 0.45, 0.45);
        }

        text(310, y, uSymbol, '/F1', 8, 0.35, 0.35, 0.35);
        text(390, y, `${itemQty.toFixed(2)}`, '/F1', 8.5, 0.2, 0.2, 0.2);
        text(450, y, itemRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 8.5, 0.2, 0.2, 0.2);
        textRight(548, y, itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 8.5, 0.2, 0.2, 0.2);

        y -= skuStr ? 18 : 14;
        drawLine(40, y + 4, 555, y + 4, 0.9, 0.5);
    });

    y -= 10;

    // 5. SUMMARY TOTALS
    const subTotal = (items || []).reduce((sum, it) => sum + ((parseFloat(it.refund_price || it.unit_price || 0)) * (parseFloat(it.quantity) || 0)), 0);
    const finalCredit = subTotal || creditAmount;

    textRight(470, y, 'Sub Total', '/F1', 9, 0.3, 0.3, 0.3);
    textRight(550, y, finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 9, 0.2, 0.2, 0.2);

    y -= 18;
    textRight(470, y, 'Total', '/F2', 9.5, 0.1, 0.1, 0.1);
    textRight(550, y, `PKR ${finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '/F2', 9.5, 0.1, 0.1, 0.1);

    y -= 22;
    // Highlighted Gray Bar for Credits Remaining
    drawRect(290, y - 6, 265, 22, 0.96, 0.96, 0.96);
    text(310, y + 1, 'Credits Remaining', '/F2', 8.5, 0.2, 0.2, 0.2);
    textRight(545, y + 1, `PKR ${finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '/F2', 9, 0.1, 0.1, 0.1);

    y -= 45;

    // Khata Impact Details Note
    if (returnData.refund_method === 'credit') {
        text(45, y, `Note: This Credit Note has been credited & adjusted against ${customer.name || 'Customer'}'s Khata.`, '/F1', 8, 0.4, 0.4, 0.4);
        text(45, y - 11, `Updated Customer Khata Due Balance: PKR ${Math.round(curCustBal).toLocaleString()}`, '/F2', 8.5, 0.2, 0.5, 0.2);
    } else {
        text(45, y, `Note: This refund was settled in Cash from shop drawer to ${customer.name || 'Customer'}.`, '/F1', 8, 0.4, 0.4, 0.4);
        text(45, y - 11, `Cash Outflow: PKR ${finalCredit.toLocaleString()} (Customer ledger balance remains unchanged).`, '/F2', 8.5, 0.7, 0.2, 0.2);
    }

    // Bottom Line & Page number
    drawLine(40, 50, 555, 50, 0.85, 0.5);
    text(545, 38, '1', '/F1', 8, 0.5, 0.5, 0.5);

    const contentLen = Buffer.byteLength(content, 'utf8');

    const pdfParts = [
        '%PDF-1.4\n',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj\n',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
        '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n',
        `6 0 obj << /Length ${contentLen} >>\nstream\n${content}\nendstream\nendobj\n`
    ];

    let offset = 0;
    const offsets = [];
    let body = '';
    pdfParts.forEach((part) => {
        offsets.push(offset);
        offset += Buffer.byteLength(part, 'utf8');
        body += part;
    });

    const xrefOffset = offset;
    let xref = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) {
        xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    const trailer = `trailer << /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body + xref + trailer, 'utf8');
}

/**
 * Send Credit Note PDF directly to customer via WhatsApp
 */
async function sendCreditNoteWhatsApp(returnId, customMessage = '', directPhone = '') {
    const waStatus = getStatus();
    if (waStatus.status !== 'connected') {
        throw new Error('WhatsApp is not connected. Please scan QR in Settings or use WhatsApp web link.');
    }

    return new Promise((resolve, reject) => {
        const query = `
            SELECT sr.*, 
                   c.name as customer_name, c.business_name as customer_business, c.phone as customer_phone, c.mobile as customer_mobile, c.address as customer_address, c.balance as current_customer_balance,
                   s.invoice_no as original_invoice_no, s.created_at as original_sale_date,
                   u.username as cashier_name
            FROM sale_returns sr
            LEFT JOIN customers c ON sr.customer_id = c.id
            LEFT JOIN sales s ON sr.sale_id = s.id
            LEFT JOIN users u ON sr.user_id = u.id
            WHERE sr.id = ?
        `;

        db.get(query, [returnId], (err, retRow) => {
            if (err || !retRow) return reject(new Error('Credit note / return not found'));

            const itemsQuery = `
                SELECT sri.*, pv.sku, pv.variant_name, p.name as product_name, pt.name as packaging_name, u.symbol as base_unit
                FROM sale_return_items sri
                LEFT JOIN product_variants pv ON sri.variant_id = pv.id
                LEFT JOIN products p ON pv.product_id = p.id
                LEFT JOIN packaging_types pt ON sri.packaging_type_id = pt.id
                LEFT JOIN units u ON pv.base_unit_id = u.id
                WHERE sri.sale_return_id = ?
            `;

            db.all(itemsQuery, [returnId], (err, items) => {
                if (err) return reject(err);

                db.all("SELECT key, value FROM settings", [], async (err, settings) => {
                    const shopData = { shop_name: 'Hilal Wholesaler Shop' };
                    if (settings) {
                        settings.forEach(s => { shopData[s.key] = s.value; });
                    }

                    const customer = {
                        name: retRow.customer_name,
                        business_name: retRow.customer_business,
                        address: retRow.customer_address,
                        phone: retRow.customer_phone,
                        mobile: retRow.customer_mobile,
                        balance: retRow.current_customer_balance
                    };

                    const originalSale = {
                        invoice_no: retRow.original_invoice_no,
                        created_at: retRow.original_sale_date
                    };

                    const pdfBuffer = generateCreditNotePdf(shopData, retRow, items || [], customer, originalSale);
                    const cnNumber = `CN-${String(retRow.id).padStart(5, '0')}`;
                    const fileName = `Credit_Note_${cnNumber}.pdf`;

                    const cleanPhone = (directPhone && String(directPhone).trim()) ||
                        (retRow.customer_phone && String(retRow.customer_phone).trim()) ||
                        (retRow.customer_mobile && String(retRow.customer_mobile).trim());

                    if (!cleanPhone) return reject(new Error('Customer has no phone number on record'));

                    const caption = customMessage || `محترم ${retRow.customer_name || 'گاہک'} صاحب،\n\nآپ کا کریڈٹ نوٹ #${cnNumber} مبلغ Rs. ${Number(retRow.total_refund).toLocaleString()} جاری کر دیا گیا ہے۔ منسلک پی ڈی ایف فائل ملاحظہ فرمائیں۔\n\nشکریہ!\n${shopData.shop_name || 'Hilal Wholesaler Shop'}`;

                    try {
                        await sendDocument(cleanPhone, pdfBuffer, fileName, caption, 'application/pdf');
                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'sent', datetime('now', 'localtime'))`,
                            [retRow.customer_id, cleanPhone, retRow.total_refund, `[Credit Note PDF] ${fileName}`], () => { });

                        resolve({ success: true, message: `Credit Note #${cnNumber} sent via WhatsApp to ${retRow.customer_name} (${cleanPhone})` });
                    } catch (sendErr) {
                        db.run(`INSERT INTO whatsapp_reminders (customer_id, phone, amount, message, has_pdf, status, sent_at) VALUES (?, ?, ?, ?, 1, 'failed', datetime('now', 'localtime'))`,
                            [retRow.customer_id, cleanPhone, retRow.total_refund, `[Credit Note PDF Failed] ${sendErr.message}`], () => { });
                        reject(sendErr);
                    }
                });
            });
        });
    });
}

module.exports = {
    buildReminderMessage,
    sendCustomerDuesReminder,
    sendCustomerDuesWithPdf,
    sendBulkDuesReminders,
    sendSaleBillReminder,
    generateSimpleBillPdf,
    generateCustomerLedgerPdf,
    generateCreditNotePdf,
    sendCreditNoteWhatsApp,
    numberToWords
};

