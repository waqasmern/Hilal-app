import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET() {
    try {
        const [purchasesRes, suppliersRes, itemsRes] = await Promise.all([
            supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(200),
            supabase.from('suppliers').select('id, name, company_name'),
            supabase.from('purchase_items').select('purchase_id')
        ]);

        if (purchasesRes.error) {
            return NextResponse.json({ error: purchasesRes.error.message }, { status: 500 });
        }

        const supplierMap = Object.fromEntries((suppliersRes.data || []).map(s => [s.id, s]));
        const itemCountMap = {};
        (itemsRes.data || []).forEach(item => {
            itemCountMap[item.purchase_id] = (itemCountMap[item.purchase_id] || 0) + 1;
        });

        const list = (purchasesRes.data || []).map(p => {
            const s = supplierMap[p.supplier_id] || {};
            return {
                ...p,
                supplier_name: s.name || '',
                company_name: s.company_name || '',
                item_count: itemCountMap[p.id] || 0
            };
        });

        return NextResponse.json(list);
    } catch (err) {
        console.error('API GET /api/purchases error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const {
            supplier_id,
            supplier_invoice_no,
            items,
            gross_amount,
            discount,
            additional_charges,
            net_amount,
            amount_paid,
            payment_method,
            invoice_date
        } = body;

        if (!supplier_id || !Array.isArray(items) || items.length === 0 || !net_amount) {
            return NextResponse.json({ error: 'Supplier, items, and net amount required' }, { status: 400 });
        }

        const paid = Number(amount_paid) || 0;
        const net = Number(net_amount);
        const remainingBalance = net - paid;
        const supplierId = parseInt(supplier_id);

        // 1. Insert purchase
        const nextPurchaseId = await getNextId('purchases');
        const purchaseUUID = crypto.randomUUID();

        const { data: purchaseData, error: purchErr } = await supabase
            .from('purchases')
            .insert([{
                id: nextPurchaseId,
                uuid: purchaseUUID,
                supplier_invoice_no: supplier_invoice_no || '',
                supplier_id: supplierId,
                user_id: 1,
                device_id: 'DEVICE-CLOUD-01',
                gross_amount: Number(gross_amount) || net,
                discount: Number(discount) || 0,
                additional_charges: Number(additional_charges) || 0,
                net_amount: net,
                amount_paid: paid,
                remaining_balance: remainingBalance,
                status: 'completed',
                payment_method: payment_method || 'cash',
                invoice_date: invoice_date || new Date().toISOString().split('T')[0]
            }])
            .select()
            .single();

        if (purchErr) {
            console.error('Purchase insert error:', purchErr);
            return NextResponse.json({ error: purchErr.message }, { status: 500 });
        }

        const purchaseId = purchaseData.id;

        // 2. Insert items and update stock
        let nextItemId = await getNextId('purchase_items');
        let nextMovementId = await getNextId('stock_movements');

        for (const item of items) {
            const vId = parseInt(item.variant_id);
            const pkgTypeId = item.packaging_type_id ? parseInt(item.packaging_type_id) : 1;
            const factor = Number(item.conversion_factor) || 1;
            const qty = Number(item.quantity) || 0;
            const rate = Number(item.purchase_price) || 0;
            const total = Number(item.total) || (qty * rate);
            const equivalentQty = qty * factor;

            // Insert purchase_item
            await supabase
                .from('purchase_items')
                .insert([{
                    id: nextItemId++,
                    uuid: crypto.randomUUID(),
                    purchase_id: purchaseId,
                    variant_id: vId,
                    packaging_type_id: pkgTypeId,
                    quantity: qty,
                    purchase_price: rate,
                    total
                }]);

            // Update variant current_stock
            const { data: currentV } = await supabase
                .from('product_variants')
                .select('current_stock')
                .eq('id', vId)
                .single();

            const updatedStock = Number(currentV?.current_stock || 0) + equivalentQty;
            await supabase
                .from('product_variants')
                .update({ current_stock: updatedStock })
                .eq('id', vId);

            // Update inventory_stock
            const { data: stockEntry } = await supabase
                .from('inventory_stock')
                .select('id, quantity')
                .eq('variant_id', vId)
                .single();

            if (stockEntry) {
                await supabase
                    .from('inventory_stock')
                    .update({ quantity: Number(stockEntry.quantity || 0) + equivalentQty })
                    .eq('id', stockEntry.id);
            } else {
                const nextStockId = await getNextId('inventory_stock');
                await supabase
                    .from('inventory_stock')
                    .insert([{
                        id: nextStockId,
                        uuid: crypto.randomUUID(),
                        variant_id: vId,
                        quantity: updatedStock,
                        loose_quantity: 0
                    }]);
            }

            // Update product packaging purchase price if provided
            if (rate > 0 && pkgTypeId) {
                await supabase
                    .from('product_packagings')
                    .update({ purchase_price: rate })
                    .eq('variant_id', vId)
                    .eq('packaging_type_id', pkgTypeId);
            }

            // Record stock movement
            await supabase
                .from('stock_movements')
                .insert([{
                    id: nextMovementId++,
                    uuid: crypto.randomUUID(),
                    variant_id: vId,
                    packaging_type_id: pkgTypeId,
                    movement_type: 'PURCHASE',
                    quantity: qty,
                    equivalent_qty: equivalentQty,
                    reference_id: String(purchaseId),
                    reference_type: 'PURCHASE',
                    user_id: 1,
                    device_id: 'DEVICE-CLOUD-01'
                }]);
        }

        // 3. Update supplier ledger & balance
        let nextLedgerId = await getNextId('supplier_ledger');
        await supabase
            .from('supplier_ledger')
            .insert([{
                id: nextLedgerId++,
                uuid: crypto.randomUUID(),
                supplier_id: supplierId,
                purchase_id: purchaseId,
                amount: net,
                type: 'purchase',
                description: `Purchase Invoice ${supplier_invoice_no || purchaseId}`
            }]);

        if (paid > 0) {
            await supabase
                .from('supplier_ledger')
                .insert([{
                    id: nextLedgerId++,
                    uuid: crypto.randomUUID(),
                    supplier_id: supplierId,
                    purchase_id: purchaseId,
                    amount: paid,
                    type: 'payment',
                    description: `Payment for Purchase Invoice ${supplier_invoice_no || purchaseId}`
                }]);

            const nextPayId = await getNextId('payments');
            await supabase
                .from('payments')
                .insert([{
                    id: nextPayId,
                    uuid: crypto.randomUUID(),
                    party_type: 'supplier',
                    party_id: supplierId,
                    amount: paid,
                    payment_method: payment_method || 'cash',
                    reference_no: supplier_invoice_no || String(purchaseId),
                    user_id: 1,
                    notes: 'Supplier Purchase Payment'
                }]);
        }

        // Update supplier balance
        const { data: supp } = await supabase
            .from('suppliers')
            .select('balance')
            .eq('id', supplierId)
            .single();

        if (supp) {
            await supabase
                .from('suppliers')
                .update({ balance: Number(supp.balance || 0) + remainingBalance })
                .eq('id', supplierId);
        }

        return NextResponse.json({
            success: true,
            purchaseId,
            net_amount: net,
            remainingBalance
        });
    } catch (err) {
        console.error('API POST /api/purchases error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
