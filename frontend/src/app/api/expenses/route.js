import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
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
        const body = await request.json();
        const { category, amount, description, payment_method, expense_date } = body;

        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount <= 0 || !description || !description.trim()) {
            return NextResponse.json({ error: 'Valid positive amount and description are required' }, { status: 400 });
        }

        const nextId = await getNextId('expenses');
        const now = new Date();
        const nowIso = now.toISOString();
        const dateStr = expense_date || nowIso.slice(0, 10);

        const newExpense = {
            id: nextId,
            uuid: crypto.randomUUID(),
            category: category || 'Other',
            amount: numAmount,
            description: description.trim(),
            payment_method: payment_method || 'cash',
            expense_date: dateStr,
            user_id: 1,
            created_at: nowIso
        };

        const { data, error } = await supabase
            .from('expenses')
            .insert([newExpense])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Log Audit
        try {
            const auditId = await getNextId('audit_logs');
            await supabase.from('audit_logs').insert([{
                id: auditId,
                uuid: crypto.randomUUID(),
                user_id: 1,
                username: 'admin',
                action: 'CREATE_EXPENSE',
                entity_name: 'expenses',
                entity_id: String(data.id),
                details: `${category || 'Other'}: Rs. ${numAmount} - ${description.trim()}`,
                created_at: nowIso
            }]);
        } catch (e) {
            console.warn('Audit note:', e.message);
        }

        return NextResponse.json({ success: true, id: data.id, ...data });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
