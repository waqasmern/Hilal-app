'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { loadSaleForEdit, setSettings } from '../../store';
import {
    IconSales,
    IconCashRegister,
    IconPayments,
    IconWarning,
    IconReceipt,
    IconCalendar,
    IconSearch,
    IconPrinter,
    IconReturn,
    IconClose,
    IconCheck,
    IconRefresh,
    IconPlus,
    IconPOS,
    IconDownload,
    IconSpinner,
    IconDotsVertical,
    IconEdit,
    IconWhatsApp,
    IconBank,
    IconShield,
    IconEye,
    IconChevronLeft,
    IconChevronRight,
    IconChevronDoubleLeft,
    IconChevronDoubleRight
} from '../components/Icons';
import CustomModalAlert from '../components/CustomModalAlert';
import ThermalReceipt from '../components/ThermalReceipt';
import WholesaleA4InvoiceModal from '../components/WholesaleA4InvoiceModal';
import CreditNoteModal from '../components/CreditNoteModal';
import { triggerPrintHtml, generateThermalReceiptHtml, generateThermalReturnReceiptHtml, generateWholesaleInvoiceA4Html, truncateItemName, formatPackShort, downloadAndOpenPdf } from '../../lib/printHelper';
import { apiUrl } from '../../lib/api';

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

