'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
    IconSales,
    IconPayments,
    IconExpenses,
    IconInventory,
    IconPrinter,
    IconCalendar,
    IconSearch,
    IconSpinner,
    IconRefresh,
    IconWarning,
    IconBill,
    IconReturn,
    IconReceipt,
    IconEye,
    IconClose,
    IconPackage,
    IconCheck
} from '../components/Icons';
import CreditNoteModal from '../components/CreditNoteModal';

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

export default function ReportsPage() {
    // Dynamic Date Duration Filter: Select dropdown (Default: 'today' - 'all' option completely removed)
    const [dateDuration, setDateDuration] = useState('today');
    const [customStartDate, setCustomStartDate] = useState(() => toYMD(new Date()));
    const [customEndDate, setCustomEndDate] = useState(() => toYMD(new Date()));

    // Active Activity Tab: 'sales' is default and primary
    const [activeReportTab, setActiveReportTab] = useState('sales'); // 'sales' | 'items' | 'returns'

    // Data states
    const [financialSummary, setFinancialSummary] = useState(null);
    const [salesSummary, setSalesSummary] = useState(null);
    const [salesList, setSalesList] = useState([]);
    const [paymentsList, setPaymentsList] = useState([]);
    const [returnsList, setReturnsList] = useState([]);
    const [itemSales, setItemSales] = useState([]);
    const [totalProductsCount, setTotalProductsCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Search and filter states
    const [salesSearch, setSalesSearch] = useState('');
    const [salesStatusFilter, setSalesStatusFilter] = useState('ALL'); // 'ALL' | 'PAID' | 'UNPAID'
    const [itemSearch, setItemSearch] = useState('');

    // Modal states
    const [selectedReturnId, setSelectedReturnId] = useState(null);
    const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
    const [selectedSaleDetail, setSelectedSaleDetail] = useState(null);
    const [saleDetailModalOpen, setSaleDetailModalOpen] = useState(false);
    const [saleDetailLoading, setSaleDetailLoading] = useState(false);

    // Compute start and end dates based on selected dateDuration
    const { startDate, endDate, durationLabel } = useMemo(() => {
        const todayObj = new Date();
        const todayStr = toYMD(todayObj);

        if (dateDuration === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yStr = toYMD(y);
            return {
                startDate: yStr,
                endDate: yStr,
                durationLabel: `Yesterday (${y.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })})`
            };
        }
        if (dateDuration === 'this_week') {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(now.setDate(diff));
            return {
                startDate: toYMD(monday),
                endDate: todayStr,
                durationLabel: 'This Week'
            };
        }
        if (dateDuration === 'this_month') {
            const now = new Date();
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            return {
                startDate: startOfMonth,
                endDate: todayStr,
                durationLabel: 'This Month'
            };
        }
        if (dateDuration === 'custom') {
            return {
                startDate: customStartDate,
                endDate: customEndDate,
                durationLabel: `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'End'})`
            };
        }
        // Default: 'today'
        return {
            startDate: todayStr,
            endDate: todayStr,
            durationLabel: `Today (${todayObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })})`
        };
    }, [dateDuration, customStartDate, customEndDate]);

    // Fetch reports data whenever date filters change
    useEffect(() => {
        fetchReportsData();
    }, [startDate, endDate]);

    const fetchReportsData = async () => {
        setLoading(true);
        try {
            const dateParams = (startDate && endDate) ? `?startDate=${startDate}&endDate=${endDate}` : '';
            const salesDateParam = `dateFilter=${dateDuration}${startDate && endDate ? `&startDate=${startDate}&endDate=${endDate}` : ''}`;

            const [resSummary, resItems, resSales, resPayments, resReturns, resProducts] = await Promise.all([
                fetch(`http://localhost:5000/api/reports/financial-summary${dateParams}`).catch(() => null),
                fetch(`http://localhost:5000/api/reports/item-sales${dateParams}`).catch(() => null),
                fetch(`http://localhost:5000/api/sales?page=1&limit=500&${salesDateParam}`).catch(() => null),
                fetch(`http://localhost:5000/api/payments`).catch(() => null),
                fetch(`http://localhost:5000/api/sales/returns${dateParams}`).catch(() => null),
                fetch(`http://localhost:5000/api/products`).catch(() => null)
            ]);

            if (resSummary && resSummary.ok) {
                setFinancialSummary(await resSummary.json());
            }
            if (resItems && resItems.ok) {
                setItemSales(await resItems.json());
            }
            if (resSales && resSales.ok) {
                const sData = await resSales.json();
                setSalesSummary(sData.summary || null);
                setSalesList(sData.data || []);
            }
            if (resPayments && resPayments.ok) {
                setPaymentsList(await resPayments.json());
            }
            if (resReturns && resReturns.ok) {
                setReturnsList(await resReturns.json());
            }
            if (resProducts && resProducts.ok) {
                const pData = await resProducts.json();
                setTotalProductsCount(Array.isArray(pData) ? pData.length : 0);
            }
        } catch (err) {
            console.error('Failed to load reports data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter sales list by search & payment status
    const filteredSales = useMemo(() => {
        return (salesList || []).filter(s => {
            if (salesStatusFilter === 'PAID' && Number(s.remaining_balance || 0) > 0) return false;
            if (salesStatusFilter === 'UNPAID' && Number(s.remaining_balance || 0) <= 0) return false;
            if (!salesSearch.trim()) return true;
            const q = salesSearch.toLowerCase();
            return (
                (s.invoice_no && s.invoice_no.toLowerCase().includes(q)) ||
                (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
                (s.customer_business && s.customer_business.toLowerCase().includes(q)) ||
                (s.customer_phone && s.customer_phone.includes(q)) ||
                (s.cashier_name && s.cashier_name.toLowerCase().includes(q))
            );
        });
    }, [salesList, salesSearch, salesStatusFilter]);

    // Filter items by search
    const filteredItems = useMemo(() => {
        if (!itemSearch.trim()) return itemSales;
        const q = itemSearch.toLowerCase();
        return itemSales.filter(it =>
            (it.product_name && it.product_name.toLowerCase().includes(q)) ||
            (it.variant_name && it.variant_name.toLowerCase().includes(q)) ||
            (it.sku && it.sku.toLowerCase().includes(q))
        );
    }, [itemSales, itemSearch]);

    // View Sale Details in Modal
    const handleViewSaleBill = async (saleId) => {
        setSaleDetailLoading(true);
        setSaleDetailModalOpen(true);
        try {
            const res = await fetch(`http://localhost:5000/api/sales/${saleId}`);
            if (res.ok) {
                setSelectedSaleDetail(await res.json());
            }
        } catch (err) {
            console.error('Failed to load bill details:', err);
        } finally {
            setSaleDetailLoading(false);
        }
    };

    // Returns & Refunds
    const totalReturns = Number(financialSummary?.totalReturns ?? (returnsList.reduce((acc, r) => acc + (Number(r.total_refund) || 0), 0)));
    const cashRefunds = Number(financialSummary?.cashRefunds ?? (returnsList.filter(r => r.refund_method === 'cash').reduce((acc, r) => acc + (Number(r.total_refund) || 0), 0)));
    const creditReturns = Number(financialSummary?.creditReturns ?? (returnsList.filter(r => r.refund_method === 'credit' || !r.refund_method).reduce((acc, r) => acc + (Number(r.total_refund) || 0), 0)));
    const returnCount = Number(financialSummary?.returnCount ?? returnsList.length);

    // Accurately compute Recovered Dues (Wasooli)
    const calculatedRecoveredDues = useMemo(() => {
        if (financialSummary?.recoveredDues !== undefined) {
            return Math.max(0, Number(financialSummary.recoveredDues));
        }
        if (!paymentsList || paymentsList.length === 0) {
            return Math.max(0, Number(salesSummary?.totalRecoveredDues ?? 0));
        }

        const currentSalesInvoiceNos = new Set((salesList || []).map(s => s.invoice_no).filter(Boolean));

        const recoveredPayments = paymentsList.filter(p => {
            if (p.party_type !== 'customer') return false;
            if (Number(p.amount) <= 0) return false;
            if (p.notes && (p.notes.toLowerCase().includes('refund') || p.notes.toLowerCase().includes('return'))) return false;
            if (p.reference_no && (p.reference_no.startsWith('SALE-') || p.reference_no.startsWith('RET-') || p.reference_no.startsWith('CN-'))) return false;

            const pDate = toYMD(p.payment_date || p.created_at);
            if (startDate && endDate) {
                if (pDate < startDate || pDate > endDate) return false;
                return !currentSalesInvoiceNos.has(p.reference_no);
            }
            return !p.reference_no || !currentSalesInvoiceNos.has(p.reference_no);
        });

        return Math.max(0, recoveredPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
    }, [financialSummary, paymentsList, salesList, startDate, endDate, salesSummary]);

    // Accurately compute New Dues Added (Point-in-Time Credit)
    const calculatedNewDuesAdded = useMemo(() => {
        if (financialSummary?.newDuesAdded !== undefined) {
            return Number(financialSummary.newDuesAdded);
        }
        if (salesSummary?.totalPendingDues !== undefined) {
            return Math.max(0, Number(salesSummary.totalPendingDues) - creditReturns);
        }
        if (salesList && salesList.length > 0) {
            const rawDue = salesList.reduce((sum, s) => {
                const net = Number(s.net_amount) || 0;
                let initPaid = (s.initial_amount_paid !== undefined && s.initial_amount_paid !== null)
                    ? Number(s.initial_amount_paid)
                    : null;
                if (initPaid === null) {
                    const sDate = toYMD(s.created_at);
                    const sameDayPay = (paymentsList || []).filter(p => p.party_type === 'customer' && p.reference_no === s.invoice_no && toYMD(p.payment_date || p.created_at) === sDate);
                    if (sameDayPay.length > 0) {
                        initPaid = sameDayPay.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
                    } else if (Number(s.remaining_balance) >= net) {
                        initPaid = 0;
                    } else {
                        initPaid = Number(s.amount_paid) || 0;
                    }
                }
                return sum + Math.max(0, net - initPaid);
            }, 0);
            return Math.max(0, rawDue - creditReturns);
        }
        return 0;
    }, [financialSummary, salesSummary, creditReturns, salesList, paymentsList]);

    // Financial Values from Formula
    const totalSale = Number(financialSummary?.totalSale ?? salesSummary?.totalSale ?? 0);
    const recoveredDues = Number(calculatedRecoveredDues);
    const newDuesAdded = Number(calculatedNewDuesAdded);
    const expenses = Number(financialSummary?.expenses || 0);
    const discount = Number(financialSummary?.discount ?? salesSummary?.totalDiscount ?? 0);
    const stockPaid = Number(financialSummary?.stockPaid || 0);

    // Official Realized Gross Revenue Formula:
    // Gross Revenue = Total Sale + Recovered Dues - New Dues Added - Expenses - Discounts - Stock Paid - Returns
    const grossRevenue = Number(financialSummary?.grossRevenue ?? (totalSale + recoveredDues - newDuesAdded - expenses - discount - stockPaid - totalReturns));
    const saleCount = Number(financialSummary?.saleCount ?? salesSummary?.statusCounts?.ALL ?? (salesList?.length || 0));

    // Aggregates for Item Sales
    const totalItemsQtySold = filteredItems.reduce((sum, it) => sum + (Number(it.quantity_sold) || 0), 0);
    const totalItemsRevenue = filteredItems.reduce((sum, it) => sum + (Number(it.total_sales_amount) || 0), 0);
    const totalItemsCost = filteredItems.reduce((sum, it) => sum + (Number(it.total_cost_amount) || 0), 0);
    const totalItemsProfit = filteredItems.reduce((sum, it) => sum + (Number(it.total_profit) || 0), 0);
    const overallItemMargin = totalItemsRevenue > 0 ? ((totalItemsProfit / totalItemsRevenue) * 100).toFixed(1) : 0;

    // Aggregates for All Sales Invoices
    const totalInvoicedSalesSum = filteredSales.reduce((acc, s) => acc + (Number(s.net_amount) || 0), 0);
    const totalSalesDiscountSum = filteredSales.reduce((acc, s) => acc + ((Number(s.discount) || 0) + (Number(s.special_discount) || 0)), 0);
    const totalSalesPaidSum = filteredSales.reduce((acc, s) => acc + (Number(s.amount_paid) || 0), 0);
    const totalSalesDueSum = filteredSales.reduce((acc, s) => acc + (Number(s.remaining_balance) || 0), 0);

    return (
        <div className="space-y-5 sm:space-y-6 pb-12">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-2xs">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-black text-gray-900">Reports &amp; Financial Analytics</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF9E7] border border-[#F3E5AB] text-[#B8860B]">
                            Realized Revenue Engine
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-medium">
                        Real-time Gross Revenue formula analysis, cash flow yield &amp; complete sales transactions
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <button
                        type="button"
                        onClick={fetchReportsData}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl transition-all cursor-pointer shadow-2xs"
                        title="Refresh Analytics"
                    >
                        <IconRefresh className="w-4 h-4 text-gray-700" />
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                        className="btn-black !bg-black !text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-2xs flex items-center gap-2 cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                    >
                        <IconPrinter className="w-4 h-4 text-white" />
                        <span>Print Statement</span>
                    </button>
                </div>
            </div>

            {/* DYNAMIC DATE DURATION FILTER BAR (Dropdown Select - 'All Time' Removed) */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <IconCalendar className="w-4 h-4 text-[#B8860B]" />
                        <span>Date Filter:</span>
                    </div>
                    <select
                        value={dateDuration}
                        onChange={(e) => setDateDuration(e.target.value)}
                        className="px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 cursor-pointer hover:border-gray-300 transition-all"
                    >
                        <option value="today">Today (Default)</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="this_week">This Week</option>
                        <option value="this_month">This Month</option>
                        <option value="custom">Custom Date Range</option>
                    </select>

                    {dateDuration === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-gray-500 font-bold">From:</span>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30"
                            />
                            <span className="text-gray-400 font-bold">To:</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    const todayStr = toYMD(new Date());
                                    setCustomStartDate(todayStr);
                                    setCustomEndDate(todayStr);
                                }}
                                className="text-[11px] font-bold text-[#B8860B] hover:underline cursor-pointer ml-1"
                            >
                                Reset
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-xs font-medium text-gray-500 flex items-center gap-2">
                    <span>Active Period:</span>
                    <span className="px-3 py-1 rounded-lg bg-[#FEF9E7] border border-[#F3E5AB] font-bold text-[#B8860B]">
                        {durationLabel}
                    </span>
                </div>
            </div>

            {/* TOP 4 EXECUTIVE KPI SUMMARY CARDS (APP COLOR SCHEME) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* KPI 1: Total Products Count */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#D4AF37]/50 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Total Products
                        </span>
                        <div className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-[#B8860B]">
                            <IconPackage className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-gray-900 font-mono">
                        {totalProductsCount}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                        Active catalog products
                    </div>
                </div>

                {/* KPI 2: Total Sales Count */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#D4AF37]/50 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Total Sales Count
                        </span>
                        <div className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-[#B8860B]">
                            <IconSales className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-gray-900 font-mono">
                        {saleCount}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                        Completed orders in {durationLabel}
                    </div>
                </div>

                {/* KPI 3: Total Invoices Billed */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-1.5 hover:border-[#D4AF37]/50 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Total Invoices Billed
                        </span>
                        <div className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-[#B8860B]">
                            <IconBill className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-gray-900 font-mono">
                        Rs. {Math.round(totalSale).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                        Gross customer billings
                    </div>
                </div>

                {/* KPI 4: Realized Gross Revenue */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#FEF9E7] border border-[#F3E5AB] shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#B8860B] uppercase tracking-wider">
                            Realized Gross Revenue
                        </span>
                        <div className="p-2 rounded-xl bg-white border border-[#F3E5AB] text-[#B8860B]">
                            <IconReceipt className="w-4 h-4" />
                        </div>
                    </div>
                    <div className={`text-2xl sm:text-3xl font-black font-mono ${
                        grossRevenue >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                        Rs. {Math.round(grossRevenue).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-gray-600 font-medium">
                        Net Realized Inflow
                    </div>
                </div>
            </div>

            {/* HERO SECTION: GROSS REVENUE CALCULATION & FINANCIAL BREAKDOWN (APP COLOR SCHEME) */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-4 sm:p-6 space-y-5">
                {/* Header of Formula Card */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#FEF9E7] text-[#B8860B] border border-[#F3E5AB]">
                                Official Formula Engine
                            </span>
                            <span className="text-xs text-gray-500 font-medium">Period: {durationLabel}</span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mt-1">
                            Gross Revenue Calculation &amp; Financial Breakdown
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Measures the actual net cash realized in hand after factoring in collections, credit, shop costs &amp; inventory purchases.
                        </p>
                    </div>

                    <div className="p-3.5 sm:p-4 bg-[#FEF9E7] border border-[#F3E5AB] rounded-2xl text-left md:text-right shrink-0 min-w-[220px]">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                            Realized Gross Revenue
                        </div>
                        <div className={`text-2xl sm:text-3xl font-black font-mono mt-0.5 ${
                            grossRevenue >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}>
                            Rs. {Math.round(grossRevenue).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 font-medium">
                            Net Realized Business Inflow
                        </div>
                    </div>
                </div>

                {/* VISUAL EQUATION DISPLAY BAR (Clean & App Color Palette) */}
                <div className="bg-gray-50 p-3.5 sm:p-4 rounded-xl border border-gray-200 space-y-2">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        Mathematical Formula Equation:
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-mono font-medium">
                        <span className="px-3 py-1.5 rounded-lg bg-[#FEF9E7] border border-[#F3E5AB] text-[#B8860B] font-black text-xs sm:text-sm">
                            Gross Revenue
                        </span>
                        <span className="text-gray-400 font-bold text-sm sm:text-base">=</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Total Sale
                        </span>
                        <span className="text-emerald-600 font-bold text-sm sm:text-base">+</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Recovered Dues
                        </span>
                        <span className="text-rose-500 font-bold text-sm sm:text-base">-</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            New Dues Added
                        </span>
                        <span className="text-rose-500 font-bold text-sm sm:text-base">-</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Expenses
                        </span>
                        <span className="text-rose-500 font-bold text-sm sm:text-base">-</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Discounts
                        </span>
                        <span className="text-rose-500 font-bold text-sm sm:text-base">-</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Stock Paid
                        </span>
                        <span className="text-rose-500 font-bold text-sm sm:text-base">-</span>
                        <span className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-900 font-bold shadow-2xs">
                            Returns
                        </span>
                    </div>
                </div>

                {/* 8 FACTOR CARDS IN PROFESSIONAL 4x2 BALANCED GRID (APP COLOR PALETTE) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-mono">
                    {/* 1. Total Sale */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Total Sale
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                (+)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(totalSale).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            {saleCount} order(s)
                        </div>
                    </div>

                    {/* 2. Recovered Dues */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Recovered Dues
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                (+)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(recoveredDues).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            Old debt collected
                        </div>
                    </div>

                    {/* 3. New Dues Added */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                New Dues Added
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                (-)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(newDuesAdded).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            Udhar / Credit sales
                        </div>
                    </div>

                    {/* 4. Expenses */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Expenses
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                (-)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(expenses).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            Shop expenses
                        </div>
                    </div>

                    {/* 5. Discounts */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Discounts
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                (-)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(discount).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            Customer discount
                        </div>
                    </div>

                    {/* 6. Stock Paid */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Stock Paid
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                (-)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(stockPaid).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            To suppliers
                        </div>
                    </div>

                    {/* 7. Returns */}
                    <div className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 font-sans uppercase tracking-wider">
                                Returns
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                (-)
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-gray-900">
                            Rs. {Math.round(totalReturns).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500 font-sans">
                            {returnCount} return(s)
                        </div>
                    </div>

                    {/* 8. Gross Revenue Result */}
                    <div className="p-4 rounded-xl bg-[#FEF9E7] border-2 border-[#D4AF37] space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#B8860B] font-sans uppercase tracking-wider">
                                Gross Revenue
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-[#B8860B] text-white font-bold">
                                (=)
                            </span>
                        </div>
                        <div className={`text-xl sm:text-2xl font-black ${
                            grossRevenue >= 0 ? 'text-emerald-800' : 'text-rose-700'
                        }`}>
                            Rs. {Math.round(grossRevenue).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-600 font-sans font-medium">
                            Net Realized Inflow
                        </div>
                    </div>
                </div>
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* ALL SALES INVOICES & REPORTS DETAIL SECTION                   */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
                {/* Clean Tab Navigation Bar */}
                <div className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3 border-b border-gray-200 bg-gray-50/50 text-xs font-bold">
                    <button
                        type="button"
                        onClick={() => setActiveReportTab('sales')}
                        className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                            activeReportTab === 'sales'
                                ? 'bg-black text-white shadow-xs'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200'
                        }`}
                    >
                        <IconSales className="w-4 h-4" />
                        <span>All Sales Invoices ({salesList.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveReportTab('items')}
                        className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                            activeReportTab === 'items'
                                ? 'bg-black text-white shadow-xs'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200'
                        }`}
                    >
                        <IconInventory className="w-4 h-4" />
                        <span>Item-wise Sales &amp; Profit ({filteredItems.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveReportTab('returns')}
                        className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                            activeReportTab === 'returns'
                                ? 'bg-black text-white shadow-xs'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200'
                        }`}
                    >
                        <IconReturn className="w-4 h-4" />
                        <span>Returns &amp; Credit Notes ({returnsList.length})</span>
                    </button>
                </div>

                {/* ───────────────────────────────────────────────────────────── */}
                {/* TAB 1: ALL SALES INVOICES TABLE (VERY CLEAR & PROFESSIONAL)   */}
                {/* ───────────────────────────────────────────────────────────── */}
                {activeReportTab === 'sales' && (
                    <div className="p-4 sm:p-5 space-y-4">
                        {/* Subheader & Search / Filters */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <IconSales className="w-5 h-5 text-[#B8860B]" />
                                    <h3 className="font-bold text-gray-900 text-base">
                                        All Sales Invoices ({filteredSales.length})
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Detailed sales transaction records, settlement amounts and dues for {durationLabel}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <select
                                    value={salesStatusFilter}
                                    onChange={(e) => setSalesStatusFilter(e.target.value)}
                                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30 cursor-pointer"
                                >
                                    <option value="ALL">All Payment Statuses</option>
                                    <option value="PAID">Paid in Full</option>
                                    <option value="UNPAID">Unpaid / Has Due</option>
                                </select>

                                <div className="relative w-full sm:w-64">
                                    <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search invoice #, customer..."
                                        value={salesSearch}
                                        onChange={(e) => setSalesSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats Chips */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                <span className="text-[10px] text-gray-500 font-bold uppercase block">Invoices</span>
                                <span className="font-black text-gray-900 font-mono text-sm">{filteredSales.length} orders</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                <span className="text-[10px] text-gray-500 font-bold uppercase block">Total Invoiced</span>
                                <span className="font-black text-gray-900 font-mono text-sm">Rs. {Math.round(totalInvoicedSalesSum).toLocaleString()}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200">
                                <span className="text-[10px] text-rose-800 font-bold uppercase block">Total Discount</span>
                                <span className="font-black text-rose-700 font-mono text-sm">
                                    {totalSalesDiscountSum > 0 ? `-Rs. ${Math.round(totalSalesDiscountSum).toLocaleString()}` : 'Rs. 0'}
                                </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                                <span className="text-[10px] text-emerald-800 font-bold uppercase block">Total Paid</span>
                                <span className="font-black text-emerald-700 font-mono text-sm">Rs. {Math.round(totalSalesPaidSum).toLocaleString()}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                                <span className="text-[10px] text-gray-600 font-bold uppercase block">Total Due</span>
                                <span className="font-black text-rose-600 font-mono text-sm">Rs. {Math.round(totalSalesDueSum).toLocaleString()}</span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-16 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                <IconSpinner className="w-5 h-5 text-[#B8860B]" />
                                <span>Loading sales records...</span>
                            </div>
                        ) : filteredSales.length === 0 ? (
                            <div className="text-center py-12 space-y-2">
                                <IconBill className="w-10 h-10 text-gray-300 mx-auto" />
                                <div className="text-sm font-semibold text-gray-700">No Sales Invoices Found in {durationLabel}</div>
                                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                                    No sales transactions match your current search and date filters.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                                            <th className="p-3">Invoice # / Date</th>
                                            <th className="p-3">Customer Details</th>
                                            <th className="p-3 text-center">Cashier</th>
                                            <th className="p-3 text-center">Method</th>
                                            <th className="p-3 text-right">Bill Total</th>
                                            <th className="p-3 text-right">Discount</th>
                                            <th className="p-3 text-right">Amount Paid</th>
                                            <th className="p-3 text-right">Remaining Due</th>
                                            <th className="p-3 text-center">Status</th>
                                            <th className="p-3 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-mono">
                                        {filteredSales.map((sale) => {
                                            const netAmt = Number(sale.net_amount || 0);
                                            const discountAmt = (Number(sale.discount) || 0) + (Number(sale.special_discount) || 0);
                                            const grossAmt = Number(sale.gross_amount || 0) || (netAmt + discountAmt);
                                            const paidAmt = Number(sale.amount_paid || 0);
                                            const dueAmt = Number(sale.remaining_balance || 0);
                                            const isFullyPaid = dueAmt <= 0;

                                            return (
                                                <tr key={sale.id} className="hover:bg-amber-50/15 transition-colors">
                                                    {/* Invoice # & Date */}
                                                    <td className="p-3 font-sans">
                                                        <div className="font-bold text-gray-900 text-xs font-mono">
                                                            #{sale.invoice_no}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                                            {sale.created_at ? sale.created_at.replace('T', ' ') : '-'}
                                                        </div>
                                                    </td>

                                                    {/* Customer */}
                                                    <td className="p-3 font-sans">
                                                        <div className="font-semibold text-gray-900 text-xs">
                                                            {sale.customer_name || 'Walk-in Customer'}
                                                        </div>
                                                        {(sale.customer_business || sale.customer_phone) && (
                                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                                {sale.customer_business ? `${sale.customer_business} • ` : ''}{sale.customer_phone}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Cashier */}
                                                    <td className="p-3 text-center font-sans text-gray-600">
                                                        <span className="px-2 py-0.5 rounded bg-gray-100 text-[10.5px] font-medium">
                                                            {sale.cashier_name || 'Cashier'}
                                                        </span>
                                                    </td>

                                                    {/* Method */}
                                                    <td className="p-3 text-center font-sans">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200">
                                                            {sale.payment_method || 'Cash'}
                                                        </span>
                                                    </td>

                                                    {/* Bill Total */}
                                                    <td className="p-3 text-right font-mono">
                                                        <div className="font-black text-gray-900 text-xs">
                                                            Rs. {netAmt.toLocaleString()}
                                                        </div>
                                                        {discountAmt > 0 && (
                                                            <div className="text-[10px] text-gray-400 line-through">
                                                                Rs. {grossAmt.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Discount Column */}
                                                    <td className="p-3 text-right font-mono">
                                                        {discountAmt > 0 ? (
                                                            <span className="inline-block px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[11px]">
                                                                -Rs. {discountAmt.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 font-sans text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Amount Paid */}
                                                    <td className="p-3 text-right font-bold text-emerald-700">
                                                        Rs. {paidAmt.toLocaleString()}
                                                    </td>

                                                    {/* Remaining Due */}
                                                    <td className="p-3 text-right font-bold">
                                                        {dueAmt > 0 ? (
                                                            <span className="text-rose-600">Rs. {dueAmt.toLocaleString()}</span>
                                                        ) : (
                                                            <span className="text-gray-400 font-sans text-[11px]">-</span>
                                                        )}
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td className="p-3 text-center font-sans">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            isFullyPaid
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                        }`}>
                                                            {isFullyPaid ? 'Paid' : 'Unpaid / Due'}
                                                        </span>
                                                    </td>

                                                    {/* Action */}
                                                    <td className="p-3 text-center font-sans">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewSaleBill(sale.id)}
                                                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                                                            title="View full invoice details"
                                                        >
                                                            <IconEye className="w-3.5 h-3.5 text-gray-600" />
                                                            <span>View Bill</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-xs font-mono">
                                        <tr>
                                            <td colSpan={4} className="p-3 font-sans text-gray-900 font-bold whitespace-nowrap">
                                                Total Sales ({filteredSales.length} invoices)
                                            </td>
                                            <td className="p-3 text-right text-gray-900 font-black whitespace-nowrap">
                                                Rs. {Math.round(totalInvoicedSalesSum).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right text-rose-700 font-bold whitespace-nowrap">
                                                {totalSalesDiscountSum > 0 ? `-Rs. ${Math.round(totalSalesDiscountSum).toLocaleString()}` : '-'}
                                            </td>
                                            <td className="p-3 text-right text-emerald-700 font-bold whitespace-nowrap">
                                                Rs. {Math.round(totalSalesPaidSum).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right text-rose-600 font-bold whitespace-nowrap">
                                                Rs. {Math.round(totalSalesDueSum).toLocaleString()}
                                            </td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* TAB 2: ITEM-WISE SALES & PROFIT VALUE ANALYSIS TABLE          */}
                {/* ───────────────────────────────────────────────────────────── */}
                {activeReportTab === 'items' && (
                    <div className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <IconInventory className="w-5 h-5 text-[#B8860B]" />
                                    <h3 className="font-bold text-gray-900 text-base">
                                        Item-wise Sales &amp; Profit Value Breakdown
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Each product's sold quantity, sale rate, cost rate, revenue &amp; profit value for {durationLabel}
                                </p>
                            </div>

                            <div className="relative w-full sm:w-72">
                                <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filter by product or variant..."
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B8860B]/30"
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-16 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                <IconSpinner className="w-5 h-5 text-[#B8860B]" />
                                <span>Loading item sales and profit analysis...</span>
                            </div>
                        ) : filteredItems.length === 0 ? (
                            <div className="text-center py-12 space-y-2">
                                <IconInventory className="w-10 h-10 text-gray-300 mx-auto" />
                                <div className="text-sm font-semibold text-gray-700">No Item Sales Recorded for {durationLabel}</div>
                                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                                    No product sales occurred in this duration. Select another date duration above.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="w-full text-left text-xs border-collapse min-w-[750px]">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                                            <th className="p-3">Product Name &amp; Variant</th>
                                            <th className="p-3 text-center whitespace-nowrap">Packaging</th>
                                            <th className="p-3 text-center whitespace-nowrap">Quantity Sold</th>
                                            <th className="p-3 text-right whitespace-nowrap">Avg Sale Rate</th>
                                            <th className="p-3 text-right whitespace-nowrap">Cost Rate</th>
                                            <th className="p-3 text-right whitespace-nowrap">Total Revenue</th>
                                            <th className="p-3 text-right whitespace-nowrap">Cost of Goods</th>
                                            <th className="p-3 text-right whitespace-nowrap">Profit Value</th>
                                            <th className="p-3 text-center whitespace-nowrap">Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-mono">
                                        {filteredItems.map((item, idx) => {
                                            const profitVal = Number(item.total_profit || 0);
                                            const isProfitable = profitVal >= 0;

                                            return (
                                                <tr key={idx} className="hover:bg-amber-50/20 transition-colors">
                                                    <td className="p-3 font-sans min-w-[180px]">
                                                        <div className="font-semibold text-gray-900 text-xs">
                                                            {item.product_name}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                                                            <span>{item.variant_name || 'Standard'}</span>
                                                            {item.sku && <span>• {item.sku}</span>}
                                                        </div>
                                                    </td>

                                                    <td className="p-3 text-center font-sans whitespace-nowrap">
                                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 font-medium text-[10px] text-gray-700">
                                                            {item.packaging_name || 'Unit'}
                                                            {item.conversion_factor > 1 && ` (x${item.conversion_factor})`}
                                                        </span>
                                                    </td>

                                                    <td className="p-3 text-center font-bold text-gray-900 whitespace-nowrap">
                                                        {item.quantity_sold}
                                                    </td>

                                                    <td className="p-3 text-right font-medium text-gray-800 whitespace-nowrap">
                                                        Rs. {Number(item.avg_sale_price || 0).toLocaleString()}
                                                    </td>

                                                    <td className="p-3 text-right text-gray-500 whitespace-nowrap">
                                                        Rs. {Number(item.purchase_price || 0).toLocaleString()}
                                                    </td>

                                                    <td className="p-3 text-right font-bold text-gray-900 whitespace-nowrap">
                                                        Rs. {Number(item.total_sales_amount || 0).toLocaleString()}
                                                    </td>

                                                    <td className="p-3 text-right text-gray-500 whitespace-nowrap">
                                                        Rs. {Number(item.total_cost_amount || 0).toLocaleString()}
                                                    </td>

                                                    <td className="p-3 text-right font-bold whitespace-nowrap">
                                                        <span className={isProfitable ? 'text-emerald-700' : 'text-rose-600'}>
                                                            {isProfitable ? '+' : ''}Rs. {Math.round(profitVal).toLocaleString()}
                                                        </span>
                                                    </td>

                                                    <td className="p-3 text-center font-sans whitespace-nowrap">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                            isProfitable
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                        }`}>
                                                            {item.profit_margin_percent}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-xs font-mono">
                                        <tr>
                                            <td colSpan={2} className="p-3 font-sans text-gray-900 font-bold whitespace-nowrap">
                                                Summary Total ({filteredItems.length} items sold)
                                            </td>
                                            <td className="p-3 text-center font-bold text-gray-900 whitespace-nowrap">
                                                {totalItemsQtySold}
                                            </td>
                                            <td className="p-3 text-right text-gray-400">-</td>
                                            <td className="p-3 text-right text-gray-400">-</td>
                                            <td className="p-3 text-right text-gray-900 font-bold whitespace-nowrap">
                                                Rs. {Math.round(totalItemsRevenue).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right text-gray-600 whitespace-nowrap">
                                                Rs. {Math.round(totalItemsCost).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right font-bold text-emerald-800 text-sm whitespace-nowrap">
                                                +Rs. {Math.round(totalItemsProfit).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center font-sans text-emerald-800 font-bold whitespace-nowrap">
                                                {overallItemMargin}%
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* TAB 3: CUSTOMER SALES RETURNS & CREDIT NOTES TABLE             */}
                {/* ───────────────────────────────────────────────────────────── */}
                {activeReportTab === 'returns' && (
                    <div className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-xl bg-gray-100 text-gray-700 border border-gray-200">
                                        <IconReturn className="w-4 h-4 text-[#B8860B]" />
                                    </div>
                                    <h3 className="font-bold text-gray-900 text-base">
                                        Sales Returns &amp; Credit Notes Deducted ({returnsList.length})
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Customer returns, Credit Notes and cash refunds deducted in the Gross Revenue formula for {durationLabel}
                                </p>
                            </div>
                        </div>

                        {returnsList.length === 0 ? (
                            <div className="text-center py-10 space-y-1.5">
                                <IconReturn className="w-8 h-8 text-gray-300 mx-auto" />
                                <div className="text-xs font-semibold text-gray-700">No Sales Returns Recorded in {durationLabel}</div>
                                <p className="text-[11px] text-gray-400">
                                    Zero customer returns processed during this selected period.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-[10px] tracking-wider">
                                            <th className="p-3">CN # / Date</th>
                                            <th className="p-3">Customer</th>
                                            <th className="p-3 text-center">Original Bill</th>
                                            <th className="p-3 text-center">Condition</th>
                                            <th className="p-3 text-center">Settlement Method</th>
                                            <th className="p-3 text-right">Refund Amount</th>
                                            <th className="p-3 text-center">Credit Note</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-mono">
                                        {returnsList.map((ret) => {
                                            const isCredit = ret.refund_method === 'credit' || !ret.refund_method;
                                            const cnNo = `CN-${String(ret.id).padStart(5, '0')}`;
                                            return (
                                                <tr key={ret.id} className="hover:bg-amber-50/15 transition-colors">
                                                    <td className="p-3 font-sans">
                                                        <div className="font-bold text-gray-900 text-xs">
                                                            #{cnNo}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                                            {ret.created_at ? ret.created_at.split(' ')[0] : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 font-sans">
                                                        <div className="font-semibold text-gray-900 text-xs">
                                                            {ret.customer_name || 'Customer'}
                                                        </div>
                                                        {ret.customer_business && (
                                                            <div className="text-[10px] text-gray-500">
                                                                {ret.customer_business}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center font-sans">
                                                        <span className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10.5px] font-mono text-gray-800">
                                                            {ret.original_invoice_no || `Sale #${ret.sale_id || '-'}`}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center font-sans">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                                            ret.return_type === 'damaged'
                                                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        }`}>
                                                            {ret.return_type || 'Saleable'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center font-sans">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                            isCredit
                                                                ? 'bg-[#FEF9E7] text-[#B8860B] border border-[#F3E5AB]'
                                                                : 'bg-gray-100 text-gray-700 border border-gray-200'
                                                        }`}>
                                                            {isCredit ? 'Khata / Credit Note' : 'Cash Drawer Outflow'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-rose-700 text-xs">
                                                        -Rs. {Number(ret.total_refund || 0).toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-center font-sans">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedReturnId(ret.id);
                                                                setCreditNoteModalOpen(true);
                                                            }}
                                                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                                            title="View official Credit Note, download PDF & send WhatsApp"
                                                        >
                                                            <IconReceipt className="w-3 h-3 text-[#B8860B]" />
                                                            <span>View CN</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-xs font-mono">
                                        <tr>
                                            <td colSpan={5} className="p-3 font-sans text-gray-900 font-bold">
                                                Total Returns Deducted in Formula ({returnsList.length} vouchers)
                                            </td>
                                            <td className="p-3 text-right font-bold text-rose-700 text-sm">
                                                -Rs. {Math.round(totalReturns).toLocaleString()}
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

            {/* Official Credit Note Modal */}
            <CreditNoteModal
                isOpen={creditNoteModalOpen}
                onClose={() => setCreditNoteModalOpen(false)}
                returnId={selectedReturnId}
            />

            {/* View Individual Sale Bill Modal */}
            {saleDetailModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#FEF9E7]/60">
                            <div className="flex items-center gap-2">
                                <IconBill className="w-5 h-5 text-[#B8860B]" />
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                                        Invoice #{selectedSaleDetail?.invoice_no || 'Details'}
                                    </h3>
                                    <p className="text-[11px] text-gray-500">
                                        {selectedSaleDetail?.created_at ? selectedSaleDetail.created_at.replace('T', ' ') : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSaleDetailModalOpen(false);
                                    setSelectedSaleDetail(null);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                            {saleDetailLoading ? (
                                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                                    <IconSpinner className="w-5 h-5 text-[#B8860B]" />
                                    <span>Loading invoice items...</span>
                                </div>
                            ) : selectedSaleDetail ? (
                                <>
                                    {/* Customer & Cashier Info */}
                                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div>
                                            <span className="text-gray-400 font-semibold block text-[10px] uppercase">Billed To:</span>
                                            <span className="font-bold text-gray-900 text-xs block">
                                                {selectedSaleDetail.customer_name || 'Walk-in Customer'}
                                            </span>
                                            {selectedSaleDetail.business_name && (
                                                <span className="text-gray-500 text-[11px] block">{selectedSaleDetail.business_name}</span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-gray-400 font-semibold block text-[10px] uppercase">Cashier / Method:</span>
                                            <span className="font-bold text-gray-900 text-xs block">
                                                {selectedSaleDetail.cashier_name || 'Admin'} • <span className="uppercase">{selectedSaleDetail.payment_method || 'Cash'}</span>
                                            </span>
                                            <span className="text-gray-500 text-[11px] block">Device: {selectedSaleDetail.device_id || 'Cashier-01'}</span>
                                        </div>
                                    </div>

                                    {/* Line Items Table */}
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                    <th className="p-2.5">Item</th>
                                                    <th className="p-2.5 text-center">Pack</th>
                                                    <th className="p-2.5 text-center">Qty</th>
                                                    <th className="p-2.5 text-right">Price</th>
                                                    <th className="p-2.5 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 font-mono">
                                                {(selectedSaleDetail.items || []).map((it, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50/50">
                                                        <td className="p-2.5 font-sans">
                                                            <div className="font-bold text-gray-900 text-xs">{it.product_name}</div>
                                                            <div className="text-[10px] text-gray-400">{it.variant_name}</div>
                                                        </td>
                                                        <td className="p-2.5 text-center font-sans text-gray-600">
                                                            {it.packaging_name || 'Unit'}
                                                        </td>
                                                        <td className="p-2.5 text-center font-bold text-gray-900">
                                                            {it.quantity}
                                                        </td>
                                                        <td className="p-2.5 text-right font-medium text-gray-700">
                                                            Rs. {Number(it.unit_price || 0).toLocaleString()}
                                                        </td>
                                                        <td className="p-2.5 text-right font-bold text-gray-900">
                                                            Rs. {Number(it.total_price || 0).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Invoice Summary Box */}
                                    <div className="p-3.5 bg-[#FEF9E7]/60 border border-[#F3E5AB] rounded-xl space-y-1.5 font-mono text-xs">
                                        <div className="flex justify-between text-gray-600">
                                            <span>Gross Amount:</span>
                                            <span>Rs. {Number(selectedSaleDetail.gross_amount || 0).toLocaleString()}</span>
                                        </div>
                                        {((Number(selectedSaleDetail.discount) || 0) + (Number(selectedSaleDetail.special_discount) || 0)) > 0 && (
                                            <div className="flex justify-between text-rose-600 font-bold">
                                                <span>Discount Given:</span>
                                                <span>-Rs. {((Number(selectedSaleDetail.discount) || 0) + (Number(selectedSaleDetail.special_discount) || 0)).toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm font-black text-gray-900 border-t border-gray-200 pt-1">
                                            <span>Net Payable:</span>
                                            <span>Rs. {Number(selectedSaleDetail.net_amount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-700 font-bold">
                                            <span>Amount Paid:</span>
                                            <span>Rs. {Number(selectedSaleDetail.amount_paid || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-rose-600 font-bold">
                                            <span>Balance Due:</span>
                                            <span>Rs. {Number(selectedSaleDetail.remaining_balance || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all cursor-pointer inline-flex items-center gap-1.5"
                            >
                                <IconPrinter className="w-3.5 h-3.5 text-white" />
                                <span>Print Bill</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSaleDetailModalOpen(false);
                                    setSelectedSaleDetail(null);
                                }}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
