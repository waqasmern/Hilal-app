'use client';
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginSuccess, setSettings } from '../../store';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const dispatch = useDispatch();
    const router = useRouter();
    const settings = useSelector(state => state.settings);

    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('admin123');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const fetchSettings = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    dispatch(setSettings(data));
                }
            } catch (e) { }
        };
        fetchSettings();
    }, [dispatch]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }

            dispatch(loginSuccess({ user: data.user, token: data.token }));
            router.push('/pos');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
                <div className="text-center space-y-2">
                    {mounted && settings?.shop_logo ? (
                        <img 
                            src={settings.shop_logo} 
                            alt={settings.shop_name || 'Shop Logo'} 
                            className="w-16 h-16 rounded-2xl object-contain mx-auto shadow-md border border-gray-200 p-1 bg-white" 
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-2xl gold-gradient text-white text-3xl font-extrabold flex items-center justify-center mx-auto shadow-md">
                            {((mounted ? settings?.shop_name : null) || 'Hilal').charAt(0).toUpperCase()}
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">{(mounted ? settings?.shop_name : null) || 'Hilal Wholesaler Shop'}</h1>
                    <p className="text-xs text-gray-500 font-medium">Wholesale Inventory, POS & Ledger System</p>
                </div>

                {error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-medium text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                            Username
                        </label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none text-sm font-medium transition-all"
                            placeholder="admin or cashier"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                            Password
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none text-sm font-medium transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-xl gold-gradient text-white font-bold text-sm shadow-md hover:opacity-95 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Authenticating...' : 'Login to System'}
                        </button>
                    </div>
                </form>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-around text-xs text-gray-500 font-medium">
                    <button 
                        onClick={() => { setUsername('admin'); setPassword('admin123'); }}
                        className="hover:text-[#B8860B] font-semibold underline"
                    >
                        Demo Admin
                    </button>
                    <span>•</span>
                    <button 
                        onClick={() => { setUsername('cashier'); setPassword('cashier123'); }}
                        className="hover:text-[#B8860B] font-semibold underline"
                    >
                        Demo Cashier
                    </button>
                </div>
            </div>
        </div>
    );
}
