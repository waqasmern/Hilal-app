import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        // Fast-path: If local Express backend on port 5000 is available, query local SQLite directly (< 5ms)
        try {
            const localRes = await fetch(`http://localhost:5000/api/payments?${searchParams.toString()}`, {
                signal: AbortSignal.timeout(2000)
            });
            if (localRes.ok) {
                const data = await localRes.json();
                return NextResponse.json(data);
            }
        } catch {
            // Local backend not available, proceed to Supabase cloud
        }

        const isPaginated = searchParams.has('page') || searchParams.has('paginate') || (searchParams.has('limit') && searchParams.get('limit') !== '500');
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '25')));
        const offset = (page - 1) * limit;

        const partyType = searchParams.get('partyType') || 'ALL';
        const paymentMethod = searchParams.get('paymentMethod') || 'ALL';
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        let query = supabase.from('payments').select('*', { count: 'exact' });

        if (partyType && partyType !== 'ALL') {
            query = query.eq('party_type', partyType.toLowerCase());
        }
        if (paymentMethod && paymentMethod !== 'ALL') {
            query = query.ilike('payment_method', paymentMethod.toLowerCase());
        }

        query = query.order('created_at', { ascending: false });

        if (isPaginated) {
            query = query.range(offset, offset + limit - 1);
        } else {
            query = query.limit(limit);
        }

        const [paymentsRes, custsRes, suppsRes] = await Promise.all([
            query,
            supabase.from('customers').select('id, name, business_name, phone'),
            supabase.from('suppliers').select('id, name, company_name, phone')
        ]);

        if (paymentsRes.error) {
            return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
        }

        const custMap = Object.fromEntries((custsRes.data || []).map(c => [c.id, c]));
        const suppMap = Object.fromEntries((suppsRes.data || []).map(s => [s.id, s]));

        let enriched = (paymentsRes.data || []).map(p => {
            const isCust = p.party_type === 'customer';
            const party = isCust ? (custMap[p.party_id] || {}) : (suppMap[p.party_id] || {});
            return {
                ...p,
                party_name: party.name || '',
                party_business: isCust ? (party.business_name || '') : (party.company_name || ''),
                party_phone: party.phone || ''
            };
        });

        if (search) {
            enriched = enriched.filter(p =>
                (p.party_name && p.party_name.toLowerCase().includes(search)) ||
                (p.party_business && p.party_business.toLowerCase().includes(search)) ||
                (p.party_phone && p.party_phone.includes(search)) ||
                (p.reference_no && p.reference_no.toLowerCase().includes(search)) ||
                (p.notes && p.notes.toLowerCase().includes(search)) ||
                String(p.amount).includes(search)
            );
        }

        if (!isPaginated) {
            return NextResponse.json(enriched);
        }

        const total = paymentsRes.count || enriched.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        let customerAmount = 0;
        let supplierAmount = 0;
        let customerCount = 0;
        let supplierCount = 0;
        let cashAmount = 0;
        let bankAmount = 0;
        let onlineAmount = 0;
        let chequeAmount = 0;

        enriched.forEach(p => {
            const amt = Number(p.amount) || 0;
            const method = (p.payment_method || '').toLowerCase();
            if (p.party_type === 'customer') {
                customerAmount += amt;
                customerCount += 1;
            } else if (p.party_type === 'supplier') {
                supplierAmount += amt;
                supplierCount += 1;
            }

            if (method === 'cash') cashAmount += amt;
            else if (method === 'bank') bankAmount += amt;
            else if (method === 'easypaisa' || method === 'jazzcash') onlineAmount += amt;
            else if (method === 'cheque') chequeAmount += amt;
        });

        return NextResponse.json({
            data: enriched,
            pagination: {
                total,
                page,
                limit,
                totalPages
            },
            summary: {
                totalAmount: customerAmount + supplierAmount,
                customerAmount,
                supplierAmount,
                netCashFlow: customerAmount - supplierAmount,
                customerCount,
                supplierCount,
                cashAmount,
                bankAmount,
                onlineAmount,
                chequeAmount,
                totalCount: total
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();

        // Fast-path: If local Express backend on port 5000 is available, proxy write to SQLite directly
        try {
            const authHeader = request.headers.get('authorization') || '';
            const localRes = await fetch('http://localhost:5000/api/payments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(3000)
            });
            if (localRes.ok) {
                const data = await localRes.json();
                return NextResponse.json(data);
            }
        } catch {
            // Local backend not reachable, proceed to Supabase cloud
        }

        const { party_type, party_id, amount, payment_method, reference_no, notes, payment_date } = body;

        const numAmount = parseFloat(amount);
        const partyId = parseInt(party_id);

        if (!party_type || !partyId || !numAmount || numAmount <= 0) {
            return NextResponse.json({
                error: 'Party Type (customer/supplier), Party ID, and valid positive Amount are required'
            }, { status: 400 });
        }

        const paymentId = await getNextId('payments');
        const paymentUUID = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const payDate = payment_date || nowIso.slice(0, 10);
        const method = payment_method || 'cash';

        // 1. Insert Payment
        const { data: insertedPayment, error: payErr } = await supabase
            .from('payments')
            .insert([{
                id: paymentId,
                uuid: paymentUUID,
                party_type,
                party_id: partyId,
                amount: numAmount,
                payment_method: method,
                reference_no: reference_no || '',
                user_id: 1,
                device_id: 'DEVICE-CLOUD-01',
                payment_date: payDate,
                notes: notes || '',
                created_at: nowIso
            }])
            .select()
            .single();

        if (payErr) {
            return NextResponse.json({ error: payErr.message }, { status: 500 });
        }

        // 2. Customer or Supplier Ledger update & balance decrement
        if (party_type === 'customer') {
            const ledgerId = await getNextId('customer_ledger');
            await supabase.from('customer_ledger').insert([{
                id: ledgerId,
                uuid: crypto.randomUUID(),
                customer_id: partyId,
                payment_id: paymentId,
                amount: numAmount,
                type: 'payment',
                description: notes || `Payment Received (${method})`,
                payment_method: method,
                payment_date: payDate,
                created_at: nowIso
            }]);

            const { data: cust } = await supabase.from('customers').select('balance').eq('id', partyId).single();
            if (cust) {
                const newBalance = Number(cust.balance || 0) - numAmount;
                await supabase.from('customers').update({ balance: newBalance }).eq('id', partyId);
            }
        } else if (party_type === 'supplier') {
            const ledgerId = await getNextId('supplier_ledger');
            await supabase.from('supplier_ledger').insert([{
                id: ledgerId,
                uuid: crypto.randomUUID(),
                supplier_id: partyId,
                payment_id: paymentId,
                amount: numAmount,
                type: 'payment',
                description: notes || `Payment Made (${method})`,
                payment_date: payDate,
                created_at: nowIso
            }]);

            const { data: supp } = await supabase.from('suppliers').select('balance').eq('id', partyId).single();
            if (supp) {
                const newBalance = Number(supp.balance || 0) - numAmount;
                await supabase.from('suppliers').update({ balance: newBalance }).eq('id', partyId);
            }
        }

        // 3. Log Audit
        try {
            const auditId = await getNextId('audit_logs');
            await supabase.from('audit_logs').insert([{
                id: auditId,
                uuid: crypto.randomUUID(),
                user_id: 1,
                username: 'admin',
                action: 'CREATE_PAYMENT',
                entity_name: party_type,
                entity_id: String(partyId),
                details: `Amount: Rs. ${numAmount} (${method})`,
                created_at: nowIso
            }]);
        } catch (e) {
            console.warn('Audit log write note:', e.message);
        }

        return NextResponse.json({
            success: true,
            id: paymentId,
            paymentId,
            payment: insertedPayment
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
