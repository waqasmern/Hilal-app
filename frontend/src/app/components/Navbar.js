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
                    dispatch(setPendingCount(data.pending || 0));
                }
            } catch (err) {
                // Ignore backend fetch error
            }
        };

        checkSyncStatus();
        const interval = setInterval(checkSyncStatus, 10000);

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
                dispatch(setPendingCount(data.failed || 0));
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
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain border border-gray-200 bg-white shadow-xs p-0.5 shrink-0" 
                    />
                ) : (
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl gold-gradient flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-xs shrink-0">
                        {((mounted ? settings?.shop_name : null) || 'Hilal').charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="font-bold text-gray-900 leading-tight text-sm sm:text-lg truncate">
                        {(mounted ? settings?.shop_name : null) || 'Hilal Wholesaler Shop'}
                    </h1>
                    <p className="text-[10px] sm:text-xs text-[#B8860B] font-semibold tracking-wide truncate hidden sm:block">
                        Inventory + POS + Ledger &amp; Accounting
                    </p>
                </div>
            </div>

            {/* Right: Network status badge & Profile */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {/* Sync Badge */}
                <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 border border-gray-200 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium">
                    {isSyncing ? (
                        <span className="flex items-center gap-1 sm:gap-1.5 text-amber-700 font-bold">
                            <IconSpinner className="w-3.5 h-3.5 text-amber-600" />
                            <span className="hidden sm:inline">Syncing...</span>
                        </span>
                    ) : isOnline ? (
                        <span className="flex items-center gap-1 sm:gap-1.5 text-emerald-700 font-bold">
                            <IconWifi className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Online</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 sm:gap-1.5 text-rose-700 font-bold">
                            <IconWifiOff className="w-3.5 h-3.5 text-rose-600" />
                            <span className="hidden sm:inline">Offline</span>
                        </span>
                    )}

                    <span className="text-gray-400 hidden sm:inline">|</span>
                    <span className="text-gray-600 font-semibold hidden sm:inline">Pending: {pendingCount}</span>

                    <button 
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                        className="ml-0.5 sm:ml-1 text-[11px] sm:text-xs font-bold text-[#B8860B] hover:text-[#AA7C11] underline disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                        title="Sync with cloud"
                    >
                        <IconRefresh className={`w-3 h-3 inline ${isSyncing ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">
                            {isSyncing ? 'Syncing...' : syncSuccess ? '✓ Synced!' : 'Sync Now'}
                        </span>
                    </button>
                </div>
            </div>
        </header>
    );
}
