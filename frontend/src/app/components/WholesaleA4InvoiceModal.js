'use client';
import React, { useState } from 'react';
import {
    IconPrinter, IconWhatsApp, IconDownload, IconReceipt, IconClose, IconSpinner
} from './Icons';
import { triggerPrintHtml, generateWholesaleInvoiceA4Html, generateThermalReceiptHtml } from '../../lib/printHelper';

export function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    let s = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
        s = s.replace(' ', 'T');
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(dateInput) : d;
}

export function numberToWords(num) {
    if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
    num = Math.floor(Math.abs(num));
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function inWords(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
        if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
        if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
        return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    }
    return inWords(num) + ' Rupees Only';
}

export function getSalePaymentStatus(sale) {
    if (!sale) return 'PENDING';
    const net = Number(sale.net_amount) || 0;
    const paid = Number(sale.amount_paid) || 0;
    const remaining = sale.remaining_balance !== undefined && sale.remaining_balance !== null
        ? Number(sale.remaining_balance)
        : Math.max(0, net - paid);

    if (remaining <= 0 && (paid >= net || net === 0)) return 'PAID';
    if (paid > 0 && remaining > 0) return 'PARTIAL';
    if (paid <= 0) return 'PENDING';

    const ps = (sale.payment_status || '').toLowerCase();
    if (ps === 'paid') return 'PAID';
    if (ps === 'partial') return 'PARTIAL';
    if (ps === 'unpaid' || ps === 'pending') return 'PENDING';
    return remaining <= 0 ? 'PAID' : 'PENDING';
}

/**
 * Reusable, responsive Wholesale A4 Invoice Preview Modal.
 * Usable across POS, Sales, Customers, and anywhere wholesale bills need to be viewed, printed, or exported.
 */
