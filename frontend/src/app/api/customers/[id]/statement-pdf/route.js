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

function generateCustomerLedgerPdf(shopName, customer, ledgerEntries, bankAccounts = []) {
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

    let y = 800;

    // Header Accent Bar
    drawRect(40, y - 6, 515, 34, 0.98, 0.97, 0.94);
    text(48, y + 12, (shopName || 'Hilal Wholesaler Shop').toUpperCase(), '/F2', 13, 0.72, 0.53, 0.04);
    text(48, y - 1, 'Customer Account Ledger & Dues Statement', '/F2', 10, 0.2, 0.2, 0.2);

    const todayStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text(370, y + 8, `Statement Date: ${todayStr}`, '/F2', 9, 0.1, 0.1, 0.1);
    text(370, y - 2, `Generated: ${timeStr}`, '/F1', 8.5, 0.4, 0.4, 0.4);

    y -= 20;
    drawLine(40, y, 555, y, 0.75, 1);
    y -= 14;

    const leftX = 45;
    const rightX = 360;
    const infoY = y;

    const cleanPhone = (customer.mobile && String(customer.mobile).trim()) || (customer.phone && String(customer.phone).trim()) || 'N/A';

    text(leftX, infoY, 'Customer Name: ', '/F2', 9);
    text(leftX + 85, infoY, customer.name || 'N/A', '/F2', 9);

    text(leftX, infoY - 14, 'Business / Shop: ', '/F2', 9);
    text(leftX + 85, infoY - 14, customer.business_name || customer.name || 'N/A', '/F1', 9);

    text(leftX, infoY - 28, 'Mobile / Phone: ', '/F2', 9);
    text(leftX + 85, infoY - 28, cleanPhone, '/F1', 9);

    text(leftX, infoY - 42, 'Address: ', '/F2', 9);
    text(leftX + 85, infoY - 42, customer.address || 'Timergara', '/F1', 9);

    text(rightX, infoY, 'Account ID: ', '/F2', 9);
    text(rightX + 80, infoY, `CUST-${String(customer.id || '1').padStart(4, '0')}`, '/F2', 9);

    text(rightX, infoY - 14, 'Credit Limit: ', '/F2', 9);
    text(rightX + 80, infoY - 14, `Rs. ${Number(customer.credit_limit || 0).toLocaleString()}`, '/F1', 9);

    const curBal = Number(customer.balance || 0);
    text(rightX, infoY - 28, 'Current Due: ', '/F2', 9.5);
    text(rightX + 80, infoY - 28, `Rs. ${curBal.toLocaleString()}`, '/F2', 10, curBal > 0 ? 0.8 : 0.1, curBal > 0 ? 0.1 : 0.5, 0.1);

    y = infoY - 55;
    drawLine(40, y, 555, y, 0.8, 1);
    y -= 10;

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

    const totalPaid = Math.max(0, (paymentsReceived - cashRefunds) + khataReturns);
    const totalCreditsApplied = paymentsReceived + khataReturns;

    drawRect(40, y - 4, 165, 24, 0.96, 0.96, 0.97);
    text(45, y + 8, 'TOTAL BILLED INVOICES', '/F2', 7.5, 0.4, 0.4, 0.4);
    text(45, y - 1, `Rs. ${Math.round(totalBilled).toLocaleString()}`, '/F2', 9.5, 0.1, 0.1, 0.1);

    drawRect(215, y - 4, 165, 24, 0.94, 0.98, 0.94);
    text(220, y + 8, 'TOTAL PAID & RETURNS', '/F2', 7.5, 0.1, 0.5, 0.2);
    text(220, y - 1, `Rs. ${Math.round(totalPaid).toLocaleString()}`, '/F2', 9.5, 0.1, 0.5, 0.2);

    drawRect(390, y - 4, 165, 24, 0.99, 0.95, 0.95);
    text(395, y + 8, 'OUTSTANDING BALANCE DUE', '/F2', 7.5, 0.7, 0.2, 0.2);
    text(395, y - 1, `Rs. ${Math.round(curBal).toLocaleString()}`, '/F2', 9.5, 0.8, 0.1, 0.1);

    y -= 32;

    drawRect(40, y - 5, 515, 18, 0.94, 0.94, 0.95);
    drawLine(40, y - 5, 555, y - 5, 0.7, 0.8);
    drawLine(40, y + 13, 555, y + 13, 0.7, 0.8);

    text(45, y, 'Date', '/F2', 8.5);
    text(110, y, 'Description / Voucher', '/F2', 8.5);
    text(268, y, 'Type', '/F2', 8.5);
    text(335, y, 'Purchase (Debit+)', '/F2', 8);
    text(420, y, 'Payment (Credit-)', '/F2', 8);
    text(500, y, 'Running Due', '/F2', 8);

    y -= 18;

    let runningCalc = 0;
    (ledgerEntries || []).slice(0, 35).forEach((row) => {
        const amt = parseFloat(row.amount) || 0;
        const isCashRefund = row.is_cash_refund !== undefined ? row.is_cash_refund : (row.type === 'return' && (row.payment_method === 'cash' || (row.description && row.description.includes('Cash Refund'))));
        if (row.type === 'charge' || row.type === 'opening_balance') runningCalc += amt;
        else if (row.type === 'payment' || (row.type === 'return' && !isCashRefund)) runningCalc -= amt;

        const dateStr = row.payment_date || (row.created_at ? (row.created_at.includes('T') ? row.created_at.split('T')[0] : row.created_at.split(' ')[0]) : '-');
        const desc = (row.description || '').substring(0, 30);
        const typeStr = (row.type === 'charge' || row.type === 'opening_balance') ? 'Invoice Bill' : (row.type === 'return' ? (isCashRefund ? 'Cash Refund' : 'Return') : 'Payment');
        const debitStr = (row.type === 'charge' || row.type === 'opening_balance') ? Number(amt).toFixed(0) : '-';
        const creditStr = (row.type === 'payment' || (row.type === 'return' && !isCashRefund)) ? Number(amt).toFixed(0) : (isCashRefund ? `${Number(amt).toFixed(0)}*` : '-');
        const balStr = Number(row.running_balance !== undefined ? row.running_balance : runningCalc).toFixed(0);

        text(45, y, dateStr, '/F1', 8);
        text(110, y, desc, '/F2', 8);
        text(268, y, typeStr, '/F1', 7.5, (row.type === 'charge' || row.type === 'opening_balance') ? 0.7 : (isCashRefund ? 0.1 : 0.4), (row.type === 'charge' || row.type === 'opening_balance') ? 0.2 : (isCashRefund ? 0.3 : 0.5), isCashRefund ? 0.7 : 0.2);
        text(345, y, debitStr, '/F1', 8, (row.type === 'charge' || row.type === 'opening_balance') ? 0.8 : 0.2, 0.1, 0.1);
        text(435, y, creditStr, '/F1', 8, (row.type === 'payment' || row.type === 'return') ? 0.1 : 0.2, (row.type === 'payment' || row.type === 'return') ? 0.5 : 0.2, 0.2);
        text(500, y, `Rs. ${balStr}`, '/F2', 8);

        y -= 3;
        drawLine(40, y, 555, y, 0.9, 0.4);
        y -= 13;
    });

    y -= 2;
    drawRect(40, y - 4, 515, 18, 0.97, 0.97, 0.97);
    drawLine(40, y - 4, 555, y - 4, 0.8, 0.6);
    drawLine(40, y + 14, 555, y + 14, 0.8, 0.6);

    text(45, y, 'TOTAL ACCOUNT SUMMARY', '/F2', 8.5);
    text(340, y, `Rs. ${Math.round(totalBilled).toLocaleString()}`, '/F2', 8.5, 0.8, 0.1, 0.1);
    text(430, y, `Rs. ${Math.round(totalCreditsApplied).toLocaleString()}`, '/F2', 8.5, 0.1, 0.5, 0.2);
    text(500, y, `Rs. ${Math.round(curBal).toLocaleString()}`, '/F2', 9, 0.1, 0.1, 0.1);

    y -= 25;

    text(45, y, 'Outstanding Balance In Words: ', '/F2', 9);
    text(200, y, (curBal > 0 ? numberToWords(curBal) : 'Account Fully Settled (Zero Dues)'), '/F2', 9);

    if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
        y -= 14;
        drawLine(40, y, 555, y, 0.85, 0.5);
        y -= 10;
        text(45, y, 'BANK DETAILS FOR ONLINE TRANSFER / PAYMENT:', '/F2', 8, 0.72, 0.53, 0.04);
        const colW = Math.min(160, Math.floor(510 / bankAccounts.length));
        y -= 12;
        const bY = y;
        bankAccounts.slice(0, 3).forEach((acc, i) => {
            const bx = 45 + (i * colW);
            drawRect(bx, bY - 24, colW - 8, 32, 0.97, 0.97, 0.98);
            text(bx + 4, bY + 2, acc.bank_name || 'Bank', '/F2', 8, 0.1, 0.1, 0.1);
            if (acc.account_title) text(bx + 4, bY - 7, `Title: ${acc.account_title}`, '/F1', 7, 0.3, 0.3, 0.3);
            text(bx + 4, bY - 15, `A/C: ${acc.account_number || ''}`, '/F2', 7.5, 0.1, 0.1, 0.1);
            if (acc.iban) text(bx + 4, bY - 22, `IBAN: ${acc.iban}`, '/F1', 6.5, 0.4, 0.4, 0.4);
        });
        y -= 26;
    }

    y -= 14;
    drawLine(40, y, 555, y, 0.85, 0.5);
    y -= 14;

    text(45, y, 'Note: Please review this statement. In case of any discrepancy, contact shop administration.', '/F1', 7.5, 0.4, 0.4, 0.4);
    text(45, y - 10, 'Thank you for your valued business and continuous partnership!', '/F2', 8, 0.72, 0.53, 0.04);
    text(390, y - 10, 'Authorized Signature & Stamp: ________________', '/F1', 7.5, 0.3, 0.3, 0.3);

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
        let bankAccounts = [];
        if (settingsRows) {
            settingsRows.forEach(s => {
                if (s.key === 'shop_name') shopName = s.value;
                if (s.key === 'bank_accounts') {
                    try {
                        const parsed = JSON.parse(s.value);
                        if (Array.isArray(parsed)) bankAccounts = parsed;
                    } catch (e) { }
                }
            });
        }

        const pdfBuf = generateCustomerLedgerPdf(shopName, customer, ledgerWithRunning, bankAccounts);
        const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');

        return new Response(pdfBuf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${safeName}_Statement.pdf"`,
                'Content-Length': String(pdfBuf.length)
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
