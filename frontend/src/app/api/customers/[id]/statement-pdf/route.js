import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const customerId = parseInt(id);

        const { data: customer, error: cErr } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

        if (cErr || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const { data: entries } = await supabase
            .from('customer_ledger')
            .select('*')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: true });

        let running = 0;
        const ledgerWithRunning = (entries || []).map(entry => {
            const isCashRefund = entry.type === 'return' && (entry.payment_method === 'cash' || (entry.description && entry.description.includes('Cash Refund')));
            const amount = parseFloat(entry.amount) || 0;
            if (entry.type === 'charge' || entry.type === 'opening_balance') running += amount;
            else if (entry.type === 'payment' || (entry.type === 'return' && !isCashRefund)) running -= amount;
            return { ...entry, running_balance: running, is_cash_refund: isCashRefund };
        });

        const { data: settingsRows } = await supabase.from('settings').select('key, value');
        let shopName = 'Hilal Wholesaler Shop';
        let shopAddress = 'Main Bazaar, Timergara, KP, Pakistan';
        let shopPhone = '+92 300 1234567';
        let bankAccounts = [];
        if (settingsRows) {
            settingsRows.forEach(s => {
                if (s.key === 'shop_name') shopName = s.value;
                if (s.key === 'shop_address') shopAddress = s.value;
                if (s.key === 'shop_phone') shopPhone = s.value;
                if (s.key === 'bank_accounts') {
                    try {
                        const parsed = JSON.parse(s.value);
                        if (Array.isArray(parsed)) bankAccounts = parsed;
                    } catch (e) { }
                }
            });
        }

        const pdfBuf = generateCustomerLedgerPdf(shopName, customer, ledgerWithRunning, bankAccounts, { shopAddress, shopPhone });
        const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        return new Response(pdfBuf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${safeName}_Statement_${timestamp}.pdf"`,
                'Content-Length': String(pdfBuf.length)
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
