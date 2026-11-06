'use client';
import React from 'react';
import { IconReceipt, IconPrinter, IconClose } from './Icons';

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
 * Reusable 80mm Thermal Receipt Modal Component
 * 
 * Provides the complete preview dialog with pinned header, print action,
 * scrollable thermal receipt preview, and footer actions (View A4 Bill / Print Receipt).
 */
export function ThermalReceiptModal({
    isOpen,
    onClose,
    invoice,
    settings = {},
    cashierName = '',
    prevBalance = 0,
    newBalance = null,
    onOpenA4,
    onPrint,
    elemId = 'printable-invoice-thermal'
}) {
    if (!isOpen || !invoice) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-sm w-full shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] sm:max-h-[88vh] overflow-hidden">
                {/* Header (Pinned) */}
                <div className="shrink-0 flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-1.5">
                        <IconReceipt className="w-4 h-4 text-black" />
                        <h3 className="font-extrabold text-gray-900 text-sm">Thermal Receipt Preview</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {onPrint && (
                            <button
                                type="button"
                                onClick={onPrint}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white px-3 py-1 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                            >
                                <IconPrinter className="w-3.5 h-3.5 text-white" />
                                <span>Print</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
                        >
                            <IconClose className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Thermal Slip Container */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-gray-100/70">
                    <div className="w-full flex justify-center items-start min-h-full py-1">
                        <ThermalReceiptSlip
                            invoice={invoice}
                            settings={settings}
                            cashierName={cashierName}
                            prevBalance={prevBalance}
                            newBalance={newBalance}
                            elemId={elemId}
                        />
                    </div>
                </div>

                {/* Bottom Actions (Pinned) */}
                <div className="shrink-0 flex gap-2 p-3 sm:px-4 sm:py-3 border-t border-gray-100 bg-white">
                    {onOpenA4 && (
                        <button
                            type="button"
                            onClick={onOpenA4}
                            style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                            className="flex-1 py-2 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer text-center"
                        >
                            View Full A4 Bill
                        </button>
                    )}
                    {onPrint && (
                        <button
                            type="button"
                            onClick={onPrint}
                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                            className="btn-black !bg-black !text-white flex-1 py-2 rounded-xl font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                        >
                            <IconPrinter className="w-3.5 h-3.5 text-white" />
                            <span>Print Receipt</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Reusable 80mm Thermal Receipt Component
 * 
 * Used across POS, Sales History, and Modals for previewing and printing.
 * If `isOpen` is passed, it automatically renders the complete modal dialog!
 */
export default function ThermalReceipt(props) {
    if (props.isOpen !== undefined) {
        return <ThermalReceiptModal {...props} />;
    }
    return <ThermalReceiptSlip {...props} />;
}

/**
 * Inner 80mm Thermal Receipt Printable Slip
 */
export function ThermalReceiptSlip({
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
            className="bg-white p-3 border border-gray-400 rounded-lg text-black font-sans shadow-sm mx-auto print:border-none print:p-0 print:shadow-none h-auto shrink-0 self-start"
            style={{
                width: '100%',
                maxWidth: '315px',
                color: '#000000',
                backgroundColor: '#ffffff',
                fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
                fontSize: '11px',
                lineHeight: 1.3,
                height: 'auto',
                minHeight: 'fit-content'
            }}
        >
            {/* 1. SHOP HEADER */}
            <div style={{ textAlign: 'center', paddingBottom: '5px', borderBottom: '1px solid #000000' }}>
                {shopLogo && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3px' }}>
                        <img
                            src={shopLogo}
                            alt="Shop Logo"
                            style={{ maxHeight: '40px', maxWidth: '130px', objectFit: 'contain' }}
                        />
                    </div>
                )}
                <div style={{ fontWeight: 'bold', fontSize: '13.5px', letterSpacing: '0.5px', textTransform: 'uppercase', color: '#000000', lineHeight: 1.2 }}>
                    {shopName}
                </div>
                {shopAddress && (
                    <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#000000', lineHeight: 1.2, marginTop: '2px' }}>
                        {shopAddress}
                    </div>
                )}
                <div style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#000000', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    {shopPhone && <span>Tel: {shopPhone}</span>}
                    {shopPhone && shopNtn && <span>|</span>}
                    {shopNtn && <span>NTN: {shopNtn}</span>}
                </div>
            </div>

            {/* 2. INVOICE & CUSTOMER METADATA (TABULAR FORMAT, SOLID BORDER) */}
            <div style={{ padding: '3px 0', borderBottom: '1px solid #000000' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '10.5px' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '35%', fontWeight: 'bold', color: '#000000', textAlign: 'left', padding: '1.5px 0' }}>Invoice #:</td>
                            <td style={{ width: '65%', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px', padding: '1.5px 0', color: '#000000' }}>
                                {invoice.invoice_no || invoice.id}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '1.5px 0' }}>Date &amp; Time:</td>
                            <td style={{ textAlign: 'right', fontWeight: 'normal', color: '#000000', padding: '1.5px 0' }}>{formattedDate}</td>
                        </tr>
                        <tr>
                            <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '1.5px 0' }}>Cashier:</td>
                            <td style={{ textAlign: 'right', fontWeight: 'normal', color: '#000000', padding: '1.5px 0' }}>{cashier}</td>
                        </tr>
                        <tr style={{ borderTop: '1px solid #000000' }}>
                            <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '2.5px 0 1.5px 0' }}>Billed To:</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#000000', padding: '2.5px 0 1.5px 0', wordBreak: 'break-word' }}>{customerName}</td>
                        </tr>
                        {customerPhone && (
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '1.5px 0' }}>Mobile / Tel:</td>
                                <td style={{ textAlign: 'right', fontWeight: 'normal', color: '#000000', padding: '1.5px 0' }}>{customerPhone}</td>
                            </tr>
                        )}
                        {customerAddress && (
                            <tr>
                                <td style={{ textAlign: 'left', verticalAlign: 'top', fontWeight: '600', color: '#000000', padding: '1.5px 0' }}>Address:</td>
                                <td style={{ textAlign: 'right', fontWeight: 'normal', color: '#000000', padding: '1.5px 0', wordBreak: 'break-word' }}>{customerAddress}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 3. ITEMS TABLE (TABULAR FORMAT, LIGHT 1PX BORDERS FOR ROWS & COLUMNS) */}
            <div style={{ padding: '3px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '10px', border: '1px solid #000000' }}>
                    <thead>
                        <tr style={{ textTransform: 'uppercase' }}>
                            <th style={{ textAlign: 'center', width: '7%', padding: '3.5px 1px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>#</th>
                            <th style={{ textAlign: 'left', width: '41%', padding: '3.5px 3px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>Item</th>
                            <th style={{ textAlign: 'center', width: '14%', padding: '3.5px 1px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>Qty</th>
                            <th style={{ textAlign: 'right', width: '13%', padding: '3.5px 2px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>Rate</th>
                            <th style={{ textAlign: 'right', width: '10%', padding: '3.5px 2px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>Disc</th>
                            <th style={{ textAlign: 'right', width: '15%', padding: '3.5px 3px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>Net</th>
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
                            const qtyCol = isBulk ? `${qty} ${formatPackShort(packName)}` : `${looseQty} ${uSymbol}`;
                            const variantText = item.variant_name && item.variant_name !== 'Standard' ? `(${item.variant_name}) ` : '';
                            const packageDetail = isBulk ? `Pack: ${qty} ${packName} (${looseQty} ${uSymbol})` : '';
                            const hasSub = variantText || packageDetail;
                            const itDiscount = parseFloat(item.discount) || 0;

                            return (
                                <tr key={idx} style={{ verticalAlign: 'top' }}>
                                    <td style={{ padding: '4.5px 1px', textAlign: 'center', fontSize: '10px', fontWeight: '500', color: '#000000', border: '1px solid #000000' }}>
                                        {idx + 1}
                                    </td>
                                    <td style={{ padding: '4.5px 3px', textAlign: 'left', border: '1px solid #000000' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1.2, wordBreak: 'break-word', color: '#000000' }}>
                                            {item.product_name}
                                        </div>
                                        {hasSub && (
                                            <div style={{ fontSize: '8.5px', fontWeight: 'normal', color: '#000000', lineHeight: 1.15, marginTop: '1.5px' }}>
                                                {variantText}{packageDetail}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '4.5px 1px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: '#000000', whiteSpace: 'nowrap', border: '1px solid #000000' }}>
                                        {qtyCol}
                                    </td>
                                    <td style={{ padding: '4.5px 2px', textAlign: 'right', fontSize: '10px', fontWeight: '500', color: '#000000', border: '1px solid #000000' }}>
                                        {Number(item.price).toFixed(0)}
                                    </td>
                                    <td style={{ padding: '4.5px 2px', textAlign: 'right', fontSize: '10px', fontWeight: '500', color: '#000000', border: '1px solid #000000' }}>
                                        {itDiscount > 0 ? `${itDiscount.toFixed(0)}` : '0'}
                                    </td>
                                    <td style={{ padding: '4.5px 3px', textAlign: 'right', fontSize: '10.5px', fontWeight: 'bold', color: '#000000', border: '1px solid #000000' }}>
                                        {Number(item.total).toFixed(0)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 4. CURRENT BILL FINANCIAL TOTALS (TABULAR FORMAT, LIGHT 1PX BORDERS) */}
            <div style={{ padding: '3px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '10.5px', border: '1px solid #000000' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '52%', textAlign: 'left', fontWeight: '500', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Gross Amount:</td>
                            <td style={{ width: '48%', textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Rs. {grossVal.toFixed(2)}</td>
                        </tr>
                        {discVal > 0 && (
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '500', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Less Item Discount:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>- Rs. {discVal.toFixed(2)}</td>
                            </tr>
                        )}
                        {specialDiscVal > 0 && (
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '500', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Less Special Discount:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>- Rs. {specialDiscVal.toFixed(2)}</td>
                            </tr>
                        )}
                        {chargesVal > 0 && (
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '500', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Add Charges:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>+ Rs. {chargesVal.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr>
                            <td style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '12.5px', color: '#000000', padding: '4px 4px', border: '1px solid #000000' }}>CURRENT BILL:</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12.5px', color: '#000000', padding: '4px 4px', border: '1px solid #000000' }}>Rs. {netVal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style={{ textAlign: 'left', fontWeight: '500', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Paid on Bill:</td>
                            <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Rs. {paidVal.toFixed(2)}</td>
                        </tr>
                        {!hasLedger && (
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '11px', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>
                                    {dueVal > 0 ? 'Bill Balance Due:' : 'Change Return:'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '11px', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>
                                    Rs. {Math.abs(dueVal).toFixed(2)}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 5. CUSTOMER LEDGER STATEMENT (TABULAR FORMAT, LIGHT 1PX BORDERS) */}
            {hasLedger && (
                <div style={{ padding: '3px 0' }}>
                    <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '10.5px', letterSpacing: '0.5px', color: '#000000', border: '1px solid #000000', borderBottom: 'none', padding: '3px', marginBottom: 0 }}>
                        *** CUSTOMER LEDGER STATEMENT ***
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '10.5px', border: '1px solid #000000' }}>
                        <tbody>
                            <tr>
                                <td style={{ width: '52%', textAlign: 'left', fontWeight: 'bold', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Previous Balance:</td>
                                <td style={{ width: '48%', textAlign: 'right', fontWeight: 'bold', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Rs. {pBal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>+ Current Bill:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>+ Rs. {netVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Total Payable:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>Rs. {totalPayable.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>- Paid Today:</td>
                                <td style={{ textAlign: 'right', fontWeight: '600', color: '#000000', padding: '3px 4px', border: '1px solid #000000' }}>- Rs. {paidVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '12.5px', color: '#000000', padding: '4px 4px', border: '1px solid #000000' }}>NEW BALANCE:</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12.5px', color: '#000000', padding: '4px 4px', border: '1px solid #000000' }}>Rs. {finalBal.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* 6. FOOTER */}
            <div style={{ paddingTop: '5px', textAlign: 'center', color: '#000000' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10.5px', letterSpacing: '0.5px', color: '#000000' }}>
                    *** THANK YOU FOR YOUR BUSINESS! ***
                </div>
                <div style={{ fontSize: '9px', marginTop: '2px', fontWeight: 'normal', color: '#000000' }}>
                    No return without original invoice
                </div>
            </div>
        </div>
    );
}
