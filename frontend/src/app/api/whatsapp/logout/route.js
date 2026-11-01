import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({
        success: true,
        status: 'disconnected',
        message: 'WhatsApp session disconnected.'
    });
}
