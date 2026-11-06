'use client';
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setNetworkStatus, setPendingCount, setSyncing, toggleSidebar } from '../../store';
import { IconSpinner, IconWifi, IconWifiOff, IconRefresh, IconMenu } from './Icons';

export default function Navbar() {
    const dispatch = useDispatch();
    const { isOnline, isSyncing, pendingCount } = useSelector(state => state.sync);
    const settings = useSelector(state => state.settings);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handleOnline = () => dispatch(setNetworkStatus(true));
        const handleOffline = () => dispatch(setNetworkStatus(false));

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const checkSyncStatus = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/sync/status');
                if (res.ok) {
                    const data = await res.json();
                    dispatch(setPendingCount(Number(data.pending || data.pendingOrders || 0)));
                }
            } catch (err) {
                // Ignore backend fetch error
            }
        };

        checkSyncStatus();
        const interval = setInterval(checkSyncStatus, 4000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [dispatch]);

    const [syncSuccess, setSyncSuccess] = useState(false);

    const handleSyncNow = async () => {
        dispatch(setSyncing(true));
        setSyncSuccess(false);
        try {
            const res = await fetch('http://localhost:5000/api/sync/trigger', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setSyncSuccess(true);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('app:synced', { detail: data }));
                    // Automatically reload after 400ms so new changes appear on screen without manual refresh!
                    setTimeout(() => {
                        window.location.reload();
                    }, 400);
                }
            }
        } catch (err) {
            console.error('Manual sync failed:', err);
        } finally {
            setTimeout(() => dispatch(setSyncing(false)), 1000);
        }
    };

    return (
        <header className="h-16 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
            {/* Left: Mobile Hamburger & Brand */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                    type="button"
                    onClick={() => dispatch(toggleSidebar())}
                    className="md:hidden p-2 rounded-xl text-gray-700 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 shadow-2xs shrink-0"
                    aria-label="Toggle Navigation Menu"
                    title="Menu"
                >
                    <IconMenu className="w-5 h-5 text-gray-800" />
                </button>

                {mounted && settings?.shop_logo ? (
                    <img 
                        src={settings.shop_logo} 
                        alt={settings.shop_name || 'Shop Logo'} 
                        className="w-10 h-10 rounded-xl object-contain border border-blue-200 bg-white shadow-xs p-0.5 shrink-0" 
                    />
                ) : (
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-700 to-[#0B3B7B] flex flex-col items-center justify-center text-white shadow-xs shrink-0 border border-blue-400/40 p-1">
                        <span className="text-[8px] font-black tracking-tighter leading-none">HILAL</span>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.7 2.84-7.228a1.125 1.125 0 00-.97-1.472H5.106M7.5 14.25l-.893-3.351M16.5 19.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-7.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                        </svg>
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="font-black text-[#0B3B7B] leading-tight text-base sm:text-xl truncate tracking-tight uppercase">
                        {(mounted ? settings?.shop_name : null) || 'Hilal Wholesaler Shop'}
                    </h1>
                    <p className="text-[11px] sm:text-xs text-[#3B5B82] font-bold tracking-wide truncate hidden sm:block">
                        {(mounted ? (settings?.shop_tagline || settings?.shop_subtitle) : null) || 'Wholesale & Retail Distribution'}
                    </p>
                </div>
            </div>

            {/* Right: Network status badge & Contact info */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Online / Offline status */}
                {isSyncing ? (
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl text-xs font-bold text-amber-700 shadow-2xs">
                        <IconSpinner className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                        <span>Syncing...</span>
                    </div>
                ) : isOnline ? (
                    <div className="flex items-center gap-1.5 bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-xl text-xs font-bold text-[#059669] shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                        <span>Online</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl text-xs font-bold text-rose-700 shadow-2xs">
                        <IconWifiOff className="w-3.5 h-3.5 text-rose-600" />
                        <span>Offline</span>
                    </div>
                )}

                {/* Pending Orders Count Badge */}
                <div className="hidden sm:flex items-center bg-white border border-gray-200 px-2.5 py-1 rounded-xl text-xs font-bold text-gray-700 shadow-2xs">
                    Pending: <span className="ml-1 text-gray-900 font-mono">{pendingCount}</span>
                </div>

                {/* Sync Now Button in warm amber pill */}
                <button 
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Sync with cloud"
                >
                    <IconRefresh className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : syncSuccess ? '✓ Synced!' : 'Sync Now'}</span>
                </button>

                {/* Contact phone on the right (Address removed per request) */}
                {settings?.shop_phone && (
                    <div className="hidden lg:flex items-center text-right text-xs font-bold text-[#0B3B7B] leading-tight pl-2 border-l border-gray-200">
                        <span className="flex items-center justify-end gap-1.5">
                            <svg className="w-3.5 h-3.5 text-[#0B3B7B] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
                            </svg>
                            <span className="font-mono">{settings.shop_phone}</span>
                        </span>
                    </div>
                )}
            </div>
        </header>
    );
}
