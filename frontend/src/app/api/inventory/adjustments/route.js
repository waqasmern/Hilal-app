import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { variant_id, packaging_type_id, adjustment_type, quantity, notes } = body;

        const variantId = parseInt(variant_id);
        const qty = parseFloat(quantity);

        if (!variantId || isNaN(qty) || qty <= 0 || !adjustment_type) {
            return NextResponse.json({ error: 'Variant, positive quantity, and adjustment type required' }, { status: 400 });
        }

        // Fetch packaging conversion factor
        let factor = 1;
        if (packaging_type_id) {
            const { data: pack } = await supabase
                .from('product_packagings')
                .select('conversion_factor')
                .eq('variant_id', variantId)
                .eq('packaging_type_id', parseInt(packaging_type_id))
                .single();
            if (pack && pack.conversion_factor) {
                factor = Number(pack.conversion_factor) || 1;
            }
        }

        const equivalentQty = qty * factor;
        const delta = adjustment_type === 'ADD' ? equivalentQty : -equivalentQty;

        // Fetch current variant stock
        const { data: variant, error: vErr } = await supabase
            .from('product_variants')
            .select('current_stock')
            .eq('id', variantId)
            .single();

        if (vErr || !variant) {
            return NextResponse.json({ error: 'Product variant not found' }, { status: 404 });
        }

        const newStock = Number(variant.current_stock || 0) + delta;

        // 1. Update product_variants
        await supabase
            .from('product_variants')
            .update({ current_stock: newStock })
            .eq('id', variantId);

        // 2. Update or insert inventory_stock
        const { data: stockEntry } = await supabase
            .from('inventory_stock')
            .select('id, quantity')
            .eq('variant_id', variantId)
            .single();

        if (stockEntry) {
            await supabase
                .from('inventory_stock')
                .update({ quantity: Number(stockEntry.quantity || 0) + delta })
                .eq('id', stockEntry.id);
        } else {
            const nextStockId = await getNextId('inventory_stock');
            await supabase
                .from('inventory_stock')
                .insert([{
                    id: nextStockId,
                    uuid: crypto.randomUUID(),
                    variant_id: variantId,
                    quantity: newStock,
                    loose_quantity: 0
                }]);
        }

        // 3. Record stock_movements
        const nextMovementId = await getNextId('stock_movements');
        const movementUUID = crypto.randomUUID();

        await supabase
            .from('stock_movements')
            .insert([{
                id: nextMovementId,
                uuid: movementUUID,
                variant_id: variantId,
                packaging_type_id: packaging_type_id ? parseInt(packaging_type_id) : null,
                movement_type: adjustment_type === 'ADD' ? 'ADJUSTMENT' : 'DAMAGE',
                quantity: qty,
                equivalent_qty: equivalentQty,
                notes: notes || 'Manual adjustment',
                user_id: 1,
                device_id: 'DEVICE-CLOUD-01'
            }]);

        return NextResponse.json({
            success: true,
            movementId: nextMovementId,
            newStock
        });
    } catch (err) {
        console.error('API /api/inventory/adjustments error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
