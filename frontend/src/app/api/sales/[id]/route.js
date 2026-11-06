import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hilal_wholesaler_secret_key_2026';

function getUserFromReq(request) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return { id: 1, username: 'admin', role: 'admin' };
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return { id: 1, username: 'admin', role: 'admin' };
    }
}

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET(request, { params }) {
    try {
        const { id } = await params;

        let saleQuery = supabase
            .from('sales')
            .select(`
                *,
                customers (
                    id, name, business_name, phone, mobile, address, balance
                ),
                users (
                    id, username
                )
            `);

        if (!isNaN(parseInt(id))) {
            saleQuery = saleQuery.or(`id.eq.${parseInt(id)},invoice_no.eq.${id},uuid.eq.${id}`);
        } else {
            saleQuery = saleQuery.or(`invoice_no.eq.${id},uuid.eq.${id}`);
        }

        const { data: sales, error: sErr } = await saleQuery.limit(1);
        if (sErr || !sales || sales.length === 0) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        const sale = sales[0];

        // Fetch sale items
        const { data: saleItems, error: itemsErr } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', sale.id);

        if (itemsErr) {
            return NextResponse.json({ error: itemsErr.message }, { status: 500 });
        }

        // Fetch product & packaging details for items
        const variantIds = [...new Set((saleItems || []).map(i => i.variant_id))];
        const pkgTypeIds = [...new Set((saleItems || []).map(i => i.packaging_type_id))];

        const [variantsRes, pkgTypesRes, prodsRes, unitsRes, packagingsRes] = await Promise.all([
            variantIds.length > 0 ? supabase.from('product_variants').select('id, product_id, sku, variant_name, base_unit_id').in('id', variantIds) : { data: [] },
            pkgTypeIds.length > 0 ? supabase.from('packaging_types').select('id, name').in('id', pkgTypeIds) : { data: [] },
            supabase.from('products').select('id, name'),
            supabase.from('units').select('id, name, symbol'),
            variantIds.length > 0 ? supabase.from('product_packagings').select('variant_id, packaging_type_id, conversion_factor').in('variant_id', variantIds) : { data: [] }
        ]);

        const varMap = Object.fromEntries((variantsRes.data || []).map(v => [v.id, v]));
        const pkgTypeMap = Object.fromEntries((pkgTypesRes.data || []).map(pt => [pt.id, pt.name]));
        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p.name]));
        const unitMap = Object.fromEntries((unitsRes.data || []).map(u => [u.id, u]));
        const ppMap = Object.fromEntries((packagingsRes.data || []).map(pp => [`${pp.variant_id}_${pp.packaging_type_id}`, Number(pp.conversion_factor) || 1]));

        const items = (saleItems || []).map(item => {
            const variant = varMap[item.variant_id] || {};
            const productName = prodMap[variant.product_id] || 'Product';
            const baseUnit = unitMap[variant.base_unit_id] || { name: 'Piece', symbol: 'pcs' };
            const ppKey = `${item.variant_id}_${item.packaging_type_id}`;
            const convFactor = ppMap[ppKey] || 1;
            const packagingName = pkgTypeMap[item.packaging_type_id] || item.unit_name || (convFactor > 1 ? 'Bulk' : baseUnit.symbol);

            return {
                ...item,
                product_name: productName,
                variant_name: variant.variant_name || '',
                sku: variant.sku || '',
                packaging_name: packagingName,
                conversion_factor: convFactor,
                base_unit: baseUnit.symbol,
                unit_full_name: baseUnit.name
            };
        });

        const fullSale = {
            ...sale,
            customer_name: sale.customers?.name || 'Walk-in Customer',
            business_name: sale.customers?.business_name || '',
            customer_phone: sale.customers?.mobile || sale.customers?.phone || '',
            customer_mobile: sale.customers?.mobile || sale.customers?.phone || '',
            customer_address: sale.customers?.address || '',
            current_customer_balance: sale.customers?.balance || 0,
            cashier_name: sale.users?.username || 'Cashier',
            items
        };

        return NextResponse.json(fullSale);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const user = getUserFromReq(request);
        const { id } = await params;
        const body = await request.json();
        const {
            customer_id,
            party_type,
            walkin_name,
            walkin_phone,
            items,
            gross_amount,
            discount,
            special_discount,
            additional_charges,
            net_amount,
            amount_paid,
            payment_method,
            remarks
        } = body;

        // 1. Locate sale by id, invoice_no, or uuid
        let saleQuery = supabase.from('sales').select('*');
        if (!isNaN(parseInt(id))) {
            saleQuery = saleQuery.or(`id.eq.${parseInt(id)},invoice_no.eq.${id},uuid.eq.${id}`);
        } else {
            saleQuery = saleQuery.or(`invoice_no.eq.${id},uuid.eq.${id}`);
        }

        const { data: sales, error: sErr } = await saleQuery.limit(1);
        if (sErr || !sales || sales.length === 0) {
            return NextResponse.json({ error: 'Sale invoice not found' }, { status: 404 });
        }

        const oldSale = sales[0];
        const actualSaleId = oldSale.id;

        // 2. Compute updated totals
        let newGross = oldSale.gross_amount;
        let newDiscount = discount !== undefined ? parseFloat(discount) : (oldSale.discount || 0);
        let newSpecialDisc = special_discount !== undefined ? parseFloat(special_discount) : (oldSale.special_discount || 0);
        let newCharges = additional_charges !== undefined ? parseFloat(additional_charges) : (oldSale.additional_charges || 0);

        if (Array.isArray(items) && items.length > 0) {
            newGross = items.reduce((sum, it) => sum + (parseFloat(it.quantity || 0) * parseFloat(it.price || 0)), 0);
            const itemDiscounts = items.reduce((sum, it) => sum + parseFloat(it.discount || 0), 0);
            if (discount === undefined) newDiscount = itemDiscounts;
        }

        const computedNet = Math.max(0, newGross - newDiscount - newSpecialDisc + newCharges);
        const finalNet = net_amount !== undefined ? parseFloat(net_amount) : computedNet;
        const newPaid = amount_paid !== undefined ? parseFloat(amount_paid) : (oldSale.amount_paid || 0);
        const newRemaining = Math.max(0, finalNet - newPaid);
        const newPaymentStatus = newPaid >= finalNet ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
        const finalRemarks = remarks !== undefined ? remarks : (party_type === 'walkin' && walkin_name ? `Walk-in: ${walkin_name} ${walkin_phone ? '(' + walkin_phone + ')' : ''}` : (oldSale.remarks || ''));
        const newPayMethod = payment_method || oldSale.payment_method || 'cash';

        // 3. If items provided, restore previous stock and insert new items
        if (Array.isArray(items) && items.length > 0) {
            // Fetch old items
            const { data: oldItems } = await supabase
                .from('sale_items')
                .select('variant_id, packaging_type_id, quantity')
                .eq('sale_id', actualSaleId);

            // Fetch conversion factors for old items
            if (oldItems && oldItems.length > 0) {
                const oldVariantIds = oldItems.map(i => i.variant_id);
                const { data: oldPacks } = await supabase
                    .from('product_packagings')
                    .select('variant_id, packaging_type_id, conversion_factor')
                    .in('variant_id', oldVariantIds);

                const oldFactorMap = {};
                (oldPacks || []).forEach(p => {
                    oldFactorMap[`${p.variant_id}_${p.packaging_type_id}`] = parseFloat(p.conversion_factor) || 1;
                });

                // Restore stock for old items
                for (const oldIt of oldItems) {
                    const factor = oldFactorMap[`${oldIt.variant_id}_${oldIt.packaging_type_id}`] || 1;
                    const restoreQty = (parseFloat(oldIt.quantity) || 0) * factor;

                    const { data: vData } = await supabase
                        .from('product_variants')
                        .select('current_stock')
                        .eq('id', oldIt.variant_id)
                        .single();

                    if (vData) {
                        await supabase
                            .from('product_variants')
                            .update({ current_stock: (vData.current_stock || 0) + restoreQty })
                            .eq('id', oldIt.variant_id);
                    }
                }

                // Delete old items
                await supabase.from('sale_items').delete().eq('sale_id', actualSaleId);
            }

            // Insert new items and deduct stock
            let nextItemId = await getNextId('sale_items');
            const nowIso = new Date().toISOString();
            const newItemsToInsert = [];

            for (const item of items) {
                const factor = parseFloat(item.conversion_factor) || 1;
                const deductQty = (parseFloat(item.quantity) || 0) * factor;

                newItemsToInsert.push({
                    id: nextItemId++,
                    uuid: crypto.randomUUID(),
                    sale_id: actualSaleId,
                    variant_id: item.variant_id,
                    packaging_type_id: item.packaging_type_id,
                    unit_name: item.unit_name || item.base_unit || '',
                    quantity: item.quantity,
                    price: item.price,
                    discount: item.discount || 0,
                    total: item.total,
                    created_at: nowIso
                });

                const { data: vData } = await supabase
                    .from('product_variants')
                    .select('current_stock')
                    .eq('id', item.variant_id)
                    .single();

                if (vData) {
                    await supabase
                        .from('product_variants')
                        .update({ current_stock: Math.max(0, (vData.current_stock || 0) - deductQty) })
                        .eq('id', item.variant_id);
                }
            }

            if (newItemsToInsert.length > 0) {
                await supabase.from('sale_items').insert(newItemsToInsert);
            }
        }

        // 4. Update sales table
        const { error: upErr } = await supabase
            .from('sales')
            .update({
                gross_amount: newGross,
                discount: newDiscount,
                special_discount: newSpecialDisc,
                additional_charges: newCharges,
                net_amount: finalNet,
                amount_paid: newPaid,
                remaining_balance: newRemaining,
                payment_status: newPaymentStatus,
                payment_method: newPayMethod,
                remarks: finalRemarks
            })
            .eq('id', actualSaleId);

        if (upErr) {
            return NextResponse.json({ error: upErr.message }, { status: 500 });
        }

        // 5. Update customer balance if customer sale
        const customerIdToUse = customer_id || oldSale.customer_id;
        if (customerIdToUse) {
            const balanceDelta = newRemaining - (oldSale.remaining_balance || 0);
            if (balanceDelta !== 0) {
                const { data: custData } = await supabase
                    .from('customers')
                    .select('balance')
                    .eq('id', customerIdToUse)
                    .single();

                if (custData) {
                    await supabase
                        .from('customers')
                        .update({ balance: (custData.balance || 0) + balanceDelta })
                        .eq('id', customerIdToUse);

                    const nextLedgerId = await getNextId('customer_ledger');
                    await supabase.from('customer_ledger').insert([{
                        id: nextLedgerId,
                        uuid: crypto.randomUUID(),
                        customer_id: customerIdToUse,
                        sale_id: actualSaleId,
                        amount: Math.abs(balanceDelta),
                        type: 'adjustment',
                        description: `Admin Edit Adjustment for ${oldSale.invoice_no}`,
                        payment_method: newPayMethod,
                        created_at: new Date().toISOString()
                    }]);
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Sale updated successfully',
            saleId: actualSaleId,
            invoice_no: oldSale.invoice_no
        });
    } catch (err) {
        console.error('Update sale error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
