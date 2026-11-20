'use client';
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginSuccess, setSettings } from '../../store';
import { useRouter } from 'next/navigation';
import { IconLock, IconEye, IconEyeOff, IconSpinner, IconShield } from '../components/Icons';

export default function LoginPage() {
    const dispatch = useDispatch();
    const router = useRouter();
    const settings = useSelector(state => state.settings);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
        <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient Brand Header Banner */}
            <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-r from-[#072B5C] via-[#0B3B7B] to-[#0A3266] shadow-md">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-200/80 p-8 sm:p-10 space-y-6">
                {/* Shop Branding & Title */}
                <div className="text-center space-y-3">
                    {mounted && settings?.shop_logo ? (
                        <div className="w-20 h-20 rounded-2xl mx-auto shadow-md border-2 border-blue-100 p-1.5 bg-white flex items-center justify-center">
                            <img 
                                src={settings.shop_logo} 
                                alt={settings.shop_name || 'Shop Logo'} 
                                className="w-full h-full object-contain" 
                            />
                        </div>
                    ) : (
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0B3B7B] to-[#072B5C] text-white text-3xl font-black flex items-center justify-center mx-auto shadow-lg shadow-[#0B3B7B]/30 border-2 border-white">
                            {((mounted ? settings?.shop_name : null) || 'H').charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-[#0B3B7B] tracking-tight leading-tight uppercase">
                            {(mounted ? settings?.shop_name : null) || 'Hilal Foods Solutions'}
                        </h1>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">
                            {settings?.shop_tagline || settings?.shop_subtitle || 'Wholesale Inventory, POS & Ledger System'}
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold text-center">
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                            Username
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#0B3B7B]">
                                <svg className="w-4 h-4 text-[#0B3B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border border-gray-300 focus:border-[#0B3B7B] focus:ring-4 focus:ring-[#0B3B7B]/10 outline-none text-sm font-semibold transition-all text-gray-900 bg-gray-50/50 focus:bg-white placeholder:text-gray-400 placeholder:font-normal"
                                placeholder="Enter username"
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#0B3B7B]">
                                <IconLock className="w-4 h-4 text-[#0B3B7B]" strokeWidth={2} />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border border-gray-300 focus:border-[#0B3B7B] focus:ring-4 focus:ring-[#0B3B7B]/10 outline-none text-sm font-semibold transition-all text-gray-900 bg-gray-50/50 focus:bg-white placeholder:text-gray-400 placeholder:font-normal"
                                placeholder="Enter password"
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-[#0B3B7B] transition-colors cursor-pointer"
                                title={showPassword ? "Hide password" : "Show password"}
                                tabIndex={-1}
                            >
                                {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 sm:py-3.5 rounded-xl bg-[#0B3B7B] hover:bg-[#072B5C] active:scale-[0.99] text-white font-extrabold text-sm shadow-md shadow-[#0B3B7B]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <IconSpinner className="w-4 h-4 text-white animate-spin" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <span>Sign In to System</span>
                            )}
                        </button>
                    </div>
                </form>

                {/* Secure Session Footer */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold">
                    <IconShield className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Authorized Personnel Only</span>
                </div>
            </div>

            {/* Copyright / Shop Branding Footer */}
            <div className="relative z-10 text-center text-xs text-gray-500 font-medium mt-6">
                &copy; {new Date().getFullYear()} {(mounted ? settings?.shop_name : null) || 'Hilal Foods Solutions'}. All rights reserved.
            </div>
        </div>
    );
}
