import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

        const [ledgerRes, salesRes, returnsRes] = await Promise.all([
            supabase.from('customer_ledger').select('*').eq('customer_id', customerId).order('created_at', { ascending: true }),
            supabase.from('sales').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
            supabase.from('sale_returns').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
        ]);

        let running = 0;
        const ledger = (ledgerRes.data || []).map(entry => {
            const isCashRefund = entry.type === 'return' && (entry.payment_method === 'cash' || (entry.description && entry.description.includes('Cash Refund')));
            const amount = parseFloat(entry.amount) || 0;
            if (entry.type === 'charge' || entry.type === 'opening_balance') {
                running += amount;
            } else if (entry.type === 'payment' || (entry.type === 'return' && !isCashRefund)) {
                running -= amount;
            }
            return {
                ...entry,
                running_balance: running,
                is_cash_refund: isCashRefund
            };
        });

        return NextResponse.json({
            customer,
            ledger,
            sales: salesRes.data || [],
            returns: returnsRes.data || []
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
