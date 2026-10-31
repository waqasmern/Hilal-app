'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';

export default function Home() {
    const router = useRouter();
    const settings = useSelector(state => state.settings);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            router.replace('/login');
        } else {
            router.replace('/pos');
        }
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center text-gray-500 font-medium">
                Loading {(mounted ? settings?.shop_name : null) || 'Wholesaler System'}...
            </div>
        </div>
    );
}
