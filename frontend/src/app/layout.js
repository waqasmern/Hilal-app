'use client';
import './globals.css';
import { useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store, loginSuccess, setSettings } from '../store';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import { usePathname, useRouter } from 'next/navigation';

if (typeof window !== 'undefined' && !window.__fetchPatched) {
    window.__fetchPatched = true;
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        if (typeof input === 'string') {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
            if (input.startsWith('http://localhost:5000/api')) {
                input = input.replace('http://localhost:5000', apiBase);
            } else if (input.startsWith('http://localhost:5000')) {
                input = input.replace('http://localhost:5000', apiBase);
            }
        }
        return originalFetch.call(this, input, init);
    };
}

function RootLayoutContent({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const dispatch = useDispatch();
    const auth = useSelector((state) => state.auth);
    const settings = useSelector((state) => state.settings);

    // Support both /login and /login/ (due to trailingSlash in next.config.mjs)
    const isLoginPage = !pathname || pathname === '/login' || pathname === '/login/' || pathname.startsWith('/login');

    // Fetch and sync global settings
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('shop_settings');
                if (saved) {
                    dispatch(setSettings(JSON.parse(saved)));
                }
            } catch (e) { }
        }

        const fetchGlobalSettings = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    dispatch(setSettings(data));
                }
            } catch (err) {
                // Ignore initial backend fetch error
            }
        };
        fetchGlobalSettings();
    }, [dispatch]);

    // Dynamic document title update based on dynamic shop name
    useEffect(() => {
        if (typeof document !== 'undefined') {
            const shopName = settings?.shop_name || 'Hilal Wholesaler Shop';
            document.title = `${shopName} - POS & Inventory System`;
        }
    }, [settings?.shop_name]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('token');
            const savedUser = localStorage.getItem('user');
            if (token && savedUser) {
                try {
                    dispatch(loginSuccess({ user: JSON.parse(savedUser), token }));
                } catch (e) { }
            } else if (!isLoginPage && pathname !== '/') {
                router.replace('/login');
            }
        }
    }, [pathname, isLoginPage, router, dispatch]);

    const showAppChrome = !isLoginPage;

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
            {showAppChrome && <Navbar />}
            <div className="flex flex-1">
                {showAppChrome && <Sidebar />}
                <main className={`flex-1 overflow-x-hidden min-w-0 ${showAppChrome ? 'p-2 sm:p-3 md:p-2' : 'p-0'}`}>
                    {children}
                </main>
            </div>
        </div>
    );
}

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <title>Hilal Wholesaler Shop - POS & Inventory System</title>
                <meta name="description" content="Wholesale Inventory, POS, Customer & Supplier Ledger, Accounting and Sync System" />
            </head>
            <body suppressHydrationWarning>
                <Provider store={store}>
                    <RootLayoutContent>{children}</RootLayoutContent>
                </Provider>
            </body>
        </html>
    );
}
