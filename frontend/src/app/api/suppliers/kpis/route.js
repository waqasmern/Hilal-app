import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const [purchasesRes, paymentsRes, suppliersRes] = await Promise.all([
            supabase.from('purchases').select('net_amount'),
            supabase.from('payments').select('amount').eq('party_type', 'supplier'),
            supabase.from('suppliers').select('balance').eq('is_deleted', 0)
        ]);

        const purchases = purchasesRes.data || [];
        const payments = paymentsRes.data || [];
        const suppliers = suppliersRes.data || [];

        const total_stock_added = purchases.reduce((sum, p) => sum + (Number(p.net_amount) || 0), 0);
        const total_purchases_count = purchases.length;
        const total_paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const total_pending = suppliers.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
        const supplier_count = suppliers.length;

        return NextResponse.json({
            total_stock_added,
            total_purchases_count,
            total_paid,
            total_pending,
            supplier_count
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
