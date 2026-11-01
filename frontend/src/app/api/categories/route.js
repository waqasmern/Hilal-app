import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_deleted', 0)
            .order('name', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Count products per category
        const { data: products } = await supabase
            .from('products')
            .select('id, category_id')
            .eq('is_deleted', 0);

        const prodCounts = {};
        (products || []).forEach(p => {
            prodCounts[p.category_id] = (prodCounts[p.category_id] || 0) + 1;
        });

        const formatted = (categories || []).map(c => ({
            ...c,
            product_count: prodCounts[c.id] || 0
        }));

        return NextResponse.json(formatted);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { name, is_pinned } = body;
        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Category name required' }, { status: 400 });
        }

        const uuid = crypto.randomUUID();
        const { data, error } = await supabase
            .from('categories')
            .insert([{
                uuid,
                name: name.trim(),
                is_pinned: is_pinned ? 1 : 0,
                is_deleted: 0
            }])
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
