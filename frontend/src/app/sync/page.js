'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { IconSync, IconSettings, IconPlus, IconCheck, IconWarning, IconClose, IconBolt } from '../components/Icons';

export default function SyncPage() {
    const { user } = useSelector(state => state.auth);
    const fileFolderInputRef = useRef(null);
    const [syncStats, setSyncStats] = useState({ total: 0, pending: 0, syncing: 0, synced: 0, failed: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [backups, setBackups] = useState([]);
    const [backingUp, setBackingUp] = useState(false);
    const [compacting, setCompacting] = useState(false);
    const [compactResult, setCompactResult] = useState(null);

    const [selectedFolder, setSelectedFolder] = useState('');
    const [defaultBackupFolder, setDefaultBackupFolder] = useState('');
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [folderInput, setFolderInput] = useState('');

    const [syncFeedback, setSyncFeedback] = useState(null);
    const [toast, setToast] = useState(null); // { type: 'success' | 'error' | 'info', title: '', message: '', details: '' }

    useEffect(() => {
        const savedFolder = typeof window !== 'undefined' ? (localStorage.getItem('preferred_backup_folder') || '') : '';
        if (savedFolder) setSelectedFolder(savedFolder);

        fetchSyncStatus();
        if (user?.role === 'admin') {
            fetchBackups(savedFolder);
        }
    }, [user]);

    const showToast = (title, message, type = 'success', details = '') => {
        setToast({ title, message, type, details });
        setTimeout(() => setToast(prev => (prev?.title === title ? null : prev)), 6000);
    };

    const fetchSyncStatus = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/sync/status');
            if (res.ok) {
                setSyncStats(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchBackups = async (folder = selectedFolder) => {
        try {
            const token = localStorage.getItem('token');
            const url = folder 
                ? `http://localhost:5000/api/system/backups?folder=${encodeURIComponent(folder)}`
                : 'http://localhost:5000/api/system/backups';
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setBackups(data);
                } else if (data && Array.isArray(data.files)) {
                    setBackups(data.files);
                    if (data.defaultFolder) setDefaultBackupFolder(data.defaultFolder);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelectFolder = () => {
        setFolderInput(selectedFolder || defaultBackupFolder || 'D:\\Backups');
        setShowFolderModal(true);
    };

    const handleResetFolder = () => {
        setSelectedFolder('');
        localStorage.removeItem('preferred_backup_folder');
        fetchBackups('');
        showToast('Reset to Default', 'Destination reset to default app Backups folder.', 'info');
    };

    const handleTriggerSync = async () => {
        setIsSyncing(true);
        setSyncFeedback(null);
        try {
            const res = await fetch('http://localhost:5000/api/sync/trigger', { method: 'POST' });
            if (res.ok) {
                const result = await res.json();
                const pull = result.pull;
                const push = result.push;
                let msgs = [];
                if (pull && pull.status === 'completed') {
                    msgs.push(`✓ Pulled ${pull.pulledProducts || 0} products & ${pull.pulledSales || 0} online orders from cloud.`);
                }
                if (push && push.processed > 0) {
                    msgs.push(`✓ Pushed ${push.success || 0} offline transactions to cloud.`);
                } else {
                    msgs.push(`✓ All offline transactions are up to date.`);
                }
                setSyncFeedback(msgs.join(' '));
                fetchSyncStatus();
            } else {
                const data = await res.json().catch(() => ({}));
                setSyncFeedback(`Sync notice: ${data.error || 'Server error'}`);
            }
        } catch (err) {
            setSyncFeedback(`Sync failed: ${err.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateBackup = async () => {
        setBackingUp(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/system/backup', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    targetFolder: selectedFolder || undefined
                })
            });

            if (res.ok) {
                const data = await res.json();
                showToast(
                    'Backup Created Successfully!',
                    `${data.backupFileName} (${data.sizeFormatted || 'Compact live snapshot'})`,
                    'success',
                    `Saved to: ${data.path}`
                );
                fetchBackups(selectedFolder);
            } else {
                const data = await res.json().catch(() => ({}));
                showToast('Backup Failed', data.error || 'Could not create database backup', 'error');
            }
        } catch (err) {
            showToast('Backup Error', err.message, 'error');
        } finally {
            setBackingUp(false);
        }
    };

    const handleCompactDatabase = async () => {
        setCompacting(true);
        setCompactResult(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/system/compact', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setCompactResult(data);
                showToast(
                    'Database Compacted & Defragmented!',
                    `Size: ${data.sizeAfterFormatted} (Freed ${data.freedFormatted} of unused space)`,
                    'success',
                    'Synced queue entries older than 3 days pruned; SQLite vacuum completed.'
                );
            } else {
                const errData = await res.json().catch(() => ({}));
                showToast('Compaction Notice', errData.error || 'Server error during compaction', 'error');
            }
        } catch (err) {
            showToast('Compaction Error', err.message, 'error');
        } finally {
            setCompacting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto pb-8">
            {/* IN-APP CUSTOM SWEET TOAST / MODAL BANNER */}
            {toast && (
                <div className={`p-4 rounded-2xl border shadow-lg animate-fadeIn flex items-start justify-between gap-3 ${
                    toast.type === 'success' 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                        : toast.type === 'error'
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-blue-50 border-blue-300 text-blue-900'
                }`}>
                    <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white ${
                            toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-blue-600'
                        }`}>
                            {toast.type === 'success' ? <IconCheck className="w-5 h-5" /> : <IconWarning className="w-5 h-5" />}
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="font-extrabold text-sm">{toast.title}</h4>
                            <p className="text-xs font-semibold opacity-90">{toast.message}</p>
                            {toast.details && (
                                <p className="text-[11px] font-mono opacity-75 break-all pt-1">{toast.details}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setToast(null)}
                        className="text-gray-400 hover:text-gray-700 p-1 rounded-lg cursor-pointer"
                    >
                        <IconClose className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs text-center space-y-1">
                <h1 className="text-xl font-extrabold text-gray-900">Offline / Online Synchronization & Database Backup</h1>
                <p className="text-xs text-gray-500">Bidirectional Sync: Download Online Orders & Upload Offline Counter Sales</p>
                {syncStats.lastSyncAt && (
                    <div className="text-[11px] text-emerald-700 font-semibold pt-1">
                        Last Cloud Sync: {new Date(syncStats.lastSyncAt).toLocaleString()}
                    </div>
                )}
            </div>

            {/* Sync Queue Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs text-center">
                    <div className="text-xs text-gray-400 font-medium">Total Queued</div>
                    <div className="text-2xl font-extrabold text-gray-900">{syncStats.total || 0}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#F3E5AB] shadow-xs text-center">
                    <div className="text-xs text-[#B8860B] font-semibold">Pending Push</div>
                    <div className="text-2xl font-extrabold text-[#B8860B]">{syncStats.pending || 0}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs text-center">
                    <div className="text-xs text-emerald-700 font-medium">Synced to Cloud</div>
                    <div className="text-2xl font-extrabold text-emerald-700">{syncStats.synced || 0}</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs text-center">
                    <div className="text-xs text-rose-600 font-medium">Failed / Retry</div>
                    <div className="text-2xl font-extrabold text-rose-600">{syncStats.failed || 0}</div>
                </div>
            </div>

            {/* Auto-Sync Engine Schedule & Control Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        syncStats.autoSyncEnabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}>
                        <IconSync className={`w-5 h-5 ${syncStats.autoSyncEnabled ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-gray-900">Background Auto-Sync</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                syncStats.autoSyncEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                            }`}>
                                {syncStats.autoSyncEnabled ? 'ACTIVE / RUNNING' : 'STOPPED / PAUSED'}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            {syncStats.autoSyncEnabled 
                                ? `Syncing automatically every ${syncStats.syncIntervalMinutes || 3} minute(s)` 
                                : 'Auto-sync is stopped. Transactions are synced only when triggered manually.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={async () => {
                            const newStatus = !syncStats.autoSyncEnabled;
                            const token = localStorage.getItem('token');
                            try {
                                await fetch('http://localhost:5000/api/sync/config', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ auto_sync_enabled: String(newStatus) })
                                });
                                fetchSyncStatus();
                                showToast(
                                    newStatus ? 'Auto-Sync Resumed' : 'Auto-Sync Paused',
                                    newStatus ? 'Background auto-sync is now active.' : 'Background auto-sync has been stopped.',
                                    newStatus ? 'success' : 'info'
                                );
                            } catch (e) {
                                console.error('Failed to toggle auto sync:', e);
                            }
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                            syncStats.autoSyncEnabled 
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                    >
                        {syncStats.autoSyncEnabled ? 'Stop Auto-Sync' : 'Resume Auto-Sync'}
                    </button>
                    <a
                        href="/settings"
                        className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
                    >
                        Change Time in Settings
                    </a>
                </div>
            </div>

            {/* Sync Action Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-6 space-y-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEF9E7] border border-[#F3E5AB] flex items-center justify-center text-[#B8860B]">
                    <IconSync className={`w-8 h-8 ${isSyncing ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Two-Way Cloud Server Synchronization</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                    When you click Sync, the app <strong>downloads new products & orders created online</strong> from Supabase Cloud into your local counter SQLite database, and <strong>pushes offline sales</strong> up to the cloud.
                </p>

                {syncFeedback && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 animate-fadeIn">
                        {syncFeedback}
                    </div>
                )}

                <div className="pt-2 flex justify-center gap-3">
                    <button
                        onClick={handleTriggerSync}
                        disabled={isSyncing}
                        className="px-6 py-3 gold-gradient text-white font-extrabold text-xs rounded-xl shadow-md disabled:opacity-50 cursor-pointer hover:opacity-90 transition-all flex items-center gap-2"
                    >
                        <IconSync className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Syncing Bidirectionally...' : 'Trigger Cloud Sync Now (Pull & Push)'}</span>
                    </button>
                    <button
                        onClick={fetchSyncStatus}
                        className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
                    >
                        Refresh Queue Status
                    </button>
                </div>
            </div>

            {/* DATABASE LEAN OPTIMIZER (VACUUM & AUTO-PRUNING) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                            <IconBolt className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-gray-900 text-sm">Ultra-Lean Database Optimizer (VACUUM)</h3>
                            <p className="text-[11px] text-gray-500">
                                Prune old synced queue entries, defragment indexes, and compact disk space to 5–8 MB
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleCompactDatabase}
                        disabled={compacting}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                        <IconBolt className={`w-4 h-4 ${compacting ? 'animate-spin' : ''}`} />
                        <span>{compacting ? 'Compacting Database...' : 'Compact & Shrink DB Now'}</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="text-gray-500 font-medium text-[11px]">Auto-Pruning Policy</div>
                        <div className="text-gray-900 font-extrabold mt-0.5">3-Day Synced Retention</div>
                        <p className="text-[10px] text-gray-400 mt-1">Pushed transactions older than 3 days are purged to avoid bloat.</p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="text-gray-500 font-medium text-[11px]">Storage Engine</div>
                        <div className="text-emerald-700 font-extrabold mt-0.5">SQLite WAL + Incremental</div>
                        <p className="text-[10px] text-gray-400 mt-1">Non-blocking writes with auto-checkpoints for maximum speed.</p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="text-gray-500 font-medium text-[11px]">7-Month Target Size</div>
                        <div className="text-indigo-700 font-extrabold mt-0.5">&lt; 7 MB Production</div>
                        <p className="text-[10px] text-gray-400 mt-1">Keeps full wholesale ledger lean just like high-traffic POS setups.</p>
                    </div>
                </div>

                {compactResult && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                        <div>
                            <strong>Optimization Complete:</strong> Current size: {compactResult.sizeAfterFormatted} (Reduced from {compactResult.sizeBeforeFormatted}).
                        </div>
                        <span className="font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                            Freed {compactResult.freedFormatted}
                        </span>
                    </div>
                )}
            </div>

            {/* Local Database Backup & Restore with Target Folder Selector (Admin Only) */}
            {user?.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-6 space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div>
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                                <IconSettings className="w-5 h-5 text-[#B8860B]" />
                                <span>Local SQLite Database Backups</span>
                            </h3>
                            <p className="text-[11px] text-gray-500">
                                Create instant, defragmented snapshots directly to any folder, USB drive, or network share
                            </p>
                        </div>

                        <button
                            onClick={handleCreateBackup}
                            disabled={backingUp}
                            className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-extrabold text-xs shadow-md disabled:opacity-50 cursor-pointer transition-all flex items-center gap-2"
                        >
                            {backingUp ? (
                                <>
                                    <IconSync className="w-4 h-4 animate-spin" />
                                    <span>Creating Snapshot...</span>
                                </>
                            ) : (
                                <>
                                    <IconPlus className="w-4 h-4" />
                                    <span>Create Backup Now</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* FOLDER SELECTION BAR */}
                    <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5 min-w-0 flex-1">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                                Destination Backup Folder:
                            </span>
                            <div className="font-mono font-bold text-gray-800 text-[11px] truncate">
                                {selectedFolder || defaultBackupFolder || 'Default App Backups Folder (Backups/)'}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleSelectFolder}
                                className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                            >
                                <span>📁 Choose Folder...</span>
                            </button>
                            {selectedFolder && (
                                <button
                                    type="button"
                                    onClick={handleResetFolder}
                                    className="px-2.5 py-1.5 text-gray-500 hover:text-gray-800 text-xs font-semibold"
                                    title="Reset to default folder"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Available Backup Files List */}
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                            Available Backup Files ({backups.length}):
                        </div>
                        {backups.length === 0 ? (
                            <div className="text-xs text-gray-400 p-6 text-center border rounded-xl bg-gray-50/50">
                                No backups found in this folder. Click &ldquo;Create Backup Now&rdquo; to make your first snapshot.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {backups.map((b, idx) => (
                                    <div key={idx} className="bg-gray-50 hover:bg-gray-100/70 transition-colors p-3 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                                        <div className="min-w-0 flex-1 pr-3">
                                            <div className="font-bold font-mono text-gray-900 truncate">{b.fileName}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                Created: {new Date(b.createdAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="inline-block px-2 py-0.5 bg-white border border-gray-200 rounded font-mono font-bold text-gray-700 text-[11px]">
                                                {(b.size / 1024).toFixed(1)} KB
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CUSTOM IN-APP MODAL: SELECT BACKUP FOLDER */}
            {showFolderModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 max-w-lg w-full p-6 space-y-5">
                        <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-lg">
                                    📁
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-gray-900 text-base">Select Backup Destination Folder</h3>
                                    <p className="text-xs text-gray-500">Choose where database backup files will be saved</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFolderModal(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl cursor-pointer"
                            >
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700 block">
                                Folder Path on this Computer / Drive:
                            </label>
                            <input
                                type="text"
                                value={folderInput}
                                onChange={(e) => setFolderInput(e.target.value)}
                                placeholder="e.g. D:\Backups or E:\USB_Backup"
                                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-[#B8860B] focus:ring-2 focus:ring-[#B8860B]/20 text-xs font-mono font-semibold text-gray-900 outline-none"
                            />
                        </div>

                        {/* Quick Presets */}
                        <div className="space-y-1.5">
                            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Quick Presets:</div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFolderInput(defaultBackupFolder || 'D:\\My WorkSpace\\Hilal Wholesaler shop\\Backups')}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 cursor-pointer"
                                >
                                    🏠 App Default (Backups/)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFolderInput('D:\\Backups')}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 cursor-pointer"
                                >
                                    💾 D:\Backups
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFolderInput('C:\\HilalBackups')}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 cursor-pointer"
                                >
                                    💾 C:\HilalBackups
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFolderInput('E:\\')}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 cursor-pointer"
                                >
                                    🔌 E:\ (USB Drive)
                                </button>
                            </div>
                        </div>

                        {/* Hidden Native Directory Selector Input */}
                        <input
                            type="file"
                            ref={fileFolderInputRef}
                            {...{ webkitdirectory: '', directory: '' }}
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const files = e.target.files;
                                if (files && files.length > 0) {
                                    const firstFile = files[0];
                                    const fullPath = firstFile.path;
                                    if (fullPath) {
                                        const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/')));
                                        if (dir) {
                                            setFolderInput(dir);
                                            return;
                                        }
                                    }
                                    if (firstFile.webkitRelativePath) {
                                        const rootFolder = firstFile.webkitRelativePath.split('/')[0];
                                        if (rootFolder) setFolderInput(rootFolder);
                                    }
                                }
                            }}
                        />

                        {/* Native Picker Trigger */}
                        <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs">
                            <span className="text-amber-900 font-medium">Or pick folder visually from PC:</span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (fileFolderInputRef.current) {
                                        fileFolderInputRef.current.click();
                                    }
                                }}
                                className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5"
                            >
                                <span>🖥️ Browse Computer...</span>
                            </button>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setShowFolderModal(false)}
                                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const trimmed = folderInput.trim();
                                    if (trimmed) {
                                        setSelectedFolder(trimmed);
                                        localStorage.setItem('preferred_backup_folder', trimmed);
                                        fetchBackups(trimmed);
                                        showToast('Backup Destination Set', `Backups will now be saved to: ${trimmed}`, 'success');
                                    }
                                    setShowFolderModal(false);
                                }}
                                className="px-5 py-2.5 gold-gradient text-white text-xs font-extrabold rounded-xl shadow-md hover:opacity-95 cursor-pointer"
                            >
                                Confirm & Save Destination
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
