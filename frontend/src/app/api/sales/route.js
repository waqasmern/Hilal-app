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

function getPakistanTimeParts(d = new Date()) {
    const s = d.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: false });
    const [datePart, timePart] = s.split(', ');
    const [m, day, y] = datePart.split('/');
    const pad = n => String(n).padStart(2, '0');
    return {
        date: `${y}-${pad(m)}-${pad(day)}`,
        now: `${y}-${pad(m)}-${pad(day)} ${timePart}`
    };
}

function getDateBoundaries(filter, startDate, endDate) {
    const pk = getPakistanTimeParts();
    const today = pk.date;

    if (filter === 'today') {
        return { start: `${today} 00:00:00`, end: `${today} 23:59:59` };
    } else if (filter === 'yesterday') {
        const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yDate = getPakistanTimeParts(y).date;
        return { start: `${yDate} 00:00:00`, end: `${yDate} 23:59:59` };
    } else if (filter === 'this_week') {
        const curr = new Date();
        const first = curr.getDate() - curr.getDay();
        const firstDay = new Date(curr.setDate(first));
        const dStart = getPakistanTimeParts(firstDay).date;
        return { start: `${dStart} 00:00:00`, end: `${today} 23:59:59` };
    } else if (filter === 'this_month') {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const dStart = getPakistanTimeParts(firstDay).date;
        return { start: `${dStart} 00:00:00`, end: `${today} 23:59:59` };
    } else if (filter === 'custom' && startDate && endDate) {
        return { start: `${startDate} 00:00:00`, end: `${endDate} 23:59:59` };
    }
    return null;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const isPaginated = searchParams.get('paginate') === 'true' || searchParams.has('page');
        const dateFilter = searchParams.get('dateFilter') || 'today';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const status = searchParams.get('status') || 'ALL';
        const search = searchParams.get('search');

        const dateBounds = getDateBoundaries(dateFilter, startDate, endDate);

        let query = supabase
            .from('sales')
            .select(`
                *,
                customers (
                    id, name, business_name, phone, address
                ),
                users (
                    id, username
                )
            `, { count: isPaginated ? 'exact' : undefined })
            .order('created_at', { ascending: false });

        if (dateBounds) {
            query = query.gte('created_at', dateBounds.start).lte('created_at', dateBounds.end);
        }

        if (status === 'PAID') {
            query = query.lte('remaining_balance', 0.01).gt('net_amount', 0);
        } else if (status === 'PARTIAL') {
            query = query.gt('amount_paid', 0).gt('remaining_balance', 0.01);
        } else if (status === 'PENDING') {
            query = query.lte('amount_paid', 0).gt('remaining_balance', 0.01);
        }

        if (search && search.trim()) {
            query = query.ilike('invoice_no', `%${search.trim()}%`);
        }

        if (isPaginated) {
            const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
            const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            query = query.range(from, to);
            const { data, count, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const sales = (data || []).map(s => ({
                ...s,
                customer_name: s.customers?.name || 'Walk-in Customer',
                customer_business: s.customers?.business_name || '',
                customer_phone: s.customers?.phone || '',
                customer_address: s.customers?.address || '',
                cashier_name: s.users?.username || 'Cashier'
            }));

            return NextResponse.json({
                sales,
                total: count || 0,
                page,
                totalPages: Math.ceil((count || 0) / limit)
            });
        } else {
            query = query.limit(500);
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const sales = (data || []).map(s => ({
                ...s,
                customer_name: s.customers?.name || 'Walk-in Customer',
                customer_business: s.customers?.business_name || '',
                customer_phone: s.customers?.phone || '',
                customer_address: s.customers?.address || '',
                cashier_name: s.users?.username || 'Cashier'
            }));

            return NextResponse.json(sales);
        }
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = getUserFromReq(request);
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
            remarks,
            admin_override,
            device_id
        } = body;

        if (!Array.isArray(items) || items.length === 0 || net_amount === undefined) {
            return NextResponse.json({ error: 'Valid sale items and net amount required' }, { status: 400 });
        }

        const remainingBalance = Math.max(0, (net_amount || 0) - (amount_paid || 0));
        const paymentStatus = (amount_paid || 0) >= net_amount ? 'paid' : ((amount_paid || 0) > 0 ? 'partial' : 'unpaid');

        // Check credit limit if credit sale
        if (customer_id && remainingBalance > 0) {
            const { data: customer } = await supabase
                .from('customers')
                .select('credit_limit, balance')
                .eq('id', customer_id)
                .single();

            if (customer && customer.credit_limit > 0) {
                const availableCredit = (customer.credit_limit || 0) - (customer.balance || 0);
                if (remainingBalance > availableCredit && user.role !== 'admin' && !admin_override) {
                    return NextResponse.json({
                        error: 'CREDIT_LIMIT_EXCEEDED',
                        message: `Credit limit exceeded! Available credit: Rs. ${availableCredit.toLocaleString()}, required: Rs. ${remainingBalance.toLocaleString()}`,
                        availableCredit,
                        requiredCredit: remainingBalance
                    }, { status: 400 });
                }
            }
        }

        const nextSaleId = await getNextId('sales');
        const saleUUID = crypto.randomUUID();
        const invoiceNo = `INV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
        const finalRemarks = remarks || (party_type === 'walkin' && walkin_name ? `Walk-in: ${walkin_name} ${walkin_phone ? '(' + walkin_phone + ')' : ''}` : '');
        const pkTime = getPakistanTimeParts();
        const localDateTime = pkTime.now;
        const nowDate = pkTime.date;

        // 1. Insert into sales
        const { data: saleData, error: saleErr } = await supabase
            .from('sales')
            .insert([{
                id: nextSaleId,
                uuid: saleUUID,
                invoice_no: invoiceNo,
                customer_id: customer_id || null,
                user_id: user.id || 1,
                device_id: device_id || 'CLOUD-WEB-01',
                gross_amount: gross_amount || 0,
                discount: discount || 0,
                special_discount: special_discount || 0,
                additional_charges: additional_charges || 0,
                net_amount: net_amount,
                amount_paid: amount_paid || 0,
                remaining_balance: remainingBalance,
                status: 'completed',
                payment_status: paymentStatus,
                payment_method: payment_method || 'cash',
                remarks: finalRemarks,
                is_synced: 1,
                created_at: localDateTime
            }])
            .select()
            .single();

        if (saleErr) {
            console.error('Sale insert error:', saleErr);
            return NextResponse.json({ error: saleErr.message }, { status: 500 });
        }

        const saleId = saleData.id;

        // 2. Insert sale items and update stock
        let nextItemId = await getNextId('sale_items');
        let nextMoveId = await getNextId('stock_movements');
        const saleItemsToInsert = [];
        const stockMovementsToInsert = [];

        for (const item of items) {
            const itemUUID = crypto.randomUUID();
            saleItemsToInsert.push({
                id: nextItemId++,
                uuid: itemUUID,
                sale_id: saleId,
                variant_id: item.variant_id,
                packaging_type_id: item.packaging_type_id,
                unit_name: item.unit_name || '',
                quantity: item.quantity,
                price: item.price,
                discount: item.discount || 0,
                total: item.total,
                created_at: localDateTime
            });

            const factor = parseFloat(item.conversion_factor) || 1;
            const equivalentQty = (parseFloat(item.quantity) || 0) * factor;

            // Deduct stock on variant
            const { data: curVar } = await supabase
                .from('product_variants')
                .select('current_stock')
                .eq('id', item.variant_id)
                .single();

            if (curVar) {
                const newStock = (parseFloat(curVar.current_stock) || 0) - equivalentQty;
                await supabase
                    .from('product_variants')
                    .update({ current_stock: newStock })
                    .eq('id', item.variant_id);

                await supabase
                    .from('inventory_stock')
                    .update({ quantity: newStock, updated_at: localDateTime })
                    .eq('variant_id', item.variant_id);
            }

            stockMovementsToInsert.push({
                id: nextMoveId++,
                uuid: crypto.randomUUID(),
                variant_id: item.variant_id,
                packaging_type_id: item.packaging_type_id,
                movement_type: 'SALE',
                quantity: item.quantity,
                equivalent_qty: equivalentQty,
                reference_id: invoiceNo,
                reference_type: 'SALE',
                user_id: user.id || 1,
                device_id: device_id || 'CLOUD-WEB-01',
                created_at: localDateTime
            });
        }

        if (saleItemsToInsert.length > 0) {
            await supabase.from('sale_items').insert(saleItemsToInsert);
        }

        if (stockMovementsToInsert.length > 0) {
            await supabase.from('stock_movements').insert(stockMovementsToInsert);
        }

        // 3. Customer Ledger Entries
        if (customer_id) {
            let nextLedgerId = await getNextId('customer_ledger');
            // Debit charge
            await supabase.from('customer_ledger').insert([{
                id: nextLedgerId++,
                uuid: crypto.randomUUID(),
                customer_id,
                sale_id: saleId,
                amount: net_amount,
                type: 'charge',
                description: `Wholesale Invoice ${invoiceNo}`,
                payment_method: payment_method || 'cash',
                payment_date: nowDate,
                created_at: localDateTime
            }]);

            // Credit payment
            if ((amount_paid || 0) > 0) {
                await supabase.from('customer_ledger').insert([{
                    id: nextLedgerId++,
                    uuid: crypto.randomUUID(),
                    customer_id,
                    sale_id: saleId,
                    amount: amount_paid,
                    type: 'payment',
                    description: `Payment for Invoice ${invoiceNo}`,
                    payment_method: payment_method || 'cash',
                    payment_date: nowDate,
                    created_at: localDateTime
                }]);

                const nextPayId = await getNextId('payments');
                await supabase.from('payments').insert([{
                    id: nextPayId,
                    uuid: crypto.randomUUID(),
                    party_type: 'customer',
                    party_id: customer_id,
                    amount: amount_paid,
                    payment_method: payment_method || 'cash',
                    reference_no: invoiceNo,
                    user_id: user.id || 1,
                    device_id: device_id || 'CLOUD-WEB-01',
                    notes: `Payment for Invoice ${invoiceNo}`,
                    payment_date: nowDate,
                    created_at: localDateTime
                }]);
            }

            // Update customer balance
            const { data: custRow } = await supabase
                .from('customers')
                .select('balance')
                .eq('id', customer_id)
                .single();

            const curBalance = parseFloat(custRow?.balance) || 0;
            await supabase
                .from('customers')
                .update({ balance: curBalance + remainingBalance })
                .eq('id', customer_id);
        }

        return NextResponse.json({
            success: true,
            saleId,
            invoiceNo,
            net_amount,
            remainingBalance
        });
    } catch (err) {
        console.error('Order creation error:', err);
        return NextResponse.json({ error: err.message || 'Failed to complete sale' }, { status: 500 });
    }
}
