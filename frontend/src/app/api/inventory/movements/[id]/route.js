import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const variantId = parseInt(id);

        const [movementsRes, pkgTypesRes, usersRes] = await Promise.all([
            supabase
                .from('stock_movements')
                .select('*')
                .eq('variant_id', variantId)
                .order('created_at', { ascending: false }),
            supabase.from('packaging_types').select('id, name'),
            supabase.from('users').select('id, username')
        ]);

        if (movementsRes.error) {
            console.error('Error fetching stock movements:', movementsRes.error);
            return NextResponse.json({ error: movementsRes.error.message }, { status: 500 });
        }

        const pkgTypeMap = Object.fromEntries((pkgTypesRes.data || []).map(p => [p.id, p.name]));
        const userMap = Object.fromEntries((usersRes.data || []).map(u => [u.id, u.username]));

        const movements = (movementsRes.data || []).map(m => ({
            ...m,
            packaging_name: pkgTypeMap[m.packaging_type_id] || 'Units',
            username: userMap[m.user_id] || 'Admin'
        }));

        return NextResponse.json(movements);
    } catch (err) {
        console.error('API /api/inventory/movements error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
