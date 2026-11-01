import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        let query = supabase.from('sale_items').select(`
            *,
            product_variants (
                id, sku, variant_name, product_id,
                products ( id, name )
            ),
            packaging_types ( id, name )
        `);

        if (startDate && endDate) {
            query = query.gte('created_at', `${startDate} 00:00:00`).lte('created_at', `${endDate} 23:59:59`);
        }

        const { data: items, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const itemMap = {};
        (items || []).forEach(item => {
            const v = item.product_variants || {};
            const p = v.products || {};
            const key = item.variant_id;
            if (!itemMap[key]) {
                itemMap[key] = {
                    variant_id: item.variant_id,
                    product_name: p.name || 'Product',
                    variant_name: v.variant_name || '',
                    sku: v.sku || '',
                    packaging_name: item.packaging_types?.name || item.unit_name || 'Unit',
                    quantity: 0,
                    total_sales: 0
                };
            }
            itemMap[key].quantity += parseFloat(item.quantity) || 0;
            itemMap[key].total_sales += parseFloat(item.total) || 0;
        });

        const list = Object.values(itemMap).sort((a, b) => b.total_sales - a.total_sales);
        return NextResponse.json(list);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
