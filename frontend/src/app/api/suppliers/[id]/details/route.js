import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const supplierId = parseInt(id);

        const { data: supplier, error: sErr } = await supabase
            .from('suppliers')
            .select('*')
            .eq('id', supplierId)
            .single();

        if (sErr || !supplier) {
            return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
        }

        const [purchasesRes, paymentsRes] = await Promise.all([
            supabase
                .from('purchases')
                .select('*, purchase_items(count)')
                .eq('supplier_id', supplierId)
                .order('created_at', { ascending: false }),
            supabase
                .from('payments')
                .select('*')
                .eq('party_type', 'supplier')
                .eq('party_id', supplierId)
                .order('created_at', { ascending: false })
        ]);

        const purchases = (purchasesRes.data || []).map(p => ({
            ...p,
            item_count: p.purchase_items?.[0]?.count || 0
        }));

        const unpaid = purchases
            .filter(p => Number(p.remaining_balance || 0) > 0)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        return NextResponse.json({
            supplier,
            purchases,
            payments: paymentsRes.data || [],
            unpaid_purchases: unpaid
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
