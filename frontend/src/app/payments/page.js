'use client';
import React, { useState, useEffect } from 'react';
import { IconPlus, IconClose } from '../components/Icons';

export default function PaymentsPage() {
    const [payments, setPayments] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [partyType, setPartyType] = useState('customer');
    const [partyId, setPartyId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchPayments();
        fetchCustomers();
        fetchSuppliers();
    }, []);

    const fetchPayments = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/payments');
            if (res.ok) setPayments(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCustomers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/customers');
            if (res.ok) {
                const data = await res.json();
                setCustomers(data);
                if (data.length > 0 && partyType === 'customer') setPartyId(data[0].id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/suppliers');
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data);
                if (data.length > 0 && partyType === 'supplier') setPartyId(data[0].id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSavePayment = async (e) => {
        e.preventDefault();
        if (!partyId || !amount) return alert('Party and Amount required!');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    party_type: partyType,
                    party_id: partyId,
                    amount: parseFloat(amount),
                    payment_method: paymentMethod,
                    reference_no: referenceNo,
                    notes
                })
            });

            if (res.ok) {
                setAddModalOpen(false);
                setAmount('');
                setReferenceNo('');
                setNotes('');
                fetchPayments();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to record payment');
            }
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900">Direct Payment Vouchers</h1>
                    <p className="text-xs text-gray-500">Record Customer Receipts & Supplier Payments (Cash, Bank, Easypaisa, JazzCash, Cheque)</p>
                </div>
                <button
                    onClick={() => setAddModalOpen(true)}
                    className="px-4 py-2.5 gold-gradient text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                    <IconPlus className="w-4 h-4" />
                    <span>Record Payment Voucher</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                            <th className="p-3">Date</th>
                            <th className="p-3">Party Type</th>
                            <th className="p-3">Party ID</th>
                            <th className="p-3 text-right">Amount (Rs)</th>
                            <th className="p-3">Payment Method</th>
                            <th className="p-3">Ref No / Notes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {payments.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50/50">
                                <td className="p-3 text-gray-600">{new Date(p.created_at).toLocaleDateString()}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        p.party_type === 'customer' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                    }`}>
                                        {p.party_type}
                                    </span>
                                </td>
                                <td className="p-3 font-semibold text-gray-800">{p.party_id}</td>
                                <td className="p-3 text-right font-extrabold text-emerald-700">Rs. {p.amount.toLocaleString()}</td>
                                <td className="p-3 font-bold uppercase text-[#B8860B]">{p.payment_method}</td>
                                <td className="p-3 text-gray-500 font-medium">{p.reference_no || p.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ADD PAYMENT MODAL */}
            {addModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleSavePayment} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-bold text-gray-900 text-base">New Payment Voucher</h3>
                            <button type="button" onClick={() => setAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold mb-1">Party Type</label>
                                <select
                                    value={partyType}
                                    onChange={(e) => {
                                        setPartyType(e.target.value);
                                        setPartyId(e.target.value === 'customer' ? (customers[0]?.id || '') : (suppliers[0]?.id || ''));
                                    }}
                                    className="w-full p-2 border rounded-lg font-bold bg-white"
                                >
                                    <option value="customer">Customer Payment Received</option>
                                    <option value="supplier">Supplier Payment Paid</option>
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Select Party</label>
                                <select
                                    value={partyId}
                                    onChange={(e) => setPartyId(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-semibold bg-white"
                                >
                                    {partyType === 'customer' ? (
                                        customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.business_name})</option>)
                                    ) : (
                                        suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.company_name})</option>)
                                    )}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block font-bold mb-1">Amount (Rs.)</label>
                                    <input
                                        type="number"
                                        required
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full p-2 border rounded-lg font-extrabold text-sm text-emerald-700"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold mb-1">Method</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full p-2 border rounded-lg font-semibold bg-white"
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="bank">Bank Transfer</option>
                                        <option value="easypaisa">Easypaisa</option>
                                        <option value="jazzcash">JazzCash</option>
                                        <option value="cheque">Cheque</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Reference No / TRX ID</label>
                                <input
                                    type="text"
                                    value={referenceNo}
                                    onChange={(e) => setReferenceNo(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold mb-1">Notes</label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full p-2 border rounded-lg font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 py-2 border rounded-xl font-bold text-xs">
                                Cancel
                            </button>
                            <button type="submit" className="flex-1 py-2 gold-gradient text-white rounded-xl font-bold text-xs shadow-md">
                                Save Payment Voucher
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
