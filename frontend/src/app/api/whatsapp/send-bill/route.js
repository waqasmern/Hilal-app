import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function formatPakPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '92' + clean.slice(1);
    else if (!clean.startsWith('92') && clean.length === 10) clean = '92' + clean;
    return clean;
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { sale_id, phone, message, custom_sale } = body;

        if (!sale_id && !custom_sale) {
            return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 });
        }

        let sale = custom_sale;
        if (!sale && sale_id) {
            const { data } = await supabase
                .from('sales')
                .select(`
                    *,
                    customers ( id, name, business_name, phone, mobile, address )
                `)
                .eq('id', parseInt(sale_id))
                .single();
            sale = data;
        }

        if (!sale) {
            return NextResponse.json({ error: 'Invoice record not found' }, { status: 404 });
        }

        const rawPhone = phone || sale.customer_phone || sale.customer_mobile || sale.customers?.phone || sale.customers?.mobile || '';
        const cleanPhone = formatPakPhone(rawPhone);

        if (!cleanPhone) {
            return NextResponse.json({ error: 'Customer phone number is required to send bill via WhatsApp' }, { status: 400 });
        }

        const customerName = sale.customer_name || sale.customers?.name || 'محترم گاہک';
        const invoiceNo = sale.invoice_no || `INV-${sale.id}`;
        const netAmt = Math.round(Number(sale.net_amount) || 0).toLocaleString();
        const paidAmt = Math.round(Number(sale.amount_paid) || 0).toLocaleString();
        const dueAmt = Math.round(Number(sale.remaining_balance) || 0).toLocaleString();

        const shopName = 'Hilal Wholesaler Shop';
        const defaultMessage = message || (
            `السلام علیکم ${customerName} صاحب،\n\n` +
            `یہ ${shopName} سے آپ کا بل نمبر *${invoiceNo}* ہے۔\n\n` +
            `کل رقم: Rs. ${netAmt}\n` +
            `وصول شدہ: Rs. ${paidAmt}\n` +
            `بقایا واجب الادا رقم: *Rs. ${dueAmt}*\n\n` +
            `شکریہ!\n${shopName}\nMain Market, Timergara`
        );

        const encodedText = encodeURIComponent(defaultMessage);
        const waLink = `https://wa.me/${cleanPhone}?text=${encodedText}`;

        // Audit reminder event in cloud database
        try {
            const { data: maxIdData } = await supabase.from('whatsapp_reminders').select('id').order('id', { ascending: false }).limit(1);
            const nextId = (maxIdData?.[0]?.id || 0) + 1;
            await supabase.from('whatsapp_reminders').insert([{
                id: nextId,
                customer_id: sale.customer_id || sale.customers?.id || null,
                phone: cleanPhone,
                amount: Number(sale.remaining_balance) || Number(sale.net_amount) || 0,
                message: `[Bill] ${invoiceNo}`,
                has_pdf: 0,
                status: 'queued',
                created_at: new Date().toISOString()
            }]);
        } catch (_) {
            // Non-critical audit logging
        }

        return NextResponse.json({
            success: true,
            whatsapp_url: waLink,
            message: `Invoice #${invoiceNo} prepared for WhatsApp dispatch to ${customerName}.`
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
