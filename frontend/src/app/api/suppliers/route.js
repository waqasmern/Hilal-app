import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const paginate = searchParams.get('paginate') === 'true' || searchParams.has('page');
        const search = searchParams.get('search');
        const status = searchParams.get('status');

        let query = supabase.from('suppliers').select('*', { count: paginate ? 'exact' : undefined }).eq('is_deleted', 0);

        if (search && search.trim()) {
            const q = search.trim();
            query = query.or(`name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%`);
        }

        const normStatus = (status || '').toLowerCase();
        if (normStatus === 'pending' || normStatus === 'due') {
            query = query.gt('balance', 0.01);
        } else if (normStatus === 'cleared' || normStatus === 'clear') {
            query = query.lte('balance', 0.01).gte('balance', -0.01);
        }

        query = query.order('name', { ascending: true });

        // Fetch purchase and payment stats for enriched supplier cards
        const [purchStatsRes, payStatsRes] = await Promise.all([
            supabase.from('purchases').select('supplier_id, net_amount'),
            supabase.from('payments').select('party_id, amount').eq('party_type', 'supplier')
        ]);

        const purchMap = {};
        (purchStatsRes.data || []).forEach(p => {
            const sid = p.supplier_id;
            if (!purchMap[sid]) purchMap[sid] = { count: 0, amount: 0 };
            purchMap[sid].count += 1;
            purchMap[sid].amount += (parseFloat(p.net_amount) || 0);
        });

        const payMap = {};
        (payStatsRes.data || []).forEach(p => {
            const sid = p.party_id;
            if (!payMap[sid]) payMap[sid] = 0;
            payMap[sid] += (parseFloat(p.amount) || 0);
        });

        const enrich = (s) => ({
            ...s,
            total_purchases: purchMap[s.id]?.count || 0,
            total_purchase_amount: purchMap[s.id]?.amount || 0,
            total_paid: payMap[s.id] || 0
        });

        if (paginate) {
            const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
            const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            query = query.range(from, to);
            const { data, count, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const enrichedData = (data || []).map(enrich);

            // Calculate global supplier summary KPIs
            const { data: allSupps } = await supabase.from('suppliers').select('balance').eq('is_deleted', 0);
            const activeSupps = allSupps || [];
            const allPurchs = purchStatsRes.data || [];
            const allPays = payStatsRes.data || [];

            const total_suppliers = activeSupps.length;
            const total_payables = activeSupps.reduce((sum, s) => sum + ((s.balance || 0) > 0.01 ? s.balance : 0), 0);
            const pending_suppliers_count = activeSupps.filter(s => (s.balance || 0) > 0.01).length;
            const cleared_suppliers_count = activeSupps.filter(s => Math.abs(s.balance || 0) <= 0.01).length;
            const total_stock_added = allPurchs.reduce((sum, p) => sum + (parseFloat(p.net_amount) || 0), 0);
            const total_purchases_count = allPurchs.length;
            const total_paid = allPays.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

            const totalPages = Math.max(1, Math.ceil((count || 0) / limit));

            return NextResponse.json({
                data: enrichedData,
                suppliers: enrichedData,
                pagination: {
                    total: count || 0,
                    page,
                    limit,
                    totalPages
                },
                summary: {
                    total_suppliers,
                    total_payables,
                    pending_suppliers_count,
                    cleared_suppliers_count,
                    total_stock_added,
                    total_purchases_count,
                    total_paid
                },
                total: count || 0,
                page,
                totalPages
            });
        } else {
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json((data || []).map(enrich));
        }
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { name, company_name, phone, address, opening_balance } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Supplier name required' }, { status: 400 });
        }

        const nextId = await getNextId('suppliers');
        const openBal = parseFloat(opening_balance) || 0;
        const nowIso = new Date().toISOString();
        const newSupplier = {
            id: nextId,
            uuid: crypto.randomUUID(),
            name: name.trim(),
            company_name: company_name ? company_name.trim() : null,
            phone: phone || null,
            address: address || null,
            opening_balance: openBal,
            balance: openBal,
            is_deleted: 0,
            created_at: nowIso
        };

        const { data, error } = await supabase
            .from('suppliers')
            .insert([newSupplier])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        if (openBal > 0) {
            const nextLedgerId = await getNextId('supplier_ledger');
            await supabase.from('supplier_ledger').insert([{
                id: nextLedgerId,
                uuid: crypto.randomUUID(),
                supplier_id: data.id,
                amount: openBal,
                type: 'purchase',
                description: 'Opening Balance Recorded',
                created_at: nowIso
            }]);
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
