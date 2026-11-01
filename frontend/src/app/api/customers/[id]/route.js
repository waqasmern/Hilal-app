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
        const { name, business_name, phone, mobile, address, cnic_ntn, credit_limit } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
        }

        const updateData = {
            name: name.trim(),
            business_name: business_name ? business_name.trim() : null,
            phone: phone || null,
            mobile: mobile || null,
            address: address || null,
            cnic_ntn: cnic_ntn || null,
            credit_limit: parseFloat(credit_limit) || 0
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
