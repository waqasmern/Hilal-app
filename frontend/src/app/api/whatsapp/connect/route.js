import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({
        success: true,
        status: 'counter_daemon',
        message: 'WhatsApp Baileys socket is hosted on the Counter Desktop application. Please scan QR on the counter terminal.'
    });
}
