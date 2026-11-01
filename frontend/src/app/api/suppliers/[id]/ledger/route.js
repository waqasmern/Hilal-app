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

        const [ledgerRes, purchasesRes] = await Promise.all([
            supabase.from('supplier_ledger').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: true }),
            supabase.from('purchases').select('*, purchase_items(count)').eq('supplier_id', supplierId).order('created_at', { ascending: false })
        ]);

        let running = 0;
        const ledgerWithRunning = (ledgerRes.data || []).map(entry => {
            const amt = Number(entry.amount) || 0;
            if (entry.type === 'purchase') running += amt;
            else if (entry.type === 'payment' || entry.type === 'return') running -= amt;
            return { ...entry, running_balance: running };
        });

        const purchases = (purchasesRes.data || []).map(p => ({
            ...p,
            item_count: p.purchase_items?.[0]?.count || 0
        }));

        return NextResponse.json({
            supplier,
            ledger: ledgerWithRunning,
            purchases
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
