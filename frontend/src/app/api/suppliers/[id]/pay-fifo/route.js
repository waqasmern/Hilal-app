import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function POST(request, { params }) {
    try {
        const { id } = await params;
        const supplierId = parseInt(id);
        const body = await request.json();
        const { amount, payment_method, reference_no, notes, payment_date } = body;
        const payAmount = parseFloat(amount);

        if (!payAmount || payAmount <= 0) {
            return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 });
        }

        // 1. Fetch supplier
        const { data: supplier, error: sErr } = await supabase
            .from('suppliers')
            .select('*')
            .eq('id', supplierId)
            .single();

        if (sErr || !supplier) {
            return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
        }

        // 2. Fetch unpaid purchases in FIFO order
        const { data: unpaidPurchases } = await supabase
            .from('purchases')
            .select('*')
            .eq('supplier_id', supplierId)
            .gt('remaining_balance', 0)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });

        let remainingPayment = payAmount;
        const settledBills = [];

        for (const bill of (unpaidPurchases || [])) {
            if (remainingPayment <= 0) break;
            const payTowardsBill = Math.min(Number(bill.remaining_balance) || 0, remainingPayment);
            remainingPayment -= payTowardsBill;

            const newPaid = (Number(bill.amount_paid) || 0) + payTowardsBill;
            const newRem = Math.max(0, (Number(bill.remaining_balance) || 0) - payTowardsBill);
            const newStatus = newRem <= 0.01 ? 'completed' : 'partial';

            await supabase
                .from('purchases')
                .update({
                    amount_paid: newPaid,
                    remaining_balance: newRem,
                    status: newStatus
                })
                .eq('id', bill.id);

            settledBills.push({
                purchase_id: bill.id,
                invoice_no: bill.supplier_invoice_no,
                allocated_amount: payTowardsBill,
                new_balance: newRem
            });
        }

        const nowIso = new Date().toISOString();
        const nowDate = payment_date || nowIso.split('T')[0];
        const finalRef = reference_no || (settledBills.length === 1 ? settledBills[0].invoice_no : (settledBills.length > 1 ? settledBills.map(b => b.invoice_no).join(', ') : 'FIFO-SUPP-PAY'));

        // 3. Insert Payment record
        const nextPaymentId = await getNextId('payments');
        const { data: paymentRecord } = await supabase
            .from('payments')
            .insert([{
                id: nextPaymentId,
                uuid: crypto.randomUUID(),
                party_type: 'supplier',
                party_id: supplierId,
                amount: payAmount,
                payment_method: payment_method || 'cash',
                reference_no: finalRef,
                user_id: 1,
                device_id: 'CLOUD-WEB-01',
                payment_date: nowDate,
                notes: notes || `FIFO Payment across ${settledBills.length} purchase bill(s)`,
                created_at: nowIso
            }])
            .select()
            .single();

        // 4. Insert Supplier Ledger entry
        const nextLedgerId = await getNextId('supplier_ledger');
        await supabase
            .from('supplier_ledger')
            .insert([{
                id: nextLedgerId,
                uuid: crypto.randomUUID(),
                supplier_id: supplierId,
                purchase_id: settledBills.length === 1 ? settledBills[0].purchase_id : null,
                payment_id: paymentRecord?.id || nextPaymentId,
                amount: payAmount,
                type: 'payment',
                description: notes || `FIFO Payment (${payment_method || 'cash'})${finalRef ? ' Ref: ' + finalRef : ''}`,
                payment_date: nowDate,
                created_at: nowIso
            }]);

        // 5. Update supplier balance
        const newSupplierBal = (Number(supplier.balance) || 0) - payAmount;
        await supabase
            .from('suppliers')
            .update({ balance: newSupplierBal })
            .eq('id', supplierId);

        return NextResponse.json({
            success: true,
            settledBills,
            remainingPaymentUnallocated: remainingPayment,
            newBalance: newSupplierBal
        });
    } catch (err) {
        console.error('supplier pay-fifo error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
