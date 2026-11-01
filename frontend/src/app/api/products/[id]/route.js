import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PUT(request, { params }) {
    try {
        const { id } = await params;
        const variantId = parseInt(id);
        const body = await request.json();
        const {
            name,
            category_id,
            brand_id,
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

        // Find the variant to get product_id
        const { data: variant, error: vErr } = await supabase
            .from('product_variants')
            .select('product_id')
            .eq('id', variantId)
            .single();

        if (vErr || !variant) {
            return NextResponse.json({ error: 'Product variant not found' }, { status: 404 });
        }

        const productId = variant.product_id;

        // 1. Update product
        const prodUpdate = {};
        if (name && name.trim()) prodUpdate.name = name.trim();
        if (category_id) prodUpdate.category_id = parseInt(category_id);
        if (brand_id !== undefined) prodUpdate.brand_id = brand_id ? parseInt(brand_id) : null;
        if (description !== undefined) prodUpdate.description = description;
        if (is_essential !== undefined) prodUpdate.is_essential = is_essential ? 1 : 0;

        if (Object.keys(prodUpdate).length > 0) {
            await supabase.from('products').update(prodUpdate).eq('id', productId);
        }

        // 2. Update variant
        const varUpdate = {};
        if (variant_name && variant_name.trim()) varUpdate.variant_name = variant_name.trim();
        if (sku && sku.trim()) varUpdate.sku = sku.trim();
        if (barcode && barcode.trim()) varUpdate.barcode = barcode.trim();
        if (base_unit_id) varUpdate.base_unit_id = parseInt(base_unit_id);
        if (minimum_stock !== undefined) varUpdate.minimum_stock = parseFloat(minimum_stock) || 10;
        if (reorder_level !== undefined) varUpdate.reorder_level = parseFloat(reorder_level) || 15;
        if (is_loose_allowed !== undefined) varUpdate.is_loose_allowed = is_loose_allowed ? 1 : 0;

        if (Object.keys(varUpdate).length > 0) {
            await supabase.from('product_variants').update(varUpdate).eq('id', variantId);
        }

        // 3. Update packagings if provided
        if (Array.isArray(packagings) && packagings.length > 0) {
            // Delete old packagings for this variant
            await supabase.from('product_packagings').delete().eq('variant_id', variantId);

            // Fetch next packaging ID
            const { data: maxPack } = await supabase.from('product_packagings').select('id').order('id', { ascending: false }).limit(1);
            let nextPackId = (maxPack?.[0]?.id || 0) + 1;

            const packsToInsert = packagings.map(p => ({
                id: nextPackId++,
                uuid: crypto.randomUUID(),
                variant_id: variantId,
                packaging_type_id: parseInt(p.packaging_type_id),
                conversion_factor: parseFloat(p.conversion_factor) || 1,
                is_default: p.is_default ? 1 : 0,
                purchase_price: parseFloat(p.purchase_price) || 0,
                selling_price: parseFloat(p.selling_price) || 0,
                barcode: p.barcode || barcode || ''
            }));

            await supabase.from('product_packagings').insert(packsToInsert);
        }

        return NextResponse.json({ success: true, productId, variantId });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const variantId = parseInt(id);

        const { data: variant } = await supabase
            .from('product_variants')
            .select('product_id')
            .eq('id', variantId)
            .single();

        if (variant) {
            await supabase.from('product_variants').update({ is_deleted: 1 }).eq('id', variantId);
            await supabase.from('products').update({ is_deleted: 1 }).eq('id', variant.product_id);
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
