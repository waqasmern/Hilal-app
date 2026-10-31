'use client';
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { IconUsersAudit, IconReports, IconPlus, IconClose } from '../components/Icons';

export default function UsersPage() {
    const { user } = useSelector(state => state.auth);
    const router = useRouter();

    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'audit'

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('cashier');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        if (user && user.role !== 'admin') {
            router.push('/pos');
            return;
        }
        fetchUsers();
        fetchAuditLogs();
    }, [user, router]);

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setUsers(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/system/audit-logs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setAuditLogs(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ username, password, role, full_name: fullName, phone })
            });

            if (res.ok) {
                setAddModalOpen(false);
                setUsername('');
                setPassword('');
                setFullName('');
                setPhone('');
                fetchUsers();
                fetchAuditLogs();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create user');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteUser = async (id) => {
        if (!confirm('Are you sure you want to deactivate this user?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:5000/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchUsers();
                fetchAuditLogs();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete user');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900">User Management & Security Audit Logs</h1>
                    <p className="text-xs text-gray-500">Configure Cashier & Admin accounts, manage permissions & review audit trails</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'users' ? 'gold-gradient text-white shadow-xs' : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                        <span className="flex items-center gap-1.5">
                            <IconUsersAudit className="w-4 h-4" />
                            <span>System Users</span>
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === 'audit' ? 'gold-gradient text-white shadow-xs' : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                        <span className="flex items-center gap-1.5">
                            <IconReports className="w-4 h-4" />
                            <span>Audit Logs</span>
                        </span>
                    </button>
                    {activeTab === 'users' && (
                        <button
                            onClick={() => setAddModalOpen(true)}
                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                        >
                            <IconPlus className="w-4 h-4" />
                            <span>Add New User</span>
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'users' ? (
                /* USERS TABLE */
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                                <th className="p-3">User ID</th>
                                <th className="p-3">Username</th>
                                <th className="p-3">Full Name</th>
                                <th className="p-3">Role</th>
                                <th className="p-3">Phone</th>
                                <th className="p-3">Created Date</th>
                                <th className="p-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50/50">
                                    <td className="p-3 font-mono text-gray-400">#{u.id}</td>
                                    <td className="p-3 font-bold text-gray-900">{u.username}</td>
                                    <td className="p-3 font-medium text-gray-700">{u.full_name || 'N/A'}</td>
                                    <td className="p-3">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            u.role === 'admin' ? 'bg-[#FEF9E7] text-[#B8860B] border border-[#F3E5AB]' : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="p-3 text-gray-500 font-medium">{u.phone || '-'}</td>
                                    <td className="p-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                                    <td className="p-3 text-center">
                                        {u.id !== user?.id && (
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-bold text-xs"
                                            >
                                                Deactivate
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* AUDIT LOGS TABLE */
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                                <th className="p-3">Timestamp</th>
                                <th className="p-3">Action</th>
                                <th className="p-3">User</th>
                                <th className="p-3">Entity</th>
                                <th className="p-3">Details / Reference</th>
                                <th className="p-3">Device</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {auditLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50/50">
                                    <td className="p-3 text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                                    <td className="p-3 font-bold text-[#B8860B]">{log.action}</td>
                                    <td className="p-3 font-semibold text-gray-800">{log.username || 'System'}</td>
                                    <td className="p-3 text-gray-600 font-mono text-[11px]">{log.entity_name} #{log.entity_id}</td>
                                    <td className="p-3 text-gray-700 max-w-xs truncate">{log.details || '-'}</td>
                                    <td className="p-3 font-mono text-[10px] text-gray-400">{log.device_id}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ADD USER MODAL */}
            {addModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleCreateUser} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-bold text-gray-900 text-base">Add New System User</h3>
                            <button type="button" onClick={() => setAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold mb-1">Username (Login ID)</label>
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="e.g. cashier2"
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Password</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Role & Permissions</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-bold bg-white"
                                >
                                    <option value="cashier">Cashier (POS, Sales & Payments Only)</option>
                                    <option value="admin">Admin (Full System Access)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Staff Member Name"
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Phone</label>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="0300..."
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 py-2 border rounded-xl font-bold text-xs">
                                Cancel
                            </button>
                            <button type="submit" className="flex-1 py-2 gold-gradient text-white rounded-xl font-bold text-xs shadow-md">
                                Create User
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
