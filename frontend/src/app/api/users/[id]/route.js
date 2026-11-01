import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function getNextId(tableName) {
    const { data } = await supabase.from(tableName).select('id').order('id', { ascending: false }).limit(1);
    return (data?.[0]?.id || 0) + 1;
}

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (!userId) {
            return NextResponse.json({ error: 'Valid user ID required' }, { status: 400 });
        }

        if (userId === 1) {
            return NextResponse.json({ error: 'Cannot deactivate master admin account' }, { status: 400 });
        }

        const { data: user } = await supabase.from('users').select('username').eq('id', userId).single();
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const { error } = await supabase
            .from('users')
            .update({ is_deleted: 1 })
            .eq('id', userId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Log Audit
        try {
            const auditId = await getNextId('audit_logs');
            await supabase.from('audit_logs').insert([{
                id: auditId,
                uuid: crypto.randomUUID(),
                user_id: 1,
                username: 'admin',
                action: 'DELETE_USER',
                entity_name: 'users',
                entity_id: String(userId),
                details: `Deactivated user account: ${user.username}`,
                created_at: new Date().toISOString()
            }]);
        } catch (e) {
            console.warn('Audit note:', e.message);
        }

        return NextResponse.json({ success: true, message: `User ${user.username} deactivated` });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