export default function WholesaleA4InvoiceModal({
    isOpen,
    onClose,
    invoice,
    settings = {},
    prevBalance,
    newBalance,
    onOpenThermal,
    onPrintA4,
    onDownloadPdf,
    onSendWhatsApp,
    waSending = false,
    downloadingPdf = false,
    elemId = "printable-invoice-a4"
}) {
    const [internalDownloadingPdf, setInternalDownloadingPdf] = useState(false);

    if (!isOpen || !invoice) return null;

    // Default Bank Accounts
    const defaultBankAccounts = [
        {
            bank_name: 'Meezan Bank',
            account_title: settings?.shop_name || 'Hilal Wholesaler Shop',
            account_number: '0101-0102030405',
            iban: 'PK12MEZN0001010102030405',
            branch: 'Timergara Branch'
        }
    ];

    const bankAccounts = (() => {
        if (!settings?.bank_accounts) return defaultBankAccounts;
        if (Array.isArray(settings.bank_accounts)) {
            return settings.bank_accounts.length > 0 ? settings.bank_accounts : defaultBankAccounts;
        }
        try {
            const parsed = JSON.parse(settings.bank_accounts);
            return (Array.isArray(parsed) && parsed.length > 0) ? parsed : defaultBankAccounts;
        } catch {
            return defaultBankAccounts;
        }
    })();

    // Financial calculations
    const items = invoice.items || [];
    const grossVal = Number(
        invoice.gross_amount !== undefined && invoice.gross_amount !== null && parseFloat(invoice.gross_amount) > 0
            ? invoice.gross_amount
            : (items.reduce((sum, it) => sum + ((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0)), 0) || invoice.net_amount || 0)
    );
    const discVal = Number(invoice.discount || items.reduce((sum, it) => sum + (parseFloat(it.discount) || 0), 0) || 0);
    const specialDiscVal = Number(
        invoice.special_discount !== undefined && invoice.special_discount !== null
            ? invoice.special_discount
            : (invoice.specialDiscount || 0)
    );
    const chargesVal = Number(
        invoice.additional_charges !== undefined && invoice.additional_charges !== null
            ? invoice.additional_charges
            : (invoice.additionalCharges || invoice.charges || 0)
    );
    const netVal = Number(invoice.net_amount !== undefined ? invoice.net_amount : (grossVal - discVal - specialDiscVal + chargesVal));
    const paidVal = Number(invoice.amount_paid || 0);
    const remainingVal = Number(
        invoice.remaining_balance !== undefined && invoice.remaining_balance !== null
            ? invoice.remaining_balance
            : Math.max(0, netVal - paidVal)
    );

    const calculatedPrevBalance = prevBalance !== undefined && prevBalance !== null
        ? Number(prevBalance)
        : (invoice.current_customer_balance !== undefined
            ? (Number(invoice.current_customer_balance) - Number(invoice.remaining_balance || 0))
            : 0);

    const calculatedNewBalance = newBalance !== undefined && newBalance !== null
        ? Number(newBalance)
        : (invoice.current_customer_balance !== undefined
            ? Number(invoice.current_customer_balance)
            : (calculatedPrevBalance + remainingVal));

    const status = getSalePaymentStatus(invoice);

    // Intelligent Print Handler
    const handlePrint = async () => {
        if (onPrintA4) {
            onPrintA4();
            return;
        }

        const a4Printer = (settings?.selected_a4_printer || '').trim();
        const thermalPrinter = (settings?.selected_printer || '').trim();
        const isThermalTarget = (!a4Printer || a4Printer === 'same_as_thermal') && 
            /pos|80|receipt|thermal|blackcopper|xp-|xprinter|rpp/i.test(thermalPrinter);

        const targetPrinter = a4Printer && a4Printer !== 'same_as_thermal' ? a4Printer : thermalPrinter;
        const isSilent = settings?.silent_print === 'true' && targetPrinter !== 'os_dialog';

        let htmlContent = '';
        if (isThermalTarget) {
            htmlContent = generateThermalReceiptHtml(
                invoice,
                settings,
                'Cashier',
                calculatedPrevBalance,
                calculatedNewBalance
            );
        } else {
            htmlContent = generateWholesaleInvoiceA4Html(
                invoice,
                settings,
                calculatedPrevBalance,
                calculatedNewBalance
            );
        }

        await triggerPrintHtml(htmlContent, {
            silent: isSilent,
            printerName: targetPrinter !== 'os_dialog' ? targetPrinter : '',
            format: isThermalTarget ? 'thermal' : 'a4'
        });
    };

    // Fallback Download PDF Handler
    const handleDownloadPdfInternal = async () => {
        if (onDownloadPdf) {
            onDownloadPdf();
            return;
        }

        const element = document.getElementById(elemId);
        if (!element) return;

        setInternalDownloadingPdf(true);
        try {
            const html2canvasModule = await import('html2canvas-pro');
            const html2canvas = html2canvasModule.default || html2canvasModule;
            const { jsPDF } = await import('jspdf');

            const rawInv = invoice.invoice_no || 'INVOICE';
            const cleanInv = String(rawInv).replace(/[^a-zA-Z0-9_-]/g, '_');

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const printWidth = pdfWidth - (margin * 2);
            const printHeight = (canvas.height * printWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, Math.min(printHeight, pdfHeight - (margin * 2)));
            pdf.save(`${cleanInv}_A4.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
        } finally {
            setInternalDownloadingPdf(false);
        }
    };

    const isPdfLoading = downloadingPdf || internalDownloadingPdf;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl xl:max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
                {/* 1. PINNED MODAL HEADER & ACTION BUTTONS */}
                <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-6 sm:py-4 border-b border-gray-200 bg-white">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-gray-900 text-sm sm:text-base">
                                Wholesale Bill / Invoice Preview
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${
                                status === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : status === 'PARTIAL'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                                {status}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Invoice: <span className="font-mono font-bold text-gray-800">{invoice.invoice_no}</span> • {invoice.customer_name || 'Walk-in'}
                        </p>
                    </div>

                    {/* ACTION BUTTONS (SOLID BLACK & EMERALD PER CLIENT SPECIFICATION) */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {onSendWhatsApp && (
                            <button
                                type="button"
                                onClick={() => onSendWhatsApp(invoice)}
                                disabled={waSending}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                title="Send this invoice bill PDF directly to customer via WhatsApp"
                            >
                                <IconWhatsApp className="w-3.5 h-3.5 text-white" />
                                <span>{waSending ? 'Sending Bill...' : 'Send WA Bill'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handlePrint}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                            title="Print standard A4 Wholesale Invoice"
                        >
                            <IconPrinter className="w-3.5 h-3.5 text-white" />
                            <span>Print Invoice</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadPdfInternal}
                            disabled={isPdfLoading}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                            title="Export and Download as A4 PDF"
                        >
                            {isPdfLoading ? (
                                <>
                                    <IconSpinner className="w-3.5 h-3.5 text-white" />
                                    <span>Downloading...</span>
                                </>
                            ) : (
                                <>
                                    <IconDownload className="w-3.5 h-3.5 text-white" />
                                    <span>Download PDF (A4)</span>
                                </>
                            )}
                        </button>

                        {onOpenThermal && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenThermal();
                                }}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                                title="Open 80mm thermal receipt modal"
                            >
                                <IconReceipt className="w-3.5 h-3.5 text-white" />
                                <span>Thermal Receipt</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                            className="px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* 2. SCROLLABLE A4 PRINTABLE BILL CONTAINER */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 md:p-6 bg-gray-100/70">
                    <div
                        id={elemId}
                        className="bg-white p-4 sm:p-6 border border-gray-300 rounded-xl space-y-3.5 text-gray-900 text-xs font-sans shadow-xs max-w-4xl mx-auto"
                    >
                        {/* Bill Header: Left Side (Shop Info & Logo) | Right Side (Invoice & Customer Details) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-gray-300">
                            {/* LEFT SIDE: Shop Logo, Shop Name, Address, Phone, Email */}
                            <div className="space-y-1.5 text-xs">
                                <div className="flex items-center gap-2.5">
                                    {settings?.shop_logo ? (
                                        <img
                                            src={settings.shop_logo}
                                            alt={settings.shop_name || 'Shop Logo'}
                                            className="h-11 w-11 object-contain rounded-lg border border-gray-200 bg-white p-0.5 shadow-2xs shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl gold-gradient text-white flex items-center justify-center font-black text-lg shadow-2xs shrink-0">
                                            {(settings?.shop_name || 'H').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <h2 className="text-sm sm:text-base font-black text-gray-900 tracking-tight leading-tight uppercase">
                                            {settings?.shop_name || 'HILAL FOODS SOLUTIONS'}
                                        </h2>
                                        <div className="text-[10px] font-bold text-[#B8860B] uppercase tracking-wider">
                                            Distribution Network
                                        </div>
                                    </div>
                                </div>

                                <div className="text-gray-700 text-[11px] leading-tight space-y-0.5 pl-0.5">
                                    <div>
                                        <span className="font-semibold text-gray-800">Address: </span>
                                        <span>{settings?.shop_address || 'Main Bazaar, Timergara, KP, Pakistan'}</span>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-800">Phone: </span>
                                        <span className="font-mono">{settings?.shop_phone || '+92 300 1234567'}</span>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-800">Email: </span>
                                        <span className="font-mono text-gray-600">{settings?.shop_email || 'hilalwholesaler@gmail.com'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT SIDE: Invoice Meta & Customer Details */}
                            <div className="space-y-2 text-xs text-left md:text-right flex flex-col justify-between">
                                {/* Invoice Meta Box */}
                                <div className="bg-gray-50/90 border border-gray-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-bold text-gray-500 text-[11px] uppercase tracking-wider">INVOICE # :</span>
                                        <span className="font-black font-mono text-sm text-[#B8860B]">{invoice.invoice_no || invoice.id}</span>
                                    </div>
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-semibold text-gray-600 text-[11px]">Invoice Date:</span>
                                        <span className="font-bold text-gray-900 font-mono">
                                            {parseDate(invoice.created_at)?.toLocaleDateString() || new Date().toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-semibold text-gray-600 text-[11px]">Payment Status:</span>
                                        <span className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider border shadow-2xs ${
                                            status === 'PAID'
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : status === 'PARTIAL'
                                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                    : 'bg-rose-100 text-rose-800 border-rose-300'
                                        }`}>
                                            {status}
                                        </span>
                                    </div>
                                </div>

                                {/* Customer Details Box */}
                                <div className="space-y-1 pt-1 border-t border-gray-200">
                                    <div className="font-bold text-[11px] text-gray-900 uppercase tracking-wider text-left md:text-right border-b border-gray-100 pb-0.5">
                                        BILLED TO ({invoice.customer_name || invoice.walkin_name || 'Walk-in Customer'} {(invoice.business_name || invoice.customer_business) && `(${invoice.business_name || invoice.customer_business})`})
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-700">Mobile / Phone: </span>
                                        <span className="font-mono">{invoice.customer_phone || invoice.customer_mobile || invoice.phone || '0945123456'}</span>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-700">Address: </span>
                                        <span>{invoice.customer_address || invoice.address || 'Main Market, Timergara'}</span>
                                    </div>
                                    {invoice.remarks && (
                                        <div>
                                            <span className="font-semibold text-gray-700">Remarks: </span>
                                            <span className="italic text-gray-600">{invoice.remarks}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Line Items Table with Unified Quantity Column & Responsive Horizontal Scroll */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse border-t border-b border-gray-300 my-2">
                                <thead>
                                    <tr className="border-b border-gray-300 font-bold text-emerald-700 bg-gray-50/70">
                                        <th className="py-2 px-2 text-center w-8">#</th>
                                        <th className="py-2 px-2">Product Description</th>
                                        <th className="py-2 px-2 text-right">Price</th>
                                        <th className="py-2 px-2 text-center">Quantity</th>
                                        <th className="py-2 px-2 text-right">Gross Amount</th>
                                        <th className="py-2 px-2 text-center">Disc.%</th>
                                        <th className="py-2 px-2 text-right">Disc.</th>
                                        <th className="py-2 px-2 text-right">Net Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map((item, idx) => {
                                        const factor = parseFloat(item.conversion_factor) || 1;
                                        const isBulk = factor > 1;
                                        const uSymbol = item.base_unit || item.unit_symbol || item.unit_name || 'pcs';
                                        const packName = item.packaging_name || (isBulk ? 'Bulk' : uSymbol);
                                        const qty = parseFloat(item.quantity) || 0;
                                        const qtyDisplay = isBulk ? `${qty} ${packName} (${qty * factor} ${uSymbol})` : `${qty} ${uSymbol}`;
                                        const linePrice = parseFloat(item.price) || 0;
                                        const lineGross = linePrice * qty;
                                        const lineDiscount = parseFloat(item.discount) || 0;
                                        const discPct = lineGross > 0 && lineDiscount > 0 ? ((lineDiscount / lineGross) * 100).toFixed(0) + '%' : '0%';
                                        const lineTotal = item.total !== undefined ? parseFloat(item.total) : (lineGross - lineDiscount);

                                        return (
                                            <tr key={idx} className="hover:bg-gray-50/50">
                                                <td className="py-1.5 px-2 text-center font-bold text-gray-500 font-mono">{idx + 1}</td>
                                                <td className="py-1.5 px-2 font-medium">
                                                    <span className="font-bold text-gray-900">{item.product_name}</span>
                                                    {item.variant_name && item.variant_name !== 'Standard' && (
                                                        <span className="text-gray-600 ml-1">({item.variant_name})</span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-mono">{Number(linePrice).toFixed(0)}</td>
                                                <td className="py-1.5 px-2 text-center font-bold text-gray-900">{qtyDisplay}</td>
                                                <td className="py-1.5 px-2 text-right font-mono">{Number(lineGross).toFixed(2)}</td>
                                                <td className="py-1.5 px-2 text-center font-mono">{discPct}</td>
                                                <td className="py-1.5 px-2 text-right font-mono">{Number(lineDiscount).toFixed(0)}</td>
                                                <td className="py-1.5 px-2 text-right font-bold text-gray-900 font-mono">{Number(lineTotal).toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Balances & Financial Summary Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-2">
                            {/* Left Box: Running Balances */}
                            <div className="space-y-1 text-xs">
                                <div>
                                    <span className="font-semibold">Current Invoice: </span>
                                    <span>Rs. {Number(netVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-semibold">Paid Amount: </span>
                                    <span className="font-semibold text-emerald-700">Rs. {Number(paidVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-semibold">Invoice Due: </span>
                                    <span className={`font-semibold ${Number(remainingVal) > 0 ? 'text-rose-700' : 'text-gray-800'}`}>Rs. {Number(remainingVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-900">Previous Balance : </span>
                                    <span className="font-bold text-gray-900 font-sans">Rs. {Number(calculatedPrevBalance).toFixed(2)}</span>
                                </div>
                                <div className="border-b-2 border-gray-900 pb-0.5 inline-block">
                                    <span className="font-bold">New Balance: </span>
                                    <span className="font-bold">Rs. {Number(calculatedNewBalance).toFixed(0)}</span>
                                </div>
                            </div>

                            {/* Right Box: Gross, Discounts & Net Value */}
                            <div className="space-y-1 text-xs text-left md:text-right">
                                <div>
                                    <span className="font-semibold">Gross Amount: </span>
                                    <span>Rs. {Number(grossVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-semibold">Less Disc.: </span>
                                    <span>Rs. {Number(discVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-semibold">Less Special Disc.: </span>
                                    <span>Rs. {specialDiscVal % 1 === 0 ? Number(specialDiscVal).toFixed(0) : Number(specialDiscVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-semibold">Add Charges : </span>
                                    <span>Rs. {chargesVal % 1 === 0 ? Number(chargesVal).toFixed(0) : Number(chargesVal).toFixed(2)}</span>
                                </div>
                                <div className="pt-1.5 border-t border-gray-300">
                                    <div className="font-bold text-sm text-gray-900">
                                        <span>Net Value: </span>
                                        <span className="text-gray-900 font-extrabold">Rs. {Number(netVal).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Amount in Words Footer */}
                        <div className="pt-3 border-t border-gray-300 text-xs font-semibold text-gray-800">
                            <span>Invoice Amount In Words: </span>
                            <span className="font-bold">{numberToWords(netVal)}</span>
                        </div>

                        {/* Bank Account Details for Online Payment / Transfer */}
                        {bankAccounts.length > 0 && (
                            <div className="pt-2 border-t border-gray-300">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-[#B8860B]"></span>
                                        Bank Details for Online Payment / Transfer
                                    </span>
                                    <span className="text-[10px] text-gray-500 font-medium">WhatsApp proof: {settings?.shop_phone || ''}</span>
                                </div>
                                <div className={`grid gap-2 ${bankAccounts.length === 1 ? 'grid-cols-1' : bankAccounts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                    {bankAccounts.map((acc, idx) => (
                                        <div key={idx} className="p-2 border border-gray-300 rounded-lg bg-gray-50/70 text-[10.5px] leading-tight space-y-0.5">
                                            <div className="font-bold text-gray-900 flex items-center justify-between">
                                                <span>{acc.bank_name}</span>
                                                {acc.branch && <span className="text-[9.5px] text-gray-500 font-normal truncate max-w-[120px]">{acc.branch}</span>}
                                            </div>
                                            {acc.account_title && (
                                                <div className="text-gray-700">
                                                    <span className="text-gray-500">Title: </span>
                                                    <span className="font-semibold">{acc.account_title}</span>
                                                </div>
                                            )}
                                            <div className="text-gray-900">
                                                <span className="text-gray-500">A/C #: </span>
                                                <span className="font-mono font-bold text-gray-900">{acc.account_number}</span>
                                            </div>
                                            {acc.iban && (
                                                <div className="text-gray-600 text-[9.5px]">
                                                    <span className="text-gray-500">IBAN: </span>
                                                    <span className="font-mono">{acc.iban}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
