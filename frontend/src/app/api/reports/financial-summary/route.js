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
            grossRevenue
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
