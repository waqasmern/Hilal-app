'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { setCustomer } from '../../store';
import CustomModalAlert from '../components/CustomModalAlert';
import ThermalReceipt from '../components/ThermalReceipt';
import WholesaleA4InvoiceModal from '../components/WholesaleA4InvoiceModal';
import CreditNoteModal from '../components/CreditNoteModal';
import { triggerPrintHtml, generateThermalReceiptHtml, generateWholesaleInvoiceA4Html, truncateItemName, formatPackShort } from '../../lib/printHelper';
import { apiUrl } from '../../lib/api';
import {
    IconCustomers, IconPlus, IconSearch, IconWarning, IconCheck,
    IconClose, IconEye, IconEdit, IconTrash, IconReceipt,
    IconPrinter, IconRefresh, IconSpinner, IconBill, IconPOS,
    IconCalendar, IconPayments, IconDownload, IconWhatsApp, IconBank,
    IconChevronLeft, IconChevronRight, IconChevronDoubleLeft, IconChevronDoubleRight,
    IconDotsVertical, IconReturn
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

function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    let s = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
        s = s.replace(' ', 'T');
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(dateInput) : d;
}

function toYMD(dateInput) {
    if (!dateInput) return '';
    const str = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = parseDate(dateInput);
    if (!d || isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatOnlyDate(dateInput) {
    if (!dateInput) return '-';
    const str = String(dateInput).trim();
    if (!str) return '-';
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const d = parseDate(dateInput);
    if (!d || isNaN(d.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

function getPackagingSummary(items) {
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

export default function CustomersPage() {
    const router = useRouter();
    const dispatch = useDispatch();
    const settings = useSelector(state => state.settings);
    const { user } = useSelector(state => state.auth || {});

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

    // Main Tab Navigation: 'directory' | 'payment_history'
    const [activeMainTab, setActiveMainTab] = useState('directory');

    const [customers, setCustomers] = useState([]);
    const [payments, setPayments] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'DUE' | 'CLEAR'

    // Server-Side Pagination State for Customer Directory
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalServerCustomers, setTotalServerCustomers] = useState(0);
    const [totalServerPages, setTotalServerPages] = useState(1);
    const [tableLoading, setTableLoading] = useState(false);
    const [serverSummary, setServerSummary] = useState(null);

    // Payment History Tab Filters
    const [paymentDateFilter, setPaymentDateFilter] = useState('today'); // default select 'today'
    const [paymentStartDate, setPaymentStartDate] = useState(() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [paymentEndDate, setPaymentEndDate] = useState(() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const [paymentSearch, setPaymentSearch] = useState('');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
    const [activityTypeFilter, setActivityTypeFilter] = useState('ALL'); // 'ALL' | 'bill' | 'payment'

    // Server-Side Pagination & Data State for Payment & Bill History
    const [historyRecords, setHistoryRecords] = useState([]);
    const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
    const [historyPageSize, setHistoryPageSize] = useState(25);
    const [totalHistoryRecords, setTotalHistoryRecords] = useState(0);
    const [totalHistoryPages, setTotalHistoryPages] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySummary, setHistorySummary] = useState({
        todayCount: 0,
        totalFiltered: 0,
        periodTotalBilled: 0,
        periodPaidAmount: 0,
        periodNewPendingDues: 0,
        billsCount: 0,
        paymentsCount: 0,
        activeDebtorsCount: 0
    });

    // Selected Payment Voucher for Receipt Modal
    const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState(null);
    const [paymentReceiptModalOpen, setPaymentReceiptModalOpen] = useState(false);
    const [actionModalCustomer, setActionModalCustomer] = useState(null);

    // Custom Non-Blocking Alert / Confirm Modal
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        confirmText: 'Got It',
        cancelText: 'Cancel',
        onConfirm: null
    });

    const [waSending, setWaSending] = useState(false);
    const [downloadingStatement, setDownloadingStatement] = useState(false);
    const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
    const [selectedReturnIdForCreditNote, setSelectedReturnIdForCreditNote] = useState(null);

    const handleDownloadStatementPdf = async (customer) => {
        const cust = customer || selectedCustomer;
        if (!cust || !cust.id) return;
        setDownloadingStatement(true);
        try {
            const res = await fetch(apiUrl(`/api/customers/${cust.id}/statement-pdf`));
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to generate statement PDF');
            }
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', `${(cust.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')}_Statement.pdf`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            showAlert(`Customer Statement PDF for "${cust.name}" downloaded successfully!`, 'success', 'Statement Downloaded');
        } catch (err) {
            showAlert(err.message, 'error', 'Download Error');
        } finally {
            setDownloadingStatement(false);
        }
    };

    const handleSendWhatsAppPdf = async (customer) => {
        const cust = customer || selectedCustomer;
        if (!cust) return;
        const phone = (cust.mobile && String(cust.mobile).trim()) ||
            (cust.phone && String(cust.phone).trim()) ||
            (selectedCustomer?.mobile && String(selectedCustomer.mobile).trim()) ||
            (selectedCustomer?.phone && String(selectedCustomer.phone).trim());
        if (!phone) {
            showAlert('This customer does not have a phone number saved.', 'error', 'Missing Phone Number');
            return;
        }
        setWaSending(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/whatsapp/send-pdf'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    customer_id: cust.id,
                    phone: phone,
                    file_name: `${(cust.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}_Statement.pdf`,
                    custom_ledger: ledger && ledger.length > 0 ? ledger : null
                })
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(`Statement PDF successfully sent to ${cust.name} (${phone}) via WhatsApp!`, 'success', 'WhatsApp Statement Sent');
            } else {
                showAlert(data.error || 'Failed to send WhatsApp statement', 'error', 'WhatsApp Error');
            }
        } catch (err) {
            showAlert(err.message, 'error', 'Error');
        } finally {
            setWaSending(false);
        }
    };

    const handleSendWhatsAppReminder = async (customer) => {
        const cust = customer || selectedCustomer;
        if (!cust) return;
        const phone = cust.phone || cust.mobile;
        if (!phone) {
            showAlert('This customer does not have a phone number saved.', 'error', 'Missing Phone Number');
            return;
        }
        setWaSending(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/whatsapp/send-reminder'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    customer_id: cust.id,
                    phone: phone
                })
            });
            const data = await res.json();
            if (res.ok) {
                showAlert(`WhatsApp dues message sent to ${cust.name} (${phone})!`, 'success', 'WhatsApp Message Sent');
            } else {
                showAlert(data.error || 'Failed to send WhatsApp reminder', 'error', 'WhatsApp Error');
            }
        } catch (err) {
            showAlert(err.message, 'error', 'Error');
        } finally {
            setWaSending(false);
        }
    };

    const handleSendSaleBillWhatsApp = async (sale) => {
        if (!sale || !sale.id) return;
        const phone = (sale.customer_phone && String(sale.customer_phone).trim()) ||
            (sale.customer_mobile && String(sale.customer_mobile).trim()) ||
            (sale.phone && String(sale.phone).trim()) ||
            (selectedCustomer?.phone && String(selectedCustomer.phone).trim()) ||
            (selectedCustomer?.mobile && String(selectedCustomer.mobile).trim());
        if (!phone) {
            showAlert('Customer phone number is required to send invoice via WhatsApp.', 'error', 'Missing Phone');
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
                showAlert(`Invoice #${sale.invoice_no || sale.id} PDF sent successfully to ${sale.customer_name || selectedCustomer?.name || 'Customer'} via WhatsApp!`, 'success', 'WhatsApp Bill Sent');
            } else {
                showAlert(data.error || 'Failed to send WhatsApp bill PDF', 'error', 'WhatsApp Error');
            }
        } catch (err) {
            showAlert(err.message, 'error', 'Error');
        } finally {
            setWaSending(false);
        }
    };

    const showAlert = (message, type = 'info', title = '') => {
        setModalAlert({
            isOpen: true,
            type,
            title: title || (type === 'error' ? 'Notice / Error' : type === 'success' ? 'Success' : 'Attention'),
            message,
            confirmText: 'Got It',
            cancelText: 'Cancel',
            onConfirm: null
        });
    };

    const showConfirm = (message, onConfirm, title = 'Please Confirm') => {
        setModalAlert({
            isOpen: true,
            type: 'confirm',
            title,
            message,
            confirmText: 'Yes, Proceed',
            cancelText: 'Cancel',
            onConfirm
        });
    };

    // Selected customer for Ledger Modal
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [customerSales, setCustomerSales] = useState([]);
    const [customerReturns, setCustomerReturns] = useState([]);
    const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
    const [activeLedgerTab, setActiveLedgerTab] = useState('statement'); // 'statement' | 'bills' | 'returns' | 'payment'
    const [ledgerLoading, setLedgerLoading] = useState(false);

    // Sales Return Modal State
    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [returnSelectedSale, setReturnSelectedSale] = useState(null);
    const [returnType, setReturnType] = useState('saleable'); // 'saleable' | 'damaged'
    const [refundMethod, setRefundMethod] = useState('credit'); // 'credit' (Khata) | 'cash' (Drawer)
    const [returnItems, setReturnItems] = useState([]);
    const [refundAmount, setRefundAmount] = useState(0);
    const [returnSubmitting, setReturnSubmitting] = useState(false);

    // Selected Bill for Bill Details View
    const [selectedSaleDetail, setSelectedSaleDetail] = useState(null);
    const [saleDetailModalOpen, setSaleDetailModalOpen] = useState(false);
    const [saleDetailLoading, setSaleDetailLoading] = useState(false);
    const [thermalModalOpen, setThermalModalOpen] = useState(false);

    // Add / Edit Customer Form Modal
    const [customerModalOpen, setCustomerModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingCustomerId, setEditingCustomerId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        business_name: '',
        mobile: '',
        phone: '',
        address: 'Timergara',
        cnic_ntn: '',
        credit_limit: '0',
        opening_balance: '0'
    });

    // In-Ledger Quick Payment Form State
    const [paymentData, setPaymentData] = useState({
        amount: '',
        payment_method: 'cash',
        reference_no: '',
        payment_date: toYMD(new Date()),
        notes: ''
    });
    const [paymentSubmitting, setPaymentSubmitting] = useState(false);

    // Modal for FIFO Customer Payment
    const [payFifoModalOpen, setPayFifoModalOpen] = useState(false);
    const [payFifoForm, setPayFifoForm] = useState({
        amount: '',
        payment_method: 'cash',
        reference_no: '',
        payment_date: toYMD(new Date()),
        notes: ''
    });
    const [payFifoSubmitting, setPayFifoSubmitting] = useState(false);

    // Modal for Specific Individual Bill Payment
    const [paySpecificBillModalOpen, setPaySpecificBillModalOpen] = useState(false);
    const [selectedBillToPay, setSelectedBillToPay] = useState(null);
    const [payBillForm, setPayBillForm] = useState({
        amount: '',
        payment_method: 'cash',
        reference_no: '',
        payment_date: toYMD(new Date()),
        notes: ''
    });
    const [payBillSubmitting, setPayBillSubmitting] = useState(false);

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchCustomers(currentPage, pageSize, searchQuery, filterStatus),
                fetchHistory(1, historyPageSize, paymentDateFilter, paymentStartDate, paymentEndDate, activityTypeFilter, paymentMethodFilter, paymentSearch)
            ]);
        } catch (err) {
            console.error('Failed loading customers/history:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomers = async (
        page = currentPage,
        limit = pageSize,
        search = searchQuery,
        status = filterStatus
    ) => {
        try {
            setTableLoading(true);
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                paginate: 'true'
            });
            if (search && search.trim()) params.append('search', search.trim());
            if (status && status !== 'ALL') params.append('status', status);

            const res = await fetch(apiUrl(`/api/customers?${params.toString()}`));
            if (res.ok) {
                const result = await res.json();
                if (result && result.pagination) {
                    setCustomers(result.data || result.customers || []);
                    setTotalServerCustomers(result.pagination.total);
                    setTotalServerPages(result.pagination.totalPages);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (result && (result.data || result.customers)) {
                    const list = result.data || result.customers || [];
                    setCustomers(list);
                    setTotalServerCustomers(result.total ?? result.pagination?.total ?? list.length);
                    setTotalServerPages(result.totalPages ?? result.pagination?.totalPages ?? 1);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (Array.isArray(result)) {
                    // Graceful fallback for unpaginated backend
                    const q = (search || '').toLowerCase().trim();
                    const filtered = result.filter(c => {
                        const matchesQuery = !q ||
                            (c.name && c.name.toLowerCase().includes(q)) ||
                            (c.business_name && c.business_name.toLowerCase().includes(q)) ||
                            (c.mobile && c.mobile.includes(q)) ||
                            (c.phone && c.phone.includes(q)) ||
                            (c.address && c.address.toLowerCase().includes(q)) ||
                            (c.cnic_ntn && c.cnic_ntn.includes(q));
                        if (!matchesQuery) return false;
                        if (status === 'DUE') return (c.balance || 0) > 0;
                        if (status === 'CLEAR') return (c.balance || 0) <= 0;
                        if (status === 'CREDIT') return (c.balance || 0) < 0;
                        return true;
                    });
                    setTotalServerCustomers(filtered.length);
                    setTotalServerPages(Math.max(1, Math.ceil(filtered.length / limit)));
                    const start = (page - 1) * limit;
                    setCustomers(filtered.slice(start, start + limit));

                    const totalReceivables = result.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
                    const totalAdvances = result.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
                    const dueCount = result.filter(c => c.balance > 0).length;
                    const clearCount = result.filter(c => c.balance <= 0).length;
                    setServerSummary({
                        totalCustomers: result.length,
                        totalReceivables,
                        totalAdvances,
                        dueCustomersCount: dueCount,
                        clearCustomersCount: clearCount,
                        totalCreditLimit: result.reduce((sum, c) => sum + (parseFloat(c.credit_limit) || 0), 0),
                        totalDuesPaidAllTime: 0
                    });
                }
            }
        } catch (err) {
            console.error('Failed to load customers:', err);
        } finally {
            setTableLoading(false);
        }
    };

    // Auto-fetch with 200ms debounce on customer directory search, filter, or page change
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchCustomers(currentPage, pageSize, searchQuery, filterStatus);
        }, 200);
        return () => clearTimeout(handler);
    }, [searchQuery, filterStatus, currentPage, pageSize]);

    const fetchHistoryFallback = async (
        page = currentHistoryPage,
        limit = historyPageSize,
        dateF = paymentDateFilter,
        startD = paymentStartDate,
        endD = paymentEndDate,
        typeF = activityTypeFilter,
        methodF = paymentMethodFilter,
        searchQ = paymentSearch
    ) => {
        try {
            const [paymentsRes, salesRes] = await Promise.all([
                fetch(apiUrl('/api/payments')),
                fetch(apiUrl('/api/sales'))
            ]);

            const rawPayments = paymentsRes.ok ? await paymentsRes.json() : [];
            const rawSales = salesRes.ok ? await salesRes.json() : [];

            const pList = Array.isArray(rawPayments) ? rawPayments : (rawPayments.data || []);
            const sList = Array.isArray(rawSales) ? rawSales : (rawSales.data || []);

            const billRecords = sList
                .filter(s => s.customer_id)
                .map(s => {
                    const itemDate = s.created_at || '';
                    const ymd = toYMD(itemDate);
                    return {
                        type: 'bill',
                        id: `bill-${s.id}`,
                        rawId: s.id,
                        date: itemDate,
                        ymd,
                        ref_no: s.invoice_no || `INV-${s.id}`,
                        customer_id: s.customer_id,
                        party_name: s.customer_name || s.customers?.name || 'Wholesale Client',
                        party_business: s.customer_business || s.customers?.business_name || '',
                        party_phone: s.customer_phone || s.customers?.phone || '',
                        payment_method: s.payment_method || 'credit',
                        net_amount: parseFloat(s.net_amount) || 0,
                        amount_paid: parseFloat(s.amount_paid) || 0,
                        remaining_balance: parseFloat(s.remaining_balance) || 0,
                        notes: s.remarks || (s.remaining_balance > 0 ? `Unpaid Due: Rs. ${Math.round(s.remaining_balance).toLocaleString()}` : 'Invoice Fully Cleared'),
                        raw: s
                    };
                });

            const paymentRecords = pList
                .filter(p => p.party_type === 'customer' || !p.party_type)
                .map(p => {
                    const itemDate = p.payment_date || p.created_at || '';
                    const ymd = toYMD(itemDate);
                    return {
                        type: 'payment',
                        id: `pay-${p.id}`,
                        rawId: p.id,
                        date: itemDate,
                        ymd,
                        ref_no: p.reference_no || `RCP-${String(p.id).padStart(5, '0')}`,
                        customer_id: p.party_id,
                        party_name: p.party_name || p.customers?.name || 'Wholesale Client',
                        party_business: p.party_business || p.customers?.business_name || '',
                        party_phone: p.party_phone || p.customers?.phone || '',
                        payment_method: p.payment_method || 'cash',
                        net_amount: 0,
                        amount_paid: parseFloat(p.amount) || 0,
                        remaining_balance: 0,
                        notes: p.notes || 'Customer ledger payment received',
                        raw: p
                    };
                });

            const allUnified = [...billRecords, ...paymentRecords].sort((a, b) => {
                const da = parseDate(a.date)?.getTime() || 0;
                const db = parseDate(b.date)?.getTime() || 0;
                return db - da;
            });

            const todayYMD = toYMD(new Date());
            const todayCount = allUnified.filter(r => r.ymd === todayYMD).length;

            const filtered = allUnified.filter(item => {
                if (dateF === 'today') {
                    if (item.ymd !== todayYMD) return false;
                } else if (dateF === 'yesterday') {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    if (item.ymd !== toYMD(y)) return false;
                } else if (dateF === 'this_week') {
                    const w = new Date();
                    w.setDate(w.getDate() - 7);
                    const weekAgo = toYMD(w);
                    if (!item.ymd || item.ymd < weekAgo || item.ymd > todayYMD) return false;
                } else if (dateF === 'this_month') {
                    const mStart = `${todayYMD.slice(0, 7)}-01`;
                    if (!item.ymd || item.ymd < mStart || item.ymd > todayYMD) return false;
                } else if (dateF === 'custom') {
                    if (startD && item.ymd < startD) return false;
                    if (endD && item.ymd > endD) return false;
                }

                if (typeF && typeF !== 'ALL' && item.type !== typeF.toLowerCase()) return false;
                if (methodF && methodF !== 'ALL' && item.payment_method?.toLowerCase() !== methodF.toLowerCase()) return false;
                if (searchQ && searchQ.trim()) {
                    const q = searchQ.trim().toLowerCase();
                    const pN = (item.party_name || '').toLowerCase();
                    const pB = (item.party_business || '').toLowerCase();
                    const ref = (item.ref_no || '').toLowerCase();
                    const note = (item.notes || '').toLowerCase();
                    if (!pN.includes(q) && !pB.includes(q) && !ref.includes(q) && !note.includes(q)) return false;
                }
                return true;
            });

            const periodBills = filtered.filter(r => r.type === 'bill');
            const periodPayments = filtered.filter(r => r.type === 'payment');
            const periodTotalBilled = periodBills.reduce((s, b) => s + b.net_amount, 0);
            const periodPaidAmount = filtered.reduce((s, r) => s + r.amount_paid, 0);
            const periodNewPendingDues = periodBills.reduce((s, b) => s + b.remaining_balance, 0);

            const offset = (page - 1) * limit;
            const paginated = filtered.slice(offset, offset + limit);

            setHistoryRecords(paginated);
            setTotalHistoryRecords(filtered.length);
            setTotalHistoryPages(Math.max(1, Math.ceil(filtered.length / limit)));
            setHistorySummary({
                todayCount,
                totalFiltered: filtered.length,
                periodTotalBilled,
                periodPaidAmount,
                periodNewPendingDues,
                billsCount: periodBills.length,
                paymentsCount: periodPayments.length,
                activeDebtorsCount: customers.filter(c => (c.balance || 0) > 0).length
            });
        } catch (err) {
            console.error('Fallback fetchHistory failed:', err);
        }
    };

    const fetchHistory = async (
        page = currentHistoryPage,
        limit = historyPageSize,
        dateF = paymentDateFilter,
        startD = paymentStartDate,
        endD = paymentEndDate,
        typeF = activityTypeFilter,
        methodF = paymentMethodFilter,
        searchQ = paymentSearch
    ) => {
        setHistoryLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                dateFilter: dateF,
                type: typeF,
                paymentMethod: methodF
            });
            if (dateF === 'custom') {
                if (startD) params.append('startDate', startD);
                if (endD) params.append('endDate', endD);
            }
            if (searchQ && searchQ.trim()) {
                params.append('search', searchQ.trim());
            }

            const res = await fetch(apiUrl(`/api/customers/history?${params.toString()}`));
            if (res.ok) {
                const result = await res.json();
                setHistoryRecords(result.data || []);
                if (result.pagination) {
                    setTotalHistoryRecords(result.pagination.total);
                    setTotalHistoryPages(Math.max(1, result.pagination.totalPages));
                }
                if (result.summary) {
                    setHistorySummary(result.summary);
                }
            } else {
                console.warn('Server history endpoint returned non-ok, using fallback:', res.status);
                await fetchHistoryFallback(page, limit, dateF, startD, endD, typeF, methodF, searchQ);
            }
        } catch (err) {
            console.error('Failed to load customer payment & bill history, using fallback:', err);
            await fetchHistoryFallback(page, limit, dateF, startD, endD, typeF, methodF, searchQ);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Auto-fetch with 200ms debounce on customer payment/bill history filters, search, or page change
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchHistory(
                currentHistoryPage,
                historyPageSize,
                paymentDateFilter,
                paymentStartDate,
                paymentEndDate,
                activityTypeFilter,
                paymentMethodFilter,
                paymentSearch
            );
        }, 200);
        return () => clearTimeout(handler);
    }, [
        currentHistoryPage,
        historyPageSize,
        paymentDateFilter,
        paymentStartDate,
        paymentEndDate,
        activityTypeFilter,
        paymentMethodFilter,
        paymentSearch
    ]);

    const fetchPayments = async () => {
        await fetchHistory();
    };

    const fetchSales = async () => {
        await fetchHistory();
    };

    // Open Ledger Modal for a customer
    const handleOpenLedger = async (customer) => {
        setSelectedCustomer(customer);
        setLedgerModalOpen(true);
        setActiveLedgerTab('statement');
        setPaymentData({
            amount: customer.balance > 0 ? String(customer.balance) : '',
            payment_method: 'cash',
            reference_no: '',
            payment_date: toYMD(new Date()),
            notes: `Payment from ${customer.name}`
        });
        await fetchCustomerLedgerData(customer.id);
    };

    const fetchCustomerLedgerData = async (customerId) => {
        setLedgerLoading(true);
        try {
            const res = await fetch(apiUrl(`/api/customers/${customerId}/ledger`));
            if (res.ok) {
                const data = await res.json();
                setSelectedCustomer(data.customer);
                setLedger(data.ledger || []);
                setCustomerSales(data.sales || []);
                setCustomerReturns(data.returns || []);
            }
        } catch (err) {
            console.error('Failed to load customer ledger:', err);
        } finally {
            setLedgerLoading(false);
        }
    };

    // Sales Return & Credit Note Handlers
    const handleOpenReturn = async (sale) => {
        if (!sale) return;
        try {
            setReturnSelectedSale(sale);
            const res = await fetch(apiUrl(`/api/sales/${sale.id}`));
            if (res.ok) {
                const fullSale = await res.json();
                const initialReturnItems = (fullSale.items || []).map(it => ({
                    variant_id: it.variant_id,
                    packaging_type_id: it.packaging_type_id,
                    product_name: it.product_name,
                    variant_name: it.variant_name,
                    packaging_name: it.packaging_name,
                    max_quantity: it.quantity,
                    return_quantity: 0,
                    unit_price: it.price,
                    conversion_factor: 1
                }));
                setReturnItems(initialReturnItems);
                setRefundAmount(0);
                setRefundMethod('credit');
                setReturnType('saleable');
                setReturnModalOpen(true);
            } else {
                showAlert('Return Error', 'Failed to load sale bill items for return.', 'error');
            }
        } catch (err) {
            showAlert('Return Error', 'Failed to initialize return items: ' + err.message, 'error');
        }
    };

    const handleUpdateReturnQty = (idx, qty) => {
        const updated = [...returnItems];
        const val = Math.min(updated[idx].max_quantity, Math.max(0, parseFloat(qty) || 0));
        updated[idx].return_quantity = val;
        setReturnItems(updated);

        const total = updated.reduce((sum, it) => sum + (it.return_quantity * it.unit_price), 0);
        setRefundAmount(total);
    };

    const handleSubmitReturn = async (e) => {
        e.preventDefault();
        const activeItems = returnItems.filter(it => it.return_quantity > 0).map(it => ({
            variant_id: it.variant_id,
            packaging_type_id: it.packaging_type_id,
            quantity: it.return_quantity,
            refund_price: it.unit_price,
            conversion_factor: it.conversion_factor
        }));

        if (activeItems.length === 0 || refundAmount <= 0) {
            return showAlert('Attention Required', 'Please select quantity for at least one item to return.', 'warning');
        }

        setReturnSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const localDateTime = `${localDate} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            const res = await fetch(apiUrl('/api/sales/returns'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    sale_id: returnSelectedSale.id,
                    customer_id: selectedCustomer ? selectedCustomer.id : returnSelectedSale.customer_id,
                    return_type: returnType,
                    refund_method: refundMethod,
                    items: activeItems,
                    total_refund: refundAmount,
                    remarks: `Customer return for invoice ${returnSelectedSale.invoice_no} (${refundMethod === 'cash' ? 'Cash Refund' : 'Khata Adjustment'})`,
                    payment_date: localDate,
                    created_at: localDateTime
                })
            });

            if (res.ok) {
                const data = await res.json();
                setReturnModalOpen(false);
                if (selectedCustomer) {
                    await fetchCustomerLedgerData(selectedCustomer.id);
                }
                await fetchCustomers();
                
                if (data.returnId) {
                    setSelectedReturnIdForCreditNote(data.returnId);
                    setCreditNoteModalOpen(true);
                } else {
                    showAlert('Return Successful', `Sales Return processed successfully! Refund Amount: Rs. ${refundAmount.toLocaleString()}`, 'success');
                }
            } else {
                const data = await res.json();
                showAlert('Return Failed', data.error || 'Failed to process return.', 'error');
            }
        } catch (err) {
            showAlert('Connection Error', err.message, 'error');
        } finally {
            setReturnSubmitting(false);
        }
    };

    // Open Add Customer Modal
    const handleOpenAddCustomer = () => {
        setIsEditing(false);
        setEditingCustomerId(null);
        setFormData({
            name: '',
            business_name: '',
            mobile: '',
            phone: '',
            address: 'Timergara',
            cnic_ntn: '',
            credit_limit: '0',
            opening_balance: '0'
        });
        setCustomerModalOpen(true);
    };

    // Open Edit Customer Modal
    const handleOpenEditCustomer = (customer, e) => {
        if (e) e.stopPropagation();
        setIsEditing(true);
        setEditingCustomerId(customer.id);
        setFormData({
            name: customer.name || '',
            business_name: customer.business_name || '',
            mobile: customer.mobile || '',
            phone: customer.phone || '',
            address: customer.address || 'Timergara',
            cnic_ntn: customer.cnic_ntn || '',
            credit_limit: String(customer.credit_limit || 0),
            opening_balance: String(customer.opening_balance || 0)
        });
        setCustomerModalOpen(true);
    };

    // Save Customer (Create or Update)
    const handleSaveCustomer = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const url = isEditing
                ? apiUrl(`/api/customers/${editingCustomerId}`)
                : apiUrl('/api/customers');
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.name.trim(),
                    business_name: formData.business_name.trim(),
                    mobile: formData.mobile.trim(),
                    phone: formData.phone.trim(),
                    address: formData.address.trim(),
                    cnic_ntn: formData.cnic_ntn.trim(),
                    credit_limit: parseFloat(formData.credit_limit) || 0,
                    opening_balance: parseFloat(formData.opening_balance) || 0
                })
            });

            if (res.ok) {
                setCustomerModalOpen(false);
                await fetchCustomers();
                if (isEditing && selectedCustomer?.id === editingCustomerId) {
                    await fetchCustomerLedgerData(editingCustomerId);
                }
                showAlert(isEditing ? 'Customer profile updated successfully!' : 'New customer registered successfully!', 'success');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to save customer', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // Delete Customer (Soft-delete: preserves historical invoices and ledgers)
    const handleDeleteCustomer = (customer, e) => {
        if (e) e.stopPropagation();
        showConfirm(
            `Are you sure you want to remove customer "${customer.name}"?\n\nThis will remove the customer from active views. Previous sales invoices and payment receipts will remain completely safe in history.`,
            async () => {
                try {
                    const token = localStorage.getItem('token');
                    const headers = {};
                    if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

                    const res = await fetch(apiUrl(`/api/customers/${customer.id}`), {
                        method: 'DELETE',
                        headers
                    });
                    if (res.ok) {
                        if (selectedCustomer?.id === customer.id) {
                            setLedgerModalOpen(false);
                        }
                        await fetchCustomers();
                        showAlert(`Customer "${customer.name}" soft-deleted successfully. Active KPI counts updated.`, 'success');
                    } else {
                        const data = await res.json();
                        showAlert(data.error || 'Failed to delete customer', 'error');
                    }
                } catch (err) {
                    showAlert(err.message, 'error');
                }
            },
            'Confirm Customer Deletion'
        );
    };

    // Submit Payment in Customer Ledger
    const handleSubmitPayment = async (e) => {
        e.preventDefault();
        const amt = parseFloat(paymentData.amount);
        if (!amt || amt <= 0) return showAlert('Please enter a valid payment amount', 'warning');

        setPaymentSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/payments'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    party_type: 'customer',
                    party_id: selectedCustomer.id,
                    amount: amt,
                    payment_method: paymentData.payment_method,
                    reference_no: paymentData.reference_no,
                    payment_date: paymentData.payment_date,
                    notes: paymentData.notes || `Payment received from ${selectedCustomer.name}`
                })
            });

            if (res.ok) {
                showAlert(`Payment of Rs. ${amt.toLocaleString()} recorded successfully!`, 'success', 'Payment Recorded');
                await fetchCustomerLedgerData(selectedCustomer.id);
                await fetchCustomers();
                await fetchPayments();
                setActiveLedgerTab('statement');
                setPaymentData({
                    amount: '',
                    payment_method: 'cash',
                    reference_no: '',
                    payment_date: toYMD(new Date()),
                    notes: ''
                });
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to record payment', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setPaymentSubmitting(false);
        }
    };

    // Redirect to POS with Customer pre-selected
    const handleStartNewBill = (customer) => {
        dispatch(setCustomer(customer));
        router.push('/pos');
    };

    // View Individual Sale Bill Details
    const handleViewSaleBill = async (saleId) => {
        setSaleDetailLoading(true);
        setSaleDetailModalOpen(true);
        try {
            const res = await fetch(apiUrl(`/api/sales/${saleId}`));
            if (res.ok) {
                const data = await res.json();
                setSelectedSaleDetail(data);
            }
        } catch (err) {
            console.error('Failed to load bill details:', err);
        } finally {
            setSaleDetailLoading(false);
        }
    };

    // Open Dedicated 80mm Thermal Receipt Slip for a Sale Bill
    const handleOpenThermalSlip = async (saleOrId) => {
        if (typeof saleOrId === 'object' && saleOrId !== null && saleOrId.items) {
            setSelectedSaleDetail(saleOrId);
            setThermalModalOpen(true);
        } else {
            const saleId = typeof saleOrId === 'object' ? saleOrId.id : saleOrId;
            setSaleDetailLoading(true);
            setThermalModalOpen(true);
            try {
                const res = await fetch(apiUrl(`/api/sales/${saleId}`));
                if (res.ok) {
                    const data = await res.json();
                    setSelectedSaleDetail(data);
                }
            } catch (err) {
                console.error('Failed to load bill for thermal slip:', err);
            } finally {
                setSaleDetailLoading(false);
            }
        }
    };

    // Print Sale Bill (either 80mm Thermal Slip or Standard A4 Wholesale Invoice)
    const handlePrintSaleBill = async (format = 'a4') => {
        const isThermal = format === 'thermal';
        const a4Printer = (settings?.selected_a4_printer || '').trim();
        const thermalPrinter = (settings?.selected_printer || '').trim();
        const isThermalTarget = isThermal || ((!a4Printer || a4Printer === 'same_as_thermal') && 
            /pos|80|receipt|thermal|blackcopper|xp-|xprinter|rpp/i.test(thermalPrinter));

        const targetPrinter = !isThermal && a4Printer && a4Printer !== 'same_as_thermal' ? a4Printer : thermalPrinter;
        const isSilent = settings?.silent_print === 'true' && targetPrinter !== 'os_dialog';

        if (!selectedSaleDetail) return;

        const prevBal = selectedSaleDetail.current_customer_balance !== undefined
            ? (parseFloat(selectedSaleDetail.current_customer_balance) - (parseFloat(selectedSaleDetail.remaining_balance) || 0))
            : (selectedCustomer?.balance !== undefined ? (parseFloat(selectedCustomer.balance) - (parseFloat(selectedSaleDetail.remaining_balance) || 0)) : 0);
        const newBal = selectedSaleDetail.current_customer_balance !== undefined
            ? parseFloat(selectedSaleDetail.current_customer_balance)
            : (prevBal + (parseFloat(selectedSaleDetail.remaining_balance) || 0));

        let htmlContent = '';
        if (isThermalTarget) {
            htmlContent = generateThermalReceiptHtml(
                selectedSaleDetail,
                settings,
                selectedSaleDetail.created_by_name || selectedSaleDetail.cashier_name || user?.full_name || user?.username || 'Cashier',
                prevBal,
                newBal
            );
        } else {
            htmlContent = generateWholesaleInvoiceA4Html(
                selectedSaleDetail,
                settings,
                prevBal,
                newBal
            );
        }

        await triggerPrintHtml(htmlContent, {
            silent: isSilent,
            printerName: targetPrinter !== 'os_dialog' ? targetPrinter : '',
            format: isThermalTarget ? 'thermal' : 'a4'
        });
    };

    // Print Customer Payment Recovery Voucher
    const handlePrintPaymentReceipt = async () => {
        const printElem = document.getElementById('printable-payment-receipt');
        if (!printElem) {
            window.print();
            return;
        }

        const html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${(settings?.shop_name || 'Hilal Wholesaler')} - Payment Receipt</title>
            <style>
                @page { size: auto; margin: 8mm 10mm; }
                * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body {
                    margin: 0 auto;
                    padding: 12px;
                    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
                    font-size: 12px;
                    color: #000;
                    background: #fff;
                    max-width: 480px;
                    line-height: 1.4;
                }
                table { width: 100%; border-collapse: collapse; }
            </style>
        </head>
        <body>
            ${printElem.innerHTML}
        </body>
        </html>`;

        await triggerPrintHtml(html, { silent: false, format: 'a4' });
    };

    // Open FIFO Customer Payment Modal
    const handleOpenReceivePayment = (customer) => {
        const cust = customer || selectedCustomer;
        if (!cust) return;
        setSelectedCustomer(cust);
        setPayFifoForm({
            amount: cust.balance > 0 ? String(Math.round(cust.balance)) : '',
            payment_method: 'cash',
            reference_no: '',
            payment_date: toYMD(new Date()),
            notes: `FIFO payment received from ${cust.name}`
        });
        setPayFifoModalOpen(true);
    };

    // Submit FIFO Customer Payment
    const handleSubmitFifoPay = async (e) => {
        e.preventDefault();
        const amt = parseFloat(payFifoForm.amount);
        if (!amt || amt <= 0) {
            showAlert('Please enter a valid positive payment amount.', 'warning');
            return;
        }

        setPayFifoSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl(`/api/customers/${selectedCustomer.id}/pay-fifo`), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    amount: amt,
                    payment_method: payFifoForm.payment_method,
                    reference_no: payFifoForm.reference_no,
                    payment_date: payFifoForm.payment_date,
                    notes: payFifoForm.notes || `FIFO Payment from ${selectedCustomer.name}`
                })
            });

            const data = await res.json();
            if (res.ok) {
                setPayFifoModalOpen(false);
                await fetchCustomerLedgerData(selectedCustomer.id);
                await fetchCustomers();
                await fetchPayments();
                await fetchSales();
                const settledCount = data.settledBills ? data.settledBills.length : 0;
                showAlert(
                    `FIFO Payment of Rs. ${amt.toLocaleString()} received successfully! ${settledCount > 0 ? `${settledCount} oldest bill(s) paid down.` : 'Credited to customer ledger.'}`,
                    'success',
                    'FIFO Payment Recorded'
                );
            } else {
                showAlert(data.error || 'Failed to record FIFO payment', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setPayFifoSubmitting(false);
        }
    };

    // Open Pay Specific Bill Modal
    const handleOpenPaySpecificBill = (sale) => {
        setSelectedBillToPay(sale);
        setPayBillForm({
            amount: String(sale.remaining_balance || 0),
            payment_method: 'cash',
            reference_no: sale.invoice_no,
            payment_date: toYMD(new Date()),
            notes: `Payment for Invoice ${sale.invoice_no}`
        });
        setPaySpecificBillModalOpen(true);
    };

    // Submit Pay Specific Bill
    const handleSubmitPaySpecificBill = async (e) => {
        e.preventDefault();
        if (!selectedBillToPay) return;
        const amt = parseFloat(payBillForm.amount);
        const remaining = parseFloat(selectedBillToPay.remaining_balance) || 0;

        if (!amt || amt <= 0) {
            showAlert('Please enter a valid positive payment amount.', 'warning');
            return;
        }

        if (amt > remaining + 0.01) {
            showAlert(`Payment amount (Rs. ${amt.toLocaleString()}) cannot exceed remaining bill balance (Rs. ${remaining.toLocaleString()}).`, 'warning');
            return;
        }

        setPayBillSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl(`/api/sales/${selectedBillToPay.id}/pay`), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    amount: amt,
                    payment_method: payBillForm.payment_method,
                    reference_no: payBillForm.reference_no,
                    payment_date: payBillForm.payment_date,
                    notes: payBillForm.notes || `Payment for Invoice ${selectedBillToPay.invoice_no}`
                })
            });

            const data = await res.json();
            if (res.ok) {
                setPaySpecificBillModalOpen(false);
                if (selectedCustomer) {
                    await fetchCustomerLedgerData(selectedCustomer.id);
                }
                await fetchCustomers();
                await fetchPayments();
                await fetchSales();
                showAlert(
                    `Payment of Rs. ${amt.toLocaleString()} recorded for Bill ${data.invoice_no}! Remaining bill balance: Rs. ${Number(data.remaining_balance).toLocaleString()}`,
                    'success',
                    'Bill Payment Recorded'
                );
            } else {
                showAlert(data.error || 'Failed to pay bill', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            setPayBillSubmitting(false);
        }
    };

    // Active Customer Directory slice (Server-Side Paginated)
    const filteredCustomers = customers;
    const paginatedCustomers = customers;
    const totalPages = Math.max(1, totalServerPages);
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startCustomerIndex = totalServerCustomers === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
    const endCustomerIndex = Math.min(validCurrentPage * pageSize, totalServerCustomers);

    // Customer Directory KPIs (Warehouse-wide global metrics from serverSummary)
    const totalCustomersCount = serverSummary?.totalCustomers ?? (totalServerCustomers || customers.length);
    const totalReceivables = serverSummary?.totalReceivables ?? customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
    const customersWithDueCount = serverSummary?.dueCustomersCount ?? customers.filter(c => c.balance > 0).length;
    const clearedCustomersCount = serverSummary?.clearCustomersCount ?? customers.filter(c => c.balance <= 0).length;
    const totalDuesPaidAllTime = (serverSummary?.totalDuesPaidAllTime && serverSummary.totalDuesPaidAllTime > 0)
        ? serverSummary.totalDuesPaidAllTime
        : 0;

    // Server-Side Paginated Payment & Bill History references
    const allHistoryRecords = historyRecords;
    const filteredHistory = historyRecords;

    const periodTotalBilled = historySummary?.periodTotalBilled || 0;
    const periodPaidAmount = historySummary?.periodPaidAmount || 0;
    const periodNewPendingDues = historySummary?.periodNewPendingDues || 0;

    const getPeriodLabel = () => {
        if (paymentDateFilter === 'today') return 'Today (Daily)';
        if (paymentDateFilter === 'yesterday') return 'Yesterday';
        if (paymentDateFilter === 'this_week') return 'This Week';
        if (paymentDateFilter === 'this_month') return 'This Month';
        if (paymentDateFilter === 'all') return 'All Time';
        if (paymentDateFilter === 'custom') return `${paymentStartDate || 'Start'} to ${paymentEndDate || 'Today'}`;
        return 'Selected Period';
    };

    // In-Ledger Modal KPI Calculations
    const totalBilled = ledger.filter(r => r.type === 'charge').reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalPaymentsReceived = ledger.filter(r => r.type === 'payment').reduce((sum, r) => sum + (r.amount || 0), 0);
    const khataReturnsCredit = ledger.filter(r => r.type === 'return' && r.payment_method !== 'cash' && !r.description?.includes('Cash Refund') && !r.is_cash_refund).reduce((sum, r) => sum + (r.amount || 0), 0);
    const cashRefundsTotal = ledger.filter(r => r.type === 'return' && (r.payment_method === 'cash' || r.description?.includes('Cash Refund') || r.is_cash_refund)).reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalReturnsCredit = khataReturnsCredit;
    const totalReturnsAll = cashRefundsTotal + khataReturnsCredit;
    // Net total paid amount (Payments received minus cash refunds, plus store credit returns)
    const totalPaid = Math.max(0, (totalPaymentsReceived - cashRefundsTotal) + khataReturnsCredit);
    const totalCreditsApplied = totalPaymentsReceived + khataReturnsCredit;
    const currentBalance = selectedCustomer?.balance || 0;
    const availableCredit = (selectedCustomer?.credit_limit || 0) - currentBalance;

    return (
        <div className="space-y-6 pb-12">
            {/* TOP HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-[#F3E5AB] shadow-xs">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <IconCustomers className="w-6 h-6 text-[#B8860B]" />
                        <span>Wholesale Customer Ledgers & Accounts</span>
                    </h1>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                        Manage Wholesale Directory, Running Ledgers, Invoices & Payment Recovery History
                    </p>
                </div>
                <button
                    onClick={handleOpenAddCustomer}
                    className="px-4 py-2.5 gold-gradient text-white rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                    <IconPlus className="w-4 h-4" />
                    <span>Add New Wholesale Customer</span>
                </button>
            </div>

            {/* MAIN NAVIGATION TABS */}
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3">
                <button
                    onClick={() => setActiveMainTab('directory')}
                    className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2.5 transition-all cursor-pointer ${activeMainTab === 'directory'
                        ? 'bg-black text-white shadow-md'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                >
                    <IconCustomers className="w-4 h-4" />
                    <span>Customer Directory & Ledgers</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeMainTab === 'directory' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                        {totalCustomersCount}
                    </span>
                </button>

                <button
                    onClick={() => setActiveMainTab('payment_history')}
                    className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2.5 transition-all cursor-pointer ${activeMainTab === 'payment_history'
                        ? 'bg-black text-white shadow-md'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                >
                    <IconReceipt className="w-4 h-4" />
                    <span>Payment & Bill History</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeMainTab === 'payment_history' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                        title="Daily count of bills & payments recorded today"
                    >
                        {historySummary?.todayCount ?? 0}
                    </span>
                </button>
            </div>

            {/* TAB 1: CUSTOMER DIRECTORY & LEDGERS */}
            {activeMainTab === 'directory' && (
                <div className="space-y-6">
                    {/* CUSTOMER DIRECTORY KPI CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* KPI 1: Total Wholesale Customers */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Wholesale Customers</span>
                                <div className="p-2 rounded-xl bg-[#FEF9E7] text-[#B8860B]">
                                    <IconCustomers className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-gray-900">
                                {totalCustomersCount}
                            </div>
                            <div className="text-[11px] text-gray-500 font-medium">Registered active accounts</div>
                        </div>

                        {/* KPI 2: Total Market Receivables / Pending Dues */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Total Pending Dues</span>
                                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                                    <IconReceipt className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-rose-600 tracking-tight">
                                Rs. {Math.round(totalReceivables).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-rose-700 font-medium">Outstanding market dues</div>
                        </div>

                        {/* KPI 3: Total Dues Paid / Recovered (All-Time) */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Total Dues Paid / Recovered</span>
                                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                                    <IconPayments className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-emerald-700 tracking-tight">
                                Rs. {Math.round(totalDuesPaidAllTime).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-800 font-medium">Total customer dues collected</div>
                        </div>

                        {/* KPI 4: Active Debtors with Pending Balance */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Active Debtors</span>
                                <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                                    <IconWarning className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-amber-700">
                                {customersWithDueCount} Accounts
                            </div>
                            <div className="text-[11px] text-amber-800 font-medium">Accounts with pending balances</div>
                        </div>
                    </div>

                    {/* SEARCH & STATUS FILTER BAR */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-white p-3.5 rounded-2xl border border-[#F3E5AB] shadow-xs">
                        <div className="relative w-full md:w-80">
                            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by customer name, shop, phone..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setCurrentPage(1);
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                                    title="Clear search"
                                >
                                    <IconClose className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs font-bold">
                            <button
                                onClick={() => {
                                    setFilterStatus('ALL');
                                    setCurrentPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterStatus === 'ALL'
                                    ? 'bg-black text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                All ({totalCustomersCount})
                            </button>
                            <button
                                onClick={() => {
                                    setFilterStatus('DUE');
                                    setCurrentPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterStatus === 'DUE'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                Pending Balance ({customersWithDueCount})
                            </button>
                            <button
                                onClick={() => {
                                    setFilterStatus('CLEAR');
                                    setCurrentPage(1);
                                }}
                                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterStatus === 'CLEAR'
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                Cleared (Rs. 0) ({clearedCustomersCount})
                            </button>
                        </div>
                    </div>

                    {/* WHOLESALE CUSTOMERS TABLE */}
                    <div className="bg-white rounded-2xl border border-[#F3E5AB] shadow-xs overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                                    <span>Wholesale Customer Directory & Accounts</span>
                                    {tableLoading && (
                                        <IconSpinner className="w-3.5 h-3.5 animate-spin text-[#B8860B]" />
                                    )}
                                </h2>
                                <p className="text-[11px] text-gray-400">Click any customer row to open their full statement, bills, and ledger actions</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                                    {totalServerCustomers} Accounts
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto lg:overflow-x-visible w-full px-4 pt-3 pb-2">
                            <table className="w-full text-left text-xs border-separate border-spacing-y-2.5">
                                <thead>
                                    <tr className="text-gray-500 font-bold uppercase tracking-wider text-[10.5px]">
                                        <th className="pb-1 px-3.5">Customer & Wholesale Shop</th>
                                        <th className="pb-1 px-2.5 min-w-[105px]">Credit Facility</th>
                                        <th className="pb-1 px-2.5 min-w-[110px] text-right">Current Balance</th>
                                        <th className="pb-1 px-2.5 min-w-[90px] text-center">Status</th>
                                        <th className="pb-1 px-3 min-w-[140px] text-center">Quick Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableLoading && paginatedCustomers.length === 0 ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <tr key={`skel-${i}`} className="animate-pulse">
                                                <td colSpan={5} className="py-5 px-4 bg-gray-50/70 rounded-xl border border-gray-200">
                                                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                                                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                                                </td>
                                            </tr>
                                        ))
                                    ) : paginatedCustomers.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-14 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                                                <IconCustomers className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                                                <div className="font-bold text-gray-700 text-sm">No wholesale customers found</div>
                                                <div className="text-xs text-gray-400 mt-0.5">
                                                    {searchQuery || filterStatus !== 'ALL'
                                                        ? 'Try adjusting your search query or filter'
                                                        : 'Click "+ Add New Wholesale Customer" to create your first client account.'}
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedCustomers.map((c) => {
                                            const bal = parseFloat(c.balance) || 0;
                                            const isOwing = bal > 0;
                                            const isAdvance = bal < 0;

                                            // Avatar initials
                                            const initials = c.name
                                                ? c.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                                                : 'CU';

                                            return (
                                                <tr
                                                    key={c.id}
                                                    onClick={() => handleOpenLedger(c)}
                                                    className="bg-white hover:bg-amber-50/25 border border-gray-200/90 hover:border-[#D4AF37]/60 rounded-xl transition-all shadow-2xs hover:shadow-xs group cursor-pointer"
                                                >
                                                    {/* Column 1: Customer & Wholesale Shop (Unified) */}
                                                    <td className="py-2.5 px-3.5 rounded-l-xl border-y border-l border-gray-200/80 group-hover:border-[#D4AF37]/50 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FEF9E7] to-[#FDF4D1] border border-[#F3E5AB] flex items-center justify-center font-black text-xs text-[#B8860B] shrink-0 shadow-2xs">
                                                                {initials}
                                                            </div>
                                                            <div className="space-y-0.5 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-gray-900 text-sm group-hover:text-[#B8860B] transition-colors truncate">
                                                                        {c.name}
                                                                    </span>
                                                                    <span className="px-1.5 py-0.2 rounded bg-[#FEF9E7] border border-[#F3E5AB] text-[9.5px] font-bold text-[#B8860B] truncate max-w-[130px]">
                                                                        {c.business_name || 'Wholesale Client'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                                                    <span className="font-semibold text-gray-700">{c.mobile || c.phone || 'No phone'}</span>
                                                                    <span>•</span>
                                                                    <span className="text-gray-400 truncate max-w-[130px]">{c.address || 'Timergara, KP'}</span>
                                                                    {c.cnic_ntn ? (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1 rounded font-medium">NTN: {c.cnic_ntn}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="text-[10px] text-gray-400 font-medium">ID: #{c.id}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Column 2: Credit Facility */}
                                                    <td className="py-2.5 px-2.5 border-y border-gray-200/80 group-hover:border-[#D4AF37]/50 transition-colors">
                                                        <div className="space-y-0.5">
                                                            <div className="text-xs font-black text-gray-800 tracking-tight">
                                                                Rs. {Number(c.credit_limit || 0).toLocaleString()}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 font-medium">
                                                                {c.credit_limit > 0 ? (
                                                                    isOwing ? (
                                                                        <span className="text-amber-700 font-semibold">
                                                                            {Math.min(100, Math.round((bal / c.credit_limit) * 100))}% utilized
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-emerald-700 font-semibold">100% available</span>
                                                                    )
                                                                ) : (
                                                                    'Standard account'
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Column 3: Current Balance */}
                                                    <td className="py-2.5 px-2.5 text-right border-y border-gray-200/80 group-hover:border-[#D4AF37]/50 transition-colors">
                                                        <div className={`font-black text-sm tracking-tight ${
                                                            isOwing ? 'text-rose-600' : isAdvance ? 'text-blue-600' : 'text-emerald-700'
                                                        }`}>
                                                            Rs. {Number(Math.abs(bal)).toLocaleString()}
                                                        </div>
                                                        <div className="text-[10px] font-medium mt-0.5">
                                                            {isOwing ? (
                                                                <span className="text-rose-600 font-semibold">Outstanding Due</span>
                                                            ) : isAdvance ? (
                                                                <span className="text-blue-600 font-semibold">Advance Credit</span>
                                                            ) : (
                                                                <span className="text-emerald-700 font-semibold">Fully Cleared</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Column 4: Status */}
                                                    <td className="py-2.5 px-2.5 text-center border-y border-gray-200/80 group-hover:border-[#D4AF37]/50 transition-colors">
                                                        {isOwing ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                                Pending Due
                                                            </span>
                                                        ) : isAdvance ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                                                Advance
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                                                <IconCheck className="w-3 h-3 text-emerald-600" />
                                                                Cleared
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Column 5: Quick Actions with 3-dot Menu at end */}
                                                    <td className="py-2.5 px-3 text-center rounded-r-xl border-y border-r border-gray-200/80 group-hover:border-[#D4AF37]/50 transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {/* 1. Ledger Statement */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenLedger(c)}
                                                                className="px-2.5 py-1 gold-gradient text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer shadow-xs hover:opacity-95 active:scale-95"
                                                                title="Open customer ledger statement"
                                                            >
                                                                <IconReceipt className="w-3 h-3 text-white" />
                                                                <span>Ledger</span>
                                                            </button>

                                                            {/* 2. Quick Payment */}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    handleOpenLedger(c);
                                                                    setActiveLedgerTab('payment');
                                                                }}
                                                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs border border-emerald-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                                                                title="Quick Receive Payment"
                                                            >
                                                                <IconPlus className="w-3 h-3 text-emerald-700" />
                                                                <span>Payment</span>
                                                            </button>

                                                            {/* 3. Return / Credit Note */}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    handleOpenLedger(c);
                                                                    setActiveLedgerTab('returns');
                                                                }}
                                                                className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg font-bold text-xs border border-purple-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                                                                title="View Customer Returns & Credit Notes"
                                                            >
                                                                <IconReturn className="w-3 h-3 text-purple-700" />
                                                                <span>Return/CN</span>
                                                            </button>

                                                            {/* 4. Three-Dot Icon (Opens Small Action Modal) */}
                                                            <button
                                                                type="button"
                                                                title="More options (Edit, Delete, WhatsApp)"
                                                                onClick={() => setActionModalCustomer(c)}
                                                                className="p-1.5 bg-gray-50 hover:bg-amber-50 text-gray-600 hover:text-[#B8860B] rounded-lg border border-gray-200 hover:border-[#D4AF37]/50 transition-all cursor-pointer shadow-2xs active:scale-95"
                                                            >
                                                                <IconDotsVertical className="w-3.5 h-3.5" />
                                                            </button>
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
                        <div className="p-3 sm:p-4 bg-white border-t border-gray-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                            {/* Left: Range and total count info */}
                            <div className="flex items-center gap-2 text-gray-600 text-[11px] font-medium">
                                <span>
                                    Showing <strong className="text-gray-900 font-bold">{startCustomerIndex}</strong> to <strong className="text-gray-900 font-bold">{endCustomerIndex}</strong> of <strong className="text-gray-900 font-bold">{totalServerCustomers}</strong> customers
                                </span>
                                {(searchQuery || filterStatus !== 'ALL') && totalServerCustomers < totalCustomersCount && (
                                    <span className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                                        (filtered from {totalCustomersCount})
                                    </span>
                                )}
                            </div>

                            {/* Right: Rows per page selector + Page Jump Buttons */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                {/* Rows per page dropdown */}
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                    <span className="text-gray-400 font-medium">Per page:</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 outline-none cursor-pointer transition-colors"
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
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            validCurrentPage <= 1
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="First Page"
                                    >
                                        <IconChevronDoubleLeft className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Previous Page */}
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={validCurrentPage <= 1}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            validCurrentPage <= 1
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Previous Page"
                                    >
                                        <IconChevronLeft className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Page Numbers */}
                                    <div className="flex items-center gap-1 px-1">
                                        {getPageNumbers(validCurrentPage, totalPages).map((p, idx) => {
                                            if (p === '...') {
                                                return (
                                                    <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 text-xs font-bold select-none">
                                                        ...
                                                    </span>
                                                );
                                            }
                                            const isActive = p === validCurrentPage;
                                            return (
                                                <button
                                                    key={`page-${p}`}
                                                    onClick={() => setCurrentPage(p)}
                                                    className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                        isActive
                                                            ? 'bg-black text-white shadow-2xs'
                                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900'
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
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            validCurrentPage >= totalPages
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Next Page"
                                    >
                                        <IconChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Last Page */}
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={validCurrentPage >= totalPages}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            validCurrentPage >= totalPages
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Last Page"
                                    >
                                        <IconChevronDoubleRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: PAYMENT & BILL HISTORY */}
            {activeMainTab === 'payment_history' && (
                <div className="space-y-6">
                    {/* DYNAMIC DATE & ACTIVITY FILTER BAR */}
                    <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-3">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                            {/* Date Presets Select Dropdown */}
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                                <IconCalendar className="w-4 h-4 text-[#B8860B] shrink-0" />
                                <label htmlFor="payment-date-select" className="text-xs font-bold text-gray-600 whitespace-nowrap">
                                    Date Filter:
                                </label>
                                <select
                                    id="payment-date-select"
                                    value={paymentDateFilter}
                                    onChange={(e) => {
                                        setPaymentDateFilter(e.target.value);
                                        setCurrentHistoryPage(1);
                                    }}
                                    className="bg-transparent text-xs font-bold text-gray-900 outline-none cursor-pointer pr-1"
                                >
                                    <option value="today">Today (Daily)</option>
                                    <option value="yesterday">Yesterday</option>
                                    <option value="this_week">This Week</option>
                                    <option value="this_month">This Month</option>
                                    <option value="custom">Custom Date Range</option>
                                    <option value="all">All Time</option>
                                </select>
                            </div>

                            {/* Payment Method Filter */}
                            <div className="flex items-center gap-2 text-xs font-bold">
                                <span className="text-gray-500 text-[11px]">Method:</span>
                                <select
                                    value={paymentMethodFilter}
                                    onChange={(e) => {
                                        setPaymentMethodFilter(e.target.value);
                                        setCurrentHistoryPage(1);
                                    }}
                                    className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
                                >
                                    <option value="ALL">All Methods</option>
                                    <option value="cash">Cash (Counter)</option>
                                    <option value="bank">Bank Transfer</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="credit">Credit (Udhar)</option>
                                    <option value="easypaisa">Easypaisa</option>
                                    <option value="jazzcash">JazzCash</option>
                                </select>
                            </div>
                        </div>

                        {/* Custom Date Range Pickers (shown when 'custom' is active) */}
                        {paymentDateFilter === 'custom' && (
                            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-600">From Date:</span>
                                    <input
                                        type="date"
                                        value={paymentStartDate}
                                        onChange={(e) => {
                                            setPaymentStartDate(e.target.value);
                                            setCurrentHistoryPage(1);
                                        }}
                                        className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-600">To Date:</span>
                                    <input
                                        type="date"
                                        value={paymentEndDate}
                                        onChange={(e) => {
                                            setPaymentEndDate(e.target.value);
                                            setCurrentHistoryPage(1);
                                        }}
                                        className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-800 focus:outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Activity Type Toggle Buttons & Search Input */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-2 border-t border-gray-100">
                            {/* Type Pills */}
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityTypeFilter('ALL');
                                        setCurrentHistoryPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${activityTypeFilter === 'ALL'
                                        ? 'bg-black text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    All Activity ({historySummary?.totalFiltered ?? 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityTypeFilter('bill');
                                        setCurrentHistoryPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${activityTypeFilter === 'bill'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    Sales Bills ({historySummary?.billsCount ?? 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityTypeFilter('payment');
                                        setCurrentHistoryPage(1);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${activityTypeFilter === 'payment'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    Payment Recoveries ({historySummary?.paymentsCount ?? 0})
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="relative w-full md:w-80">
                                <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by customer, invoice #, voucher #, notes..."
                                    value={paymentSearch}
                                    onChange={(e) => {
                                        setPaymentSearch(e.target.value);
                                        setCurrentHistoryPage(1);
                                    }}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                                />
                            </div>
                        </div>
                    </div>

                    {/* DYNAMIC PERIOD KPI CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* KPI 1: Total Billed Invoices in Period */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Total Invoices Billed</span>
                                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                                    <IconBill className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-blue-600 font-mono">
                                Rs. {Math.round(periodTotalBilled).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-blue-700 font-medium">
                                {historySummary?.billsCount ?? 0} Bill(s) added in {getPeriodLabel()}
                            </div>
                        </div>

                        {/* KPI 2: Dues Paid / Recovered in Period */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Paid / Recovered Dues</span>
                                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                                    <IconPayments className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-emerald-700 font-mono">
                                Rs. {Math.round(periodPaidAmount).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-800 font-medium">
                                Collections received in {getPeriodLabel()}
                            </div>
                        </div>

                        {/* KPI 3: New Pending Dues Generated in Period */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>New Pending Dues</span>
                                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                                    <IconReceipt className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-rose-600 font-mono">
                                Rs. {Math.round(periodNewPendingDues).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-rose-700 font-medium">
                                Credit extended in {getPeriodLabel()}
                            </div>
                        </div>

                        {/* KPI 4: Active Debtors */}
                        <div className="bg-white p-4 rounded-2xl border border-[#F3E5AB] shadow-xs space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                <span>Active Debtors</span>
                                <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                                    <IconWarning className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="text-2xl font-black text-amber-700">
                                {historySummary?.activeDebtorsCount ?? customersWithDueCount} Accounts
                            </div>
                            <div className="text-[11px] text-amber-800 font-medium">
                                Accounts with pending balances
                            </div>
                        </div>
                    </div>

                    {/* PAYMENT & BILL HISTORY TABLE */}
                    <div className="bg-white rounded-2xl border border-[#F3E5AB] shadow-xs overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="font-extrabold text-sm text-gray-900">
                                    Wholesale Bills & Payments Activity ({getPeriodLabel()})
                                </h2>
                                <p className="text-[11px] text-gray-400">
                                    Chronological stream of all new sales invoices billed and payment recovery vouchers recorded
                                </p>
                            </div>
                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                                {totalHistoryRecords} Records Listed
                            </span>
                        </div>

                        <div className="overflow-x-auto w-full relative">
                            {historyLoading && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-md border border-[#F3E5AB] text-xs font-bold text-gray-800">
                                        <IconSpinner className="w-4 h-4 animate-spin text-[#B8860B]" />
                                        <span>Loading history records...</span>
                                    </div>
                                </div>
                            )}
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                                        <th className="py-2.5 px-3 min-w-[110px]">Date</th>
                                        <th className="py-2.5 px-3 min-w-[100px] text-center">Type</th>
                                        <th className="py-2.5 px-3 min-w-[120px]">Ref / Invoice #</th>
                                        <th className="py-2.5 px-3 min-w-[180px]">Customer / Business</th>
                                        <th className="py-2.5 px-3 min-w-[100px] text-center">Method</th>
                                        <th className="py-2.5 px-3 min-w-[120px] text-right">Bill Total (Net)</th>
                                        <th className="py-2.5 px-3 min-w-[130px] text-right">Paid / Received</th>
                                        <th className="py-2.5 px-3 min-w-[120px] text-right">Remaining Due</th>
                                        <th className="py-2.5 px-3 min-w-[100px] text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {historyRecords.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="py-12 text-center text-gray-400">
                                                <IconReceipt className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                                                No bill or payment transactions found for {getPeriodLabel()}.
                                            </td>
                                        </tr>
                                    ) : (
                                        historyRecords.map((item) => {
                                            const itemDateStr = formatOnlyDate(item.date);
                                            const isBill = item.type === 'bill';

                                            return (
                                                <tr key={item.id} className="hover:bg-amber-50/20 transition-colors">
                                                    {/* Date (Clean date with all time removed) */}
                                                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700 font-semibold">
                                                        {itemDateStr}
                                                    </td>

                                                    {/* Record Type Badge */}
                                                    <td className="py-2.5 px-3 text-center">
                                                        {isBill ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                                                                <IconBill className="w-3 h-3 text-blue-600" />
                                                                Sales Bill
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                                                                <IconPayments className="w-3 h-3 text-emerald-600" />
                                                                Payment
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Ref / Invoice # */}
                                                    <td className="py-2.5 px-3 font-mono font-bold">
                                                        <span className={isBill ? 'text-[#B8860B]' : 'text-emerald-700'}>
                                                            {item.ref_no}
                                                        </span>
                                                    </td>

                                                    {/* Customer / Business */}
                                                    <td className="py-2.5 px-3">
                                                        <div className="font-bold text-gray-900 text-xs">
                                                            {item.party_name || 'Wholesale Client'}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 font-medium">
                                                            {item.party_business || item.party_phone || 'Wholesale Customer'}
                                                        </div>
                                                    </td>

                                                    {/* Method */}
                                                    <td className="py-2.5 px-3 text-center">
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                                                            {item.payment_method || (isBill ? 'credit' : 'cash')}
                                                        </span>
                                                    </td>

                                                    {/* Bill Total (Net) */}
                                                    <td className="py-2.5 px-3 text-right">
                                                        {isBill ? (
                                                            <div className="font-black text-gray-900 text-xs font-mono">
                                                                Rs. {Number(item.net_amount || 0).toLocaleString()}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>

                                                    {/* Paid / Received */}
                                                    <td className="py-2.5 px-3 text-right">
                                                        <div className="font-black text-emerald-700 text-xs font-mono">
                                                            Rs. {Number(item.amount_paid || 0).toLocaleString()}
                                                        </div>
                                                        {isBill && item.amount_paid < item.net_amount && (
                                                            <div className="text-[9px] text-rose-600 font-medium">
                                                                Partial payment
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Remaining Due */}
                                                    <td className="py-2.5 px-3 text-right">
                                                        {isBill ? (
                                                            item.remaining_balance > 0 ? (
                                                                <span className="font-black text-rose-600 font-mono text-xs">
                                                                    Rs. {Number(item.remaining_balance || 0).toLocaleString()}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                                                                    <IconCheck className="w-3 h-3" />
                                                                    Cleared
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-2.5 px-3 text-center">
                                                        {isBill ? (
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleViewSaleBill(item.rawId)}
                                                                    className="px-2 py-1 bg-gray-100 hover:bg-[#FEF9E7] hover:text-[#B8860B] text-gray-700 rounded-lg font-bold text-xs border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer"
                                                                    title="View complete wholesale bill (A4)"
                                                                >
                                                                    <IconEye className="w-3.5 h-3.5" />
                                                                    <span>View</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenThermalSlip(item.rawId)}
                                                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-bold text-xs border border-gray-300 transition-colors flex items-center gap-1 cursor-pointer"
                                                                    title="View and print 80mm thermal receipt"
                                                                >
                                                                    <IconReceipt className="w-3.5 h-3.5 text-black" />
                                                                    <span>Receipt</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSendSaleBillWhatsApp(item.raw)}
                                                                    disabled={waSending}
                                                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
                                                                    title={`Send Invoice #${item.ref_no} PDF via WhatsApp`}
                                                                >
                                                                    <IconWhatsApp className="w-3.5 h-3.5 text-emerald-600" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedPaymentReceipt(item.raw);
                                                                    setPaymentReceiptModalOpen(true);
                                                                }}
                                                                className="px-2.5 py-1 bg-gray-100 hover:bg-[#FEF9E7] hover:text-[#B8860B] text-gray-700 rounded-lg font-bold text-xs border border-gray-200 transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                                                                title="Print or view payment recovery voucher"
                                                            >
                                                                <IconPrinter className="w-3.5 h-3.5" />
                                                                <span>Receipt</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                {totalHistoryRecords > 0 && (
                                    <tfoot>
                                        <tr className="bg-gray-50/90 border-t-2 border-gray-300 font-bold text-xs">
                                            <td colSpan={5} className="py-2.5 px-3 text-gray-800">
                                                Period Totals in {getPeriodLabel()} ({totalHistoryRecords} Activity Records)
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-gray-900 font-black font-mono text-xs">
                                                Rs. {Math.round(periodTotalBilled).toLocaleString()}
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-emerald-700 font-black font-mono text-xs">
                                                Rs. {Math.round(periodPaidAmount).toLocaleString()}
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-rose-600 font-black font-mono text-xs">
                                                Rs. {Math.round(periodNewPendingDues).toLocaleString()}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {/* SERVER-SIDE PAGINATION CONTROLS */}
                        <div className="p-3 bg-gray-50/80 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                            <div className="text-gray-500 font-semibold">
                                {totalHistoryRecords === 0 ? (
                                    <span>No activity records found</span>
                                ) : (
                                    <span>
                                        Showing <strong className="text-gray-900 font-bold">{(currentHistoryPage - 1) * historyPageSize + 1}</strong> to{' '}
                                        <strong className="text-gray-900 font-bold">{Math.min(currentHistoryPage * historyPageSize, totalHistoryRecords)}</strong> of{' '}
                                        <strong className="text-gray-900 font-bold">{totalHistoryRecords}</strong> records
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Page size selector */}
                                <div className="flex items-center gap-1.5 text-gray-500 font-medium">
                                    <span>Per page:</span>
                                    <select
                                        value={historyPageSize}
                                        onChange={(e) => {
                                            setHistoryPageSize(Number(e.target.value));
                                            setCurrentHistoryPage(1);
                                        }}
                                        className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 outline-none cursor-pointer"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                    </select>
                                </div>

                                {/* Page navigation buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentHistoryPage(1)}
                                        disabled={currentHistoryPage <= 1}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            currentHistoryPage <= 1
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="First Page"
                                    >
                                        <IconChevronDoubleLeft className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                        onClick={() => setCurrentHistoryPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentHistoryPage <= 1}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            currentHistoryPage <= 1
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Previous Page"
                                    >
                                        <IconChevronLeft className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Page Numbers */}
                                    <div className="flex items-center gap-1 px-1">
                                        {getPageNumbers(currentHistoryPage, totalHistoryPages).map((p, idx) => {
                                            if (p === '...') {
                                                return (
                                                    <span key={`history-ellipsis-${idx}`} className="px-1 text-gray-400 text-xs font-bold select-none">
                                                        ...
                                                    </span>
                                                );
                                            }
                                            const isActive = p === currentHistoryPage;
                                            return (
                                                <button
                                                    key={`history-page-${p}`}
                                                    onClick={() => setCurrentHistoryPage(p)}
                                                    className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                        isActive
                                                            ? 'bg-black text-white shadow-2xs'
                                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button
                                        onClick={() => setCurrentHistoryPage(prev => Math.min(totalHistoryPages, prev + 1))}
                                        disabled={currentHistoryPage >= totalHistoryPages}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            currentHistoryPage >= totalHistoryPages
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Next Page"
                                    >
                                        <IconChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                        onClick={() => setCurrentHistoryPage(totalHistoryPages)}
                                        disabled={currentHistoryPage >= totalHistoryPages}
                                        className={`p-1.5 rounded-lg border text-xs transition-all ${
                                            currentHistoryPage >= totalHistoryPages
                                                ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-2xs active:scale-95'
                                        }`}
                                        title="Last Page"
                                    >
                                        <IconChevronDoubleRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOMER LEDGER STATEMENT & BILLS MODAL */}
            {ledgerModalOpen && selectedCustomer && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-6xl w-full max-h-[96vh] sm:max-h-[92vh] flex flex-col shadow-2xl border border-[#F3E5AB] overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50/70 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5 shrink-0">
                            <div className="min-w-0 shrink">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <h2 className="text-sm sm:text-base font-extrabold text-gray-900 truncate">
                                        {selectedCustomer.name}
                                    </h2>
                                    <span className="px-1.5 py-0.5 rounded bg-[#FEF9E7] border border-[#F3E5AB] text-[10px] font-bold text-[#B8860B] truncate">
                                        {selectedCustomer.business_name || 'Wholesale Client'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                    Phone: <span className="font-mono font-semibold text-gray-700">{selectedCustomer.mobile || selectedCustomer.phone || 'None'}</span> • Address: <span className="text-gray-700">{selectedCustomer.address || 'Timergara'}</span>
                                </p>
                            </div>

                            {/* Header Quick Actions (Smoothly horizontally scrollable on mobile) */}
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full lg:w-auto pb-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleStartNewBill(selectedCustomer)}
                                    className="px-2.5 py-1.5 gold-gradient text-white rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-95 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                    title="Create new bill in POS for this customer"
                                >
                                    <IconPOS className="w-3.5 h-3.5" />
                                    <span>+ New Bill</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleOpenReceivePayment(selectedCustomer)}
                                    style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                    className="btn-black !bg-black !text-white px-2.5 py-1.5 rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                    title="Receive customer payment using FIFO invoice allocation"
                                >
                                    <IconPayments className="w-3.5 h-3.5 text-white" />
                                    <span>Receive Pay</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (customerSales.length === 0) {
                                            showAlert('No Invoices Found', 'This customer does not have any sales bills yet to return from.', 'warning');
                                            return;
                                        }
                                        if (customerSales.length === 1) {
                                            handleOpenReturn(customerSales[0]);
                                        } else {
                                            setActiveLedgerTab('bills');
                                            showAlert('Select Invoice to Return', 'Please click the "Return" button on the specific bill below you wish to process a return or credit note for.', 'info');
                                        }
                                    }}
                                    style={{ backgroundColor: '#7e22ce', color: '#ffffff', border: '1px solid #7e22ce' }}
                                    className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-95 active:scale-95 transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                    title="Process a customer return / issue Credit Note"
                                >
                                    <IconReturn className="w-3.5 h-3.5 text-white" />
                                    <span>+ Return / CN</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppReminder(selectedCustomer)}
                                    disabled={waSending}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                                    title="Send WhatsApp Dues Reminder Message to Customer"
                                >
                                    <IconWhatsApp className="w-3.5 h-3.5 text-white" />
                                    <span>{waSending ? 'Sending...' : 'WA Reminder'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleDownloadStatementPdf(selectedCustomer)}
                                    disabled={downloadingStatement}
                                    style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                    className="btn-black !bg-black !text-white px-2.5 py-1.5 rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                                    title="Download comprehensive A4 Customer Statement PDF"
                                >
                                    <IconDownload className="w-3.5 h-3.5 text-white" />
                                    <span>{downloadingStatement ? 'Downloading...' : 'PDF'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppPdf(selectedCustomer)}
                                    disabled={waSending}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                                    title="Send full Account Statement PDF directly to customer via WhatsApp"
                                >
                                    <IconWhatsApp className="w-3.5 h-3.5 text-white" />
                                    <span>{waSending ? 'Sending...' : 'Send WA PDF'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-[11px] border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                    title="Print Statement"
                                >
                                    <IconPrinter className="w-3.5 h-3.5" />
                                    <span>Print</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setLedgerModalOpen(false)}
                                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer shrink-0 ml-0.5"
                                    title="Close Ledger Modal"
                                >
                                    <IconClose className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* PROPER KPI CARDS INSIDE LEDGER MODAL */}
                        <div className="p-2.5 sm:p-4 bg-white border-b border-gray-100 shrink-0">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                {/* Card 1: Total added bills balance */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gray-50 border border-gray-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                        Total Invoices Billed
                                    </div>
                                    <div className="text-base sm:text-xl font-black text-gray-900 font-mono truncate">
                                        Rs. {Math.round(totalBilled).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-400 truncate">
                                        {customerSales.length} sale invoice(s)
                                    </div>
                                </div>

                                {/* Card 2: Total Payments & Returns */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                                        Total Paid &amp; Returns
                                    </div>
                                    <div className="text-base sm:text-xl font-black text-emerald-700 font-mono truncate">
                                        Rs. {Math.round(totalPaid).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-emerald-700 font-medium">
                                        {totalReturnsAll > 0 ? (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span>Total Paid: <strong className="font-bold">Rs. {Math.round(totalPaymentsReceived).toLocaleString()}</strong></span>
                                                <span>•</span>
                                                <span>Return: <strong className="font-bold">Rs. {Math.round(totalReturnsAll).toLocaleString()}</strong></span>
                                                {cashRefundsTotal > 0 && khataReturnsCredit === 0 && (
                                                    <span className="text-[9.5px] text-blue-700 font-semibold">(Cash Refund)</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="truncate block">{totalPaymentsReceived > 0 ? `Total Paid: Rs. ${Math.round(totalPaymentsReceived).toLocaleString()}` : 'Collections received'}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Card 3: Total outstanding */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#FEF9E7] border border-[#F3E5AB] space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-[#B8860B] uppercase tracking-wider truncate">
                                        Current Due Balance
                                    </div>
                                    <div className={`text-base sm:text-xl font-black font-mono truncate ${currentBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                        Rs. {Math.round(currentBalance).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate">
                                        {currentBalance > 0 ? 'Customer owes you' : 'Account fully settled'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* MODAL TABS (Scrollable on small viewports) */}
                        <div className="px-3 sm:px-5 border-b border-gray-200 flex items-center gap-2 sm:gap-4 bg-gray-50/40 text-xs font-bold shrink-0 overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => setActiveLedgerTab('statement')}
                                className={`py-2.5 sm:py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${activeLedgerTab === 'statement'
                                    ? 'border-[#B8860B] text-[#B8860B]'
                                    : 'border-transparent text-gray-500 hover:text-gray-900'
                                    }`}
                            >
                                <IconReceipt className="w-3.5 h-3.5" />
                                <span>Statement of Account ({ledger.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveLedgerTab('bills')}
                                className={`py-2.5 sm:py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${activeLedgerTab === 'bills'
                                    ? 'border-[#B8860B] text-[#B8860B]'
                                    : 'border-transparent text-gray-500 hover:text-gray-900'
                                    }`}
                            >
                                <IconBill className="w-3.5 h-3.5" />
                                <span>Invoices & Bills ({customerSales.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveLedgerTab('returns')}
                                className={`py-2.5 sm:py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${activeLedgerTab === 'returns'
                                    ? 'border-purple-600 text-purple-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-900'
                                    }`}
                            >
                                <IconReturn className="w-3.5 h-3.5 text-purple-600" />
                                <span>Returns & Credit Notes ({customerReturns.length})</span>
                            </button>
                        </div>

                        {/* MODAL TAB CONTENT (Scrollable) */}
                        <div className="p-2.5 sm:p-4 overflow-y-auto flex-1 min-h-0">
                            {ledgerLoading ? (
                                <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                    <IconSpinner className="w-4 h-4 text-[#B8860B]" />
                                    Loading customer ledger records...
                                </div>
                            ) : activeLedgerTab === 'statement' ? (
                                /* TAB 1: STATEMENT TABLE */
                                <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                    <table className="w-full text-left text-xs border-collapse min-w-[680px]">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                                                <th className="p-2.5">Date</th>
                                                <th className="p-2.5 min-w-[190px]">Description / Voucher</th>
                                                <th className="p-2.5 text-center">Type</th>
                                                <th className="p-2.5 text-right">Purchase (Debit+)</th>
                                                <th className="p-2.5 text-right">Payment / Return (Credit-)</th>
                                                <th className="p-2.5 text-right">Running Due Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {ledger.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="py-8 text-center text-gray-400">
                                                        No transactions recorded yet for this customer.
                                                    </td>
                                                </tr>
                                            ) : (
                                                ledger.map((row) => (
                                                    <tr key={row.id} className="hover:bg-amber-50/20">
                                                        <td className="p-2.5 text-gray-600 font-mono text-[11px]">
                                                            {formatOnlyDate(row.payment_date || row.created_at)}
                                                        </td>
                                                        <td className="p-2.5 font-semibold text-gray-800">
                                                            {row.description}
                                                            {row.type !== 'return' && row.payment_method && row.payment_method !== 'credit_note' && (
                                                                <span className="text-[10px] text-gray-400 font-normal ml-1">
                                                                    ({row.payment_method})
                                                                </span>
                                                            )}
                                                            {row.type === 'return' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const retId = row.return_id || Number(row.description?.match(/Sales Return #(\d+)/)?.[1] || null);
                                                                        if (retId) {
                                                                            setSelectedReturnIdForCreditNote(retId);
                                                                            setCreditNoteModalOpen(true);
                                                                        }
                                                                    }}
                                                                    className="text-[10px] text-purple-700 font-extrabold ml-1.5 px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 border border-purple-200 inline-flex items-center gap-1 cursor-pointer transition-all hover:scale-105"
                                                                    title="View Official Credit Note PDF, Print & Send WhatsApp"
                                                                >
                                                                    <IconReceipt className="w-3 h-3 text-purple-600" />
                                                                    <span>Credit Note PDF</span>
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                row.type === 'charge'
                                                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                    : row.type === 'return'
                                                                        ? (row.payment_method === 'cash' || row.description?.includes('Cash Refund') || row.is_cash_refund
                                                                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                                            : 'bg-purple-50 text-purple-700 border border-purple-200')
                                                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            }`}>
                                                                {row.type === 'charge'
                                                                    ? 'Invoice Bill'
                                                                    : (row.type === 'return'
                                                                        ? (row.payment_method === 'cash' || row.description?.includes('Cash Refund') || row.is_cash_refund ? 'Cash Refund' : 'Sales Return')
                                                                        : 'Payment')}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-right font-bold text-rose-600 font-mono">
                                                            {row.type === 'charge' ? `Rs. ${Number(row.amount || 0).toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="p-2.5 text-right font-bold font-mono">
                                                            {row.type === 'payment' ? (
                                                                <span className="text-emerald-700">Rs. {Number(row.amount || 0).toLocaleString()}</span>
                                                            ) : row.type === 'return' ? (
                                                                row.payment_method === 'cash' || row.description?.includes('Cash Refund') || row.is_cash_refund ? (
                                                                    <div className="text-right">
                                                                        <span className="text-blue-700 font-bold">Rs. {Number(row.amount || 0).toLocaleString()}</span>
                                                                        <span className="block text-[9.5px] font-sans text-blue-600 font-medium">(Paid in Cash)</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-purple-700 font-bold">Rs. {Number(row.amount || 0).toLocaleString()}</span>
                                                                )
                                                            ) : '-'}
                                                        </td>
                                                        <td className="p-2.5 text-right font-black text-gray-900 font-mono text-xs">
                                                            Rs. {Number(row.running_balance || 0).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {ledger.length > 0 && (
                                            <tfoot>
                                                <tr className="bg-gray-50/90 border-t-2 border-gray-300 font-bold text-xs">
                                                    <td colSpan={3} className="p-2.5 text-gray-800">Total Account Summary</td>
                                                    <td className="p-2.5 text-right text-rose-600 font-mono">Rs. {Math.round(totalBilled).toLocaleString()}</td>
                                                    <td className="p-2.5 text-right text-emerald-700 font-mono">Rs. {Math.round(totalCreditsApplied).toLocaleString()}</td>
                                                    <td className="p-2.5 text-right text-gray-900 font-black font-mono">Rs. {Math.round(currentBalance).toLocaleString()}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            ) : activeLedgerTab === 'bills' ? (
                                /* TAB 2: INVOICES & BILLS TABLE */
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                        <div className="text-gray-500 font-medium">
                                            All sales invoices generated for {selectedCustomer.name}
                                        </div>
                                        <button
                                            onClick={() => handleStartNewBill(selectedCustomer)}
                                            className="px-3 py-1.5 gold-gradient text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer w-full sm:w-auto shadow-2xs"
                                        >
                                            <IconPOS className="w-3.5 h-3.5" />
                                            <span>Create New Bill</span>
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                        <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                                                    <th className="p-2.5">Invoice #</th>
                                                    <th className="p-2.5">Date</th>
                                                    <th className="p-2.5 text-right">Net Amount</th>
                                                    <th className="p-2.5 text-right">Paid</th>
                                                    <th className="p-2.5 text-right">Remaining Due</th>
                                                    <th className="p-2.5 text-center">Status</th>
                                                    <th className="p-2.5 text-center">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {customerSales.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="py-8 text-center text-gray-400">
                                                            No sales bills recorded yet for this customer.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    customerSales.map((sale) => (
                                                        <tr key={sale.id} className="hover:bg-amber-50/20">
                                                            <td className="p-2.5 font-bold text-[#B8860B] font-mono">
                                                                {sale.invoice_no}
                                                            </td>
                                                            <td className="p-2.5 text-gray-500 font-mono text-[11px]">
                                                                {formatOnlyDate(sale.created_at)}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-gray-900 font-mono">
                                                                Rs. {Number(sale.net_amount || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-semibold text-emerald-700 font-mono">
                                                                Rs. {Number(sale.amount_paid || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-rose-600 font-mono">
                                                                Rs. {Number(sale.remaining_balance || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sale.remaining_balance <= 0
                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                    }`}>
                                                                    {sale.remaining_balance <= 0 ? 'Paid' : 'Unpaid / Partial'}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-center whitespace-nowrap">
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleViewSaleBill(sale.id)}
                                                                        style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all hover:bg-gray-100 shadow-2xs"
                                                                        title="View wholesale invoice (A4)"
                                                                    >
                                                                        <IconEye className="w-3 h-3 text-gray-700" />
                                                                        <span>View Bill</span>
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenThermalSlip(sale)}
                                                                        style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all hover:bg-gray-100 shadow-2xs"
                                                                        title="View and print 80mm thermal receipt"
                                                                    >
                                                                        <IconReceipt className="w-3 h-3 text-gray-700" />
                                                                        <span>Thermal</span>
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSendSaleBillWhatsApp(sale)}
                                                                        disabled={waSending}
                                                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 shadow-2xs"
                                                                        title={`Send Invoice #${sale.invoice_no} PDF via WhatsApp`}
                                                                    >
                                                                        <IconWhatsApp className="w-3.5 h-3.5 text-emerald-600" />
                                                                        <span>Send Bill</span>
                                                                    </button>

                                                                    {/* Process Return on Bill */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenReturn(sale)}
                                                                        className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors active:scale-95 shadow-2xs"
                                                                        title={`Process Return / Credit Note for Bill ${sale.invoice_no}`}
                                                                    >
                                                                        <IconReturn className="w-3 h-3 text-purple-700" />
                                                                        <span>Return</span>
                                                                    </button>

                                                                    {Number(sale.remaining_balance || 0) > 0 ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleOpenPaySpecificBill(sale)}
                                                                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                                                            className="btn-black !bg-black !text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                                            title={`Pay specific bill ${sale.invoice_no} (Due: Rs. ${Number(sale.remaining_balance).toLocaleString()})`}
                                                                        >
                                                                            <IconPayments className="w-3 h-3 text-white" />
                                                                            <span>Pay</span>
                                                                        </button>
                                                                    ) : (
                                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                                                            Paid
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                /* TAB 3: RETURNS & CREDIT NOTES TABLE */
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                        <div>
                                            <div className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                                                <span>Customer Returns &amp; Credit Notes</span>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                                    {customerReturns.length} Vouchers
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                All merchandise returns, restocked items, and official Credit Notes issued for {selectedCustomer.name}
                                            </p>
                                        </div>

                                        {customerSales.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (customerSales.length === 1) {
                                                        handleOpenReturn(customerSales[0]);
                                                    } else {
                                                        setActiveLedgerTab('bills');
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all w-full sm:w-auto"
                                            >
                                                <IconReturn className="w-3.5 h-3.5" />
                                                <span>+ Issue New Sales Return</span>
                                            </button>
                                        )}
                                    </div>

                                    {customerReturns.length === 0 ? (
                                        <div className="p-8 sm:p-12 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 space-y-3">
                                            <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                                <IconReturn className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">No Sales Returns or Credit Notes</div>
                                                <div className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                                                    This customer has not returned any merchandise yet. To process a return, select an invoice from the "Invoices & Bills" tab.
                                                </div>
                                            </div>
                                            {customerSales.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveLedgerTab('bills')}
                                                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                >
                                                    <IconBill className="w-3.5 h-3.5" />
                                                    <span>View Invoices to Return</span>
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                                                        <th className="p-2.5">Credit Note #</th>
                                                        <th className="p-2.5">Return Date</th>
                                                        <th className="p-2.5">Original Invoice</th>
                                                        <th className="p-2.5 text-center">Condition</th>
                                                        <th className="p-2.5 text-center">Settlement Method</th>
                                                        <th className="p-2.5 text-right">Refund Amount</th>
                                                        <th className="p-2.5 text-center">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {customerReturns.map((ret) => {
                                                        const isKhata = ret.refund_method === 'credit' || !ret.refund_method;
                                                        const isSaleable = ret.return_type !== 'damaged';
                                                        return (
                                                            <tr key={ret.id} className="hover:bg-purple-50/20">
                                                                <td className="p-2.5 font-bold font-mono text-purple-800">
                                                                    #CN-{String(ret.id).padStart(5, '0')}
                                                                </td>
                                                                <td className="p-2.5 text-gray-600 font-mono text-[11px]">
                                                                    {formatOnlyDate(ret.created_at)}
                                                                </td>
                                                                <td className="p-2.5 font-mono text-gray-800 font-semibold">
                                                                    {ret.original_invoice_no || (ret.sale_id ? `INV-${ret.sale_id}` : 'Direct Return')}
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        isSaleable
                                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                    }`}>
                                                                        {isSaleable ? 'Saleable (Restocked)' : 'Damaged / Scrap'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        isKhata
                                                                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                                                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                                    }`}>
                                                                        {isKhata ? 'Khata Adjustment' : 'Cash Drawer Refund'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2.5 text-right font-black text-purple-900 font-mono text-xs">
                                                                    Rs. {Number(ret.total_refund || 0).toLocaleString()}
                                                                </td>
                                                                <td className="p-2.5 text-center whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSelectedReturnIdForCreditNote(ret.id);
                                                                            setCreditNoteModalOpen(true);
                                                                        }}
                                                                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all hover:scale-105 shadow-2xs"
                                                                        title="View Official Credit Note A4 PDF, WhatsApp & Print"
                                                                    >
                                                                        <IconReceipt className="w-3.5 h-3.5 text-purple-600" />
                                                                        <span>Official Credit Note</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-purple-50/50 border-t-2 border-purple-200 font-bold text-xs">
                                                        <td colSpan={5} className="p-2.5 text-purple-950 font-extrabold">
                                                            Total Customer Returns ({customerReturns.length} vouchers)
                                                        </td>
                                                        <td className="p-2.5 text-right font-black font-mono text-purple-900 text-xs">
                                                            Rs. {customerReturns.reduce((acc, r) => acc + (Number(r.total_refund) || 0), 0).toLocaleString()}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: FIFO CUSTOMER PAYMENT */}
            {payFifoModalOpen && selectedCustomer && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSubmitFifoPay} className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl border border-[#F3E5AB] max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-black text-gray-900 text-sm sm:text-base flex items-center gap-2">
                                    <IconPayments className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-700" />
                                    <span>Receive Customer Payment (FIFO System)</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Collect payment from <span className="font-bold text-gray-900">{selectedCustomer.name}</span> with First-In First-Out invoice settlement
                                </p>
                            </div>
                            <button type="button" onClick={() => setPayFifoModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Current Balance Box */}
                        <div className="bg-[#FEF9E7] rounded-xl p-3 border border-[#F3E5AB] flex items-center justify-between">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-gray-500">Current Outstanding Due</div>
                                <div className="text-lg sm:text-xl font-black text-rose-600">
                                    Rs. {Number(selectedCustomer.balance || 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded gold-gradient text-white">
                                    FIFO Priority
                                </span>
                                <div className="text-[10px] text-gray-500 mt-0.5">Oldest bills settled first</div>
                            </div>
                        </div>

                        {/* FIFO Breakdown Preview */}
                        {(() => {
                            const unpaid = (customerSales || [])
                                .filter(s => parseFloat(s.remaining_balance) > 0)
                                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                            if (unpaid.length === 0) return null;

                            const enteredAmt = parseFloat(payFifoForm.amount) || 0;
                            let rem = enteredAmt;

                            return (
                                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 text-xs space-y-1.5">
                                    <div className="font-bold text-gray-700 flex justify-between">
                                        <span>Oldest Outstanding Bills to Settle (FIFO):</span>
                                        <span className="text-[#B8860B] font-mono">{unpaid.length} Unpaid Bill(s)</span>
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                        {unpaid.map((bill) => {
                                            const due = parseFloat(bill.remaining_balance) || 0;
                                            const willCover = Math.min(due, rem);
                                            rem = Math.max(0, rem - willCover);

                                            return (
                                                <div key={bill.id} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-gray-200">
                                                    <div>
                                                        <span className="font-bold text-gray-900 font-mono">{bill.invoice_no}</span>
                                                        <span className="text-gray-400 ml-2">{formatOnlyDate(bill.created_at)}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-bold text-gray-700">Due: Rs. {due.toLocaleString()}</span>
                                                        {enteredAmt > 0 && (
                                                            <span className={`ml-2 font-bold ${willCover >= due ? 'text-emerald-700' : willCover > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                                                ({willCover >= due ? 'Fully Paid' : willCover > 0 ? `Covers Rs. ${willCover.toLocaleString()}` : 'Uncovered'})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Input Fields */}
                        <div className="space-y-3 text-xs">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="font-bold text-gray-700">
                                        Payment Amount (Rs.) *
                                    </label>
                                    {Number(selectedCustomer.balance || 0) > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPayFifoForm({ ...payFifoForm, amount: String(Math.round(selectedCustomer.balance)) })}
                                            className="text-[11px] font-bold text-[#B8860B] hover:underline cursor-pointer"
                                        >
                                            Pay Full Due (Rs. {Number(selectedCustomer.balance).toLocaleString()})
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    step="any"
                                    value={payFifoForm.amount}
                                    onChange={(e) => setPayFifoForm({ ...payFifoForm, amount: e.target.value })}
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl text-sm font-black text-[#B8860B] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                                    placeholder="Enter payment amount"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">Payment Method</label>
                                    <select
                                        value={payFifoForm.payment_method}
                                        onChange={(e) => setPayFifoForm({ ...payFifoForm, payment_method: e.target.value })}
                                        className="w-full p-2 border border-[#F3E5AB] rounded-xl font-semibold bg-white"
                                    >
                                        <option value="cash">Cash in Hand</option>
                                        <option value="bank">Bank Transfer</option>
                                        <option value="cheque">Bank Cheque</option>
                                        <option value="online">Online Transfer / EasyPaisa</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">Payment Date</label>
                                    <input
                                        type="date"
                                        value={payFifoForm.payment_date}
                                        onChange={(e) => setPayFifoForm({ ...payFifoForm, payment_date: e.target.value })}
                                        className="w-full p-2 border border-[#F3E5AB] rounded-xl font-semibold bg-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Cheque / Reference # (Optional)</label>
                                <input
                                    type="text"
                                    value={payFifoForm.reference_no}
                                    onChange={(e) => setPayFifoForm({ ...payFifoForm, reference_no: e.target.value })}
                                    placeholder="e.g. HBL-CHQ-98214"
                                    className="w-full p-2 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Voucher Remarks / Notes</label>
                                <input
                                    type="text"
                                    value={payFifoForm.notes}
                                    onChange={(e) => setPayFifoForm({ ...payFifoForm, notes: e.target.value })}
                                    placeholder="Notes for ledger entry"
                                    className="w-full p-2 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setPayFifoModalOpen(false)}
                                style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={payFifoSubmitting}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                            >
                                {payFifoSubmitting ? (
                                    <>
                                        <IconSpinner className="w-4 h-4 text-white" />
                                        <span>Allocating FIFO Payment...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconPayments className="w-4 h-4 text-white" />
                                        <span>Confirm & Settle FIFO</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL: PAY SPECIFIC BILL */}
            {paySpecificBillModalOpen && selectedBillToPay && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSubmitPaySpecificBill} className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl border border-[#F3E5AB] max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-black text-gray-900 text-sm sm:text-base flex items-center gap-2">
                                    <IconBill className="w-4 sm:w-5 h-4 sm:h-5 text-[#B8860B]" />
                                    <span>Pay Specific Bill</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Invoice: <span className="font-bold font-mono text-gray-900">{selectedBillToPay.invoice_no}</span> • {selectedCustomer?.name || 'Customer'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setPaySpecificBillModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Bill Summary Box */}
                        <div className="bg-[#FEF9E7] rounded-xl p-2.5 sm:p-3.5 border border-[#F3E5AB] grid grid-cols-3 gap-1.5 sm:gap-2 text-center text-xs">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-gray-500 truncate">Invoice Total</div>
                                <div className="text-xs sm:text-sm font-extrabold text-gray-900 font-mono mt-0.5 truncate">
                                    Rs. {Number(selectedBillToPay.net_amount || 0).toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-gray-500 truncate">Already Paid</div>
                                <div className="text-xs sm:text-sm font-extrabold text-emerald-700 font-mono mt-0.5 truncate">
                                    Rs. {Number(selectedBillToPay.amount_paid || 0).toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-rose-700 truncate">Remaining Due</div>
                                <div className="text-xs sm:text-sm font-black text-rose-600 font-mono mt-0.5 truncate">
                                    Rs. {Number(selectedBillToPay.remaining_balance || 0).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Input Fields */}
                        <div className="space-y-3 text-xs">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="font-bold text-gray-700">
                                        Payment Amount (Rs.) *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setPayBillForm({ ...payBillForm, amount: String(selectedBillToPay.remaining_balance || 0) })}
                                        className="text-[11px] font-bold text-[#B8860B] hover:underline cursor-pointer"
                                    >
                                        Full Balance (Rs. {Number(selectedBillToPay.remaining_balance || 0).toLocaleString()})
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max={Number(selectedBillToPay.remaining_balance || 0)}
                                    step="any"
                                    value={payBillForm.amount}
                                    onChange={(e) => setPayBillForm({ ...payBillForm, amount: e.target.value })}
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl text-sm font-black text-[#B8860B] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                                    placeholder="Enter payment amount"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">Payment Method</label>
                                    <select
                                        value={payBillForm.payment_method}
                                        onChange={(e) => setPayBillForm({ ...payBillForm, payment_method: e.target.value })}
                                        className="w-full p-2 border border-[#F3E5AB] rounded-xl font-semibold bg-white"
                                    >
                                        <option value="cash">Cash in Hand</option>
                                        <option value="bank">Bank Transfer</option>
                                        <option value="cheque">Bank Cheque</option>
                                        <option value="online">Online Transfer / EasyPaisa</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">Payment Date</label>
                                    <input
                                        type="date"
                                        value={payBillForm.payment_date}
                                        onChange={(e) => setPayBillForm({ ...payBillForm, payment_date: e.target.value })}
                                        className="w-full p-2 border border-[#F3E5AB] rounded-xl font-semibold bg-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Cheque / Reference # (Optional)</label>
                                <input
                                    type="text"
                                    value={payBillForm.reference_no}
                                    onChange={(e) => setPayBillForm({ ...payBillForm, reference_no: e.target.value })}
                                    placeholder="e.g. HBL-CHQ-98214"
                                    className="w-full p-2 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Voucher Remarks / Notes</label>
                                <input
                                    type="text"
                                    value={payBillForm.notes}
                                    onChange={(e) => setPayBillForm({ ...payBillForm, notes: e.target.value })}
                                    placeholder="Payment description"
                                    className="w-full p-2 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setPaySpecificBillModalOpen(false)}
                                style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={payBillSubmitting}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
                            >
                                {payBillSubmitting ? (
                                    <>
                                        <IconSpinner className="w-4 h-4 text-white" />
                                        <span>Posting Bill Payment...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconCheck className="w-4 h-4 text-white" />
                                        <span>Pay Bill (Rs. {Number(payBillForm.amount || 0).toLocaleString()})</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* INVOICE BILL DETAILS MODAL (REUSABLE WHOLESALE A4 BILL) */}
            <WholesaleA4InvoiceModal
                isOpen={saleDetailModalOpen}
                onClose={() => setSaleDetailModalOpen(false)}
                invoice={selectedSaleDetail}
                settings={settings}
                prevBalance={selectedSaleDetail?.current_customer_balance !== undefined
                    ? (parseFloat(selectedSaleDetail.current_customer_balance) - (parseFloat(selectedSaleDetail.remaining_balance) || 0))
                    : (selectedCustomer?.balance !== undefined ? (parseFloat(selectedCustomer.balance) - (parseFloat(selectedSaleDetail?.remaining_balance) || 0)) : 0)}
                newBalance={selectedSaleDetail?.current_customer_balance !== undefined
                    ? parseFloat(selectedSaleDetail.current_customer_balance)
                    : null}
                onOpenThermal={() => setThermalModalOpen(true)}
                onPrintA4={() => handlePrintSaleBill('a4')}
                onSendWhatsApp={handleSendSaleBillWhatsApp}
                waSending={waSending}
                elemId="printable-invoice-a4"
            />

            {/* DEDICATED 80mm THERMAL RECEIPT MODAL (PREVIEW & DIRECT PRINT) */}
            {thermalModalOpen && selectedSaleDetail && (() => {
                const prevBal = selectedSaleDetail.current_customer_balance !== undefined
                    ? (parseFloat(selectedSaleDetail.current_customer_balance) - (parseFloat(selectedSaleDetail.remaining_balance) || 0))
                    : (selectedCustomer?.balance !== undefined ? (parseFloat(selectedCustomer.balance) - (parseFloat(selectedSaleDetail.remaining_balance) || 0)) : 0);
                const newBal = selectedSaleDetail.current_customer_balance !== undefined
                    ? parseFloat(selectedSaleDetail.current_customer_balance)
                    : (prevBal + (parseFloat(selectedSaleDetail.remaining_balance) || 0));

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
                        <div className="bg-white rounded-2xl sm:rounded-3xl max-w-sm w-full shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] sm:max-h-[88vh] overflow-hidden">
                            {/* Header (Pinned) */}
                            <div className="shrink-0 flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-white">
                                <div className="flex items-center gap-1.5">
                                    <IconReceipt className="w-4 h-4 text-black" />
                                    <h3 className="font-extrabold text-gray-900 text-sm">Thermal Receipt Preview</h3>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handlePrintSaleBill('thermal')}
                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                        className="btn-black !bg-black !text-white px-3 py-1 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <IconPrinter className="w-3.5 h-3.5 text-white" />
                                        <span>Print</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setThermalModalOpen(false)}
                                        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
                                    >
                                        <IconClose className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Thermal Slip Container */}
                            <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-gray-100/70 flex justify-center">
                                {saleDetailLoading ? (
                                    <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                        <IconSpinner className="w-4 h-4 text-[#B8860B]" />
                                        Loading receipt details...
                                    </div>
                                ) : (
                                    <ThermalReceipt
                                        invoice={selectedSaleDetail}
                                        settings={settings}
                                        cashierName={selectedSaleDetail.created_by_name || selectedSaleDetail.cashier_name || user?.full_name || user?.username || 'Cashier'}
                                        prevBalance={prevBal}
                                        newBalance={newBal}
                                        elemId="printable-invoice-thermal"
                                    />
                                )}
                            </div>

                            {/* Bottom Actions (Pinned) */}
                            <div className="shrink-0 flex gap-2 p-3 sm:px-4 sm:py-3 border-t border-gray-100 bg-white">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setThermalModalOpen(false);
                                        setSaleDetailModalOpen(true);
                                    }}
                                    style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                    className="flex-1 py-2 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer text-center"
                                >
                                    View Full A4 Bill
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePrintSaleBill('thermal')}
                                    style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                    className="btn-black !bg-black !text-white flex-1 py-2 rounded-xl font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                                >
                                    <IconPrinter className="w-3.5 h-3.5 text-white" />
                                    <span>Print Receipt</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ADD / EDIT WHOLESALE CUSTOMER MODAL (CRUD) */}
            {customerModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2.5 sm:p-4 overflow-y-auto">
                    <form
                        onSubmit={handleSaveCustomer}
                        className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl border border-[#F3E5AB] max-h-[96vh] overflow-y-auto"
                    >
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-extrabold text-gray-900 text-sm sm:text-base flex items-center gap-2">
                                <IconCustomers className="w-4 sm:w-5 h-4 sm:h-5 text-[#B8860B]" />
                                <span>{isEditing ? 'Edit Customer Profile' : 'Add New Wholesale Customer'}</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setCustomerModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">
                                    Customer / Contact Person Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Haji Muhammad Khan"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">
                                    Business / Shop Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Khan Wholesale Traders Timergara"
                                    value={formData.business_name}
                                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">
                                    Mobile Phone *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="0300-1234567"
                                    value={formData.mobile}
                                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">
                                    Shop / Delivery Address
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Main Bazar, Timergara"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-900 focus:bg-white focus:outline-none"
                                />
                            </div>

                            {!isEditing && (
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Opening Due Balance (Rs.)
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={formData.opening_balance}
                                        onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold font-mono text-gray-900 focus:bg-white focus:outline-none"
                                    />
                                    <span className="text-[10px] text-gray-400">
                                        Enter any existing market balance owed by this customer.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setCustomerModalOpen(false)}
                                className="w-full sm:flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="w-full sm:flex-1 py-2.5 gold-gradient text-white rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition-all cursor-pointer"
                            >
                                {isEditing ? 'Update Profile' : 'Save Customer Profile'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* PAYMENT RECOVERY VOUCHER / RECEIPT MODAL (Printable) */}
            {paymentReceiptModalOpen && selectedPaymentReceipt && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl border border-[#F3E5AB] max-h-[96vh] overflow-y-auto">
                        {/* Printable Voucher Section */}
                        <div id="printable-payment-receipt" className="border border-gray-200 rounded-xl p-3 sm:p-4 bg-white space-y-3">
                            <div className="text-center border-b border-gray-100 pb-2">
                                <h3 className="font-black text-sm sm:text-base text-[#B8860B]">{(settings?.shop_name || 'HILAL WHOLESALE TRADERS').toUpperCase()}</h3>
                                <p className="text-[10px] text-gray-500">{settings?.shop_address || 'Main Market, Timergara, Dir Lower'} • Phone: {settings?.shop_phone || '0945-825555 / 0300-1234567'}</p>
                                <div className="inline-block mt-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-black rounded border border-emerald-200 uppercase tracking-wider">
                                    Customer Payment Recovery Receipt
                                </div>
                            </div>

                            <div className="text-[11px] space-y-1.5 text-gray-700">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Voucher / Slip #:</span>
                                    <span className="font-mono font-bold text-gray-900">
                                        {selectedPaymentReceipt.reference_no || `RCP-${String(selectedPaymentReceipt.id).padStart(5, '0')}`}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Date:</span>
                                    <span className="font-semibold text-gray-800">
                                        {formatOnlyDate(selectedPaymentReceipt.payment_date || selectedPaymentReceipt.created_at)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Received From:</span>
                                    <span className="font-bold text-gray-900 text-right">
                                        {selectedPaymentReceipt.party_name}
                                        {selectedPaymentReceipt.party_business && (
                                            <span className="block text-[10px] text-gray-500 font-normal">
                                                {selectedPaymentReceipt.party_business}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Contact #:</span>
                                    <span className="font-mono text-gray-700">
                                        {selectedPaymentReceipt.party_phone || 'None'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Payment Mode:</span>
                                    <span className="font-bold uppercase text-gray-800">
                                        {selectedPaymentReceipt.payment_method || 'cash'}
                                    </span>
                                </div>
                                {selectedPaymentReceipt.reference_no && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Reference / Cheque #:</span>
                                        <span className="font-mono font-semibold text-gray-800">
                                            {selectedPaymentReceipt.reference_no}
                                        </span>
                                    </div>
                                )}
                                {selectedPaymentReceipt.notes && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Description:</span>
                                        <span className="text-gray-700 text-right max-w-[200px]">
                                            {selectedPaymentReceipt.notes}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Amount Box */}
                            <div className="bg-[#FEF9E7] p-3 rounded-xl border border-[#F3E5AB] space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-xs text-gray-700">Amount Received:</span>
                                    <span className="text-base sm:text-lg font-black text-emerald-800 font-mono">
                                        Rs. {Number(selectedPaymentReceipt.amount || 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="text-[10px] text-gray-600 font-medium italic border-t border-[#F3E5AB] pt-1">
                                    {numberToWords(selectedPaymentReceipt.amount)}
                                </div>
                            </div>

                            <div className="pt-6 flex justify-between text-[10px] text-gray-400 border-t border-gray-100">
                                <div>Cashier: Authorized</div>
                                <div>Customer Signature: ____________</div>
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={() => setPaymentReceiptModalOpen(false)}
                                className="w-full sm:flex-1 py-2 border border-gray-300 rounded-xl font-bold text-xs hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintPaymentReceipt}
                                className="w-full sm:flex-1 py-2 gold-gradient hover:opacity-90 text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                                <IconPrinter className="w-4 h-4" />
                                <span>Print Receipt</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* SMALL ACTION MODAL (Opened from 3-dots icon: Edit & Delete)   */}
            {/* ───────────────────────────────────────────────────────────── */}
            {actionModalCustomer && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setActionModalCustomer(null)}
                >
                    <div
                        className="bg-white rounded-2xl max-w-sm w-full p-5 border border-[#F3E5AB] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FEF9E7] to-[#FDF4D1] border border-[#F3E5AB] flex items-center justify-center font-black text-sm text-[#B8860B] shrink-0 shadow-2xs">
                                    {actionModalCustomer.name?.slice(0, 2).toUpperCase() || 'CU'}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-extrabold text-sm text-gray-900 truncate">
                                        {actionModalCustomer.name}
                                    </h4>
                                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
                                        <span className="font-semibold text-[#B8860B]">
                                            {actionModalCustomer.business_name || 'Wholesale Client'}
                                        </span>
                                        <span>•</span>
                                        <span>ID: #{actionModalCustomer.id}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActionModalCustomer(null)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                title="Close"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Quick Balance & Credit Status */}
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                            <div>
                                <div className="text-[10px] text-gray-400 uppercase font-semibold">Net Balance</div>
                                <div className={`font-black text-sm tracking-tight ${
                                    (parseFloat(actionModalCustomer.balance) || 0) > 0
                                        ? 'text-rose-600'
                                        : (parseFloat(actionModalCustomer.balance) || 0) < 0
                                            ? 'text-blue-600'
                                            : 'text-emerald-700'
                                }`}>
                                    Rs. {Number(Math.abs(parseFloat(actionModalCustomer.balance) || 0)).toLocaleString()}
                                </div>
                                <div className="text-[10px] font-medium mt-0.5">
                                    {(parseFloat(actionModalCustomer.balance) || 0) > 0 ? (
                                        <span className="text-rose-600 font-semibold">Outstanding Due</span>
                                    ) : (parseFloat(actionModalCustomer.balance) || 0) < 0 ? (
                                        <span className="text-blue-600 font-semibold">Advance Credit</span>
                                    ) : (
                                        <span className="text-emerald-700 font-semibold">Fully Cleared</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400 uppercase font-semibold">Credit Facility</div>
                                <div className="text-xs font-black text-gray-800 tracking-tight">
                                    Rs. {Number(actionModalCustomer.credit_limit || 0).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                    {actionModalCustomer.phone || actionModalCustomer.mobile || 'Timergara'}
                                </div>
                            </div>
                        </div>

                        {/* Actions: Edit, Delete, and WhatsApp */}
                        <div className="space-y-2">
                            {/* 1. Edit Customer Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const cust = actionModalCustomer;
                                    setActionModalCustomer(null);
                                    handleOpenEditCustomer(cust);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-gray-800 bg-gray-50 hover:bg-amber-50 hover:text-[#B8860B] rounded-xl border border-gray-200 transition-all cursor-pointer group shadow-2xs active:scale-95"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-gray-200 group-hover:border-[#D4AF37]/50 text-gray-600 group-hover:text-[#B8860B]">
                                        <IconEdit className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Edit Customer Profile</div>
                                        <div className="text-[10px] text-gray-400 font-normal">Update shop name, contact, address & credit</div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#B8860B]" />
                            </button>

                            {/* 2. WhatsApp Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const cust = actionModalCustomer;
                                    setActionModalCustomer(null);
                                    handleSendWhatsAppReminder(cust);
                                }}
                                disabled={waSending}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-all cursor-pointer group shadow-2xs active:scale-95 disabled:opacity-50"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-600">
                                        <IconWhatsApp className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Share Statement on WhatsApp</div>
                                        <div className="text-[10px] text-emerald-600 font-normal">Send dues balance & ledger to client</div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-emerald-600" />
                            </button>

                            {/* Returns & Credit Notes Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const cust = actionModalCustomer;
                                    setActionModalCustomer(null);
                                    handleOpenLedger(cust);
                                    setActiveLedgerTab('returns');
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-purple-900 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 transition-all cursor-pointer group shadow-2xs active:scale-95"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-purple-200 text-purple-700">
                                        <IconReturn className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Returns &amp; Credit Notes</div>
                                        <div className="text-[10px] text-purple-600 font-normal">View vouchers, restock items &amp; credit notes</div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-purple-600" />
                            </button>

                            {/* 3. Delete Customer Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const cust = actionModalCustomer;
                                    setActionModalCustomer(null);
                                    handleDeleteCustomer(cust);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl border bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 transition-all cursor-pointer group shadow-2xs active:scale-95"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-rose-200 text-rose-600">
                                        <IconTrash className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Delete Customer Account</div>
                                        <div className="text-[10px] font-normal text-rose-500">
                                            Soft-deletes profile while preserving sales history
                                        </div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-rose-500" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Non-Blocking Alert & Confirmation Dialog */}
            <CustomModalAlert
                {...modalAlert}
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
            />

            {/* PROCESS SALES RETURN & CREDIT NOTE MODAL */}
            {returnModalOpen && returnSelectedSale && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSubmitReturn} className="bg-white rounded-2xl sm:rounded-3xl max-w-xl w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl my-4 sm:my-8 border border-[#F3E5AB] max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b pb-3">
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-sm sm:text-base flex items-center gap-2">
                                    <IconReturn className="w-4 sm:w-5 h-4 sm:h-5 text-purple-700" />
                                    <span>Process Customer Sales Return</span>
                                </h3>
                                <div className="text-xs text-[#B8860B] font-bold mt-0.5">
                                    Invoice: <span className="font-mono">{returnSelectedSale.invoice_no}</span> • {selectedCustomer?.name || 'Customer'}
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
                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">Return Condition &amp; Restock Policy</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                    <label className={`p-3 rounded-2xl border flex items-center gap-2 cursor-pointer font-bold transition-all ${
                                        returnType === 'saleable' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-gray-50 text-gray-700 border-gray-200'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="custReturnType"
                                            value="saleable"
                                            checked={returnType === 'saleable'}
                                            onChange={() => setReturnType('saleable')}
                                            className="accent-emerald-600"
                                        />
                                        <span>Restock (Saleable Stock)</span>
                                    </label>
                                    <label className={`p-3 rounded-2xl border flex items-center gap-2 cursor-pointer font-bold transition-all ${
                                        returnType === 'damaged' ? 'bg-rose-50 border-rose-400 text-rose-800' : 'bg-gray-50 text-gray-700 border-gray-200'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="custReturnType"
                                            value="damaged"
                                            checked={returnType === 'damaged'}
                                            onChange={() => setReturnType('damaged')}
                                            className="accent-rose-600"
                                        />
                                        <span>Damaged / Lost Stock</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <div className="font-bold text-gray-800 mb-2">Select Items &amp; Quantities to Return:</div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {returnItems.map((it, idx) => (
                                        <div key={idx} className="bg-gray-50 p-3 rounded-2xl border border-gray-200 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="font-extrabold text-gray-900">
                                                    {it.product_name} {it.variant_name && it.variant_name !== 'Standard' ? `(${it.variant_name})` : ''}
                                                </div>
                                                <div className="text-[11px] text-gray-500 font-medium">
                                                    Sold: {it.max_quantity} {it.packaging_name} @ Rs. {Number(it.unit_price).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500 font-medium">Return:</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={it.max_quantity}
                                                    value={it.return_quantity}
                                                    onChange={(e) => handleUpdateReturnQty(idx, e.target.value)}
                                                    className="w-16 p-1.5 border rounded-xl bg-white font-extrabold text-center text-rose-700 focus:border-rose-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* REFUND SETTLEMENT METHOD (KHATA VS CASH DRAWER) */}
                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">
                                    Refund Settlement Method / کھاتہ یا کیش کا فیصلہ
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div
                                        onClick={() => setRefundMethod('credit')}
                                        className={`p-3 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${
                                            refundMethod === 'credit'
                                                ? 'bg-amber-50/80 border-[#D4AF37] text-gray-900 shadow-xs ring-1 ring-[#D4AF37]'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="custRefundMethod"
                                                value="credit"
                                                checked={refundMethod === 'credit'}
                                                onChange={() => setRefundMethod('credit')}
                                                className="accent-[#B8860B] cursor-pointer"
                                            />
                                            <span className="font-bold text-gray-900">Credit to Khata (کھاتہ)</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5">
                                            Deducts from customer's due balance. No cash handed out. Official Credit Note generated.
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => setRefundMethod('cash')}
                                        className={`p-3 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${
                                            refundMethod === 'cash'
                                                ? 'bg-emerald-50 border-emerald-500 text-gray-900 shadow-xs ring-1 ring-emerald-500'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="custRefundMethod"
                                                value="cash"
                                                checked={refundMethod === 'cash'}
                                                onChange={() => setRefundMethod('cash')}
                                                className="accent-emerald-600 cursor-pointer"
                                            />
                                            <span className="font-bold text-gray-900">Cash Refund (کاؤنٹر کیش)</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5">
                                            Cash paid back from register drawer. Customer balance unchanged.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 flex justify-between items-center">
                                <span className="font-bold text-purple-900">Total Refund / Credit Value:</span>
                                <span className="text-sm sm:text-base font-black text-purple-900 font-mono">
                                    Rs. {refundAmount.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setReturnModalOpen(false)}
                                className="w-full sm:w-auto px-4 py-2 border rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={returnSubmitting || refundAmount <= 0}
                                className="w-full sm:w-auto px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                            >
                                <IconReturn className="w-3.5 h-3.5" />
                                <span>{returnSubmitting ? 'Processing...' : 'Issue Credit Note & Restock'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Official Credit Note Modal (PDF View, Print, WhatsApp) */}
            <CreditNoteModal
                isOpen={creditNoteModalOpen}
                onClose={() => setCreditNoteModalOpen(false)}
                returnId={selectedReturnIdForCreditNote}
                settings={settings}
            />
        </div>
    );
}
