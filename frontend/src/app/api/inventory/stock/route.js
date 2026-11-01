import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page')) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit')) || 25));
        const isPaginated = searchParams.get('paginate') === 'true' || searchParams.has('page') || searchParams.has('limit');
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        const category = searchParams.get('category');
        const status = searchParams.get('status');

        // Parallel fetch all needed tables from Supabase
        const [prodsRes, catsRes, varsRes, unitsRes, pkgsRes, pkgTypesRes, stocksRes] = await Promise.all([
            supabase.from('products').select('*').eq('is_deleted', 0),
            supabase.from('categories').select('id, name'),
            supabase.from('product_variants').select('*').eq('is_deleted', 0),
            supabase.from('units').select('id, name, symbol'),
            supabase.from('product_packagings').select('*').order('conversion_factor', { ascending: true }),
            supabase.from('packaging_types').select('id, name'),
            supabase.from('inventory_stock').select('*')
        ]);

        if (prodsRes.error) {
            console.error('Error fetching products:', prodsRes.error);
            return NextResponse.json({ error: prodsRes.error.message }, { status: 500 });
        }

        const catMap = Object.fromEntries((catsRes.data || []).map(c => [c.id, c.name]));
        const unitMap = Object.fromEntries((unitsRes.data || []).map(u => [u.id, u]));
        const pkgTypeMap = Object.fromEntries((pkgTypesRes.data || []).map(pt => [pt.id, pt.name]));
        const stockMap = Object.fromEntries((stocksRes.data || []).map(s => [s.variant_id, s]));
        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p]));

        const packagingMap = {};
        (pkgsRes.data || []).forEach(p => {
            if (!packagingMap[p.variant_id]) packagingMap[p.variant_id] = [];
            packagingMap[p.variant_id].push({
                ...p,
                packaging_name: pkgTypeMap[p.packaging_type_id] || 'Pack'
            });
        });

        // Build combined variants list
        let combined = [];
        (varsRes.data || []).forEach(v => {
            const prod = prodMap[v.product_id];
            if (!prod) return; // parent product deleted or missing

            const u = unitMap[v.base_unit_id] || {};
            const stockRow = stockMap[v.id] || {};
            const packagings = packagingMap[v.id] || [];

            combined.push({
                variant_id: v.id,
                variant_uuid: v.uuid,
                sku: v.sku || '',
                variant_barcode: v.barcode || '',
                variant_name: v.variant_name || 'Standard',
                current_stock: Number(v.current_stock ?? 0),
                minimum_stock: Number(v.minimum_stock ?? 10),
                reorder_level: Number(v.reorder_level ?? 20),
                is_loose_allowed: Boolean(v.is_loose_allowed),
                base_unit_id: v.base_unit_id,
                product_id: prod.id,
                product_uuid: prod.uuid,
                product_name: prod.name || '',
                is_essential: prod.is_essential || 0,
                category_id: prod.category_id,
                category_name: catMap[prod.category_id] || '',
                unit_name: u.name || '',
                unit_symbol: u.symbol || u.name || '',
                base_stock: stockRow.quantity ?? v.current_stock ?? 0,
                loose_quantity: stockRow.loose_quantity ?? 0,
                packagings
            });
        });

        // Filter by search
        if (search) {
            combined = combined.filter(item => {
                return (
                    (item.product_name && item.product_name.toLowerCase().includes(search)) ||
                    (item.variant_name && item.variant_name.toLowerCase().includes(search)) ||
                    (item.sku && item.sku.toLowerCase().includes(search)) ||
                    (item.variant_barcode && item.variant_barcode.toLowerCase().includes(search)) ||
                    (item.category_name && item.category_name.toLowerCase().includes(search))
                );
            });
        }

        // Filter by category
        if (category && category !== 'ALL') {
            combined = combined.filter(item => item.category_name === category);
        }

        // Filter by stock status
        if (status && status !== 'ALL') {
            if (status === 'IN_STOCK') {
                combined = combined.filter(item => item.current_stock > item.minimum_stock);
            } else if (status === 'LOW_STOCK') {
                combined = combined.filter(item => item.current_stock <= item.minimum_stock && item.current_stock > 0);
            } else if (status === 'OUT_OF_STOCK') {
                combined = combined.filter(item => item.current_stock <= 0);
            }
        }

        // Sort: Product Name ASC, Variant Name ASC
        combined.sort((a, b) => {
            const nameCmp = a.product_name.localeCompare(b.product_name);
            if (nameCmp !== 0) return nameCmp;
            return a.variant_name.localeCompare(b.variant_name);
        });

        if (!isPaginated) {
            return NextResponse.json(combined);
        }

        const total = combined.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const offset = (page - 1) * limit;
        const paginatedData = combined.slice(offset, offset + limit);

        return NextResponse.json({
            data: paginatedData,
            pagination: {
                total,
                page,
                limit,
                totalPages
            }
        });
    } catch (err) {
        console.error('API /api/inventory/stock error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
