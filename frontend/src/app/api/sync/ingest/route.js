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
            .select('uuid, operation_type, entity_id')
            .eq('uuid', uuid)
            .maybeSingle();

        if (existingEvent) {
            // Self-healing: verify entity actually exists in Supabase table before claiming idempotency
            let actuallyExists = true;
            if (operation_type === 'SALE') {
                const { data: s } = await supabase.from('sales').select('id').eq('uuid', uuid).maybeSingle();
                if (!s) actuallyExists = false;
            } else if (operation_type === 'PURCHASE') {
                const { data: p } = await supabase.from('purchases').select('id').eq('uuid', uuid).maybeSingle();
                if (!p) actuallyExists = false;
            } else if (operation_type === 'CUSTOMER' || operation_type === 'CUSTOMER_UPDATE') {
                const { data: c } = await supabase.from('customers').select('id').eq('uuid', uuid).maybeSingle();
                if (!c) actuallyExists = false;
            }

            if (actuallyExists) {
                return NextResponse.json({
                    success: true,
                    idempotent: true,
                    processedUuid: uuid,
                    message: 'Transaction already ingested'
                });
            }

            // Ghost event cleanup: previous ingest failed partway, allow reprocessing
            await supabase.from('ingested_sync_events').delete().eq('uuid', uuid);
        }

        const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});

        // 2. Process Business Operations
        if (operation_type === 'SALE') {
            const invoiceNo = parsedPayload.invoice_no || `INV-${Date.now().toString().slice(-6)}`;
            const custId = parsedPayload.customer_id ? parseInt(parsedPayload.customer_id) : null;

            // Pre-provision customer if missing to prevent FK constraint failure
            if (custId) {
                const { data: custCheck } = await supabase.from('customers').select('id').eq('id', custId).maybeSingle();
                if (!custCheck) {
                    const custName = parsedPayload.customer_name || parsedPayload.walkin_name || `Customer #${custId}`;
                    await supabase.from('customers').insert([{
                        id: custId,
                        uuid: crypto.randomUUID(),
                        name: custName,
                        business_name: parsedPayload.business_name || '',
                        phone: parsedPayload.customer_phone || parsedPayload.phone || '',
                        mobile: parsedPayload.customer_mobile || parsedPayload.mobile || '',
                        address: parsedPayload.customer_address || parsedPayload.address || '',
                        balance: 0,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }]);
                }
            }

            // Check if sale already exists by invoice_no or uuid
            const { data: existingSale } = await supabase
                .from('sales')
                .select('id')
                .or(`uuid.eq.${uuid},invoice_no.eq.${invoiceNo}`)
                .maybeSingle();

            if (!existingSale) {
                const targetSaleId = parsedPayload.id ? parseInt(parsedPayload.id) : await getNextId('sales');
                const { data: idTaken } = await supabase.from('sales').select('id').eq('id', targetSaleId).maybeSingle();
                const nextSaleId = idTaken ? await getNextId('sales') : targetSaleId;

                const netAmount = Number(parsedPayload.net_amount) || 0;
                const paidAmount = Number(parsedPayload.amount_paid) || 0;
                const remaining = Number(parsedPayload.remaining_balance) !== undefined ? Number(parsedPayload.remaining_balance) : (netAmount - paidAmount);

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

                if (sErr) {
                    console.error('Supabase sale insert error:', sErr);
                    throw new Error(`Failed to insert sale into cloud: ${sErr.message}`);
                }

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
        } else if (operation_type === 'SALE_RETURN') {
            const saleId = parsedPayload.sale_id ? parseInt(parsedPayload.sale_id) : null;
            const customerId = parsedPayload.customer_id ? parseInt(parsedPayload.customer_id) : null;
            const totalRefund = Number(parsedPayload.total_refund) || 0;
            const returnType = parsedPayload.return_type || 'saleable';
            const refundMethod = parsedPayload.refund_method || 'credit';

            // Check if return already exists by uuid
            const { data: existingReturn } = await supabase
                .from('sale_returns')
                .select('id')
                .eq('uuid', uuid)
                .single();

            if (!existingReturn) {
                const nextReturnId = await getNextId('sale_returns');
                const cnNumber = `CN-${String(nextReturnId).padStart(5, '0')}`;

                const { data: insertedReturn, error: rErr } = await supabase
                    .from('sale_returns')
                    .insert([{
                        id: nextReturnId,
                        uuid: uuid || crypto.randomUUID(),
                        sale_id: saleId,
                        customer_id: customerId,
                        user_id: 1,
                        total_refund: totalRefund,
                        return_type: returnType,
                        refund_method: refundMethod,
                        status: 'completed',
                        remarks: parsedPayload.remarks || `Customer return ${cnNumber}`,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }])
                    .select()
                    .single();

                if (!rErr && insertedReturn && Array.isArray(parsedPayload.items)) {
                    let nextReturnItemId = await getNextId('sale_return_items');
                    let nextMvId = await getNextId('stock_movements');

                    for (const item of parsedPayload.items) {
                        const vId = parseInt(item.variant_id);
                        const pkgId = parseInt(item.packaging_type_id || 1);
                        const qty = Number(item.quantity) || 0;
                        const factor = Number(item.conversion_factor) || 1;
                        const equivalentQty = qty * factor;
                        const price = Number(item.refund_price) || 0;

                        await supabase.from('sale_return_items').insert([{
                            id: nextReturnItemId++,
                            uuid: crypto.randomUUID(),
                            sale_return_id: insertedReturn.id,
                            variant_id: vId,
                            packaging_type_id: pkgId,
                            quantity: qty,
                            refund_price: price
                        }]);

                        // Restock if saleable
                        if (returnType !== 'damaged') {
                            const { data: curV } = await supabase.from('product_variants').select('current_stock').eq('id', vId).single();
                            if (curV) {
                                await supabase.from('product_variants').update({
                                    current_stock: Number(curV.current_stock || 0) + equivalentQty
                                }).eq('id', vId);
                            }
                        }

                        // Stock movement audit
                        await supabase.from('stock_movements').insert([{
                            id: nextMvId++,
                            uuid: crypto.randomUUID(),
                            variant_id: vId,
                            packaging_type_id: pkgId,
                            movement_type: returnType === 'damaged' ? 'DAMAGE' : 'SALE_RETURN',
                            quantity: qty,
                            equivalent_qty: equivalentQty,
                            reference_id: String(insertedReturn.id),
                            reference_type: 'SALE_RETURN',
                            notes: returnType === 'damaged' ? 'Damaged customer return (Quarantined Scrap)' : 'Restocked sale return',
                            user_id: 1,
                            device_id: effectiveDeviceId,
                            created_at: toUtcIso(parsedPayload.created_at)
                        }]);
                    }

                    // Ledger and balance updates
                    if (refundMethod === 'cash') {
                        const nextPayId = await getNextId('payments');
                        await supabase.from('payments').insert([{
                            id: nextPayId,
                            uuid: crypto.randomUUID(),
                            party_type: 'customer',
                            party_id: customerId,
                            amount: -totalRefund,
                            payment_method: 'cash',
                            reference_no: cnNumber,
                            user_id: 1,
                            device_id: effectiveDeviceId,
                            notes: `Cash Refund for Credit Note #${cnNumber}`,
                            payment_date: (parsedPayload.created_at ? toUtcIso(parsedPayload.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
                            created_at: toUtcIso(parsedPayload.created_at)
                        }]);

                        if (customerId) {
                            const nextLedgerId = await getNextId('customer_ledger');
                            await supabase.from('customer_ledger').insert([{
                                id: nextLedgerId,
                                uuid: crypto.randomUUID(),
                                customer_id: customerId,
                                sale_id: saleId,
                                amount: totalRefund,
                                type: 'return',
                                description: `Sales Return #${cnNumber} (${returnType}) - Cash Refund Paid Out`,
                                payment_method: 'cash',
                                created_at: toUtcIso(parsedPayload.created_at)
                            }]);
                        }
                    } else {
                        // Store credit (Khata deduction)
                        if (customerId) {
                            const nextLedgerId = await getNextId('customer_ledger');
                            await supabase.from('customer_ledger').insert([{
                                id: nextLedgerId,
                                uuid: crypto.randomUUID(),
                                customer_id: customerId,
                                sale_id: saleId,
                                amount: totalRefund,
                                type: 'return',
                                description: `Sales Return #${cnNumber} (${returnType}) - Credited to Khata`,
                                payment_method: 'credit_note',
                                created_at: toUtcIso(parsedPayload.created_at)
                            }]);

                            const { data: cust } = await supabase.from('customers').select('balance').eq('id', customerId).single();
                            if (cust) {
                                await supabase.from('customers').update({
                                    balance: Number(cust.balance || 0) - totalRefund
                                }).eq('id', customerId);
                            }
                        }
                    }
                }
            }
        } else if (operation_type === 'CUSTOMER' || operation_type === 'CUSTOMER_UPDATE') {
            const custId = parsedPayload.id ? parseInt(parsedPayload.id) : null;
            const custUuid = parsedPayload.uuid || uuid;
            const name = (parsedPayload.name || '').trim();

            if (name) {
                const { data: existingCust } = await supabase
                    .from('customers')
                    .select('id')
                    .or(`uuid.eq.${custUuid}${custId ? `,id.eq.${custId}` : ''}`)
                    .limit(1)
                    .maybeSingle();

                const custData = {
                    name,
                    business_name: parsedPayload.business_name || '',
                    phone: parsedPayload.phone || parsedPayload.mobile || '',
                    mobile: parsedPayload.mobile || parsedPayload.phone || '',
                    address: parsedPayload.address || '',
                    cnic_ntn: parsedPayload.cnic_ntn || '',
                    credit_limit: Number(parsedPayload.credit_limit) || 0,
                    opening_balance: Number(parsedPayload.opening_balance) || 0,
                    balance: Number(parsedPayload.balance) || 0
                };

                if (existingCust) {
                    const { error: updErr } = await supabase.from('customers').update(custData).eq('id', existingCust.id);
                    if (updErr) throw new Error(`Customer update failed: ${updErr.message}`);
                } else {
                    const targetId = custId || await getNextId('customers');
                    const { data: idTaken } = await supabase.from('customers').select('id').eq('id', targetId).maybeSingle();
                    const finalId = idTaken ? await getNextId('customers') : targetId;

                    const { error: insErr } = await supabase.from('customers').insert([{
                        id: finalId,
                        uuid: custUuid,
                        ...custData,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }]);
                    if (insErr) throw new Error(`Customer insert failed: ${insErr.message}`);
                }
            }
        } else if (operation_type === 'SUPPLIER' || operation_type === 'SUPPLIER_UPDATE') {
            const suppId = parsedPayload.id ? parseInt(parsedPayload.id) : null;
            const suppUuid = parsedPayload.uuid || uuid;
            const name = (parsedPayload.name || '').trim();

            if (name) {
                const { data: existingSupp } = await supabase
                    .from('suppliers')
                    .select('id')
                    .or(`uuid.eq.${suppUuid}${suppId ? `,id.eq.${suppId}` : ''}`)
                    .limit(1)
                    .maybeSingle();

                const suppData = {
                    name,
                    company_name: parsedPayload.company_name || '',
                    phone: parsedPayload.phone || '',
                    address: parsedPayload.address || '',
                    opening_balance: Number(parsedPayload.opening_balance) || 0,
                    balance: Number(parsedPayload.balance) || 0
                };

                if (existingSupp) {
                    const { error: updErr } = await supabase.from('suppliers').update(suppData).eq('id', existingSupp.id);
                    if (updErr) throw new Error(`Supplier update failed: ${updErr.message}`);
                } else {
                    const targetId = suppId || await getNextId('suppliers');
                    const { data: idTaken } = await supabase.from('suppliers').select('id').eq('id', targetId).maybeSingle();
                    const finalId = idTaken ? await getNextId('suppliers') : targetId;

                    const { error: insErr } = await supabase.from('suppliers').insert([{
                        id: finalId,
                        uuid: suppUuid,
                        ...suppData,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }]);
                    if (insErr) throw new Error(`Supplier insert failed: ${insErr.message}`);
                }
            }
        } else if (operation_type === 'PURCHASE') {
            const suppInvoiceNo = parsedPayload.supplier_invoice_no || `PINV-${Date.now().toString().slice(-6)}`;
            const suppId = parsedPayload.supplier_id ? parseInt(parsedPayload.supplier_id) : null;

            if (suppId) {
                const { data: suppCheck } = await supabase.from('suppliers').select('id').eq('id', suppId).maybeSingle();
                if (!suppCheck) {
                    await supabase.from('suppliers').insert([{
                        id: suppId,
                        uuid: crypto.randomUUID(),
                        name: parsedPayload.supplier_name || `Supplier #${suppId}`,
                        company_name: parsedPayload.company_name || '',
                        balance: 0,
                        created_at: toUtcIso(parsedPayload.created_at)
                    }]);
                }
            }

            const { data: existingPurch } = await supabase
                .from('purchases')
                .select('id')
                .or(`uuid.eq.${uuid},supplier_invoice_no.eq.${suppInvoiceNo}`)
                .maybeSingle();

            if (!existingPurch) {
                const targetPurchId = parsedPayload.id ? parseInt(parsedPayload.id) : await getNextId('purchases');
                const { data: idTaken } = await supabase.from('purchases').select('id').eq('id', targetPurchId).maybeSingle();
                const purchIdToUse = idTaken ? await getNextId('purchases') : targetPurchId;

                const netAmount = Number(parsedPayload.net_amount) || 0;
                const paidAmount = Number(parsedPayload.amount_paid) || 0;

                const { data: insertedPurch, error: pErr } = await supabase
                    .from('purchases')
                    .insert([{
                        id: purchIdToUse,
                        uuid: uuid || crypto.randomUUID(),
                        supplier_id: suppId,
                        supplier_invoice_no: suppInvoiceNo,
                        invoice_date: parsedPayload.invoice_date || (parsedPayload.created_at ? toUtcIso(parsedPayload.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
                        gross_amount: Number(parsedPayload.gross_amount) || netAmount,
                        discount: Number(parsedPayload.discount) || 0,
                        additional_charges: Number(parsedPayload.additional_charges) || 0,
                        net_amount: netAmount,
                        amount_paid: paidAmount,
                        payment_method: parsedPayload.payment_method || 'cash',
                        notes: parsedPayload.notes || '',
                        status: 'completed',
                        created_at: toUtcIso(parsedPayload.created_at)
                    }])
                    .select()
                    .single();

                if (pErr) throw new Error(`Purchase insert failed: ${pErr.message}`);

                if (insertedPurch && Array.isArray(parsedPayload.items)) {
                    let nextItemId = await getNextId('purchase_items');
                    for (const item of parsedPayload.items) {
                        const vId = parseInt(item.variant_id);
                        const qty = Number(item.quantity) || 1;
                        const factor = Number(item.conversion_factor) || 1;
                        const price = Number(item.purchase_price || item.price) || 0;
                        const total = Number(item.total) || (qty * price);
                        const equivalentQty = qty * factor;

                        await supabase.from('purchase_items').insert([{
                            id: nextItemId++,
                            uuid: crypto.randomUUID(),
                            purchase_id: insertedPurch.id,
                            variant_id: vId,
                            packaging_type_id: item.packaging_type_id ? parseInt(item.packaging_type_id) : 1,
                            quantity: qty,
                            purchase_price: price,
                            total
                        }]);

                        const { data: curV } = await supabase.from('product_variants').select('current_stock').eq('id', vId).single();
                        if (curV) {
                            await supabase.from('product_variants').update({ current_stock: Number(curV.current_stock || 0) + equivalentQty }).eq('id', vId);
                        }
                    }
                }
            }
        } else if (operation_type === 'PAYMENT') {
            const partyType = parsedPayload.party_type || 'customer';
            const partyId = parsedPayload.party_id || parsedPayload.customer_id || parsedPayload.supplier_id;
            const amount = Number(parsedPayload.amount) || 0;

            const nextPayId = parsedPayload.id ? parseInt(parsedPayload.id) : await getNextId('payments');
            await supabase.from('payments').insert([{
                id: nextPayId,
                uuid: uuid || crypto.randomUUID(),
                party_type: partyType,
                party_id: partyId ? parseInt(partyId) : null,
                amount,
                payment_method: parsedPayload.payment_method || 'cash',
                reference_no: parsedPayload.reference_no || '',
                user_id: 1,
                device_id: effectiveDeviceId,
                notes: parsedPayload.notes || '',
                payment_date: parsedPayload.payment_date || (parsedPayload.created_at ? toUtcIso(parsedPayload.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
                created_at: toUtcIso(parsedPayload.created_at)
            }]);

            if (partyType === 'customer' && partyId) {
                let nextLedgerId = await getNextId('customer_ledger');
                await supabase.from('customer_ledger').insert([{
                    id: nextLedgerId,
                    uuid: crypto.randomUUID(),
                    customer_id: parseInt(partyId),
                    amount,
                    type: 'payment',
                    description: parsedPayload.notes || `Recovery Wasooli Payment`,
                    payment_method: parsedPayload.payment_method || 'cash',
                    created_at: toUtcIso(parsedPayload.created_at)
                }]);

                const { data: cust } = await supabase.from('customers').select('balance').eq('id', parseInt(partyId)).single();
                if (cust) {
                    await supabase.from('customers').update({ balance: Number(cust.balance || 0) - amount }).eq('id', parseInt(partyId));
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
