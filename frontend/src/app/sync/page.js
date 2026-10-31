'use client';
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { IconSync, IconSettings, IconPlus } from '../components/Icons';

export default function SyncPage() {
    const { user } = useSelector(state => state.auth);
    const [syncStats, setSyncStats] = useState({ total: 0, pending: 0, syncing: 0, synced: 0, failed: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [backups, setBackups] = useState([]);
    const [backingUp, setBackingUp] = useState(false);

    useEffect(() => {
        fetchSyncStatus();
        if (user?.role === 'admin') {
            fetchBackups();
        }
    }, [user]);

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

    const fetchBackups = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/system/backups', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setBackups(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const handleTriggerSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('http://localhost:5000/api/sync/trigger', { method: 'POST' });
            if (res.ok) {
                fetchSyncStatus();
            }
        } catch (err) {
            alert('Sync failed: ' + err.message);
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
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Database backup created successfully: ${data.backupFileName}`);
                fetchBackups();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create backup');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setBackingUp(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs text-center space-y-1">
                <h1 className="text-xl font-extrabold text-gray-900">Offline / Online Synchronization & Database Backup</h1>
                <p className="text-xs text-gray-500">Outbox Transaction Queue, Push/Pull Engine & SQLite Local Backup Manager</p>
            </div>

            {/* Sync Queue Overview */}
            <div className="grid grid-cols-4 gap-4">
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

            {/* Sync Action Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-6 space-y-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEF9E7] border border-[#F3E5AB] flex items-center justify-center text-[#B8860B]">
                    <IconSync className={`w-8 h-8 ${isSyncing ? 'animate-spin' : ''}`} />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Cloud Server Synchronization</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                    All offline transactions are safely stored in local SQLite outbox queue (`sync_queue`) with UUID idempotency signatures. Clicking Sync pushes all pending sales, payments & inventory movements to cloud PostgreSQL.
                </p>

                <div className="pt-2 flex justify-center gap-3">
                    <button
                        onClick={handleTriggerSync}
                        disabled={isSyncing}
                        className="px-6 py-3 gold-gradient text-white font-extrabold text-xs rounded-xl shadow-md disabled:opacity-50"
                    >
                        {isSyncing ? 'Syncing with Server...' : 'Trigger Cloud Sync Now'}
                    </button>
                    <button
                        onClick={fetchSyncStatus}
                        className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl"
                    >
                        Refresh Queue Status
                    </button>
                </div>
            </div>

            {/* Local Database Backup & Restore (Admin Only) */}
            {user?.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-6 space-y-4">
                    <div className="flex justify-between items-center border-b pb-3">
                        <div>
                            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                <IconSettings className="w-5 h-5 text-[#B8860B]" />
                                <span>Local SQLite Database Backups</span>
                            </h3>
                            <p className="text-xs text-gray-500">Safely backup current SQLite database file to Backups folder</p>
                        </div>
                        <button
                            onClick={handleCreateBackup}
                            disabled={backingUp}
                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-xs shadow-md disabled:opacity-50"
                        >
                            {backingUp ? 'Creating Backup...' : (
                                <span className="flex items-center gap-1.5">
                                    <IconPlus className="w-4 h-4" />
                                    <span>Create Backup Now</span>
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">Available Backup Files:</div>
                        {backups.length === 0 ? (
                            <div className="text-xs text-gray-400 p-4 text-center border rounded-xl bg-gray-50">
                                No local backups created yet
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {backups.map((b, idx) => (
                                    <div key={idx} className="bg-gray-50 p-3 rounded-xl border flex items-center justify-between text-xs">
                                        <div>
                                            <div className="font-bold font-mono text-gray-900">{b.fileName}</div>
                                            <div className="text-[10px] text-gray-400">Created: {new Date(b.createdAt).toLocaleString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-semibold text-gray-600">{(b.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
