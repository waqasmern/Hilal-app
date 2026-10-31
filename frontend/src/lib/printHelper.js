/**
 * Print Helper Utility for Hilal Wholesaler Shop
 * Supports direct silent printing & printer device selection via Electron IPC,
 * with graceful fallback to standard browser printing when in web mode.
 */

export function isElectronRenderer() {
    return (
        typeof window !== 'undefined' &&
        typeof window.require === 'function' &&
        (() => {
            try {
                return !!window.require('electron');
            } catch (e) {
                return false;
            }
        })()
    );
}

/**
 * Fetch list of physical/virtual printers installed on the system via Electron IPC.
 * @returns {Promise<Array<{ name: string, isDefault: boolean }>>}
 */
export async function getInstalledPrinters() {
    if (!isElectronRenderer()) {
        return [];
    }
    try {
        const { ipcRenderer } = window.require('electron');
        const printers = await ipcRenderer.invoke('get-printers');
        return Array.isArray(printers) ? printers : [];
    } catch (err) {
        console.warn('[printHelper] getInstalledPrinters failed:', err);
        return [];
    }
}

/**
/**
 * Core print triggering function (adopted directly from the restaurant management system).
 * 
 * - When silentMode = true AND running inside Electron:
 *     Sends cleaned HTML to Electron main process via 'print-html' IPC.
 *     Electron prints directly to the specified printerName (or POS-80) with zero dialogs.
 * 
 * - When silentMode = false (or A4 bills) AND running inside Electron:
 *     Sends cleaned HTML to Electron main process with printerName = null.
 *     Electron uses the hidden window to trigger the native Windows OS print dialog,
 *     without opening a second visible app window!
 * 
 * - Otherwise (browser mode):
 *     Falls back to window.open() popup + window.print().
 * 
 * @param {string} html - Full HTML document string.
 * @param {boolean} [silentMode=false] - Silent printing flag (thermal only).
 * @param {string|null} [printerName=null] - Target device name.
 * @returns {Promise<boolean>}
 */
