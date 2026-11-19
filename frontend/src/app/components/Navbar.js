'use client';
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toggleSidebar } from '../../store';
import { IconMenu } from './Icons';

export default function Navbar() {
    const dispatch = useDispatch();
    const settings = useSelector(state => state.settings);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <header className="h-16 bg-white border-b border-gray-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
            {/* Left: Mobile Hamburger & Brand */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                    onClick={() => dispatch(toggleSidebar())}
                    className="lg:hidden p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    aria-label="Toggle Navigation"
                >
                    <IconMenu className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                    {settings?.shop_logo ? (
                        <img 
                            src={settings.shop_logo} 
                            alt={settings?.shop_name || "Hilal Foods"} 
                            className="w-full h-full object-contain p-1"
                        />
                    ) : (
                        <span className="font-black text-[#0B3B7B] text-xs">
                            {settings?.shop_name ? settings.shop_name.slice(0, 3).toUpperCase() : 'HFS'}
                        </span>
                    )}
                </div>
                <div className="min-w-0">
                    <h1 className="text-base sm:text-lg font-black text-[#0B3B7B] tracking-tight leading-tight uppercase truncate">
                        {settings?.shop_name || 'Hilal Foods Solutions'}
                    </h1>
                    <p className="text-[11px] font-bold text-gray-400 tracking-wider hidden sm:block truncate">
                        Wholesale & Retail Distribution
                    </p>
                </div>
            </div>

            {/* Right: Contact phone */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {settings?.shop_phone && (
                    <div className="flex items-center text-right text-xs font-bold text-[#0B3B7B] leading-tight pl-2">
                        <span className="flex items-center justify-end gap-1.5 bg-blue-50 border border-blue-200/60 px-3 py-1.5 rounded-xl">
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
