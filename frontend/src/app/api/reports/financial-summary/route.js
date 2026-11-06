import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function getUtcBoundaries(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const s = `${startDate}T00:00:00+05:00`;
    const e = `${endDate}T23:59:59.999+05:00`;
    return {
        startUtc: new Date(s).toISOString(),
        endUtc: new Date(e).toISOString()
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        const boundaries = getUtcBoundaries(startDate, endDate);

        let salesQuery = supabase.from('sales').select('*').eq('status', 'completed');
        let paymentsQuery = supabase.from('payments').select('*');
        let expensesQuery = supabase.from('expenses').select('*');
        let returnsQuery = supabase.from('sale_returns').select('*');

        if (boundaries) {
            salesQuery = salesQuery.gte('created_at', boundaries.startUtc).lte('created_at', boundaries.endUtc);
            paymentsQuery = paymentsQuery.gte('created_at', boundaries.startUtc).lte('created_at', boundaries.endUtc);
            expensesQuery = expensesQuery.gte('created_at', boundaries.startUtc).lte('created_at', boundaries.endUtc);
            returnsQuery = returnsQuery.gte('created_at', boundaries.startUtc).lte('created_at', boundaries.endUtc);
        }

        const [salesRes, paymentsRes, expensesRes, returnsRes] = await Promise.all([
            salesQuery,
            paymentsQuery,
            expensesQuery,
            returnsQuery
        ]);

        const sales = salesRes.data || [];
        const payments = paymentsRes.data || [];
        const expensesData = expensesRes.data || [];
        const returns = returnsRes.data || [];

        let totalGrossSale = 0;
        let totalDiscount = 0;
        let totalNetSale = 0;
        let salesCashPaid = 0;
        let grossNewDuesAdded = 0;

        sales.forEach(s => {
            const gross = parseFloat(s.gross_amount) || 0;
            const disc = parseFloat(s.discount) || 0;
            const net = parseFloat(s.net_amount) || (gross - disc);
            const paid = parseFloat(s.amount_paid) || 0;
            const dues = Math.max(0, net - paid);

            totalGrossSale += gross;
            totalDiscount += disc;
            totalNetSale += net;
            salesCashPaid += paid;
            grossNewDuesAdded += dues;
        });

        // Recovered dues from customer payments
        let recoveredDues = 0;
        let stockPaid = 0;

        payments.forEach(p => {
            const amt = parseFloat(p.amount) || 0;
            if (p.party_type === 'customer' && amt > 0) {
                recoveredDues += amt;
            } else if (p.party_type === 'supplier' && amt > 0) {
                stockPaid += amt;
            }
        });

        // Expenses
        let expenses = 0;
        expensesData.forEach(e => {
            expenses += parseFloat(e.amount) || 0;
        });

        // Returns
        let totalReturns = 0;
        let cashRefunds = 0;
        let creditReturns = 0;

        returns.forEach(r => {
            const ref = parseFloat(r.total_refund) || 0;
            totalReturns += ref;
            if (r.refund_method === 'cash') cashRefunds += ref;
            else creditReturns += ref;
        });

        const netNewDuesAdded = Math.max(0, grossNewDuesAdded - creditReturns);
        const newDuesAdded = netNewDuesAdded;
        const totalSale = totalGrossSale > 0 ? totalGrossSale : (totalNetSale + totalDiscount);

        // Compute Cost of Goods Sold (COGS) & Profit metrics
        let totalCogs = 0;
        let totalProfit = 0;
        let pendingProfit = 0;

        const saleIds = sales.map(s => s.id);
        if (saleIds.length > 0) {
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

            // Group items by sale_id
            const saleCostMap = {};
            saleItems.forEach(item => {
                const price = ppMap[`${item.variant_id}_${item.packaging_type_id}`] ?? defMap[item.variant_id] ?? 0;
                const cost = (parseFloat(item.quantity) || 0) * price;
                saleCostMap[item.sale_id] = (saleCostMap[item.sale_id] || 0) + cost;
            });

            sales.forEach(s => {
                const cost = saleCostMap[s.id] || 0;
                const net = parseFloat(s.net_amount) || 0;
                const rem = parseFloat(s.remaining_balance) || 0;
                const profit = net - cost;

                totalCogs += cost;
                totalProfit += profit;

                if (net > 0 && rem > 0) {
                    const pendingRatio = Math.min(net, rem) / net;
                    pendingProfit += (profit * pendingRatio);
                }
            });
        }

        totalCogs = Math.round(totalCogs);
        totalProfit = Math.round(totalProfit);
        pendingProfit = Math.round(pendingProfit);

        const overallMargin = totalNetSale > 0 ? (totalProfit / totalNetSale) : 0.15;
        const recoveredDuesProfit = Math.round(recoveredDues * overallMargin);
        const grossRealizedProfit = Math.round(totalProfit - pendingProfit + recoveredDuesProfit);

        // Standard gross revenue formula matching backend/server.js
        const grossRevenue = totalSale + recoveredDues - newDuesAdded - expenses - totalDiscount - stockPaid - totalReturns;

        return NextResponse.json({
            totalSale,
            netSale: totalNetSale,
            discount: totalDiscount,
            grossNewDuesAdded,
            newDuesAdded,
            salesCashPaid,
            saleCount: sales.length,
            recoveredDues,
            expenses,
            stockPaid,
            totalReturns,
            cashRefunds,
            creditReturns,
            returnCount: returns.length,
            grossRevenue,
            totalCogs,
            totalProfit,
            pendingProfit,
            recoveredDuesProfit,
            grossRealizedProfit
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
