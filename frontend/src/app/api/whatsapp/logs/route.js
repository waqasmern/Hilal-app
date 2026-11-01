import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('whatsapp_reminders')
            .select(`
                *,
                customers ( name, business_name, phone )
            `)
            .order('sent_at', { ascending: false })
            .limit(50);

        if (error || !data) {
            return NextResponse.json([]);
        }

        const formatted = data.map(r => ({
            ...r,
            customer_name: r.customers?.name || 'Customer',
            customer_business: r.customers?.business_name || '',
            phone: r.phone || r.customers?.phone || ''
        }));

        return NextResponse.json(formatted);
    } catch (err) {
        return NextResponse.json([]);
    }
}
