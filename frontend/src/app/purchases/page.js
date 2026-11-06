'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
    IconPlus,
    IconClose,
    IconReturn,
    IconBill,
    IconEye,
    IconPrinter,
    IconCheck,
    IconSearch,
    IconSpinner,
    IconSuppliers,
    IconTrash,
    IconRefresh,
    IconCalendar
} from '../components/Icons';
import CustomModalAlert from '../components/CustomModalAlert';
import FastProductSearchModal from '../components/FastProductSearchModal';

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

export default function PurchasesPage() {
    const settings = useSelector(state => state.settings);
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Dynamic Date Duration Filter (Default: 'today')
    const [dateDuration, setDateDuration] = useState('today');
    const [customStartDate, setCustomStartDate] = useState(() => toYMD(new Date()));
    const [customEndDate, setCustomEndDate] = useState(() => toYMD(new Date()));

    // Other Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    // Create Purchase Bill Modal State
    const [createBillModalOpen, setCreateBillModalOpen] = useState(false);
    const [billSupplierId, setBillSupplierId] = useState('');
    const [billInvoiceNo, setBillInvoiceNo] = useState('');
    const [billInvoiceDate, setBillInvoiceDate] = useState('');
    const [billItems, setBillItems] = useState([]);
    const [billDiscount, setBillDiscount] = useState('0');
    const [billAdditionalCharges, setBillAdditionalCharges] = useState('0');
    const [billAmountPaid, setBillAmountPaid] = useState('0');
    const [billPaymentMethod, setBillPaymentMethod] = useState('cash');
    const [billNotes, setBillNotes] = useState('');
    const [submittingBill, setSubmittingBill] = useState(false);

    // Floating Product Search Modal for Purchase Bill
    const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);
    const [productSearchTargetRowIndex, setProductSearchTargetRowIndex] = useState(null);

    // View Purchase Bill Details Modal State
    const [viewBillModalOpen, setViewBillModalOpen] = useState(false);
    const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState(null);
    const [loadingPurchaseDetail, setLoadingPurchaseDetail] = useState(false);

    // Return to Supplier Modal State
    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [selectedSupplierForReturn, setSelectedSupplierForReturn] = useState('');
    const [returnItems, setReturnItems] = useState([]);
    const [returnRemarks, setReturnRemarks] = useState('Wholesale Return to Supplier');
    const [returnRefundMethod, setReturnRefundMethod] = useState('credit'); // 'credit' (Khata) | 'cash' (Drawer inflow)
    const [submittingReturn, setSubmittingReturn] = useState(false);

    // Non-blocking Custom Modal Alerts
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onConfirm: null,
        showCancel: false
    });

    const showAlert = (message, type = 'info', title = '') => {
        setModalAlert({
            isOpen: true,
            title: title || (type === 'error' ? 'Notice / Error' : type === 'success' ? 'Success' : 'Information'),
            message,
            type,
            onConfirm: null,
            showCancel: false
        });
    };

    // Load initial data
    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchPurchases(), fetchSuppliers(), fetchProducts()]);
        } catch (err) {
            console.error('Error loading purchases data:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPurchases = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/purchases');
            if (res.ok) {
                const data = await res.json();
                setPurchases(data || []);
            }
        } catch (err) {
            console.error('Failed to fetch purchases:', err);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/suppliers');
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data || []);
                if (data.length > 0 && !billSupplierId) {
                    setBillSupplierId(data[0].id);
                    setSelectedSupplierForReturn(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch suppliers:', err);
        }
    };

    const fetchProducts = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/products');
            if (res.ok) {
                const data = await res.json();
                setProducts(data || []);
            }
        } catch (err) {
            console.error('Failed to fetch products:', err);
        }
    };

    // Open Create Purchase Bill Modal
    const handleOpenCreateBill = () => {
        if (suppliers.length === 0) {
            return showAlert('Please register at least one supplier before creating a purchase bill.', 'error', 'No Suppliers Found');
        }
        if (products.length === 0) {
            return showAlert('Please add products first to inward inventory stock.', 'error', 'No Products Available');
        }

        const initialSupId = billSupplierId || suppliers[0].id;
        setBillSupplierId(initialSupId);
        setBillInvoiceNo(`INV-${Math.floor(10000 + Math.random() * 90000)}`);
        setBillInvoiceDate(new Date().toISOString().split('T')[0]);
        setBillDiscount('0');
        setBillAdditionalCharges('0');
        setBillAmountPaid('0');
        setBillPaymentMethod('cash');
        setBillNotes('');

        // Prepare first item row
        const prod = products[0];
        const pack = (prod.packagings && prod.packagings.length > 0)
            ? prod.packagings[0]
            : { packaging_type_id: 1, purchase_price: 100, conversion_factor: 1 };

        setBillItems([{
            variant_id: prod.variant_id,
            packaging_type_id: pack.packaging_type_id,
            quantity: 1,
            purchase_price: Number(pack.purchase_price) || 0,
            conversion_factor: pack.conversion_factor || 1,
            total: Number(pack.purchase_price) || 0
        }]);

        setCreateBillModalOpen(true);
    };

    // Open Floating Search Modal to select or change product for a specific bill item row
    const handleOpenProductSearchForRow = (rowIndex) => {
        setProductSearchTargetRowIndex(rowIndex);
        setProductSearchModalOpen(true);
    };

    // Callback when user selects a product from the floating search modal
    const handleSelectProductForBill = (rowIndex, selectedProd) => {
        if (!selectedProd) return;
        const defaultPack = (selectedProd.packagings && selectedProd.packagings.length > 0)
            ? selectedProd.packagings[0]
            : { packaging_type_id: 1, purchase_price: Number(selectedProd.cost_price) || 0, conversion_factor: 1 };

        const updated = [...billItems];
        if (rowIndex !== null && rowIndex >= 0 && rowIndex < updated.length) {
            const row = { ...updated[rowIndex] };
            row.variant_id = selectedProd.variant_id;
            row.packaging_type_id = defaultPack.packaging_type_id;
            row.purchase_price = Number(defaultPack.purchase_price) || Number(selectedProd.cost_price) || 0;
            row.conversion_factor = defaultPack.conversion_factor || 1;
            row.quantity = row.quantity || 1;
            row.total = (parseFloat(row.quantity) || 1) * (parseFloat(row.purchase_price) || 0);
            updated[rowIndex] = row;
        } else {
            updated.push({
                variant_id: selectedProd.variant_id,
                packaging_type_id: defaultPack.packaging_type_id,
                quantity: 1,
                purchase_price: Number(defaultPack.purchase_price) || Number(selectedProd.cost_price) || 0,
                conversion_factor: defaultPack.conversion_factor || 1,
                total: (Number(defaultPack.purchase_price) || Number(selectedProd.cost_price) || 0) * 1
            });
        }
        setBillItems(updated);
        setProductSearchModalOpen(false);
        setProductSearchTargetRowIndex(null);
    };

    // Add another item row to purchase bill
    const handleAddBillItemRow = () => {
        if (products.length === 0) return;
        const prod = products[0];
        const pack = (prod.packagings && prod.packagings.length > 0)
            ? prod.packagings[0]
            : { packaging_type_id: 1, purchase_price: 100, conversion_factor: 1 };

        const newIdx = billItems.length;
        setBillItems([
            ...billItems,
            {
                variant_id: prod.variant_id,
                packaging_type_id: pack.packaging_type_id,
                quantity: 1,
                purchase_price: Number(pack.purchase_price) || 0,
                conversion_factor: pack.conversion_factor || 1,
                total: Number(pack.purchase_price) || 0
            }
        ]);
        setProductSearchTargetRowIndex(newIdx);
        setProductSearchModalOpen(true);
    };

    // Update item row in purchase bill
    const handleUpdateBillItemRow = (index, field, value) => {
        const updated = [...billItems];
        const currentItem = { ...updated[index] };

        if (field === 'variant_id') {
            const vId = parseInt(value);
            currentItem.variant_id = vId;
            const prod = products.find(p => p.variant_id === vId);
            if (prod && prod.packagings && prod.packagings.length > 0) {
                const firstPack = prod.packagings[0];
                currentItem.packaging_type_id = firstPack.packaging_type_id;
                currentItem.purchase_price = Number(firstPack.purchase_price) || 0;
                currentItem.conversion_factor = firstPack.conversion_factor || 1;
            }
        } else if (field === 'packaging_type_id') {
            const ptId = parseInt(value);
            currentItem.packaging_type_id = ptId;
            const prod = products.find(p => p.variant_id === currentItem.variant_id);
            const chosenPack = prod?.packagings?.find(pk => pk.packaging_type_id === ptId);
            if (chosenPack) {
                currentItem.purchase_price = Number(chosenPack.purchase_price) || 0;
                currentItem.conversion_factor = chosenPack.conversion_factor || 1;
            }
        } else if (field === 'quantity') {
            currentItem.quantity = parseFloat(value) || 0;
        } else if (field === 'purchase_price') {
            currentItem.purchase_price = parseFloat(value) || 0;
        }

        currentItem.total = (currentItem.quantity || 0) * (currentItem.purchase_price || 0);
        updated[index] = currentItem;
        setBillItems(updated);
    };

    // Remove row from purchase bill
    const handleRemoveBillItemRow = (index) => {
        if (billItems.length <= 1) {
            return showAlert('Bill must have at least one purchase item line.', 'info');
        }
        setBillItems(billItems.filter((_, i) => i !== index));
    };

    // Live Totals for purchase bill modal
    const billGrossAmount = billItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    const numDiscount = Math.max(0, parseFloat(billDiscount) || 0);
    const numCharges = Math.max(0, parseFloat(billAdditionalCharges) || 0);
    const billNetAmount = Math.max(0, billGrossAmount - numDiscount + numCharges);
    const billPaidNum = Math.max(0, parseFloat(billAmountPaid) || 0);
    const billRemainingDue = Math.max(0, billNetAmount - billPaidNum);

    // Save & Inward Purchase Bill
    const handleSavePurchaseBill = async (e) => {
        e.preventDefault();

        if (!billSupplierId) {
            return showAlert('Please select a supplier for this bill.', 'error');
        }
        if (billItems.length === 0) {
            return showAlert('Please add at least one line item to the bill.', 'error');
        }
        if (billGrossAmount <= 0) {
            return showAlert('Total bill amount must be greater than 0.', 'error');
        }

        const formattedItems = billItems.map(it => {
            const prod = products.find(p => p.variant_id === it.variant_id);
            const pack = prod?.packagings?.find(pk => pk.packaging_type_id === it.packaging_type_id);
            return {
                variant_id: it.variant_id,
                packaging_type_id: it.packaging_type_id,
                quantity: parseFloat(it.quantity) || 1,
                purchase_price: parseFloat(it.purchase_price) || 0,
                conversion_factor: pack?.conversion_factor || it.conversion_factor || 1,
                total: (parseFloat(it.quantity) || 1) * (parseFloat(it.purchase_price) || 0)
            };
        });

        setSubmittingBill(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const payload = {
                supplier_id: billSupplierId,
                supplier_invoice_no: billInvoiceNo.trim() || `PUR-${Date.now()}`,
                invoice_date: billInvoiceDate || new Date().toISOString().split('T')[0],
                items: formattedItems,
                gross_amount: billGrossAmount,
                discount: numDiscount,
                additional_charges: numCharges,
                net_amount: billNetAmount,
                amount_paid: billPaidNum,
                payment_method: billPaymentMethod,
                notes: billNotes.trim()
            };

            const res = await fetch('http://localhost:5000/api/purchases', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setCreateBillModalOpen(false);
                await fetchPurchases();
                await fetchSuppliers();
                await fetchProducts();
                showAlert(
                    `Stock inward purchase bill "${payload.supplier_invoice_no}" recorded successfully! Added ${formattedItems.length} item line(s) to inventory.`,
                    'success',
                    'Purchase Bill Created'
                );
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to record purchase bill', 'error');
            }
        } catch (err) {
            showAlert('Unable to connect to server: ' + err.message, 'error', 'Connection Error');
        } finally {
            setSubmittingBill(false);
        }
    };

    // View Detailed Items of an Individual Purchase Bill
    const handleViewPurchaseBill = async (purchaseId) => {
        setLoadingPurchaseDetail(true);
        setSelectedPurchaseDetail(null);
        setViewBillModalOpen(true);
        try {
            const res = await fetch(`http://localhost:5000/api/purchases/${purchaseId}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedPurchaseDetail(data);
            } else {
                showAlert('Failed to load purchase bill details.', 'error');
            }
        } catch (err) {
            showAlert('Connection error: ' + err.message, 'error');
        } finally {
            setLoadingPurchaseDetail(false);
        }
    };

    // Open Return Modal
    const openPurchaseReturnModal = (purchase) => {
        setSelectedSupplierForReturn(purchase.supplier_id);
        if (products.length > 0) {
            const prod = products[0];
            const pack = (prod.packagings && prod.packagings.length > 0)
                ? prod.packagings[0]
                : { packaging_type_id: 1, purchase_price: 100 };
            setReturnItems([{
                variant_id: prod.variant_id,
                packaging_type_id: pack.packaging_type_id,
                quantity: 1,
                return_price: Number(pack.purchase_price) || 100
            }]);
        }
        setReturnRemarks(`Return against Bill #${purchase.supplier_invoice_no || purchase.id}`);
        setReturnRefundMethod('credit');
        setReturnModalOpen(true);
    };

    // Save Purchase Return
    const handleSavePurchaseReturn = async (e) => {
        e.preventDefault();
        const total = returnItems.reduce((sum, it) => sum + ((parseFloat(it.quantity) || 0) * (parseFloat(it.return_price) || 0)), 0);
        if (total <= 0) {
            return showAlert('Valid return items and rate are required.', 'error');
        }

        setSubmittingReturn(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const localDateTime = `${localDate} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            const res = await fetch('http://localhost:5000/api/purchases/returns', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    supplier_id: selectedSupplierForReturn,
                    items: returnItems,
                    total_amount: total,
                    refund_method: returnRefundMethod,
                    remarks: returnRemarks.trim() || 'Wholesale supplier purchase return',
                    payment_date: localDate,
                    created_at: localDateTime
                })
            });

            if (res.ok) {
                setReturnModalOpen(false);
                await fetchPurchases();
                await fetchSuppliers();
                showAlert(
                    returnRefundMethod === 'cash' 
                        ? `Purchase return processed! Cash refund of Rs. ${Math.round(total).toLocaleString()} received into shop drawer.` 
                        : `Purchase return processed! Supplier payable reduced by Rs. ${Math.round(total).toLocaleString()}`,
                    'success',
                    'Return Processed'
                );
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to process purchase return', 'error');
            }
        } catch (err) {
            showAlert('Connection error: ' + err.message, 'error');
        } finally {
            setSubmittingReturn(false);
        }
    };

    // Check if a purchase date matches the selected dynamic duration
    const matchesPurchaseDate = (dateInput) => {
        const ymd = toYMD(dateInput);
        if (!ymd) return false;

        const todayYmd = toYMD(new Date());

        if (dateDuration === 'today') {
            return ymd === todayYmd;
        }
        if (dateDuration === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            return ymd === toYMD(y);
        }
        if (dateDuration === 'this_week') {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
            const monday = new Date(now.setDate(diff));
            return ymd >= toYMD(monday) && ymd <= todayYmd;
        }
        if (dateDuration === 'this_month') {
            const now = new Date();
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            return ymd >= startOfMonth && ymd <= todayYmd;
        }
        if (dateDuration === 'all') {
            return true;
        }
        if (dateDuration === 'custom') {
            return (!customStartDate || ymd >= customStartDate) && (!customEndDate || ymd <= customEndDate);
        }
        return true;
    };

    // Human-friendly duration label for displays & badges
    const durationLabel = useMemo(() => {
        const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        switch (dateDuration) {
            case 'today':
                return `Today (${todayStr})`;
            case 'yesterday': {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                return `Yesterday (${y.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })})`;
            }
            case 'this_week':
                return 'This Week';
            case 'this_month':
                return 'This Month';
            case 'custom':
                return `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'End'})`;
            default:
                return `Today (${todayStr})`;
        }
    }, [dateDuration, customStartDate, customEndDate]);

    // 1. Filter purchases strictly by the active date duration first
    const periodPurchases = useMemo(() => {
        return purchases.filter(p => matchesPurchaseDate(p.invoice_date || p.created_at));
    }, [purchases, dateDuration, customStartDate, customEndDate]);

    // 2. Filter period purchases by search query, supplier, and status
    const filteredPurchases = useMemo(() => {
        return periodPurchases.filter(p => {
            const matchesSearch =
                !searchQuery ||
                (p.supplier_invoice_no && p.supplier_invoice_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.supplier_name && p.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.company_name && p.company_name.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesSupplier = supplierFilter === 'all' || p.supplier_id == supplierFilter;

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'due' && (p.remaining_balance || 0) > 0) ||
                (statusFilter === 'paid' && (p.remaining_balance || 0) <= 0);

            return matchesSearch && matchesSupplier && matchesStatus;
        });
    }, [periodPurchases, searchQuery, supplierFilter, statusFilter]);

    // Dynamic Period KPIs (dynamically computed for selected duration)
    const periodPurchasesAmount = periodPurchases.reduce((sum, p) => sum + (parseFloat(p.net_amount) || 0), 0);
    const periodPaidAmount = periodPurchases.reduce((sum, p) => sum + (parseFloat(p.amount_paid) || 0), 0);
    const periodRemainingDue = periodPurchases.reduce((sum, p) => sum + (parseFloat(p.remaining_balance) || 0), 0);
    const periodActiveSuppliersCount = new Set(periodPurchases.map(p => p.supplier_id)).size;

    const activeSupplierObj = suppliers.find(s => s.id == billSupplierId);

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-extrabold text-gray-900">Supplier Purchases & Stock Bills</h1>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 border border-blue-200 text-[#0B3B7B]">
                            Inward Stock Manager
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Create wholesale purchase bills, inward items into warehouse stock, manage supplier payables & returns
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={loadAllData}
                        className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
                        title="Refresh purchases"
                    >
                        <IconRefresh className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenCreateBill}
                        className="bg-[#16A34A] hover:bg-[#15803D] text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer transition-all"
                    >
                        <IconPlus className="w-4 h-4 text-white" />
                        <span>+ Create Purchase Bill</span>
                    </button>
                </div>
            </div>

            {/* DYNAMIC DATE DURATION FILTER BAR */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    {/* Date Duration Select Dropdown */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        <span className="text-gray-600 text-xs font-bold flex items-center gap-1.5">
                            <IconCalendar className="w-4 h-4 text-[#0B3B7B]" />
                            <span>Date Duration:</span>
                        </span>
                        <select
                            value={dateDuration}
                            onChange={(e) => setDateDuration(e.target.value)}
                            className="py-2 px-3.5 bg-white border border-gray-200 rounded-xl font-bold text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 focus:border-[#0B3B7B] shadow-xs cursor-pointer"
                        >
                            <option value="today">Today (Default)</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="this_month">This Month</option>
                            <option value="custom">Custom Range</option>
                        </select>
                    </div>

                    {/* Active Selected Duration Tag */}
                    <div className="text-xs font-semibold text-gray-500 flex items-center gap-2">
                        <span>Period:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 font-bold text-[#0B3B7B]">
                            {durationLabel}
                        </span>
                    </div>
                </div>

                {/* Custom Date Range Pickers (shown only when 'custom' is active) */}
                {dateDuration === 'custom' && (
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-600">From Date:</span>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-600">To Date:</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const todayStr = toYMD(new Date());
                                setCustomStartDate(todayStr);
                                setCustomEndDate(todayStr);
                            }}
                            className="text-[11px] font-bold text-[#0B3B7B] hover:underline cursor-pointer"
                        >
                            Reset to Today
                        </button>
                    </div>
                )}
            </div>

            {/* 4 DYNAMIC KPI SUMMARY CARDS (Reflects selected duration) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Total Purchases in Selected Duration */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Inward Purchases
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                            {dateDuration === 'today' ? 'Today' : 'Period'}
                        </span>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-gray-900 font-mono">
                        Rs. {Math.round(periodPurchasesAmount).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium">
                        {periodPurchases.length} bill(s) in {dateDuration === 'today' ? 'today' : 'selected period'}
                    </div>
                </div>

                {/* Amount Paid to Suppliers in Selected Duration */}
                <div className="p-4 rounded-2xl bg-[#E8F8F0] border border-emerald-200 shadow-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                            Paid to Suppliers
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100/60 text-emerald-800">
                            Cleared
                        </span>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-emerald-800 font-mono">
                        Rs. {Math.round(periodPaidAmount).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                        Settled cash / bank payments
                    </div>
                </div>

                {/* Pending Due Payable in Selected Duration */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 shadow-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                            Pending Due
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            periodRemainingDue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                            {periodRemainingDue > 0 ? 'Payable' : 'Cleared'}
                        </span>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-rose-600 font-mono">
                        Rs. {Math.round(periodRemainingDue).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium">
                        Unpaid due in {dateDuration === 'today' ? 'today\'s bills' : 'this period'}
                    </div>
                </div>

                {/* Active Suppliers in Selected Duration */}
                <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Active Vendors
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                            {suppliers.length} Total
                        </span>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-gray-900 font-mono">
                        {periodActiveSuppliersCount} <span className="text-sm font-semibold text-gray-400">vendor(s)</span>
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium">
                        Supplied stock in this duration
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1 min-w-[200px]">
                        <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by Invoice #, Supplier Name or Brand..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 focus:border-[#0B3B7B]"
                        />
                    </div>

                    <select
                        value={supplierFilter}
                        onChange={(e) => setSupplierFilter(e.target.value)}
                        className="py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none"
                    >
                        <option value="all">All Suppliers ({suppliers.length})</option>
                        {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.company_name || 'Vendor'})</option>
                        ))}
                    </select>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none"
                    >
                        <option value="all">All Payment Statuses</option>
                        <option value="due">With Pending Due (Unpaid)</option>
                        <option value="paid">Fully Settled / Paid</option>
                    </select>
                </div>

                <div className="text-xs text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{filteredPurchases.length}</span> of {periodPurchases.length} bill(s) in {durationLabel}
                </div>
            </div>

            {/* Purchases & Bills Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                        <IconSpinner className="w-5 h-5 text-[#0B3B7B]" />
                        <span>Loading purchase bills...</span>
                    </div>
                ) : filteredPurchases.length === 0 ? (
                    <div className="text-center py-16 space-y-3">
                        <IconBill className="w-10 h-10 text-gray-300 mx-auto" />
                        <div className="text-sm font-bold text-gray-700">
                            No Purchase Bills Found for {durationLabel}
                        </div>
                        <p className="text-xs text-gray-400 max-w-md mx-auto">
                            {dateDuration === 'today'
                                ? "No purchase bills recorded yet for today. You can switch to 'All Time' to see past bills or record a new inward bill."
                                : "No purchase bills match the selected duration and search filters."}
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-2">
                            {dateDuration !== 'all' && (
                                <button
                                    type="button"
                                    onClick={() => setDateDuration('all')}
                                    className="px-3.5 py-2 border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 cursor-pointer transition-all"
                                >
                                    Show All Time Bills ({purchases.length})
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleOpenCreateBill}
                                className="bg-[#16A34A] hover:bg-[#15803D] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-1.5 transition-all"
                            >
                                <IconPlus className="w-3.5 h-3.5 text-white" />
                                <span>Create New Purchase Bill</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Supplier Invoice #</th>
                                    <th className="p-3">Supplier / Mill</th>
                                    <th className="p-3 text-center">Items</th>
                                    <th className="p-3 text-right">Net Bill Amount</th>
                                    <th className="p-3 text-right">Paid</th>
                                    <th className="p-3 text-right">Remaining Due</th>
                                    <th className="p-3 text-center">Status</th>
                                    <th className="p-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredPurchases.map((p) => {
                                    const isPaid = (p.remaining_balance || 0) <= 0;
                                    const invoiceDate = p.invoice_date || (p.created_at ? p.created_at.split(' ')[0] : '-');

                                    return (
                                        <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                                            <td className="p-3 font-semibold text-gray-700 font-mono">
                                                {invoiceDate}
                                            </td>
                                            <td className="p-3 font-mono font-bold text-gray-900">
                                                {p.supplier_invoice_no || `PUR-${p.id}`}
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-[#0B3B7B]">{p.supplier_name}</div>
                                                {p.company_name && (
                                                    <div className="text-[10px] text-gray-400">{p.company_name}</div>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 font-bold text-[10px] text-gray-700">
                                                    {p.item_count || 1} item(s)
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-extrabold text-gray-900 font-mono">
                                                Rs. {Number(p.net_amount || 0).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right font-bold text-emerald-700 font-mono">
                                                Rs. {Number(p.amount_paid || 0).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right font-extrabold text-rose-600 font-mono">
                                                Rs. {Number(p.remaining_balance || 0).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    isPaid
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                }`}>
                                                    {isPaid ? 'Fully Paid' : 'Unpaid / Due'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleViewPurchaseBill(p.id)}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer bg-[#0B3B7B] hover:bg-[#072B5C] text-white transition-all"
                                                        title="View bill invoice and printable receipt"
                                                    >
                                                        <IconEye className="w-3.5 h-3.5 text-white" />
                                                        <span>View Bill</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openPurchaseReturnModal(p)}
                                                        className="px-2.5 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-200 hover:bg-rose-100 flex items-center gap-1 transition-colors cursor-pointer"
                                                        title="Process purchase return to supplier"
                                                    >
                                                        <IconReturn className="w-3.5 h-3.5" />
                                                        <span>Return</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 1: CREATE WHOLESALE PURCHASE BILL                        */}
            {/* ───────────────────────────────────────────────────────────── */}
            {createBillModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
                    <form
                        onSubmit={handleSavePurchaseBill}
                        className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 my-auto overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="p-4 sm:p-5 border-b border-gray-200 bg-gray-50/70 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-black text-gray-900 text-base sm:text-lg flex items-center gap-2">
                                    <IconBill className="w-5 h-5 text-[#0B3B7B]" />
                                    <span>Create Wholesale Purchase Bill</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Inward stock into warehouse inventory, auto-update supplier ledger & payables
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCreateBillModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl cursor-pointer transition-colors"
                            >
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                            {/* Supplier & Bill Info Card */}
                            <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Select Supplier *
                                    </label>
                                    <select
                                        value={billSupplierId}
                                        onChange={(e) => setBillSupplierId(e.target.value)}
                                        required
                                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20"
                                    >
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.company_name || 'Vendor'}) — Due: Rs. {Number(s.balance || 0).toLocaleString()}
                                            </option>
                                        ))}
                                    </select>
                                    {activeSupplierObj && (
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            Current Payable Due: <span className="font-bold text-rose-600 font-mono">Rs. {Number(activeSupplierObj.balance || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Supplier Invoice / Bill # *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. INV-90214"
                                        value={billInvoiceNo}
                                        onChange={(e) => setBillInvoiceNo(e.target.value)}
                                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20"
                                    />
                                    <div className="text-[10px] text-gray-400 mt-1">Vendor's printed invoice or slip #</div>
                                </div>

                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">
                                        Bill Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={billInvoiceDate}
                                        onChange={(e) => setBillInvoiceDate(e.target.value)}
                                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-900 focus:outline-none"
                                    />
                                    <div className="text-[10px] text-gray-400 mt-1">Stock arrival or invoice date</div>
                                </div>
                            </div>

                            {/* Purchase Line Items Table */}
                            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                    <div className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                        <span>Stock Inward Line Items ({billItems.length})</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddBillItemRow}
                                        className="px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs bg-[#0B3B7B] text-white hover:bg-[#072B5C] transition-all"
                                    >
                                        <IconPlus className="w-3.5 h-3.5 text-white" />
                                        <span>+ Add Item Row</span>
                                    </button>
                                </div>

                                <div className="overflow-x-auto max-h-60">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100/70 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                <th className="p-2.5 min-w-[200px]">Product Variant</th>
                                                <th className="p-2.5 min-w-[140px]">Packaging Type</th>
                                                <th className="p-2.5 w-24 text-center">Inward Qty</th>
                                                <th className="p-2.5 w-32 text-right">Cost Rate (Rs.)</th>
                                                <th className="p-2.5 w-32 text-right">Line Total</th>
                                                <th className="p-2.5 w-10 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {billItems.map((item, idx) => {
                                                const prod = products.find(p => p.variant_id === item.variant_id);
                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        <td className="p-2">
                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={() => handleOpenProductSearchForRow(idx)}
                                                                className="w-full py-1.5 px-2.5 bg-white hover:bg-slate-50 border border-gray-200 hover:border-[#0B3B7B] rounded-lg transition-all cursor-pointer group flex items-center justify-between gap-1.5 shadow-2xs"
                                                                title="Click to search and change item"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-semibold text-xs text-gray-800 group-hover:text-[#0B3B7B] truncate">
                                                                        {prod ? `${prod.product_name} (${prod.variant_name || 'Standard'})` : 'Click to select product...'}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-500 font-medium">
                                                                        {prod ? `Stock: ${prod.current_stock || 0} ${prod.unit_symbol || prod.unit_name || 'pcs'}` : 'Search product catalog'}
                                                                    </div>
                                                                </div>
                                                                <div className="p-1 rounded bg-gray-50 group-hover:bg-blue-50 text-gray-400 group-hover:text-[#0B3B7B] shrink-0 transition-colors">
                                                                    <IconSearch className="w-3.5 h-3.5" />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-2">
                                                            <select
                                                                value={item.packaging_type_id}
                                                                onChange={(e) => handleUpdateBillItemRow(idx, 'packaging_type_id', e.target.value)}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-lg font-semibold text-xs text-gray-800 focus:outline-none"
                                                            >
                                                                {(prod?.packagings || []).map(pk => (
                                                                    <option key={pk.packaging_type_id} value={pk.packaging_type_id}>
                                                                        {pk.packaging_name} (x{pk.conversion_factor})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <input
                                                                type="number"
                                                                required
                                                                min="0.01"
                                                                step="any"
                                                                value={item.quantity}
                                                                onChange={(e) => handleUpdateBillItemRow(idx, 'quantity', e.target.value)}
                                                                className="w-full p-2 text-center bg-white border border-gray-200 rounded-lg font-black text-xs text-gray-900 focus:outline-none"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                required
                                                                min="0"
                                                                step="any"
                                                                value={item.purchase_price}
                                                                onChange={(e) => handleUpdateBillItemRow(idx, 'purchase_price', e.target.value)}
                                                                className="w-full p-2 text-right bg-white border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 focus:outline-none"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right font-black font-mono text-gray-900">
                                                            Rs. {Number(item.total || 0).toLocaleString()}
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveBillItemRow(idx)}
                                                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                                                title="Remove row"
                                                            >
                                                                <IconTrash className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Settlement & Financial Breakdown Box */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Left: Payment & Settlement Controls */}
                                <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-3">
                                    <div className="font-extrabold text-gray-900 text-xs">Payment & Settlement</div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">
                                                Amount Paid Now (Rs.)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={billAmountPaid}
                                                onChange={(e) => setBillAmountPaid(e.target.value)}
                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl font-bold font-mono text-xs text-emerald-800 focus:outline-none"
                                            />
                                            <div className="flex gap-1 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setBillAmountPaid('0')}
                                                    className="text-[10px] text-gray-500 hover:underline cursor-pointer"
                                                >
                                                    Rs. 0 (Full Credit)
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setBillAmountPaid(billNetAmount.toString())}
                                                    className="text-[10px] text-[#0B3B7B] hover:underline cursor-pointer font-bold"
                                                >
                                                    Full Paid
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-600 mb-1">
                                                Payment Method
                                            </label>
                                            <select
                                                value={billPaymentMethod}
                                                onChange={(e) => setBillPaymentMethod(e.target.value)}
                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl font-semibold text-xs text-gray-800 focus:outline-none"
                                            >
                                                <option value="cash">Cash Counter</option>
                                                <option value="bank">Bank Transfer</option>
                                                <option value="cheque">Cheque</option>
                                                <option value="online">Online / EasyPaisa</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1">
                                            Notes / Remarks
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Optional remarks (e.g. Received via Peshawar transport)..."
                                            value={billNotes}
                                            onChange={(e) => setBillNotes(e.target.value)}
                                            className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Right: Bill Calculations */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-2 font-mono text-xs">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-gray-700">
                                            <span>Subtotal (Gross Amount):</span>
                                            <span className="font-bold text-gray-900">Rs. {billGrossAmount.toLocaleString()}</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Discount (Rs.):</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={billDiscount}
                                                    onChange={(e) => setBillDiscount(e.target.value)}
                                                    className="w-full p-1 bg-white border border-gray-200 rounded-lg text-right font-bold text-rose-600"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Freight/Charges (Rs.):</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={billAdditionalCharges}
                                                    onChange={(e) => setBillAdditionalCharges(e.target.value)}
                                                    className="w-full p-1 bg-white border border-gray-200 rounded-lg text-right font-bold text-gray-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center text-gray-900 font-black text-sm pt-2 border-t border-gray-200">
                                            <span>Net Bill Total:</span>
                                            <span className="text-base text-gray-900">Rs. {billNetAmount.toLocaleString()}</span>
                                        </div>

                                        <div className="flex justify-between text-emerald-800 font-bold">
                                            <span>Immediate Amount Paid:</span>
                                            <span>Rs. {billPaidNum.toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center border-t-2 border-gray-200 pt-2 mt-1">
                                        <span className="font-bold text-gray-900 text-xs uppercase">Added to Supplier Due:</span>
                                        <span className={`text-lg font-black ${billRemainingDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                            Rs. {billRemainingDue.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setCreateBillModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                            >
                                <span>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                disabled={submittingBill}
                                className="flex-2 py-2.5 rounded-xl font-bold text-xs bg-[#16A34A] hover:bg-[#15803D] text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {submittingBill ? (
                                    <>
                                        <IconSpinner className="w-4 h-4 text-white" />
                                        <span>Processing Stock Inward...</span>
                                    </>
                                ) : (
                                    <>
                                        <IconCheck className="w-4 h-4 text-white" />
                                        <span>Save & Inward Stock Bill ({billItems.length} items)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 2: VIEW PURCHASE BILL DETAILS (Printable)               */}
            {/* ───────────────────────────────────────────────────────────── */}
            {viewBillModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-3 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 my-auto overflow-hidden">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                                    <IconBill className="w-4 h-4 text-[#0B3B7B]" />
                                    <span>Purchase Bill: {selectedPurchaseDetail?.supplier_invoice_no || `PUR-#${selectedPurchaseDetail?.id}`}</span>
                                </h3>
                                <p className="text-[11px] text-gray-500">
                                    Supplier: <span className="font-bold text-gray-800">{selectedPurchaseDetail?.supplier_name}</span> • Date: {selectedPurchaseDetail?.invoice_date || selectedPurchaseDetail?.created_at?.split(' ')[0]}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewBillModalOpen(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Bill Printable Content */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
                            {loadingPurchaseDetail || !selectedPurchaseDetail ? (
                                <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                    <IconSpinner className="w-4 h-4 text-[#0B3B7B]" />
                                    <span>Loading purchase bill details...</span>
                                </div>
                            ) : (
                                <div id="printable-purchase-bill" className="space-y-4">
                                    {/* Store & Supplier Banner */}
                                    <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 flex flex-col sm:flex-row justify-between gap-3">
                                        <div>
                                            <div className="font-black text-sm text-[#0B3B7B]">{(settings?.shop_name || 'HILAL WHOLESALER SHOP').toUpperCase()}</div>
                                            <div className="text-[10px] text-gray-500">Stock Inward Voucher & Supplier Bill</div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                Invoice #: <span className="font-bold font-mono text-gray-900">{selectedPurchaseDetail.supplier_invoice_no || `PUR-${selectedPurchaseDetail.id}`}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-500">
                                                Date: <span className="font-semibold">{selectedPurchaseDetail.invoice_date || selectedPurchaseDetail.created_at}</span>
                                            </div>
                                        </div>
                                        <div className="sm:text-right">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase">Vendor / Mill Details:</div>
                                            <div className="font-black text-xs text-gray-900">{selectedPurchaseDetail.supplier_name}</div>
                                            {selectedPurchaseDetail.company_name && (
                                                <div className="text-[10px] text-gray-600 font-semibold">{selectedPurchaseDetail.company_name}</div>
                                            )}
                                            {selectedPurchaseDetail.supplier_phone && (
                                                <div className="text-[10px] text-gray-500">Phone: {selectedPurchaseDetail.supplier_phone}</div>
                                            )}
                                            {selectedPurchaseDetail.supplier_address && (
                                                <div className="text-[10px] text-gray-500">Address: {selectedPurchaseDetail.supplier_address}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items Table */}
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100/70 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                                                    <th className="p-2.5">Product Description</th>
                                                    <th className="p-2.5 text-center">Packaging</th>
                                                    <th className="p-2.5 text-center">Inward Qty</th>
                                                    <th className="p-2.5 text-right">Cost Rate</th>
                                                    <th className="p-2.5 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(selectedPurchaseDetail.items || []).map((it, idx) => (
                                                    <tr key={idx}>
                                                        <td className="p-2.5 font-bold text-gray-900">
                                                            {it.product_name}
                                                            {it.variant_name && it.variant_name !== 'Standard' && (
                                                                <span className="text-[10px] text-gray-500 ml-1">({it.variant_name})</span>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-[10px]">
                                                                {it.packaging_name || 'Unit'}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-center font-black">
                                                            {it.quantity}
                                                        </td>
                                                        <td className="p-2.5 text-right font-mono text-gray-700">
                                                            Rs. {Number(it.purchase_price || 0).toLocaleString()}
                                                        </td>
                                                        <td className="p-2.5 text-right font-black font-mono text-gray-900">
                                                            Rs. {Number(it.total || (it.quantity * it.purchase_price) || 0).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Financial Breakdown */}
                                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-gray-200 space-y-1.5 font-mono text-xs">
                                        <div className="flex justify-between text-gray-700">
                                            <span>Gross Total:</span>
                                            <span className="font-bold">Rs. {Number(selectedPurchaseDetail.gross_amount || 0).toLocaleString()}</span>
                                        </div>
                                        {Number(selectedPurchaseDetail.discount || 0) > 0 && (
                                            <div className="flex justify-between text-rose-600">
                                                <span>Less Discount:</span>
                                                <span>-Rs. {Number(selectedPurchaseDetail.discount).toLocaleString()}</span>
                                            </div>
                                        )}
                                        {Number(selectedPurchaseDetail.additional_charges || 0) > 0 && (
                                            <div className="flex justify-between text-gray-700">
                                                <span>Add Charges:</span>
                                                <span>+Rs. {Number(selectedPurchaseDetail.additional_charges).toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-black text-gray-900 text-sm border-t border-gray-200 pt-1.5">
                                            <span>Net Bill Value:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.net_amount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-800 font-bold">
                                            <span>Amount Paid ({selectedPurchaseDetail.payment_method || 'cash'}):</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.amount_paid || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-rose-600 font-extrabold border-t border-gray-200 pt-1">
                                            <span>Remaining Payable Due:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.remaining_balance || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Controls */}
                        <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setViewBillModalOpen(false)}
                                className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-xs hover:bg-gray-100 cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="px-4 py-2 rounded-xl font-bold text-xs bg-[#0B3B7B] hover:bg-[#072B5C] text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                            >
                                <IconPrinter className="w-4 h-4 text-white" />
                                <span>Print Bill Voucher</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 3: PURCHASE RETURN TO SUPPLIER                          */}
            {/* ───────────────────────────────────────────────────────────── */}
            {returnModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form
                        onSubmit={handleSavePurchaseReturn}
                        className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200"
                    >
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                <IconReturn className="w-5 h-5 text-rose-600" />
                                <span>Record Return to Supplier</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setReturnModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Select Supplier *</label>
                                <select
                                    value={selectedSupplierForReturn}
                                    onChange={(e) => setSelectedSupplierForReturn(e.target.value)}
                                    className="w-full p-2.5 border rounded-xl font-bold bg-white focus:outline-none"
                                >
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.company_name || 'Vendor'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {returnItems.map((item, idx) => (
                                <div key={idx} className="space-y-2 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Product to Return</label>
                                        <select
                                            value={item.variant_id}
                                            onChange={(e) => {
                                                const updated = [...returnItems];
                                                updated[idx].variant_id = parseInt(e.target.value);
                                                setReturnItems(updated);
                                            }}
                                            className="w-full p-2 border rounded-xl bg-white font-semibold text-xs"
                                        >
                                            {products.map(p => (
                                                <option key={p.variant_id} value={p.variant_id}>
                                                    {p.product_name} ({p.variant_name}) — Stock: {p.current_stock}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block font-bold text-gray-700 mb-1">Return Qty</label>
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="any"
                                                value={item.quantity}
                                                onChange={(e) => {
                                                    const updated = [...returnItems];
                                                    updated[idx].quantity = parseFloat(e.target.value) || 0;
                                                    setReturnItems(updated);
                                                }}
                                                className="w-full p-2 border rounded-xl bg-white font-bold text-center"
                                            />
                                        </div>
                                        <div>
                                            <label className="block font-bold text-gray-700 mb-1">Return Rate (Rs.)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={item.return_price}
                                                onChange={(e) => {
                                                    const updated = [...returnItems];
                                                    updated[idx].return_price = parseFloat(e.target.value) || 0;
                                                    setReturnItems(updated);
                                                }}
                                                className="w-full p-2 border rounded-xl bg-white font-bold text-right text-rose-700 font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Remarks</label>
                                <input
                                    type="text"
                                    value={returnRemarks}
                                    onChange={(e) => setReturnRemarks(e.target.value)}
                                    placeholder="Defective goods / expired stock..."
                                    className="w-full p-2.5 border rounded-xl font-medium text-xs bg-white"
                                />
                            </div>

                            {/* SETTLEMENT METHOD (KHATA REDUCTION VS CASH DRAWER INFLOW) */}
                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">
                                    Refund Settlement Method / کھاتہ یا نقد واپسی
                                </label>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div
                                        onClick={() => setReturnRefundMethod('credit')}
                                        className={`p-2.5 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${
                                            returnRefundMethod === 'credit'
                                                ? 'bg-blue-50/80 border-[#0B3B7B] text-gray-900 shadow-xs ring-1 ring-[#0B3B7B]'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="returnRefundMethod"
                                                value="credit"
                                                checked={returnRefundMethod === 'credit'}
                                                onChange={() => setReturnRefundMethod('credit')}
                                                className="accent-[#0B3B7B] cursor-pointer"
                                            />
                                            <span className="font-extrabold text-xs text-gray-900">
                                                Adjust Supplier Khata
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5 leading-tight">
                                            Supplier payable balance kam hoga (agar clear hai to advance credit banega).
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => setReturnRefundMethod('cash')}
                                        className={`p-2.5 rounded-2xl border flex flex-col gap-1 cursor-pointer transition-all ${
                                            returnRefundMethod === 'cash'
                                                ? 'bg-emerald-50 border-emerald-500 text-gray-900 shadow-xs ring-1 ring-emerald-500'
                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="returnRefundMethod"
                                                value="cash"
                                                checked={returnRefundMethod === 'cash'}
                                                onChange={() => setReturnRefundMethod('cash')}
                                                className="accent-emerald-600 cursor-pointer"
                                            />
                                            <span className="font-extrabold text-xs text-emerald-900">
                                                Cash Received from Supplier
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 pl-5 leading-tight">
                                            Supplier ne naqd wapis diya. Counter drawer cash me jama hoga.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* LIVE FINANCIAL IMPACT PREVIEW */}
                            {(() => {
                                const total = returnItems.reduce((sum, it) => sum + ((parseFloat(it.quantity) || 0) * (parseFloat(it.return_price) || 0)), 0);
                                const sup = suppliers.find(s => s.id === parseInt(selectedSupplierForReturn));
                                const supBal = Number(sup?.balance || 0);

                                return (
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 space-y-1 text-xs">
                                        <div className="flex justify-between items-center font-bold text-gray-800">
                                            <span>Total Return Value:</span>
                                            <span className="text-sm font-extrabold text-rose-700 font-mono">
                                                Rs. {Math.round(total).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="pt-1.5 border-t border-gray-200 flex justify-between items-center text-[11px]">
                                            <span className="text-gray-500">Supplier Ledger Impact:</span>
                                            {returnRefundMethod === 'credit' ? (
                                                <span className="font-bold">
                                                    <span className="line-through text-gray-400 mr-1.5">Rs. {supBal.toLocaleString()}</span>
                                                    <span className={supBal - total < 0 ? 'text-emerald-700 font-extrabold' : 'text-gray-900'}>
                                                        {supBal - total < 0 ? `Rs. -${Math.abs(supBal - total).toLocaleString()} (Adv)` : `Rs. ${(supBal - total).toLocaleString()}`}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="font-bold text-gray-700">Rs. {supBal.toLocaleString()} (Unchanged)</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-gray-500">Shop Cash Drawer:</span>
                                            {returnRefundMethod === 'cash' ? (
                                                <span className="font-bold text-emerald-700 font-mono">+ Rs. {Math.round(total).toLocaleString()} (Inflow)</span>
                                            ) : (
                                                <span className="font-bold text-gray-500">Rs. 0 (Drawer Untouched)</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setReturnModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                            >
                                <span>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                disabled={submittingReturn}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <IconReturn className="w-4 h-4" />
                                <span>{submittingReturn ? 'Processing...' : 'Confirm Return'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* FLOATING PRODUCT SEARCH MODAL */}
            <FastProductSearchModal
                isOpen={productSearchModalOpen}
                onClose={() => {
                    setProductSearchModalOpen(false);
                    setProductSearchTargetRowIndex(null);
                }}
                products={products}
                targetRowIndex={productSearchTargetRowIndex}
                selectedVariantId={billItems[productSearchTargetRowIndex]?.variant_id}
                onSelect={(prod) => handleSelectProductForBill(productSearchTargetRowIndex, prod)}
            />

            {/* Custom Non-Blocking Alert & Confirmation Dialog */}
            <CustomModalAlert
                {...modalAlert}
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
