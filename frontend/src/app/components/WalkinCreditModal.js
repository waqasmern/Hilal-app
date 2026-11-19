'use client';
import React, { useState, useEffect, useRef } from 'react';
import { IconCustomers, IconClose, IconWarning } from './Icons';

export default function WalkinCreditModal({
    isOpen,
    remainingBalance = 0,
    initialData = { name: '', phone: '', address: 'Timergara' },
    onClose,
    onSubmit
}) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('Timergara');
    const [error, setError] = useState('');
    const nameInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || '');
            setPhone(initialData?.phone || '');
            setAddress(initialData?.address || 'Timergara');
            setError('');
            // Instant auto-focus without delay
            const timer = setTimeout(() => {
                nameInputRef.current?.focus();
            }, 40);
            return () => clearTimeout(timer);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();
        const trimmedAddr = address.trim() || 'Timergara';

        if (!trimmedName || trimmedName.toLowerCase() === 'walk-in customer' || trimmedName.toLowerCase() === 'walk-in' || trimmedName.toLowerCase() === 'walkin') {
            setError('Please enter the customer\'s real name (گاہک کا اصل نام لکھیں)');
            return;
        }
        if (!trimmedPhone) {
            setError('Please enter the customer\'s mobile phone number (موبائل نمبر درج کریں)');
            return;
        }
        if (trimmedPhone.length < 7) {
            setError('Please enter a valid mobile number (کم از کم 7 ہندسے)');
            return;
        }

        onSubmit({
            name: trimmedName,
            phone: trimmedPhone,
            address: trimmedAddr
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-gray-100">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0B3B7B] border border-blue-200 flex items-center justify-center shrink-0">
                            <IconCustomers className="w-5 h-5 text-[#0B3B7B]" />
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-gray-900 leading-snug">
                                Customer Details Required
                            </h3>
                            <p className="text-xs font-semibold text-gray-500">
                                ادھار کھاتہ کیلئے گاہک کا نام اور فون نمبر لازمی ہے
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        <IconClose className="w-4 h-4" />
                    </button>
                </div>

                {/* Bill Summary Alert */}
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Unpaid Due Balance:</span>
                        <p className="text-base font-black text-rose-600 font-mono">
                            Rs. {remainingBalance.toLocaleString()}
                        </p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                        Pending / Partial Sale
                    </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                    Since this bill has an unpaid/partial balance, please enter the customer's <strong>Real Name</strong> and <strong>Mobile Phone Number</strong> to record the debt in their customer ledger.
                </p>

                {error && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-1.5">
                        <IconWarning className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Form Fields */}
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-800 mb-1">
                            Customer Full Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            required
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (error) setError('');
                            }}
                            placeholder="e.g. Ishaq Khan"
                            className="w-full py-2 px-3 rounded-xl border border-gray-300 text-xs font-bold bg-white focus:outline-none focus:border-[#0B3B7B] focus:ring-1 focus:ring-[#0B3B7B]"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-800 mb-1">
                            Mobile / Phone Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => {
                                setPhone(e.target.value);
                                if (error) setError('');
                            }}
                            placeholder="e.g. 03001234567"
                            className="w-full py-2 px-3 rounded-xl border border-gray-300 text-xs font-bold font-mono bg-white focus:outline-none focus:border-[#0B3B7B] focus:ring-1 focus:ring-[#0B3B7B]"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-800 mb-1">
                            Shop / Address <span className="text-gray-400 font-normal">(Optional)</span>
                        </label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="e.g. Royal Dir Restaurant, Timergara"
                            className="w-full py-2 px-3 rounded-xl border border-gray-300 text-xs font-medium bg-white focus:outline-none focus:border-[#0B3B7B] focus:ring-1 focus:ring-[#0B3B7B]"
                        />
                    </div>

                    {/* Modal Footer Buttons */}
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 cursor-pointer transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 rounded-xl bg-[#0B3B7B] hover:bg-[#092e60] text-white font-extrabold text-xs shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            <span>✓ Save & Complete Invoice</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