export default function SalesHistoryPage() {
    const router = useRouter();
    const dispatch = useDispatch();
    const settings = useSelector(state => state.settings);
    const [sales, setSales] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSale, setSelectedSale] = useState(null);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [thermalModalOpen, setThermalModalOpen] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [waSending, setWaSending] = useState(false);

    // Filters State
    const [dateFilter, setDateFilter] = useState('today'); // default select 'today'
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PAID' | 'PENDING' | 'PARTIAL'
    const [searchQuery, setSearchQuery] = useState('');

    // Server-Side Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalServerSales, setTotalServerSales] = useState(0);
    const [totalServerPages, setTotalServerPages] = useState(1);
    const [serverSummary, setServerSummary] = useState(null);
    const [tableLoading, setTableLoading] = useState(false);

    // Feed Type Filter & Wasooli Recovery / Returns State
    const [feedType, setFeedType] = useState('ALL'); // 'ALL' | 'INVOICES' | 'WASOOLI' | 'RETURNS'
    const [serverRecoveredPayments, setServerRecoveredPayments] = useState([]);
    const [serverReturns, setServerReturns] = useState([]);
    const [selectedWasooli, setSelectedWasooli] = useState(null);
    const [wasooliModalOpen, setWasooliModalOpen] = useState(false);

    // Sales Return Modal State (Supports both Walk-in No-Invoice Return & Invoice-linked Return)
    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [returnMode, setReturnMode] = useState('walkin'); // 'walkin' | 'invoice'
    const [returnType, setReturnType] = useState('saleable'); // 'saleable' | 'damaged'
    const [refundMethod, setRefundMethod] = useState('cash'); // 'cash' (Drawer) | 'credit' (Khata)
    const [returnItems, setReturnItems] = useState([]);
    const [refundAmount, setRefundAmount] = useState(0);
    const [returnCatalogProducts, setReturnCatalogProducts] = useState([]);
    const [returnProductSearch, setReturnProductSearch] = useState('');
    const [returnRemarks, setReturnRemarks] = useState('');
    const [autoPrintReturnThermal, setAutoPrintReturnThermal] = useState(true);

    // Credit Note Modal State (Official A4 PDF, WhatsApp & Print)
    const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
    const [activeCreditNoteReturnId, setActiveCreditNoteReturnId] = useState(null);

    // Custom Modal Alert State
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: ''
    });

    const printRef = useRef(null);
    const { user } = useSelector(state => state.auth);

    // 3-Dots Action Menu & Admin Edit Sale State
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [adminAuthModalOpen, setAdminAuthModalOpen] = useState(false);
    const [adminAuthPin, setAdminAuthPin] = useState('');
    const [pendingEditSale, setPendingEditSale] = useState(null);

    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const showAlert = (title, message, type = 'info') => {
        setModalAlert({ isOpen: true, title, message, type });
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchSales(), fetchPayments(), fetchGlobalSettings()]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGlobalSettings = async () => {
        try {
            const res = await fetch(apiUrl('/api/settings'));
            if (res.ok) {
                const data = await res.json();
                dispatch(setSettings(data));
            }
        } catch (err) { }
    };

    const fetchSales = async (
        page = currentPage,
        limit = pageSize,
        dateF = dateFilter,
        startD = customStartDate,
        endD = customEndDate,
        statusF = statusFilter,
        searchQ = searchQuery
    ) => {
        try {
            setTableLoading(true);
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                dateFilter: dateF,
                status: statusF,
                paginate: 'true'
            });
            if (dateF === 'custom') {
                if (startD) params.append('startDate', startD);
                if (endD) params.append('endDate', endD);
            }
            if (searchQ && searchQ.trim()) {
                params.append('search', searchQ.trim());
            }

            const res = await fetch(apiUrl(`/api/sales?${params.toString()}`));
            if (res.ok) {
                const result = await res.json();
                if (result && result.pagination) {
                    setSales(result.data || result.sales || []);
                    if (result.recoveredPayments) {
                        setServerRecoveredPayments(result.recoveredPayments);
                    }
                    if (result.returnsList) {
                        setServerReturns(result.returnsList);
                    }
                    setTotalServerSales(result.pagination.total);
                    setTotalServerPages(result.pagination.totalPages);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (result && (result.data || result.sales)) {
                    setSales(result.data || result.sales || []);
                    if (result.recoveredPayments) {
                        setServerRecoveredPayments(result.recoveredPayments);
                    }
                    if (result.returnsList) {
                        setServerReturns(result.returnsList);
                    }
                    setTotalServerSales(result.total ?? result.pagination?.total ?? 0);
                    setTotalServerPages(result.totalPages ?? result.pagination?.totalPages ?? 1);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (Array.isArray(result)) {
                    // Graceful legacy fallback
                    const rowsInDate = result.filter(s => matchesDateFilter(s.created_at));
                    const filtered = rowsInDate.filter(s => {
                        if (statusF !== 'ALL' && getSalePaymentStatus(s) !== statusF) return false;
                        if (searchQ.trim()) {
                            const q = searchQ.toLowerCase();
                            const inv = (s.invoice_no || '').toLowerCase();
                            const cust = (s.customer_name || '').toLowerCase();
                            const biz = (s.customer_business || '').toLowerCase();
                            const phone = (s.customer_phone || '').toLowerCase();
                            const cashier = (s.cashier_name || '').toLowerCase();
                            if (!inv.includes(q) && !cust.includes(q) && !biz.includes(q) && !phone.includes(q) && !cashier.includes(q)) return false;
                        }
                        return true;
                    });
                    setTotalServerSales(filtered.length);
                    setTotalServerPages(Math.max(1, Math.ceil(filtered.length / limit)));
                    const start = (page - 1) * limit;
                    setSales(filtered.slice(start, start + limit));
                }
            }
        } catch (err) {
            console.error('Failed to load sales:', err);
        } finally {
            setTableLoading(false);
        }
    };

    // Auto-fetch with 200ms debounce on filter/page/search changes
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchSales(currentPage, pageSize, dateFilter, customStartDate, customEndDate, statusFilter, searchQuery);
        }, 200);
        return () => clearTimeout(handler);
    }, [dateFilter, customStartDate, customEndDate, statusFilter, searchQuery, currentPage, pageSize]);

    const fetchPayments = async () => {
        try {
            const res = await fetch(apiUrl('/api/payments'));
            if (res.ok) {
                const data = await res.json();
                setPayments(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to load payments:', err);
        }
    };

    // Helper to safely extract any invoice tokens from a string (e.g. "INV-1234, INV-5678")
    const extractInvoiceTokens = (refStr) => {
        if (!refStr) return [];
        const matches = String(refStr).match(/INV-[A-Za-z0-9_-]+/gi);
        return matches ? Array.from(new Set(matches)) : [];
    };

    const fetchSaleDetails = async (id, openModal = true) => {
        try {
            if (!id) {
                showAlert('Notice', 'No invoice number is linked to this payment.', 'info');
                return null;
            }
            const res = await fetch(apiUrl(`/api/sales/${encodeURIComponent(String(id).trim())}`));
            if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                    setSelectedSale(data);
                    if (openModal) setInvoiceModalOpen(true);
                    return data;
                } else {
                    showAlert('Notice', `Invoice #${id} was not found.`, 'warning');
                }
            } else {
                showAlert('Error', `Could not load invoice #${id}.`, 'error');
            }
        } catch (err) {
            showAlert('Fetch Error', 'Failed to retrieve invoice details.', 'error');
        }
        return null;
    };

    // Helper to safely parse any date string (converting cloud ISO UTC strings or preserving Pakistan local time)
    const parseDate = (dateInput) => {
        if (!dateInput) return null;
        if (dateInput instanceof Date) return dateInput;
        let s = String(dateInput).trim();
        if (!s) return null;

        // If string is ISO with 'T' but lacks timezone offset (e.g. from cloud Supabase UTC timestamps like 2026-11-01T01:55:01.111),
        // append 'Z' so it correctly converts from UTC to local device timezone (Pakistan Asia/Karachi, +5h)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
            s = s + 'Z';
        } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
            // Local time string format "YYYY-MM-DD HH:MM:SS" (e.g. from SQLite getLocalNow())
            s = s.replace(' ', 'T');
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? new Date(dateInput) : d;
    };

    // Date parser helper to local YYYY-MM-DD
    const toYMD = (dateInput) => {
        if (!dateInput) return '';
        const str = String(dateInput).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str;
        }
        const d = parseDate(dateInput);
        if (!d || isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    // Filter by Date condition
    const matchesDateFilter = (dateStr) => {
        if (!dateStr) return false;
        if (dateFilter === 'all') return true;

        const recordYMD = toYMD(dateStr);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        if (dateFilter === 'today') {
            return recordYMD === todayYMD;
        }

        if (dateFilter === 'yesterday') {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            const yesterdayYMD = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
            return recordYMD === yesterdayYMD;
        }

        if (dateFilter === 'this_week') {
            const w = new Date(now);
            w.setDate(w.getDate() - 7);
            const weekAgoYMD = `${w.getFullYear()}-${pad(w.getMonth() + 1)}-${pad(w.getDate())}`;
            return recordYMD >= weekAgoYMD && recordYMD <= todayYMD;
        }

        if (dateFilter === 'this_month') {
            const monthStartYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
            return recordYMD >= monthStartYMD && recordYMD <= todayYMD;
        }

        if (dateFilter === 'custom') {
            if (customStartDate && customEndDate) {
                return recordYMD >= customStartDate && recordYMD <= customEndDate;
            }
            if (customStartDate) return recordYMD >= customStartDate;
            if (customEndDate) return recordYMD <= customEndDate;
            return true;
        }

        return true;
    };

    // Helper to determine payment status normalized
    const getSalePaymentStatus = (s) => {
        const remaining = Number(s.remaining_balance) || 0;
        const paid = Number(s.amount_paid) || 0;
        const net = Number(s.net_amount) || 0;

        if (remaining <= 0 && net > 0) return 'PAID';
        if (paid > 0 && remaining > 0) return 'PARTIAL';
        if (remaining > 0 && paid <= 0) return 'PENDING';

        const ps = (s.payment_status || '').toLowerCase();
        if (ps === 'paid') return 'PAID';
        if (ps === 'partial') return 'PARTIAL';
        if (ps === 'unpaid' || ps === 'pending') return 'PENDING';
        return 'PAID';
    };

    // Compute end date of active filter (used to determine if an invoice was still Pending on that date and Paid Later)
    const activeFilterEndYMD = useMemo(() => {
        const now = new Date();
        if (dateFilter === 'today' || dateFilter === 'week' || dateFilter === 'month') return toYMD(now);
        if (dateFilter === 'yesterday') {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            return toYMD(y);
        }
        if (dateFilter === 'custom') return customEndDate || customStartDate || null;
        return null; // 'all'
    }, [dateFilter, customStartDate, customEndDate]);

    // Helper to determine historical Point-in-Time status and metrics on the order creation date / filtered date
    const getSaleHistoricalMetrics = (s) => {
        const net = Number(s.net_amount) || 0;
        let checkoutPaid = (s.initial_amount_paid !== undefined && s.initial_amount_paid !== null)
            ? Number(s.initial_amount_paid)
            : null;

        if (checkoutPaid === null) {
            const saleYMD = toYMD(s.created_at);
            const sameDayPay = payments.filter(p => p.party_type === 'customer' && p.reference_no === s.invoice_no && toYMD(p.payment_date || p.created_at) === saleYMD);
            if (sameDayPay.length > 0) {
                checkoutPaid = sameDayPay.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            } else if (Number(s.remaining_balance) >= net) {
                checkoutPaid = 0;
            } else {
                checkoutPaid = Number(s.amount_paid) || 0;
            }
        }

        const checkoutDue = Math.max(0, net - checkoutPaid);
        const livePaid = Number(s.amount_paid) || 0;
        const liveDue = s.remaining_balance !== undefined && s.remaining_balance !== null
            ? Number(s.remaining_balance)
            : Math.max(0, net - livePaid);
        const isSettledLater = Boolean(s.is_settled_later) || (livePaid > checkoutPaid);

        let settledAt = s.settled_later_at || s.settled_later_date || null;
        if (!settledAt && isSettledLater) {
            const saleYMD = toYMD(s.created_at);
            const laterPay = payments
                .filter(p => p.party_type === 'customer' && p.amount > 0 && (
                    p.reference_no === s.invoice_no ||
                    (s.customer_id && p.party_id === s.customer_id && !p.reference_no && (p.created_at > s.created_at || toYMD(p.payment_date || p.created_at) > saleYMD))
                ))
                .sort((a, b) => new Date(b.created_at || b.payment_date) - new Date(a.created_at || a.payment_date));
            if (laterPay.length > 0) {
                settledAt = laterPay[0].created_at || laterPay[0].payment_date;
            }
        }

        const settledYMD = settledAt ? toYMD(settledAt) : null;
        const isPaidLaterAfterRange = Boolean(
            activeFilterEndYMD && isSettledLater && (!settledYMD || settledYMD > activeFilterEndYMD)
        );

        let currentStatus = 'PENDING';
        if (liveDue <= 0.01 && (net > 0 || livePaid > 0)) {
            currentStatus = 'PAID';
        } else if (livePaid > 0 && liveDue > 0.01) {
            currentStatus = 'PARTIAL';
        } else {
            currentStatus = 'PENDING';
        }

        let historicalStatus = 'PENDING';
        if (checkoutDue <= 0.01 && net > 0) {
            historicalStatus = 'PAID';
        } else if (checkoutPaid > 0 && checkoutDue > 0.01) {
            historicalStatus = 'PARTIAL';
        } else {
            historicalStatus = 'PENDING';
        }

        const displayStatus = isPaidLaterAfterRange ? historicalStatus : currentStatus;
        const displayPaid = isPaidLaterAfterRange ? checkoutPaid : livePaid;
        const displayDue = isPaidLaterAfterRange ? checkoutDue : liveDue;

        const settledParsed = settledAt ? parseDate(settledAt) : null;
        const settledLaterLabel = settledParsed && !isNaN(settledParsed.getTime())
            ? `${settledParsed.toLocaleDateString()} • ${settledParsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : (settledYMD || '');

        return {
            checkoutPaid,
            checkoutDue,
            livePaid,
            liveDue,
            displayPaid,
            displayDue,
            isSettledLater,
            isPaidLaterAfterRange,
            settledDate: settledYMD,
            settledAt,
            settledLaterLabel,
            historicalStatus,
            currentStatus,
            displayStatus
        };
    };

    // ─── 1. DATE-FILTERED DATA FOR KPIS ───
    const salesInDate = useMemo(() => {
        return sales.filter(s => matchesDateFilter(s.created_at));
    }, [sales, dateFilter, customStartDate, customEndDate]);

    const customerPaymentsInDate = useMemo(() => {
        return payments.filter(p => {
            const isCustomerPayment = p.party_type === 'customer';
            const dateToTest = p.payment_date || p.created_at;
            return isCustomerPayment && matchesDateFilter(dateToTest);
        });
    }, [payments, dateFilter, customStartDate, customEndDate]);

    // Check if customer payment is recovering previous bill or FIFO debt
    const isPaymentRecoveredDue = (p) => {
        if (!p || p.party_type !== 'customer') return false;
        if (Number(p.amount) <= 0) return false;
        if (p.notes && (p.notes.toLowerCase().includes('refund') || p.notes.toLowerCase().includes('return'))) return false;
        if (p.reference_no && (p.reference_no.startsWith('SALE-') || p.reference_no.startsWith('RET-'))) return false;
        if (!p.reference_no) return true; // FIFO payment
        const refSale = sales.find(s => s.invoice_no === p.reference_no);
        if (!refSale) return true;
        const saleDate = toYMD(refSale.created_at);
        const payDate = toYMD(p.payment_date || p.created_at);
        return saleDate !== payDate;
    };

    const activeRecoveredDues = useMemo(() => {
        const rawList = (serverRecoveredPayments && serverRecoveredPayments.length > 0)
            ? serverRecoveredPayments
            : customerPaymentsInDate.filter(isPaymentRecoveredDue);

        return rawList.map(p => {
            const refSale = sales.find(s => s.invoice_no === p.reference_no);
            const extractedInvoice = (p.reference_no && p.reference_no.startsWith('INV-'))
                ? p.reference_no
                : (p.notes && p.notes.match(/INV-\d+-\d+/)?.[0]) || null;
            const targetBillRef = p.original_sale_id || refSale?.id || extractedInvoice;

            return {
                payment_id: p.payment_id || p.id,
                recovered_amount: Number(p.recovered_amount || p.amount) || 0,
                payment_method: p.payment_method || 'cash',
                reference_no: p.reference_no || extractedInvoice || 'FIFO Wasooli',
                recovery_date: p.recovery_date || toYMD(p.payment_date || p.created_at),
                payment_created_at: p.payment_created_at || p.created_at || p.payment_date,
                notes: p.notes,
                customer_id: p.customer_id || p.party_id,
                customer_name: p.party_name || p.customer_name || refSale?.customer_name || 'Customer',
                customer_business: p.party_business || p.customer_business || refSale?.customer_business || '',
                customer_phone: p.party_phone || p.customer_phone || refSale?.customer_phone || '',
                cashier_name: p.cashier_name || 'Cashier',
                original_sale_id: targetBillRef,
                original_sale_net: p.original_sale_net || refSale?.net_amount || null,
                original_sale_date: p.original_sale_date || refSale?.created_at || null
            };
        });
    }, [serverRecoveredPayments, customerPaymentsInDate, sales]);

    // ─── KPI METRICS COMPUTATION (Point-in-Time Accurate) ───
    const computedRecoveredDues = activeRecoveredDues.reduce((sum, p) => sum + (Number(p.recovered_amount || p.amount) || 0), 0);
    const totalRecoveredDues = (serverSummary?.totalRecoveredDues !== undefined && serverSummary.totalRecoveredDues > 0)
        ? serverSummary.totalRecoveredDues
        : computedRecoveredDues;

    const totalSale = serverSummary?.totalSale !== undefined 
        ? serverSummary.totalSale 
        : salesInDate.reduce((sum, s) => sum + (Number(s.gross_amount !== undefined ? s.gross_amount : (Number(s.net_amount || 0) + Number(s.discount || 0)))) || 0, 0);
    const checkoutCashInDate = serverSummary?.checkoutCollected !== undefined
        ? serverSummary.checkoutCollected
        : salesInDate.reduce((sum, s) => sum + getSaleHistoricalMetrics(s).checkoutPaid, 0);

    const totalCashRefunds = Number(serverSummary?.totalCashRefunds || 0);

    // Total Cash Inflow = Checkout Cash + Recovered Dues - Cash Refunds
    const totalCollected = serverSummary?.totalCollected !== undefined
        ? Number(serverSummary.totalCollected)
        : Math.max(0, checkoutCashInDate + totalRecoveredDues - totalCashRefunds);

    const newDuesAdded = serverSummary?.newDuesAdded !== undefined
        ? Number(serverSummary.newDuesAdded)
        : salesInDate.reduce((sum, s) => sum + getSaleHistoricalMetrics(s).checkoutDue, 0);

    const hasHistoricalPaidLater = salesInDate.some(s => getSaleHistoricalMetrics(s).isPaidLaterAfterRange);

    const totalPendingDues = hasHistoricalPaidLater
        ? salesInDate.reduce((sum, s) => sum + getSaleHistoricalMetrics(s).displayDue, 0)
        : (serverSummary?.totalPendingDues !== undefined
            ? serverSummary.totalPendingDues
            : salesInDate.reduce((sum, s) => sum + getSaleHistoricalMetrics(s).liveDue, 0));

    const totalDiscount = serverSummary?.totalDiscount !== undefined
        ? serverSummary.totalDiscount
        : salesInDate.reduce((sum, s) => sum + (Number(s.discount) || 0) + (Number(s.special_discount) || 0), 0);

    const statusCounts = (!hasHistoricalPaidLater && serverSummary?.statusCounts && serverSummary?.totalRecoveredDues > 0) ? serverSummary.statusCounts : {
        ALL: salesInDate.length + activeRecoveredDues.length,
        PAID: salesInDate.filter(s => getSaleHistoricalMetrics(s).displayStatus === 'PAID').length + activeRecoveredDues.length,
        PARTIAL: salesInDate.filter(s => getSaleHistoricalMetrics(s).displayStatus === 'PARTIAL').length,
        PENDING: salesInDate.filter(s => getSaleHistoricalMetrics(s).displayStatus === 'PENDING').length
    };

    // Active rows and pagination numbers (Server-Side Paginated)
    const filteredSales = sales;
    const paginatedSales = sales;
    const totalPages = Math.max(1, totalServerPages);
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startItemIndex = totalServerSales === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
    const endItemIndex = Math.min(validCurrentPage * pageSize, totalServerSales);

    // ─── UNIFIED TRANSACTION FEED ITEMS (Invoices + Recovered Dues) ───
    const displayFeedItems = useMemo(() => {
        const items = [];

        // 1. Invoices
        if (feedType === 'ALL' || feedType === 'INVOICES') {
            paginatedSales.forEach(s => {
                const metrics = getSaleHistoricalMetrics(s);
                if (statusFilter !== 'ALL' && statusFilter !== metrics.displayStatus) return;
                items.push({
                    type: 'invoice',
                    isRecovery: false,
                    id: `sale-${s.id}`,
                    timestamp: s.created_at,
                    sortDate: parseDate(s.created_at) || new Date(s.created_at),
                    sale: s,
                    metrics
                });
            });
        }

        // 2. Recovered Dues (Wasooli)
        if ((feedType === 'ALL' || feedType === 'WASOOLI') && (statusFilter === 'ALL' || statusFilter === 'PAID')) {
            activeRecoveredDues.forEach(p => {
                if (searchQuery && searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const inv = (p.reference_no || '').toLowerCase();
                    const cust = (p.customer_name || '').toLowerCase();
                    const biz = (p.customer_business || '').toLowerCase();
                    const phone = (p.customer_phone || '').toLowerCase();
                    const cashier = (p.cashier_name || '').toLowerCase();
                    if (!inv.includes(q) && !cust.includes(q) && !biz.includes(q) && !phone.includes(q) && !cashier.includes(q)) return;
                }

                const pDate = p.payment_created_at || p.recovery_date || p.created_at;
                items.push({
                    type: 'recovery',
                    isRecovery: true,
                    id: `rec-${p.payment_id || p.id || Math.random()}`,
                    timestamp: pDate,
                    sortDate: parseDate(pDate) || new Date(pDate),
                    recovery: p
                });
            });
        }

        // 3. Sales Returns / Credit Notes
        if ((feedType === 'ALL' || feedType === 'RETURNS') && statusFilter === 'ALL') {
            serverReturns.forEach(ret => {
                const cnNo = `CN-${String(ret.return_id).padStart(5, '0')}`;
                if (searchQuery && searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const cust = (ret.customer_name || '').toLowerCase();
                    const biz = (ret.customer_business || '').toLowerCase();
                    const inv = (ret.original_invoice_no || '').toLowerCase();
                    const rem = (ret.remarks || '').toLowerCase();
                    const cashier = (ret.cashier_name || '').toLowerCase();
                    if (!cnNo.toLowerCase().includes(q) && !cust.includes(q) && !biz.includes(q) && !inv.includes(q) && !rem.includes(q) && !cashier.includes(q)) return;
                }
                items.push({
                    type: 'return',
                    isReturn: true,
                    id: `ret-${ret.return_id}`,
                    timestamp: ret.created_at,
                    sortDate: parseDate(ret.created_at) || new Date(ret.created_at),
                    ret: { ...ret, cnNumber: cnNo }
                });
            });
        }

        items.sort((a, b) => b.sortDate - a.sortDate);
        return items;
    }, [paginatedSales, activeRecoveredDues, serverReturns, feedType, statusFilter, searchQuery, payments]);

    // Return Modal Handlers (Walk-in No-Invoice Return + Invoice-linked Return)
    const ensureReturnCatalogLoaded = async () => {
        if (returnCatalogProducts.length > 0) return;
        try {
            const res = await fetch(apiUrl('/api/products'));
            if (res.ok) {
                const data = await res.json();
                setReturnCatalogProducts(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to load products for walk-in return:', err);
        }
    };

    const handleOpenWalkinReturn = async () => {
        setReturnMode('walkin');
        setSelectedSale(null);
        setReturnItems([]);
        setRefundAmount(0);
        setRefundMethod('cash');
        setReturnType('saleable');
        setReturnProductSearch('');
        setReturnRemarks('');
        setAutoPrintReturnThermal(true);
        setReturnModalOpen(true);
        await ensureReturnCatalogLoaded();
    };

    // F5 Shortcut: Opens Walk-in Sales Return modal directly on Sales page
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'F5') {
                e.preventDefault();
                handleOpenWalkinReturn();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [returnCatalogProducts.length]);

    const openReturnModal = async (sale) => {
        try {
            const fullSale = await fetchSaleDetails(sale.id, false);
            if (fullSale) {
                setReturnMode('invoice');
                const initialReturnItems = (fullSale.items || []).map(it => ({
                    variant_id: it.variant_id,
                    packaging_type_id: it.packaging_type_id,
                    product_name: it.product_name,
                    variant_name: it.variant_name,
                    packaging_name: it.packaging_name,
                    sold_quantity: it.quantity,
                    already_returned: it.already_returned || 0,
                    max_quantity: it.remaining_returnable !== undefined ? it.remaining_returnable : it.quantity,
                    return_quantity: 0,
                    unit_price: it.price,
                    conversion_factor: it.conversion_factor || 1
                }));
                setReturnItems(initialReturnItems);
                setRefundAmount(0);
                setRefundMethod(sale.customer_id ? 'credit' : 'cash');
                setReturnType('saleable');
                setReturnRemarks('');
                setReturnModalOpen(true);
            }
        } catch (err) {
            showAlert('Return Error', 'Failed to initialize return items.', 'error');
        }
    };

    const recalculateWalkinReturnTotal = (itemsList) => {
        const total = itemsList.reduce((sum, it) => sum + ((parseFloat(it.return_quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);
        setRefundAmount(Math.round(total * 100) / 100);
    };

    const handleAddWalkinReturnProduct = (product) => {
        const packList = (product.packagings && product.packagings.length > 0)
            ? product.packagings
            : [{
                packaging_type_id: 1,
                packaging_name: product.unit_symbol || product.unit_name || 'PCS',
                conversion_factor: 1,
                selling_price: product.selling_price || 0
            }];
        const defaultPack = packList.find(pk => pk.is_default) || packList[0];

        const existingIdx = returnItems.findIndex(
            it => it.variant_id === product.variant_id && it.packaging_type_id === (defaultPack.packaging_type_id || defaultPack.id)
        );
        if (existingIdx >= 0) {
            const updated = [...returnItems];
            updated[existingIdx].return_quantity = (parseFloat(updated[existingIdx].return_quantity) || 0) + 1;
            setReturnItems(updated);
            recalculateWalkinReturnTotal(updated);
            return;
        }

        const newItem = {
            variant_id: product.variant_id,
            packaging_type_id: defaultPack.packaging_type_id || defaultPack.id,
            product_name: product.product_name,
            variant_name: product.variant_name,
            packaging_name: defaultPack.packaging_name || product.unit_name || 'PCS',
            packagings: packList,
            return_quantity: 1,
            unit_price: parseFloat(defaultPack.selling_price) || 0,
            conversion_factor: parseFloat(defaultPack.conversion_factor) || 1
        };
        const updated = [...returnItems, newItem];
        setReturnItems(updated);
        recalculateWalkinReturnTotal(updated);
    };

    const handleUpdateWalkinReturnItem = (idx, field, value) => {
        const updated = [...returnItems];
        const item = { ...updated[idx] };
        if (field === 'packaging_type_id') {
            const selectedPack = (item.packagings || []).find(p => String(p.packaging_type_id || p.id) === String(value));
            if (selectedPack) {
                item.packaging_type_id = selectedPack.packaging_type_id || selectedPack.id;
                item.packaging_name = selectedPack.packaging_name;
                item.conversion_factor = parseFloat(selectedPack.conversion_factor) || 1;
                item.unit_price = parseFloat(selectedPack.selling_price) || 0;
            }
        } else if (field === 'return_quantity') {
            item.return_quantity = Math.max(0, parseFloat(value) || 0);
        } else if (field === 'unit_price') {
            item.unit_price = Math.max(0, parseFloat(value) || 0);
        }
        updated[idx] = item;
        setReturnItems(updated);
        recalculateWalkinReturnTotal(updated);
    };

    const handleRemoveWalkinReturnItem = (idx) => {
        const updated = returnItems.filter((_, i) => i !== idx);
        setReturnItems(updated);
        recalculateWalkinReturnTotal(updated);
    };

    const handleUpdateReturnQty = (idx, qty) => {
        const updated = [...returnItems];
        const val = Math.min(updated[idx].max_quantity, Math.max(0, parseFloat(qty) || 0));
        updated[idx].return_quantity = val;
        setReturnItems(updated);
        recalculateWalkinReturnTotal(updated);
    };

    const handleSubmitReturn = async (e) => {
        e.preventDefault();
        const activeItems = returnItems.filter(it => (parseFloat(it.return_quantity) || 0) > 0).map(it => ({
            variant_id: it.variant_id,
            packaging_type_id: it.packaging_type_id,
            product_name: it.product_name,
            variant_name: it.variant_name,
            packaging_name: it.packaging_name,
            quantity: parseFloat(it.return_quantity),
            refund_price: parseFloat(it.unit_price) || 0,
            conversion_factor: parseFloat(it.conversion_factor) || 1
        }));

        if (activeItems.length === 0 || refundAmount <= 0) {
            return showAlert('Attention Required', 'Please select quantity for at least one item to return.', 'warning');
        }

        try {
            const token = localStorage.getItem('token');
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const localDateTime = `${localDate} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            const isInvoiceReturn = returnMode === 'invoice' && selectedSale;
            const defaultRemarks = isInvoiceReturn
                ? `Customer return for invoice ${selectedSale.invoice_no} (${refundMethod === 'cash' ? 'Cash Refund' : 'Khata Adjustment'})`
                : `Walk-in return without invoice (${refundMethod === 'cash' ? 'Cash Refund' : 'Store Credit'})`;

            const res = await fetch(apiUrl('/api/sales/returns'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    sale_id: isInvoiceReturn ? selectedSale.id : null,
                    customer_id: isInvoiceReturn ? selectedSale.customer_id : null,
                    return_type: returnType,
                    refund_method: refundMethod,
                    items: activeItems,
                    total_refund: refundAmount,
                    remarks: returnRemarks.trim() || defaultRemarks,
                    payment_date: localDate,
                    created_at: localDateTime
                })
            });

            if (res.ok) {
                const data = await res.json();
                setReturnModalOpen(false);
                loadData();

                // Print 80mm thermal return receipt for customer if enabled
                if (autoPrintReturnThermal) {
                    try {
                        const thermalHtml = generateThermalReturnReceiptHtml({
                            returnId: data.returnId,
                            cnNumber: data.cnNumber,
                            customer_name: isInvoiceReturn ? (selectedSale.customer_name || 'Walk-in Customer') : 'Walk-in Customer',
                            invoice_no: isInvoiceReturn ? selectedSale.invoice_no : 'Walk-in Return (No Invoice)',
                            return_type: returnType,
                            refund_method: refundMethod,
                            total_refund: refundAmount,
                            remarks: returnRemarks.trim() || '',
                            items: activeItems
                        }, settings, user?.full_name || user?.username || 'Cashier');
                        const isSilent = settings?.silent_print === 'true' || settings?.silent_print === true;
                        const thermalPrinter = (settings?.selected_printer && settings.selected_printer !== 'os_dialog')
                            ? settings.selected_printer
                            : null;
                        triggerPrintHtml(thermalHtml, { silent: isSilent, printerName: thermalPrinter, format: 'thermal' });
                    } catch (printErr) {
                        console.warn('Thermal return receipt print skipped:', printErr);
                    }
                }

                if (data.returnId && isInvoiceReturn) {
                    setActiveCreditNoteReturnId(data.returnId);
                    setCreditNoteModalOpen(true);
                } else {
                    showAlert('Return Processed', `Walk-in Return ${data.cnNumber || ''} completed! Refund: Rs. ${refundAmount.toLocaleString()}${autoPrintReturnThermal ? ' • Thermal receipt sent to printer.' : ''}`, 'success');
                }
            } else {
                const data = await res.json();
                showAlert('Return Failed', data.error || 'Failed to process return.', 'error');
            }
        } catch (err) {
            showAlert('Network Error', err.message, 'error');
        }
    };

    const handleMoreClick = (e, saleId) => {
        e.stopPropagation();
        setActiveMenuId(prev => prev === saleId ? null : saleId);
    };

    const handleInitiateEdit = async (sale) => {
        setActiveMenuId(null);
        const fullSale = await fetchSaleDetails(sale.id, false);
        if (!fullSale) return;

        // Check if user is admin
        const isAdmin = user?.role === 'admin';
        if (!isAdmin) {
            setPendingEditSale(fullSale);
            setAdminAuthPin('');
            setAdminAuthModalOpen(true);
            return;
        }

        // Admin allowed directly -> Persist for Electron page reload, load in POS and navigate
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('hws_editing_sale', JSON.stringify(fullSale));
            } catch (e) {
                console.warn('Failed to save editing sale to localStorage:', e);
            }
        }
        dispatch(loadSaleForEdit(fullSale));
        router.push('/pos');
    };

    const handleVerifyAdminPin = () => {
        if (adminAuthPin === 'admin123' || adminAuthPin === 'admin') {
            setAdminAuthModalOpen(false);
            const saleToLoad = pendingEditSale;
            setPendingEditSale(null);
            if (typeof window !== 'undefined' && saleToLoad) {
                try {
                    localStorage.setItem('hws_editing_sale', JSON.stringify(saleToLoad));
                } catch (e) {
                    console.warn('Failed to save editing sale to localStorage:', e);
                }
            }
            if (saleToLoad) {
                dispatch(loadSaleForEdit(saleToLoad));
            }
            router.push('/pos');
        } else {
            showAlert('Access Denied', 'Incorrect Admin PIN. Only administrators can edit completed sales.', 'error');
        }
    };

    const handlePrintInvoice = async (format = 'a4') => {
        const isA4 = format === 'a4';
        const a4Printer = (settings?.selected_a4_printer || '').trim();
        const thermalPrinter = (settings?.selected_printer || '').trim();

        const targetPrinter = isA4
            ? (a4Printer && a4Printer !== 'same_as_thermal' ? a4Printer : '')
            : thermalPrinter;
        const isSilent = settings?.silent_print === 'true' && targetPrinter !== 'os_dialog';

        if (!selectedSale) return;

        let htmlContent = '';
        if (isA4) {
            htmlContent = generateWholesaleInvoiceA4Html(
                selectedSale,
                settings,
                prevBalance,
                newBalance
            );
        } else {
            htmlContent = generateThermalReceiptHtml(
                selectedSale,
                settings,
                user?.full_name || user?.username || 'Cashier',
                prevBalance,
                newBalance
            );
        }

        await triggerPrintHtml(htmlContent, {
            silent: isSilent,
            printerName: targetPrinter !== 'os_dialog' ? targetPrinter : '',
            format: isA4 ? 'a4' : 'thermal'
        });
    };

    const handleDownloadA4PDF = async () => {
        const element = document.getElementById('printable-invoice-a4');
        if (!element) {
            showAlert('Export Error', 'A4 Invoice template not found for PDF export.', 'error');
            return;
        }

        setDownloadingPdf(true);
        try {
            const rawInv = selectedSale?.invoice_no || 'INVOICE';
            const cleanInv = String(rawInv).replace(/[^a-zA-Z0-9_-]/g, '_');
            await downloadAndOpenPdf(element, `${cleanInv}_A4.pdf`);
            showAlert('A4 Bill Ready', 'A4 invoice opened in Chrome. You can view, print, or download it directly from Chrome.', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            showAlert('PDF Export Failed', err.message || 'Could not generate PDF', 'error');
        } finally {
            setDownloadingPdf(false);
        }
    };

    const handleSendSaleBillWhatsApp = async (sale) => {
        if (!sale || !sale.id) return;
        const phone = (sale.customer_phone && String(sale.customer_phone).trim()) ||
            (sale.customer_mobile && String(sale.customer_mobile).trim()) ||
            (sale.phone && String(sale.phone).trim());
        if (!phone) {
            showAlert('Missing Phone', 'Customer phone number is required to send invoice via WhatsApp.', 'error');
            return;
        }
        setWaSending(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/whatsapp/send-bill'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    sale_id: sale.id,
                    phone: phone,
                    custom_sale: sale
                })
            });
            const data = await res.json();
            if (res.ok) {
                showAlert('WhatsApp Bill Sent', `Invoice #${sale.invoice_no || sale.id} PDF sent successfully to ${sale.customer_name || 'Customer'} via WhatsApp!`, 'success');
            } else {
                showAlert('WhatsApp Error', data.error || 'Failed to send WhatsApp bill PDF', 'error');
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setWaSending(false);
        }
    };

    const getPackagingSummary = (items) => {
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
    };

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

    const prevBalance = selectedSale ? (
        selectedSale.current_customer_balance !== undefined
            ? (selectedSale.current_customer_balance - selectedSale.remaining_balance)
            : 0
    ) : 0;

    const newBalance = selectedSale ? (
        selectedSale.current_customer_balance !== undefined
            ? selectedSale.current_customer_balance
            : selectedSale.remaining_balance
    ) : 0;

    return (
        <div className="w-full max-w-[2200px] mx-auto space-y-3 sm:space-y-4 2xl:space-y-5 pb-10">
            {/* TOP HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 2xl:p-4 rounded-2xl border border-gray-200 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 rounded-full bg-[#0B3B7B] shadow-xs animate-pulse" />
                        <h1 className="text-sm sm:text-base 2xl:text-xl font-extrabold text-gray-900 tracking-tight leading-none">
                            Sales History &amp; Analytics
                        </h1>
                    </div>
                    <p className="text-[11px] 2xl:text-xs text-gray-500 mt-1">
                        Review wholesale invoices, customer dues, wasooli recoveries, and returns
                    </p>
                </div>
                <div className="flex items-center gap-2 2xl:gap-3 shrink-0 flex-wrap">
                    <button
                        type="button"
                        onClick={loadData}
                        disabled={loading}
                        className="px-3 2xl:px-4 py-1.5 2xl:py-2 border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700 rounded-xl text-xs 2xl:text-sm font-semibold inline-flex items-center gap-1.5 2xl:gap-2 transition-all cursor-pointer shadow-2xs"
                        title="Refresh sales data"
                    >
                        <IconRefresh className={`w-3.5 h-3.5 2xl:w-4 2xl:h-4 ${loading ? 'animate-spin text-[#0B3B7B]' : 'text-gray-500'}`} />
                        <span>Refresh</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenWalkinReturn}
                        className="px-3 2xl:px-4 py-1.5 2xl:py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs 2xl:text-sm font-bold inline-flex items-center gap-1.5 2xl:gap-2 transition-all cursor-pointer shadow-xs border border-purple-700 active:scale-95"
                        title="Process Walk-in Sales Return without Invoice (Shortcut: F5)"
                    >
                        <IconReturn className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
                        <span>Return (F5)</span>
                    </button>
                    <Link
                        href="/pos"
                        className="px-3.5 2xl:px-4.5 py-1.5 2xl:py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs 2xl:text-sm font-extrabold inline-flex items-center gap-1.5 2xl:gap-2 transition-all cursor-pointer shadow-xs border border-[#16A34A]"
                    >
                        <IconPOS className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-white" />
                        <span>+ New Sale</span>
                    </Link>
                </div>
            </div>

            {/* 5 KPIS CARDS (WHOLESALE NAVY & EMERALD PALETTE) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1fr_1.4fr_1fr_1fr_0.85fr] gap-2.5 2xl:gap-3.5">
                {/* 1. TOTAL SALE */}
                <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-blue-200 hover:border-blue-400 shadow-xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] 2xl:text-xs font-bold uppercase tracking-wider text-gray-500">Total Sale</span>
                        <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg bg-blue-50 text-[#0B3B7B] border border-blue-200 flex items-center justify-center shrink-0">
                            <IconSales className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg 2xl:text-xl font-black text-gray-900 tracking-tight">
                            Rs. {totalSale.toLocaleString()}
                        </div>
                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-0.5">
                            {salesInDate.length} invoices
                        </div>
                    </div>
                </div>

                {/* 2. TOTAL COLLECTED */}
                <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-emerald-200 hover:border-emerald-400 shadow-xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] 2xl:text-xs font-bold uppercase tracking-wider text-gray-500">Total Collected</span>
                        <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                            <IconCashRegister className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg 2xl:text-xl font-black text-emerald-700 tracking-tight">
                            {loading && !serverSummary ? '...' : `Rs. ${totalCollected.toLocaleString()}`}
                        </div>
                        <div className="text-[8.5px] sm:text-[9.5px] 2xl:text-[10.5px] text-gray-500 font-medium mt-0.5 leading-tight break-words">
                            {loading && !serverSummary
                                ? 'Loading...'
                                : `Sale ${totalSale.toLocaleString()} - Dues ${newDuesAdded.toLocaleString()} + Rec ${totalRecoveredDues.toLocaleString()} - Ref ${totalCashRefunds.toLocaleString()} - Disc ${totalDiscount.toLocaleString()}`}
                        </div>
                    </div>
                </div>

                {/* 4. RECOVERED DUES */}
                <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-teal-200 hover:border-teal-400 shadow-xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] 2xl:text-xs font-bold uppercase tracking-wider text-gray-500">Recovered Dues</span>
                        <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                            <IconPayments className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg 2xl:text-xl font-black text-teal-700 tracking-tight">
                            Rs. {totalRecoveredDues.toLocaleString()}
                        </div>
                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-0.5">
                            {activeRecoveredDues.length} wasooli vouchers
                        </div>
                    </div>
                </div>

                {/* 5. PENDING DUES */}
                <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-rose-200 hover:border-rose-400 shadow-xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] 2xl:text-xs font-bold uppercase tracking-wider text-gray-500">Pending Dues</span>
                        <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                            <IconWarning className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg 2xl:text-xl font-black text-rose-600 tracking-tight">
                            Rs. {totalPendingDues.toLocaleString()}
                        </div>
                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-0.5">
                            Period credit balance
                        </div>
                    </div>
                </div>

                {/* 6. TOTAL DISCOUNT */}
                <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-amber-200 hover:border-amber-400 shadow-xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] 2xl:text-xs font-bold uppercase tracking-wider text-gray-500">Discount</span>
                        <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                            <IconReceipt className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-base sm:text-lg 2xl:text-xl font-black text-amber-700 tracking-tight">
                            Rs. {totalDiscount.toLocaleString()}
                        </div>
                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-0.5">
                            Bill discounts
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTER & SEARCH CONTROL BAR */}
            <div className="bg-white p-3 2xl:p-4 rounded-2xl border border-gray-200 shadow-xs space-y-2.5 2xl:space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 2xl:gap-3 w-full">
                    {/* LEFT: SEARCH INPUT (Fluid width: expands up to max-w-xl on large screens) */}
                    <div className="relative w-full md:max-w-xs lg:max-w-sm xl:max-w-md 2xl:max-w-xl">
                        <IconSearch className="w-4 h-4 2xl:w-4.5 2xl:h-4.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder="Search customer, phone, invoice #..."
                            className="w-full pl-9 2xl:pl-10 pr-8 py-1.5 2xl:py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs 2xl:text-sm text-gray-900 placeholder:text-gray-400 font-medium outline-none focus:bg-white focus:border-[#0B3B7B] focus:ring-1 focus:ring-[#0B3B7B] transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                            >
                                <IconClose className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>
                        )}
                    </div>

                    {/* RIGHT: DATE FILTER + STATUS FILTERS */}
                    <div className="flex flex-wrap items-center gap-2 2xl:gap-2.5">
                        {/* DATE SELECT DROPDOWN */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-gray-200 px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-xl shrink-0">
                            <IconCalendar className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-[#0B3B7B] shrink-0" />
                            <label htmlFor="sales-date-filter" className="text-[10px] 2xl:text-xs font-bold text-gray-500 whitespace-nowrap">
                                Period:
                            </label>
                            <select
                                id="sales-date-filter"
                                value={dateFilter}
                                onChange={(e) => {
                                    setDateFilter(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="bg-transparent text-[11px] 2xl:text-xs font-bold text-gray-900 outline-none cursor-pointer pr-0.5"
                            >
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="this_week">This Week</option>
                                <option value="this_month">This Month</option>
                                <option value="custom">Custom Range</option>
                                <option value="all">All Time</option>
                            </select>
                        </div>

                        {/* STATUS FILTER BUTTONS */}
                        <div className="flex items-center p-1 bg-slate-50 rounded-xl border border-gray-200 shrink-0 text-[10.5px] 2xl:text-xs font-bold overflow-x-auto max-w-full">
                            <button
                                onClick={() => {
                                    setStatusFilter('ALL');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 2xl:px-3.5 py-1 2xl:py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${statusFilter === 'ALL'
                                    ? 'bg-[#0B3B7B] text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-[#0B3B7B] hover:bg-blue-50/50'
                                    }`}
                            >
                                All ({statusCounts.ALL})
                            </button>
                            <button
                                onClick={() => {
                                    setStatusFilter('PAID');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 2xl:px-3.5 py-1 2xl:py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${statusFilter === 'PAID'
                                    ? 'bg-emerald-700 text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                                    }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Paid ({statusCounts.PAID})
                            </button>
                            <button
                                onClick={() => {
                                    setStatusFilter('PENDING');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 2xl:px-3.5 py-1 2xl:py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${statusFilter === 'PENDING'
                                    ? 'bg-rose-700 text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-rose-700 hover:bg-rose-50/50'
                                    }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                Pending ({statusCounts.PENDING})
                            </button>
                            <button
                                onClick={() => {
                                    setStatusFilter('PARTIAL');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 2xl:px-3.5 py-1 2xl:py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${statusFilter === 'PARTIAL'
                                    ? 'bg-amber-600 text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-amber-700 hover:bg-amber-50/50'
                                    }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                Partial ({statusCounts.PARTIAL})
                            </button>
                        </div>
                    </div>
                </div>

                {/* CONDITIONAL CUSTOM DATE PICKERS */}
                {dateFilter === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 text-[10px] 2xl:text-xs">
                        <span className="font-bold text-gray-700">Custom Range:</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">From:</span>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 font-semibold outline-none text-xs 2xl:text-sm focus:border-[#0B3B7B]"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">To:</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-2.5 2xl:px-3 py-1 2xl:py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 font-semibold outline-none text-xs 2xl:text-sm focus:border-[#0B3B7B]"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* SALES INVOICES DATA CONTAINER */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                <div className="p-3 2xl:p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs 2xl:text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Feed Filter: All | Invoices | Wasooli */}
                        <div className="flex items-center p-1 bg-slate-50 rounded-xl border border-gray-200 text-[10.5px] 2xl:text-xs font-bold">
                            <button
                                onClick={() => setFeedType('ALL')}
                                className={`px-2.5 2xl:px-3.5 py-0.5 2xl:py-1 rounded-lg transition-all cursor-pointer ${feedType === 'ALL'
                                    ? 'bg-[#0B3B7B] text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-[#0B3B7B] hover:bg-blue-50/50'
                                    }`}
                            >
                                All ({displayFeedItems.length})
                            </button>
                            <button
                                onClick={() => setFeedType('INVOICES')}
                                className={`px-2.5 2xl:px-3.5 py-0.5 2xl:py-1 rounded-lg transition-all cursor-pointer ${feedType === 'INVOICES'
                                    ? 'bg-[#0B3B7B] text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-[#0B3B7B] hover:bg-blue-50/50'
                                    }`}
                            >
                                Invoices ({paginatedSales.length})
                            </button>
                            <button
                                onClick={() => setFeedType('WASOOLI')}
                                className={`px-2.5 2xl:px-3.5 py-0.5 2xl:py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${feedType === 'WASOOLI'
                                    ? 'bg-emerald-700 text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                                    }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Dues Recovered ({activeRecoveredDues.length})
                            </button>
                            <button
                                onClick={() => setFeedType('RETURNS')}
                                className={`px-2.5 2xl:px-3.5 py-0.5 2xl:py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${feedType === 'RETURNS'
                                    ? 'bg-rose-700 text-white font-extrabold shadow-xs'
                                    : 'text-gray-600 hover:text-rose-700 hover:bg-rose-50/50'
                                    }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                Returns ({serverReturns.length})
                            </button>
                        </div>
                        <span className="text-gray-300">|</span>
                        <span className="text-gray-500 font-medium text-[11px] 2xl:text-xs">
                            Period: <strong className="text-gray-800 capitalize">{dateFilter.replace('_', ' ')}</strong>
                        </span>
                        {totalPages > 1 && feedType !== 'WASOOLI' && (
                            <span className="text-[10px] 2xl:text-xs font-bold text-[#0B3B7B] bg-blue-50 border border-blue-200 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-lg">
                                Page {validCurrentPage} of {totalPages}
                            </span>
                        )}
                        {tableLoading && (
                            <span className="w-2 h-2 rounded-full bg-[#0B3B7B] animate-ping" title="Loading..."></span>
                        )}
                    </div>
                    {(searchQuery || statusFilter !== 'ALL' || dateFilter !== 'today' || feedType !== 'ALL') && (
                        <div className="flex items-center gap-2 2xl:gap-3">
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    statusFilter !== 'ALL' && setStatusFilter('ALL');
                                    dateFilter !== 'today' && setDateFilter('today');
                                    feedType !== 'ALL' && setFeedType('ALL');
                                }}
                                className="font-bold text-[#0B3B7B] hover:text-[#072B5C] hover:underline cursor-pointer text-right text-xs"
                            >
                                Reset Filters
                            </button>
                        </div>
                    )}
                </div>

                {/* 1. MOBILE RESPONSIVE CARD VIEW (SHOWN ON MOBILE SCREENS < md) */}
                <div className="block md:hidden p-3 space-y-2.5 bg-slate-50/50">
                    {displayFeedItems.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
                            <IconReceipt className="w-7 h-7 text-[#0B3B7B]/50 mx-auto mb-1.5" />
                            <div className="font-bold text-xs text-gray-700">No transactions found</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                                No records match the selected date &quot;{dateFilter}&quot; and filter &quot;{statusFilter}&quot;.
                            </div>
                            {dateFilter !== 'all' && (
                                <button
                                    onClick={() => setDateFilter('all')}
                                    className="px-3 py-1 rounded-xl text-xs font-bold bg-[#0B3B7B] hover:bg-[#072B5C] text-white mt-2 cursor-pointer shadow-xs border border-[#0B3B7B]"
                                >
                                    View All Time Transactions
                                </button>
                            )}
                        </div>
                    ) : (
                        displayFeedItems.map((item) => {
                            if (item.isReturn) {
                                const r = item.ret;
                                const isCash = r.refund_method === 'cash';
                                return (
                                    <div key={item.id} className="p-3.5 space-y-2.5 bg-rose-50/70 rounded-2xl border border-rose-200 shadow-xs border-l-4 border-l-rose-600">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono font-bold text-rose-900 text-xs px-1.5 py-0.5 rounded bg-rose-100 border border-rose-200">
                                                    {r.cnNumber}
                                                </span>
                                                <span className="text-[10px] font-extrabold text-rose-700 bg-white px-1.5 py-0.5 rounded border border-rose-200">
                                                    {r.return_type === 'damaged' ? 'Damaged' : 'Saleable'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-medium">
                                                {parseDate(r.created_at)?.toLocaleDateString()} • {parseDate(r.created_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="font-extrabold text-gray-900 text-xs">{r.customer_name || 'Walk-in Customer'}</div>
                                            <div className="text-[10.5px] text-gray-500">
                                                {r.original_invoice_no ? `Ref: ${r.original_invoice_no}` : 'Walk-in Return (No Invoice)'} • by {r.cashier_name || 'admin'}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-1.5 border-t border-rose-200/70">
                                            <div>
                                                <div className="font-black text-rose-700 text-xs font-mono">-Rs. {Number(r.total_refund || 0).toLocaleString()}</div>
                                                <div className="text-[9.5px] font-bold text-rose-600">{isCash ? 'Cash Refund' : 'Khata Credit'}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveCreditNoteReturnId(r.return_id);
                                                    setCreditNoteModalOpen(true);
                                                }}
                                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-purple-700 hover:bg-purple-800 text-white cursor-pointer shadow-2xs"
                                            >
                                                Credit Note
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            if (item.isRecovery) {
                                const p = item.recovery;
                                const invTokens = extractInvoiceTokens(p.reference_no);

                                return (
                                    <div key={item.id} className="p-3.5 space-y-2.5 bg-emerald-50/80 rounded-2xl border border-emerald-300 shadow-xs border-l-4 border-l-emerald-600 hover:shadow-sm transition-all">
                                        {/* Top Row: Ref # + Dues Recovered Badge + Date */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {invTokens.length > 0 ? (
                                                    invTokens.map((invNo) => (
                                                        <button
                                                            key={invNo}
                                                            type="button"
                                                            onClick={() => fetchSaleDetails(invNo, true)}
                                                            className="font-mono font-bold text-emerald-900 hover:underline text-xs cursor-pointer px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 inline-flex items-center gap-1"
                                                            title={`Click to view bill ${invNo}`}
                                                        >
                                                            <IconEye className="w-2.5 h-2.5 text-emerald-700" />
                                                            <span>{invNo}</span>
                                                        </button>
                                                    ))
                                                ) : p.original_sale_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => fetchSaleDetails(p.original_sale_id, true)}
                                                        className="hover:underline cursor-pointer text-emerald-900 font-mono font-bold text-xs"
                                                        title="Click to view bill"
                                                    >
                                                        {p.reference_no || 'FIFO Wasooli'}
                                                    </button>
                                                ) : (
                                                    <span className="font-mono font-bold text-emerald-900 text-xs">
                                                        {p.reference_no || 'FIFO Wasooli'}
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    <IconPayments className="w-2.5 h-2.5 text-emerald-700" /> Wasooli
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-medium">
                                                {p.recovery_date || toYMD(item.timestamp)}
                                            </span>
                                        </div>

                                        {/* Customer Info & Original Bill Ref */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-bold text-gray-900 text-xs">
                                                    {p.customer_name || 'Customer'}
                                                </div>
                                                {p.customer_business && (
                                                    <div className="text-[9.5px] text-[#0B3B7B] font-semibold">
                                                        {p.customer_business}
                                                    </div>
                                                )}
                                                {p.original_sale_date && (
                                                    <div className="text-[9px] text-emerald-700 font-medium mt-0.5">
                                                        Settling Bill of: <strong className="font-bold">{toYMD(p.original_sale_date)}</strong>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[9px] text-gray-400 font-semibold uppercase">Wasooli Cash</div>
                                                <div className="font-black text-emerald-700 text-sm">
                                                    +Rs. {Number(p.recovered_amount).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions & Payment Method */}
                                        <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 text-[9.5px] flex-wrap gap-1.5">
                                            <div className="text-gray-500">
                                                Via: <span className="font-semibold text-gray-800 uppercase">{p.payment_method}</span>
                                                {p.cashier_name && <span className="text-gray-400 ml-1">({p.cashier_name})</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {invTokens.length > 0 ? (
                                                    invTokens.map((invNo, idx) => (
                                                        <button
                                                            key={invNo}
                                                            type="button"
                                                            onClick={() => fetchSaleDetails(invNo, true)}
                                                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                                                            title={`View bill ${invNo}`}
                                                        >
                                                            <IconEye className="w-3 h-3" />
                                                            {invTokens.length === 1 ? 'Bill' : `Bill #${idx + 1}`}
                                                        </button>
                                                    ))
                                                ) : p.original_sale_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => fetchSaleDetails(p.original_sale_id, true)}
                                                        className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                                                        title="View bill"
                                                    >
                                                        <IconEye className="w-3 h-3" />
                                                        Bill
                                                    </button>
                                                ) : null}
                                                <button
                                                    onClick={() => {
                                                        setSelectedWasooli(p);
                                                        setWasooliModalOpen(true);
                                                    }}
                                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-300 transition-all cursor-pointer shadow-2xs"
                                                >
                                                    Voucher
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Regular Sales Invoice
                            const s = item.sale;
                            const m = item.metrics;
                            const saleDiscount = (Number(s.discount) || 0) + (Number(s.special_discount) || 0);

                            return (
                                <div
                                    key={item.id}
                                    className={`p-3.5 space-y-2.5 rounded-2xl border shadow-xs hover:shadow-sm transition-all ${
                                        m.isPaidLaterAfterRange
                                            ? 'bg-red-100/90 border-red-300 border-l-4 border-l-red-600'
                                            : 'bg-white border-gray-200 hover:border-blue-300'
                                    }`}
                                >
                                    {/* Top Row: Invoice # + Status + Date */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono font-bold text-[#0B3B7B] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-xs">
                                                {s.invoice_no}
                                            </span>
                                            {m.displayStatus === 'PAID' && (
                                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                    <IconCheck className="w-2.5 h-2.5 text-emerald-600" /> Paid
                                                </span>
                                            )}
                                            {m.displayStatus === 'PARTIAL' && (
                                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Partial
                                                </span>
                                            )}
                                            {m.displayStatus === 'PENDING' && (
                                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                                    <IconWarning className="w-2.5 h-2.5 text-rose-600" /> Pending
                                                </span>
                                            )}
                                            {m.isSettledLater && (
                                                <span
                                                    className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded border ${
                                                        m.isPaidLaterAfterRange
                                                            ? 'text-rose-900 bg-rose-100 border-rose-300'
                                                            : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                    }`}
                                                    title={`Paid later on ${m.settledLaterLabel || m.settledDate || 'subsequent date'}`}
                                                >
                                                    Paid later{m.settledLaterLabel ? `: ${m.settledLaterLabel}` : ''}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            {parseDate(s.created_at)?.toLocaleDateString() || ''}
                                        </span>
                                    </div>

                                    {/* Customer & Cashier Info */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-extrabold text-gray-900 text-xs">
                                                {s.customer_name || 'Walk-in Customer'}
                                            </div>
                                            {s.customer_business && (
                                                <div className="text-[9.5px] text-[#0B3B7B] font-semibold">
                                                    {s.customer_business}
                                                </div>
                                            )}
                                            {s.customer_phone && (
                                                <div className="text-[9px] text-gray-400 font-mono">
                                                    {s.customer_phone}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right text-[9.5px] text-gray-400 shrink-0">
                                            Cashier: <span className="font-medium text-gray-700">{s.cashier_name || 'Admin'}</span>
                                        </div>
                                    </div>

                                    {/* 4-Stat Financial Strip */}
                                    <div className="grid grid-cols-4 gap-1 bg-slate-50 p-2 rounded-xl border border-gray-200 text-[10px]">
                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold">Net Total</div>
                                            <div className="font-black text-gray-900 text-xs leading-tight">
                                                Rs. {Number(s.net_amount).toLocaleString()}
                                            </div>
                                            {saleDiscount > 0 && (
                                                <div className="text-[8px] text-gray-400 line-through">
                                                    Rs. {(Number(s.gross_amount) || Number(s.total_amount) || (Number(s.net_amount) + saleDiscount)).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold">Discount</div>
                                            {saleDiscount > 0 ? (
                                                <div className="font-bold text-amber-700 text-[10px] leading-tight">
                                                    -Rs. {saleDiscount.toLocaleString()}
                                                </div>
                                            ) : (
                                                <div className="text-gray-300 font-medium">—</div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold">Paid</div>
                                            <div className="font-bold text-emerald-700 text-xs leading-tight">
                                                Rs. {Number(m.displayPaid).toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold">Due</div>
                                            {m.displayDue > 0 ? (
                                                <div className="font-black text-rose-600 text-xs leading-tight">
                                                    Rs. {Number(m.displayDue).toLocaleString()}
                                                </div>
                                            ) : (
                                                <div className="text-gray-400 font-medium">Rs. 0</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons Row */}
                                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                                        <button
                                            onClick={() => fetchSaleDetails(s.id, true)}
                                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#0B3B7B] hover:bg-[#072B5C] text-white transition-all cursor-pointer shadow-2xs border border-[#0B3B7B] inline-flex items-center gap-1"
                                        >
                                            <IconEye className="w-3 h-3 text-white" />
                                            View
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const fullSale = await fetchSaleDetails(s.id, false);
                                                if (fullSale) {
                                                    setSelectedSale(fullSale);
                                                    setThermalModalOpen(true);
                                                }
                                            }}
                                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700 transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                        >
                                            <IconReceipt className="w-3 h-3 text-gray-500" />
                                            <span>Receipt</span>
                                        </button>
                                        <button
                                            onClick={() => openReturnModal(s)}
                                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                        >
                                            <IconReturn className="w-3 h-3 text-rose-600" />
                                            <span>Return</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleInitiateEdit(s)}
                                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#0B3B7B] transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                        >
                                            <IconEdit className="w-3 h-3 text-[#0B3B7B]" />
                                            <span>Edit</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 2. DESKTOP / TABLET DATA TABLE (RESPONSIVE 7 COLUMNS WITH NATURAL PROPORTIONS) */}
                <div className="hidden md:block w-full p-2.5 sm:p-4 2xl:p-5 bg-slate-50/50 rounded-2xl border border-gray-200 overflow-x-auto">
                    <table className="w-full text-left text-xs 2xl:text-sm border-separate border-spacing-y-2 2xl:border-spacing-y-2.5 min-w-[960px]">
                        <thead>
                            <tr className="text-gray-500 font-bold uppercase tracking-wider text-[10px] 2xl:text-xs">
                                <th className="py-2.5 2xl:py-3.5 px-3.5 2xl:px-4 w-[15%] min-w-[125px] 2xl:min-w-[155px]">Invoice &amp; Date</th>
                                <th className="py-2.5 2xl:py-3.5 px-3.5 2xl:px-4 w-[27%] min-w-[200px] 2xl:min-w-[280px]">Customer &amp; Shop</th>
                                <th className="py-2.5 2xl:py-3.5 px-2 text-center w-[10%] min-w-[90px] 2xl:min-w-[105px]">Status</th>
                                <th className="py-2.5 2xl:py-3.5 px-3 2xl:px-4 text-right w-[11%] min-w-[95px] 2xl:min-w-[115px]">Bill Value</th>
                                <th className="py-2.5 2xl:py-3.5 px-3 2xl:px-4 text-right w-[12%] min-w-[105px] 2xl:min-w-[125px]">Net Total</th>
                                <th className="py-2.5 2xl:py-3.5 px-3 2xl:px-4 text-right w-[13%] min-w-[105px] 2xl:min-w-[125px]">Paid / Due</th>
                                <th className="py-2.5 2xl:py-3.5 px-3 2xl:px-4 text-center w-[12%] min-w-[125px] 2xl:min-w-[155px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayFeedItems.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-200">
                                        <div className="flex flex-col items-center justify-center gap-1.5">
                                            <IconReceipt className="w-8 h-8 text-[#0B3B7B]/40" />
                                            <span className="font-bold text-xs 2xl:text-sm text-gray-700">No transactions found</span>
                                            <span className="text-[10.5px] 2xl:text-xs text-gray-400">
                                                No records match the selected date &quot;{dateFilter}&quot; and status &quot;{statusFilter}&quot;.
                                            </span>
                                            {dateFilter !== 'all' && (
                                                <button
                                                    onClick={() => setDateFilter('all')}
                                                    className="px-3 2xl:px-4 py-1 2xl:py-1.5 rounded-xl text-xs 2xl:text-sm font-bold bg-[#0B3B7B] hover:bg-[#072B5C] text-white mt-2 cursor-pointer shadow-xs border border-[#0B3B7B]"
                                                >
                                                    View All Time Transactions
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayFeedItems.map((item) => {
                                    if (item.isReturn) {
                                        const r = item.ret;
                                        const isCash = r.refund_method === 'cash';
                                        return (
                                            <tr key={item.id} className="group transition-all duration-150 shadow-xs hover:shadow-md">
                                                {/* 1. CN # & Date */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 whitespace-nowrap rounded-l-2xl border-y border-l-4 border-y-rose-200/90 border-l-rose-600 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <div className="font-mono font-extrabold text-rose-900 text-xs 2xl:text-sm">
                                                        {r.cnNumber}
                                                    </div>
                                                    <div className="text-[10px] 2xl:text-xs text-rose-700/80 font-medium mt-0.5">
                                                        {parseDate(r.created_at)?.toLocaleDateString()} • {parseDate(r.created_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>

                                                {/* 2. Customer & Ref */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 border-y border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <div className="font-extrabold text-gray-900 text-xs 2xl:text-sm truncate">
                                                        {r.customer_name || 'Walk-in Customer'}
                                                    </div>
                                                    <div className="text-[10px] 2xl:text-xs text-gray-600 font-medium flex items-center gap-1.5 flex-wrap mt-0.5">
                                                        <span>{r.original_invoice_no ? `Ref: ${r.original_invoice_no}` : 'Walk-in Return (No Invoice)'}</span>
                                                        <span className="text-gray-300">•</span>
                                                        <span>by {r.cashier_name || 'admin'}</span>
                                                    </div>
                                                </td>

                                                {/* 3. Status */}
                                                <td className="py-3 2xl:py-3.5 px-2 text-center whitespace-nowrap border-y border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <span className="inline-flex items-center gap-1 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-full text-[9.5px] 2xl:text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                                                        <IconReturn className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-rose-700" />
                                                        Return
                                                    </span>
                                                    <div className="text-[9px] font-bold text-rose-700 mt-0.5">
                                                        {r.return_type === 'damaged' ? 'Damaged' : 'Saleable'}
                                                    </div>
                                                </td>

                                                {/* 4. Bill Value */}
                                                <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-right whitespace-nowrap border-y border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <span className="text-rose-400 font-mono text-xs">—</span>
                                                </td>

                                                {/* 5. Net Refund */}
                                                <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-right whitespace-nowrap border-y border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <div className="font-black text-rose-700 text-xs sm:text-[13px] 2xl:text-sm font-mono leading-none">
                                                        -Rs. {Number(r.total_refund || 0).toLocaleString()}
                                                    </div>
                                                    <div className="text-[9.5px] 2xl:text-[11px] text-rose-700 font-semibold mt-1">
                                                        {isCash ? 'Cash Refund' : 'Khata Credit'}
                                                    </div>
                                                </td>

                                                {/* 6. Paid / Due */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 text-right whitespace-nowrap text-xs 2xl:text-sm border-y border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <span className="inline-flex items-center gap-0.5 text-[9.5px] 2xl:text-xs font-extrabold text-rose-800 bg-rose-100 border border-rose-300 px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-full">
                                                        {isCash ? 'Paid Out' : 'Credited'}
                                                    </span>
                                                </td>

                                                {/* 7. Actions */}
                                                <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-center whitespace-nowrap rounded-r-2xl border-y border-r border-rose-200/90 bg-rose-50/70 group-hover:bg-rose-100/60 transition-colors">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveCreditNoteReturnId(r.return_id);
                                                            setCreditNoteModalOpen(true);
                                                        }}
                                                        className="px-2.5 py-1 text-[10px] 2xl:text-xs font-bold rounded-lg bg-purple-700 hover:bg-purple-800 text-white shadow-2xs cursor-pointer transition-all"
                                                        title="View Credit Note & Print"
                                                    >
                                                        Credit Note
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    if (item.isRecovery) {
                                        const p = item.recovery;
                                        const invTokens = extractInvoiceTokens(p.reference_no);

                                        return (
                                            <tr key={item.id} className="group transition-all duration-150 [filter:drop-shadow(0_1px_3px_rgba(16,185,129,0.1))] hover:[filter:drop-shadow(0_3px_6px_rgba(16,185,129,0.18))]">
                                                {/* 1. Reference & Date */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 whitespace-nowrap rounded-l-2xl border-y border-l-4 border-y-emerald-300/90 border-l-emerald-600 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {invTokens.length > 0 ? (
                                                            invTokens.map((invNo) => (
                                                                <button
                                                                    key={invNo}
                                                                    type="button"
                                                                    onClick={() => fetchSaleDetails(invNo, true)}
                                                                    className="font-mono font-bold text-emerald-900 hover:text-emerald-700 hover:underline text-xs 2xl:text-sm cursor-pointer px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-md bg-emerald-100 border border-emerald-300 inline-flex items-center gap-1 shadow-2xs transition-transform active:scale-95"
                                                                    title={`Click to view bill ${invNo}`}
                                                                >
                                                                    <IconEye className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-emerald-700" />
                                                                    <span>{invNo}</span>
                                                                </button>
                                                            ))
                                                        ) : p.original_sale_id ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => fetchSaleDetails(p.original_sale_id, true)}
                                                                className="font-mono font-bold text-emerald-900 hover:underline text-xs 2xl:text-sm cursor-pointer block"
                                                                title="Click to view full original bill"
                                                            >
                                                                <span className="px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-md bg-emerald-100 border border-emerald-300 inline-block shadow-2xs">
                                                                    {p.reference_no || 'FIFO Wasooli'}
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            <span className="font-mono font-bold text-emerald-900 text-xs 2xl:text-sm px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-md bg-emerald-100 border border-emerald-300 inline-block shadow-2xs">
                                                                {p.reference_no || 'FIFO Wasooli'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] 2xl:text-xs text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                                                        <IconCalendar className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-emerald-600 shrink-0" />
                                                        <span>{parseDate(item.timestamp)?.toLocaleDateString() || p.recovery_date || 'N/A'}</span>
                                                        <span className="text-emerald-400">•</span>
                                                        <span>{parseDate(item.timestamp)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Wasooli'}</span>
                                                    </div>
                                                </td>

                                                {/* 2. Customer & Settling Bill */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 border-y border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <div className="font-extrabold text-gray-900 text-xs 2xl:text-sm break-words line-clamp-1 2xl:line-clamp-none" title={p.customer_name || 'Customer'}>
                                                        {p.customer_name || 'Customer'}
                                                    </div>
                                                    {p.customer_business && (
                                                        <div className="text-[10px] 2xl:text-xs text-indigo-700 font-semibold break-words line-clamp-1 2xl:line-clamp-none mt-0.5" title={p.customer_business}>
                                                            {p.customer_business}
                                                        </div>
                                                    )}
                                                    {p.original_sale_date ? (
                                                        <div className="text-[9.5px] 2xl:text-[11px] text-emerald-800 font-semibold mt-0.5">
                                                            Settling Bill: <strong className="font-bold">{toYMD(p.original_sale_date)}</strong>
                                                        </div>
                                                    ) : (
                                                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 mt-0.5">
                                                            {p.customer_phone && <span className="font-mono">{p.customer_phone} • </span>}
                                                            <span>by {p.cashier_name || 'Cashier'}</span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 3. Status Badge */}
                                                <td className="py-3 2xl:py-3.5 px-2 text-center whitespace-nowrap border-y border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <span className="inline-flex items-center gap-1 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-full text-[9.5px] 2xl:text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                                        <IconPayments className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-emerald-700" />
                                                        Wasooli
                                                    </span>
                                                </td>

                                                {/* Bill Value (N/A for recovery voucher) */}
                                                <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-right whitespace-nowrap border-y border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <span className="text-emerald-600/60 font-mono text-xs">—</span>
                                                </td>

                                                {/* 4. Recovered Amount */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 text-right whitespace-nowrap border-y border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <div className="font-black text-emerald-700 text-xs sm:text-[13px] 2xl:text-sm font-mono leading-none">
                                                        +Rs. {Number(p.recovered_amount).toLocaleString()}
                                                    </div>
                                                    <div className="text-[9.5px] 2xl:text-[11px] text-emerald-700 font-semibold uppercase mt-1">
                                                        Via {p.payment_method || 'cash'}
                                                    </div>
                                                </td>

                                                {/* 6. Settlement Status */}
                                                <td className="py-3 2xl:py-3.5 px-3.5 2xl:px-4 text-right whitespace-nowrap text-xs 2xl:text-sm border-y border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <span className="inline-flex items-center gap-0.5 text-[9.5px] 2xl:text-xs font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-full">
                                                        Settled
                                                    </span>
                                                    {p.original_sale_net && (
                                                        <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 mt-1 font-mono">
                                                            Bill Net: Rs. {Number(p.original_sale_net).toLocaleString()}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 7. Quick Actions */}
                                                <td className="py-3 2xl:py-3.5 px-3 2xl:px-4 text-center whitespace-nowrap rounded-r-2xl border-y border-r border-emerald-300/90 bg-emerald-50/80 group-hover:bg-emerald-100/80 transition-colors">
                                                    <div className="inline-flex items-center justify-center gap-1">
                                                        {invTokens.length > 0 ? (
                                                            invTokens.length === 1 ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => fetchSaleDetails(invTokens[0], true)}
                                                                    className="px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10.5px] 2xl:text-xs font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                                                    title={`View bill ${invTokens[0]}`}
                                                                >
                                                                    <IconEye className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
                                                                    <span>Bill</span>
                                                                </button>
                                                            ) : (
                                                                <div className="flex items-center gap-1">
                                                                    {invTokens.slice(0, 2).map((invNo, idx) => (
                                                                        <button
                                                                            key={invNo}
                                                                            type="button"
                                                                            onClick={() => fetchSaleDetails(invNo, true)}
                                                                            className="px-1.5 2xl:px-2 py-1 2xl:py-1.5 text-[9.5px] 2xl:text-xs font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-0.5"
                                                                            title={`View bill ${invNo}`}
                                                                        >
                                                                            <IconEye className="w-2.5 h-2.5 2xl:w-3 2xl:h-3" />
                                                                            <span>Bill #{idx + 1}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )
                                                        ) : p.original_sale_id ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => fetchSaleDetails(p.original_sale_id, true)}
                                                                className="px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10.5px] 2xl:text-xs font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                                                title="View original settled bill / invoice"
                                                            >
                                                                <IconEye className="w-3 h-3 2xl:w-3.5 2xl:h-3.5" />
                                                                <span>Bill</span>
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedWasooli(p);
                                                                setWasooliModalOpen(true);
                                                            }}
                                                            className="px-2 2xl:px-2.5 py-1 2xl:py-1.5 text-[10.5px] 2xl:text-xs font-bold rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-300 transition-all cursor-pointer shadow-2xs"
                                                            title="View wasooli payment receipt voucher"
                                                        >
                                                            Voucher
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Regular Sales Invoice
                                    const s = item.sale;
                                    const m = item.metrics;
                                    const saleDiscount = (Number(s.discount) || 0) + (Number(s.special_discount) || 0);
                                    const rowCellBg = m.isPaidLaterAfterRange
                                        ? 'border-red-300 bg-red-100/90 group-hover:bg-red-200/70'
                                        : 'border-gray-200/90 group-hover:border-blue-200 bg-white group-hover:bg-blue-50/40';

                                    return (
                                        <tr key={s.id} className="group transition-all duration-150 [filter:drop-shadow(0_1px_3px_rgba(11,59,123,0.06))] hover:[filter:drop-shadow(0_4px_8px_rgba(11,59,123,0.12))]">
                                            {/* 1. Invoice # & Date */}
                                            <td className={`py-3 2xl:py-3.5 px-3.5 2xl:px-4 whitespace-nowrap rounded-l-2xl border-y ${m.isPaidLaterAfterRange ? 'border-l-4 border-l-red-600' : 'border-l'} ${rowCellBg} transition-colors`}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-bold text-[#0B3B7B] text-xs 2xl:text-sm px-2 2xl:px-2.5 py-0.5 2xl:py-1 rounded-md bg-blue-50 border border-blue-200 inline-block shadow-2xs">
                                                        {s.invoice_no}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] 2xl:text-xs text-gray-500 font-medium mt-1 flex items-center gap-1">
                                                    <IconCalendar className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-gray-400 shrink-0" />
                                                    <span>{parseDate(s.created_at)?.toLocaleDateString() || 'N/A'}</span>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="text-gray-400">{parseDate(s.created_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}</span>
                                                </div>
                                            </td>

                                            {/* 2. Customer & Shop */}
                                            <td className={`py-3 2xl:py-3.5 px-3.5 2xl:px-4 border-y ${rowCellBg} transition-colors`}>
                                                <div className="font-extrabold text-gray-900 text-xs 2xl:text-sm break-words line-clamp-1 2xl:line-clamp-none" title={s.customer_name || 'Walk-in Customer'}>
                                                    {s.customer_name || 'Walk-in Customer'}
                                                </div>
                                                {s.customer_business && (
                                                    <div className="text-[10px] 2xl:text-xs text-[#0B3B7B] font-semibold break-words line-clamp-1 2xl:line-clamp-none mt-0.5" title={s.customer_business}>
                                                        {s.customer_business}
                                                    </div>
                                                )}
                                                <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-0.5 flex items-center gap-1">
                                                    {s.customer_phone && <span className="font-mono text-gray-500">{s.customer_phone} •</span>}
                                                    <span>by <strong className="text-gray-600 font-semibold">{s.cashier_name || 'Admin'}</strong></span>
                                                </div>
                                            </td>

                                            {/* 3. Status Badge */}
                                            <td className={`py-3 2xl:py-3.5 px-2 text-center whitespace-nowrap border-y ${rowCellBg} transition-colors`}>
                                                <div className="flex flex-col items-center gap-1">
                                                    {m.displayStatus === 'PAID' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-full text-[9.5px] 2xl:text-xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                                                            <IconCheck className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-emerald-600" />
                                                            Paid
                                                        </span>
                                                    )}
                                                    {m.displayStatus === 'PARTIAL' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-full text-[9.5px] 2xl:text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                            Partial
                                                        </span>
                                                    )}
                                                    {m.displayStatus === 'PENDING' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 2xl:px-3 py-0.5 2xl:py-1 rounded-full text-[9.5px] 2xl:text-xs font-extrabold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                                                            <IconWarning className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 text-rose-600" />
                                                            Pending
                                                        </span>
                                                    )}
                                                    {m.isSettledLater && (
                                                        <span
                                                            className={`text-[8.5px] 2xl:text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                                m.isPaidLaterAfterRange
                                                                    ? 'text-rose-900 bg-rose-100 border-rose-300'
                                                                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                            }`}
                                                            title={`Paid later on ${m.settledLaterLabel || m.settledDate || 'subsequent date'}`}
                                                        >
                                                            Paid later{m.settledLaterLabel ? `: ${m.settledLaterLabel}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 4. Bill Value (Gross Total) */}
                                            <td className={`py-3 2xl:py-3.5 px-3 2xl:px-4 text-right whitespace-nowrap border-y ${rowCellBg} transition-colors`}>
                                                <div className="font-bold text-gray-800 text-xs sm:text-[13px] 2xl:text-sm font-mono leading-none">
                                                    Rs. {(Number(s.gross_amount) || Number(s.total_amount) || (Number(s.net_amount) + saleDiscount)).toLocaleString()}
                                                </div>
                                                <div className="text-[9.5px] 2xl:text-[11px] text-gray-400 font-medium mt-1">
                                                    Gross Bill
                                                </div>
                                            </td>

                                            {/* 5. Net Total & Discount */}
                                            <td className={`py-3 2xl:py-3.5 px-3 2xl:px-4 text-right whitespace-nowrap border-y ${rowCellBg} transition-colors`}>
                                                <div className="font-black text-gray-900 text-xs sm:text-[13px] 2xl:text-sm font-mono leading-none">
                                                    Rs. {Number(s.net_amount).toLocaleString()}
                                                </div>
                                                {saleDiscount > 0 ? (
                                                    <div className="text-[9.5px] 2xl:text-[11px] text-amber-700 font-bold mt-1">
                                                        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded inline-block">
                                                            -Rs. {saleDiscount.toLocaleString()}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="text-[9.5px] 2xl:text-[11px] text-gray-300 font-medium mt-0.5">No disc</div>
                                                )}
                                            </td>

                                            {/* 6. Paid / Due */}
                                            <td className={`py-3 2xl:py-3.5 px-3.5 2xl:px-4 text-right whitespace-nowrap text-xs 2xl:text-sm border-y ${rowCellBg} transition-colors`}>
                                                <div className="font-bold text-emerald-700 font-mono text-xs 2xl:text-sm">
                                                    Paid: Rs. {Number(m.displayPaid).toLocaleString()}
                                                </div>
                                                {m.displayDue > 0 ? (
                                                    <div className="text-[11px] 2xl:text-xs font-black text-rose-600 font-mono mt-0.5">
                                                        Due: Rs. {Number(m.displayDue).toLocaleString()}
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] 2xl:text-xs text-gray-400 font-semibold mt-0.5">
                                                        Due: Rs. 0
                                                    </div>
                                                )}
                                            </td>

                                            {/* 7. Quick Actions */}
                                            <td className={`py-3 2xl:py-3.5 px-3 2xl:px-4 text-center whitespace-nowrap rounded-r-2xl border-y border-r ${rowCellBg} transition-colors`}>
                                                <div className="inline-flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => fetchSaleDetails(s.id, true)}
                                                        className="px-2 2xl:px-3 py-1 2xl:py-1.5 text-[10.5px] 2xl:text-xs font-bold rounded-lg bg-[#0B3B7B] hover:bg-[#072B5C] text-white border border-[#0B3B7B] transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                                        title="View full invoice"
                                                    >
                                                        <IconEye className="w-3 h-3 2xl:w-3.5 2xl:h-3.5 text-white" />
                                                        <span>View</span>
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            const fullSale = await fetchSaleDetails(s.id, false);
                                                            if (fullSale) {
                                                                setSelectedSale(fullSale);
                                                                setThermalModalOpen(true);
                                                            }
                                                        }}
                                                        className="p-1 2xl:p-1.5 text-[10.5px] 2xl:text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700 transition-all inline-flex items-center justify-center cursor-pointer shadow-2xs"
                                                        title="Thermal receipt"
                                                    >
                                                        <IconReceipt className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-600" />
                                                    </button>
                                                    <button
                                                        onClick={() => openReturnModal(s)}
                                                        className="p-1 2xl:p-1.5 text-[10.5px] 2xl:text-xs font-semibold rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-all inline-flex items-center justify-center cursor-pointer shadow-2xs"
                                                        title="Customer return"
                                                    >
                                                        <IconReturn className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-rose-600" />
                                                    </button>

                                                    {/* 3-DOTS MENU BUTTON */}
                                                    <div className="relative inline-block text-left">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleMoreClick(e, s.id)}
                                                            className="p-1 2xl:p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-all text-gray-600 hover:text-black cursor-pointer flex items-center justify-center shadow-2xs"
                                                            title="More options (Admin Edit)"
                                                        >
                                                            <IconDotsVertical className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                                                        </button>

                                                        {activeMenuId === s.id && (
                                                            <div
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute right-0 mt-1 w-36 2xl:w-40 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 text-left"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleInitiateEdit(s)}
                                                                    className="w-full text-left px-3 py-2 text-[11px] 2xl:text-xs font-bold text-gray-800 hover:bg-blue-50 hover:text-[#0B3B7B] flex items-center justify-between gap-1.5 cursor-pointer transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-1.5">
                                                                        <IconEdit className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-gray-500" />
                                                                        <span>Edit Sale</span>
                                                                    </div>
                                                                    <span className="text-[9px] 2xl:text-[10px] text-[#0B3B7B] font-bold bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                                                                        PIN
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>


                {/* PAGINATION CONTROLS BAR */}
                <div className="p-2.5 sm:p-3 2xl:p-4 bg-white border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs 2xl:text-sm">
                    {/* Left: Range and total count info */}
                    <div className="flex items-center gap-2 text-gray-600 text-[11px] 2xl:text-xs font-medium">
                        {feedType === 'WASOOLI' ? (
                            <span>
                                Showing <strong className="text-gray-900 font-bold">{activeRecoveredDues.length}</strong> dues recovery records
                            </span>
                        ) : activeRecoveredDues.length > 0 && feedType === 'ALL' ? (
                            <span>
                                Showing <strong className="text-gray-900 font-bold">{displayFeedItems.length}</strong> transactions (<strong className="text-gray-900 font-bold">{paginatedSales.length}</strong> invoices, <strong className="text-emerald-700 font-bold">{activeRecoveredDues.length}</strong> dues recovered)
                            </span>
                        ) : (
                            <span>
                                Showing <strong className="text-gray-900 font-bold">{startItemIndex}</strong> to <strong className="text-gray-900 font-bold">{endItemIndex}</strong> of <strong className="text-gray-900 font-bold">{totalServerSales}</strong> invoices
                            </span>
                        )}
                        {(statusFilter !== 'ALL' || searchQuery || dateFilter !== 'all') && (
                            <span className="text-[10px] 2xl:text-xs text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                                (period: {dateFilter.replace('_', ' ')})
                            </span>
                        )}
                    </div>

                    {/* Right: Rows per page selector + Page Jump Buttons */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {/* Rows per page dropdown */}
                        <div className="flex items-center gap-1.5 text-[11px] 2xl:text-xs text-gray-600">
                            <span className="text-gray-400 font-medium">Per page:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="px-2 2xl:px-2.5 py-1 2xl:py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs 2xl:text-sm font-bold text-gray-800 outline-none cursor-pointer transition-colors"
                            >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                            </select>
                        </div>

                        {/* Page navigation controls */}
                        <div className="flex items-center gap-1">
                            {/* First Page */}
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={validCurrentPage <= 1}
                                className={`p-1.5 2xl:p-2 rounded-lg border text-xs 2xl:text-sm transition-all ${validCurrentPage <= 1
                                    ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                    }`}
                                title="First Page"
                            >
                                <IconChevronDoubleLeft className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>

                            {/* Previous Page */}
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={validCurrentPage <= 1}
                                className={`p-1.5 2xl:p-2 rounded-lg border text-xs 2xl:text-sm transition-all ${validCurrentPage <= 1
                                    ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                    }`}
                                title="Previous Page"
                            >
                                <IconChevronLeft className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>

                            {/* Page Numbers */}
                            <div className="flex items-center gap-1 px-1">
                                {getPageNumbers(validCurrentPage, totalPages).map((p, idx) => {
                                    if (p === '...') {
                                        return (
                                            <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 text-xs 2xl:text-sm font-bold select-none">
                                                ...
                                            </span>
                                        );
                                    }
                                    const isActive = p === validCurrentPage;
                                    return (
                                        <button
                                            key={`page-${p}`}
                                            onClick={() => setCurrentPage(p)}
                                            className={`min-w-[28px] 2xl:min-w-[34px] h-7 2xl:h-8.5 px-1.5 2xl:px-2 rounded-lg text-xs 2xl:text-sm font-bold transition-all cursor-pointer ${isActive
                                                ? 'bg-[#0B3B7B] text-white font-extrabold shadow-2xs border border-[#0B3B7B]'
                                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:text-[#0B3B7B]'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Next Page */}
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={validCurrentPage >= totalPages}
                                className={`p-1.5 2xl:p-2 rounded-lg border text-xs 2xl:text-sm transition-all ${validCurrentPage >= totalPages
                                    ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                    }`}
                                title="Next Page"
                            >
                                <IconChevronRight className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>

                            {/* Last Page */}
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={validCurrentPage >= totalPages}
                                className={`p-1.5 2xl:p-2 rounded-lg border text-xs 2xl:text-sm transition-all ${validCurrentPage >= totalPages
                                    ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                    }`}
                                title="Last Page"
                            >
                                <IconChevronDoubleRight className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 1. REUSABLE WHOLESALE A4 BILL MODAL */}
            <WholesaleA4InvoiceModal
                isOpen={invoiceModalOpen}
                onClose={() => setInvoiceModalOpen(false)}
                invoice={selectedSale}
                settings={settings}
                prevBalance={prevBalance}
                newBalance={newBalance}
                onOpenThermal={() => setThermalModalOpen(true)}
                onPrintA4={() => handlePrintInvoice('a4')}
                onDownloadPdf={handleDownloadA4PDF}
                onSendWhatsApp={handleSendSaleBillWhatsApp}
                waSending={waSending}
                downloadingPdf={downloadingPdf}
                elemId="printable-invoice-a4"
            />

            {/* 2. REUSABLE 80mm THERMAL RECEIPT MODAL */}
            <ThermalReceipt
                isOpen={thermalModalOpen}
                onClose={() => setThermalModalOpen(false)}
                invoice={selectedSale}
                settings={settings}
                cashierName={selectedSale?.created_by_name || selectedSale?.cashier_name || user?.full_name || user?.username || 'Cashier'}
                prevBalance={prevBalance}
                newBalance={newBalance}
                onOpenA4={() => {
                    setThermalModalOpen(false);
                    setInvoiceModalOpen(true);
                }}
                onPrint={() => handlePrintInvoice('thermal')}
                elemId="printable-invoice-thermal"
            />

            {/* SALES RETURN MODAL (Walk-in No-Invoice F5 + Invoice-linked Return) */}
            {returnModalOpen && (returnMode === 'walkin' || selectedSale) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <form onSubmit={handleSubmitReturn} className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl my-8 border border-gray-200 max-h-[94vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b pb-3">
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                                    <IconReturn className="w-5 h-5 text-purple-700" />
                                    <span>{returnMode === 'walkin' ? 'Walk-in Sales Return (No Invoice)' : 'Process Customer Sales Return'}</span>
                                </h3>
                                <div className="text-xs text-[#0B3B7B] font-bold mt-0.5">
                                    {returnMode === 'walkin'
                                        ? 'Direct Walk-in Return • Search any product (sugar, Aata, cartons, packets, pcs)'
                                        : `Invoice: ${selectedSale.invoice_no} • ${selectedSale.customer_name || 'Walk-in'}`}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setReturnModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            {/* Walk-in Product Search Box */}
                            {returnMode === 'walkin' && (
                                <div className="space-y-2">
                                    <label className="block font-bold text-gray-700">
                                        Search &amp; Select Returned Product
                                    </label>
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Search by product name or SKU (e.g. sugar, Aata, bottle)..."
                                        value={returnProductSearch}
                                        onChange={(e) => setReturnProductSearch(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-semibold bg-white focus:outline-none focus:border-purple-600"
                                    />
                                    {returnProductSearch.trim().length > 0 && (
                                        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white shadow-sm">
                                            {(() => {
                                                const q = returnProductSearch.trim().toLowerCase();
                                                const matches = returnCatalogProducts.filter(p =>
                                                    (p.product_name || '').toLowerCase().includes(q)
                                                    || (p.variant_name || '').toLowerCase().includes(q)
                                                    || (p.sku || '').toLowerCase().includes(q)
                                                ).slice(0, 15);
                                                if (matches.length === 0) {
                                                    return <div className="p-3 text-center text-gray-400">No matching products found.</div>;
                                                }
                                                return matches.map((prod) => {
                                                    const defPack = (prod.packagings || []).find(pk => pk.is_default) || (prod.packagings || [])[0];
                                                    const currSell = defPack ? Number(defPack.selling_price || 0) : Number(prod.selling_price || 0);
                                                    return (
                                                        <button
                                                            key={prod.variant_id}
                                                            type="button"
                                                            onClick={() => {
                                                                handleAddWalkinReturnProduct(prod);
                                                                setReturnProductSearch('');
                                                            }}
                                                            className="w-full text-left px-3 py-2 hover:bg-purple-50 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                                        >
                                                            <div>
                                                                <div className="font-bold text-gray-900">
                                                                    {prod.product_name} {prod.variant_name && prod.variant_name !== 'Standard' ? `(${prod.variant_name})` : ''}
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 font-mono">
                                                                    SKU: {prod.sku || '-'} • Current Rate: <strong className="text-emerald-700">Rs. {currSell.toLocaleString()}</strong> ({defPack?.packaging_name || prod.unit_symbol || 'PCS'})
                                                                </div>
                                                            </div>
                                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md font-bold text-[10px] shrink-0">
                                                                + Add
                                                            </span>
                                                        </button>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">Return Condition &amp; Restock Policy</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`p-3 rounded-2xl border flex items-center gap-2 cursor-pointer font-bold transition-all ${returnType === 'saleable' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-gray-50 text-gray-700'
                                        }`}>
                                        <input
                                            type="radio"
                                            name="returnType"
                                            value="saleable"
                                            checked={returnType === 'saleable'}
                                            onChange={() => setReturnType('saleable')}
                                        />
                                        <span>Restock (Saleable Stock)</span>
                                    </label>
                                    <label className={`p-3 rounded-2xl border flex items-center gap-2 cursor-pointer font-bold transition-all ${returnType === 'damaged' ? 'bg-rose-50 border-rose-400 text-rose-800' : 'bg-gray-50 text-gray-700'
                                        }`}>
                                        <input
                                            type="radio"
                                            name="returnType"
                                            value="damaged"
                                            checked={returnType === 'damaged'}
                                            onChange={() => setReturnType('damaged')}
                                        />
                                        <span>Damaged / Lost Stock</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <div className="font-bold text-gray-800 mb-2">
                                    {returnMode === 'walkin' ? 'Returned Items, Packaging & Current Selling Price:' : 'Select Items & Quantities to Return:'}
                                </div>
                                {returnItems.length === 0 ? (
                                    <div className="p-4 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-gray-400">
                                        Search and add products above to process a Walk-in Return.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {returnItems.map((it, idx) => (
                                            <div key={idx} className="bg-gray-50 p-3 rounded-2xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                                <div className="min-w-0">
                                                    <div className="font-extrabold text-gray-900 truncate">
                                                        {it.product_name} {it.variant_name && it.variant_name !== 'Standard' ? `(${it.variant_name})` : ''}
                                                    </div>
                                                    {returnMode === 'invoice' ? (
                                                        <div className="text-[11px] text-gray-500 font-medium">
                                                            Sold: {it.sold_quantity ?? it.max_quantity} {it.packaging_name}
                                                            {Number(it.already_returned) > 0 && (
                                                                <> • <span className="text-rose-600 font-bold">Returned: {it.already_returned}</span> • <span className="text-emerald-700 font-bold">Remaining: {it.max_quantity}</span></>
                                                            )}
                                                            {' '}@ Rs. {it.unit_price}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            {(it.packagings && it.packagings.length > 1) ? (
                                                                <select
                                                                    value={it.packaging_type_id}
                                                                    onChange={(e) => handleUpdateWalkinReturnItem(idx, 'packaging_type_id', e.target.value)}
                                                                    className="px-2 py-1 border border-gray-300 rounded-lg bg-white font-bold text-[11px] text-[#0B3B7B]"
                                                                >
                                                                    {it.packagings.map(pk => (
                                                                        <option key={pk.packaging_type_id || pk.id} value={pk.packaging_type_id || pk.id}>
                                                                            {pk.packaging_name} (x{pk.conversion_factor})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10.5px] font-bold text-gray-700">
                                                                    {it.packaging_name}
                                                                </span>
                                                            )}
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[10.5px] text-gray-500">Rate Rs.</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    value={it.unit_price}
                                                                    onChange={(e) => handleUpdateWalkinReturnItem(idx, 'unit_price', e.target.value)}
                                                                    className="w-20 p-1 border border-gray-300 rounded-lg bg-white font-bold text-right text-gray-900 text-[11px]"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 justify-end">
                                                    <span className="text-gray-500 font-medium">Return:</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        max={returnMode === 'invoice' ? it.max_quantity : undefined}
                                                        value={it.return_quantity}
                                                        onChange={(e) => returnMode === 'invoice'
                                                            ? handleUpdateReturnQty(idx, e.target.value)
                                                            : handleUpdateWalkinReturnItem(idx, 'return_quantity', e.target.value)
                                                        }
                                                        className="w-16 p-1.5 border rounded-xl bg-white font-extrabold text-center text-rose-700 focus:border-rose-500 outline-none"
                                                    />
                                                    {returnMode === 'walkin' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveWalkinReturnItem(idx)}
                                                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                                            title="Remove item"
                                                        >
                                                            <IconClose className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {returnMode === 'walkin' && (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                    <input
                                        type="text"
                                        placeholder="Optional note (e.g. Walk-in customer returned 2 packets)"
                                        value={returnRemarks}
                                        onChange={(e) => setReturnRemarks(e.target.value)}
                                        className="flex-1 p-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-purple-500"
                                    />
                                    <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer font-bold text-gray-800 shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={autoPrintReturnThermal}
                                            onChange={(e) => setAutoPrintReturnThermal(e.target.checked)}
                                            className="accent-purple-700"
                                        />
                                        <IconPrinter className="w-3.5 h-3.5 text-purple-700" />
                                        <span>Print Thermal Receipt</span>
                                    </label>
                                </div>
                            )}

                            {/* REFUND SETTLEMENT METHOD (KHATA VS CASH DRAWER) */}
                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">
                                    Refund Settlement Method / کھاتہ یا کیش کا فیصلہ
                                </label>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div
                                        onClick={() => setRefundMethod('credit')}
                                        className={`p-3 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${refundMethod === 'credit'
                                            ? 'bg-blue-50/80 border-blue-400 text-gray-900 shadow-xs ring-1 ring-blue-400'
                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="refundMethod"
                                                value="credit"
                                                checked={refundMethod === 'credit'}
                                                onChange={() => setRefundMethod('credit')}
                                                className="accent-[#0B3B7B] cursor-pointer"
                                            />
                                            <span className="font-extrabold text-xs text-gray-900">
                                                Adjust Khata / Store Credit
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5 leading-tight">
                                            Dues reduce / Advance Credit banega. Counter drawer cash par koi asar nahi hoga.
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => setRefundMethod('cash')}
                                        className={`p-3 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${refundMethod === 'cash'
                                            ? 'bg-emerald-50 border-emerald-500 text-gray-900 shadow-xs ring-1 ring-emerald-500'
                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="refundMethod"
                                                value="cash"
                                                checked={refundMethod === 'cash'}
                                                onChange={() => setRefundMethod('cash')}
                                                className="accent-emerald-600 cursor-pointer"
                                            />
                                            <span className="font-extrabold text-xs text-emerald-900">
                                                Cash Refund from Drawer
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5 leading-tight">
                                            Counter se cash wapis diya. Aaj ki net cash collection se Rs. {refundAmount.toLocaleString()} kam hogi.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* TOTAL REFUND SUMMARY BANNER */}
                            <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 flex justify-between items-center text-xs font-bold">
                                <div>
                                    <div className="text-gray-800 font-extrabold">Total Return Value:</div>
                                    <div className="text-[10px] text-rose-700 font-normal">
                                        {refundMethod === 'credit' ? 'Credited to Customer Khata' : 'Deducted from Counter Drawer Cash'}
                                    </div>
                                </div>
                                <span className="text-base text-rose-700 font-extrabold font-mono">
                                    Rs. {refundAmount.toLocaleString()}
                                </span>
                            </div>

                            {/* DYNAMIC BALANCE & CASH IMPACT PREVIEW */}
                            {selectedSale && refundAmount > 0 && (
                                <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 space-y-1.5 text-xs">
                                    <div className="font-extrabold text-gray-800 flex justify-between items-center text-[11px]">
                                        <span>Financial Impact Preview:</span>
                                        <span className="text-[10px] font-bold text-gray-500">
                                            {refundMethod === 'credit' ? 'Khata Adjustment Mode' : 'Cash Drawer Outflow Mode'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200 text-[11px]">
                                        <div>
                                            <span className="text-gray-500 block">Customer Khata Balance:</span>
                                            {refundMethod === 'credit' ? (
                                                <div className="font-bold">
                                                    <span className="line-through text-gray-400 mr-1.5">
                                                        Rs. {Number(selectedSale.current_customer_balance || 0).toLocaleString()}
                                                    </span>
                                                    <span className={`font-mono ${(Number(selectedSale.current_customer_balance || 0) - refundAmount) < 0
                                                        ? 'text-emerald-700 font-extrabold'
                                                        : 'text-gray-900'
                                                        }`}>
                                                        {(Number(selectedSale.current_customer_balance || 0) - refundAmount) < 0
                                                            ? `Rs. -${Math.abs(Number(selectedSale.current_customer_balance || 0) - refundAmount).toLocaleString()} (Advance)`
                                                            : `Rs. ${(Number(selectedSale.current_customer_balance || 0) - refundAmount).toLocaleString()}`}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="font-bold text-gray-700">
                                                    Rs. {Number(selectedSale.current_customer_balance || 0).toLocaleString()} (Unchanged)
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-gray-500 block">Today's Cash Drawer Impact:</span>
                                            {refundMethod === 'cash' ? (
                                                <div className="font-bold text-rose-700 font-mono">
                                                    - Rs. {refundAmount.toLocaleString()} (Paid Out)
                                                </div>
                                            ) : (
                                                <div className="font-bold text-emerald-700">
                                                    Rs. 0 (Drawer Untouched)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setReturnModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-2.5 rounded-xl font-extrabold text-xs bg-[#0B3B7B] hover:bg-[#072B5C] text-white shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                            >
                                Confirm Sales Return
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ADMIN AUTHORIZATION MODAL */}
            {adminAuthModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-gray-200">
                        <div className="text-center space-y-2">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-[#0B3B7B] flex items-center justify-center mx-auto text-xl font-bold shadow-xs">
                                <IconShield className="w-6 h-6 text-[#0B3B7B]" />
                            </div>
                            <h3 className="font-extrabold text-base text-gray-900">Admin Authorization</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Only administrators are permitted to edit completed wholesale sales. Please enter Admin PIN or password.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Admin Password / PIN</label>
                            <input
                                type="password"
                                value={adminAuthPin}
                                onChange={(e) => setAdminAuthPin(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerifyAdminPin()}
                                className="w-full p-2.5 rounded-xl border border-gray-300 font-bold text-center tracking-widest text-base focus:ring-2 focus:ring-[#0B3B7B] outline-none"
                                placeholder="••••••••"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => { setAdminAuthModalOpen(false); setPendingEditSale(null); }}
                                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleVerifyAdminPin}
                                className="flex-1 py-2.5 rounded-xl bg-[#0B3B7B] hover:bg-[#072B5C] text-white font-bold text-xs shadow-md hover:opacity-95 active:scale-95 transition-all cursor-pointer"
                            >
                                Authorize &amp; Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WASOOLI / DUES RECOVERY VOUCHER MODAL */}
            {wasooliModalOpen && selectedWasooli && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-emerald-100 max-h-[92vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                                    <IconPayments className="w-5 h-5 text-emerald-700" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-sm text-gray-900 leading-tight">Wasooli / Dues Recovery Voucher</h3>
                                    <p className="text-[10px] text-gray-400 font-medium">Customer Payment Receipt</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setWasooliModalOpen(false)}
                                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 flex items-center justify-center transition-all cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Printable / Visual Voucher Card */}
                        <div className="bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 border border-emerald-200 rounded-2xl p-4 space-y-3.5">
                            {/* Voucher Top Row */}
                            <div className="flex items-center justify-between text-xs">
                                <div>
                                    <span className="text-[9.5px] uppercase font-bold text-gray-400 tracking-wider">Voucher #</span>
                                    <div className="font-mono font-bold text-emerald-900">
                                        #WAS-{selectedWasooli.payment_id}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9.5px] uppercase font-bold text-gray-400 tracking-wider">Date & Time</span>
                                    <div className="font-medium text-gray-700">
                                        {parseDate(selectedWasooli.payment_created_at || selectedWasooli.recovery_date)?.toLocaleString() || selectedWasooli.recovery_date}
                                    </div>
                                </div>
                            </div>

                            {/* Customer Information */}
                            <div className="bg-white border border-gray-200/80 rounded-xl p-3 space-y-1">
                                <span className="text-[9.5px] uppercase font-bold text-gray-400 tracking-wider block">Customer Received From</span>
                                <div className="font-extrabold text-sm text-gray-900">
                                    {selectedWasooli.customer_name || 'Customer'}
                                </div>
                                {selectedWasooli.customer_business && (
                                    <div className="text-xs text-indigo-700 font-semibold">
                                        {selectedWasooli.customer_business}
                                    </div>
                                )}
                                {selectedWasooli.customer_phone && (
                                    <div className="text-[11px] text-gray-500 font-mono">
                                        Phone: {selectedWasooli.customer_phone}
                                    </div>
                                )}
                            </div>

                            {/* Recovered Cash Box */}
                            <div className="bg-emerald-500/10 border border-emerald-300 rounded-xl p-3.5 text-center space-y-1">
                                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">Recovered Amount (Wasooli)</span>
                                <div className="text-2xl font-black text-emerald-700 tracking-tight">
                                    Rs. {Number(selectedWasooli.recovered_amount).toLocaleString()}
                                </div>
                                <div className="text-[10.5px] text-emerald-800 font-medium italic">
                                    {numberToWords(selectedWasooli.recovered_amount)}
                                </div>
                            </div>

                            {/* Payment Method, Settlement & Cashier */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white border border-gray-200 rounded-lg p-2">
                                    <span className="text-[9px] uppercase font-bold text-gray-400 block">Payment Mode</span>
                                    <span className="font-bold text-gray-800 uppercase">{selectedWasooli.payment_method || 'CASH'}</span>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-lg p-2">
                                    <span className="text-[9px] uppercase font-bold text-gray-400 block">Received By (Cashier)</span>
                                    <span className="font-bold text-gray-800">{selectedWasooli.cashier_name || 'Cashier'}</span>
                                </div>
                            </div>

                            {/* Reference Bill & Notes */}
                            <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9.5px] uppercase font-bold text-gray-400">Settled Invoice Reference:</span>
                                    <span className="font-mono font-bold text-emerald-800">{selectedWasooli.reference_no || 'FIFO Debt Settlement'}</span>
                                </div>
                                {selectedWasooli.notes && (
                                    <div className="text-[10.5px] text-gray-600 pt-1 border-t border-gray-100">
                                        <span className="font-semibold text-gray-500">Note: </span>{selectedWasooli.notes}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 w-full">
                            {extractInvoiceTokens(selectedWasooli.reference_no).length > 0 ? (
                                extractInvoiceTokens(selectedWasooli.reference_no).map((invNo) => (
                                    <button
                                        key={invNo}
                                        type="button"
                                        onClick={() => {
                                            setWasooliModalOpen(false);
                                            fetchSaleDetails(invNo, true);
                                        }}
                                        className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                                    >
                                        <IconEye className="w-3.5 h-3.5" />
                                        <span>View Bill ({invNo})</span>
                                    </button>
                                ))
                            ) : selectedWasooli.original_sale_id ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWasooliModalOpen(false);
                                        fetchSaleDetails(selectedWasooli.original_sale_id, true);
                                    }}
                                    className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                                >
                                    <IconEye className="w-3.5 h-3.5" />
                                    <span>View Original Bill</span>
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setWasooliModalOpen(false)}
                                className="w-full sm:w-28 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 hover:bg-gray-100 transition-all cursor-pointer text-center"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM NON-BLOCKING MODAL ALERT */}
            <CustomModalAlert
                isOpen={modalAlert.isOpen}
                type={modalAlert.type}
                title={modalAlert.title}
                message={modalAlert.message}
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
            />

            {/* OFFICIAL CREDIT NOTE MODAL (A4 PDF VIEW, PRINT, WHATSAPP) */}
            <CreditNoteModal
                isOpen={creditNoteModalOpen}
                onClose={() => setCreditNoteModalOpen(false)}
                returnId={activeCreditNoteReturnId}
                settings={settings}
            />
        </div>
    );
}
