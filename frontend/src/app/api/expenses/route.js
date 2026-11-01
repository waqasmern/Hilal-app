import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hilal_wholesaler_secret_key_2026';

function getUserFromReq(request) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return { id: 1, username: 'admin' };
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return { id: 1, username: 'admin' };
    }
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data || []);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = getUserFromReq(request);
        const body = await request.json();
        const { category, amount, description, payment_method } = body;

        if (!amount || !description) {
            return NextResponse.json({ error: 'Amount and description required' }, { status: 400 });
        }

        const now = new Date();
        const expenseDate = now.toISOString().slice(0, 10);

        const newExpense = {
            uuid: crypto.randomUUID(),
            category: category || 'Other',
            amount: parseFloat(amount) || 0,
            description: description.trim(),
            payment_method: payment_method || 'cash',
            expense_date: expenseDate,
            user_id: user.id || 1,
            created_at: now.toISOString()
        };

        const { data, error } = await supabase
            .from('expenses')
            .insert([newExpense])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
