'use client';
import React from 'react';

/**
 * Helper to shorten packaging unit names for thermal slip width
 */
function formatPackShort(name) {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    if (lower.startsWith('carton') || lower === 'car' || lower === 'ctn') return 'Ctn';
    if (lower.startsWith('packet') || lower.startsWith('pkt')) return 'Pkt';
    if (lower.startsWith('box')) return 'Box';
    if (lower.startsWith('bag')) return 'Bag';
    if (lower.startsWith('dozen') || lower.startsWith('dz')) return 'Dzn';
    return name.length > 3 ? name.substring(0, 3) : name;
}

/**
 * Reusable 80mm Thermal Receipt Component
 * 
 * Used across POS, Sales History, and Modals for previewing and printing.
 * Key Features:
 * - NO bank details on thermal receipt (clean, lightweight)
 * - Clear, mathematically transparent Ledger & Balance calculation
 * - High-contrast black (#000000) typography for thermal printer heads
 * - Solid divider lines (prevents rasterization dots on ESC/POS printers)
 */
export default function ThermalReceipt({
    invoice,
    settings = {},
    cashierName = '',
    prevBalance = 0,
    newBalance = null,
    elemId = 'printable-invoice-thermal'
}) {
    if (!invoice) return null;

    // Dynamic Shop Details
    const shopName = (settings?.shop_name || 'HILAL WHOLESALER SHOP').trim();
    const shopAddress = (settings?.shop_address || '').trim();
    const shopPhone = (settings?.shop_phone || '').trim();
    const shopNtn = (settings?.shop_ntn || '').trim();
    const shopLogo = (settings?.shop_logo || '').trim();

    // Dynamic Customer Details
    const customerName = (invoice.customer_name || invoice.walkin_name || 'Walk-in Customer').trim() +
        (invoice.business_name ? ` (${invoice.business_name.trim()})` : '');
    const customerPhone = (invoice.customer_phone || invoice.walkin_phone || invoice.customer_mobile || invoice.phone || '').trim();
    const customerAddress = (invoice.customer_address || invoice.walkin_address || invoice.address || '').trim();
    const cashier = (invoice.created_by_name || invoice.cashier_name || cashierName || 'Cashier').trim();

    // Date formatting
    let formattedDate = '';
    try {
        let dt = invoice.created_at;
        if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(dt.trim())) {
            dt = dt.trim() + 'Z';
        }
        const rawDate = dt ? new Date(dt) : new Date();
        formattedDate = isNaN(rawDate.getTime())
            ? new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : rawDate.toLocaleDateString() + ' ' + rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        formattedDate = new Date().toLocaleDateString();
    }

    // Financial calculations
    const items = invoice.items || [];
    const grossVal = Number(
        invoice.gross_amount !== undefined && invoice.gross_amount !== null && parseFloat(invoice.gross_amount) > 0
            ? invoice.gross_amount
            : (items.reduce((sum, it) => sum + ((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0)), 0) || invoice.net_amount || 0)
    );
    const discVal = Number(invoice.discount || items.reduce((sum, it) => sum + (parseFloat(it.discount) || 0), 0) || 0);
    const specialDiscVal = Number(invoice.special_discount || 0);
    const chargesVal = Number(invoice.additional_charges || 0);
    const netVal = Number(invoice.net_amount !== undefined ? invoice.net_amount : (grossVal - discVal - specialDiscVal + chargesVal));
    const paidVal = Number(invoice.amount_paid !== undefined ? invoice.amount_paid : 0);
    const dueVal = Number(invoice.remaining_balance !== undefined ? invoice.remaining_balance : Math.max(0, netVal - paidVal));

    const pBal = Number(prevBalance || 0);
    const totalPayable = pBal + netVal;
    const finalBal = newBalance !== null && newBalance !== undefined ? Number(newBalance) : (totalPayable - paidVal);

    // Only show customer ledger breakdown if there's a previous balance or outstanding ledger balance
    const hasLedger = pBal > 0 || finalBal > 0;

    return (
        <div
            id={elemId}
            className="bg-white p-2.5 border border-gray-300 rounded-lg text-black font-sans text-[9.5px] leading-tight shadow-none mx-auto print:border-none print:p-0"
            style={{ width: '100%', maxWidth: '305px', color: '#000000', backgroundColor: '#ffffff' }}
        >
            {/* 1. SHOP HEADER (NO BANK DETAILS) */}
            <div className="text-center pb-2 border-b border-black">
                {shopLogo && (
                    <div className="flex justify-center mb-1">
                        <img
                            src={shopLogo}
                            alt="Shop Logo"
                            className="h-9 max-h-9 w-auto max-w-[120px] object-contain filter grayscale contrast-125"
                        />
                    </div>
                )}
                <div className="font-bold text-[13px] tracking-wide uppercase text-black leading-tight">
                    {shopName}
                </div>
                {shopAddress && (
                    <div className="text-[9px] text-gray-700 leading-tight mt-0.5 font-normal">
                        {shopAddress}
                    </div>
                )}
                <div className="text-[8.5px] text-gray-700 font-normal mt-0.5 flex items-center justify-center gap-1.5 flex-wrap">
                    {shopPhone && <span>Tel: {shopPhone}</span>}
                    {shopPhone && shopNtn && <span className="text-gray-400">|</span>}
                    {shopNtn && <span>NTN: {shopNtn}</span>}
                </div>
            </div>

            {/* 2. INVOICE & CUSTOMER METADATA */}
            <div className="py-1.5 text-[9px] border-b border-black font-normal">
                <table className="w-full border-collapse">
                    <tbody>
                        <tr>
                            <td className="text-black font-bold py-0.5 w-[35%]">Invoice #:</td>
                            <td className="text-black font-mono font-bold text-right py-0.5 pr-1">{invoice.invoice_no || invoice.id}</td>
                        </tr>
                        <tr>
                            <td className="text-gray-700 font-normal py-0.5">Date &amp; Time:</td>
                            <td className="text-black font-mono font-normal text-right py-0.5 pr-1">{formattedDate}</td>
                        </tr>
                        <tr>
                            <td className="text-gray-700 font-normal py-0.5">Cashier:</td>
                            <td className="text-black font-normal text-right py-0.5 pr-1">{cashier}</td>
                        </tr>
                        <tr className="border-t border-dashed border-gray-400">
                            <td className="text-gray-700 font-normal pt-1">Billed To:</td>
                            <td className="text-black font-semibold text-right pt-1 pr-1 break-words max-w-[170px]">{customerName}</td>
                        </tr>
                        {customerPhone && (
                            <tr>
                                <td className="text-gray-700 font-normal py-0.5">Mobile / Tel:</td>
                                <td className="text-black font-mono font-normal text-right py-0.5 pr-1">{customerPhone}</td>
                            </tr>
                        )}
                        {customerAddress && (
                            <tr>
                                <td className="text-gray-700 font-normal py-0.5">Address:</td>
                                <td className="text-black font-normal text-right py-0.5 pr-1 break-words max-w-[170px]">{customerAddress}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 3. ITEMS TABLE */}
            <div className="py-1 border-b border-black">
                <table className="w-full text-[8.5px] border-collapse table-fixed">
                    <thead>
                        <tr className="border-b border-black font-semibold text-[8.5px] uppercase tracking-wider">
                            <th className="text-center py-1 w-[8%] text-black font-semibold">#</th>
                            <th className="text-left py-1 w-[38%] text-black font-semibold">Item Description</th>
                            <th className="text-center py-1 w-[12%] text-black font-semibold">Qty</th>
                            <th className="text-right py-1 w-[14%] text-black font-semibold">Rate</th>
                            <th className="text-right py-1 w-[12%] text-black font-semibold">Disc</th>
                            <th className="text-right py-1 w-[16%] pr-1 text-black font-semibold">Net</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => {
                            const factor = parseFloat(item.conversion_factor) || 1;
                            const isBulk = factor > 1;
                            const uSymbol = item.base_unit || item.unit_symbol || item.unit_name || 'pcs';
                            const packName = item.packaging_name || (isBulk ? 'Bulk' : uSymbol);
                            const qty = parseFloat(item.quantity) || 0;
                            const looseQty = isBulk ? (qty * factor) : qty;
                            const itDiscount = parseFloat(item.discount) || 0;

                            return (
                                <tr key={idx} className="align-top" style={{ borderBottom: '1px solid #9ca3af' }}>
                                    <td className="py-1.5 text-center font-normal text-[8.5px] text-gray-600" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        {idx + 1}
                                    </td>
                                    <td className="py-1.5 text-left pr-1" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        <div className="font-normal text-[8.5px] leading-tight break-words text-black">
                                            {item.product_name}
                                        </div>
                                        <div className="text-[7.5px] text-gray-500 leading-tight">
                                            {item.variant_name && item.variant_name !== 'Standard' && (
                                                <span>({item.variant_name}) </span>
                                            )}
                                            <span>{isBulk ? `${qty} ${packName} (${looseQty} ${uSymbol})` : `${looseQty} ${uSymbol}`}</span>
                                        </div>
                                    </td>
                                    <td className="py-1.5 text-center font-normal text-[8.5px] text-black" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        {isBulk ? `${qty} ${formatPackShort(packName)}` : `${looseQty}`}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-normal text-[8.5px] text-black" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        {Number(item.price).toFixed(0)}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-normal text-[8.5px] text-gray-600" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        {itDiscount > 0 ? `${itDiscount.toFixed(0)}` : '0'}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-normal text-[8.5px] pr-1 text-black" style={{ borderBottom: '1px solid #9ca3af' }}>
                                        {Number(item.total).toFixed(0)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 4. CURRENT BILL FINANCIAL TOTALS */}
            <div className="py-1.5 text-[9px] space-y-0.5 border-b border-black text-black font-normal">
                <div className="flex justify-between">
                    <span className="text-gray-700 font-normal">Gross Amount:</span>
                    <span className="font-mono font-normal text-black pr-1">Rs. {grossVal.toFixed(2)}</span>
                </div>
                {discVal > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-700 font-normal">Less Item Discount:</span>
                        <span className="font-mono font-normal text-black pr-1">- Rs. {discVal.toFixed(2)}</span>
                    </div>
                )}
                {specialDiscVal > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-700 font-normal">Less Special Discount:</span>
                        <span className="font-mono font-normal text-black pr-1">- Rs. {specialDiscVal.toFixed(2)}</span>
                    </div>
                )}
                {chargesVal > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-700 font-normal">Add Charges:</span>
                        <span className="font-mono font-normal text-black pr-1">+ Rs. {chargesVal.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between font-bold text-[11px] pt-1 border-t border-b border-black my-1 text-black">
                    <span>CURRENT BILL:</span>
                    <span className="pr-1 font-mono">Rs. {netVal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-0.5 font-normal">
                    <span className="text-gray-700 font-normal">Paid on Bill:</span>
                    <span className="font-mono font-normal text-black pr-1">Rs. {paidVal.toFixed(2)}</span>
                </div>
                {!hasLedger && (
                    <div className="flex justify-between pt-0.5 font-normal">
                        <span className="text-gray-700 font-normal">{dueVal > 0 ? 'Bill Balance Due:' : 'Change Return:'}</span>
                        <span className="font-mono font-normal pr-1">Rs. {Math.abs(dueVal).toFixed(2)}</span>
                    </div>
                )}
            </div>

            {/* 5. CUSTOMER LEDGER STATEMENT (CLEAR, MATHEMATICALLY VERIFIABLE) */}
            {hasLedger && (
                <div className="py-1.5 text-[9px] space-y-0.5 border-b border-black text-black font-normal">
                    <div className="text-center font-normal text-[8px] tracking-wide text-gray-500 border-b border-dashed border-gray-300 pb-0.5 mb-1">
                        *** CUSTOMER LEDGER ACCOUNT ***
                    </div>
                    <div className="flex justify-between font-bold text-black">
                        <span className="text-black font-bold">Previous Balance:</span>
                        <span className="font-bold text-black pr-1">Rs. {pBal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                        <span className="text-black font-semibold">+ Current Bill:</span>
                        <span className="font-mono font-semibold text-black pr-1">+ Rs. {netVal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-0.5 border-t border-gray-400 font-semibold">
                        <span className="text-black font-semibold">Total Payable:</span>
                        <span className="font-mono font-semibold text-black pr-1">Rs. {totalPayable.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                        <span className="text-black font-semibold">- Paid Today:</span>
                        <span className="font-mono font-semibold text-black pr-1">- Rs. {paidVal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-[11px] border-t border-b border-black py-0.5 mt-1 text-black">
                        <span>NEW BALANCE:</span>
                        <span className="font-mono pr-1">Rs. {finalBal.toFixed(2)}</span>
                    </div>
                </div>
            )}

            {/* 6. FOOTER */}
            <div className="pt-1.5 text-center text-black font-normal">
                <div className="font-normal text-[8.5px] tracking-wide text-black">
                    *** THANK YOU FOR YOUR BUSINESS! ***
                </div>
                <div className="text-[7.5px] mt-0.5 text-gray-500 font-normal">
                    No return without original invoice
                </div>
            </div>
        </div>
    );
}
