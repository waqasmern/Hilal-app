import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const [prodsRes, catsRes, brandsRes, varsRes, unitsRes, pkgsRes, pkgTypesRes] = await Promise.all([
            supabase.from('products').select('*').eq('is_deleted', 0).order('name'),
            supabase.from('categories').select('id, name').eq('is_deleted', 0),
            supabase.from('brands').select('id, name').eq('is_deleted', 0),
            supabase.from('product_variants').select('*').eq('is_deleted', 0).order('variant_name'),
            supabase.from('units').select('id, name, symbol'),
            supabase.from('product_packagings').select('*').order('conversion_factor'),
            supabase.from('packaging_types').select('id, name')
        ]);

        if (prodsRes.error) return NextResponse.json({ error: prodsRes.error.message }, { status: 500 });

        const catMap = Object.fromEntries((catsRes.data || []).map(c => [c.id, c.name]));
        const brandMap = Object.fromEntries((brandsRes.data || []).map(b => [b.id, b.name]));
        const unitMap = Object.fromEntries((unitsRes.data || []).map(u => [u.id, u]));
        const pkgTypeMap = Object.fromEntries((pkgTypesRes.data || []).map(pt => [pt.id, pt.name]));

        const packMap = {};
        (pkgsRes.data || []).forEach(p => {
            if (!packMap[p.variant_id]) packMap[p.variant_id] = [];
            const ptName = pkgTypeMap[p.packaging_type_id] || 'Pack';
            packMap[p.variant_id].push({
                ...p,
                packaging_name: ptName
            });
        });

        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p]));

        const productsList = (varsRes.data || []).map(v => {
            const prod = prodMap[v.product_id] || {};
            const u = unitMap[v.base_unit_id] || {};
            const uSymbol = u.symbol || u.name || 'pcs';

            const vPacks = (packMap[v.id] || []).map(p => {
                let displayPackName = p.packaging_name;
                if (p.conversion_factor === 1 && (p.packaging_name === 'Piece' || p.packaging_name === 'Unit')) {
                    displayPackName = uSymbol.toUpperCase();
                }
                return {
                    ...p,
                    packaging_name: displayPackName
                };
            });

            return {
                product_id: prod.id,
                product_uuid: prod.uuid,
                product_name: prod.name,
                description: prod.description,
                is_essential: prod.is_essential || 0,
                category_id: prod.category_id,
                category_name: catMap[prod.category_id] || '',
                brand_id: prod.brand_id,
                brand_name: brandMap[prod.brand_id] || '',
                variant_id: v.id,
                variant_uuid: v.uuid,
                sku: v.sku,
                variant_barcode: v.barcode,
                variant_name: v.variant_name,
                minimum_stock: v.minimum_stock,
                reorder_level: v.reorder_level,
                is_loose_allowed: v.is_loose_allowed,
                current_stock: v.current_stock,
                base_unit_id: v.base_unit_id,
                unit_id: u.id,
                unit_name: u.name,
                unit_symbol: u.symbol,
                packagings: vPacks
            };
        });

        return NextResponse.json(productsList);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
