import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { customer_id, phone, file_name } = body;

        const nextId = await getNextId('whatsapp_reminders');
        const nowIso = new Date().toISOString();

        await supabase.from('whatsapp_reminders').insert([{
            id: nextId,
            uuid: crypto.randomUUID(),
            customer_id: customer_id ? parseInt(customer_id) : null,
            phone: phone || '',
            amount: 0,
            message: `Statement PDF: ${file_name || 'Statement.pdf'}`,
            has_pdf: 1,
            status: 'sent',
            sent_at: nowIso
        }]);

        return NextResponse.json({
            success: true,
            message: `WhatsApp statement recorded for ${phone}`
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
