import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function escapePdf(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function generateCreditNotePdf(shopData, returnData, items, customer = {}, originalSale = {}) {
    let content = '';

    const shopName = typeof shopData === 'object' ? (shopData.shop_name || 'Hilal Wholesaler Shop') : 'Hilal Wholesaler Shop';
    const shopAddress = typeof shopData === 'object' ? (shopData.shop_address || 'Main Market, Timergara, Lower Dir, KP') : 'Main Market, Timergara, Lower Dir, KP';
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

    // 1. TOP HEADER
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
    text(45, y - 25, customer.business_name || customer.address || 'Timergara', '/F1', 8.5, 0.4, 0.4, 0.4);

    const rawDate = returnData.created_at ? new Date(returnData.created_at) : new Date();
    const dateFormatted = rawDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const refInvoice = originalSale?.invoice_no || 'Direct Return';

    textRight(470, y - 13, 'Credit Date :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 13, dateFormatted, '/F2', 9, 0.15, 0.15, 0.15);

    textRight(470, y - 26, 'Ref# :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 26, refInvoice, '/F1', 9, 0.2, 0.2, 0.2);

    textRight(470, y - 39, 'Return Type :', '/F1', 8.5, 0.4, 0.4, 0.4);
    textRight(550, y - 39, `${returnData.return_type || 'saleable'} (${returnData.refund_method === 'cash' ? 'Cash' : 'Khata'})`, '/F2', 8.5, 0.2, 0.2, 0.2);

    y -= 65;

    // 3. TABLE HEADER
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
        const itemRate = parseFloat(it.refund_price || it.price) || 0;
        const itemQty = parseFloat(it.quantity) || 0;
        const itemTotal = itemRate * itemQty;
        const uSymbol = it.packaging_name || 'pcs';
        const pName = it.product_name || 'Returned Product';
        const vName = it.variant_name && it.variant_name !== 'Standard' ? ` (${it.variant_name})` : '';

        text(48, y, String(idx + 1), '/F1', 8.5, 0.2, 0.2, 0.2);
        text(75, y, (pName + vName).substring(0, 42), '/F2', 8.5, 0.15, 0.15, 0.15);
        text(310, y, uSymbol, '/F1', 8, 0.35, 0.35, 0.35);
        text(390, y, `${itemQty.toFixed(2)}`, '/F1', 8.5, 0.2, 0.2, 0.2);
        text(450, y, itemRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 8.5, 0.2, 0.2, 0.2);
        textRight(548, y, itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 8.5, 0.2, 0.2, 0.2);

        y -= 16;
        drawLine(40, y + 4, 555, y + 4, 0.9, 0.5);
    });

    y -= 10;
    const subTotal = (items || []).reduce((sum, it) => sum + ((parseFloat(it.refund_price || 0)) * (parseFloat(it.quantity) || 0)), 0);
    const finalCredit = subTotal || creditAmount;

    textRight(470, y, 'Sub Total', '/F1', 9, 0.3, 0.3, 0.3);
    textRight(550, y, finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '/F1', 9, 0.2, 0.2, 0.2);

    y -= 18;
    textRight(470, y, 'Total', '/F2', 9.5, 0.1, 0.1, 0.1);
    textRight(550, y, `PKR ${finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '/F2', 9.5, 0.1, 0.1, 0.1);

    y -= 22;
    drawRect(290, y - 6, 265, 22, 0.96, 0.96, 0.96);
    text(310, y + 1, 'Credits Remaining', '/F2', 8.5, 0.2, 0.2, 0.2);
    textRight(545, y + 1, `PKR ${finalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '/F2', 9, 0.1, 0.1, 0.1);

    y -= 45;
    if (returnData.refund_method === 'credit') {
        text(45, y, `Note: This Credit Note has been credited & adjusted against ${customer.name || 'Customer'}'s Khata.`, '/F1', 8, 0.4, 0.4, 0.4);
        text(45, y - 11, `Updated Customer Khata Due Balance: PKR ${Math.round(curCustBal).toLocaleString()}`, '/F2', 8.5, 0.2, 0.5, 0.2);
    } else {
        text(45, y, `Note: This refund was settled in Cash from shop drawer to ${customer.name || 'Customer'}.`, '/F1', 8, 0.4, 0.4, 0.4);
        text(45, y - 11, `Cash Outflow: PKR ${finalCredit.toLocaleString()} (Customer ledger balance remains unchanged).`, '/F2', 8.5, 0.7, 0.2, 0.2);
    }

    drawLine(40, 50, 555, 50, 0.85, 0.5);

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
        const returnId = parseInt(id);

        let query = supabase.from('sale_returns').select(`
            *,
            customers ( id, name, business_name, phone, mobile, address, balance ),
            sales ( id, invoice_no, created_at )
        `);

        if (!isNaN(returnId)) {
            query = query.or(`id.eq.${returnId},uuid.eq.${id}`);
        } else {
            query = query.eq('uuid', id);
        }

        const { data: returns, error: retErr } = await query.limit(1);
        if (retErr || !returns || returns.length === 0) {
            return NextResponse.json({ error: 'Credit Note not found' }, { status: 404 });
        }

        const ret = returns[0];

        const { data: rawItems } = await supabase.from('sale_return_items').select('*').eq('sale_return_id', ret.id);
        const vIds = [...new Set((rawItems || []).map(i => i.variant_id))];
        const pkgIds = [...new Set((rawItems || []).map(i => i.packaging_type_id))];

        const [varsRes, pkgsRes, prodsRes, settingsRes] = await Promise.all([
            vIds.length > 0 ? supabase.from('product_variants').select('id, sku, variant_name, product_id').in('id', vIds) : { data: [] },
            pkgIds.length > 0 ? supabase.from('packaging_types').select('id, name').in('id', pkgIds) : { data: [] },
            supabase.from('products').select('id, name'),
            supabase.from('settings').select('key, value')
        ]);

        const varMap = Object.fromEntries((varsRes.data || []).map(v => [v.id, v]));
        const pkgMap = Object.fromEntries((pkgsRes.data || []).map(p => [p.id, p.name]));
        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p.name]));

        const items = (rawItems || []).map(it => {
            const v = varMap[it.variant_id] || {};
            return {
                ...it,
                sku: v.sku || '',
                variant_name: v.variant_name || '',
                product_name: prodMap[v.product_id] || 'Product',
                packaging_name: pkgMap[it.packaging_type_id] || 'Unit'
            };
        });

        const shopData = { shop_name: 'Hilal Wholesaler Shop' };
        (settingsRes.data || []).forEach(s => {
            if (s.key) shopData[s.key] = s.value;
        });

        const customer = {
            name: ret.customers?.name || 'Customer',
            business_name: ret.customers?.business_name || '',
            address: ret.customers?.address || 'Timergara',
            phone: ret.customers?.phone || '',
            mobile: ret.customers?.mobile || '',
            balance: ret.customers?.balance || 0
        };

        const originalSale = {
            invoice_no: ret.sales?.invoice_no || '',
            created_at: ret.sales?.created_at || ''
        };

        const pdfBuf = generateCreditNotePdf(shopData, ret, items, customer, originalSale);
        const cnNumber = `CN-${String(ret.id).padStart(5, '0')}`;
        const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');

        return new Response(pdfBuf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${safeName}_CreditNote_${cnNumber}.pdf"`,
                'Content-Length': String(pdfBuf.length)
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
