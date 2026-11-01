import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

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

export async function POST(request) {
    try {
        const body = await request.json();
        const {
            category_id,
            brand_id,
            name,
            description,
            variant_name,
            sku,
            barcode,
            base_unit_id,
            minimum_stock,
            reorder_level,
            is_loose_allowed,
            packagings,
            is_essential
        } = body;

        if (!category_id || !name || !base_unit_id) {
            return NextResponse.json({ error: 'Category, Product Name, and Base Unit are required' }, { status: 400 });
        }

        const finalVariantName = (variant_name && variant_name.trim()) || 'Standard';
        const finalSku = (sku && sku.trim()) || `SKU-${name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PROD'}-${Date.now().toString().slice(-5)}`;
        const finalBarcode = (barcode && barcode.trim()) || finalSku;

        // 1. Insert product
        const nextProductId = await getNextId('products');
        const productUUID = crypto.randomUUID();

        const { data: prodData, error: prodErr } = await supabase
            .from('products')
            .insert([{
                id: nextProductId,
                uuid: productUUID,
                category_id: parseInt(category_id),
                brand_id: brand_id ? parseInt(brand_id) : null,
                name: name.trim(),
                description: description || '',
                is_essential: is_essential ? 1 : 0,
                is_deleted: 0
            }])
            .select()
            .single();

        if (prodErr) {
            console.error('Product insert error:', prodErr);
            return NextResponse.json({ error: prodErr.message }, { status: 500 });
        }

        const productId = prodData.id;

        // 2. Insert variant
        const nextVariantId = await getNextId('product_variants');
        const variantUUID = crypto.randomUUID();

        const { data: varData, error: varErr } = await supabase
            .from('product_variants')
            .insert([{
                id: nextVariantId,
                uuid: variantUUID,
                product_id: productId,
                sku: finalSku,
                barcode: finalBarcode,
                variant_name: finalVariantName,
                base_unit_id: parseInt(base_unit_id),
                minimum_stock: parseFloat(minimum_stock) || 10,
                reorder_level: parseFloat(reorder_level) || 15,
                is_loose_allowed: is_loose_allowed ? 1 : 0,
                current_stock: 0,
                is_deleted: 0
            }])
            .select()
            .single();

        if (varErr) {
            console.error('Variant insert error:', varErr);
            return NextResponse.json({ error: varErr.message }, { status: 500 });
        }

        const variantId = varData.id;

        // 3. Insert inventory stock record
        const nextStockId = await getNextId('inventory_stock');
        await supabase
            .from('inventory_stock')
            .insert([{
                id: nextStockId,
                uuid: crypto.randomUUID(),
                variant_id: variantId,
                quantity: 0,
                loose_quantity: 0
            }]);

        // 4. Insert packagings
        let nextPackId = await getNextId('product_packagings');
        const packsToInsert = [];

        if (Array.isArray(packagings) && packagings.length > 0) {
            packagings.forEach(p => {
                const packBarcode = (p.barcode && p.barcode.trim()) || finalBarcode;
                packsToInsert.push({
                    id: nextPackId++,
                    uuid: crypto.randomUUID(),
                    variant_id: variantId,
                    packaging_type_id: parseInt(p.packaging_type_id),
                    conversion_factor: parseFloat(p.conversion_factor) || 1,
                    is_default: p.is_default ? 1 : 0,
                    purchase_price: parseFloat(p.purchase_price) || 0,
                    selling_price: parseFloat(p.selling_price) || 0,
                    barcode: packBarcode
                });
            });
        } else {
            // Default 1 piece packaging rule
            packsToInsert.push({
                id: nextPackId++,
                uuid: crypto.randomUUID(),
                variant_id: variantId,
                packaging_type_id: 1,
                conversion_factor: 1,
                is_default: 1,
                purchase_price: 0,
                selling_price: 0,
                barcode: finalBarcode
            });
        }

        if (packsToInsert.length > 0) {
            const { error: packErr } = await supabase.from('product_packagings').insert(packsToInsert);
            if (packErr) {
                console.error('Packaging insert error:', packErr);
            }
        }

        return NextResponse.json({
            success: true,
            productId,
            variantId,
            sku: finalSku,
            barcode: finalBarcode
        });
    } catch (err) {
        console.error('Product POST error:', err);
        return NextResponse.json({ error: err.message || 'Failed to create product' }, { status: 500 });
    }
}
