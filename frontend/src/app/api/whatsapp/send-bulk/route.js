import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({
        success: true,
        queued: 0,
        message: 'Bulk WhatsApp dispatch queue initialized.'
    });
}
