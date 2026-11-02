import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function parseDateYMD(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        const m = d.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function getDateBoundaries(dateFilter, customStart, customEnd) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (dateFilter === 'today') {
        return { start: todayYMD, end: todayYMD };
    }
    if (dateFilter === 'yesterday') {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        const yestYMD = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
        return { start: yestYMD, end: yestYMD };
    }
    if (dateFilter === 'this_week') {
        const w = new Date(now);
        w.setDate(w.getDate() - 7);
        const weekAgoYMD = `${w.getFullYear()}-${pad(w.getMonth() + 1)}-${pad(w.getDate())}`;
        return { start: weekAgoYMD, end: todayYMD };
    }
    if (dateFilter === 'this_month') {
        const monthStartYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        return { start: monthStartYMD, end: todayYMD };
    }
    if (dateFilter === 'custom') {
        return {
            start: customStart || '2000-01-01',
            end: customEnd || todayYMD
        };
    }
    return null; // 'all'
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
        const offset = (page - 1) * limit;

        const dateFilter = searchParams.get('dateFilter') || 'today';
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const type = searchParams.get('type') || 'ALL';
        const paymentMethod = searchParams.get('paymentMethod') || 'ALL';
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        const bounds = getDateBoundaries(dateFilter, startDate, endDate);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        // Fetch sales with customers
        const [salesRes, paymentsRes, custsRes] = await Promise.all([
            supabase.from('sales').select('*, customers(id, name, business_name, phone, mobile)').not('customer_id', 'is', null).order('created_at', { ascending: false }),
            supabase.from('payments').select('*, customers(id, name, business_name, phone, mobile)').eq('party_type', 'customer').order('created_at', { ascending: false }),
            supabase.from('customers').select('id, balance').eq('is_deleted', 0)
        ]);

        const rawSales = salesRes.data || [];
        const rawPayments = paymentsRes.data || [];
        const allCusts = custsRes.data || [];

        const activeDebtorsCount = allCusts.filter(c => (c.balance || 0) > 0).length;

        // Transform into unified activity records
        const billRecords = rawSales.map(s => {
            const cust = s.customers || {};
            const itemDate = s.created_at || '';
            const ymd = parseDateYMD(itemDate);
            return {
                type: 'bill',
                id: `bill-${s.id}`,
                rawId: s.id,
                date: itemDate,
                ymd,
                ref_no: s.invoice_no || `INV-${s.id}`,
                customer_id: s.customer_id,
                party_name: cust.name || 'Wholesale Client',
                party_business: cust.business_name || '',
                party_phone: cust.phone || cust.mobile || '',
                payment_method: s.payment_method || 'credit',
                net_amount: parseFloat(s.net_amount) || 0,
                amount_paid: parseFloat(s.amount_paid) || 0,
                remaining_balance: parseFloat(s.remaining_balance) || 0,
                notes: s.remarks || (s.remaining_balance > 0 ? `Unpaid Due: Rs. ${Math.round(s.remaining_balance).toLocaleString()}` : 'Invoice Fully Cleared'),
                raw: {
                    ...s,
                    customer_name: cust.name,
                    customer_business: cust.business_name,
                    customer_phone: cust.phone || cust.mobile
                }
            };
        });

        const paymentRecords = rawPayments.map(p => {
            const cust = p.customers || {};
            const itemDate = p.payment_date || p.created_at || '';
            const ymd = parseDateYMD(itemDate);
            return {
                type: 'payment',
                id: `pay-${p.id}`,
                rawId: p.id,
                date: itemDate,
                ymd,
                ref_no: p.reference_no || `RCP-${String(p.id).padStart(5, '0')}`,
                customer_id: p.party_id,
                party_name: cust.name || 'Wholesale Client',
                party_business: cust.business_name || '',
                party_phone: cust.phone || cust.mobile || '',
                payment_method: p.payment_method || 'cash',
                net_amount: 0,
                amount_paid: parseFloat(p.amount) || 0,
                remaining_balance: 0,
                notes: p.notes || 'Customer ledger payment received',
                raw: {
                    ...p,
                    party_name: cust.name,
                    party_business: cust.business_name,
                    party_phone: cust.phone || cust.mobile
                }
            };
        });

        const allRecords = [...billRecords, ...paymentRecords].sort((a, b) => {
            const da = new Date(a.date).getTime() || 0;
            const db = new Date(b.date).getTime() || 0;
            return db - da;
        });

        // Compute today's daily activity count (always for tab badge on daily basis)
        const todayCount = allRecords.filter(r => r.ymd === todayYMD).length;

        // Apply filters
        const filtered = allRecords.filter(item => {
            if (bounds) {
                if (!item.ymd || item.ymd < bounds.start || item.ymd > bounds.end) {
                    return false;
                }
            }

            if (type && type !== 'ALL' && item.type !== type.toLowerCase()) {
                return false;
            }

            if (paymentMethod && paymentMethod !== 'ALL') {
                const meth = (item.payment_method || '').toLowerCase();
                if (meth !== paymentMethod.toLowerCase()) return false;
            }

            if (search) {
                const pName = (item.party_name || '').toLowerCase();
                const pBiz = (item.party_business || '').toLowerCase();
                const pPhone = (item.party_phone || '').toLowerCase();
                const ref = (item.ref_no || '').toLowerCase();
                const notes = (item.notes || '').toLowerCase();
                if (!pName.includes(search) && !pBiz.includes(search) && !pPhone.includes(search) && !ref.includes(search) && !notes.includes(search)) {
                    return false;
                }
            }

            return true;
        });

        // Metrics for the filtered period
        const periodBills = filtered.filter(r => r.type === 'bill');
        const periodPayments = filtered.filter(r => r.type === 'payment');

        const periodTotalBilled = periodBills.reduce((sum, b) => sum + b.net_amount, 0);
        const periodPaidAmount = filtered.reduce((sum, r) => sum + r.amount_paid, 0);
        const periodNewPendingDues = periodBills.reduce((sum, b) => sum + b.remaining_balance, 0);

        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const paginatedData = filtered.slice(offset, offset + limit);

        return NextResponse.json({
            data: paginatedData,
            pagination: {
                total,
                page,
                limit,
                totalPages
            },
            summary: {
                todayCount,
                totalFiltered: total,
                periodTotalBilled,
                periodPaidAmount,
                periodNewPendingDues,
                billsCount: periodBills.length,
                paymentsCount: periodPayments.length,
                activeDebtorsCount
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
