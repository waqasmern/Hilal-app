import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        status: 'counter_daemon',
        connected: false,
        qrCode: null,
        message: 'WhatsApp background service is managed by the Counter Desktop application.'
    });
}
