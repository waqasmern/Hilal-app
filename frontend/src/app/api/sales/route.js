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

    const toUtcRange = (startDay, endDay) => ({
        start: new Date(`${startDay}T00:00:00+05:00`).toISOString(),
        end: new Date(`${endDay}T23:59:59.999+05:00`).toISOString()
    });

    if (filter === 'today') {
        return toUtcRange(today, today);
    } else if (filter === 'yesterday') {
        const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yDate = getPakistanTimeParts(y).date;
        return toUtcRange(yDate, yDate);
    } else if (filter === 'this_week') {
        const curr = new Date();
        const first = curr.getDate() - curr.getDay();
        const firstDay = new Date(curr.setDate(first));
        const dStart = getPakistanTimeParts(firstDay).date;
        return toUtcRange(dStart, today);
    } else if (filter === 'this_month') {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const dStart = getPakistanTimeParts(firstDay).date;
        return toUtcRange(dStart, today);
    } else if (filter === 'custom' && startDate && endDate) {
        return toUtcRange(startDate, endDate);
    }
    return null;
}

async function attachProfitMetrics(salesList) {
    if (!salesList || salesList.length === 0) return salesList;
    try {
        const saleIds = salesList.map(s => s.id);
        const [itemsRes, packRes] = await Promise.all([
            supabase.from('sale_items').select('sale_id, quantity, variant_id, packaging_type_id').in('sale_id', saleIds),
            supabase.from('product_packagings').select('variant_id, packaging_type_id, purchase_price, is_default')
        ]);

        const saleItems = itemsRes.data || [];
        const packagings = packRes.data || [];

        const ppMap = {};
        const defMap = {};
        packagings.forEach(p => {
            ppMap[`${p.variant_id}_${p.packaging_type_id}`] = parseFloat(p.purchase_price) || 0;
            if (p.is_default || !defMap[p.variant_id]) {
                defMap[p.variant_id] = parseFloat(p.purchase_price) || 0;
            }
        });

        const saleCostMap = {};
        saleItems.forEach(item => {
            const price = ppMap[`${item.variant_id}_${item.packaging_type_id}`] ?? defMap[item.variant_id] ?? 0;
            const cost = (parseFloat(item.quantity) || 0) * price;
            saleCostMap[item.sale_id] = (saleCostMap[item.sale_id] || 0) + cost;
        });

        return salesList.map(s => {
            const cost = Math.round((saleCostMap[s.id] || 0) * 100) / 100;
            const net = parseFloat(s.net_amount) || 0;
            const profit = Math.round((net - cost) * 100) / 100;
            const profit_margin_percent = net > 0 ? Math.round((profit / net) * 1000) / 10 : 0;
            return {
                ...s,
                total_cost: cost,
                profit,
                profit_margin_percent
            };
        });
    } catch (err) {
        console.error('attachProfitMetrics error:', err);
        return salesList;
    }
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
                    id, name, business_name, phone, mobile, address
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
            const q = search.trim();
            // Match customer fields as well as invoice number
            const { data: matchedCusts } = await supabase
                .from('customers')
                .select('id')
                .or(`name.ilike.%${q}%,business_name.ilike.%${q}%,phone.ilike.%${q}%,mobile.ilike.%${q}%`);
            const custIds = (matchedCusts || []).map(c => c.id);

            if (custIds.length > 0) {
                query = query.or(`invoice_no.ilike.%${q}%,customer_id.in.(${custIds.join(',')})`);
            } else {
                query = query.ilike('invoice_no', `%${q}%`);
            }
        }

        if (isPaginated) {
            const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
            const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            query = query.range(from, to);
            const { data, count, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            let sales = (data || []).map(s => ({
                ...s,
                customer_name: s.customers?.name || 'Walk-in Customer',
                customer_business: s.customers?.business_name || '',
                customer_phone: s.customers?.mobile || s.customers?.phone || '',
                customer_mobile: s.customers?.mobile || s.customers?.phone || '',
                customer_address: s.customers?.address || '',
                cashier_name: s.users?.username || 'Cashier'
            }));
            sales = await attachProfitMetrics(sales);

            // Calculate date-range summary metrics across all sales in date range
            let summaryQuery = supabase
                .from('sales')
                .select('id, net_amount, amount_paid, remaining_balance, discount, special_discount, payment_status, created_at');
            if (dateBounds) {
                summaryQuery = summaryQuery.gte('created_at', dateBounds.start).lte('created_at', dateBounds.end);
            }
            const { data: allDateSales } = await summaryQuery;

            let totalSaleAmount = 0;
            let checkoutCollected = 0;
            let totalPendingDues = 0;
            let totalDiscount = 0;
            let paidCount = 0;
            let partialCount = 0;
            let pendingCount = 0;

            (allDateSales || []).forEach(s => {
                const net = Number(s.net_amount) || 0;
                const paid = Number(s.amount_paid) || 0;
                const rem = Number(s.remaining_balance) || Math.max(0, net - paid);
                const disc = (Number(s.discount) || 0) + (Number(s.special_discount) || 0);

                totalSaleAmount += net;
                checkoutCollected += Math.min(paid, net);
                totalPendingDues += rem;
                totalDiscount += disc;

                if (rem <= 0.01 && net > 0) paidCount++;
                else if (paid > 0 && rem > 0.01) partialCount++;
                else if (paid <= 0 && rem > 0.01) pendingCount++;
            });

            // Recovered dues from customer payments in the same date range
            let recQuery = supabase
                .from('payments')
                .select(`
                    id, uuid, amount, payment_method, reference_no, payment_date, created_at, notes, party_id,
                    customers ( name, business_name, phone, mobile )
                `)
                .eq('party_type', 'customer')
                .gt('amount', 0);

            if (dateBounds) {
                recQuery = recQuery.gte('created_at', dateBounds.start).lte('created_at', dateBounds.end);
            }
            const { data: recPayments } = await recQuery;

            const recoveredPaymentsList = (recPayments || []).filter(p => {
                const ref = String(p.reference_no || '');
                const notes = String(p.notes || '').toLowerCase();
                return !ref.startsWith('SALE-') && !ref.startsWith('RET-') && !notes.includes('refund') && !notes.includes('return');
            }).map(p => {
                const amt = Number(p.amount) || 0;
                const refStr = (p.reference_no || '') + ' ' + (p.notes || '');
                const invTokens = refStr.match(/INV-[A-Za-z0-9_-]+/gi) || [];
                const uniqueInvoices = Array.from(new Set(invTokens));
                const margin = 0.20;
                const recProfit = Math.round(amt * margin);
                return {
                    payment_id: p.id,
                    payment_uuid: p.uuid,
                    recovered_amount: amt,
                    recovered_profit: recProfit,
                    profit: recProfit,
                    profit_margin_percent: 20.0,
                    payment_method: p.payment_method,
                    reference_no: p.reference_no,
                    recovery_date: p.payment_date || (p.created_at ? p.created_at.slice(0, 10) : ''),
                    payment_created_at: p.created_at,
                    notes: p.notes,
                    customer_id: p.party_id,
                    customer_name: p.customers?.name || 'Customer',
                    customer_business: p.customers?.business_name || '',
                    customer_phone: p.customers?.mobile || p.customers?.phone || '',
                    customer_mobile: p.customers?.mobile || p.customers?.phone || '',
                    cashier_name: 'Cashier',
                    original_sale_id: uniqueInvoices.length > 0 ? uniqueInvoices[0] : null,
                    linked_invoices: uniqueInvoices
                };
            });

            const recoveredDues = recoveredPaymentsList.reduce((sum, p) => sum + p.recovered_amount, 0);
            const totalCollected = checkoutCollected + recoveredDues;

            const allSalesWithProfit = await attachProfitMetrics(allDateSales || []);
            const totalProfit = allSalesWithProfit.reduce((sum, s) => sum + (Number(s.profit) || 0), 0);

            const summary = {
                totalSalesCount: (allDateSales || []).length,
                totalSaleAmount,
                totalSale: totalSaleAmount,
                totalProfit: Math.round(totalProfit),
                checkoutCollected,
                recoveredDues,
                totalRecoveredDues: recoveredDues,
                totalCollected,
                totalPendingDues,
                totalDiscount,
                paidCount,
                partialCount,
                pendingCount,
                statusCounts: {
                    ALL: (allDateSales || []).length,
                    PAID: paidCount,
                    PARTIAL: partialCount,
                    PENDING: pendingCount
                }
            };

            return NextResponse.json({
                data: sales,
                sales,
                recoveredPayments: recoveredPaymentsList,
                pagination: {
                    total: count || 0,
                    page,
                    limit,
                    totalPages: Math.max(1, Math.ceil((count || 0) / limit))
                },
                total: count || 0,
                page,
                totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
                summary
            });
        } else {
            query = query.limit(500);
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            let sales = (data || []).map(s => ({
                ...s,
                customer_name: s.customers?.name || 'Walk-in Customer',
                customer_business: s.customers?.business_name || '',
                customer_phone: s.customers?.mobile || s.customers?.phone || '',
                customer_mobile: s.customers?.mobile || s.customers?.phone || '',
                customer_address: s.customers?.address || '',
                cashier_name: s.users?.username || 'Cashier'
            }));
            sales = await attachProfitMetrics(sales);

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
        const nowIso = new Date().toISOString();
        const pkTime = getPakistanTimeParts();
        const nowDate = pkTime.date;

        let effectiveCustomerId = customer_id || null;

        // Auto-resolve or create Customer Ledger for walk-in credit / partial sales
        if (!effectiveCustomerId && party_type === 'walkin' && remainingBalance > 0) {
            const cleanPhone = (walkin_phone || '').trim();
            const rawName = (walkin_name || '').trim();
            const isGenericName = !rawName || rawName.toLowerCase() === 'walk-in customer' || rawName.toLowerCase() === 'walk-in' || rawName.toLowerCase() === 'walkin';
            const cleanName = isGenericName ? (cleanPhone ? `Walk-in (${cleanPhone})` : 'Walk-in Customer') : rawName;

            let existingCust = null;
            if (cleanPhone) {
                const { data } = await supabase
                    .from('customers')
                    .select('id, name, phone, mobile')
                    .or(`phone.eq.${cleanPhone},mobile.eq.${cleanPhone}`)
                    .eq('is_deleted', 0)
                    .limit(1);
                if (data && data.length > 0) existingCust = data[0];
            }

            if (!existingCust && !isGenericName) {
                const { data } = await supabase
                    .from('customers')
                    .select('id, name')
                    .ilike('name', cleanName)
                    .eq('is_deleted', 0)
                    .limit(1);
                if (data && data.length > 0) existingCust = data[0];
            }

            if (existingCust) {
                effectiveCustomerId = existingCust.id;
            } else {
                const nextCustId = await getNextId('customers');
                const bName = isGenericName ? 'Walk-in Retail' : cleanName;
                const addr = (walkin_address || 'Timergara').trim();
                const { data: newCust, error: cErr } = await supabase
                    .from('customers')
                    .insert([{
                        id: nextCustId,
                        uuid: crypto.randomUUID(),
                        name: cleanName,
                        business_name: bName,
                        phone: cleanPhone,
                        mobile: cleanPhone,
                        address: addr,
                        credit_limit: 0,
                        opening_balance: 0,
                        balance: 0,
                        is_deleted: 0,
                        created_at: nowIso
                    }])
                    .select()
                    .single();

                if (newCust && !cErr) {
                    effectiveCustomerId = newCust.id;
                }
            }
        }

        // 1. Insert into sales
        const { data: saleData, error: saleErr } = await supabase
            .from('sales')
            .insert([{
                id: nextSaleId,
                uuid: saleUUID,
                invoice_no: invoiceNo,
                customer_id: effectiveCustomerId || null,
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
                created_at: nowIso
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
                created_at: nowIso
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
                    .update({ quantity: newStock, updated_at: nowIso })
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
                created_at: nowIso
            });
        }

        if (saleItemsToInsert.length > 0) {
            await supabase.from('sale_items').insert(saleItemsToInsert);
        }

        if (stockMovementsToInsert.length > 0) {
            await supabase.from('stock_movements').insert(stockMovementsToInsert);
        }

        // 3. Customer Ledger Entries
        if (effectiveCustomerId) {
            let nextLedgerId = await getNextId('customer_ledger');
            // Debit charge
            await supabase.from('customer_ledger').insert([{
                id: nextLedgerId++,
                uuid: crypto.randomUUID(),
                customer_id: effectiveCustomerId,
                sale_id: saleId,
                amount: net_amount,
                type: 'charge',
                description: `Wholesale Invoice ${invoiceNo}`,
                payment_method: payment_method || 'cash',
                payment_date: nowDate,
                created_at: nowIso
            }]);

            // Credit payment
            if ((amount_paid || 0) > 0) {
                await supabase.from('customer_ledger').insert([{
                    id: nextLedgerId++,
                    uuid: crypto.randomUUID(),
                    customer_id: effectiveCustomerId,
                    sale_id: saleId,
                    amount: amount_paid,
                    type: 'payment',
                    description: `Payment for Invoice ${invoiceNo}`,
                    payment_method: payment_method || 'cash',
                    payment_date: nowDate,
                    created_at: nowIso
                }]);

                const nextPayId = await getNextId('payments');
                await supabase.from('payments').insert([{
                    id: nextPayId,
                    uuid: crypto.randomUUID(),
                    party_type: 'customer',
                    party_id: effectiveCustomerId,
                    amount: amount_paid,
                    payment_method: payment_method || 'cash',
                    reference_no: invoiceNo,
                    user_id: user.id || 1,
                    device_id: device_id || 'CLOUD-WEB-01',
                    notes: `Payment for Invoice ${invoiceNo}`,
                    payment_date: nowDate,
                    created_at: nowIso
                }]);
            }

            // Update customer balance
            const { data: custRow } = await supabase
                .from('customers')
                .select('balance')
                .eq('id', effectiveCustomerId)
                .single();

            const curBalance = parseFloat(custRow?.balance) || 0;
            await supabase
                .from('customers')
                .update({ balance: curBalance + remainingBalance })
                .eq('id', effectiveCustomerId);
        }

        return NextResponse.json({
            success: true,
            saleId,
            invoiceNo,
            net_amount,
            remainingBalance,
            customer_id: effectiveCustomerId
        });
    } catch (err) {
        console.error('Order creation error:', err);
        return NextResponse.json({ error: err.message || 'Failed to complete sale' }, { status: 500 });
    }
}
