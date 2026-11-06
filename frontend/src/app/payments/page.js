'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { apiUrl } from '../../lib/api';
import { triggerPrintHtml } from '../../lib/printHelper';
import CustomModalAlert from '../components/CustomModalAlert';
import {
    IconPayments,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconPrinter,
    IconClose,
    IconCheck,
    IconCalendar,
    IconWhatsApp,
    IconBank,
    IconCreditCard,
    IconSpinner,
    IconChevronLeft,
    IconChevronRight,
    IconChevronDoubleLeft,
    IconChevronDoubleRight,
    IconCashRegister,
    IconEye
} from '../components/Icons';

function getPageNumbers(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
        return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
        return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
}

function numberToWords(num) {
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

function getTodayString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PaymentsPage() {
    const settings = useSelector(state => state.settings);
    const { user } = useSelector(state => state.auth);

    // Data States
    const [payments, setPayments] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        totalAmount: 0,
        customerAmount: 0,
        supplierAmount: 0,
        netCashFlow: 0,
        customerCount: 0,
        supplierCount: 0,
        cashAmount: 0,
        bankAmount: 0,
        onlineAmount: 0,
        chequeAmount: 0,
        totalCount: 0
    });

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalServerPayments, setTotalServerPayments] = useState(0);
    const [totalServerPages, setTotalServerPages] = useState(1);

    // Filter States
    const [partyTypeFilter, setPartyTypeFilter] = useState('ALL'); // 'ALL' | 'customer' | 'supplier'
    const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL'); // 'ALL' | 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'cheque'
    const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'
    const [customStartDate, setCustomStartDate] = useState(getTodayString());
    const [customEndDate, setCustomEndDate] = useState(getTodayString());
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Modal Alert
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: ''
    });

    const showAlert = (title, message, type = 'info') => {
        setModalAlert({ isOpen: true, title, message, type });
    };

    // Add Payment Modal State
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [partyType, setPartyType] = useState('customer');
    const [partyId, setPartyId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentDate, setPaymentDate] = useState(getTodayString());
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Print & Voucher View Modal
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const [voucherModalOpen, setVoucherModalOpen] = useState(false);
    const [printFormat, setPrintFormat] = useState('thermal'); // 'thermal' | 'a4'

    // Debounce search query (300ms) to avoid server overload
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1); // reset to page 1 on new search
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset page to 1 when filters change
    const handleFilterChange = (setter, val) => {
        setter(val);
        setCurrentPage(1);
    };

    // Load master parties once
    useEffect(() => {
        fetchCustomers();
        fetchSuppliers();
    }, []);

    // Main data fetching effect triggered on filter or page changes
    useEffect(() => {
        fetchPayments();
    }, [currentPage, pageSize, partyTypeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate, debouncedSearch]);

    const fetchCustomers = async () => {
        try {
            const res = await fetch(apiUrl('/api/customers'));
            if (res.ok) {
                const data = await res.json();
                setCustomers(data);
                if (data.length > 0 && partyType === 'customer' && !partyId) {
                    setPartyId(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch customers:', err);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await fetch(apiUrl('/api/suppliers'));
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data);
                if (data.length > 0 && partyType === 'supplier' && !partyId) {
                    setPartyId(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch suppliers:', err);
        }
    };

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
                paginate: 'true',
                partyType: partyTypeFilter,
                paymentMethod: paymentMethodFilter,
                dateFilter,
                search: debouncedSearch.trim(),
                startDate: customStartDate,
                endDate: customEndDate
            });

            const res = await fetch(apiUrl(`/api/payments?${params.toString()}`));
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const json = await res.json();

            // Resilient handling: Support both paginated object and plain array fallback
            if (json && json.data && json.pagination) {
                setPayments(json.data || []);
                setTotalServerPayments(json.pagination.total || 0);
                setTotalServerPages(json.pagination.totalPages || 1);
                if (json.summary) {
                    setSummary(json.summary);
                }
            } else if (Array.isArray(json)) {
                // Fallback for legacy unpaginated array
                const raw = json;
                let filtered = raw;
                if (partyTypeFilter !== 'ALL') {
                    filtered = filtered.filter(p => p.party_type === partyTypeFilter);
                }
                if (paymentMethodFilter !== 'ALL') {
                    filtered = filtered.filter(p => (p.payment_method || '').toLowerCase() === paymentMethodFilter.toLowerCase());
                }
                if (debouncedSearch) {
                    const q = debouncedSearch.toLowerCase();
                    filtered = filtered.filter(p =>
                        (p.party_name && p.party_name.toLowerCase().includes(q)) ||
                        (p.party_business && p.party_business.toLowerCase().includes(q)) ||
                        (p.reference_no && p.reference_no.toLowerCase().includes(q)) ||
                        (p.notes && p.notes.toLowerCase().includes(q)) ||
                        String(p.amount).includes(q)
                    );
                }

                const total = filtered.length;
                const totalPages = Math.max(1, Math.ceil(total / pageSize));
                const start = (currentPage - 1) * pageSize;
                const paginated = filtered.slice(start, start + pageSize);

                setPayments(paginated);
                setTotalServerPayments(total);
                setTotalServerPages(totalPages);

                let custAmt = 0;
                let suppAmt = 0;
                let cashAmt = 0;
                let bankAmt = 0;
                let onlineAmt = 0;
                let chqAmt = 0;
                let custCnt = 0;
                let suppCnt = 0;

                filtered.forEach(p => {
                    const amt = Number(p.amount) || 0;
                    const m = (p.payment_method || '').toLowerCase();
                    if (p.party_type === 'customer') {
                        custAmt += amt;
                        custCnt++;
                    } else {
                        suppAmt += amt;
                        suppCnt++;
                    }
                    if (m === 'cash') cashAmt += amt;
                    else if (m === 'bank') bankAmt += amt;
                    else if (m === 'easypaisa' || m === 'jazzcash') onlineAmt += amt;
                    else if (m === 'cheque') chqAmt += amt;
                });

                setSummary({
                    totalAmount: custAmt + suppAmt,
                    customerAmount: custAmt,
                    supplierAmount: suppAmt,
                    netCashFlow: custAmt - suppAmt,
                    customerCount: custCnt,
                    supplierCount: suppCnt,
                    cashAmount: cashAmt,
                    bankAmount: bankAmt,
                    onlineAmount: onlineAmt,
                    chequeAmount: chqAmt,
                    totalCount: total
                });
            }
        } catch (err) {
            console.error('Failed to fetch payments:', err);
            showAlert('Fetch Error', 'Could not load payment vouchers: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Calculate selected party details & current balance for the Add Modal
    const selectedParty = useMemo(() => {
        if (!partyId) return null;
        if (partyType === 'customer') {
            return customers.find(c => c.id === parseInt(partyId)) || null;
        } else {
            return suppliers.find(s => s.id === parseInt(partyId)) || null;
        }
    }, [partyType, partyId, customers, suppliers]);

    const currentBalance = useMemo(() => {
        return parseFloat(selectedParty?.balance || 0);
    }, [selectedParty]);

    const newBalancePreview = useMemo(() => {
        const numAmount = parseFloat(amount) || 0;
        return currentBalance - numAmount;
    }, [currentBalance, amount]);

    const handleSavePayment = async (e) => {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (!partyId) {
            return showAlert('Validation Error', 'Please select a Customer or Supplier.', 'warning');
        }
        if (!numAmount || numAmount <= 0) {
            return showAlert('Validation Error', 'Please enter a valid payment amount greater than zero.', 'warning');
        }

        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/payments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    party_type: partyType,
                    party_id: parseInt(partyId),
                    amount: numAmount,
                    payment_method: paymentMethod,
                    payment_date: paymentDate || getTodayString(),
                    reference_no: referenceNo.trim(),
                    notes: notes.trim()
                })
            });

            const data = await res.json();
            if (res.ok) {
                setAddModalOpen(false);
                setAmount('');
                setReferenceNo('');
                setNotes('');

                // Refresh balances and payments
                fetchPayments();
                fetchCustomers();
                fetchSuppliers();

                showAlert(
                    'Voucher Recorded',
                    `Successfully recorded ${partyType === 'customer' ? 'Customer Receipt' : 'Supplier Payment'} of Rs. ${numAmount.toLocaleString()} via ${paymentMethod.toUpperCase()}.`,
                    'success'
                );
            } else {
                showAlert('Error', data.error || 'Failed to record payment voucher', 'error');
            }
        } catch (err) {
            showAlert('Network Error', err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Direct Print Helper for Vouchers
    const handlePrintVoucher = (voucher, format = 'thermal') => {
        const shopName = settings?.shop_name || 'Hilal Wholesaler Shop';
        const shopAddress = settings?.shop_address || 'Main Bazar, Timergara';
        const shopPhone = settings?.shop_phone || '0300-1234567';
        const isCustomer = voucher.party_type === 'customer';
        const title = isCustomer ? 'CASH RECEIPT VOUCHER' : 'PAYMENT DISBURSEMENT VOUCHER';
        const amt = parseFloat(voucher.amount || 0);
        const amtWords = numberToWords(amt);
        const dateStr = voucher.payment_date || (voucher.created_at ? voucher.created_at.split(' ')[0] : getTodayString());
        const timeStr = voucher.created_at ? voucher.created_at.split(' ')[1] || '' : '';
        const voucherNo = voucher.reference_no || `VCH-${String(voucher.id).padStart(5, '0')}`;

        if (format === 'thermal') {
            const thermalHtml = `
                <div style="font-family: Arial, monospace; font-size: 11px; color: #000; width: 72mm; margin: 0 auto; line-height: 1.35; padding: 2mm;">
                    <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                        <h2 style="font-size: 14px; font-weight: 900; margin: 0; text-transform: uppercase;">${shopName}</h2>
                        <div style="font-size: 9px; margin-top: 2px;">${shopAddress}</div>
                        <div style="font-size: 9px; font-weight: bold;">Phone: ${shopPhone}</div>
                        <div style="display: inline-block; background: #000; color: #fff; font-size: 9.5px; font-weight: 900; padding: 2px 6px; margin-top: 5px; border-radius: 3px;">
                            ${title}
                        </div>
                    </div>

                    <table style="width: 100%; font-size: 9.5px; border-collapse: collapse; margin-bottom: 6px;">
                        <tr><td style="color: #444; width: 40%;">Voucher No:</td><td style="font-weight: bold; text-align: right;">${voucherNo}</td></tr>
                        <tr><td style="color: #444;">Date & Time:</td><td style="text-align: right;">${dateStr} ${timeStr}</td></tr>
                        <tr><td style="color: #444;">Cashier:</td><td style="text-align: right;">${voucher.cashier_name || 'Counter'}</td></tr>
                        <tr><td style="color: #444;">Party Type:</td><td style="font-weight: bold; text-align: right; text-transform: uppercase;">${voucher.party_type}</td></tr>
                    </table>

                    <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 6px;">
                        <div style="font-size: 9px; color: #555; text-transform: uppercase;">Party Details:</div>
                        <div style="font-size: 12px; font-weight: 900;">${voucher.party_name || 'N/A'}</div>
                        ${voucher.party_business ? `<div style="font-size: 10px; font-weight: bold; color: #333;">${voucher.party_business}</div>` : ''}
                        ${voucher.party_phone ? `<div style="font-size: 9.5px;">Ph: ${voucher.party_phone}</div>` : ''}
                    </div>

                    <div style="background: #f4f4f4; border: 1px solid #000; padding: 8px; text-align: center; margin-bottom: 8px;">
                        <div style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #333;">
                            ${isCustomer ? 'Total Amount Received' : 'Total Amount Paid'}
                        </div>
                        <div style="font-size: 18px; font-weight: 900; margin: 3px 0;">
                            Rs. ${amt.toLocaleString()}
                        </div>
                        <div style="font-size: 8.5px; font-style: italic; color: #444;">
                            (${amtWords})
                        </div>
                    </div>

                    <table style="width: 100%; font-size: 9px; border-collapse: collapse; margin-bottom: 8px;">
                        <tr><td style="color: #555;">Payment Channel:</td><td style="font-weight: bold; text-align: right; text-transform: uppercase;">${voucher.payment_method || 'CASH'}</td></tr>
                        ${voucher.reference_no ? `<tr><td style="color: #555;">Ref / TRX #:</td><td style="font-weight: bold; text-align: right;">${voucher.reference_no}</td></tr>` : ''}
                        ${voucher.notes ? `<tr><td style="color: #555; vertical-align: top;">Notes:</td><td style="text-align: right;">${voucher.notes}</td></tr>` : ''}
                    </table>

                    <div style="margin-top: 24px; display: flex; justify-content: space-between; font-size: 8.5px; border-top: 1px solid #aaa; padding-top: 4px;">
                        <span>Cashier / Authorized</span>
                        <span>Customer / Receiver</span>
                    </div>

                    <div style="text-align: center; font-size: 8px; color: #666; margin-top: 10px;">
                        System Generated Payment Voucher • Hilal Wholesaler
                    </div>
                </div>
            `;
            triggerPrintHtml(thermalHtml, { format: 'thermal' });
        } else {
            // Standard A4 Voucher format
            const a4Html = `
                <div style="font-family: Arial, sans-serif; font-size: 13px; color: #000; max-width: 200mm; margin: 0 auto; padding: 15mm; border: 2px solid #0B3B7B; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0B3B7B; padding-bottom: 12px; margin-bottom: 16px;">
                        <div>
                            <h1 style="font-size: 24px; font-weight: 900; color: #111; margin: 0; text-transform: uppercase;">${shopName}</h1>
                            <div style="font-size: 11px; color: #555; margin-top: 3px;">${shopAddress}</div>
                            <div style="font-size: 11px; font-weight: bold; color: #333;">Phone: ${shopPhone}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="display: inline-block; background: #0B3B7B; color: #fff; font-size: 12px; font-weight: 900; padding: 4px 12px; border-radius: 4px; text-transform: uppercase;">
                                ${title}
                            </div>
                            <div style="font-size: 12px; font-weight: bold; margin-top: 6px;">Voucher #: <span style="font-family: monospace;">${voucherNo}</span></div>
                            <div style="font-size: 11px; color: #555;">Date: ${dateStr}</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
                        <div>
                            <div style="font-size: 10px; font-weight: bold; color: #0B3B7B; text-transform: uppercase;">Party Details</div>
                            <div style="font-size: 15px; font-weight: 900; margin-top: 2px;">${voucher.party_name || 'N/A'}</div>
                            ${voucher.party_business ? `<div style="font-size: 12px; font-weight: 600; color: #444;">${voucher.party_business}</div>` : ''}
                            ${voucher.party_phone ? `<div style="font-size: 11px; color: #555;">Contact: ${voucher.party_phone}</div>` : ''}
                        </div>
                        <div>
                            <div style="font-size: 10px; font-weight: bold; color: #0B3B7B; text-transform: uppercase;">Payment Summary</div>
                            <div style="font-size: 12px; margin-top: 2px;">Method: <strong style="text-transform: uppercase;">${voucher.payment_method || 'Cash'}</strong></div>
                            ${voucher.reference_no ? `<div style="font-size: 12px;">Reference: <strong>${voucher.reference_no}</strong></div>` : ''}
                            <div style="font-size: 11px; color: #666;">Cashier: ${voucher.cashier_name || 'Counter'}</div>
                        </div>
                    </div>

                    <div style="background: #fff; border: 2px solid #222; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 24px;">
                        <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #555;">
                            ${isCustomer ? 'Net Cash Received' : 'Net Payment Disbursed'}
                        </div>
                        <div style="font-size: 32px; font-weight: 900; color: #047857; margin: 6px 0; font-family: monospace;">
                            Rs. ${amt.toLocaleString()}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: #444; font-style: italic;">
                            Amount in Words: ${amtWords}
                        </div>
                    </div>

                    ${voucher.notes ? `
                        <div style="border-left: 3px solid #0B3B7B; padding-left: 10px; margin-bottom: 24px;">
                            <div style="font-size: 10px; font-weight: bold; color: #666; text-transform: uppercase;">Notes & Description</div>
                            <div style="font-size: 12px; color: #222; margin-top: 2px;">${voucher.notes}</div>
                        </div>
                    ` : ''}

                    <div style="margin-top: 60px; display: flex; justify-content: space-between; padding: 0 20px;">
                        <div style="text-align: center; width: 180px; border-top: 1px solid #000; padding-top: 6px;">
                            <div style="font-size: 11px; font-weight: bold;">Cashier Signature</div>
                        </div>
                        <div style="text-align: center; width: 180px; border-top: 1px solid #000; padding-top: 6px;">
                            <div style="font-size: 11px; font-weight: bold;">Party Signature</div>
                        </div>
                    </div>
                </div>
            `;
            triggerPrintHtml(a4Html, { format: 'a4' });
        }
    };

    // WhatsApp Message Generator
    const handleSendWhatsApp = (voucher) => {
        const phone = (voucher.party_phone || '').replace(/[^0-9]/g, '');
        if (!phone) {
            return showAlert('Missing Phone', 'No contact phone number found for this party.', 'warning');
        }

        const isCustomer = voucher.party_type === 'customer';
        const shopName = settings?.shop_name || 'Hilal Wholesaler Shop';
        const msg = isCustomer
            ? `Dear ${voucher.party_name || 'Customer'},\nWe have received your payment of Rs. ${Number(voucher.amount).toLocaleString()} via ${(voucher.payment_method || 'CASH').toUpperCase()} on ${voucher.payment_date || 'today'}.\nReference: ${voucher.reference_no || 'Direct Receipt'}.\nThank you for your business!\n— ${shopName}`
            : `Dear ${voucher.party_name || 'Supplier'},\nPayment of Rs. ${Number(voucher.amount).toLocaleString()} has been disbursed to you via ${(voucher.payment_method || 'CASH').toUpperCase()} on ${voucher.payment_date || 'today'}.\nReference: ${voucher.reference_no || 'Direct Payment'}.\n— ${shopName}`;

        const cleanPhone = phone.startsWith('0') ? '92' + phone.slice(1) : phone;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    return (
        <div className="space-y-4 pb-12">
            {/* Custom Non-Blocking Alert Modal */}
            <CustomModalAlert
                isOpen={modalAlert.isOpen}
                onClose={() => setModalAlert({ ...modalAlert, isOpen: false })}
                type={modalAlert.type}
                title={modalAlert.title}
                message={modalAlert.message}
            />

            {/* TOP HEADER: Title & Quick Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200 shadow-2xs gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                            <IconPayments className="w-5 h-5 text-[#0B3B7B]" />
                            <span>Payment Vouchers & Cash Flow</span>
                        </h1>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        High-performance voucher ledger • Server-side paginated receipts, supplier disbursements, and bank transfers
                    </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={fetchPayments}
                        disabled={loading}
                        className="p-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
                        title="Refresh data from server"
                    >
                        <IconRefresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0B3B7B]' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>

                    <button
                        onClick={() => {
                            setPartyType('customer');
                            setPartyId(customers[0]?.id || '');
                            setAmount('');
                            setReferenceNo('');
                            setNotes('');
                            setPaymentDate(getTodayString());
                            setAddModalOpen(true);
                        }}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                        <IconPlus className="w-4 h-4 text-white" />
                        <span>Record Payment Voucher</span>
                    </button>
                </div>
            </div>

            {/* 4 EXECUTIVE KPI SUMMARY CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* KPI 1: Inflow (Customer Receipts) */}
                <div className="bg-white p-3 rounded-xl border border-emerald-100 hover:border-emerald-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Total Customer Inflow</span>
                        <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs">
                            ↓
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg font-black text-emerald-700 tracking-tight font-mono">
                            Rs. {Math.round(summary.customerAmount || 0).toLocaleString()}
                        </div>
                        <div className="text-[9.5px] text-gray-400 font-medium mt-0.5">
                            {summary.customerCount || 0} customer vouchers collected
                        </div>
                    </div>
                </div>

                {/* KPI 2: Outflow (Supplier Payments) */}
                <div className="bg-white p-3 rounded-xl border border-rose-100 hover:border-rose-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Total Supplier Outflow</span>
                        <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 font-bold text-xs">
                            ↑
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg font-black text-rose-700 tracking-tight font-mono">
                            Rs. {Math.round(summary.supplierAmount || 0).toLocaleString()}
                        </div>
                        <div className="text-[9.5px] text-gray-400 font-medium mt-0.5">
                            {summary.supplierCount || 0} supplier vouchers paid
                        </div>
                    </div>
                </div>

                {/* KPI 3: Net Cash Movement */}
                <div className="bg-white p-3 rounded-xl border border-blue-100 hover:border-blue-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Net Flow (In - Out)</span>
                        <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                            <IconCashRegister className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className={`text-base sm:text-lg font-black tracking-tight font-mono ${summary.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {summary.netCashFlow >= 0 ? '+' : ''}Rs. {Math.round(summary.netCashFlow || 0).toLocaleString()}
                        </div>
                        <div className="text-[9.5px] text-gray-400 font-medium mt-0.5">
                            {summary.netCashFlow >= 0 ? 'Net Cash Surplus' : 'Net Cash Deficit'}
                        </div>
                    </div>
                </div>

                {/* KPI 4: Channel Breakdown */}
                <div className="bg-white p-3 rounded-xl border border-blue-100 hover:border-blue-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Channel Breakdown</span>
                        <div className="w-6 h-6 rounded-md bg-blue-50 text-[#0B3B7B] flex items-center justify-center shrink-0">
                            <IconBank className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div className="mt-1 space-y-0.5 text-[10px]">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Cash:</span>
                            <span className="font-bold text-gray-800 font-mono">Rs. {Math.round(summary.cashAmount || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Bank / Wallets:</span>
                            <span className="font-bold text-gray-800 font-mono">Rs. {Math.round((summary.bankAmount || 0) + (summary.onlineAmount || 0)).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ADVANCED FILTER & SEARCH CONTROLS */}
            <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs space-y-2.5">
                {/* Row 1: Party Type Tabs & Search */}
                <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
                    {/* Party Type Segmented Filter */}
                    <div className="flex items-center p-1 bg-gray-100 rounded-xl gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleFilterChange(setPartyTypeFilter, 'ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${partyTypeFilter === 'ALL'
                                ? 'bg-white text-gray-900 shadow-xs'
                                : 'text-gray-500 hover:text-gray-900'
                                }`}
                        >
                            All Vouchers ({totalServerPayments})
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFilterChange(setPartyTypeFilter, 'customer')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${partyTypeFilter === 'customer'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                        >
                            <span>Customer Inflows</span>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">{summary.customerCount || 0}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFilterChange(setPartyTypeFilter, 'supplier')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${partyTypeFilter === 'supplier'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-rose-700 hover:bg-rose-50'
                                }`}
                        >
                            <span>Supplier Outflows</span>
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">{summary.supplierCount || 0}</span>
                        </button>
                    </div>

                    {/* Search Input Bar */}
                    <div className="relative flex-1 max-w-md">
                        <input
                            type="text"
                            placeholder="Search Voucher #, Party Name, Phone, TRX ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#0B3B7B] focus:ring-1 focus:ring-[#0B3B7B]/20 bg-gray-50/50 focus:bg-white transition-all shadow-2xs"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                            <IconSearch className="w-3.5 h-3.5" />
                        </span>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                            >
                                <IconClose className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Row 2: Date Filters & Payment Method Filter */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    {/* Date Filter Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                        {[
                            { id: 'all', label: 'All Time' },
                            { id: 'today', label: 'Today' },
                            { id: 'yesterday', label: 'Yesterday' },
                            { id: 'this_week', label: 'Last 7 Days' },
                            { id: 'this_month', label: 'This Month' },
                            { id: 'custom', label: 'Custom Range' }
                        ].map(df => (
                            <button
                                key={df.id}
                                type="button"
                                onClick={() => handleFilterChange(setDateFilter, df.id)}
                                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer whitespace-nowrap ${dateFilter === df.id
                                    ? 'bg-[#0B3B7B] text-white shadow-2xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {df.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Range Inputs (Visible when Custom is selected) */}
                    {dateFilter === 'custom' && (
                        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 p-1 rounded-xl">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => {
                                    setCustomStartDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-gray-200 rounded-md focus:outline-none"
                            />
                            <span className="text-[10px] text-gray-400 font-bold">to</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => {
                                    setCustomEndDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-gray-200 rounded-md focus:outline-none"
                            />
                        </div>
                    )}

                    {/* Payment Method Dropdown Filter */}
                    <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">Method:</span>
                        <select
                            value={paymentMethodFilter}
                            onChange={(e) => handleFilterChange(setPaymentMethodFilter, e.target.value)}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:border-[#0B3B7B] cursor-pointer"
                        >
                            <option value="ALL">All Methods</option>
                            <option value="cash">Cash Only</option>
                            <option value="bank">Bank Transfer</option>
                            <option value="easypaisa">Easypaisa</option>
                            <option value="jazzcash">JazzCash</option>
                            <option value="cheque">Cheque</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* DATA TABLE (Server-Side Paginated) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[9.5px]">
                                <th className="p-3">Voucher # / Date</th>
                                <th className="p-3">Party Type</th>
                                <th className="p-3">Party Name & Business</th>
                                <th className="p-3 text-right">Amount (PKR)</th>
                                <th className="p-3">Channel / Method</th>
                                <th className="p-3">Reference / TRX No</th>
                                <th className="p-3">Notes</th>
                                <th className="p-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <IconSpinner className="w-6 h-6 animate-spin text-[#0B3B7B]" />
                                            <span className="text-xs font-semibold">Loading vouchers from server...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : payments.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <IconPayments className="w-10 h-10 text-gray-300" />
                                            <div className="font-bold text-gray-700 text-sm">No Payment Vouchers Found</div>
                                            <p className="text-xs text-gray-400 max-w-sm">
                                                No transactions match your current search and date filters. Try clearing filters or record a new voucher.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                payments.map((p) => {
                                    const isCustomer = p.party_type === 'customer';
                                    const voucherNo = p.reference_no && p.reference_no.startsWith('INV-')
                                        ? p.reference_no
                                        : `VCH-${String(p.id).padStart(5, '0')}`;
                                    const dateStr = p.payment_date || (p.created_at ? p.created_at.split(' ')[0] : '-');
                                    const timeStr = p.created_at ? p.created_at.split(' ')[1] : '';

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                            {/* Voucher # & Date */}
                                            <td className="p-3">
                                                <div className="font-mono font-bold text-gray-900 text-[11px]">
                                                    {voucherNo}
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-0.5">
                                                    {dateStr} {timeStr && <span className="text-gray-400">({timeStr})</span>}
                                                </div>
                                                {p.cashier_name && (
                                                    <div className="text-[9px] text-gray-400 font-medium">
                                                        By: {p.cashier_name}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Party Type Badge */}
                                            <td className="p-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-black uppercase tracking-wider ${isCustomer
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                                    }`}>
                                                    <span>{isCustomer ? '↓ Inflow' : '↑ Outflow'}</span>
                                                    <span>•</span>
                                                    <span>{p.party_type}</span>
                                                </span>
                                            </td>

                                            {/* Party Name & Business */}
                                            <td className="p-3">
                                                <div className="font-bold text-gray-900 text-xs">
                                                    {p.party_name || `Party #${p.party_id}`}
                                                </div>
                                                {p.party_business && (
                                                    <div className="text-[10.5px] font-medium text-gray-500">
                                                        {p.party_business}
                                                    </div>
                                                )}
                                                {p.party_phone && (
                                                    <div className="text-[9.5px] text-gray-400 font-mono">
                                                        Ph: {p.party_phone}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Amount with Inflow / Outflow sign */}
                                            <td className="p-3 text-right">
                                                <div className={`font-black font-mono text-xs sm:text-sm ${isCustomer ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    {isCustomer ? '+' : '-'} Rs. {Number(p.amount || 0).toLocaleString()}
                                                </div>
                                                <div className="text-[8.5px] text-gray-400 italic">
                                                    {numberToWords(p.amount)}
                                                </div>
                                            </td>

                                            {/* Channel / Method */}
                                            <td className="p-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 text-[#0B3B7B] border border-blue-200">
                                                    <IconBank className="w-3 h-3 text-[#0B3B7B]" />
                                                    <span>{p.payment_method || 'cash'}</span>
                                                </span>
                                            </td>

                                            {/* Reference / TRX No */}
                                            <td className="p-3">
                                                <span className="font-mono text-gray-700 text-[11px] font-semibold">
                                                    {p.reference_no || '—'}
                                                </span>
                                            </td>

                                            {/* Notes */}
                                            <td className="p-3 max-w-xs">
                                                <span className="text-gray-500 text-[11px] font-medium truncate block" title={p.notes}>
                                                    {p.notes || '—'}
                                                </span>
                                            </td>

                                            {/* Action Buttons */}
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedVoucher(p);
                                                            setVoucherModalOpen(true);
                                                        }}
                                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0B3B7B] border border-blue-200 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                        title="Open Receipt Voucher Preview & Print"
                                                    >
                                                        <IconPrinter className="w-3.5 h-3.5" />
                                                        <span>Receipt</span>
                                                    </button>
                                                    {p.party_phone && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendWhatsApp(p)}
                                                            className="p-1.5 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-600 text-gray-600 rounded-lg border border-gray-200 transition-all cursor-pointer shadow-2xs"
                                                            title="Send WhatsApp Payment Voucher"
                                                        >
                                                            <IconWhatsApp className="w-3.5 h-3.5 text-emerald-600" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* SERVER-SIDE PAGINATION BAR */}
                <div className="p-3 bg-gray-50/70 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    {/* Left: Summary Count */}
                    <div className="text-gray-500 font-medium">
                        Showing <span className="font-bold text-gray-800">{totalServerPayments === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
                        <span className="font-bold text-gray-800">{Math.min(currentPage * pageSize, totalServerPayments)}</span> of{' '}
                        <span className="font-bold text-gray-800">{totalServerPayments.toLocaleString()}</span> vouchers
                    </div>

                    {/* Middle: Page Size Selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-[11px] font-bold">Rows:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(parseInt(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="px-2 py-1 rounded-lg border border-gray-300 bg-white font-bold text-xs focus:outline-none focus:border-[#0B3B7B] cursor-pointer"
                        >
                            <option value={10}>10 / page</option>
                            <option value={25}>25 / page</option>
                            <option value={50}>50 / page</option>
                            <option value={100}>100 / page</option>
                        </select>
                    </div>

                    {/* Right: Page Navigation Buttons */}
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage <= 1 || loading}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                            title="First Page"
                        >
                            <IconChevronDoubleLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1 || loading}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                            title="Previous Page"
                        >
                            <IconChevronLeft className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1 px-1">
                            {getPageNumbers(currentPage, totalServerPages).map((pageNum, idx) => {
                                if (pageNum === '...') {
                                    return (
                                        <span key={`dots-${idx}`} className="px-1 text-gray-400 font-bold">
                                            ...
                                        </span>
                                    );
                                }
                                const isCurrent = pageNum === currentPage;
                                return (
                                    <button
                                        key={`page-${pageNum}`}
                                        type="button"
                                        onClick={() => setCurrentPage(pageNum)}
                                        disabled={loading}
                                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${isCurrent
                                            ? 'bg-[#0B3B7B] text-white shadow-2xs font-black'
                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalServerPages, p + 1))}
                            disabled={currentPage >= totalServerPages || loading}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                            title="Next Page"
                        >
                            <IconChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(totalServerPages)}
                            disabled={currentPage >= totalServerPages || loading}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                            title="Last Page"
                        >
                            <IconChevronDoubleRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ADD PAYMENT MODAL */}
            {addModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleSavePayment} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
                        {/* Header */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <IconPayments className="w-5 h-5 text-[#0B3B7B]" />
                                <h3 className="font-extrabold text-gray-900 text-base">Record Payment Voucher</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAddModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Party Type Segmented Control */}
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Transaction Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPartyType('customer');
                                        setPartyId(customers[0]?.id || '');
                                    }}
                                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${partyType === 'customer'
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                        }`}
                                >
                                    <span>↓ Customer Receipt (Wasooli)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPartyType('supplier');
                                        setPartyId(suppliers[0]?.id || '');
                                    }}
                                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${partyType === 'supplier'
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                        }`}
                                >
                                    <span>↑ Supplier Payment Paid</span>
                                </button>
                            </div>
                        </div>

                        {/* Select Party */}
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Select {partyType === 'customer' ? 'Customer' : 'Supplier'}
                            </label>
                            <select
                                value={partyId}
                                onChange={(e) => setPartyId(e.target.value)}
                                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:outline-none focus:border-[#0B3B7B] cursor-pointer"
                                required
                            >
                                {partyType === 'customer' ? (
                                    customers.map((c, idx) => (
                                        <option key={`pay-cust-${c.id ?? idx}-${idx}`} value={c.id}>
                                            {c.name} {c.business_name ? `(${c.business_name})` : ''} — Due: Rs. {Number(c.balance || 0).toLocaleString()}
                                        </option>
                                    ))
                                ) : (
                                    suppliers.map((s, idx) => (
                                        <option key={`pay-supp-${s.id ?? idx}-${idx}`} value={s.id}>
                                            {s.name} {s.company_name ? `(${s.company_name})` : ''} — Payable: Rs. {Number(s.balance || 0).toLocaleString()}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Live Balance Card */}
                        {selectedParty && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs shadow-2xs">
                                <div>
                                    <div className="text-[10px] font-bold text-[#0B3B7B] uppercase">Current Balance</div>
                                    <div className="text-sm font-black font-mono text-gray-900 mt-0.5">
                                        Rs. {currentBalance.toLocaleString()}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase">After This Payment</div>
                                    <div className={`text-sm font-black font-mono mt-0.5 ${newBalancePreview <= 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                                        Rs. {newBalancePreview.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Amount & Method Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Amount (PKR)</label>
                                    {currentBalance > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(String(currentBalance))}
                                            className="text-[9.5px] font-bold text-[#0B3B7B] hover:underline cursor-pointer"
                                        >
                                            Pay Full
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    step="any"
                                    placeholder="Enter amount in Rs."
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-xl font-black text-sm text-emerald-700 focus:outline-none focus:border-[#0B3B7B]"
                                    autoFocus
                                />
                                {amount && (
                                    <div className="text-[9.5px] text-gray-500 mt-1 italic truncate">
                                        {numberToWords(amount)}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Payment Method</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-xs bg-white focus:outline-none focus:border-[#0B3B7B] cursor-pointer"
                                >
                                    <option value="cash">Cash in Hand</option>
                                    <option value="bank">Bank Transfer</option>
                                    <option value="easypaisa">Easypaisa</option>
                                    <option value="jazzcash">JazzCash</option>
                                    <option value="cheque">Cheque</option>
                                </select>
                            </div>
                        </div>

                        {/* Date & Reference */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Payment Date</label>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-xl font-semibold text-xs bg-white focus:outline-none focus:border-[#0B3B7B]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Reference / TRX ID</label>
                                <input
                                    type="text"
                                    placeholder="Cheque # / Bank Slip / TRX ID"
                                    value={referenceNo}
                                    onChange={(e) => setReferenceNo(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-xl font-semibold text-xs focus:outline-none focus:border-[#0B3B7B]"
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Remarks / Notes</label>
                            <input
                                type="text"
                                placeholder="Optional description or invoice references..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-xl font-medium text-xs focus:outline-none focus:border-[#0B3B7B]"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2.5 pt-3 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setAddModalOpen(false)}
                                className="flex-1 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-bold text-xs transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <IconSpinner className="w-4 h-4 animate-spin text-white" />
                                        <span>Saving Voucher...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconCheck className="w-4 h-4 text-white" />
                                        <span>Save Payment Voucher</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* VOUCHER RECEIPT PREVIEW & PRINT MODAL */}
            {voucherModalOpen && selectedVoucher && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/70 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0B3B7B] flex items-center justify-center">
                                    <IconPrinter className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-gray-900 text-sm">Payment Voucher Receipt</h3>
                                    <div className="text-[10px] text-gray-500 font-mono">
                                        {selectedVoucher.reference_no && selectedVoucher.reference_no.startsWith('INV-')
                                            ? selectedVoucher.reference_no
                                            : `VCH-${String(selectedVoucher.id).padStart(5, '0')}`}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setVoucherModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body: Voucher Paper Preview */}
                        <div className="p-5 overflow-y-auto space-y-4">
                            <div className="bg-slate-50/50 border-2 border-gray-200 rounded-xl p-4 shadow-xs space-y-3 font-sans">
                                {/* Shop Title */}
                                <div className="text-center border-b border-gray-200 pb-3">
                                    <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                        {settings?.shop_name || 'Hilal Wholesaler Shop'}
                                    </h2>
                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                        {settings?.shop_address || 'Main Bazar, Timergara'}
                                    </div>
                                    <div className="text-[11px] font-bold text-gray-700 mt-0.5">
                                        Phone: {settings?.shop_phone || '0300-1234567'}
                                    </div>
                                    <div className="mt-2 inline-block px-3 py-1 bg-[#0B3B7B] text-white rounded-md text-[10px] font-black uppercase tracking-wider">
                                        {selectedVoucher.party_type === 'customer' ? 'Cash Receipt Voucher (Wasooli)' : 'Payment Disbursement Voucher'}
                                    </div>
                                </div>

                                {/* Voucher Info Row */}
                                <div className="grid grid-cols-2 gap-2 text-xs py-1 text-gray-700">
                                    <div>
                                        <span className="text-gray-400 text-[10px] uppercase font-bold block">Voucher ID</span>
                                        <span className="font-mono font-bold text-gray-900">
                                            {selectedVoucher.reference_no && selectedVoucher.reference_no.startsWith('INV-')
                                                ? selectedVoucher.reference_no
                                                : `VCH-${String(selectedVoucher.id).padStart(5, '0')}`}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-gray-400 text-[10px] uppercase font-bold block">Date & Time</span>
                                        <span className="font-semibold text-gray-900">
                                            {selectedVoucher.payment_date || (selectedVoucher.created_at ? selectedVoucher.created_at.split(' ')[0] : '-')}
                                            {selectedVoucher.created_at && selectedVoucher.created_at.split(' ')[1] && (
                                                <span className="text-gray-400 ml-1 text-[10px]">({selectedVoucher.created_at.split(' ')[1]})</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Party Box */}
                                <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                                    <div className="text-[10px] uppercase font-bold text-[#0B3B7B]">
                                        Party Information ({selectedVoucher.party_type})
                                    </div>
                                    <div className="text-sm font-black text-gray-900">
                                        {selectedVoucher.party_name || `Party #${selectedVoucher.party_id}`}
                                    </div>
                                    {selectedVoucher.party_business && (
                                        <div className="text-xs font-semibold text-gray-600">
                                            Business: {selectedVoucher.party_business}
                                        </div>
                                    )}
                                    {selectedVoucher.party_phone && (
                                        <div className="text-xs font-mono text-gray-500">
                                            Contact: {selectedVoucher.party_phone}
                                        </div>
                                    )}
                                </div>

                                {/* Amount Display Card */}
                                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 text-center">
                                    <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                                        {selectedVoucher.party_type === 'customer' ? 'Total Amount Received' : 'Total Amount Paid'}
                                    </div>
                                    <div className="text-2xl font-black font-mono text-emerald-700 my-1">
                                        Rs. {Number(selectedVoucher.amount || 0).toLocaleString()}
                                    </div>
                                    <div className="text-[10.5px] font-semibold text-emerald-900 italic">
                                        {numberToWords(selectedVoucher.amount)}
                                    </div>
                                </div>

                                {/* Channel & Details Table */}
                                <div className="text-xs space-y-1.5 pt-1 text-gray-700">
                                    <div className="flex justify-between border-b border-gray-100 pb-1">
                                        <span className="text-gray-500 font-medium">Payment Channel:</span>
                                        <span className="font-bold uppercase font-mono text-gray-900">{selectedVoucher.payment_method || 'CASH'}</span>
                                    </div>
                                    {selectedVoucher.reference_no && (
                                        <div className="flex justify-between border-b border-gray-100 pb-1">
                                            <span className="text-gray-500 font-medium">Reference / TRX #:</span>
                                            <span className="font-mono font-bold text-gray-900">{selectedVoucher.reference_no}</span>
                                        </div>
                                    )}
                                    {selectedVoucher.cashier_name && (
                                        <div className="flex justify-between border-b border-gray-100 pb-1">
                                            <span className="text-gray-500 font-medium">Recorded By:</span>
                                            <span className="font-semibold text-gray-800">{selectedVoucher.cashier_name}</span>
                                        </div>
                                    )}
                                    {selectedVoucher.notes && (
                                        <div className="pt-1">
                                            <span className="text-gray-500 font-medium block text-[11px]">Notes / Description:</span>
                                            <p className="text-gray-800 bg-white p-2 rounded-lg border border-gray-200 text-xs mt-0.5 font-medium">
                                                {selectedVoucher.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Signatures Placeholder */}
                                <div className="pt-6 grid grid-cols-2 gap-4 text-center text-[10px] text-gray-500">
                                    <div className="border-t border-gray-300 pt-1">
                                        Cashier Signature
                                    </div>
                                    <div className="border-t border-gray-300 pt-1">
                                        Party Signature
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="p-3.5 bg-gray-50/90 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setVoucherModalOpen(false)}
                                className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                            >
                                Close
                            </button>

                            <div className="flex items-center gap-2">
                                {selectedVoucher.party_phone && (
                                    <button
                                        type="button"
                                        onClick={() => handleSendWhatsApp(selectedVoucher)}
                                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                        title="Send receipt acknowledgment via WhatsApp"
                                    >
                                        <IconWhatsApp className="w-4 h-4 text-emerald-600" />
                                        <span>WhatsApp</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => handlePrintVoucher(selectedVoucher, 'a4')}
                                    className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    title="Print Full Page A4 Voucher"
                                >
                                    <span>📄 Print A4</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handlePrintVoucher(selectedVoucher, 'thermal')}
                                    className="px-4 py-2 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow-md"
                                    title="Print Thermal 80mm Receipt"
                                >
                                    <IconPrinter className="w-4 h-4 text-white" />
                                    <span>Print Thermal (80mm)</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
