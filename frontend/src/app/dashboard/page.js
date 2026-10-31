'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/pos');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-sm font-semibold text-gray-500">
                Redirecting to POS Register...
            </div>
        </div>
    );
}
