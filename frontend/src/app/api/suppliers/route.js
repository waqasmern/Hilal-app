import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const paginate = searchParams.get('paginate') === 'true' || searchParams.has('page');
        const search = searchParams.get('search');

        let query = supabase.from('suppliers').select('*', { count: paginate ? 'exact' : undefined }).eq('is_deleted', 0);

        if (search && search.trim()) {
            const q = search.trim();
            query = query.or(`name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`);
        }

        query = query.order('name', { ascending: true });

        if (paginate) {
            const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
            const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            query = query.range(from, to);
            const { data, count, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            return NextResponse.json({
                suppliers: data || [],
                total: count || 0,
                page,
                totalPages: Math.ceil((count || 0) / limit)
            });
        } else {
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json(data || []);
        }
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { name, company_name, phone, address, opening_balance } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Supplier name required' }, { status: 400 });
        }

        const openBal = parseFloat(opening_balance) || 0;
        const newSupplier = {
            uuid: crypto.randomUUID(),
            name: name.trim(),
            company_name: company_name ? company_name.trim() : null,
            phone: phone || null,
            address: address || null,
            opening_balance: openBal,
            balance: openBal,
            is_deleted: 0
        };

        const { data, error } = await supabase
            .from('suppliers')
            .insert([newSupplier])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
