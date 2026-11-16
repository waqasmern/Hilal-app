'use client';
import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../lib/api';
import CustomModalAlert from '../components/CustomModalAlert';
import {
    IconBackup, IconMail, IconCheck, IconWarning,
    IconRefresh, IconServer, IconCalendar, IconEye, IconEyeOff, IconLock
} from '../components/Icons';

export default function BackupPage() {
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [emailBackupLoading, setEmailBackupLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Status & Stats
    const [statusData, setStatusData] = useState({
        dbSizeFormatted: '1.23 MB',
        lastEmailBackupAt: null,
        emailConfigured: false,
        recipientEmail: '',
        senderEmail: '',
        service: 'gmail',
        shopName: 'Hilal Foods Solutions',
        totalSales: 0,
        totalCustomers: 10,
        totalProducts: 76
    });

    // Email SMTP Form State
    const [emailForm, setEmailForm] = useState({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: '465',
        secure: true,
        user: '',
        pass: '',
        recipient: '',
        autoEnabled: false,
        hasPassword: false
    });

    // Modal Alert
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        confirmText: 'OK',
        onConfirm: () => { }
    });

    const showAlert = (message, type = 'info', title = '', onConfirm = null) => {
        setModalAlert({
            isOpen: true,
            type,
            title: title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Notice'),
            message,
            confirmText: 'OK',
            onConfirm: () => {
                setModalAlert(prev => ({ ...prev, isOpen: false }));
                if (onConfirm) onConfirm();
            }
        });
    };

    // Load initial data
    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const [resStatus, resSettings] = await Promise.all([
                fetch(apiUrl('/api/backup/status'), { headers }).catch(() => null),
                fetch(apiUrl('/api/backup/settings'), { headers }).catch(() => null)
            ]);

            if (resStatus && resStatus.ok) {
                const s = await resStatus.json();
                setStatusData(s);
            }

            if (resSettings && resSettings.ok) {
                const cfg = await resSettings.json();
                setEmailForm(prev => ({
                    ...prev,
                    service: cfg.service || 'gmail',
                    host: cfg.host || 'smtp.gmail.com',
                    port: String(cfg.port || '465'),
                    secure: cfg.secure !== false,
                    user: cfg.user || '',
                    recipient: cfg.recipient || '',
                    autoEnabled: cfg.autoEnabled === true,
                    hasPassword: !!cfg.hasPassword
                }));
            }
        } catch (err) {
            console.error('Failed to load backup status:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle Service Preset Change
    const handleServiceChange = (serviceType) => {
        let defaultHost = 'smtp.gmail.com';
        let defaultPort = '465';
        let isSecure = true;

        if (serviceType === 'outlook') {
            defaultHost = 'smtp.office365.com';
            defaultPort = '587';
            isSecure = false;
        } else if (serviceType === 'yahoo') {
            defaultHost = 'smtp.mail.yahoo.com';
            defaultPort = '465';
            isSecure = true;
        }

        setEmailForm(prev => ({
            ...prev,
            service: serviceType,
            host: defaultHost,
            port: defaultPort,
            secure: isSecure
        }));
    };

    // Save Email Settings
    const handleSaveEmailSettings = async (e) => {
        if (e) e.preventDefault();
        setActionLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/backup/settings'), {
                method: 'POST',
                headers,
                body: JSON.stringify(emailForm)
            });
            const data = await res.json();
            if (res.ok) {
                showAlert('Email backup settings successfully saved!', 'success', 'Settings Saved');
                fetchInitialData();
            } else {
                showAlert(data.error || 'Failed to save email settings', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Test Email Connection
    const handleTestEmail = async () => {
        if (!emailForm.user) {
            showAlert('Please enter your Sender Email address before testing.', 'warning', 'Missing Email');
            return;
        }
        if (!emailForm.pass && !emailForm.hasPassword) {
            showAlert('Please enter your App Password before testing.', 'warning', 'Missing Password');
            return;
        }

        setTestLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/backup/test-email'), {
                method: 'POST',
                headers,
                body: JSON.stringify(emailForm)
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(data.message || 'SMTP Connection verified successfully! Check your inbox.', 'success', 'Connection Verified');
            } else {
                showAlert(data.error || 'Failed to connect to SMTP mail server', 'error', 'SMTP Connection Error');
            }
        } catch (err) {
            showAlert(err.message, 'error', 'Connection Error');
        } finally {
            setTestLoading(false);
        }
    };

    // Send Database Backup to Email (Nodemailer)
    const handleSendBackupEmail = async () => {
        setEmailBackupLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/backup/send-email'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    recipient: emailForm.recipient || emailForm.user
                })
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(
                    `Database backup snapshot (${data.sizeFormatted}) has been sent via email to ${data.recipient}! Check your inbox.`,
                    'success',
                    'Cloud Email Backup Sent'
                );
                fetchInitialData();
            } else {
                showAlert(data.error || 'Failed to dispatch email backup', 'error', 'Email Backup Failed');
            }
        } catch (err) {
            showAlert(err.message, 'error', 'Failed');
        } finally {
            setEmailBackupLoading(false);
        }
    };

    // Compact Database
    const handleCompactDatabase = async () => {
        setActionLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/system/compact'), {
                method: 'POST',
                headers
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(`Database compacted! Space freed: ${data.freedFormatted || 'Optimized'}. New size: ${data.sizeAfterFormatted || 'Compact'}`, 'success', 'Database Optimized');
                fetchInitialData();
            } else {
                showAlert(data.error || 'Compaction failed', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Top Header Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#0B3B7B] border border-blue-200">
                            Cloud Disaster Protection
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Automated via Nodemailer</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">
                        Online Email Database Backup
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Securely dispatch live SQLite database snapshots directly to your personal or store email address.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleCompactDatabase}
                        disabled={actionLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Vacuum and defragment database file"
                    >
                        <IconRefresh className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                        <span>Compact DB</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleSendBackupEmail}
                        disabled={emailBackupLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        title="Send latest database snapshot to email right now"
                    >
                        <IconMail className="w-4 h-4" />
                        <span>{emailBackupLoading ? 'Sending Email...' : 'Send Backup to Email Now'}</span>
                    </button>
                </div>
            </div>

            {/* Top KPI Cards (Cleaned up, no local snapshots count) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* KPI 1: Live Database Size */}
                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#0B3B7B]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Live Database Size
                        </span>
                        <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-[#0B3B7B]">
                            <IconServer className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-gray-900 font-mono">
                        {statusData.dbSizeFormatted}
                    </div>
                    <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <IconCheck className="w-3.5 h-3.5 inline" />
                        <span>76 Products &amp; 147 Packaging Rules</span>
                    </div>
                </div>

                {/* KPI 2: Email Protection Status */}
                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#0B3B7B]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Email Protection
                        </span>
                        <div className={`p-2 rounded-xl border ${statusData.emailConfigured ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                            <IconMail className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black font-mono">
                        {statusData.emailConfigured ? (
                            <span className="text-emerald-700">Configured &amp; Active</span>
                        ) : (
                            <span className="text-amber-700">Needs Setup</span>
                        )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate" title={statusData.recipientEmail || statusData.senderEmail}>
                        {statusData.recipientEmail || statusData.senderEmail || 'No recipient email configured'}
                    </div>
                </div>

                {/* KPI 3: Last Email Backup Sent */}
                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#0B3B7B]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Last Email Backup Sent
                        </span>
                        <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700">
                            <IconCalendar className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-sm sm:text-base font-bold text-gray-900 truncate mt-1">
                        {statusData.lastEmailBackupAt ? (
                            new Date(statusData.lastEmailBackupAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        ) : (
                            <span className="text-gray-400 font-normal">No email sent yet</span>
                        )}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                        Sent with attached <code>wholesale-backup.db</code>
                    </div>
                </div>
            </div>

            {/* Main Content Grid: Nodemailer Form (Left) & Why 1.23 MB / How It Works (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT COLUMN: Nodemailer Email Setup & Trigger (7 cols) */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
                    <div className="border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-blue-50 text-[#0B3B7B]">
                                <IconMail className="w-4 h-4" />
                            </span>
                            <h2 className="text-base font-bold text-gray-900">
                                Nodemailer Email Configuration
                            </h2>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Attach your live SQLite database file directly into an email and deliver it to your inbox for instant off-site backup.
                        </p>
                    </div>

                    {/* Email Service Selector */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Email Service Provider
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'gmail', label: 'Gmail' },
                                { id: 'outlook', label: 'Outlook' },
                                { id: 'yahoo', label: 'Yahoo' },
                                { id: 'custom', label: 'Custom' }
                            ].map((prov) => (
                                <button
                                    key={prov.id}
                                    type="button"
                                    onClick={() => handleServiceChange(prov.id)}
                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${emailForm.service === prov.id
                                            ? 'bg-[#0B3B7B] text-white border-[#0B3B7B] shadow-2xs'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    {prov.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Gmail App Password Instructions Banner */}
                    {emailForm.service === 'gmail' && (
                        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                            <div className="font-bold flex items-center gap-1.5 text-amber-800">
                                <span>🔑 How to Get a Gmail App Password</span>
                            </div>
                            <ol className="list-decimal list-inside text-[11px] leading-relaxed text-amber-800 space-y-0.5">
                                <li>Open your <strong>Google Account</strong> (myaccount.google.com).</li>
                                <li>Go to <strong>Security</strong> &gt; Enable <strong>2-Step Verification</strong>.</li>
                                <li>In the search box at top, type <strong>App passwords</strong>.</li>
                                <li>Create an app name (e.g. <em>Hilal Wholesaler</em>) and click <strong>Create</strong>.</li>
                                <li>Copy the <strong>16-letter password</strong> and paste it below.</li>
                            </ol>
                        </div>
                    )}

                    <form onSubmit={handleSaveEmailSettings} className="space-y-3.5 text-xs">
                        {/* Sender Email */}
                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Sender Email Address
                            </label>
                            <input
                                type="email"
                                required
                                value={emailForm.user}
                                onChange={(e) => setEmailForm({ ...emailForm, user: e.target.value })}
                                placeholder="e.g. hilalfoods@gmail.com"
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 text-xs"
                            />
                        </div>

                        {/* App Password */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-gray-700">
                                    App Password (16 Characters)
                                </label>
                                {emailForm.hasPassword && (
                                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        Password Saved
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={emailForm.pass}
                                    onChange={(e) => setEmailForm({ ...emailForm, pass: e.target.value })}
                                    placeholder={emailForm.hasPassword ? '•••••••••••••••• (leave blank to keep current)' : 'e.g. abcd efgh ijkl mnop'}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 pr-10 text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                >
                                    {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Recipient Email Address */}
                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Recipient Email Address (Where backups should be sent)
                            </label>
                            <input
                                type="email"
                                value={emailForm.recipient}
                                onChange={(e) => setEmailForm({ ...emailForm, recipient: e.target.value })}
                                placeholder="e.g. owner@gmail.com (defaults to sender email if left blank)"
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 text-xs"
                            />
                        </div>

                        {/* Custom SMTP host/port options */}
                        {emailForm.service === 'custom' && (
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">SMTP Host</label>
                                    <input
                                        type="text"
                                        value={emailForm.host}
                                        onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })}
                                        placeholder="mail.example.com"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">SMTP Port</label>
                                    <input
                                        type="text"
                                        value={emailForm.port}
                                        onChange={(e) => setEmailForm({ ...emailForm, port: e.target.value })}
                                        placeholder="465 or 587"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                            <button
                                type="button"
                                onClick={handleTestEmail}
                                disabled={testLoading}
                                className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl border border-gray-300 font-bold text-gray-700 bg-white hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                            >
                                <IconMail className="w-4 h-4 text-[#0B3B7B]" />
                                <span>{testLoading ? 'Testing Connection...' : 'Test Connection'}</span>
                            </button>

                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl font-bold text-white bg-[#0B3B7B] hover:bg-[#082a57] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                            >
                                <IconCheck className="w-4 h-4" />
                                <span>{actionLoading ? 'Saving...' : 'Save Settings'}</span>
                            </button>
                        </div>
                    </form>

                    {/* Prominent Send to Email Button */}
                    <div className="pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={handleSendBackupEmail}
                            disabled={emailBackupLoading}
                            className="w-full py-3 px-5 rounded-xl font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-2.5 shadow-md cursor-pointer text-sm"
                        >
                            <IconMail className="w-5 h-5" />
                            <span>{emailBackupLoading ? 'Creating Snapshot & Sending Email...' : 'Dispatch Live Database Backup to Email Now'}</span>
                        </button>
                    </div>
                </div>

                {/* RIGHT COLUMN: Database Content Breakdown & Why 1.23 MB (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                    {/* Database Size Breakdown Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="p-1.5 rounded-lg bg-blue-50 text-[#0B3B7B]">
                                <IconServer className="w-4 h-4" />
                            </span>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">
                                    Why is Database Size 1.23 MB?
                                </h3>
                                <p className="text-[11px] text-gray-500">
                                    Detailed breakdown of stored catalog &amp; master data
                                </p>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            Even before new sales are billed, your SQLite database stores all your store&apos;s master configuration, catalog, and packaging conversions:
                        </p>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2 text-xs">
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• Product Catalog:</span>
                                <span className="font-bold font-mono">76 Products</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• Packaging Conversions:</span>
                                <span className="font-bold font-mono">147 Pricing Rules</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• Product Categories:</span>
                                <span className="font-bold font-mono">31 Categories</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• Packaging Types:</span>
                                <span className="font-bold font-mono">19 Types (Carton, Box, etc.)</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• Suppliers &amp; Customers:</span>
                                <span className="font-bold font-mono">29 Accounts</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• High-Res Store Logo:</span>
                                <span className="font-bold font-mono">~155 KB Base64</span>
                            </div>
                            <div className="flex items-center justify-between text-gray-700">
                                <span className="font-medium">• B-Tree Indexes &amp; Schemas:</span>
                                <span className="font-bold font-mono">28 System Tables</span>
                            </div>
                        </div>

                        <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                            💡 <strong>1.23 MB is extremely small</strong> (smaller than a single smartphone photo). SQLite uses pre-allocated 4 KB pages for ultra-fast instant searches.
                        </div>
                    </div>

                    {/* Cloud Email Benefits Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                <IconLock className="w-4 h-4" />
                            </span>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">
                                    Benefits of Nodemailer Online Backup
                                </h3>
                                <p className="text-[11px] text-gray-500">
                                    Safe off-site protection against computer issues
                                </p>
                            </div>
                        </div>

                        <ul className="space-y-2 text-xs text-gray-600">
                            <li className="flex items-start gap-2">
                                <IconCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span><strong>Off-Site Protection:</strong> If your PC ever crashes or gets lost, your backup is safe in your email.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <IconCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span><strong>Full SQLite Database:</strong> The email has the exact <code>.db</code> attachment containing all customers, inventory, and ledgers.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <IconCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <span><strong>Accessible Everywhere:</strong> Download your database file from your phone, laptop, or home computer anytime.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Custom Modal Alert */}
            <CustomModalAlert
                isOpen={modalAlert.isOpen}
                type={modalAlert.type}
                title={modalAlert.title}
                message={modalAlert.message}
                confirmText={modalAlert.confirmText}
                onConfirm={modalAlert.onConfirm}
                onCancel={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
