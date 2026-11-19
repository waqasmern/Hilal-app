'use client';
import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../lib/api';
import CustomModalAlert from '../components/CustomModalAlert';
import {
    IconBackup, IconMail, IconCheck, IconWarning,
    IconRefresh, IconServer, IconCalendar, IconEye, IconEyeOff, IconLock,
    IconDownload, IconFolder
} from '../components/Icons';

export default function BackupPage() {
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [emailBackupLoading, setEmailBackupLoading] = useState(false);
    const [localBackupLoading, setLocalBackupLoading] = useState(false);
    const [folderLoading, setFolderLoading] = useState(false);
    const [isEditingFolder, setIsEditingFolder] = useState(false);
    const [customFolderInput, setCustomFolderInput] = useState('');
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [lastCreatedBackup, setLastCreatedBackup] = useState(null);

    // Status & Stats
    const [statusData, setStatusData] = useState({
        dbSizeFormatted: '1.23 MB',
        lastEmailBackupAt: null,
        lastLocalBackupAt: null,
        localAutoEnabled: true,
        localBackupTime: '23:59',
        localBackupsCount: 0,
        emailConfigured: false,
        recipientEmail: '',
        senderEmail: '',
        service: 'gmail',
        shopName: 'Hilal Foods Solutions',
        totalSales: 0,
        totalCustomers: 10,
        totalProducts: 76,
        backupDir: 'Backups'
    });

    // Schedule Settings Form
    const [scheduleForm, setScheduleForm] = useState({
        localAutoEnabled: true,
        localBackupTime: '23:59',
        emailAutoEnabled: false
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
                if (s.localBackupFolder || s.backupDir) {
                    setCustomFolderInput(s.localBackupFolder || s.backupDir);
                }
                setScheduleForm({
                    localAutoEnabled: s.localAutoEnabled !== false,
                    localBackupTime: s.localBackupTime || '23:59',
                    emailAutoEnabled: s.emailAutoEnabled === true
                });
                if (s.lastLocalBackup) {
                    setLastCreatedBackup({
                        fileName: s.lastLocalBackup.fileName,
                        sizeFormatted: (s.lastLocalBackup.size > 1024 * 1024)
                            ? `${(s.lastLocalBackup.size / (1024 * 1024)).toFixed(2)} MB`
                            : `${(s.lastLocalBackup.size / 1024).toFixed(1)} KB`,
                        path: s.lastLocalBackup.path
                    });
                }
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

    // 1. Direct Download Database File (.db) — Same as Restaurant Management System
    const handleDirectDownload = () => {
        window.open(apiUrl('/api/backup'), '_blank');
    };

    // 2. Save Backup As... (Native Windows Save As dialog to choose USB or any folder)
    const handleSaveBackupAs = async () => {
        setLocalBackupLoading(true);
        try {
            if (typeof window !== 'undefined' && window.require) {
                try {
                    const { ipcRenderer } = window.require('electron');
                    const res = await ipcRenderer.invoke('save-backup-as');
                    if (res) {
                        if (res.canceled) return;
                        if (res.filePath) {
                            showAlert(
                                `Database backup saved successfully!\n\nFile Location:\n${res.filePath}\n\nYour complete sales, ledgers, and products are stored safely.`,
                                'success',
                                'Backup Saved'
                            );
                            fetchInitialData();
                            return;
                        } else if (res.error) {
                            showAlert(res.error, 'error');
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Electron save-backup-as failed, falling back to browser download', e);
                }
            }
            // Standard web browser fallback
            window.open(apiUrl('/api/backup'), '_blank');
        } catch (err) {
            showAlert('Backup failed: ' + err.message, 'error');
        } finally {
            setLocalBackupLoading(false);
        }
    };

    // Select Destination Folder for Backups
    const handleSelectFolder = async () => {
        setFolderLoading(true);
        try {
            let chosenPath = null;
            // 1. Electron Native Folder Browser Dialog
            if (typeof window !== 'undefined' && window.require) {
                try {
                    const { ipcRenderer } = window.require('electron');
                    const result = await ipcRenderer.invoke('select-backup-folder');
                    if (result && !result.canceled && result.folderPath) {
                        chosenPath = result.folderPath;
                    }
                } catch (ipcErr) {
                    console.warn('Electron IPC dialog failed:', ipcErr);
                }
            }

            // 2. Server-side Windows PowerShell Folder Browser if not yet chosen
            if (!chosenPath) {
                const token = localStorage.getItem('token');
                const headers = { 'Content-Type': 'application/json' };
                if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(apiUrl('/api/system/browse-folder'), {
                    method: 'POST',
                    headers
                });
                const text = await res.text();
                try {
                    const data = JSON.parse(text);
                    if (data && !data.canceled && data.folderPath) {
                        chosenPath = data.folderPath;
                    }
                } catch (e) {}
            }

            if (chosenPath) {
                await saveBackupFolder(chosenPath);
            }
        } catch (err) {
            showAlert('Folder selection failed: ' + err.message, 'error');
        } finally {
            setFolderLoading(false);
        }
    };

    // Save and Persist Backup Folder
    const saveBackupFolder = async (folderPath) => {
        if (!folderPath || !folderPath.trim()) {
            showAlert('Please specify a valid folder path', 'warning');
            return;
        }
        setFolderLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/backup/folder'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ folderPath: folderPath.trim() })
            });
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (jsonErr) {
                showAlert('Could not update folder settings. Please ensure server is running.', 'error');
                return;
            }
            if (res.ok && data.success) {
                setStatusData(prev => ({ ...prev, backupDir: data.folderPath, localBackupFolder: data.folderPath }));
                setCustomFolderInput(data.folderPath);
                setIsEditingFolder(false);
                showAlert(`Backup destination folder updated successfully!\n\nFolder Path:\n${data.folderPath}\n\nAll on-demand snapshots and automated daily backups will now be saved directly to this folder.`, 'success', 'Backup Folder Saved');
                fetchInitialData();
            } else {
                showAlert(data.error || 'Failed to update backup folder', 'error');
            }
        } catch (e) {
            showAlert(e.message, 'error');
        } finally {
            setFolderLoading(false);
        }
    };

    // Create Local Backup Now
    const handleCreateLocalBackup = async () => {
        setLocalBackupLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/system/backup'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    targetFolder: statusData.localBackupFolder || statusData.backupDir
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setLastCreatedBackup({
                    fileName: data.backupFileName,
                    sizeFormatted: data.sizeFormatted,
                    path: data.path
                });
                showAlert(
                    `Local database backup successfully created!\n\nFile Name: ${data.backupFileName}\nFile Size: ${data.sizeFormatted}\nSaved in Folder:\n${data.targetFolder || data.path}\n\nYou can keep this in your backups folder or download it now.`,
                    'success',
                    'Local Backup Created'
                );
                fetchInitialData();
            } else {
                showAlert(data.error || 'Failed to create local backup', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setLocalBackupLoading(false);
        }
    };

    // Save Auto-Backup Schedule
    const handleSaveSchedule = async (e) => {
        if (e) e.preventDefault();
        setScheduleSaving(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/backup/schedule'), {
                method: 'POST',
                headers,
                body: JSON.stringify(scheduleForm)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showAlert(
                    `Automatic backup schedule updated!\n\nDaily Auto-Backup: ${scheduleForm.localAutoEnabled ? `Active at ${scheduleForm.localBackupTime}` : 'Disabled'}\nEmail Auto-Backup: ${scheduleForm.emailAutoEnabled ? 'Enabled' : 'Disabled'}\n\nThe system will automatically create backups every day at this scheduled time.`,
                    'success',
                    'Auto-Backup Schedule Saved'
                );
                fetchInitialData();
            } else {
                showAlert(data.error || 'Failed to save auto backup schedule', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setScheduleSaving(false);
        }
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
                            Database Protection &amp; Recovery
                        </span>
                        <span className="text-xs text-gray-500 font-medium">Local Snapshots &amp; Cloud Nodemailer</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mt-1">
                        Backup &amp; Disaster Recovery
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Create local SQLite database snapshots, configure daily automated backups, or dispatch copies to your email.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Compact DB Button */}
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

                    {/* Create Local Backup Button */}
                    <button
                        type="button"
                        onClick={handleCreateLocalBackup}
                        disabled={localBackupLoading}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0B3B7B] hover:bg-[#072B5C] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Create an instant local database snapshot on this machine"
                    >
                        <IconBackup className={`w-4 h-4 ${localBackupLoading ? 'animate-spin' : ''}`} />
                        <span>{localBackupLoading ? 'Creating Snapshot...' : 'Create Local Backup'}</span>
                    </button>

                    {/* Send to Email Button */}
                    <button
                        type="button"
                        onClick={handleSendBackupEmail}
                        disabled={emailBackupLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        title="Send latest database snapshot to email right now"
                    >
                        <IconMail className="w-4 h-4" />
                        <span>{emailBackupLoading ? 'Sending...' : 'Send to Email'}</span>
                    </button>
                </div>
            </div>

            {/* Top KPI Cards (3 Cards) */}
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
                        <span>{statusData.totalProducts || 76} Products &amp; 147 Packaging Rules</span>
                    </div>
                </div>

                {/* KPI 2: Daily Auto-Backup Schedule */}
                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#0B3B7B]/30 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Daily Auto-Backup Schedule
                        </span>
                        <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700">
                            <IconCalendar className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black font-mono">
                        {statusData.localAutoEnabled ? (
                            <span className="text-indigo-700">Daily at {statusData.localBackupTime || '23:59'}</span>
                        ) : (
                            <span className="text-gray-400">Disabled</span>
                        )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                        {statusData.lastLocalBackupAt ? (
                            <span>Last run: {new Date(statusData.lastLocalBackupAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                            <span>Auto-runs in background every 24 hours</span>
                        )}
                    </div>
                </div>

                {/* KPI 3: Email Cloud Protection Status */}
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
                            <span className="text-emerald-700">Active</span>
                        ) : (
                            <span className="text-amber-700">Needs Setup</span>
                        )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate" title={statusData.recipientEmail || statusData.senderEmail}>
                        {statusData.recipientEmail || statusData.senderEmail || 'Configure SMTP below'}
                    </div>
                </div>
            </div>

            {/* Main Content Grid: Left (Local Backup & Auto-Schedule + Email) & Right (Help & Details) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT COLUMN: Local Backup + Email Configuration (7 cols) */}
                <div className="lg:col-span-7 space-y-6">

                    {/* SECTION 1: Local Database Backup & Automated Schedule */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-5">
                        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-blue-50 text-[#0B3B7B]">
                                    <IconBackup className="w-4 h-4" />
                                </span>
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">
                                        Database Backup &amp; Storage
                                    </h2>
                                    <p className="text-xs text-gray-500">
                                        Download direct database file (.db), save to USB/PC, or configure automated schedules.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Quick 1-Click Database Actions (Restaurant Management System Style) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={handleSaveBackupAs}
                                disabled={localBackupLoading}
                                className="p-3.5 rounded-xl font-bold text-xs text-white bg-[#0B3B7B] hover:bg-[#072B5C] transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                                title="Opens Windows Save As dialog to choose USB or any local folder"
                            >
                                <IconFolder className="w-4 h-4" />
                                <span>Save Backup To... (USB / PC)</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleDirectDownload}
                                className="p-3.5 rounded-xl font-bold text-xs text-gray-800 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                                title="Directly downloads live wholesale database (.db) to your Downloads folder"
                            >
                                <IconDownload className="w-4 h-4 text-[#0B3B7B]" />
                                <span>Download Database File (.db)</span>
                            </button>
                        </div>

                        {/* Backup Destination Folder Selector */}
                        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/70 to-slate-50 border border-blue-200/80 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="p-1 rounded bg-[#0B3B7B]/10 text-[#0B3B7B]">
                                        <IconFolder className="w-4 h-4" />
                                    </span>
                                    <div>
                                        <span className="text-xs font-bold text-gray-900 uppercase tracking-wider block">
                                            Backup Destination Folder
                                        </span>
                                        <span className="text-[11px] text-gray-500">
                                            Choose any local folder or USB drive to save your database snapshots.
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={handleSelectFolder}
                                        disabled={folderLoading}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0B3B7B] hover:bg-[#072B5C] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                        title="Select folder using Windows folder picker dialog"
                                    >
                                        <IconFolder className={`w-3.5 h-3.5 ${folderLoading ? 'animate-spin' : ''}`} />
                                        <span>{folderLoading ? 'Selecting...' : 'Select Folder'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingFolder(!isEditingFolder)}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-all cursor-pointer shadow-2xs"
                                        title="Type or paste a custom folder path manually"
                                    >
                                        {isEditingFolder ? 'Cancel' : 'Edit Path'}
                                    </button>
                                </div>
                            </div>

                            {isEditingFolder ? (
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        type="text"
                                        value={customFolderInput}
                                        onChange={(e) => setCustomFolderInput(e.target.value)}
                                        placeholder="e.g. D:\ShopBackups or E:\USB_Backup"
                                        className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => saveBackupFolder(customFolderInput)}
                                        disabled={folderLoading}
                                        className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-2xs cursor-pointer shrink-0"
                                    >
                                        Save Folder
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-blue-100 font-mono text-xs text-gray-800 break-all select-all">
                                    <span className="truncate" title={statusData.localBackupFolder || statusData.backupDir || 'Default AppData Folder'}>
                                        {statusData.localBackupFolder || statusData.backupDir || 'Default AppData Folder'}
                                    </span>
                                    <span className="text-[10px] text-emerald-700 font-semibold shrink-0 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        Active
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Manual Trigger Banner */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                    <span>Instant Local Snapshot</span>
                                    <span className="px-2 py-0.2 text-[9.5px] rounded bg-emerald-100 text-emerald-800 font-bold uppercase">Zero Locking</span>
                                </div>
                                <p className="text-[11px] text-gray-500 leading-relaxed">
                                    Generates a complete copy of your sales, ledgers, and products in the local <code>Backups/</code> folder.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCreateLocalBackup}
                                disabled={localBackupLoading}
                                className="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-[#0B3B7B] hover:bg-[#072B5C] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
                            >
                                <IconBackup className={`w-4 h-4 ${localBackupLoading ? 'animate-spin' : ''}`} />
                                <span>{localBackupLoading ? 'Saving...' : 'Create Local Backup Now'}</span>
                            </button>
                        </div>

                        {/* Latest Local Snapshot Card with Download Link */}
                        {lastCreatedBackup && (
                            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold text-[#0B3B7B] uppercase tracking-wider">
                                        Latest Local Backup Available
                                    </div>
                                    <div className="text-xs font-mono font-bold text-gray-900 truncate mt-0.5">
                                        {lastCreatedBackup.fileName}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        Size: <strong className="text-gray-700">{lastCreatedBackup.sizeFormatted}</strong> • Stored safely on machine
                                    </div>
                                </div>
                                <a
                                    href={apiUrl(`/api/backup/download/${encodeURIComponent(lastCreatedBackup.fileName)}`)}
                                    download={lastCreatedBackup.fileName}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#0B3B7B] bg-white border border-blue-200 hover:bg-blue-50 transition-all flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
                                    title="Download this backup file to your USB drive or computer"
                                >
                                    <IconDownload className="w-3.5 h-3.5 text-[#0B3B7B]" />
                                    <span>Download .db</span>
                                </a>
                            </div>
                        )}

                        {/* Automated Schedule Configuration Form */}
                        <form onSubmit={handleSaveSchedule} className="pt-2 border-t border-gray-100 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                                        ⏰ Daily Automated Schedule
                                    </h3>
                                    <p className="text-[11px] text-gray-500">
                                        Automatically creates a fresh backup every day without manual intervention.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={scheduleForm.localAutoEnabled}
                                        onChange={(e) => setScheduleForm({ ...scheduleForm, localAutoEnabled: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0B3B7B]"></div>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Auto-Backup Daily Time (24h)
                                    </label>
                                    <input
                                        type="time"
                                        value={scheduleForm.localBackupTime}
                                        onChange={(e) => setScheduleForm({ ...scheduleForm, localBackupTime: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20"
                                    />
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                        <span className="text-[10px] text-gray-400 font-semibold">Presets:</span>
                                        {[
                                            { label: 'Shop Close (11:59 PM)', time: '23:59' },
                                            { label: 'Evening (10:00 PM)', time: '22:00' },
                                            { label: 'Midnight (12:00 AM)', time: '00:00' }
                                        ].map(preset => (
                                            <button
                                                key={preset.time}
                                                type="button"
                                                onClick={() => setScheduleForm({ ...scheduleForm, localBackupTime: preset.time })}
                                                className={`text-[9.5px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                                    scheduleForm.localBackupTime === preset.time
                                                        ? 'bg-[#0B3B7B] text-white border-[#0B3B7B]'
                                                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Email Synchronized Dispatch
                                    </label>
                                    <label className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={scheduleForm.emailAutoEnabled}
                                            onChange={(e) => setScheduleForm({ ...scheduleForm, emailAutoEnabled: e.target.checked })}
                                            className="mt-0.5 rounded text-[#0B3B7B] focus:ring-[#0B3B7B]"
                                        />
                                        <span className="text-[11px] text-gray-700 leading-tight">
                                            Also automatically email this snapshot when the daily local backup runs.
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[10.5px] text-gray-400 truncate max-w-[280px]" title={statusData.localBackupFolder || statusData.backupDir}>
                                    Saved in: <code className="text-gray-600 font-mono truncate">{statusData.localBackupFolder || statusData.backupDir || 'Backups'}</code>
                                </span>
                                <button
                                    type="submit"
                                    disabled={scheduleSaving}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                >
                                    <IconCheck className="w-3.5 h-3.5" />
                                    <span>{scheduleSaving ? 'Saving...' : 'Save Schedule Settings'}</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* SECTION 2: Nodemailer Online Email Backup Configuration */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
                        <div className="border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                    <IconMail className="w-4 h-4" />
                                </span>
                                <h2 className="text-base font-bold text-gray-900">
                                    Nodemailer Online Email Configuration
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
                </div>

                {/* RIGHT COLUMN: How Local Backups Work & Database Breakdown (5 cols) */}
                <div className="lg:col-span-5 space-y-4">

                    {/* Guide Card: How Local Backups Work */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="p-1.5 rounded-lg bg-blue-50 text-[#0B3B7B]">
                                <IconBackup className="w-4 h-4" />
                            </span>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">
                                    How Local Backups Work
                                </h3>
                                <p className="text-[11px] text-gray-500">
                                    Creating, finding &amp; restoring your store database
                                </p>
                            </div>
                        </div>

                        <ol className="space-y-2.5 text-xs text-gray-600">
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0B3B7B] font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                                <span><strong>Instant Snapshot:</strong> Click the <em>Create Local Backup</em> button anytime to create an immediate complete copy of your database.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0B3B7B] font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                                <span><strong>Daily Auto-Backup:</strong> Set your closing time (e.g. <code>11:59 PM</code>). The system automatically saves a fresh snapshot every day without closing the POS.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0B3B7B] font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                                <span><strong>One-Click Download:</strong> Click <em>Download .db</em> to save a copy directly to a USB flash drive or your Desktop for ultimate safety.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0B3B7B] font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                                <span><strong>Zero-Lock Technology:</strong> Backups use SQLite <code>VACUUM INTO</code>, meaning cashiers can continue billing sales with zero interruption.</span>
                            </li>
                        </ol>
                    </div>

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
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
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
