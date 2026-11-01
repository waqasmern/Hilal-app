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
        const { name, company_name, phone, address } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
        }

        const updateData = {
            name: name.trim(),
            company_name: company_name ? company_name.trim() : null,
            phone: phone || null,
            address: address || null
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
