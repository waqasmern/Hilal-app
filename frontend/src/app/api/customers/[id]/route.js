import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const customerId = parseInt(id);

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const { id } = await params;
        const customerId = parseInt(id);
        const body = await request.json();
        const { name, business_name, phone, mobile, address, cnic_ntn, credit_limit, opening_balance } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
        }

        // Fetch old customer for opening balance delta calculation
        const { data: oldCustomer } = await supabase
            .from('customers')
            .select('opening_balance, balance')
            .eq('id', customerId)
            .single();

        const oldOpening = parseFloat(oldCustomer?.opening_balance) || 0;
        const oldBalance = parseFloat(oldCustomer?.balance) || 0;
        const newOpening = opening_balance !== undefined ? (parseFloat(opening_balance) || 0) : oldOpening;
        const delta = newOpening - oldOpening;

        const updateData = {
            name: name.trim(),
            business_name: business_name ? business_name.trim() : null,
            phone: phone || null,
            mobile: mobile || null,
            address: address || null,
            cnic_ntn: cnic_ntn || null,
            credit_limit: parseFloat(credit_limit) || 0,
            opening_balance: newOpening,
            balance: oldBalance + delta
        };

        const { data, error } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', customerId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        // If opening balance changed, sync customer_ledger entry
        if (delta !== 0) {
            const { data: ledgerRows } = await supabase
                .from('customer_ledger')
                .select('id')
                .eq('customer_id', customerId)
                .ilike('description', '%Opening%')
                .limit(1);

            if (ledgerRows && ledgerRows.length > 0) {
                if (newOpening !== 0) {
                    await supabase
                        .from('customer_ledger')
                        .update({ amount: Math.abs(newOpening) })
                        .eq('id', ledgerRows[0].id);
                } else {
                    await supabase
                        .from('customer_ledger')
                        .delete()
                        .eq('id', ledgerRows[0].id);
                }
            } else if (newOpening !== 0) {
                const { data: maxIdRow } = await supabase
                    .from('customer_ledger')
                    .select('id')
                    .order('id', { ascending: false })
                    .limit(1);
                const nextId = (maxIdRow?.[0]?.id || 0) + 1;

                await supabase.from('customer_ledger').insert([{
                    id: nextId,
                    uuid: crypto.randomUUID(),
                    customer_id: customerId,
                    amount: Math.abs(newOpening),
                    type: 'charge',
                    description: 'Opening Balance',
                    created_at: new Date().toISOString()
                }]);
            }
        }

        return NextResponse.json({ success: true, message: 'Customer updated successfully', customer: data });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const customerId = parseInt(id);

        const { data: customer, error: fetchErr } = await supabase
            .from('customers')
            .select('id, name, balance')
            .eq('id', customerId)
            .single();

        if (fetchErr || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('customers')
            .update({ is_deleted: 1 })
            .eq('id', customerId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'Customer soft-deleted successfully' });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
