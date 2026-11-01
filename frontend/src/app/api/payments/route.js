import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '500')));

        const [paymentsRes, custsRes, suppsRes] = await Promise.all([
            supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(limit),
            supabase.from('customers').select('id, name, business_name, phone'),
            supabase.from('suppliers').select('id, name, company_name, phone')
        ]);

        if (paymentsRes.error) {
            return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
        }

        const custMap = Object.fromEntries((custsRes.data || []).map(c => [c.id, c]));
        const suppMap = Object.fromEntries((suppsRes.data || []).map(s => [s.id, s]));

        const enriched = (paymentsRes.data || []).map(p => {
            const isCust = p.party_type === 'customer';
            const party = isCust ? (custMap[p.party_id] || {}) : (suppMap[p.party_id] || {});
            return {
                ...p,
                party_name: party.name || '',
                party_business: isCust ? (party.business_name || '') : (party.company_name || ''),
                party_phone: party.phone || ''
            };
        });

        return NextResponse.json(enriched);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
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
