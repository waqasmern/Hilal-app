import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        let query = supabase.from('sale_returns').select(`
            *,
            customers ( id, name, business_name, phone ),
            sales ( invoice_no )
        `).order('created_at', { ascending: false });

        if (startDate && endDate) {
            query = query.gte('created_at', `${startDate} 00:00:00`).lte('created_at', `${endDate} 23:59:59`);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const formatted = (data || []).map(r => ({
            ...r,
            customer_name: r.customers?.name || 'Customer',
            original_invoice_no: r.sales?.invoice_no || ''
        }));

        return NextResponse.json(formatted);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
