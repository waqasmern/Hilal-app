'use client';
import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { logout, closeSidebar } from '../../store';
import {
    IconPOS, IconProducts, IconInventory,
    IconPurchases, IconSales, IconCustomers, IconSuppliers,
    IconPayments, IconExpenses, IconReports,
    IconSync, IconUsersAudit, IconSettings, IconLogout, IconX
} from './Icons';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const dispatch = useDispatch();
    const { user } = useSelector(state => state.auth);
    const { isSidebarOpen } = useSelector(state => state.ui || { isSidebarOpen: false });
    const settings = useSelector(state => state.settings);
    const role = user?.role || 'admin';

    // Auto-close mobile drawer on route change
    useEffect(() => {
        dispatch(closeSidebar());
    }, [pathname, dispatch]);

    // Close on Escape key press
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isSidebarOpen) {
                dispatch(closeSidebar());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSidebarOpen, dispatch]);

    // Prevent body scrolling when mobile drawer is open
    useEffect(() => {
        if (isSidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isSidebarOpen]);

    const adminNavItems = [
        { label: 'POS', href: '/pos', icon: IconPOS },
        { label: 'Sales', href: '/sales', icon: IconSales },
        { label: 'Inventory', href: '/inventory', icon: IconInventory },
        { label: 'Categories', href: '/products', icon: IconProducts },
        { label: 'Purchases', href: '/purchases', icon: IconPurchases },
        { label: 'Customers', href: '/customers', icon: IconCustomers },
        { label: 'Supplier', href: '/suppliers', icon: IconSuppliers },
        { label: 'Payments', href: '/payments', icon: IconPayments },
        { label: 'Expenses', href: '/expenses', icon: IconExpenses },
        { label: 'Reports', href: '/reports', icon: IconReports },
        { label: 'Sync', href: '/sync', icon: IconSync },
        { label: 'Users & Audit', href: '/users', icon: IconUsersAudit },
        { label: 'Settings', href: '/settings', icon: IconSettings },
    ];

    const cashierNavItems = [
        { label: 'POS', href: '/pos', icon: IconPOS },
        { label: 'Sales', href: '/sales', icon: IconSales },
        { label: 'Inventory', href: '/inventory', icon: IconInventory },
        { label: 'Customers', href: '/customers', icon: IconCustomers },
        { label: 'Payments', href: '/payments', icon: IconPayments },
    ];

    const items = role === 'admin' ? adminNavItems : cashierNavItems;

    const isItemActive = (href) => {
        if (!pathname) return false;
        const normPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
        const normHref = href.endsWith('/') && href.length > 1 ? href.slice(0, -1) : href;
        if (normPath === normHref) return true;
        if (normHref !== '/' && normPath.startsWith(normHref + '/')) return true;
        return false;
    };

    const handleLogout = () => {
        dispatch(logout());
        router.push('/login');
    };

    return (
        <>
            {/* Desktop Fixed Sidebar (md and above) */}
            <aside className="hidden md:block w-36 shrink-0 select-none">
                <div className="fixed top-16 left-0 bottom-0 w-36 bg-white border-r border-gray-200 flex flex-col justify-between z-20 shadow-xs">
                    <div className="p-2 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
                        {/* Top Profile Card per Client Image */}
                        <div className="flex items-center gap-2 p-1.5 mb-2 rounded-xl bg-blue-50/40 border border-blue-100/70">
                            <div className="w-7 h-7 rounded-full bg-[#0B3B7B] text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-black text-gray-900 truncate leading-tight uppercase">
                                    {user?.username || 'ADMIN'}
                                </div>
                                <div className="text-[9px] font-semibold text-gray-500 truncate leading-none capitalize">
                                    {role === 'admin' ? 'Administrator' : 'Cashier'}
                                </div>
                            </div>
                        </div>

                        {items.map((item) => {
                            const isActive = isItemActive(item.href);
                            const IconComponent = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`sidebar-link flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all duration-150 group ${isActive
                                        ? 'active !bg-[#0B3B7B] !text-white shadow-xs font-bold border border-[#072B5C]'
                                        : 'text-[#1E293B] hover:bg-blue-50/70 hover:text-[#0B3B7B] border border-transparent font-semibold'
                                        }`}
                                    data-active={isActive ? "true" : "false"}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <IconComponent className={`w-4 h-4 shrink-0 transition-colors ${isActive ? '!text-white' : 'text-[#1E40AF] group-hover:text-[#0B3B7B]'
                                            }`} />
                                        <span className={`truncate text-xs ${isActive ? '!text-white font-bold' : ''}`}>
                                            {item.label}
                                        </span>
                                    </div>
                                    {isActive && (
                                        <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                    )}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Desktop Bottom Section: System info & Logout */}
                    <div className="p-2 border-t border-gray-200 bg-white shrink-0 space-y-1">
                        <div className="flex items-center justify-between p-1 rounded-lg">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <IconSettings className="w-4 h-4 text-[#0B3B7B] shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-[#0B3B7B] leading-tight">System</div>
                                    <div className="text-[9px] font-medium text-gray-400 leading-none">v1.0.0</div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleLogout}
                                className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer shrink-0"
                                title="Logout"
                            >
                                <IconLogout className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile Off-Canvas Drawer Backdrop (< md) */}
            <div
                className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300 md:hidden ${
                    isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={() => dispatch(closeSidebar())}
                aria-hidden="true"
            />

            {/* Mobile Off-Canvas Drawer (< md) */}
            <div
                className={`fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-in-out md:hidden ${
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation Menu"
            >
                {/* Mobile Drawer Header */}
                <div className="p-3.5 border-b border-gray-200 flex items-center justify-between bg-blue-50/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {settings?.shop_logo ? (
                            <img
                                src={settings.shop_logo}
                                alt={settings.shop_name || 'Shop Logo'}
                                className="w-9 h-9 rounded-xl object-contain border border-gray-200 bg-white shadow-xs p-0.5 shrink-0"
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-xl bg-[#0B3B7B] flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0">
                                {(settings?.shop_name || 'H').charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-bold text-[#0B3B7B] text-sm truncate leading-tight uppercase">
                                {settings?.shop_name || 'Hilal Foods'}
                            </h2>
                            <p className="text-[10px] text-[#3B5B82] font-bold tracking-wide uppercase mt-0.5">
                                {role === 'admin' ? 'Administrator' : 'Cashier Station'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => dispatch(closeSidebar())}
                        className="p-1.5 rounded-xl text-gray-500 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 shadow-2xs"
                        aria-label="Close Navigation Menu"
                    >
                        <IconX className="w-5 h-5 text-gray-700" />
                    </button>
                </div>

                {/* Mobile Navigation Links */}
                <div className="p-3 space-y-1.5 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1 flex items-center justify-between">
                        <span>Menu Navigation</span>
                        <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-[10px] normal-case">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs animate-pulse" />
                            Live Session
                        </span>
                    </div>
                    {items.map((item) => {
                        const isActive = isItemActive(item.href);
                        const IconComponent = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => dispatch(closeSidebar())}
                                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 group ${isActive
                                    ? 'active !bg-[#0B3B7B] !text-white shadow-xs font-bold border border-[#072B5C]'
                                    : 'text-[#1E293B] hover:bg-blue-50/70 hover:text-[#0B3B7B] font-semibold'
                                    }`}
                                data-active={isActive ? "true" : "false"}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <IconComponent className={`w-5 h-5 shrink-0 transition-colors ${isActive ? '!text-white' : 'text-[#1E40AF]'
                                        }`} />
                                    <span className={`truncate ${isActive ? '!text-white font-bold' : ''}`}>
                                        {item.label}
                                    </span>
                                </div>
                                {isActive && (
                                    <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                )}
                            </Link>
                        );
                    })}
                </div>

                {/* Mobile Bottom Section: User Profile & Logout */}
                <div className="p-3 border-t border-gray-200 bg-gray-50/90 shrink-0 space-y-2">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-gray-200 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs">
                                {(user?.full_name || user?.username || 'A')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-gray-900 truncate leading-tight">
                                    {user?.full_name || user?.username || 'Admin'}
                                </div>
                                <div className="text-[10px] font-bold text-[#B8860B] uppercase tracking-wider mt-0.5 leading-none">
                                    {user?.role || 'admin'}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                dispatch(closeSidebar());
                                handleLogout();
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer text-xs font-semibold shrink-0"
                            title="Logout"
                        >
                            <IconLogout className="w-3.5 h-3.5" />
                            <span>Logout</span>
                        </button>
                    </div>

                    <div className="text-[10px] text-gray-400 text-center font-medium leading-none py-0.5">
                        Hilal POS &bull; v1.0.0
                    </div>
                </div>
            </div>
        </>
    );
}

