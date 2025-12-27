import { NextResponse } from 'next/server';

/**
 * Health check endpoint
 * Used to verify the companion app is running
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'companion-redirect-app',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}

// Export runtime config for Edge
export const runtime = 'edge';

