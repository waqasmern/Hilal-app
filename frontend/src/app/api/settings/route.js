import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const settingsMap = {};
        (data || []).forEach(row => {
            settingsMap[row.key] = row.value;
        });

        return NextResponse.json(settingsMap);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const upsertData = Object.entries(body).map(([key, value]) => ({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
        }));

        if (upsertData.length > 0) {
            const { error } = await supabase
                .from('settings')
                .upsert(upsertData, { onConflict: 'key' });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
