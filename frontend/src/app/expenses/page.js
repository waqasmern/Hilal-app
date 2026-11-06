'use client';
import React, { useState, useEffect } from 'react';
import { IconPlus, IconClose } from '../components/Icons';

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState([]);
    const [addModalOpen, setAddModalOpen] = useState(false);

    const [category, setCategory] = useState('Shop Rent');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');

    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/expenses');
            if (res.ok) setExpenses(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveExpense = async (e) => {
        e.preventDefault();
        if (!amount || !description) return alert('Amount and Description required');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ category, amount: parseFloat(amount), description, payment_method: paymentMethod })
            });

            if (res.ok) {
                setAddModalOpen(false);
                setAmount('');
                setDescription('');
                fetchExpenses();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to record expense');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    const categoriesList = [
        'Shop Rent', 'Electricity', 'Transport', 'Salary', 
        'Loading/Unloading', 'Fuel', 'Maintenance', 'Other'
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900">Operational Shop Expenses</h1>
                    <p className="text-xs text-gray-500">Record Rent, Electricity, Salaries, Fuel, Transport & Maintenance for P&L calculations</p>
                </div>
                <button
                    onClick={() => setAddModalOpen(true)}
                    className="px-4 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 transition-colors"
                >
                    <IconPlus className="w-4 h-4" />
                    <span>Record Shop Expense</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                            <th className="p-3">Date</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Description</th>
                            <th className="p-3 text-right">Amount (Rs)</th>
                            <th className="p-3">Method</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {expenses.map((e) => (
                            <tr key={e.id} className="hover:bg-gray-50/50">
                                <td className="p-3 text-gray-600">{new Date(e.created_at).toLocaleDateString()}</td>
                                <td className="p-3 font-bold text-[#0B3B7B]">{e.category}</td>
                                <td className="p-3 font-semibold text-gray-800">{e.description}</td>
                                <td className="p-3 text-right font-extrabold text-rose-600">Rs. {e.amount.toLocaleString()}</td>
                                <td className="p-3 uppercase font-bold text-gray-500">{e.payment_method}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ADD EXPENSE MODAL */}
            {addModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleSaveExpense} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-bold text-gray-900 text-base">Record Operational Expense</h3>
                            <button type="button" onClick={() => setAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold mb-1">Expense Category</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-bold bg-white"
                                >
                                    {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Amount (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-extrabold text-sm text-rose-600"
                                />
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Description / Particulars</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Explain expense details..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl font-bold text-xs transition-colors">
                                Cancel
                            </button>
                            <button type="submit" className="flex-1 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-bold text-xs shadow-md transition-colors">
                                Save Expense
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
