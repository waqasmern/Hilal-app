import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const paginate = searchParams.get('paginate') === 'true' || searchParams.has('page');
        const search = searchParams.get('search');
        const status = searchParams.get('status') || 'ALL';

        let query = supabase.from('customers').select('*', { count: paginate ? 'exact' : undefined }).eq('is_deleted', 0);

        if (search && search.trim()) {
            const q = search.trim();
            query = query.or(`name.ilike.%${q}%,business_name.ilike.%${q}%,mobile.ilike.%${q}%,phone.ilike.%${q}%`);
        }

        if (status === 'DUE') {
            query = query.gt('balance', 0);
        } else if (status === 'CLEAR') {
            query = query.lte('balance', 0);
        } else if (status === 'CREDIT') {
            query = query.lt('balance', 0);
        }

        if (paginate) {
            const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
            const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            query = query.order('name', { ascending: true }).range(from, to);

            const { data, count, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            // Calculate global warehouse summary KPIs for customers
            const [allCustsRes, payRes] = await Promise.all([
                supabase.from('customers').select('balance, credit_limit').eq('is_deleted', 0),
                supabase.from('payments').select('amount').eq('party_type', 'customer')
            ]);

            const allCusts = allCustsRes.data || [];
            const totalCustomers = allCusts.length;
            const totalReceivables = allCusts.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
            const totalAdvances = allCusts.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
            const dueCustomersCount = allCusts.filter(c => c.balance > 0).length;
            const clearCustomersCount = allCusts.filter(c => c.balance <= 0).length;
            const totalCreditLimit = allCusts.reduce((sum, c) => sum + (parseFloat(c.credit_limit) || 0), 0);
            const totalDuesPaidAllTime = (payRes.data || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

            const totalPages = Math.max(1, Math.ceil((count || 0) / limit));

            return NextResponse.json({
                data: data || [],
                customers: data || [],
                pagination: {
                    total: count || 0,
                    page,
                    limit,
                    totalPages
                },
                summary: {
                    totalCustomers,
                    totalReceivables,
                    totalAdvances,
                    dueCustomersCount,
                    clearCustomersCount,
                    totalCreditLimit,
                    totalDuesPaidAllTime
                },
                total: count || 0,
                page,
                totalPages
            });
        } else {
            query = query.order('name', { ascending: true });
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json(data || []);
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
        const {
            name,
            business_name,
            phone,
            mobile,
            address,
            cnic_ntn,
            credit_limit,
            opening_balance
        } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
        }

        const nextId = await getNextId('customers');
        const openBal = parseFloat(opening_balance) || 0;
        const nowIso = new Date().toISOString();
        const newCustomer = {
            id: nextId,
            uuid: crypto.randomUUID(),
            name: name.trim(),
            business_name: business_name ? business_name.trim() : null,
            phone: phone || null,
            mobile: mobile || null,
            address: address || null,
            cnic_ntn: cnic_ntn || null,
            credit_limit: parseFloat(credit_limit) || 0,
            opening_balance: openBal,
            balance: openBal,
            is_deleted: 0,
            created_at: nowIso
        };

        const { data, error } = await supabase
            .from('customers')
            .insert([newCustomer])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        // If opening balance > 0, insert ledger entry
        if (openBal > 0) {
            const nextLedgerId = await getNextId('customer_ledger');
            await supabase.from('customer_ledger').insert([{
                id: nextLedgerId,
                uuid: crypto.randomUUID(),
                customer_id: data.id,
                amount: openBal,
                type: 'opening_balance',
                description: 'Opening Balance Recorded',
                payment_method: 'opening_balance',
                created_at: nowIso
            }]);
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
