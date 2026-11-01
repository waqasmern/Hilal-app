import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const customerId = parseInt(id);
        const body = await request.json();
        const { amount, payment_method, reference_no, notes, payment_date } = body;
        const payAmount = parseFloat(amount);

        if (!payAmount || payAmount <= 0) {
            return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 });
        }

        // 1. Fetch customer
        const { data: customer, error: cErr } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

        if (cErr || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // 2. Fetch unpaid sales in FIFO order
        const { data: unpaidSales } = await supabase
            .from('sales')
            .select('*')
            .eq('customer_id', customerId)
            .gt('remaining_balance', 0)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });

        let remainingPayment = payAmount;
        const settledBills = [];

        for (const sale of (unpaidSales || [])) {
            if (remainingPayment <= 0) break;
            const payTowardsBill = Math.min(Number(sale.remaining_balance) || 0, remainingPayment);
            remainingPayment -= payTowardsBill;

            const newPaid = (Number(sale.amount_paid) || 0) + payTowardsBill;
            const newRem = Math.max(0, (Number(sale.remaining_balance) || 0) - payTowardsBill);
            const newStatus = newRem <= 0.01 ? 'paid' : 'partial';

            await supabase
                .from('sales')
                .update({
                    amount_paid: newPaid,
                    remaining_balance: newRem,
                    payment_status: newStatus
                })
                .eq('id', sale.id);

            settledBills.push({
                sale_id: sale.id,
                invoice_no: sale.invoice_no,
                allocated_amount: payTowardsBill,
                new_balance: newRem
            });
        }

        const nowIso = new Date().toISOString();
        const nowDate = payment_date || nowIso.split('T')[0];
        const finalRef = reference_no || (settledBills.length === 1 ? settledBills[0].invoice_no : (settledBills.length > 1 ? settledBills.map(b => b.invoice_no).join(', ') : 'FIFO-PAY'));

        // 3. Insert Payment record
        const nextPaymentId = await getNextId('payments');
        const { data: paymentRecord } = await supabase
            .from('payments')
            .insert([{
                id: nextPaymentId,
                uuid: crypto.randomUUID(),
                party_type: 'customer',
                party_id: customerId,
                amount: payAmount,
                payment_method: payment_method || 'cash',
                reference_no: finalRef,
                user_id: 1,
                device_id: 'CLOUD-WEB-01',
                payment_date: nowDate,
                notes: notes || `FIFO Payment across ${settledBills.length} sale invoice(s)`,
                created_at: nowIso
            }])
            .select()
            .single();

        // 4. Insert Customer Ledger entry
        const nextLedgerId = await getNextId('customer_ledger');
        await supabase
            .from('customer_ledger')
            .insert([{
                id: nextLedgerId,
                uuid: crypto.randomUUID(),
                customer_id: customerId,
                sale_id: settledBills.length === 1 ? settledBills[0].sale_id : null,
                payment_id: paymentRecord?.id || nextPaymentId,
                amount: payAmount,
                type: 'payment',
                description: notes || `FIFO Payment (${payment_method || 'cash'})${finalRef ? ' Ref: ' + finalRef : ''}`,
                payment_method: payment_method || 'cash',
                payment_date: nowDate,
                created_at: nowIso
            }]);

        // 5. Update customer balance
        const newCustomerBal = (Number(customer.balance) || 0) - payAmount;
        await supabase
            .from('customers')
            .update({ balance: newCustomerBal })
            .eq('id', customerId);

        return NextResponse.json({
            success: true,
            settledBills,
            remainingPaymentUnallocated: remainingPayment,
            newBalance: newCustomerBal
        });
    } catch (err) {
        console.error('pay-fifo error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
