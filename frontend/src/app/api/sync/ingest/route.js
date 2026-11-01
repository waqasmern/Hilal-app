import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function toUtcIso(dateStr) {
    if (!dateStr) return new Date().toISOString();
    let s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
        return new Date(s.replace(' ', 'T') + '+05:00').toISOString();
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request) {
    try {
        const deviceHeader = request.headers.get('x-device-id');
        const body = await request.json();
        const { uuid, operation_type, entity_name, entity_id, payload, device_id } = body;
        const effectiveDeviceId = deviceHeader || device_id || 'DEVICE-CASHIER-01';

        if (!uuid || !operation_type) {
            return NextResponse.json({ error: 'UUID and operation_type required' }, { status: 400 });
        }

        // 1. Cloud-side Idempotency: Check if UUID was already ingested
        const { data: existingEvent } = await supabase
            .from('ingested_sync_events')
            .select('uuid')
            .eq('uuid', uuid)
            .single();

        if (existingEvent) {
            return NextResponse.json({
                success: true,
                idempotent: true,
                processedUuid: uuid,
                message: 'Transaction already ingested'
            });
        }

        const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});

        // 2. Process Business Operations
        if (operation_type === 'SALE') {
            const invoiceNo = parsedPayload.invoice_no || `INV-${Date.now().toString().slice(-6)}`;

            // Check if sale already exists by invoice_no or uuid
            const { data: existingSale } = await supabase
                .from('sales')
                .select('id')
                .or(`uuid.eq.${uuid},invoice_no.eq.${invoiceNo}`)
                .single();

            if (!existingSale) {
                const nextSaleId = await getNextId('sales');
                const netAmount = Number(parsedPayload.net_amount) || 0;
                const paidAmount = Number(parsedPayload.amount_paid) || 0;
                const remaining = Number(parsedPayload.remaining_balance) || (netAmount - paidAmount);
                const custId = parsedPayload.customer_id ? parseInt(parsedPayload.customer_id) : null;

                const { data: insertedSale, error: sErr } = await supabase
                    .from('sales')
                    .insert([{
                        id: nextSaleId,
                        uuid: uuid || crypto.randomUUID(),
                        invoice_no: invoiceNo,
                        customer_id: custId,
                        user_id: 1,
                        device_id: effectiveDeviceId,
                        gross_amount: Number(parsedPayload.gross_amount) || netAmount,
                        discount: Number(parsedPayload.discount) || 0,
                        special_discount: Number(parsedPayload.special_discount) || 0,
                        additional_charges: Number(parsedPayload.additional_charges) || 0,
                        net_amount: netAmount,
                        amount_paid: paidAmount,
                        remaining_balance: remaining,
                        status: parsedPayload.status || 'completed',
                        payment_status: remaining > 0 ? (paidAmount > 0 ? 'partial' : 'unpaid') : 'paid',
                        payment_method: parsedPayload.payment_method || 'cash',
                        remarks: parsedPayload.remarks || 'Synced from Counter Desktop',
                        is_synced: 1,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }])
                    .select()
                    .single();

                if (!sErr && insertedSale && Array.isArray(parsedPayload.items)) {
                    let nextItemId = await getNextId('sale_items');
                    let nextMovementId = await getNextId('stock_movements');

                    for (const item of parsedPayload.items) {
                        const vId = parseInt(item.variant_id);
                        const qty = Number(item.quantity) || 1;
                        const factor = Number(item.conversion_factor) || 1;
                        const price = Number(item.price) || 0;
                        const total = Number(item.total) || (qty * price);
                        const equivalentQty = qty * factor;

                        await supabase.from('sale_items').insert([{
                            id: nextItemId++,
                            uuid: item.uuid || crypto.randomUUID(),
                            sale_id: insertedSale.id,
                            variant_id: vId,
                            packaging_type_id: item.packaging_type_id ? parseInt(item.packaging_type_id) : 1,
                            unit_name: item.unit_name || item.packaging_name || 'Units',
                            quantity: qty,
                            price,
                            discount: Number(item.discount) || 0,
                            total
                        }]);

                        // Record immutable stock movement
                        await supabase.from('stock_movements').insert([{
                            id: nextMovementId++,
                            uuid: crypto.randomUUID(),
                            variant_id: vId,
                            packaging_type_id: item.packaging_type_id ? parseInt(item.packaging_type_id) : 1,
                            movement_type: 'SALE',
                            quantity: qty,
                            equivalent_qty: equivalentQty,
                            reference_id: invoiceNo,
                            reference_type: 'SALE',
                            device_id: effectiveDeviceId,
                            created_at: toUtcIso(parsedPayload.created_at)
                        }]);

                        // Deduct stock in Supabase
                        const { data: curV } = await supabase.from('product_variants').select('current_stock').eq('id', vId).single();
                        if (curV) {
                            const newStock = Number(curV.current_stock || 0) - equivalentQty;
                            await supabase.from('product_variants').update({ current_stock: newStock }).eq('id', vId);
                        }
                    }

                    // Customer Ledger Entries & Balance update
                    if (custId) {
                        let nextLedgerId = await getNextId('customer_ledger');
                        await supabase.from('customer_ledger').insert([{
                            id: nextLedgerId++,
                            uuid: crypto.randomUUID(),
                            customer_id: custId,
                            sale_id: insertedSale.id,
                            amount: netAmount,
                            type: 'charge',
                            description: `Wholesale Invoice ${invoiceNo}`,
                            payment_method: parsedPayload.payment_method || 'cash',
                            created_at: toUtcIso(parsedPayload.created_at)
                        }]);

                        if (paidAmount > 0) {
                            await supabase.from('customer_ledger').insert([{
                                id: nextLedgerId++,
                                uuid: crypto.randomUUID(),
                                customer_id: custId,
                                sale_id: insertedSale.id,
                                amount: paidAmount,
                                type: 'payment',
                                description: `Payment for Invoice ${invoiceNo}`,
                                payment_method: parsedPayload.payment_method || 'cash',
                                created_at: toUtcIso(parsedPayload.created_at)
                            }]);
                        }

                        if (remaining > 0) {
                            const { data: cust } = await supabase.from('customers').select('balance').eq('id', custId).single();
                            if (cust) {
                                await supabase.from('customers').update({ balance: Number(cust.balance || 0) + remaining }).eq('id', custId);
                            }
                        }
                    }
                }
            }
        } else if (operation_type === 'PRODUCT') {
            const productName = parsedPayload.name?.trim();
            if (productName) {
                const { data: existingProd } = await supabase
                    .from('products')
                    .select('id')
                    .eq('name', productName)
                    .single();

                let prodId = existingProd?.id;
                if (!prodId) {
                    prodId = await getNextId('products');
                    await supabase.from('products').insert([{
                        id: prodId,
                        uuid: uuid || crypto.randomUUID(),
                        category_id: parsedPayload.category_id ? parseInt(parsedPayload.category_id) : 1,
                        brand_id: parsedPayload.brand_id ? parseInt(parsedPayload.brand_id) : null,
                        name: productName,
                        description: parsedPayload.description || '',
                        is_essential: parsedPayload.is_essential ? 1 : 0
                    }]);
                }

                const initialStock = Number(parsedPayload.initial_stock) || 0;
                let nextVarId = await getNextId('product_variants');
                const { data: insertedVar } = await supabase.from('product_variants').insert([{
                    id: nextVarId,
                    uuid: crypto.randomUUID(),
                    product_id: prodId,
                    sku: parsedPayload.sku || `SKU-${Date.now().toString().slice(-4)}`,
                    barcode: parsedPayload.barcode || '',
                    variant_name: parsedPayload.variant_name || 'Standard',
                    base_unit_id: parsedPayload.base_unit_id ? parseInt(parsedPayload.base_unit_id) : 1,
                    minimum_stock: Number(parsedPayload.minimum_stock) || 10,
                    reorder_level: Number(parsedPayload.reorder_level) || 15,
                    is_loose_allowed: parsedPayload.is_loose_allowed ? 1 : 0,
                    current_stock: initialStock
                }]).select().single();

                if (insertedVar && Array.isArray(parsedPayload.packagings)) {
                    let nextPkgId = await getNextId('product_packagings');
                    for (const p of parsedPayload.packagings) {
                        await supabase.from('product_packagings').insert([{
                            id: nextPkgId++,
                            uuid: crypto.randomUUID(),
                            variant_id: insertedVar.id,
                            packaging_type_id: p.packaging_type_id ? parseInt(p.packaging_type_id) : 1,
                            conversion_factor: Number(p.conversion_factor) || 1,
                            is_default: p.is_default ? 1 : 0,
                            purchase_price: Number(p.purchase_price) || 0,
                            selling_price: Number(p.selling_price) || 0,
                            barcode: p.barcode || ''
                        }]);
                    }
                }
            }
        } else if (operation_type === 'ADJUSTMENT') {
            const variantId = parseInt(parsedPayload.variant_id);
            const qty = Number(parsedPayload.quantity) || 0;
            const delta = parsedPayload.adjustment_type === 'increase' ? Math.abs(qty) : -Math.abs(qty);
            if (variantId && delta !== 0) {
                let nextMvId = await getNextId('stock_movements');
                await supabase.from('stock_movements').insert([{
                    id: nextMvId,
                    uuid: uuid || crypto.randomUUID(),
                    variant_id: variantId,
                    movement_type: 'ADJUSTMENT',
                    quantity: Math.abs(qty),
                    equivalent_qty: Math.abs(qty),
                    notes: parsedPayload.reason || 'Inventory Adjustment',
                    device_id: effectiveDeviceId,
                    created_at: toUtcIso(parsedPayload.created_at)
                }]);

                const { data: curV } = await supabase.from('product_variants').select('current_stock').eq('id', variantId).single();
                if (curV) {
                    await supabase.from('product_variants').update({ current_stock: Number(curV.current_stock || 0) + delta }).eq('id', variantId);
                }
            }
        }

        // 3. Mark ingested event to ensure exact-once delivery
        const nextEventId = await getNextId('ingested_sync_events');
        await supabase
            .from('ingested_sync_events')
            .insert([{
                id: nextEventId,
                uuid,
                operation_type,
                entity_name: entity_name || 'sales',
                entity_id: String(entity_id || ''),
                device_id: effectiveDeviceId,
                payload: typeof parsedPayload === 'object' ? parsedPayload : { raw: parsedPayload }
            }]);

        return NextResponse.json({
            success: true,
            idempotent: false,
            processedUuid: uuid,
            serverTimestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('API /api/sync/ingest error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