export async function triggerPrint(html, silentMode = false, printerName = null, format = 'thermal') {
    if (!html) return false;
    console.log('[printHelper] triggerPrint called. silentMode:', silentMode, 'printerName:', printerName, 'format:', format);
    const isElectron = isElectronRenderer();
    console.log('[printHelper] isElectronRenderer() output:', isElectron);

    if (isElectron) {
        try {
            const { ipcRenderer } = window.require('electron');
            console.log('[printHelper] Electron detected. Invoking print-html IPC. silentMode:', silentMode, 'printer:', printerName, 'format:', format);

            // Strip any inline print scripts so the hidden window doesn't print/close itself
            const cleanedHtml = html.replace(/<script\b[^>]*>([\s\S]*?window\.print[\s\S]*?)<\/script>/gi, '');

            const printPayload = {
                silent: !!silentMode,
                printerName: silentMode ? (printerName || null) : null,
                format: format || 'thermal'
            };
            const success = await ipcRenderer.invoke('print-html', cleanedHtml, printPayload);
            return !!success;
        } catch (err) {
            console.warn('[printHelper] Electron IPC print failed, falling back to window.open:', err);
        }
    }

    console.log('[printHelper] Falling back to browser window.open print');
    try {
        const printWin = window.open('', '', 'width=800,height=900,scrollbars=yes');
        if (!printWin) {
            console.error('[printHelper] window.open was blocked by the browser.');
            window.print();
            return false;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        return true;
    } catch (e) {
        console.error('[printHelper] Browser fallback printing failed:', e);
        return false;
    }
}

/**
 * Options-based wrapper for triggerPrint.
 * Supports silent printing and targeted printer device selection for both A4 and Thermal formats.
 * 
 * @param {string} htmlContent - Full HTML document string to print.
 * @param {Object} options - { silent: boolean, printerName: string, format: 'a4' | 'thermal' }
 * @returns {Promise<boolean>}
 */
export async function triggerPrintHtml(htmlContent, options = {}) {
    if (!htmlContent) return false;

    const silent = options.silent === true || options.silent === 'true';
    const printerName = (options.printerName || options.deviceName || '').trim();
    const format = options.format || 'thermal';

    return await triggerPrint(htmlContent, silent, printerName || null, format);
}

/**
 * Number to words converter for Pakistani Rupees currency.
 */
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

/**
 * Dynamic packaging summary (Bags, Cartons, Boxes, Loose Units).
 */
export function getPackagingSummary(items = []) {
    if (!items || items.length === 0) return 'Total Packages: 0';
    const bulkCounts = {};
    const looseCounts = {};
    items.forEach(it => {
        const factor = parseFloat(it.conversion_factor) || 1;
        const qty = parseFloat(it.quantity) || 0;
        const uSymbol = it.base_unit || it.unit_symbol || it.unit_name || 'pcs';
        const pName = it.packaging_name || (factor > 1 ? 'Bulk' : uSymbol);

        if (factor > 1) {
            bulkCounts[pName] = (bulkCounts[pName] || 0) + qty;
        } else {
            looseCounts[uSymbol] = (looseCounts[uSymbol] || 0) + qty;
        }
    });

    const parts = [];
    Object.entries(bulkCounts).forEach(([name, count]) => {
        parts.push(`${count} ${name}${count > 1 ? (name.endsWith('s') ? '' : 's') : ''}`);
    });
    Object.entries(looseCounts).forEach(([unit, count]) => {
        parts.push(`${count} ${unit}`);
    });

    return parts.length > 0 ? `Total Packages: ${parts.join(' + ')}` : 'Total Items: 0';
}

/**
 * Format packaging short name (e.g., Carton -> Ctn, Box -> Box, Packet -> Pkt).
 */
export function formatPackShort(name) {
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
 * Truncate item text with double dots (..) if length exceeds maxLen.
 */
export function truncateItemName(str, maxLen = 20) {
    if (!str) return '';
    const s = String(str).trim();
    return s.length > maxLen ? s.substring(0, maxLen - 2) + '..' : s;
}

/**
 * Generate a standalone, pixel-perfect 80mm thermal receipt HTML document.
 * Adheres strictly to:
 * - Dynamic shop logo, name, phone, address, NTN, email
 * - Dynamic customer name, phone, address, and cashier
 * - High-contrast solid borders only (no dotted/dashed lines)
 * - Pure black text (#000000) on Arial font to eliminate dotted thermal rasterization
 * - Compact item descriptions with long name truncation using '..'
 */
export function generateThermalReceiptHtml(inv, settings = {}, cashierName = '', prevBal = 0, newBal = 0) {
    if (!inv) return '';

    // Dynamic shop details from settings
    const shopName = (settings?.shop_name || 'HILAL WHOLESALER SHOP').trim();
    const shopAddress = (settings?.shop_address || '').trim();
    const shopPhone = (settings?.shop_phone || '').trim();
    const shopEmail = (settings?.shop_email || '').trim();
    const shopNtn = (settings?.shop_ntn || '').trim();
    const shopLogo = (settings?.shop_logo || '').trim();

    // Dynamic customer details from invoice
    const customerName = (inv.customer_name || inv.walkin_name || 'Walk-in Customer').trim() + 
        (inv.business_name ? ` (${inv.business_name.trim()})` : '');
    const customerPhone = (inv.customer_phone || inv.walkin_phone || inv.customer_mobile || inv.phone || '').trim();
    const customerAddress = (inv.customer_address || inv.walkin_address || inv.address || '').trim();
    const cashier = (inv.created_by_name || inv.cashier_name || cashierName || 'Cashier').trim();

    // Date formatting
    let formattedDate = '';
    try {
        const rawDate = inv.created_at ? new Date(inv.created_at) : new Date();
        formattedDate = isNaN(rawDate.getTime()) 
            ? new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : rawDate.toLocaleDateString() + ' ' + rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        formattedDate = new Date().toLocaleDateString();
    }

    // Financial calculations
    const items = inv.items || [];
    const grossVal = Number(inv.gross_amount !== undefined && inv.gross_amount !== null && parseFloat(inv.gross_amount) > 0 
        ? inv.gross_amount 
        : (items.reduce((sum, it) => sum + ((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0)), 0) || inv.net_amount || 0));
    const discVal = Number(inv.discount || items.reduce((sum, it) => sum + (parseFloat(it.discount) || 0), 0) || 0);
    const specialDiscVal = Number(inv.special_discount || 0);
    const chargesVal = Number(inv.additional_charges || 0);
    const netVal = Number(inv.net_amount !== undefined ? inv.net_amount : (grossVal - discVal - specialDiscVal + chargesVal));
    const paidVal = Number(inv.amount_paid !== undefined ? inv.amount_paid : 0);
    const dueVal = Number(inv.remaining_balance !== undefined ? inv.remaining_balance : Math.max(0, netVal - paidVal));

    const pBal = Number(prevBal || 0);
    const totalPayable = pBal + netVal;
    const finalBal = newBal !== undefined && newBal !== null ? Number(newBal) : (totalPayable - paidVal);
    const hasLedger = pBal > 0 || finalBal > 0;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${shopName} - Invoice #${inv.invoice_no || inv.id}</title>
    <style>
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
        }
        body {
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: 10px;
            line-height: 1.25;
            padding: 1mm 4mm 0mm 2mm !important;
            width: 100% !important;
            box-sizing: border-box !important;
            color: #000000 !important;
        }
        * {
            box-sizing: border-box;
            color: #000000 !important;
        }
        p { margin: 0; }
        @media print {
            @page {
                margin: 0 !important;
            }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            body {
                padding: 1mm 4mm 0mm 2mm !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        th, td {
            padding: 1.5px 1px;
            vertical-align: top;
            color: #000000;
        }
        .text-right {
            text-align: right;
            padding-right: 4px !important;
        }
        .text-center {
            text-align: center;
        }
        .item-title {
            font-size: 8.5px;
            font-weight: normal;
            line-height: 1.15;
            word-break: break-word;
            white-space: normal;
            display: block;
            width: 100%;
        }
        .item-sub {
            font-size: 7.5px;
            line-height: 1.1;
            color: #444444;
            font-weight: normal;
        }
        .logo-img {
            max-height: 42px;
            max-width: 120px;
            margin: 0 auto 3px auto;
            display: block;
            object-fit: contain;
        }
    </style>
</head>
<body>
    <div style="width: 100%; max-width: 100%; margin: 0; padding: 0;">
    <!-- 1. HEADER (LOGO, SHOP DETAILS & TOP BANK ACCOUNT) -->
    <div style="text-align: center; padding-bottom: 3px; border-bottom: 1.5px solid #000000;">
        ${shopLogo ? `
            <div style="margin-bottom: 2px;">
                <img src="${shopLogo}" alt="Shop Logo" class="logo-img" />
            </div>
        ` : ''}
        <div style="font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">
            ${shopName}
        </div>
        ${shopAddress ? `<div style="font-size: 9px; font-weight: normal; line-height: 1.2; margin-top: 1px; color: #222;">${shopAddress}</div>` : ''}
        <div style="font-size: 8.5px; font-weight: normal; margin-top: 1px; color: #222;">
            ${shopPhone ? `<span>Tel: ${shopPhone}</span>` : ''}
            ${shopPhone && shopNtn ? `<span style="margin: 0 4px;">|</span>` : ''}
            ${shopNtn ? `<span>NTN: ${shopNtn}</span>` : ''}
        </div>
    </div>

    <!-- 2. METADATA TABLE (SOLID BORDER, DYNAMIC CUSTOMER DETAILS) -->
    <div style="padding: 2px 0; border-bottom: 1px solid #000000;">
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
            <tr>
                <td style="width: 32%; font-weight: bold; color: #000000; text-align: left;">Invoice #:</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace; font-size: 9px; padding-right: 4px; color: #000000;">${inv.invoice_no || inv.id}</td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Date & Time:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">${formattedDate}</td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Cashier:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">${cashier}</td>
            </tr>
            <tr style="border-top: 1px dashed #666666;">
                <td style="font-weight: normal; color: #333; text-align: left; padding-top: 2px;">Billed To:</td>
                <td style="text-align: right; font-weight: bold; padding-top: 2px; padding-right: 4px; word-break: break-word;">${customerName}</td>
            </tr>
            ${customerPhone ? `
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Mobile / Tel:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">${customerPhone}</td>
            </tr>` : ''}
            ${customerAddress ? `
            <tr>
                <td style="text-align: left; vertical-align: top; font-weight: normal; color: #333;">Address:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px; word-break: break-word;">${customerAddress}</td>
            </tr>` : ''}
        </table>
    </div>

    <!-- 3. ITEMS TABLE (FULL ITEM NAME, RATE, DISC & NET IN ROW, 72mm WIDTH) -->
    <div style="padding: 2px 0; border-bottom: 1px solid #000000;">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid #000000; font-size: 8.5px; font-weight: bold; text-transform: uppercase;">
                    <th style="text-align: center; width: 7%; padding: 2px 0; font-weight: bold;">#</th>
                    <th style="text-align: left; width: 36%; padding: 2px 1px; font-weight: bold;">Item Description</th>
                    <th style="text-align: center; width: 13%; padding: 2px 1px; font-weight: bold;">Qty</th>
                    <th style="text-align: right; width: 14%; padding: 2px 1px; font-weight: bold;">Rate</th>
                    <th style="text-align: right; width: 13%; padding: 2px 1px; font-weight: bold;">Disc</th>
                    <th style="text-align: right; width: 17%; padding: 2px 4px 2px 1px; font-weight: bold;">Net</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((it, idx) => {
                    const factor = parseFloat(it.conversion_factor) || 1;
                    const isBulk = factor > 1;
                    const uSymbol = it.base_unit || it.unit_symbol || it.unit_name || 'pcs';
                    const packName = it.packaging_name || (isBulk ? 'Bulk' : uSymbol);
                    const qty = parseFloat(it.quantity) || 0;
                    const looseQty = isBulk ? (qty * factor) : qty;
                    const qtyCol = isBulk ? `${qty} ${formatPackShort(packName)}` : `${looseQty}`;
                    const packageDetail = isBulk ? `${qty} ${packName} (${looseQty} ${uSymbol})` : `${looseQty} ${uSymbol}`;
                    const variantText = it.variant_name && it.variant_name !== 'Standard' ? `(${it.variant_name}) ` : '';
                    const itDiscount = parseFloat(it.discount) || 0;

                    return `
                    <tr style="border-bottom: 1px solid #999999;">
                        <td style="padding: 3px 0; text-align: center; font-size: 8.5px; font-weight: normal; color: #555; border-bottom: 1px solid #999999;">
                            ${idx + 1}
                        </td>
                        <td style="padding: 3px 1px; text-align: left; border-bottom: 1px solid #999999;">
                            <div class="item-title">${it.product_name}</div>
                            <div class="item-sub">${variantText}${packageDetail}</div>
                        </td>
                        <td style="padding: 3px 1px; text-align: center; font-size: 8.5px; font-weight: normal; border-bottom: 1px solid #999999;">
                            ${qtyCol}
                        </td>
                        <td style="padding: 3px 1px; text-align: right; font-size: 8.5px; font-weight: normal; border-bottom: 1px solid #999999;">
                            ${Number(it.price).toFixed(0)}
                        </td>
                        <td style="padding: 3px 1px; text-align: right; font-size: 8.5px; font-weight: normal; color: #555; border-bottom: 1px solid #999999;">
                            ${itDiscount > 0 ? `${itDiscount.toFixed(0)}` : '0'}
                        </td>
                        <td style="padding: 3px 4px 3px 1px; text-align: right; font-size: 8.5px; font-weight: normal; border-bottom: 1px solid #999999;">
                            ${Number(it.total).toFixed(0)}
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <!-- 4. CURRENT BILL FINANCIAL TOTALS -->
    <div style="padding: 2px 0; border-bottom: 1px solid #000000;">
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Gross Amount:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">Rs. ${grossVal.toFixed(2)}</td>
            </tr>
            ${discVal > 0 ? `
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Less Item Discount:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">- Rs. ${discVal.toFixed(2)}</td>
            </tr>` : ''}
            ${specialDiscVal > 0 ? `
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Less Special Discount:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">- Rs. ${specialDiscVal.toFixed(2)}</td>
            </tr>` : ''}
            ${chargesVal > 0 ? `
            <tr>
                <td style="text-align: left; font-weight: normal; color: #333;">Add Charges:</td>
                <td style="text-align: right; font-weight: normal; padding-right: 4px;">+ Rs. ${chargesVal.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; font-size: 11px; font-weight: bold;">
                <td style="padding: 2.5px 0; text-align: left;">CURRENT BILL:</td>
                <td style="padding: 2.5px 4px 2.5px 0; text-align: right;">Rs. ${netVal.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="padding-top: 2px; text-align: left; font-weight: normal; color: #333;">Paid on Bill:</td>
                <td style="padding-top: 2px; text-align: right; font-weight: normal; padding-right: 4px;">Rs. ${paidVal.toFixed(2)}</td>
            </tr>
            ${!hasLedger ? `
            <tr>
                <td style="padding-top: 1px; text-align: left; font-weight: normal; color: #333;">${dueVal > 0 ? 'Bill Balance Due:' : 'Change Return:'}</td>
                <td style="padding-top: 1px; text-align: right; font-weight: normal; padding-right: 4px;">Rs. ${Math.abs(dueVal).toFixed(2)}</td>
            </tr>` : ''}
        </table>
    </div>

    <!-- 5. CUSTOMER LEDGER STATEMENT (CLEAR, MATHEMATICALLY VERIFIABLE) -->
    ${hasLedger ? `
    <div style="padding: 2px 0; border-bottom: 1px solid #000000; font-size: 9px;">
        <div style="text-align: center; font-weight: normal; font-size: 8px; letter-spacing: 0.5px; color: #555; border-bottom: 1px dashed #888888; padding-bottom: 1px; margin-bottom: 2px;">
            *** CUSTOMER LEDGER STATEMENT ***
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
            <tr>
                <td style="text-align: left; font-weight: bold; color: #000000;">Previous Balance:</td>
                <td style="text-align: right; font-weight: bold; padding-right: 4px; color: #000000;">Rs. ${pBal.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: 600; color: #000000;">+ Current Bill:</td>
                <td style="text-align: right; font-weight: 600; padding-right: 4px; color: #000000;">+ Rs. ${netVal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px solid #999999;">
                <td style="text-align: left; font-weight: 600; color: #000000;">Total Payable:</td>
                <td style="text-align: right; font-weight: 600; padding-right: 4px; color: #000000;">Rs. ${totalPayable.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="text-align: left; font-weight: 600; color: #000000;">- Paid Today:</td>
                <td style="text-align: right; font-weight: 600; padding-right: 4px; color: #000000;">- Rs. ${paidVal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; font-size: 11px; font-weight: bold;">
                <td style="padding: 2.5px 0; text-align: left;">NEW BALANCE:</td>
                <td style="padding: 2.5px 4px 2.5px 0; text-align: right;">Rs. ${finalBal.toFixed(2)}</td>
            </tr>
        </table>
    </div>
    ` : ''}

    <!-- 6. FOOTER -->
    <div style="padding-top: 3px; font-size: 8.5px; text-align: center; font-weight: normal;">
        <div style="font-weight: normal; margin-top: 1px;">
            *** THANK YOU FOR YOUR BUSINESS! ***
        </div>
        <div style="font-size: 7.5px; margin-top: 1px; color: #555;">
            No return without original invoice
        </div>
    </div>
    </div>
    <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>`;
}

/**
 * Generate a standalone, bulletproof Wholesale A4 Invoice HTML document.
 * Self-contained pure CSS table layout that renders and prints identically across all environments.
 * 
 * @param {Object} inv - Invoice/sale object
 * @param {Object} [settings={}] - Shop settings
 * @param {number} [prevBal=0] - Customer's previous ledger balance
 * @param {number|null} [newBal=null] - Customer's new ledger balance
 * @returns {string} Full HTML document string ready for printing or PDF export
 */
export function generateWholesaleInvoiceA4Html(inv, settings = {}, prevBal = 0, newBal = null) {
    if (!inv) return '';

    const shopName = (settings?.shop_name || 'HILAL FOODS SOLUTIONS').trim();
    const shopAddress = (settings?.shop_address || 'Main Bazaar, Timergara, KP, Pakistan').trim();
    const shopPhone = (settings?.shop_phone || '+92 300 1234567').trim();
    const shopEmail = (settings?.shop_email || 'hilalwholesaler@gmail.com').trim();
    const shopLogo = (settings?.shop_logo || '').trim();

    // Customer info
    const customerName = (inv.customer_name || inv.walkin_name || 'Walk-in Customer').trim();
    const businessName = (inv.business_name || inv.customer_business || '').trim();
    const fullCustomerTitle = businessName ? `${customerName} (${businessName})` : customerName;
    const customerPhone = (inv.customer_phone || inv.customer_mobile || inv.walkin_phone || inv.phone || '0945123456').trim();
    const customerAddress = (inv.customer_address || inv.walkin_address || inv.address || 'Main Market, Timergara').trim();
    const remarks = (inv.remarks || '').trim();

    // Formatted date
    let formattedDate = '';
    try {
        const rawDate = inv.created_at ? new Date(inv.created_at) : new Date();
        formattedDate = isNaN(rawDate.getTime()) ? new Date().toLocaleDateString() : rawDate.toLocaleDateString();
    } catch (_) {
        formattedDate = new Date().toLocaleDateString();
    }

    // Financial numbers
    const items = inv.items || [];
    const grossVal = Number(
        inv.gross_amount !== undefined && inv.gross_amount !== null && parseFloat(inv.gross_amount) > 0
            ? inv.gross_amount
            : (items.reduce((sum, it) => sum + ((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 0)), 0) || inv.net_amount || 0)
    );
    const discVal = Number(inv.discount || items.reduce((sum, it) => sum + (parseFloat(it.discount) || 0), 0) || 0);
    const specialDiscVal = Number(inv.special_discount || inv.specialDiscount || 0);
    const chargesVal = Number(inv.additional_charges || inv.additionalCharges || inv.charges || 0);
    const netVal = Number(inv.net_amount !== undefined ? inv.net_amount : (grossVal - discVal - specialDiscVal + chargesVal));
    const paidVal = Number(inv.amount_paid !== undefined ? inv.amount_paid : 0);
    const remainingVal = Number(inv.remaining_balance !== undefined ? inv.remaining_balance : Math.max(0, netVal - paidVal));

    const pBal = Number(prevBal || 0);
    const fBal = newBal !== undefined && newBal !== null ? Number(newBal) : (pBal + remainingVal);

    // Status
    let status = 'PENDING';
    if (remainingVal <= 0 && (paidVal >= netVal || netVal === 0)) status = 'PAID';
    else if (paidVal > 0 && remainingVal > 0) status = 'PARTIAL';
    else status = 'PENDING';

    const statusBg = status === 'PAID' ? '#dcfce7' : status === 'PARTIAL' ? '#fef3c7' : '#ffe4e6';
    const statusColor = status === 'PAID' ? '#166534' : status === 'PARTIAL' ? '#92400e' : '#9f1239';
    const statusBorder = status === 'PAID' ? '#86efac' : status === 'PARTIAL' ? '#fde68a' : '#fca5a5';

    // Bank accounts
    const defaultBankAccounts = [
        {
            bank_name: 'Meezan Bank',
            account_title: shopName,
            account_number: '0101-0102030405',
            iban: 'PK12MEZN0001010102030405',
            branch: 'Timergara Branch'
        }
    ];
    let bankAccounts = defaultBankAccounts;
    if (settings?.bank_accounts) {
        if (Array.isArray(settings.bank_accounts) && settings.bank_accounts.length > 0) {
            bankAccounts = settings.bank_accounts;
        } else {
            try {
                const parsed = JSON.parse(settings.bank_accounts);
                if (Array.isArray(parsed) && parsed.length > 0) bankAccounts = parsed;
            } catch (_) {}
        }
    }

    // Rows HTML
    const rowsHtml = items.map((it, idx) => {
        const factor = parseFloat(it.conversion_factor) || 1;
        const isBulk = factor > 1;
        const uSymbol = it.base_unit || it.unit_symbol || it.unit_name || 'pcs';
        const packName = it.packaging_name || (isBulk ? 'Bulk' : uSymbol);
        const qty = parseFloat(it.quantity) || 0;
        const qtyDisplay = isBulk ? `${qty} ${packName} (${qty * factor} ${uSymbol})` : `${qty} ${uSymbol}`;
        const linePrice = parseFloat(it.price) || 0;
        const lineGross = linePrice * qty;
        const lineDiscount = parseFloat(it.discount) || 0;
        const discPct = lineGross > 0 && lineDiscount > 0 ? ((lineDiscount / lineGross) * 100).toFixed(0) + '%' : '0%';
        const lineTotal = it.total !== undefined ? parseFloat(it.total) : (lineGross - lineDiscount);

        return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 6px 6px; text-align: center; color: #6b7280; font-family: monospace; font-size: 11px;">${idx + 1}</td>
                <td style="padding: 6px 8px; font-weight: 600; color: #111827;">
                    ${it.product_name}
                    ${it.variant_name && it.variant_name !== 'Standard' ? `<span style="color: #6b7280; font-weight: normal; margin-left: 4px;">(${it.variant_name})</span>` : ''}
                </td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #111827;">${Number(linePrice).toFixed(0)}</td>
                <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #111827;">${qtyDisplay}</td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #111827;">${Number(lineGross).toFixed(2)}</td>
                <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #4b5563;">${discPct}</td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #111827;">${Number(lineDiscount).toFixed(0)}</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: bold; font-family: monospace; color: #111827;">${Number(lineTotal).toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const bankCardsHtml = bankAccounts.map(acc => `
        <div style="border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; background: #f9fafb; font-size: 10px; line-height: 1.35;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #111827;">
                <span>${acc.bank_name}</span>
                ${acc.branch ? `<span style="font-weight: normal; color: #6b7280;">${acc.branch}</span>` : ''}
            </div>
            ${acc.account_title ? `<div><span style="color: #6b7280;">Title: </span><span style="font-weight: 600; color: #374151;">${acc.account_title}</span></div>` : ''}
            <div><span style="color: #6b7280;">A/C #: </span><span style="font-family: monospace; font-weight: bold; color: #111827;">${acc.account_number}</span></div>
            ${acc.iban ? `<div><span style="color: #6b7280;">IBAN: </span><span style="font-family: monospace; color: #4b5563; font-size: 9.5px;">${acc.iban}</span></div>` : ''}
        </div>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${shopName} - Invoice #${inv.invoice_no || inv.id}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 8mm 10mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111827;
        }
        body {
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: 11px;
            line-height: 1.35;
            width: 100%;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        .container {
            border: 1px solid #d1d5db;
            border-radius: 10px;
            padding: 16px 20px;
            background: #ffffff;
            max-width: 100%;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- TOP HEADER: SHOP INFO & INVOICE / CUSTOMER META -->
        <table style="width: 100%; margin-bottom: 12px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px;">
            <tr>
                <!-- LEFT SIDE: LOGO & SHOP INFO -->
                <td style="width: 50%; vertical-align: top; padding-right: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                        ${shopLogo ? `
                            <img src="${shopLogo}" alt="Logo" style="height: 44px; width: 44px; object-fit: contain; border-radius: 6px; border: 1px solid #e5e7eb; padding: 2px;" />
                        ` : `
                            <div style="height: 40px; width: 40px; border-radius: 8px; background: linear-gradient(135deg, #B8860B, #FFD700); color: #fff; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center;">
                                ${shopName.charAt(0)}
                            </div>
                        `}
                        <div>
                            <div style="font-size: 14px; font-weight: 900; text-transform: uppercase; color: #111827; letter-spacing: 0.3px;">
                                ${shopName}
                            </div>
                            <div style="font-size: 9.5px; font-weight: bold; color: #B8860B; text-transform: uppercase; letter-spacing: 0.8px;">
                                DISTRIBUTION NETWORK
                            </div>
                        </div>
                    </div>
                    <div style="font-size: 10.5px; color: #374151; line-height: 1.35;">
                        <div><strong style="color: #111827;">Address: </strong>${shopAddress}</div>
                        <div><strong style="color: #111827;">Phone: </strong><span style="font-family: monospace;">${shopPhone}</span></div>
                        <div><strong style="color: #111827;">Email: </strong><span style="font-family: monospace; color: #4b5563;">${shopEmail}</span></div>
                    </div>
                </td>

                <!-- RIGHT SIDE: INVOICE META & CUSTOMER DETAILS -->
                <td style="width: 50%; vertical-align: top; text-align: right; padding-left: 12px;">
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; text-align: right;">
                        <div style="margin-bottom: 3px;">
                            <span style="font-weight: bold; color: #6b7280; font-size: 10.5px;">INVOICE # : </span>
                            <span style="font-family: monospace; font-weight: 900; font-size: 13px; color: #B8860B;">${inv.invoice_no || inv.id}</span>
                        </div>
                        <div style="margin-bottom: 3px;">
                            <span style="font-weight: 600; color: #4b5563; font-size: 10.5px;">Invoice Date: </span>
                            <span style="font-family: monospace; font-weight: bold; color: #111827;">${formattedDate}</span>
                        </div>
                        <div>
                            <span style="font-weight: 600; color: #4b5563; font-size: 10.5px;">Payment Status: </span>
                            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 900; text-transform: uppercase; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder};">
                                ${status}
                            </span>
                        </div>
                    </div>

                    <div style="border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 10.5px; line-height: 1.35;">
                        <div style="font-weight: 800; color: #111827; text-transform: uppercase; margin-bottom: 2px;">
                            BILLED TO (${fullCustomerTitle})
                        </div>
                        <div><strong style="color: #4b5563;">Mobile / Phone: </strong><span style="font-family: monospace;">${customerPhone}</span></div>
                        <div><strong style="color: #4b5563;">Address: </strong><span>${customerAddress}</span></div>
                        ${remarks ? `<div><strong style="color: #4b5563;">Remarks: </strong><span style="font-style: italic; color: #4b5563;">${remarks}</span></div>` : ''}
                    </div>
                </td>
            </tr>
        </table>

        <!-- ITEMS TABLE -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
            <thead>
                <tr style="background: #f9fafb; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; color: #047857; font-weight: bold;">
                    <th style="padding: 6px 6px; text-align: center; width: 30px;">#</th>
                    <th style="padding: 6px 8px; text-align: left;">Product Description</th>
                    <th style="padding: 6px 8px; text-align: right; width: 65px;">Price</th>
                    <th style="padding: 6px 8px; text-align: center; width: 120px;">Quantity</th>
                    <th style="padding: 6px 8px; text-align: right; width: 85px;">Gross Amount</th>
                    <th style="padding: 6px 8px; text-align: center; width: 50px;">Disc.%</th>
                    <th style="padding: 6px 8px; text-align: right; width: 60px;">Disc.</th>
                    <th style="padding: 6px 8px; text-align: right; width: 85px;">Net Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <!-- BALANCES & FINANCIAL SUMMARY -->
        <table style="width: 100%; margin-bottom: 10px; font-size: 11px;">
            <tr>
                <!-- LEFT BOX: RUNNING BALANCES -->
                <td style="width: 50%; vertical-align: top; padding-right: 14px; line-height: 1.55;">
                    <div><span style="font-weight: 600; color: #374151;">Current Invoice: </span><span style="color: #111827;">Rs. ${Number(netVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: 600; color: #374151;">Paid Amount: </span><span style="font-weight: 600; color: #047857;">Rs. ${Number(paidVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: 600; color: #374151;">Invoice Due: </span><span style="font-weight: 600; color: ${remainingVal > 0 ? '#be123c' : '#111827'};">Rs. ${Number(remainingVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: bold; color: #111827;">Previous Balance : </span><span style="font-weight: bold; color: #111827;">Rs. ${Number(pBal).toFixed(2)}</span></div>
                    <div style="border-bottom: 2px solid #111827; display: inline-block; padding-bottom: 2px; margin-top: 2px;">
                        <span style="font-weight: bold; color: #111827;">New Balance: </span>
                        <span style="font-weight: bold; color: #111827;">Rs. ${Number(fBal).toFixed(0)}</span>
                    </div>
                </td>

                <!-- RIGHT BOX: TOTALS & NET VALUE -->
                <td style="width: 50%; vertical-align: top; text-align: right; padding-left: 14px; line-height: 1.55;">
                    <div><span style="font-weight: 600; color: #374151;">Gross Amount: </span><span style="color: #111827;">Rs. ${Number(grossVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: 600; color: #374151;">Less Disc.: </span><span style="color: #111827;">Rs. ${Number(discVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: 600; color: #374151;">Less Special Disc.: </span><span style="color: #111827;">Rs. ${specialDiscVal % 1 === 0 ? Number(specialDiscVal).toFixed(0) : Number(specialDiscVal).toFixed(2)}</span></div>
                    <div><span style="font-weight: 600; color: #374151;">Add Charges : </span><span style="color: #111827;">Rs. ${chargesVal % 1 === 0 ? Number(chargesVal).toFixed(0) : Number(chargesVal).toFixed(2)}</span></div>
                    <div style="border-top: 1px solid #d1d5db; margin-top: 4px; padding-top: 4px;">
                        <span style="font-size: 13px; font-weight: bold; color: #111827;">Net Value: </span>
                        <span style="font-size: 13px; font-weight: 900; color: #111827;">Rs. ${Number(netVal).toFixed(2)}</span>
                    </div>
                </td>
            </tr>
        </table>

        <!-- AMOUNT IN WORDS -->
        <div style="border-top: 1px solid #d1d5db; padding-top: 8px; margin-bottom: 10px; font-size: 11px;">
            <strong style="color: #374151;">Invoice Amount In Words: </strong>
            <span style="font-weight: bold; color: #111827;">${numberToWords(netVal)}</span>
        </div>

        <!-- BANK DETAILS -->
        ${bankAccounts.length > 0 ? `
            <div style="border-top: 1px solid #d1d5db; padding-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 900; font-size: 10.5px; text-transform: uppercase; color: #111827; letter-spacing: 0.5px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #B8860B; margin-right: 4px;"></span>
                        BANK DETAILS FOR ONLINE PAYMENT / TRANSFER
                    </span>
                    <span style="font-size: 9.5px; color: #6b7280;">WhatsApp proof: ${shopPhone}</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(${Math.min(bankAccounts.length, 3)}, 1fr); gap: 8px;">
                    ${bankCardsHtml}
                </div>
            </div>
        ` : ''}
    </div>
    <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>`;
}

/**
 * Generate a clean diagnostic Test Print slip HTML document.
 * @param {Object} settings - Shop settings
 * @param {string} targetPrinter - Selected printer name
 * @param {boolean} isSilent - Whether silent printing is enabled
 * @param {string} format - 'thermal' | 'a4'
 * @returns {string} HTML string
 */
export function generateTestPrintHtml(settings = {}, targetPrinter = '', isSilent = false, format = 'thermal') {
    const isThermal = format === 'thermal' || /pos|80|receipt|thermal/i.test(targetPrinter);
    const shopName = settings.shop_name || 'HILAL WHOLESALER SHOP';
    const shopAddress = settings.shop_address || 'Main Bazaar, Timergara, KP';
    const shopPhone = settings.shop_phone || '+92 300 1234567';
    const printTime = new Date().toLocaleString();
    const printerLabel = targetPrinter ? targetPrinter : 'System Default Printer';

    if (isThermal) {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test Print (80mm) - ${shopName}</title>
    <style>
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
        }
        body {
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: 11px;
            color: #000;
            background: #fff;
            padding: 1mm 4mm 0mm 2mm !important;
            width: 100% !important;
            box-sizing: border-box !important;
            line-height: 1.3;
        }
        * { 
            box-sizing: border-box; 
            color: #000000 !important;
        }
        p { margin: 0; }
        @media print {
            @page { margin: 0 !important; }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            body {
                padding: 1mm 4mm 0mm 2mm !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
            }
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 6px;
            margin-bottom: 6px;
        }
        .shop-name {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
        }
        .logo-img {
            max-height: 48px;
            max-width: 140px;
            margin: 0 auto 4px auto;
            display: block;
            object-fit: contain;
        }
        .badge {
            display: inline-block;
            border: 1.5px solid #000;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: 900;
            margin-top: 4px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
            margin: 6px 0;
        }
        td {
            padding: 2px 0;
            vertical-align: top;
        }
        td.label {
            font-weight: bold;
            width: 45%;
        }
        .status-box {
            border: 1.5px solid #000;
            padding: 6px;
            text-align: center;
            margin-top: 6px;
            font-size: 10.5px;
        }
        .footer {
            text-align: center;
            margin-top: 8px;
            font-size: 9px;
            border-top: 1px solid #000;
            padding-top: 6px;
        }
    </style>
</head>
<body>
    <div class="header">
        ${settings.shop_logo ? `<img src="${settings.shop_logo}" alt="Logo" class="logo-img" />` : ''}
        <div class="shop-name">${shopName}</div>
        <div style="font-size: 10px;">${shopAddress}</div>
        <div style="font-size: 10px;">Tel: ${shopPhone}</div>
        <div><span class="badge">THERMAL TEST SLIP (80mm)</span></div>
    </div>

    <table>
        <tr>
            <td class="label">Target Printer:</td>
            <td>${printerLabel}</td>
        </tr>
        <tr>
            <td class="label">Silent Mode:</td>
            <td>${isSilent ? 'ENABLED (Direct Silent)' : 'DISABLED (OS Dialog)'}</td>
        </tr>
        <tr>
            <td class="label">Paper Roll:</td>
            <td>80mm Thermal (72mm Active Zone)</td>
        </tr>
        <tr>
            <td class="label">Print Time:</td>
            <td>${printTime}</td>
        </tr>
    </table>

    <div class="status-box">
        <strong>*** POS-80 TEST OK ***</strong><br />
        Hardware communication verified. Ready for wholesale thermal receipts!
    </div>

    <div class="footer">
        Hilal Wholesaler POS • Powered by Electron
    </div>
    <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>
        `;
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test Print - ${shopName}</title>
    <style>
        @page {
            size: auto;
            margin: 8mm 10mm;
        }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
            font-size: 12px;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 12px;
            line-height: 1.4;
        }
        .container {
            max-width: 480px;
            margin: 0 auto;
            border: 2px solid #111827;
            border-radius: 8px;
            padding: 16px;
        }
        .header {
            text-align: center;
            border-bottom: 2px dashed #111827;
            padding-bottom: 12px;
            margin-bottom: 12px;
        }
        .shop-name {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin-bottom: 3px;
        }
        .badge {
            display: inline-block;
            background: #111827;
            color: #ffffff;
            padding: 3px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            margin-top: 6px;
            letter-spacing: 0.5px;
        }
        .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            font-size: 11.5px;
        }
        .info-table td {
            padding: 4px 2px;
            vertical-align: top;
        }
        .info-table td.label {
            font-weight: 700;
            color: #374151;
            width: 40%;
        }
        .info-table td.val {
            font-family: monospace;
            font-weight: 600;
        }
        .status-box {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            padding: 10px;
            text-align: center;
            margin-top: 12px;
        }
        .status-box .check {
            font-size: 14px;
            font-weight: 800;
            color: #059669;
        }
        .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 10px;
            color: #6b7280;
            border-top: 1px dashed #d1d5db;
            padding-top: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="shop-name">${shopName}</div>
            <div style="font-size: 10.5px; color: #4b5563;">${shopAddress}</div>
            <div style="font-size: 10.5px; color: #4b5563;">Tel: ${shopPhone}</div>
            <div>
                <span class="badge">PRINTER DIAGNOSTIC TEST</span>
            </div>
        </div>

        <table class="info-table">
            <tr>
                <td class="label">Target Printer:</td>
                <td class="val">${printerLabel}</td>
            </tr>
            <tr>
                <td class="label">Silent Print Mode:</td>
                <td class="val">${isSilent ? 'ENABLED (Direct Silent)' : 'DISABLED (OS Dialog)'}</td>
            </tr>
            <tr>
                <td class="label">Print Timestamp:</td>
                <td class="val">${printTime}</td>
            </tr>
            <tr>
                <td class="label">App Environment:</td>
                <td class="val">${isElectronRenderer() ? 'Electron Desktop Native' : 'Web Browser'}</td>
            </tr>
        </table>

        <div class="status-box">
            <div class="check"><svg style="display:inline-block;vertical-align:-2px;width:15px;height:15px;margin-right:4px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>PRINTER COMMUNICATION OK</div>
            <div style="font-size: 11px; color: #374151; margin-top: 2px;">
                Your printer hardware is successfully configured and ready for wholesale invoices and receipts.
            </div>
        </div>

        <div class="footer">
            Hilal Wholesaler POS & Inventory System • Powered by Electron Engine
        </div>
    </div>
</body>
</html>
    `;
}
