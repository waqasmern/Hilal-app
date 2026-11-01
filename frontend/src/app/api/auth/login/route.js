import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'hilal_wholesaler_secret_key_2026';

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('is_deleted', 0)
            .maybeSingle();

        if (error || !user) {
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        if (user.password !== password) {
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        const payload = {
            id: user.id,
            uuid: user.uuid,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        return NextResponse.json({ token, user: payload });
    } catch (err) {
        console.error('Login error:', err);
        return NextResponse.json({ error: err.message || 'Authentication error' }, { status: 500 });
    }
}
