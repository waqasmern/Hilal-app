import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        let query = supabase.from('sale_returns').select(`
            *,
            customers ( id, name, business_name, phone ),
            sales ( invoice_no )
        `).order('created_at', { ascending: false });

        if (startDate && endDate) {
            const startUtc = new Date(`${startDate}T00:00:00+05:00`).toISOString();
            const endUtc = new Date(`${endDate}T23:59:59.999+05:00`).toISOString();
            query = query.gte('created_at', startUtc).lte('created_at', endUtc);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const formatted = (data || []).map(r => ({
            ...r,
            customer_name: r.customers?.name || 'Customer',
            original_invoice_no: r.sales?.invoice_no || ''
        }));

        return NextResponse.json(formatted);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const {
            sale_id,
            customer_id,
            return_type = 'saleable',
            refund_method = 'credit',
            items,
            total_refund,
            remarks,
            payment_date
        } = body;

        const numRefund = parseFloat(total_refund);
        if (!Array.isArray(items) || items.length === 0 || !numRefund || numRefund <= 0) {
            return NextResponse.json({ error: 'Valid return items and positive refund amount are required' }, { status: 400 });
        }

        const saleId = sale_id ? parseInt(sale_id) : null;
        const customerId = customer_id ? parseInt(customer_id) : null;
        const nowIso = new Date().toISOString();
        const payDate = payment_date || nowIso.slice(0, 10);

        // 1. If linked to an original sale, validate that refund doesn't exceed invoice balance
        if (saleId) {
            const { data: sale } = await supabase.from('sales').select('net_amount, invoice_no').eq('id', saleId).single();
            if (sale) {
                const { data: priorReturns } = await supabase
                    .from('sale_returns')
                    .select('total_refund')
                    .eq('sale_id', saleId)
                    .neq('status', 'void');

                const priorRefundTotal = (priorReturns || []).reduce((sum, r) => sum + (parseFloat(r.total_refund) || 0), 0);
                const availableToRefund = (parseFloat(sale.net_amount) || 0) - priorRefundTotal;

                if (numRefund > availableToRefund + 0.5) {
                    return NextResponse.json({
                        error: `Refund amount (Rs. ${numRefund.toLocaleString()}) cannot exceed remaining returnable balance (Rs. ${Math.round(availableToRefund).toLocaleString()}) on invoice #${sale.invoice_no}`
                    }, { status: 400 });
                }
            }
        }

        const returnId = await getNextId('sale_returns');
        const returnUUID = crypto.randomUUID();
        const cnNumber = `CN-${String(returnId).padStart(5, '0')}`;

        // 2. Insert into sale_returns
        const { data: insertedReturn, error: retErr } = await supabase
            .from('sale_returns')
            .insert([{
                id: returnId,
                uuid: returnUUID,
                sale_id: saleId,
                customer_id: customerId,
                user_id: 1,
                total_refund: numRefund,
                return_type: return_type || 'saleable',
                refund_method: refund_method || 'credit',
                status: 'completed',
                remarks: remarks || `Sales return #${cnNumber}`,
                created_at: nowIso
            }])
            .select()
            .single();

        if (retErr) {
            return NextResponse.json({ error: retErr.message }, { status: 500 });
        }

        // 3. Insert items and update inventory stock
        let nextItemId = await getNextId('sale_return_items');
        let nextMovId = await getNextId('stock_movements');

        for (const it of items) {
            const vId = parseInt(it.variant_id);
            const qty = parseFloat(it.quantity) || 1;
            const factor = parseFloat(it.conversion_factor) || 1;
            const equivalentQty = qty * factor;
            const price = parseFloat(it.refund_price) || 0;
            const pkgId = it.packaging_type_id ? parseInt(it.packaging_type_id) : 1;

            await supabase.from('sale_return_items').insert([{
                id: nextItemId++,
                uuid: crypto.randomUUID(),
                sale_return_id: returnId,
                variant_id: vId,
                packaging_type_id: pkgId,
                quantity: qty,
                refund_price: price
            }]);

            // If saleable: restore stock
            if (return_type !== 'damaged') {
                const { data: curVar } = await supabase.from('product_variants').select('current_stock').eq('id', vId).single();
                if (curVar) {
                    await supabase.from('product_variants').update({
                        current_stock: Number(curVar.current_stock || 0) + equivalentQty
                    }).eq('id', vId);
                }

                const { data: curStk } = await supabase.from('inventory_stock').select('quantity').eq('variant_id', vId).single();
                if (curStk) {
                    await supabase.from('inventory_stock').update({
                        quantity: Number(curStk.quantity || 0) + equivalentQty
                    }).eq('variant_id', vId);
                }
            }

            // Log stock movement
            await supabase.from('stock_movements').insert([{
                id: nextMovId++,
                uuid: crypto.randomUUID(),
                variant_id: vId,
                packaging_type_id: pkgId,
                movement_type: return_type === 'damaged' ? 'DAMAGE' : 'SALE_RETURN',
                quantity: qty,
                equivalent_qty: equivalentQty,
                reference_id: String(returnId),
                reference_type: 'SALE_RETURN',
                notes: return_type === 'damaged' ? 'Damaged customer return (Quarantined Scrap)' : 'Restocked sale return',
                user_id: 1,
                device_id: 'DEVICE-CLOUD-01',
                created_at: nowIso
            }]);
        }

        // 4. Financial Settlement
        if (refund_method === 'cash') {
            // Cash paid out from drawer
            const nextPayId = await getNextId('payments');
            await supabase.from('payments').insert([{
                id: nextPayId,
                uuid: crypto.randomUUID(),
                party_type: 'customer',
                party_id: customerId,
                amount: -numRefund,
                payment_method: 'cash',
                reference_no: cnNumber,
                user_id: 1,
                device_id: 'DEVICE-CLOUD-01',
                notes: `Cash Refund for Credit Note #${cnNumber}`,
                payment_date: payDate,
                created_at: nowIso
            }]);

            if (customerId) {
                const nextLedgerId = await getNextId('customer_ledger');
                await supabase.from('customer_ledger').insert([{
                    id: nextLedgerId,
                    uuid: crypto.randomUUID(),
                    customer_id: customerId,
                    sale_id: saleId,
                    amount: numRefund,
                    type: 'return',
                    description: `Sales Return #${cnNumber} (${return_type}) - Cash Refund Paid Out`,
                    payment_method: 'cash',
                    payment_date: payDate,
                    created_at: nowIso
                }]);
            }
        } else {
            // Khata Store Credit
            if (customerId) {
                const nextLedgerId = await getNextId('customer_ledger');
                await supabase.from('customer_ledger').insert([{
                    id: nextLedgerId,
                    uuid: crypto.randomUUID(),
                    customer_id: customerId,
                    sale_id: saleId,
                    amount: numRefund,
                    type: 'return',
                    description: `Sales Return #${cnNumber} (${return_type}) - Credited to Khata`,
                    payment_method: 'credit_note',
                    payment_date: payDate,
                    created_at: nowIso
                }]);

                const { data: cust } = await supabase.from('customers').select('balance').eq('id', customerId).single();
                if (cust) {
                    await supabase.from('customers').update({
                        balance: Number(cust.balance || 0) - numRefund
                    }).eq('id', customerId);
                }
            }
        }

        // 5. Audit Log
        try {
            const nextAuditId = await getNextId('audit_logs');
            await supabase.from('audit_logs').insert([{
                id: nextAuditId,
                uuid: crypto.randomUUID(),
                user_id: 1,
                username: 'admin',
                action: 'SALE_RETURN',
                entity_name: 'sale_returns',
                entity_id: String(returnId),
                details: `Credit Note #${cnNumber}: Rs. ${numRefund} (${return_type}, Method: ${refund_method})`,
                created_at: nowIso
            }]);
        } catch (e) {
            console.warn('Audit note:', e.message);
        }

        return NextResponse.json({
            success: true,
            returnId,
            cnNumber,
            data: insertedReturn
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
