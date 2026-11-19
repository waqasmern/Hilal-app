'use client';
import React, { useState } from 'react';
import {
    IconPrinter, IconWhatsApp, IconDownload, IconReceipt, IconClose, IconSpinner, IconExternalLink
} from './Icons';
import { triggerPrintHtml, generateWholesaleInvoiceA4Html, generateThermalReceiptHtml, downloadAndOpenPdf } from '../../lib/printHelper';

export function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    let s = String(dateInput).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
        s = s + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
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
    const [openingInChrome, setOpeningInChrome] = useState(false);

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
        const targetPrinter = a4Printer && a4Printer !== 'same_as_thermal' ? a4Printer : '';
        const isSilent = settings?.silent_print === 'true' && targetPrinter !== 'os_dialog';

        const htmlContent = generateWholesaleInvoiceA4Html(
            invoice,
            settings,
            calculatedPrevBalance,
            calculatedNewBalance
        );

        await triggerPrintHtml(htmlContent, {
            silent: isSilent,
            printerName: targetPrinter !== 'os_dialog' ? targetPrinter : '',
            format: 'a4'
        });
    };

    // Fallback Download PDF Handler (Downloads & Opens in Browser)
    const handleDownloadPdfInternal = async () => {
        if (onDownloadPdf) {
            onDownloadPdf();
            return;
        }

        const element = document.getElementById(elemId);
        if (!element) return;

        setInternalDownloadingPdf(true);
        try {
            const rawInv = invoice.invoice_no || 'INVOICE';
            const cleanInv = String(rawInv).replace(/[^a-zA-Z0-9_-]/g, '_');
            await downloadAndOpenPdf(element, `${cleanInv}_A4.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
        } finally {
            setInternalDownloadingPdf(false);
        }
    };

    const isPdfLoading = downloadingPdf || internalDownloadingPdf;

    // Open A4 Bill PDF directly in Google Chrome (for viewing, printing, or downloading from Chrome)
    const handleOpenInChrome = async () => {
        const element = document.getElementById(elemId);
        if (!element) return;

        setOpeningInChrome(true);
        try {
            const rawInv = invoice.invoice_no || 'INVOICE';
            const cleanInv = String(rawInv).replace(/[^a-zA-Z0-9_-]/g, '_');
            await downloadAndOpenPdf(element, `${cleanInv}_A4.pdf`, { saveFile: false });
        } catch (err) {
            console.error('Open in Chrome error:', err);
        } finally {
            setOpeningInChrome(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-1.5 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl xl:max-w-5xl w-full max-h-[96vh] sm:max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
                {/* 1. PINNED MODAL HEADER & ACTION BUTTONS */}
                <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-3 sm:px-6 sm:py-4 border-b border-gray-200 bg-white">
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
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 shrink-0 w-full sm:w-auto">
                        {onSendWhatsApp && (
                            <button
                                type="button"
                                onClick={() => onSendWhatsApp(invoice)}
                                disabled={waSending}
                                className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 text-center"
                                title="Send this invoice bill PDF directly to customer via WhatsApp"
                            >
                                <IconWhatsApp className="w-3.5 h-3.5 text-white shrink-0" />
                                <span className="truncate">{waSending ? 'Sending...' : 'Send WA'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handlePrint}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center"
                            title="Print standard A4 Wholesale Invoice"
                        >
                            <IconPrinter className="w-3.5 h-3.5 text-white shrink-0" />
                            <span className="truncate">Print A4 Bill</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadPdfInternal}
                            disabled={isPdfLoading}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50 text-center"
                            title="Export and Download as A4 PDF"
                        >
                            {isPdfLoading ? (
                                <>
                                    <IconSpinner className="w-3.5 h-3.5 text-white shrink-0" />
                                    <span className="truncate">Exporting...</span>
                                </>
                            ) : (
                                <>
                                    <IconDownload className="w-3.5 h-3.5 text-white shrink-0" />
                                    <span className="truncate">PDF (A4)</span>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleOpenInChrome}
                            disabled={openingInChrome}
                            style={{ backgroundColor: '#1a73e8', color: '#ffffff', border: '1px solid #1a73e8' }}
                            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50 text-center"
                            title="Open this A4 bill directly in Google Chrome"
                        >
                            {openingInChrome ? (
                                <>
                                    <IconSpinner className="w-3.5 h-3.5 text-white shrink-0" />
                                    <span className="truncate">Opening...</span>
                                </>
                            ) : (
                                <>
                                    <IconExternalLink className="w-3.5 h-3.5 text-white shrink-0" />
                                    <span className="truncate">Open in Chrome</span>
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
                                className="btn-black !bg-black !text-white px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center"
                                title="Open 80mm thermal receipt modal"
                            >
                                <IconReceipt className="w-3.5 h-3.5 text-white shrink-0" />
                                <span className="truncate">Thermal</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                            className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer text-center"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* 2. SCROLLABLE A4 PRINTABLE BILL CONTAINER */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-5 md:p-6 bg-gray-100/70">
                    <div
                        id={elemId}
                        className="bg-white p-4 sm:p-7 border border-gray-300 rounded-xl space-y-4 text-gray-900 text-sm font-sans shadow-xs max-w-4xl mx-auto overflow-x-hidden"
                    >
                        {/* Bill Header: Left Side (Shop Info & Logo) | Right Side (Invoice & Customer Details) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3.5 border-b-2 border-gray-300">
                            {/* LEFT SIDE: Shop Logo, Shop Name, Address, Phone, Email */}
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-3">
                                    {settings?.shop_logo ? (
                                        <img
                                            src={settings.shop_logo}
                                            alt={settings.shop_name || 'Shop Logo'}
                                            className="h-12 w-12 object-contain rounded-lg border border-gray-200 bg-white p-0.5 shadow-2xs shrink-0"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl gold-gradient text-white flex items-center justify-center font-black text-xl shadow-2xs shrink-0">
                                            {(settings?.shop_name || 'H').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight uppercase">
                                            {settings?.shop_name || 'Hilal Wholesaler Shop'}
                                        </h2>
                                        <div className="text-xs font-extrabold text-[#0B3B7B] uppercase tracking-wider">
                                            {settings?.shop_tagline || settings?.shop_subtitle || 'Wholesale & Retail Distribution'}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-gray-900 text-xs sm:text-sm font-bold leading-snug space-y-1 pl-0.5">
                                    <div>
                                        <span className="font-extrabold text-gray-900">Address: </span>
                                        <span className="font-bold text-gray-900">{settings?.shop_address || 'Main Bazaar, Timergara, KP, Pakistan'}</span>
                                    </div>
                                    <div>
                                        <span className="font-extrabold text-gray-900">Phone: </span>
                                        <span className="font-mono font-bold text-gray-900">{settings?.shop_phone || '+92 300 1234567'}</span>
                                    </div>
                                    <div>
                                        <span className="font-extrabold text-gray-900">Email: </span>
                                        <span className="font-mono font-bold text-gray-900">{settings?.shop_email || 'hilalwholesaler@gmail.com'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT SIDE: Invoice Meta & Customer Details */}
                            <div className="space-y-2.5 text-sm text-left md:text-right flex flex-col justify-between">
                                {/* Invoice Meta Box */}
                                <div className="bg-gray-50/90 border border-gray-300 rounded-xl p-3 space-y-1.5 shadow-2xs">
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-extrabold text-gray-800 text-xs sm:text-sm uppercase tracking-wider">INVOICE # :</span>
                                        <span className="font-black font-mono text-base sm:text-lg text-[#B8860B]">{invoice.invoice_no || invoice.id}</span>
                                    </div>
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-extrabold text-gray-800 text-xs sm:text-sm">Invoice Date:</span>
                                        <span className="font-black text-gray-900 font-mono text-xs sm:text-sm">
                                            {parseDate(invoice.created_at)?.toLocaleDateString() || new Date().toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                        <span className="font-extrabold text-gray-800 text-xs sm:text-sm">Payment Status:</span>
                                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-black uppercase tracking-wider border shadow-2xs ${
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
                                <div className="space-y-1 pt-1.5 border-t border-gray-300 text-xs sm:text-sm font-bold text-gray-900">
                                    <div className="font-black text-sm text-gray-900 uppercase tracking-wider text-left md:text-right border-b border-gray-200 pb-0.5">
                                        BILLED TO ({invoice.customer_name || invoice.walkin_name || 'Walk-in Customer'} {(invoice.business_name || invoice.customer_business) && `(${invoice.business_name || invoice.customer_business})`})
                                    </div>
                                    <div>
                                        <span className="font-extrabold text-gray-900">Mobile / Phone: </span>
                                        <span className="font-mono font-bold text-gray-900">{invoice.customer_phone || invoice.customer_mobile || invoice.walkin_phone || invoice.phone || '—'}</span>
                                    </div>
                                    <div>
                                        <span className="font-extrabold text-gray-900">Address: </span>
                                        <span className="font-bold text-gray-900">{invoice.customer_address || invoice.walkin_address || invoice.address || '—'}</span>
                                    </div>
                                    {invoice.remarks && (
                                        <div>
                                            <span className="font-extrabold text-gray-900">Remarks: </span>
                                            <span className="font-bold italic text-gray-800">{invoice.remarks}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Line Items Table with Unified Quantity Column & Responsive Horizontal Scroll */}
                        <div className="overflow-x-auto w-full border border-gray-300 rounded-lg my-2">
                            <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[580px] sm:min-w-[640px]">
                                <thead>
                                    <tr className="border-b border-gray-300 font-extrabold text-emerald-800 bg-gray-100/80">
                                        <th className="py-2.5 px-2 text-center w-9">#</th>
                                        <th className="py-2.5 px-2.5">Product Description</th>
                                        <th className="py-2.5 px-2 text-right">Price</th>
                                        <th className="py-2.5 px-2 text-center">Quantity</th>
                                        <th className="py-2.5 px-2 text-right">Gross Amount</th>
                                        <th className="py-2.5 px-2 text-center">Disc.%</th>
                                        <th className="py-2.5 px-2 text-right">Disc.</th>
                                        <th className="py-2.5 px-2.5 text-right">Net Amount</th>
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
                                                <td className="py-2 px-2 text-center font-bold text-gray-600 font-mono">{idx + 1}</td>
                                                <td className="py-2 px-2.5 font-semibold">
                                                    <span className="font-bold text-gray-900">{item.product_name}</span>
                                                    {item.variant_name && item.variant_name !== 'Standard' && (
                                                        <span className="text-gray-700 font-semibold ml-1">({item.variant_name})</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2 text-right font-mono font-semibold">{Number(linePrice).toFixed(0)}</td>
                                                <td className="py-2 px-2 text-center font-bold text-gray-900">{qtyDisplay}</td>
                                                <td className="py-2 px-2 text-right font-mono font-semibold">{Number(lineGross).toFixed(2)}</td>
                                                <td className="py-2 px-2 text-center font-mono font-semibold">{discPct}</td>
                                                <td className="py-2 px-2 text-right font-mono font-semibold">{Number(lineDiscount).toFixed(0)}</td>
                                                <td className="py-2 px-2.5 text-right font-extrabold text-gray-900 font-mono">{Number(lineTotal).toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Balances & Financial Summary Section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-2">
                            {/* Left Box: Running Balances */}
                            <div className="space-y-1.5 text-sm">
                                <div>
                                    <span className="font-bold text-gray-800">Current Invoice: </span>
                                    <span className="font-bold text-gray-900">Rs. {Number(netVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800">Paid Amount: </span>
                                    <span className="font-bold text-emerald-700">Rs. {Number(paidVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800">Invoice Due: </span>
                                    <span className={`font-bold ${Number(remainingVal) > 0 ? 'text-rose-700' : 'text-gray-900'}`}>Rs. {Number(remainingVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-extrabold text-gray-900">Previous Balance : </span>
                                    <span className="font-extrabold text-gray-900 font-sans">Rs. {Number(calculatedPrevBalance).toFixed(2)}</span>
                                </div>
                                <div className="border-b-2 border-gray-900 pb-0.5 inline-block text-base">
                                    <span className="font-black">New Balance: </span>
                                    <span className="font-black">Rs. {Number(calculatedNewBalance).toFixed(0)}</span>
                                </div>
                            </div>

                            {/* Right Box: Gross, Discounts & Net Value */}
                            <div className="space-y-1.5 text-sm text-left md:text-right">
                                <div>
                                    <span className="font-bold text-gray-800">Gross Amount: </span>
                                    <span className="font-bold text-gray-900">Rs. {Number(grossVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800">Less Disc.: </span>
                                    <span className="font-bold text-gray-900">Rs. {Number(discVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800">Less Special Disc.: </span>
                                    <span className="font-bold text-gray-900">Rs. {specialDiscVal % 1 === 0 ? Number(specialDiscVal).toFixed(0) : Number(specialDiscVal).toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800">Add Charges : </span>
                                    <span className="font-bold text-gray-900">Rs. {chargesVal % 1 === 0 ? Number(chargesVal).toFixed(0) : Number(chargesVal).toFixed(2)}</span>
                                </div>
                                <div className="pt-1.5 border-t border-gray-300">
                                    <div className="font-black text-base sm:text-lg text-gray-900">
                                        <span>Net Value: </span>
                                        <span className="text-gray-900 font-black">Rs. {Number(netVal).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Amount in Words Footer */}
                        <div className="pt-3 border-t border-gray-300 text-sm font-bold text-gray-900">
                            <span>Invoice Amount In Words: </span>
                            <span className="font-black">{numberToWords(netVal)}</span>
                        </div>

                        {/* Bank Account Details for Online Payment / Transfer */}
                        {bankAccounts.length > 0 && (
                            <div className="pt-2.5 border-t border-gray-300">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-extrabold text-xs uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#B8860B]"></span>
                                        Bank Details for Online Payment / Transfer
                                    </span>
                                    <span className="text-xs text-gray-700 font-bold">WhatsApp proof: {settings?.shop_phone || ''}</span>
                                </div>
                                <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {bankAccounts.map((acc, idx) => (
                                        <div key={idx} className="p-2.5 border border-gray-300 rounded-lg bg-gray-50/70 text-xs leading-snug space-y-0.5">
                                            <div className="font-extrabold text-gray-900 flex items-center justify-between">
                                                <span>{acc.bank_name}</span>
                                                {acc.branch && <span className="text-[11px] text-gray-600 font-semibold truncate max-w-[120px]">{acc.branch}</span>}
                                            </div>
                                            {acc.account_title && (
                                                <div className="text-gray-800">
                                                    <span className="text-gray-600 font-semibold">Title: </span>
                                                    <span className="font-bold">{acc.account_title}</span>
                                                </div>
                                            )}
                                            <div className="text-gray-900">
                                                <span className="text-gray-600 font-semibold">A/C #: </span>
                                                <span className="font-mono font-extrabold text-gray-900">{acc.account_number}</span>
                                            </div>
                                            {acc.iban && (
                                                <div className="text-gray-700 text-[11px]">
                                                    <span className="text-gray-600 font-semibold">IBAN: </span>
                                                    <span className="font-mono font-semibold">{acc.iban}</span>
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
