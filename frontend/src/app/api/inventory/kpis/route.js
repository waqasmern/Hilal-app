import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const [prodsRes, varsRes, pkgsRes] = await Promise.all([
            supabase.from('products').select('id').eq('is_deleted', 0),
            supabase.from('product_variants').select('id, product_id, current_stock, minimum_stock').eq('is_deleted', 0),
            supabase.from('product_packagings').select('variant_id, purchase_price, selling_price, conversion_factor, is_default')
        ]);

        if (prodsRes.error || varsRes.error) {
            console.error('Error fetching KPI data:', prodsRes.error || varsRes.error);
            return NextResponse.json({
                total_items: 0,
                total_quantity: 0,
                low_stock_count: 0,
                out_of_stock_count: 0,
                total_valuation: 0
            });
        }

        const validProductIds = new Set((prodsRes.data || []).map(p => p.id));
        const activeVariants = (varsRes.data || []).filter(v => validProductIds.has(v.product_id));

        const defaultPackagingMap = {};
        (pkgsRes.data || []).forEach(p => {
            if (p.is_default === 1 || !defaultPackagingMap[p.variant_id]) {
                defaultPackagingMap[p.variant_id] = p;
            }
        });

        let totalQuantity = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalValuation = 0;

        activeVariants.forEach(v => {
            const stock = Number(v.current_stock || 0);
            const minStock = Number(v.minimum_stock || 10);
            totalQuantity += stock;

            if (stock <= 0) {
                outOfStockCount++;
            } else if (stock <= minStock) {
                lowStockCount++;
            }

            if (stock > 0) {
                const pack = defaultPackagingMap[v.id];
                const factor = (pack && Number(pack.conversion_factor) > 0) ? Number(pack.conversion_factor) : 1;
                const buyPrice = pack ? (Number(pack.purchase_price) || (Number(pack.selling_price) * 0.8) || 0) : 0;
                const unitCost = buyPrice / factor;
                totalValuation += (stock * unitCost);
            }
        });

        return NextResponse.json({
            total_items: activeVariants.length,
            total_quantity: Math.round(totalQuantity * 100) / 100,
            low_stock_count: lowStockCount,
            out_of_stock_count: outOfStockCount,
            total_valuation: Math.round(totalValuation)
        });
    } catch (err) {
        console.error('API /api/inventory/kpis error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
