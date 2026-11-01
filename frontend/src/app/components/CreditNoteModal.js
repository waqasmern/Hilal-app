'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
    IconPrinter, IconWhatsApp, IconDownload, IconClose, IconSpinner, IconReturn
} from './Icons';
import { triggerPrint } from '../../lib/printHelper';
import { apiUrl } from '../../lib/api';

function formatDisplayDate(dateInput) {
    if (!dateInput) return '-';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
        return String(dateInput);
    }
}

export default function CreditNoteModal({
    isOpen,
    onClose,
    returnId,
    initialData = null,
    settings = {}
}) {
    const [loading, setLoading] = useState(false);
    const [creditNote, setCreditNote] = useState(initialData);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [sendingWa, setSendingWa] = useState(false);
    const [waFeedback, setWaFeedback] = useState(null);
    const printRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setWaFeedback(null);
            return;
        }

        if (initialData && initialData.items && initialData.items.length > 0) {
            setCreditNote(initialData);
        } else if (returnId) {
            fetchReturnDetails(returnId);
        }
    }, [isOpen, returnId, initialData]);

    const fetchReturnDetails = async (id) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(apiUrl(`/api/sales/returns/${id}`), { headers });
            if (res.ok) {
                const data = await res.json();
                setCreditNote(data);
            } else {
                console.error('Failed to load credit note details');
            }
        } catch (err) {
            console.error('Error fetching credit note:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Financial & Customer Calculations
    const cnNumber = creditNote?.cn_number || `CN-${String(creditNote?.id || returnId || '1').padStart(5, '0')}`;
    const shopName = settings?.shop_name || creditNote?.shop?.shop_name || 'Hilal Wholesaler Shop';
    const shopAddress = settings?.shop_address || creditNote?.shop?.shop_address || 'Main Market, Timergara, Lower Dir, KP';
    const shopEmail = settings?.shop_email || creditNote?.shop?.shop_email || 'hilalwholesaler@gmail.com';
    const shopPhone = settings?.shop_phone || creditNote?.shop?.shop_phone || '0945-825555 / 0306-0888300';

    const customerName = creditNote?.customer_name || 'Walk-in Customer';
    const businessName = creditNote?.customer_business || creditNote?.business_name || '';
    const customerAddress = creditNote?.customer_address || 'Timergara';
    const customerPhone = creditNote?.customer_phone || creditNote?.customer_mobile || creditNote?.phone || '';
    const currentCustomerBalance = Number(creditNote?.current_customer_balance || 0);

    const items = creditNote?.items || [];
    const totalRefund = parseFloat(creditNote?.total_refund) || items.reduce((sum, it) => sum + ((parseFloat(it.refund_price || it.unit_price || 0)) * (parseFloat(it.quantity || 0))), 0);
    const originalInvoiceNo = creditNote?.original_invoice_no || (creditNote?.remarks ? creditNote.remarks.replace(/^Customer return for invoice /i, '').split(' ')[0] : 'N/A');
    const returnType = creditNote?.return_type || 'saleable';
    const refundMethod = creditNote?.refund_method || 'credit';

    // 1. Download Backend PDF Attachment
    const handleDownloadPdf = async () => {
        const idToFetch = creditNote?.id || returnId;
        if (!idToFetch) return;

        setDownloadingPdf(true);
        try {
            const res = await fetch(apiUrl(`/api/sales/returns/${idToFetch}/pdf`));
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Credit_Note_${cnNumber}_${(customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Could not generate PDF. Please try again.');
            }
        } catch (err) {
            console.error('PDF download error:', err);
            alert('Failed to download PDF: ' + err.message);
        } finally {
            setDownloadingPdf(false);
        }
    };

    // 2. Direct Print A4 / Native Electron Print
    const handlePrintCreditNote = async () => {
        const printElem = printRef.current;
        if (!printElem) {
            window.print();
            return;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Credit Note ${cnNumber}</title>
                <style>
                    @page { size: A4 portrait; margin: 12mm 15mm; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 0; background: #fff; }
                    .table-header { background-color: #2e2e2e !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .highlight-box { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 8px 10px; }
                </style>
            </head>
            <body>
                ${printElem.innerHTML}
            </body>
            </html>
        `;

        try {
            await triggerPrint(htmlContent, false, null, 'a4');
        } catch (err) {
            window.print();
        }
    };

    // 3. Send via WhatsApp (Direct PDF or WhatsApp Web fallback)
    const handleSendWhatsApp = async () => {
        const idToSend = creditNote?.id || returnId;
        if (!idToSend) return;

        setSendingWa(true);
        setWaFeedback(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(apiUrl(`/api/sales/returns/${idToSend}/send-whatsapp`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ phone: customerPhone })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setWaFeedback({ type: 'success', text: `Credit Note #${cnNumber} sent via WhatsApp to ${customerPhone}!` });
            } else {
                // If Baileys disconnected, provide fallback
                if (data.whatsapp_url) {
                    window.open(data.whatsapp_url, '_blank');
                    setWaFeedback({ type: 'info', text: 'Opened WhatsApp Web with pre-filled Credit Note message. You can attach the downloaded PDF.' });
                } else {
                    setWaFeedback({ type: 'error', text: data.error || 'Failed to send WhatsApp message.' });
                }
            }
        } catch (err) {
            console.error('WhatsApp error:', err);
            setWaFeedback({ type: 'error', text: err.message });
        } finally {
            setSendingWa(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-3xl w-full flex flex-col shadow-2xl border border-gray-200 overflow-hidden my-4 max-h-[94vh]">
                
                {/* 1. TOP ACTION BAR (Clean, Compact & Premium) */}
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5 sm:py-2.5 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center">
                            <IconReturn className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <div className="font-extrabold text-gray-900 text-xs sm:text-sm leading-none">
                                Official Credit Note
                            </div>
                            <div className="text-[10px] font-bold text-purple-700 font-mono mt-0.5">
                                #{cnNumber} • {customerName}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={downloadingPdf}
                            style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                            className="px-2.5 py-1 rounded-lg font-bold text-[11px] hover:bg-gray-100 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                            title="Download Official A4 Credit Note PDF"
                        >
                            <IconDownload className="w-3 h-3 text-gray-700" />
                            <span>{downloadingPdf ? 'Exporting...' : 'Download PDF'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleSendWhatsApp}
                            disabled={sendingWa}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                            title="Send Credit Note directly via WhatsApp"
                        >
                            <IconWhatsApp className="w-3 h-3 text-white" />
                            <span>{sendingWa ? 'Sending...' : 'Send WhatsApp'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handlePrintCreditNote}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white px-2.5 py-1 rounded-lg font-bold text-[11px] hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Print Credit Note Voucher"
                        >
                            <IconPrinter className="w-3 h-3 text-white" />
                            <span>Print</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 cursor-pointer ml-1"
                        >
                            <IconClose className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Feedback Alert if WhatsApp sent */}
                {waFeedback && (
                    <div className={`px-4 py-1.5 text-[11px] font-bold border-b flex justify-between items-center ${
                        waFeedback.type === 'success' 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                            : (waFeedback.type === 'info' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-rose-50 text-rose-800 border-rose-200')
                    }`}>
                        <span>{waFeedback.text}</span>
                        <button onClick={() => setWaFeedback(null)} className="text-gray-500 hover:text-black">✕</button>
                    </div>
                )}

                {/* 2. SCROLLABLE CREDIT NOTE DOCUMENT (COMPACT & SLEEK TYPOGRAPHY) */}
                <div className="p-3 sm:p-5 overflow-y-auto flex-1 bg-gray-100 flex justify-center">
                    {loading ? (
                        <div className="py-16 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
                            <IconSpinner className="w-5 h-5 text-[#B8860B]" />
                            <span>Loading Credit Note #{cnNumber}...</span>
                        </div>
                    ) : (
                        <div 
                            ref={printRef}
                            className="bg-white rounded-xl shadow-md border border-gray-200 w-full max-w-xl sm:max-w-2xl p-5 sm:p-7 text-gray-900 font-sans"
                        >
                            {/* TOP HEADER */}
                            <div className="flex justify-between items-start pb-4">
                                {/* Left: Shop Name & Location */}
                                <div className="space-y-0.5">
                                    <h2 className="font-extrabold text-gray-900 text-sm sm:text-base tracking-tight">
                                        {shopName}
                                    </h2>
                                    <div className="text-[10px] text-gray-500 leading-tight">
                                        {shopAddress}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                        Pakistan
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-medium">
                                        {shopEmail}
                                    </div>
                                </div>

                                {/* Right: CREDIT NOTE in sleek, proportional typography */}
                                <div className="text-right">
                                    <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-wider leading-tight">
                                        CREDIT NOTE
                                    </h1>
                                    <div className="text-[10.5px] font-bold text-gray-600 font-mono mt-0.5">
                                        # {cnNumber}
                                    </div>
                                    <div className="mt-2.5">
                                        <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">
                                            {refundMethod === 'cash' ? 'Cash Refund Paid' : 'Credits Remaining'}
                                        </div>
                                        <div className="text-sm sm:text-base font-black text-gray-900 font-mono">
                                            PKR {totalRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* MID SECTION: BILL TO & METADATA */}
                            <div className="flex justify-between items-start pt-3 pb-3 border-t border-gray-100 text-xs">
                                {/* Bill To */}
                                <div className="space-y-0.5 max-w-[50%]">
                                    <div className="text-gray-400 font-bold uppercase text-[9px] tracking-wider mb-0.5">
                                        Bill To
                                    </div>
                                    <div className="font-extrabold text-gray-900 text-xs sm:text-[13px]">
                                        {customerName}
                                    </div>
                                    {businessName && businessName !== customerName && (
                                        <div className="font-semibold text-gray-700 text-[11px]">
                                            {businessName}
                                        </div>
                                    )}
                                    <div className="text-[10.5px] text-gray-500">
                                        {customerAddress}
                                    </div>
                                    {customerPhone && (
                                        <div className="text-[10px] text-gray-500 font-mono">
                                            Phone: {customerPhone}
                                        </div>
                                    )}
                                </div>

                                {/* Credit Date & Ref# */}
                                <div className="text-right space-y-1 min-w-[170px]">
                                    <div className="flex justify-between gap-3 text-[10.5px]">
                                        <span className="text-gray-400 font-medium">Credit Date :</span>
                                        <span className="font-extrabold text-gray-800">
                                            {formatDisplayDate(creditNote?.created_at)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-3 text-[10.5px]">
                                        <span className="text-gray-400 font-medium">Ref# :</span>
                                        <span className="font-bold text-gray-700 font-mono">
                                            {originalInvoiceNo}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-3 text-[10.5px]">
                                        <span className="text-gray-400 font-medium">Condition :</span>
                                        <span className="font-bold text-gray-700 uppercase text-[10px]">
                                            {returnType}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* ITEM TABLE (DARK HEADER BAR - COMPACT TYPOGRAPHY) */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-[#2b2b2b] text-white font-bold text-[9.5px]">
                                            <th className="py-1.5 px-2.5 w-7 text-center">#</th>
                                            <th className="py-1.5 px-2.5">Item &amp; Description</th>
                                            <th className="py-1.5 px-2.5">Unit / Pkg</th>
                                            <th className="py-1.5 px-2.5 text-center">Qty</th>
                                            <th className="py-1.5 px-2.5 text-right">Rate</th>
                                            <th className="py-1.5 px-2.5 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.length === 0 ? (
                                             <tr>
                                                <td colSpan={6} className="py-4 text-center text-gray-400 text-xs">
                                                    No returned items details found.
                                                </td>
                                            </tr>
                                        ) : (
                                            items.map((it, idx) => {
                                                const rate = parseFloat(it.refund_price || it.unit_price || it.price) || 0;
                                                const qty = parseFloat(it.quantity) || 0;
                                                const amount = rate * qty;
                                                const sku = it.sku;

                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50/50">
                                                        <td className="py-2 px-2.5 text-center text-gray-500 font-mono text-[10px]">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="py-2 px-2.5">
                                                            <div className="font-extrabold text-gray-900 text-[11px] leading-snug">
                                                                {it.product_name} {it.variant_name && it.variant_name !== 'Standard' ? `(${it.variant_name})` : ''}
                                                            </div>
                                                            {sku && (
                                                                <div className="text-[9px] text-gray-400 font-mono mt-0.5">
                                                                    SKU : {sku}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-gray-600 font-medium text-[10px]">
                                                            {it.packaging_name || it.base_unit || 'pcs'}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-center font-bold text-gray-900 font-mono text-[10.5px]">
                                                            {qty.toFixed(2)}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-medium text-gray-700 font-mono text-[10.5px]">
                                                            {rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-extrabold text-gray-900 font-mono text-[10.5px]">
                                                            {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* SUMMARY TOTALS */}
                            <div className="pt-3 border-t border-gray-200 flex justify-end">
                                <div className="w-56 space-y-1.5 text-xs">
                                    <div className="flex justify-between items-center text-gray-600 text-[10.5px]">
                                        <span className="font-medium">Sub Total</span>
                                        <span className="font-mono font-bold text-gray-800">
                                            {totalRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                                        <span className="font-extrabold text-gray-900 text-xs">Total</span>
                                        <span className="font-mono font-black text-gray-900 text-xs">
                                            PKR {totalRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    {/* Highlighted Gray Box */}
                                    <div className="bg-gray-100 p-2 rounded-lg flex justify-between items-center mt-1 border border-gray-200">
                                        <span className="font-bold text-gray-700 text-[10px]">
                                            {refundMethod === 'cash' ? 'Cash Refund Paid' : 'Credits Remaining'}
                                        </span>
                                        <span className="font-mono font-black text-gray-900 text-[11px]">
                                            PKR {totalRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* KHATA / SETTLEMENT EXPLANATION NOTE */}
                            <div className="mt-4 pt-2.5 border-t border-gray-100 text-[9.5px] text-gray-500 space-y-0.5">
                                <div className="font-bold text-gray-700 text-[10px]">
                                    Settlement Details:
                                </div>
                                {refundMethod === 'credit' ? (
                                    <p className="leading-relaxed">
                                        This Credit Note has been credited and adjusted into <span className="font-bold text-gray-800">{customerName}</span>'s Khata account. Current running due balance: <span className="font-bold text-gray-900 font-mono">Rs. {Math.round(currentCustomerBalance).toLocaleString()}</span>.
                                    </p>
                                ) : (
                                    <p className="leading-relaxed">
                                        Refund of <span className="font-bold text-gray-800 font-mono">Rs. {totalRefund.toLocaleString()}</span> was settled in cash from shop drawer. Customer ledger debt was not altered.
                                    </p>
                                )}
                            </div>

                            {/* FOOTER BAR */}
                            <div className="mt-6 pt-2 border-t border-gray-200 flex justify-between items-center text-[9px] text-gray-400">
                                <span>{shopName} • Thank you for your business</span>
                                <span>1</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. BOTTOM FOOTER CONTROLS */}
                <div className="shrink-0 px-4 py-2 sm:px-5 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                    <div className="text-[11px] text-gray-500 font-medium">
                        Credit Note #{cnNumber}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                        className="px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer shadow-2xs"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
