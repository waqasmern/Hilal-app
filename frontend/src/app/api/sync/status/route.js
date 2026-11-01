import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { count: pendingOrders } = await supabase
            .from('sales')
            .select('*', { count: 'exact', head: true })
            .or('status.eq.pending,status.eq.PENDING');

        const { data: latestEvent } = await supabase
            .from('ingested_sync_events')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);

        return NextResponse.json({
            success: true,
            total: 0,
            pending: pendingOrders || 0,
            syncing: 0,
            synced: 0,
            failed: 0,
            lastSyncAt: latestEvent?.[0]?.created_at || new Date().toISOString()
        });
    } catch (err) {
        return NextResponse.json({
            success: true,
            total: 0,
            pending: 0,
            syncing: 0,
            synced: 0,
            failed: 0,
            lastSyncAt: new Date().toISOString()
        });
    }
}
