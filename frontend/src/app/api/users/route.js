import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, uuid, username, role, full_name, phone, created_at')
            .eq('is_deleted', 0)
            .order('id', { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data || []);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, password, role, full_name, phone } = body;

        if (!username || !password || !role) {
            return NextResponse.json({ error: 'Username, password, and role (admin/cashier) required' }, { status: 400 });
        }

        const cleanUsername = username.trim().toLowerCase();

        // Check if username already exists
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', cleanUsername)
            .eq('is_deleted', 0)
            .single();

        if (existing) {
            return NextResponse.json({ error: `Username "${cleanUsername}" is already taken` }, { status: 400 });
        }

        const nextId = await getNextId('users');
        const nowIso = new Date().toISOString();
        const userUuid = crypto.randomUUID();

        const newUser = {
            id: nextId,
            uuid: userUuid,
            username: cleanUsername,
            password: String(password),
            role: role.toLowerCase(),
            full_name: full_name ? full_name.trim() : '',
            phone: phone ? phone.trim() : '',
            is_deleted: 0,
            created_at: nowIso
        };

        const { data, error } = await supabase
            .from('users')
            .insert([newUser])
            .select('id, uuid, username, role, full_name, phone, created_at')
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
                action: 'CREATE_USER',
                entity_name: 'users',
                entity_id: String(data.id),
                details: `Created ${data.role} user: ${data.username}`,
                created_at: nowIso
            }]);
        } catch (e) {
            console.warn('Audit note:', e.message);
        }

        return NextResponse.json({ success: true, ...data });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
