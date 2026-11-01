import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function formatPakPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '92' + clean.slice(1);
    else if (!clean.startsWith('92') && clean.length === 10) clean = '92' + clean;
    return clean;
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const reqPhone = body.phone;

        const returnId = parseInt(id);
        let query = supabase.from('sale_returns').select(`
            *,
            customers ( id, name, phone, mobile ),
            sales ( invoice_no )
        `);

        if (!isNaN(returnId)) {
            query = query.or(`id.eq.${returnId},uuid.eq.${id}`);
        } else {
            query = query.eq('uuid', id);
        }

        const { data: returns, error } = await query.limit(1);
        if (error || !returns || returns.length === 0) {
            return NextResponse.json({ error: 'Credit Note record not found' }, { status: 404 });
        }

        const ret = returns[0];
        const rawPhone = reqPhone || ret.customers?.phone || ret.customers?.mobile || '';
        const cleanPhone = formatPakPhone(rawPhone);

        const cnNumber = `CN-${String(ret.id).padStart(5, '0')}`;
        const refundAmt = Number(ret.total_refund || 0).toLocaleString();
        const invoiceRef = ret.sales?.invoice_no || `Invoice #${ret.sale_id || ''}`;
        const custName = ret.customers?.name || 'محترم گاہک';

        const defaultMessage = `السلام علیکم ${custName} صاحب،\nآپ کا کریڈٹ نوٹ #${cnNumber} مبلغ Rs. ${refundAmt} (بابت بل #${invoiceRef}) جاری کر دیا گیا ہے۔\nشکریہ!\nHilal Wholesaler Shop\nMain Market, Timergara`;
        const encodedText = encodeURIComponent(body.message || defaultMessage);
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedText}` : null;

        // Audit reminder event in cloud database if customer present
        if (ret.customer_id) {
            try {
                const { data: maxIdData } = await supabase.from('whatsapp_reminders').select('id').order('id', { ascending: false }).limit(1);
                const nextId = (maxIdData?.[0]?.id || 0) + 1;
                await supabase.from('whatsapp_reminders').insert([{
                    id: nextId,
                    customer_id: ret.customer_id,
                    phone_number: cleanPhone || 'N/A',
                    message_type: 'CREDIT_NOTE',
                    status: 'queued',
                    message: defaultMessage,
                    created_at: new Date().toISOString()
                }]);
            } catch (_) {
                // Non-critical audit logging
            }
        }

        return NextResponse.json({
            success: false,
            is_disconnected: true,
            whatsapp_url: waLink,
            message: 'In cloud mode, click the WhatsApp link to send the Credit Note directly via WhatsApp.'
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
