import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const supplierId = parseInt(id);

        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .eq('id', supplierId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const { id } = await params;
        const supplierId = parseInt(id);
        const body = await request.json();
        const { name, company_name, phone, address, opening_balance } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
        }

        // Fetch old supplier for opening balance delta calculation
        const { data: oldSupplier } = await supabase
            .from('suppliers')
            .select('opening_balance, balance')
            .eq('id', supplierId)
            .single();

        const oldOpening = parseFloat(oldSupplier?.opening_balance) || 0;
        const oldBalance = parseFloat(oldSupplier?.balance) || 0;
        const newOpening = opening_balance !== undefined ? (parseFloat(opening_balance) || 0) : oldOpening;
        const delta = newOpening - oldOpening;

        const updateData = {
            name: name.trim(),
            company_name: company_name ? company_name.trim() : null,
            phone: phone || null,
            address: address || null,
            opening_balance: newOpening,
            balance: oldBalance + delta
        };

        const { data, error } = await supabase
            .from('suppliers')
            .update(updateData)
            .eq('id', supplierId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        // If opening balance changed, sync supplier_ledger entry
        if (delta !== 0) {
            const { data: ledgerRows } = await supabase
                .from('supplier_ledger')
                .select('id')
                .eq('supplier_id', supplierId)
                .ilike('description', '%Opening%')
                .limit(1);

            if (ledgerRows && ledgerRows.length > 0) {
                if (newOpening !== 0) {
                    await supabase
                        .from('supplier_ledger')
                        .update({ amount: Math.abs(newOpening) })
                        .eq('id', ledgerRows[0].id);
                } else {
                    await supabase
                        .from('supplier_ledger')
                        .delete()
                        .eq('id', ledgerRows[0].id);
                }
            } else if (newOpening !== 0) {
                const { data: maxIdRow } = await supabase
                    .from('supplier_ledger')
                    .select('id')
                    .order('id', { ascending: false })
                    .limit(1);
                const nextId = (maxIdRow?.[0]?.id || 0) + 1;

                await supabase.from('supplier_ledger').insert([{
                    id: nextId,
                    uuid: crypto.randomUUID(),
                    supplier_id: supplierId,
                    amount: Math.abs(newOpening),
                    type: 'purchase',
                    description: 'Opening Balance',
                    created_at: new Date().toISOString()
                }]);
            }
        }

        return NextResponse.json({ success: true, message: 'Supplier updated successfully', supplier: data });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const supplierId = parseInt(id);

        const { data: supplier, error: fetchErr } = await supabase
            .from('suppliers')
            .select('id, name, balance')
            .eq('id', supplierId)
            .single();

        if (fetchErr || !supplier) {
            return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
        }

        const bal = Math.abs(Number(supplier.balance) || 0);
        if (bal > 0.01) {
            return NextResponse.json({
                error: `Cannot delete supplier "${supplier.name}" with pending balance of Rs. ${supplier.balance.toLocaleString()}. Outstanding balance must be exactly Rs. 0 before deletion to protect ledger history.`
            }, { status: 400 });
        }

        const { error } = await supabase
            .from('suppliers')
            .update({ is_deleted: 1 })
            .eq('id', supplierId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'Supplier deleted successfully (soft-deleted)' });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
