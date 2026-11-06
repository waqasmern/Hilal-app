'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import CustomModalAlert from '../components/CustomModalAlert';
import FastProductSearchModal from '../components/FastProductSearchModal';
import { apiUrl } from '../../lib/api';
import {
    IconPlus, IconClose, IconSuppliers, IconBill,
    IconPayments, IconWhatsApp, IconEdit, IconTrash,
    IconEye, IconPrinter, IconSearch, IconCheck,
    IconWarning, IconReceipt, IconPOS, IconInventory,
    IconSpinner,
    IconChevronLeft, IconChevronRight, IconChevronDoubleLeft, IconChevronDoubleRight,
    IconDotsVertical
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

function getTodayYMD() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// In-memory module cache for instant (0ms) catalog access across modal opens
let globalProductsCache = null;
let globalProductsPromise = null;



export default function SuppliersPage() {
    const settings = useSelector(state => state.settings);
    const [suppliers, setSuppliers] = useState([]);
    const [kpis, setKpis] = useState({
        total_stock_added: 0,
        total_purchases_count: 0,
        total_paid: 0,
        total_pending: 0,
        supplier_count: 0
    });
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'cleared'

    // Server-Side Pagination State for Suppliers Directory
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalServerSuppliers, setTotalServerSuppliers] = useState(0);
    const [totalServerPages, setTotalServerPages] = useState(1);
    const [tableLoading, setTableLoading] = useState(false);
    const [serverSummary, setServerSummary] = useState(null);

    // Modals
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [addBillModalOpen, setAddBillModalOpen] = useState(false);
    const [payFifoModalOpen, setPayFifoModalOpen] = useState(false);
    const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [actionModalSupplier, setActionModalSupplier] = useState(null);

    // Selected Entities
    const [activeSupplier, setActiveSupplier] = useState(null);
    const [supplierDetails, setSupplierDetails] = useState({ purchases: [], payments: [], unpaid_purchases: [] });
    const [activeDetailTab, setActiveDetailTab] = useState('purchases'); // 'purchases' | 'payments'
    const [activeLedger, setActiveLedger] = useState([]);
    const [supplierPurchases, setSupplierPurchases] = useState([]);
    const [activeLedgerTab, setActiveLedgerTab] = useState('statement'); // 'statement' | 'bills' | 'add-bill' | 'pay'
    const [activeReceipt, setActiveReceipt] = useState(null);

    // Selected Purchase Bill for Detailed View
    const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState(null);
    const [purchaseDetailModalOpen, setPurchaseDetailModalOpen] = useState(false);
    const [purchaseDetailLoading, setPurchaseDetailLoading] = useState(false);

    // Form: Add Supplier
    const [addForm, setAddForm] = useState({
        name: '',
        company_name: '',
        phone: '',
        address: 'Timergara',
        opening_balance: '0'
    });

    // Form: Edit Supplier
    const [editForm, setEditForm] = useState({
        id: null,
        name: '',
        company_name: '',
        phone: '',
        address: '',
        opening_balance: '0'
    });

    // Form: FIFO Payment
    const [payForm, setPayForm] = useState({
        amount: '',
        payment_method: 'cash',
        payment_date: getTodayYMD(),
        reference_no: '',
        notes: ''
    });

    // Form: Add Multi-Item Purchase Bill (Stock Inward)
    const [billInvoiceNo, setBillInvoiceNo] = useState('');
    const [billInvoiceDate, setBillInvoiceDate] = useState(() => getTodayYMD());
    const [billItems, setBillItems] = useState([]);
    const [billAmountPaid, setBillAmountPaid] = useState('0');
    const [billPaymentMethod, setBillPaymentMethod] = useState('cash');
    const [billNotes, setBillNotes] = useState('');

    // Floating Product Search Modal for Add Purchase Bill
    const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);
    const [productSearchTargetRowIndex, setProductSearchTargetRowIndex] = useState(null);

    // Custom Non-Blocking Alert / Confirm Modal (Replaces native alert() that freezes the UI)
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
        confirmText: 'Got It',
        cancelText: 'Cancel',
        onConfirm: null
    });

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

    useEffect(() => {
        loadData();
        fetchProducts();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchSuppliers(), fetchKpis()]);
        } catch (err) {
            console.error('Error loading supplier data:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async (
        page = currentPage,
        limit = pageSize,
        search = searchQuery,
        status = statusFilter
    ) => {
        try {
            setTableLoading(true);
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                paginate: 'true'
            });
            if (search && search.trim()) params.append('search', search.trim());
            if (status && status !== 'all') params.append('status', status);

            const res = await fetch(apiUrl(`/api/suppliers?${params.toString()}`));
            if (res.ok) {
                const result = await res.json();
                if (result && result.pagination) {
                    setSuppliers(result.data || result.suppliers || []);
                    setTotalServerSuppliers(result.pagination.total);
                    setTotalServerPages(result.pagination.totalPages);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (result && (result.data || result.suppliers)) {
                    const list = result.data || result.suppliers || [];
                    setSuppliers(list);
                    setTotalServerSuppliers(result.total ?? result.pagination?.total ?? list.length);
                    setTotalServerPages(result.totalPages ?? result.pagination?.totalPages ?? 1);
                    if (result.summary) {
                        setServerSummary(result.summary);
                    }
                } else if (Array.isArray(result)) {
                    // Graceful fallback for unpaginated backend
                    const q = (search || '').toLowerCase().trim();
                    const filtered = result.filter(s => {
                        const matchesSearch = !q ||
                            (s.name && s.name.toLowerCase().includes(q)) ||
                            (s.company_name && s.company_name.toLowerCase().includes(q)) ||
                            (s.phone && s.phone.includes(q)) ||
                            (s.address && s.address.toLowerCase().includes(q));
                        if (!matchesSearch) return false;
                        if (status === 'pending') return (s.balance || 0) > 0.01;
                        if (status === 'cleared') return Math.abs(s.balance || 0) <= 0.01;
                        return true;
                    });
                    setTotalServerSuppliers(filtered.length);
                    setTotalServerPages(Math.max(1, Math.ceil(filtered.length / limit)));
                    const start = (page - 1) * limit;
                    setSuppliers(filtered.slice(start, start + limit));

                    const totalPending = result.reduce((sum, s) => sum + ((s.balance || 0) > 0.01 ? s.balance : 0), 0);
                    const pendingCount = result.filter(s => (s.balance || 0) > 0.01).length;
                    const clearedCount = result.filter(s => Math.abs(s.balance || 0) <= 0.01).length;
                    setServerSummary({
                        total_suppliers: result.length,
                        total_payables: totalPending,
                        pending_suppliers_count: pendingCount,
                        cleared_suppliers_count: clearedCount,
                        total_stock_added: result.reduce((sum, s) => sum + (parseFloat(s.total_purchase_amount) || 0), 0),
                        total_purchases_count: result.reduce((sum, s) => sum + (parseInt(s.total_purchases) || 0), 0),
                        total_paid: result.reduce((sum, s) => sum + (parseFloat(s.total_paid) || 0), 0)
                    });
                }
            }
        } catch (err) {
            console.error('Failed to fetch suppliers:', err);
        } finally {
            setTableLoading(false);
        }
    };

    // Auto-fetch with 200ms debounce on supplier search, filter, or page change
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchSuppliers(currentPage, pageSize, searchQuery, statusFilter);
        }, 200);
        return () => clearTimeout(handler);
    }, [searchQuery, statusFilter, currentPage, pageSize]);

    const fetchKpis = async () => {
        try {
            const res = await fetch(apiUrl('/api/suppliers/kpis'));
            if (res.ok) {
                const data = await res.json();
                setKpis(data);
            }
        } catch (err) {
            console.error('Failed to fetch KPIs:', err);
        }
    };

    const fetchProducts = async () => {
        // Instant memory access if available
        if (globalProductsCache && globalProductsCache.length > 0) {
            setProducts(globalProductsCache);
        }

        if (globalProductsPromise) {
            try {
                const data = await globalProductsPromise;
                if (Array.isArray(data)) setProducts(data);
                return data;
            } catch (e) {
                // fall through
            }
        }

        try {
            globalProductsPromise = fetch(apiUrl('/api/products')).then(res => res.json());
            const data = await globalProductsPromise;
            if (Array.isArray(data)) {
                // Precompute lowercase search index for instant filtering
                const enhanced = data.map(p => ({
                    ...p,
                    _searchText: `${p.product_name || ''} ${p.variant_name || ''} ${p.sku || ''} ${p.category_name || ''} ${p.variant_barcode || ''}`.toLowerCase()
                }));
                globalProductsCache = enhanced;
                setProducts(enhanced);
                return enhanced;
            }
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            globalProductsPromise = null;
        }
    };

    // Open Row Details (Purchases & Payments)
    const handleOpenDetails = async (supplier) => {
        setActiveSupplier(supplier);
        try {
            const res = await fetch(apiUrl(`/api/suppliers/${supplier.id}/details`));
            if (res.ok) {
                const data = await res.json();
                setSupplierDetails(data);
                setActiveDetailTab('purchases');
                setDetailsModalOpen(true);
            }
        } catch (err) {
            showAlert('Failed to load supplier details', 'error');
        }
    };

    // Open FIFO Pay Modal
    const handleOpenPayFifo = async (supplier) => {
        if (!supplier) return;
        setActiveSupplier(supplier);
        // Open modal immediately so button is 100% responsive
        setPayForm({
            amount: supplier.balance > 0 ? String(supplier.balance) : '',
            payment_method: 'cash',
            payment_date: getTodayYMD(),
            reference_no: '',
            notes: `FIFO payment for ${supplier.name}`
        });
        setPayFifoModalOpen(true);

        try {
            const res = await fetch(apiUrl(`/api/suppliers/${supplier.id}/details`));
            if (res.ok) {
                const data = await res.json();
                setSupplierDetails(data);
            }
        } catch (err) {
            console.error('Could not load unpaid bills preview:', err);
        }
    };

    // Submit FIFO Payment
    const handleSubmitFifoPay = async (e) => {
        e.preventDefault();
        const amt = parseFloat(payForm.amount);
        if (!amt || amt <= 0) return showAlert('Enter a valid payment amount', 'warning');

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            let res = await fetch(apiUrl(`/api/suppliers/${activeSupplier.id}/pay-fifo`), {
                method: 'POST',
                headers,
                body: JSON.stringify(payForm)
            });

            // Resilient Fallback: If /pay-fifo endpoint is 404 (e.g. backend process not restarted), use /api/payments
            if (res.status === 404) {
                res = await fetch(apiUrl('/api/payments'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        party_type: 'supplier',
                        party_id: activeSupplier.id,
                        amount: amt,
                        payment_method: payForm.payment_method,
                        reference_no: payForm.reference_no,
                        notes: payForm.notes,
                        payment_date: payForm.payment_date
                    })
                });
            }

            const data = await res.json();
            if (res.ok) {
                setPayFifoModalOpen(false);
                // Set active receipt for quick printing
                setActiveReceipt({
                    supplier: activeSupplier,
                    paymentId: data.paymentId || 'PAY',
                    amount: amt,
                    payment_method: payForm.payment_method,
                    date: payForm.payment_date,
                    reference_no: payForm.reference_no,
                    notes: payForm.notes,
                    settledBills: data.settledBills || []
                });
                setReceiptModalOpen(true);
                loadData();
                refreshActiveSupplierLedger(activeSupplier.id);
            } else {
                showAlert(data.error || 'Failed to process payment', 'error');
            }
        } catch (err) {
            showAlert('Payment error: ' + err.message, 'error');
        }
    };

    const refreshActiveSupplierLedger = async (supplierId) => {
        if (!supplierId) return;
        try {
            const res = await fetch(apiUrl(`/api/suppliers/${supplierId}/ledger`));
            if (res.ok) {
                const data = await res.json();
                setActiveLedger(data.ledger || []);
                setSupplierPurchases(data.purchases || []);
                if (data.supplier) setActiveSupplier(data.supplier);
            }
        } catch (err) {
            console.error('Failed to refresh supplier ledger:', err);
        }
    };

    // Open Add Bill Modal for a specific supplier with multi-item support
    const handleOpenAddBill = async (supplier) => {
        const sup = supplier || activeSupplier;
        if (!sup) return;
        setActiveSupplier(sup);
        const randomInvoice = `INV-${Date.now().toString().slice(-5)}`;
        setBillInvoiceNo(randomInvoice);
        setBillInvoiceDate(getTodayYMD());
        setBillAmountPaid('0');
        setBillPaymentMethod('cash');
        setBillNotes('');
        setProductSearchModalOpen(false);
        setProductSearchTargetRowIndex(null);

        let prods = products.length > 0 ? products : globalProductsCache;
        if (!prods || prods.length === 0) {
            prods = await fetchProducts();
        }

        if (prods && prods.length > 0) {
            const firstProd = prods[0];
            const defaultPack = firstProd.packagings?.[0] || { packaging_type_id: 1, purchase_price: 500, conversion_factor: 1 };
            setBillItems([
                {
                    variant_id: firstProd.variant_id,
                    packaging_type_id: defaultPack.packaging_type_id,
                    quantity: '10',
                    purchase_price: String(defaultPack.purchase_price || 500),
                    conversion_factor: defaultPack.conversion_factor || 1,
                    total: 10 * (defaultPack.purchase_price || 500)
                }
            ]);
        } else {
            setBillItems([]);
        }
        setAddBillModalOpen(true);
    };

    // Open Floating Search Modal to select or change product for a specific bill item row
    const handleOpenProductSearchForRow = (rowIndex) => {
        setProductSearchTargetRowIndex(rowIndex);
        setProductSearchModalOpen(true);
    };

    // Callback when user selects a product from the floating search modal
    const handleSelectProductForBill = (rowIndex, selectedProd) => {
        if (!selectedProd) return;
        const updated = [...billItems];
        const defaultPack = selectedProd.packagings?.[0] || { packaging_type_id: 1, purchase_price: 500, conversion_factor: 1 };
        
        if (rowIndex !== null && rowIndex >= 0 && rowIndex < updated.length) {
            // Update existing row
            const row = { ...updated[rowIndex] };
            row.variant_id = selectedProd.variant_id;
            row.packaging_type_id = defaultPack.packaging_type_id;
            row.purchase_price = String(defaultPack.purchase_price || 500);
            row.conversion_factor = defaultPack.conversion_factor || 1;
            row.quantity = row.quantity || '10';
            row.total = (parseFloat(row.quantity) || 1) * (parseFloat(row.purchase_price) || 0);
            updated[rowIndex] = row;
        } else {
            // Append as new row
            updated.push({
                variant_id: selectedProd.variant_id,
                packaging_type_id: defaultPack.packaging_type_id,
                quantity: '10',
                purchase_price: String(defaultPack.purchase_price || 500),
                conversion_factor: defaultPack.conversion_factor || 1,
                total: 10 * (defaultPack.purchase_price || 500)
            });
        }
        
        setBillItems(updated);
        setProductSearchModalOpen(false);
        setProductSearchTargetRowIndex(null);
    };

    // Add another item row to current bill and open floating search modal for quick selection
    const handleAddBillItemRow = () => {
        const prods = products.length > 0 ? products : globalProductsCache;
        if (!prods || prods.length === 0) {
            fetchProducts();
            return showAlert('Loading products catalog. Please try again in a moment.', 'warning');
        }
        const firstProd = prods[0];
        const defaultPack = firstProd.packagings?.[0] || { packaging_type_id: 1, purchase_price: 500, conversion_factor: 1 };
        const newIdx = billItems.length;
        setBillItems([
            ...billItems,
            {
                variant_id: firstProd.variant_id,
                packaging_type_id: defaultPack.packaging_type_id,
                quantity: '10',
                purchase_price: String(defaultPack.purchase_price || 500),
                conversion_factor: defaultPack.conversion_factor || 1,
                total: 10 * (defaultPack.purchase_price || 500)
            }
        ]);
        // Open search modal immediately so the user can quickly search and pick the item
        setProductSearchTargetRowIndex(newIdx);
        setProductSearchModalOpen(true);
    };

    // Update row in multi-item bill
    const handleUpdateBillItemRow = (index, field, value) => {
        const updated = [...billItems];
        const row = { ...updated[index] };

        if (field === 'variant_id') {
            const prod = products.find(p => p.variant_id === parseInt(value));
            row.variant_id = parseInt(value);
            const pack = prod?.packagings?.[0] || { packaging_type_id: 1, purchase_price: 500, conversion_factor: 1 };
            row.packaging_type_id = pack.packaging_type_id;
            row.purchase_price = String(pack.purchase_price || 500);
            row.conversion_factor = pack.conversion_factor || 1;
            row.total = (parseFloat(row.quantity) || 0) * (parseFloat(row.purchase_price) || 0);
        } else if (field === 'packaging_type_id') {
            row.packaging_type_id = parseInt(value);
            const prod = products.find(p => p.variant_id === row.variant_id);
            const pack = prod?.packagings?.find(pk => pk.packaging_type_id === parseInt(value));
            if (pack) {
                row.purchase_price = String(pack.purchase_price || row.purchase_price);
                row.conversion_factor = pack.conversion_factor || 1;
            }
            row.total = (parseFloat(row.quantity) || 0) * (parseFloat(row.purchase_price) || 0);
        } else if (field === 'quantity') {
            row.quantity = value;
            row.total = (parseFloat(value) || 0) * (parseFloat(row.purchase_price) || 0);
        } else if (field === 'purchase_price') {
            row.purchase_price = value;
            row.total = (parseFloat(row.quantity) || 0) * (parseFloat(value) || 0);
        }

        updated[index] = row;
        setBillItems(updated);
    };

    // Remove row from multi-item bill
    const handleRemoveBillItemRow = (index) => {
        if (billItems.length <= 1) return showAlert('At least one item is required in the bill', 'warning');
        setBillItems(billItems.filter((_, i) => i !== index));
    };

    // Submit Multi-Item Stock Inward / Purchase Bill
    const handleSubmitMultiBill = async (e) => {
        e.preventDefault();
        if (billItems.length === 0) return showAlert('Please add at least one item to the bill', 'warning');

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

        const totalGross = formattedItems.reduce((sum, it) => sum + it.total, 0);
        const paid = parseFloat(billAmountPaid) || 0;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/purchases'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    supplier_id: activeSupplier.id,
                    supplier_invoice_no: billInvoiceNo,
                    invoice_date: billInvoiceDate,
                    gross_amount: totalGross,
                    discount: 0,
                    additional_charges: 0,
                    net_amount: totalGross,
                    amount_paid: paid,
                    payment_method: billPaymentMethod,
                    notes: billNotes,
                    items: formattedItems
                })
            });

            if (res.ok) {
                setAddBillModalOpen(false);
                await loadData();
                await refreshActiveSupplierLedger(activeSupplier.id);
                setActiveLedgerTab('bills'); // Take user to Bills tab
                setLedgerModalOpen(true);
                showAlert(`Stock inward bill "${billInvoiceNo}" with ${formattedItems.length} item(s) recorded successfully for ${activeSupplier.name}!`, 'success', 'Stock Inward Bill Saved');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to record purchase bill', 'error');
            }
        } catch (err) {
            showAlert('Unable to connect to server: ' + err.message + '\nPlease check if backend service is running on port 5000.', 'error', 'Connection Error');
        }
    };

    // Open Ledger Modal (Statement, Bills, Pay, Add Bill)
    const handleOpenLedger = async (supplier) => {
        setActiveSupplier(supplier);
        setActiveLedgerTab('statement');
        setLedgerModalOpen(true);
        await refreshActiveSupplierLedger(supplier.id);
    };

    // View Detailed Items of an Individual Purchase Bill
    const handleViewPurchaseBill = async (purchaseId) => {
        setPurchaseDetailLoading(true);
        setPurchaseDetailModalOpen(true);
        try {
            const res = await fetch(apiUrl(`/api/purchases/${purchaseId}`));
            if (res.ok) {
                const data = await res.json();
                setSelectedPurchaseDetail(data);
            }
        } catch (err) {
            console.error('Failed to load purchase bill details:', err);
        } finally {
            setPurchaseDetailLoading(false);
        }
    };

    // Open Edit Modal
    const handleOpenEdit = (supplier) => {
        setEditForm({
            id: supplier.id,
            name: supplier.name,
            company_name: supplier.company_name || '',
            phone: supplier.phone || '',
            address: supplier.address || '',
            opening_balance: String(supplier.opening_balance || 0)
        });
        setEditModalOpen(true);
    };

    // Submit Edit Supplier
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(apiUrl(`/api/suppliers/${editForm.id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...editForm,
                    opening_balance: parseFloat(editForm.opening_balance) || 0
                })
            });

            const data = await res.json();
            if (res.ok) {
                setEditModalOpen(false);
                await loadData();
                if (selectedSupplier?.id === editForm.id) {
                    await handleOpenLedger({ ...selectedSupplier, id: editForm.id });
                }
                showAlert('Supplier profile updated successfully!', 'success');
            } else {
                showAlert(data.error || 'Failed to update supplier', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // Soft Delete Supplier with 0 Balance Protection
    const handleDeleteSupplier = (supplier) => {
        if (Math.abs(supplier.balance) > 0.01) {
            showAlert(`Cannot delete supplier "${supplier.name}"!\n\nThis supplier currently has an outstanding pending balance of Rs. ${supplier.balance.toLocaleString()}.\n\nSuppliers can only be deactivated when their balance is exactly Rs. 0 to prevent corruption of audit and financial history reports.`, 'warning', 'Deletion Blocked');
            return;
        }

        showConfirm(
            `Are you sure you want to delete supplier "${supplier.name}"?\n\nThis supplier has 0 pending balance. They will be safely removed from active selection while historical purchase bills and ledgers remain preserved.`,
            async () => {
                try {
                    const token = localStorage.getItem('token');
                    const headers = {};
                    if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

                    const res = await fetch(apiUrl(`/api/suppliers/${supplier.id}`), {
                        method: 'DELETE',
                        headers
                    });

                    const data = await res.json();
                    if (res.ok) {
                        loadData();
                        showAlert(`Supplier "${supplier.name}" removed successfully.`, 'success');
                    } else {
                        showAlert(data.error || 'Failed to delete supplier', 'error');
                    }
                } catch (err) {
                    showAlert(err.message, 'error');
                }
            },
            'Confirm Supplier Deletion'
        );
    };

    // Add New Supplier
    const handleSaveAddSupplier = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(apiUrl('/api/suppliers'), {
                method: 'POST',
                headers,
                body: JSON.stringify(addForm)
            });

            if (res.ok) {
                setAddModalOpen(false);
                setAddForm({
                    name: '',
                    company_name: '',
                    phone: '',
                    address: 'Timergara',
                    opening_balance: '0'
                });
                loadData();
                showAlert('New supplier registered successfully!', 'success');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to add supplier', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // Quick WhatsApp Message
    const handleWhatsApp = (supplier) => {
        const cleanPhone = (supplier.phone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone) {
            showAlert(`No valid phone number found for ${supplier.name}. Please edit their profile to add a valid mobile phone number.`, 'warning', 'Missing Phone Number');
            return;
        }
        const text = encodeURIComponent(
            `Assalam-o-Alaikum ${supplier.name},\n\nThis is an account statement update from ${settings?.shop_name || 'Hilal Wholesaler Shop'}.\n\nYour current outstanding payable balance is: Rs. ${supplier.balance.toLocaleString()}.\n\nPlease let us know if you require any ledger reconciliation.\n\nThank you!`
        );
        window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    };

    // Derived Summary KPI Stats (combining server summary if available with kpi state)
    const totalSuppliersCount = serverSummary?.total_suppliers ?? (kpis?.supplier_count || suppliers.length);
    const totalStockAddedValue = serverSummary?.total_stock_added ?? (kpis?.total_stock_added || 0);
    const totalPurchasesCount = serverSummary?.total_purchases_count ?? (kpis?.total_purchases_count || 0);
    const totalPaidValue = serverSummary?.total_paid ?? (kpis?.total_paid || 0);
    const totalPayablesAmount = serverSummary?.total_payables ?? (kpis?.total_pending || 0);
    const pendingSuppliersCount = serverSummary?.pending_suppliers_count ?? suppliers.filter(s => (s.balance || 0) > 0.01).length;
    const clearedSuppliersCount = serverSummary?.cleared_suppliers_count ?? suppliers.filter(s => Math.abs(s.balance || 0) <= 0.01).length;

    // Server-Side Pagination Variables
    const totalPages = Math.max(1, totalServerPages);
    const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startSupplierIndex = totalServerSuppliers === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
    const endSupplierIndex = Math.min(validCurrentPage * pageSize, totalServerSuppliers);
    const paginatedSuppliers = suppliers;

    return (
        <div className="space-y-6 pb-12">
            {/* TOP HEADER: Title & + Add Supplier Button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-xs gap-3 sm:gap-4">
                <div>
                    <h1 className="text-lg sm:text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <IconSuppliers className="w-5 sm:w-6 h-5 sm:h-6 text-[#0B3B7B] shrink-0" />
                        <span>Supplier Accounts & Stock Inward</span>
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Manage vendor relationships, purchase invoices, FIFO payments, receipts & account statements
                    </p>
                </div>

                {/* Right Side "+ Add Supplier" Button */}
                <button
                    onClick={() => setAddModalOpen(true)}
                    className="w-full sm:w-auto justify-center px-4 sm:px-5 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                >
                    <IconPlus className="w-4 h-4 text-white" />
                    <span>+ Add Supplier</span>
                </button>
            </div>

            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {/* KPI 1: Total Stock Added */}
                <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                        <span className="truncate">Total Stock Added</span>
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-blue-50 text-[#0B3B7B] shrink-0">
                            <IconInventory className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </div>
                    </div>
                    <div className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight truncate">
                        Rs. {Number(totalStockAddedValue || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 font-medium flex items-center gap-1 truncate">
                        <span className="font-bold text-[#0B3B7B]">{totalPurchasesCount || 0}</span>
                        <span>inward bills</span>
                    </div>
                </div>

                {/* KPI 2: Total Paid to Suppliers */}
                <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                        <span className="truncate">Total Paid</span>
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
                            <IconPayments className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </div>
                    </div>
                    <div className="text-lg sm:text-2xl font-black text-emerald-700 tracking-tight truncate">
                        Rs. {Number(totalPaidValue || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 font-medium truncate">
                        Cleared via cash, bank & FIFO
                    </div>
                </div>

                {/* KPI 3: Total Pending / Payables */}
                <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                        <span className="truncate">Outstanding Payables</span>
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-rose-50 text-rose-600 shrink-0">
                            <IconWarning className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </div>
                    </div>
                    <div className="text-lg sm:text-2xl font-black text-rose-600 tracking-tight truncate">
                        Rs. {Number(totalPayablesAmount || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-rose-700 font-medium truncate">
                        Net amount owed to vendors
                    </div>
                </div>

                {/* KPI 4: Active Suppliers */}
                <div className="bg-white p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 shadow-xs space-y-1 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                        <span className="truncate">Registered Vendors</span>
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-blue-50 text-[#0B3B7B] shrink-0">
                            <IconSuppliers className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </div>
                    </div>
                    <div className="text-lg sm:text-2xl font-black text-[#0B3B7B] truncate">
                        {totalSuppliersCount} Vendors
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 font-medium truncate">
                        Active wholesale accounts
                    </div>
                </div>
            </div>

            {/* SEARCH & FILTERS BAR */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-3 bg-white p-3 sm:p-3.5 rounded-2xl border border-gray-200 shadow-xs">
                <div className="relative w-full sm:w-80">
                    <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search supplier, company, phone..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 transition-all"
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

                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto text-xs font-bold no-scrollbar py-0.5">
                    <button
                        onClick={() => {
                            setStatusFilter('all');
                            setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${statusFilter === 'all'
                                ? 'bg-[#0B3B7B] text-white shadow-xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        All ({totalSuppliersCount})
                    </button>
                    <button
                        onClick={() => {
                            setStatusFilter('pending');
                            setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${statusFilter === 'pending'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Pending Due ({pendingSuppliersCount})
                    </button>
                    <button
                        onClick={() => {
                            setStatusFilter('cleared');
                            setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${statusFilter === 'cleared'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Zero Balance ({clearedSuppliersCount})
                    </button>
                </div>
            </div>

            {/* MAIN SUPPLIERS TABLE & MOBILE VIEW */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                <div className="p-3.5 sm:p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <h2 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                            <span>Wholesale Suppliers Directory</span>
                            {tableLoading && (
                                <IconSpinner className="w-3.5 h-3.5 animate-spin text-[#0B3B7B]" />
                            )}
                        </h2>
                        <p className="text-[11px] text-gray-400">
                            Click any supplier row to view complete purchase bills, ledger statements & payment vouchers
                        </p>
                    </div>
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                        {totalServerSuppliers} Vendors
                    </span>
                </div>

                {/* MOBILE CARDS VIEW (block md:hidden) */}
                <div className="block md:hidden p-3 space-y-3">
                    {tableLoading && paginatedSuppliers.length === 0 ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={`m-skel-${i}`} className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-200 animate-pulse space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-1/2" />
                                <div className="h-3 bg-gray-200 rounded w-1/3" />
                            </div>
                        ))
                    ) : paginatedSuppliers.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 p-4">
                            <IconSuppliers className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                            <div className="font-bold text-gray-700 text-xs">No wholesale suppliers found</div>
                        </div>
                    ) : (
                        paginatedSuppliers.map((sup) => {
                            const hasPending = (sup.balance || 0) > 0.01;
                            const initials = sup.name
                                ? sup.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                                : 'SP';

                            return (
                                <div
                                    key={`m-${sup.id}`}
                                    onClick={() => handleOpenLedger(sup)}
                                    className="p-3.5 bg-white border border-gray-200 hover:border-[#0B3B7B]/30 rounded-xl shadow-2xs space-y-2.5 transition-all cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-xs text-[#0B3B7B] shrink-0">
                                                {initials}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-gray-900 text-sm truncate">{sup.name}</div>
                                                <div className="text-[10.5px] text-gray-500 truncate">
                                                    {sup.company_name || 'Individual Vendor'} • {sup.phone || 'No phone'}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 ${
                                            hasPending
                                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}>
                                            {hasPending ? 'Pending Due' : 'Cleared (Rs. 0)'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-1.5 p-2 bg-gray-50 rounded-lg text-center text-[10.5px]">
                                        <div>
                                            <div className="text-gray-400 font-medium">Inward Bills</div>
                                            <div className="font-bold text-gray-800">{sup.total_purchases || 0} Bills</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 font-medium">Total Paid</div>
                                            <div className="font-bold text-emerald-700">Rs. {Math.round(sup.total_paid || 0).toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 font-medium">Net Due</div>
                                            <div className={`font-black ${hasPending ? 'text-rose-600' : 'text-emerald-700'}`}>
                                                Rs. {Math.round(Math.abs(sup.balance || 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1.5 flex-1">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenAddBill(sup)}
                                                className="flex-1 py-1 px-2 bg-blue-50 hover:bg-blue-100 text-[#0B3B7B] rounded-lg font-bold text-[11px] border border-blue-200 transition-all flex items-center justify-center gap-1"
                                            >
                                                <IconBill className="w-3 h-3 text-[#0B3B7B]" />
                                                <span>+ Bill</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPayFifo(sup)}
                                                className="flex-1 py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[11px] border border-emerald-200 transition-all flex items-center justify-center gap-1"
                                            >
                                                <IconPayments className="w-3 h-3 text-emerald-700" />
                                                <span>Pay</span>
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenLedger(sup)}
                                                className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200"
                                                title="View Ledger"
                                            >
                                                <IconReceipt className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActionModalSupplier(sup)}
                                                className="p-1.5 bg-gray-50 hover:bg-slate-100 text-gray-600 rounded-lg border border-gray-200"
                                                title="More"
                                            >
                                                <IconDotsVertical className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* DESKTOP DATA TABLE (hidden md:block) */}
                <div className="hidden md:block overflow-x-auto lg:overflow-x-visible w-full px-4 pt-3 pb-2">
                    <table className="w-full text-left text-xs border-separate border-spacing-y-2.5">
                        <thead>
                            <tr className="text-gray-500 font-bold uppercase tracking-wider text-[10.5px]">
                                <th className="pb-1 px-3.5">Supplier & Company</th>
                                <th className="pb-1 px-2.5 text-center min-w-[80px]">Inward Bills</th>
                                <th className="pb-1 px-2.5 text-right min-w-[95px]">Total Inward</th>
                                <th className="pb-1 px-2.5 text-right min-w-[90px]">Total Paid</th>
                                <th className="pb-1 px-2.5 text-right min-w-[105px]">Net Balance</th>
                                <th className="pb-1 px-2.5 text-center min-w-[90px]">Status</th>
                                <th className="pb-1 px-3 text-center min-w-[140px]">Quick Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableLoading && paginatedSuppliers.length === 0 ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={`skel-${i}`} className="animate-pulse">
                                        <td colSpan={7} className="py-5 px-4 bg-gray-50/70 rounded-xl border border-gray-200">
                                            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                                            <div className="h-3 bg-gray-200 rounded w-1/4" />
                                        </td>
                                    </tr>
                                ))
                            ) : paginatedSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-14 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                                        <IconSuppliers className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                                        <div className="font-bold text-gray-700 text-sm">No wholesale suppliers found</div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {searchQuery || statusFilter !== 'all'
                                                ? 'Try adjusting your search query or filter'
                                                : 'Click "+ Add Supplier" to register your first vendor.'}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedSuppliers.map((sup) => {
                                    const hasPending = (sup.balance || 0) > 0.01;
                                    const isZero = Math.abs(sup.balance || 0) <= 0.01;

                                    // Avatar initials
                                    const initials = sup.name
                                        ? sup.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                                        : 'SP';

                                    return (
                                        <tr
                                            key={sup.id}
                                            onClick={() => handleOpenLedger(sup)}
                                            className="bg-white hover:bg-blue-50/20 border border-gray-200/90 hover:border-[#0B3B7B]/30 rounded-xl transition-all shadow-2xs hover:shadow-xs group cursor-pointer"
                                        >
                                            {/* Column 1: Supplier & Company (Unified) */}
                                            <td className="py-2.5 px-3.5 rounded-l-xl border-y border-l border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-xs text-[#0B3B7B] shrink-0 shadow-2xs">
                                                        {initials}
                                                    </div>
                                                    <div className="space-y-0.5 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-gray-900 text-sm group-hover:text-[#0B3B7B] transition-colors truncate">
                                                                {sup.name}
                                                            </span>
                                                            <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-gray-200 text-[9.5px] font-bold text-gray-700 truncate max-w-[120px]">
                                                                {sup.company_name || 'Individual Vendor'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                                            <span className="font-semibold text-gray-700">{sup.phone || 'No phone'}</span>
                                                            <span>•</span>
                                                            <span className="text-gray-400 truncate max-w-[130px]">{sup.address || 'Timergara, KP'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 2: Inward Bills Count */}
                                            <td className="py-2.5 px-2.5 text-center border-y border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0B3B7B] font-bold text-[10.5px] border border-blue-200 inline-flex items-center gap-1 shadow-2xs">
                                                    <IconBill className="w-3 h-3 text-[#0B3B7B]" />
                                                    <span>{sup.total_purchases || 0} Bills</span>
                                                </span>
                                            </td>

                                            {/* Column 3: Total Inward Value */}
                                            <td className="py-2.5 px-2.5 text-right border-y border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                <div className="font-black text-xs text-gray-900 tracking-tight">
                                                    Rs. {Number(sup.total_purchase_amount || 0).toLocaleString()}
                                                </div>
                                                <div className="text-[9.5px] text-gray-400 font-medium">Total Invoiced</div>
                                            </td>

                                            {/* Column 4: Total Paid */}
                                            <td className="py-2.5 px-2.5 text-right border-y border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                <div className="font-black text-xs text-emerald-700 tracking-tight">
                                                    Rs. {Number(sup.total_paid || 0).toLocaleString()}
                                                </div>
                                                <div className="text-[9.5px] text-emerald-800 font-medium">Cleared Paid</div>
                                            </td>

                                            {/* Column 5: Net Balance */}
                                            <td className="py-2.5 px-2.5 text-right border-y border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                <div className={`font-black text-sm tracking-tight ${hasPending ? 'text-rose-600' : 'text-emerald-700'}`}>
                                                    Rs. {Number(Math.abs(sup.balance || 0)).toLocaleString()}
                                                </div>
                                                <div className="text-[9.5px] font-medium">
                                                    {hasPending ? (
                                                        <span className="text-rose-600 font-semibold">Our Payable</span>
                                                    ) : (
                                                        <span className="text-emerald-700 font-semibold">Zero Balance</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Column 6: Status Pill */}
                                            <td className="py-2.5 px-2.5 text-center border-y border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors">
                                                {hasPending ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                        Pending Due
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                                        <IconCheck className="w-3 h-3 text-emerald-600" />
                                                        Cleared (Rs. 0)
                                                    </span>
                                                )}
                                            </td>

                                            {/* Column 7: Quick Actions with 3-dot Menu at end */}
                                            <td className="py-2.5 px-3 text-center rounded-r-xl border-y border-r border-gray-200/80 group-hover:border-[#0B3B7B]/30 transition-colors" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* 1. Add Bill (Stock Inward) */}
                                                    <button
                                                        type="button"
                                                        title="Add Inward Bill (Stock Inward)"
                                                        onClick={() => handleOpenAddBill(sup)}
                                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0B3B7B] rounded-lg font-bold text-xs border border-blue-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                                                    >
                                                        <IconBill className="w-3 h-3 text-[#0B3B7B]" />
                                                        <span>+ Bill</span>
                                                    </button>

                                                    {/* 2. Manual Pay (FIFO) */}
                                                    <button
                                                        type="button"
                                                        title="Pay Supplier (FIFO Settlement)"
                                                        onClick={() => handleOpenPayFifo(sup)}
                                                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs border border-emerald-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                                                    >
                                                        <IconPayments className="w-3 h-3 text-emerald-700" />
                                                        <span>Pay</span>
                                                    </button>

                                                    {/* 3. Ledger / Statement */}
                                                    <button
                                                        type="button"
                                                        title="View Statement & Ledger"
                                                        onClick={() => handleOpenLedger(sup)}
                                                        className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-all cursor-pointer shadow-2xs hover:text-black active:scale-95"
                                                    >
                                                        <IconReceipt className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* 4. Three-Dot Icon (Opens Small Modal) */}
                                                    <button
                                                        type="button"
                                                        title="More options (Edit, Delete, WhatsApp)"
                                                        onClick={() => setActionModalSupplier(sup)}
                                                        className="p-1.5 bg-gray-50 hover:bg-slate-100 text-gray-600 hover:text-[#0B3B7B] rounded-lg border border-gray-200 hover:border-blue-300 transition-all cursor-pointer shadow-2xs active:scale-95"
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
                            Showing <strong className="text-gray-900 font-bold">{startSupplierIndex}</strong> to <strong className="text-gray-900 font-bold">{endSupplierIndex}</strong> of <strong className="text-gray-900 font-bold">{totalServerSuppliers}</strong> suppliers
                        </span>
                        {(searchQuery || statusFilter !== 'all') && totalServerSuppliers < totalSuppliersCount && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                                (filtered from {totalSuppliersCount})
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
                            <div className="flex items-center gap-1">
                                {getPageNumbers(validCurrentPage, totalPages).map((p, idx) => {
                                    if (p === '...') {
                                        return (
                                            <span key={`dots-${idx}`} className="px-1.5 text-gray-400 font-bold text-xs select-none">
                                                ...
                                            </span>
                                        );
                                    }
                                    const isCurrent = p === validCurrentPage;
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                                isCurrent
                                                    ? 'bg-[#0B3B7B] text-white shadow-xs'
                                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900 shadow-2xs'
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

            {/* ───────────────────────────────────────────────────────────── */}
            {/* SMALL ACTION MODAL (Opened from 3-dots icon: Edit & Delete)   */}
            {/* ───────────────────────────────────────────────────────────── */}
            {actionModalSupplier && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setActionModalSupplier(null)}
                >
                    <div
                        className="bg-white rounded-2xl max-w-sm w-full p-5 border border-gray-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-sm text-[#0B3B7B] shrink-0 shadow-2xs">
                                    {actionModalSupplier.name?.slice(0, 2).toUpperCase() || 'SP'}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-extrabold text-sm text-gray-900 truncate">
                                        {actionModalSupplier.name}
                                    </h4>
                                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
                                        <span className="font-semibold text-[#0B3B7B]">
                                            {actionModalSupplier.company_name || 'Individual Vendor'}
                                        </span>
                                        <span>•</span>
                                        <span>ID: #{actionModalSupplier.id}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActionModalSupplier(null)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                title="Close"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Quick Balance Status */}
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                            <div>
                                <div className="text-[10px] text-gray-400 uppercase font-semibold">Net Balance</div>
                                <div className={`font-black text-sm tracking-tight ${
                                    (actionModalSupplier.balance || 0) > 0.01 ? 'text-rose-600' : 'text-emerald-700'
                                }`}>
                                    Rs. {Number(Math.abs(actionModalSupplier.balance || 0)).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400 uppercase font-semibold">Status</div>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    (actionModalSupplier.balance || 0) > 0.01
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                    {(actionModalSupplier.balance || 0) > 0.01 ? 'Pending Due' : 'Cleared'}
                                </span>
                            </div>
                        </div>

                        {/* Actions: Edit, Delete, and WhatsApp */}
                        <div className="space-y-2">
                            {/* 1. Edit Supplier Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const sup = actionModalSupplier;
                                    setActionModalSupplier(null);
                                    handleOpenEdit(sup);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-gray-800 bg-gray-50 hover:bg-blue-50 hover:text-[#0B3B7B] rounded-xl border border-gray-200 transition-all cursor-pointer group shadow-2xs active:scale-95"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-gray-200 group-hover:border-blue-300 text-gray-600 group-hover:text-[#0B3B7B]">
                                        <IconEdit className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Edit Supplier Profile</div>
                                        <div className="text-[10px] text-gray-400 font-normal">Update name, company, phone, address & opening due</div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0B3B7B]" />
                            </button>

                            {/* 2. WhatsApp Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const sup = actionModalSupplier;
                                    setActionModalSupplier(null);
                                    handleWhatsApp(sup);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-all cursor-pointer group shadow-2xs active:scale-95"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-600">
                                        <IconWhatsApp className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Share Balance on WhatsApp</div>
                                        <div className="text-[10px] text-emerald-600 font-normal">Send account statement to vendor</div>
                                    </div>
                                </div>
                                <IconChevronRight className="w-4 h-4 text-emerald-600" />
                            </button>

                            {/* 3. Delete Supplier Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const sup = actionModalSupplier;
                                    setActionModalSupplier(null);
                                    handleDeleteSupplier(sup);
                                }}
                                disabled={(actionModalSupplier.balance || 0) > 0.01}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer group shadow-2xs active:scale-95 ${
                                    (actionModalSupplier.balance || 0) > 0.01
                                        ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className={`p-1.5 rounded-lg bg-white border ${
                                        (actionModalSupplier.balance || 0) > 0.01 ? 'border-gray-200 text-gray-300' : 'border-rose-200 text-rose-600'
                                    }`}>
                                        <IconTrash className="w-4 h-4" />
                                    </div>
                                    <div className="text-left">
                                        <div>Delete Supplier Profile</div>
                                        <div className="text-[10px] font-normal">
                                            {(actionModalSupplier.balance || 0) > 0.01
                                                ? 'Cannot delete: Pending balance exists'
                                                : 'Safely deactivate supplier account'}
                                        </div>
                                    </div>
                                </div>
                                {(actionModalSupplier.balance || 0) <= 0.01 && (
                                    <IconChevronRight className="w-4 h-4 text-rose-500" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 1: SUPPLIER DETAILS (Purchases & Payments on Row Click) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {detailsModalOpen && activeSupplier && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[96vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
                        {/* Header */}
                        <div className="p-3.5 sm:p-5 border-b border-gray-100 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-black text-gray-900 text-base sm:text-lg">
                                        {activeSupplier.name}
                                    </h3>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-gray-200 text-gray-700">
                                        {activeSupplier.company_name || 'Supplier'}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Phone: <span className="font-semibold text-gray-700">{activeSupplier.phone || 'N/A'}</span> •
                                    Address: <span className="font-semibold text-gray-700">{activeSupplier.address || 'Timergara'}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                <div className="text-left sm:text-right">
                                    <div className="text-[10px] uppercase font-bold text-gray-400">Current Payable</div>
                                    <div className="text-lg sm:text-xl font-black text-rose-600">
                                        Rs. {Number(activeSupplier.balance || 0).toLocaleString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDetailsModalOpen(false)}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
                                >
                                    <IconClose className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs: Purchases vs Payments */}
                        <div className="flex items-center gap-2 p-2.5 sm:p-3 border-b border-gray-100 bg-white overflow-x-auto no-scrollbar shrink-0">
                            <button
                                onClick={() => setActiveDetailTab('purchases')}
                                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeDetailTab === 'purchases'
                                        ? 'bg-[#0B3B7B] text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <IconBill className="w-4 h-4" />
                                <span>Purchase / Inward Bills ({supplierDetails.purchases?.length || 0})</span>
                            </button>

                            <button
                                onClick={() => setActiveDetailTab('payments')}
                                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeDetailTab === 'payments'
                                        ? 'bg-[#0B3B7B] text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <IconPayments className="w-4 h-4" />
                                <span>Payment Vouchers ({supplierDetails.payments?.length || 0})</span>
                            </button>

                            <div className="ml-auto flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        setDetailsModalOpen(false);
                                        handleOpenAddBill(activeSupplier);
                                    }}
                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0B3B7B] rounded-xl font-bold text-xs border border-blue-200 cursor-pointer whitespace-nowrap"
                                >
                                    + Add Bill
                                </button>
                                <button
                                    onClick={() => {
                                        setDetailsModalOpen(false);
                                        handleOpenPayFifo(activeSupplier);
                                    }}
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer whitespace-nowrap"
                                >
                                    Pay (FIFO)
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
                            {/* TAB 1: PURCHASES */}
                            {activeDetailTab === 'purchases' && (
                                <div className="space-y-3">
                                    {supplierDetails.purchases?.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-xs">
                                            No purchase bills found for this supplier.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                        <th className="p-2.5">Date</th>
                                                        <th className="p-2.5">Invoice #</th>
                                                        <th className="p-2.5 text-center">Items</th>
                                                        <th className="p-2.5 text-right">Gross Total</th>
                                                        <th className="p-2.5 text-right">Amount Paid</th>
                                                        <th className="p-2.5 text-right">Remaining Due</th>
                                                        <th className="p-2.5 text-center">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {supplierDetails.purchases.map(b => (
                                                        <tr key={b.id} className="hover:bg-gray-50/50">
                                                            <td className="p-2.5 text-gray-600 font-mono text-[11px]">
                                                                {new Date(b.created_at).toLocaleDateString()}
                                                            </td>
                                                            <td className="p-2.5 font-bold text-gray-900 font-mono">
                                                                {b.supplier_invoice_no || `BILL-${b.id}`}
                                                            </td>
                                                            <td className="p-2.5 text-center font-semibold text-gray-600">
                                                                {b.item_count || 1} SKU(s)
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-gray-900 font-mono">
                                                                Rs. {Number(b.net_amount).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                                                                Rs. {Number(b.amount_paid || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-black text-rose-600 font-mono">
                                                                Rs. {Number(b.remaining_balance || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${b.remaining_balance <= 0
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                                    }`}>
                                                                    {b.remaining_balance <= 0 ? 'Fully Paid' : 'Unpaid Due'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: PAYMENTS */}
                            {activeDetailTab === 'payments' && (
                                <div className="space-y-3">
                                    {supplierDetails.payments?.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-xs">
                                            No payment records found for this supplier.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[580px]">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                        <th className="p-2.5">Date</th>
                                                        <th className="p-2.5">Voucher #</th>
                                                        <th className="p-2.5">Method</th>
                                                        <th className="p-2.5">Reference / Notes</th>
                                                        <th className="p-2.5 text-right">Amount Paid</th>
                                                        <th className="p-2.5 text-center">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {supplierDetails.payments.map(pay => (
                                                        <tr key={pay.id} className="hover:bg-gray-50/50">
                                                            <td className="p-2.5 text-gray-600 font-mono text-[11px]">
                                                                {pay.payment_date || new Date(pay.created_at).toLocaleDateString()}
                                                            </td>
                                                            <td className="p-2.5 font-bold text-gray-900 font-mono">
                                                                PAY-{pay.id}
                                                            </td>
                                                            <td className="p-2.5 uppercase font-semibold text-gray-600 text-[10px]">
                                                                {pay.payment_method}
                                                            </td>
                                                            <td className="p-2.5 text-gray-700 font-medium max-w-xs truncate">
                                                                {pay.notes || pay.reference_no || 'Cash payment'}
                                                            </td>
                                                            <td className="p-2.5 text-right font-black text-emerald-700 text-sm font-mono">
                                                                Rs. {Number(pay.amount).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <button
                                                                    onClick={() => {
                                                                        setActiveReceipt({
                                                                            supplier: activeSupplier,
                                                                            paymentId: pay.id,
                                                                            amount: pay.amount,
                                                                            payment_method: pay.payment_method,
                                                                            date: pay.payment_date || pay.created_at,
                                                                            reference_no: pay.reference_no,
                                                                            notes: pay.notes
                                                                        });
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto cursor-pointer shadow-xs bg-[#0B3B7B] hover:bg-[#072B5C] text-white transition-all"
                                                                >
                                                                    <IconPrinter className="w-3 h-3 text-white" />
                                                                    <span>Receipt</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
                            <button
                                onClick={() => setDetailsModalOpen(false)}
                                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs cursor-pointer transition-all"
                            >
                                <span>Close Details</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 2: MANUAL PAY (FIFO TERMINOLOGY ALLOCATION)            */}
            {/* ───────────────────────────────────────────────────────────── */}
            {payFifoModalOpen && activeSupplier && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSubmitFifoPay} className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                    <IconPayments className="w-5 h-5 text-emerald-700" />
                                    <span>Manual Supplier Pay (FIFO System)</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Pay <span className="font-bold text-gray-900">{activeSupplier.name}</span> with First-In First-Out invoice settlement
                                </p>
                            </div>
                            <button type="button" onClick={() => setPayFifoModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Current Balance Box */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200 flex items-center justify-between">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-gray-500">Total Outstanding Due</div>
                                <div className="text-xl font-black text-rose-600">
                                    Rs. {Number(activeSupplier.balance || 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#0B3B7B] text-white">
                                    FIFO Priority
                                </span>
                                <div className="text-[10px] text-gray-500 mt-0.5">Oldest bills settled first</div>
                            </div>
                        </div>

                        {/* Input Fields */}
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">
                                    Payment Amount (Rs.) *
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    value={payForm.amount}
                                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm font-black text-[#0B3B7B] focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20"
                                    placeholder="Enter payment amount"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                <div>
                                    <label className="block font-bold text-gray-700 mb-1">Payment Method</label>
                                    <select
                                        value={payForm.payment_method}
                                        onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                                        className="w-full p-2 border border-gray-200 rounded-xl font-semibold bg-white"
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
                                        value={payForm.payment_date}
                                        onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                                        className="w-full p-2 border border-gray-200 rounded-xl font-semibold bg-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Cheque / Reference # (Optional)</label>
                                <input
                                    type="text"
                                    value={payForm.reference_no}
                                    onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })}
                                    placeholder="e.g. HBL-CHQ-98214"
                                    className="w-full p-2 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Voucher Remarks / Notes</label>
                                <input
                                    type="text"
                                    value={payForm.notes}
                                    onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                                    placeholder="Notes for ledger entry"
                                    className="w-full p-2 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>
                        </div>

                        {/* FIFO Breakdown Preview */}
                        {supplierDetails.unpaid_purchases && supplierDetails.unpaid_purchases.length > 0 && (
                            <div className="border border-gray-200 rounded-xl p-2.5 bg-gray-50 text-[11px] space-y-1">
                                <div className="font-bold text-gray-700 flex justify-between">
                                    <span>Oldest Outstanding Bills to Settle (FIFO):</span>
                                    <span>{supplierDetails.unpaid_purchases.length} Unpaid</span>
                                </div>
                                <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                                    {supplierDetails.unpaid_purchases.slice(0, 3).map((bill, i) => (
                                        <div key={bill.id} className="flex justify-between text-gray-600 bg-white p-1 rounded border border-gray-100">
                                            <span>#{i + 1}: {bill.supplier_invoice_no || `Bill-${bill.id}`} ({bill.invoice_date})</span>
                                            <span className="font-bold text-rose-600">Rs. {bill.remaining_balance.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setPayFifoModalOpen(false)}
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                            >
                                <span>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <IconCheck className="w-4 h-4 text-white" />
                                <span>Confirm & Record Payment</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 3: ADD PURCHASE BILL (Multi-Item Stock Inward for Supplier) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {addBillModalOpen && activeSupplier && (() => {
                const totalGross = billItems.reduce((sum, it) => sum + (parseFloat(it.total) || 0), 0);
                const paidAmt = parseFloat(billAmountPaid) || 0;
                const addedToDue = Math.max(0, totalGross - paidAmt);

                return (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2 sm:p-4 overflow-y-auto" style={{ zIndex: 100 }}>
                        <form onSubmit={handleSubmitMultiBill} className="bg-white rounded-2xl max-w-4xl w-full p-3.5 sm:p-5 space-y-3 shadow-2xl border border-gray-200 max-h-[96vh] sm:max-h-[94vh] flex flex-col">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2.5 shrink-0">
                                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B7B] shrink-0">
                                        <IconBill className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-gray-800 text-sm truncate">
                                                Add Purchase Bill (Stock Inward)
                                            </h3>
                                            <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[10.5px] font-medium text-[#0B3B7B] truncate">
                                                {activeSupplier.name} ({activeSupplier.company_name || 'Vendor'})
                                            </span>
                                        </div>
                                        <p className="text-[10.5px] text-gray-400 font-normal">Record incoming multi-item stock shipment and adjust supplier payable dues</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setAddBillModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                                    <IconClose className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-2.5 text-xs overflow-y-auto flex-1 pr-0.5">
                                {/* Bill Meta Information Strip */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-gray-50/70 p-2.5 rounded-xl border border-gray-200/80">
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Supplier Invoice # *</label>
                                        <input
                                            type="text"
                                            required
                                            value={billInvoiceNo}
                                            onChange={(e) => setBillInvoiceNo(e.target.value)}
                                            placeholder="e.g. INV-90412"
                                            className="w-full py-1.5 px-2 bg-white border border-gray-200 rounded-lg font-medium font-mono text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Invoice Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={billInvoiceDate}
                                            onChange={(e) => setBillInvoiceDate(e.target.value)}
                                            className="w-full py-1.5 px-2 bg-white border border-gray-200 rounded-lg font-medium text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes / Remarks</label>
                                        <input
                                            type="text"
                                            value={billNotes}
                                            onChange={(e) => setBillNotes(e.target.value)}
                                            placeholder="e.g. Delivery truck 4"
                                            className="w-full py-1.5 px-2 bg-white border border-gray-200 rounded-lg font-normal text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                        />
                                    </div>
                                </div>

                                {/* Multi-Item Products Table */}
                                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 flex justify-between items-center">
                                        <span className="font-semibold text-gray-700 text-xs">
                                            Bill Inward Items ({billItems.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleAddBillItemRow}
                                            className="px-2.5 py-1 rounded-lg font-medium text-xs shadow-xs flex items-center gap-1 cursor-pointer transition-all bg-[#0B3B7B] hover:bg-[#072B5C] text-white active:scale-95"
                                        >
                                            <IconPlus className="w-3 h-3 text-white" />
                                            <span>Add Another Item</span>
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto max-h-[300px]">
                                        <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-medium uppercase text-[10px]">
                                                    <th className="py-1.5 px-2 min-w-[230px]">Product Variant & Stock</th>
                                                    <th className="py-1.5 px-2 min-w-[125px]">Packaging Type</th>
                                                    <th className="py-1.5 px-2 w-20 text-center">Inward Qty</th>
                                                    <th className="py-1.5 px-2 w-24 text-right">Cost Rate (Rs.)</th>
                                                    <th className="py-1.5 px-2 w-24 text-right">Line Total</th>
                                                    <th className="py-1.5 px-1.5 w-8 text-center"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {billItems.map((item, idx) => {
                                                    const prod = products.find(p => p.variant_id === item.variant_id);
                                                    const currentStock = prod?.current_stock || 0;
                                                    const unitSym = prod?.unit_symbol || prod?.unit_name || 'pcs';

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                            {/* Interactive Product Selector Card that opens the Floating Search Modal */}
                                                            <td className="p-1.5">
                                                                <div
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() => handleOpenProductSearchForRow(idx)}
                                                                    className="w-full py-1 px-2 bg-white hover:bg-slate-50 border border-gray-200 hover:border-[#0B3B7B] rounded-lg transition-all cursor-pointer group flex items-center justify-between gap-1.5 shadow-2xs"
                                                                    title="Click to search and change item"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="font-semibold text-xs text-gray-800 group-hover:text-[#0B3B7B] truncate">
                                                                            {prod ? `${prod.product_name} (${prod.variant_name || 'Standard'})` : 'Click to select product...'}
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-500 font-medium">
                                                                            {prod ? `Stock: ${currentStock} ${unitSym}` : 'Search product catalog'}
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-1 rounded bg-gray-50 group-hover:bg-blue-50 text-gray-400 group-hover:text-[#0B3B7B] shrink-0 transition-colors">
                                                                        <IconSearch className="w-3 h-3" />
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Packaging Type */}
                                                            <td className="p-1.5">
                                                                <select
                                                                    value={item.packaging_type_id}
                                                                    onChange={(e) => handleUpdateBillItemRow(idx, 'packaging_type_id', e.target.value)}
                                                                    className="w-full py-1.5 px-1.5 bg-white border border-gray-200 rounded-lg font-medium text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                                                >
                                                                    {(prod?.packagings || []).map(pk => (
                                                                        <option key={pk.packaging_type_id} value={pk.packaging_type_id}>
                                                                            {pk.packaging_name} (x{pk.conversion_factor})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>

                                                            {/* Inward Qty */}
                                                            <td className="p-1.5 text-center">
                                                                <input
                                                                    type="number"
                                                                    required
                                                                    min="1"
                                                                    value={item.quantity}
                                                                    onChange={(e) => handleUpdateBillItemRow(idx, 'quantity', e.target.value)}
                                                                    className="w-full py-1.5 px-1 text-center bg-white border border-gray-200 rounded-lg font-medium text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                                                />
                                                            </td>

                                                            {/* Cost Rate */}
                                                            <td className="p-1.5 text-right">
                                                                <input
                                                                    type="number"
                                                                    required
                                                                    min="0"
                                                                    step="any"
                                                                    value={item.purchase_price}
                                                                    onChange={(e) => handleUpdateBillItemRow(idx, 'purchase_price', e.target.value)}
                                                                    className="w-full py-1.5 px-1.5 text-right bg-white border border-gray-200 rounded-lg font-medium font-mono text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                                                />
                                                            </td>

                                                            {/* Line Total */}
                                                            <td className="p-1.5 text-right font-medium font-mono text-xs text-gray-800">
                                                                Rs. {Number(item.total || 0).toLocaleString()}
                                                            </td>

                                                            {/* Remove Row Button */}
                                                            <td className="p-1.5 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveBillItemRow(idx)}
                                                                    className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                                                    title="Remove Item Row"
                                                                >
                                                                    <IconClose className="w-3.5 h-3.5" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Payment Details & Totals Calculation */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5">
                                        <div className="font-semibold text-gray-700 text-xs">Payment Information</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Amount Paid (Rs.)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={billAmountPaid}
                                                    onChange={(e) => setBillAmountPaid(e.target.value)}
                                                    className="w-full py-1 px-2 bg-white border border-gray-200 rounded-lg font-medium font-mono text-xs text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Payment Mode</label>
                                                <select
                                                    value={billPaymentMethod}
                                                    onChange={(e) => setBillPaymentMethod(e.target.value)}
                                                    className="w-full py-1 px-2 bg-white border border-gray-200 rounded-lg font-medium text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B3B7B]"
                                                >
                                                    <option value="cash">Cash</option>
                                                    <option value="bank">Bank Transfer</option>
                                                    <option value="cheque">Cheque</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-gray-200 flex flex-col justify-between text-xs font-mono">
                                        <div className="space-y-0.5">
                                            <div className="flex justify-between text-gray-600 text-[11px]">
                                                <span>Total Inward Gross:</span>
                                                <span className="font-semibold text-gray-800">Rs. {totalGross.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-emerald-700 text-[11px]">
                                                <span>Immediate Paid:</span>
                                                <span className="font-semibold">Rs. {paidAmt.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-gray-200 pt-1 mt-1">
                                            <span className="font-medium text-gray-700 text-[11px]">Added to Supplier Due:</span>
                                            <span className="text-sm font-semibold text-rose-600">
                                                Rs. {addedToDue.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Bottom Actions */}
                            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2.5 pt-2 border-t border-gray-100 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setAddBillModalOpen(false)}
                                    className="w-full sm:flex-1 py-2 rounded-xl font-medium text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center active:scale-95"
                                >
                                    <span>Cancel</span>
                                </button>
                                <button
                                    type="submit"
                                    className="w-full sm:flex-1 py-2 rounded-xl font-medium text-xs bg-[#16A34A] hover:bg-[#15803D] text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                    <IconCheck className="w-4 h-4 text-white" />
                                    <span>Save Inward Bill ({billItems.length} items)</span>
                                </button>
                            </div>
                        </form>
                    </div>
                );
            })()}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* FLOATING PRODUCT SEARCH MODAL (Ultra-Fast 60fps & Refined UI) */}
            {/* ───────────────────────────────────────────────────────────── */}
            <FastProductSearchModal
                isOpen={productSearchModalOpen}
                onClose={() => {
                    setProductSearchModalOpen(false);
                    setProductSearchTargetRowIndex(null);
                }}
                products={products.length > 0 ? products : (globalProductsCache || [])}
                targetRowIndex={productSearchTargetRowIndex}
                selectedVariantId={billItems[productSearchTargetRowIndex]?.variant_id}
                onSelect={(prod) => handleSelectProductForBill(productSearchTargetRowIndex, prod)}
            />

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 4: SUPPLIER LEDGER STATEMENT (KPIs, Bills, Pay & Add Bill) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {ledgerModalOpen && activeSupplier && (() => {
                const totalPurchasesDebit = activeLedger
                    .filter(row => row.type === 'purchase')
                    .reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

                const totalPaymentsCredit = activeLedger
                    .filter(row => row.type === 'payment' || row.type === 'return')
                    .reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

                const currentPendingDue = Number(activeSupplier.balance || 0);

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4 overflow-y-auto">
                        <div className="bg-white rounded-2xl sm:rounded-3xl max-w-5xl w-full max-h-[96vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
                            {/* Modal Header & Quick Actions Bar */}
                            <div className="p-3 sm:p-5 border-b border-gray-200 bg-gray-50/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-black text-gray-900 text-base sm:text-lg flex items-center gap-2">
                                            <IconSuppliers className="w-4 sm:w-5 h-4 sm:h-5 text-[#0B3B7B] shrink-0" />
                                            <span>Supplier Ledger: {activeSupplier.name}</span>
                                        </h3>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 border border-blue-200 text-[#0B3B7B]">
                                            {activeSupplier.company_name || 'Vendor'}
                                        </span>
                                    </div>
                                    <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                                        Phone: <span className="font-semibold text-gray-700">{activeSupplier.phone || 'N/A'}</span> •
                                        Address: <span className="font-semibold text-gray-700">{activeSupplier.address || 'Timergara'}</span>
                                    </div>
                                </div>

                                {/* Quick Action Buttons in Header */}
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenAddBill(activeSupplier)}
                                        className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer bg-[#0B3B7B] hover:bg-[#072B5C] text-white"
                                        title="Inward stock / record purchase invoice with multiple items"
                                    >
                                        <IconBill className="w-3.5 h-3.5 text-white" />
                                        <span>+ Add Bill</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleOpenPayFifo(activeSupplier)}
                                        className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
                                        title="Record supplier payment"
                                    >
                                        <IconPayments className="w-3.5 h-3.5 text-white" />
                                        <span>Pay Supplier</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
                                        title="Print Ledger Statement"
                                    >
                                        <IconPrinter className="w-4 h-4 text-gray-700" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setLedgerModalOpen(false)}
                                        className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl cursor-pointer transition-colors"
                                    >
                                        <IconClose className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* 4 PROPER KPI CARDS INSIDE LEDGER MODAL */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-2.5 sm:p-4 bg-white border-b border-gray-100 shrink-0">
                                {/* Card 1: Outstanding Balance Due */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-50 border border-gray-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-[#0B3B7B] uppercase tracking-wider truncate">
                                        Current Due Payable
                                    </div>
                                    <div className={`text-base sm:text-xl font-black font-mono truncate ${currentPendingDue > 0 ? 'text-rose-600' : 'text-emerald-700'
                                        }`}>
                                        Rs. {Math.round(currentPendingDue).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-medium truncate">
                                        {currentPendingDue > 0 ? 'We owe to supplier' : 'Fully cleared (Rs. 0)'}
                                    </div>
                                </div>

                                {/* Card 2: Total Inward Bills */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gray-50 border border-gray-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                        Total Inward Bills
                                    </div>
                                    <div className="text-base sm:text-xl font-black text-gray-900 font-mono truncate">
                                        Rs. {Math.round(totalPurchasesDebit).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-medium truncate">
                                        Debit Purchases (+)
                                    </div>
                                </div>

                                {/* Card 3: Total Payments Paid */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                                        Total Paid
                                    </div>
                                    <div className="text-base sm:text-xl font-black text-emerald-700 font-mono truncate">
                                        Rs. {Math.round(totalPaymentsCredit).toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-emerald-700 font-medium truncate">
                                        Credit Payments (-)
                                    </div>
                                </div>

                                {/* Card 4: Inward Bills Count */}
                                <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gray-50 border border-gray-200 space-y-0.5 sm:space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                        Inward Bills Count
                                    </div>
                                    <div className="text-base sm:text-xl font-black text-[#0B3B7B] truncate">
                                        {supplierPurchases.length} Inward Bills
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-medium truncate">
                                        {activeLedger.length} ledger movements
                                    </div>
                                </div>
                            </div>

                            {/* MODAL NAVIGATION TABS */}
                            <div className="px-3 sm:px-5 border-b border-gray-200 flex items-center gap-2 sm:gap-4 bg-gray-50/40 text-xs font-bold shrink-0 overflow-x-auto no-scrollbar">
                                <button
                                    onClick={() => setActiveLedgerTab('statement')}
                                    className={`py-2.5 sm:py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeLedgerTab === 'statement'
                                            ? 'border-[#0B3B7B] text-[#0B3B7B]'
                                            : 'border-transparent text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <IconReceipt className="w-3.5 h-3.5" />
                                    <span>Statement of Account ({activeLedger.length})</span>
                                </button>

                                <button
                                    onClick={() => setActiveLedgerTab('bills')}
                                    className={`py-2.5 sm:py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeLedgerTab === 'bills'
                                            ? 'border-[#0B3B7B] text-[#0B3B7B]'
                                            : 'border-transparent text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <IconBill className="w-3.5 h-3.5" />
                                    <span>Inward Purchase Bills ({supplierPurchases.length})</span>
                                </button>

                                <button
                                    onClick={() => handleOpenAddBill(activeSupplier)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 ml-auto shadow-md transition-all bg-[#0B3B7B] hover:bg-[#072B5C] text-white whitespace-nowrap shrink-0"
                                >
                                    <IconPlus className="w-3.5 h-3.5 text-white" />
                                    <span>+ Add Inward Bill</span>
                                </button>
                            </div>

                            {/* TAB 1: STATEMENT TABLE */}
                            {activeLedgerTab === 'statement' ? (
                                <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
                                    {activeLedger.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-xs">
                                            No ledger entries recorded yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                        <th className="p-2.5">Date</th>
                                                        <th className="p-2.5">Description / Ref</th>
                                                        <th className="p-2.5 text-center">Type</th>
                                                        <th className="p-2.5 text-right">Inward / Debit (+)</th>
                                                        <th className="p-2.5 text-right">Payment Paid (-)</th>
                                                        <th className="p-2.5 text-right">Running Due Balance</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {activeLedger.map((row) => (
                                                        <tr key={row.id} className="hover:bg-slate-50">
                                                            <td className="p-2.5 text-gray-600 font-mono text-[11px]">
                                                                {row.payment_date || (row.created_at ? row.created_at.split(' ')[0] : '-')}
                                                            </td>
                                                            <td className="p-2.5 font-semibold text-gray-800">
                                                                {row.description}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.type === 'purchase'
                                                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                    }`}>
                                                                    {row.type === 'purchase' ? 'Inward Bill' : 'Payment'}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-rose-600 font-mono">
                                                                {row.type === 'purchase' ? `Rs. ${Number(row.amount).toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                                                                {row.type === 'payment' || row.type === 'return' ? `Rs. ${Number(row.amount).toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="p-2.5 text-right font-black font-mono text-gray-900">
                                                                Rs. {Number(row.running_balance).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-gray-50/90 border-t-2 border-gray-300 font-bold text-xs">
                                                        <td colSpan={3} className="p-2.5 text-gray-800">Account Summary Total</td>
                                                        <td className="p-2.5 text-right text-rose-600 font-mono">Rs. {Math.round(totalPurchasesDebit).toLocaleString()}</td>
                                                        <td className="p-2.5 text-right text-emerald-700 font-mono">Rs. {Math.round(totalPaymentsCredit).toLocaleString()}</td>
                                                        <td className="p-2.5 text-right text-gray-900 font-black font-mono">Rs. {Math.round(currentPendingDue).toLocaleString()}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* TAB 2: INWARD PURCHASE BILLS TABLE */
                                <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0 space-y-3">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                        <div className="text-gray-500 font-medium">
                                            All purchase bills received from {activeSupplier.name}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenAddBill(activeSupplier)}
                                            className="px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all bg-[#0B3B7B] hover:bg-[#072B5C] text-white w-full sm:w-auto"
                                        >
                                            <IconBill className="w-3.5 h-3.5 text-white" />
                                            <span>+ Record New Bill</span>
                                        </button>
                                    </div>

                                    {supplierPurchases.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-xs">
                                            No purchase bills found for this vendor. Click "+ Add Bill" to inward physical stock.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                                        <th className="p-2.5">Supplier Invoice #</th>
                                                        <th className="p-2.5">Date</th>
                                                        <th className="p-2.5 text-center">Items</th>
                                                        <th className="p-2.5 text-right">Net Bill Amount</th>
                                                        <th className="p-2.5 text-right">Amount Paid</th>
                                                        <th className="p-2.5 text-right">Remaining Due</th>
                                                        <th className="p-2.5 text-center">Status</th>
                                                        <th className="p-2.5 text-center">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {supplierPurchases.map((bill) => (
                                                        <tr key={bill.id} className="hover:bg-slate-50">
                                                            <td className="p-2.5 font-bold text-[#0B3B7B] font-mono">
                                                                {bill.supplier_invoice_no || `PUR-#${bill.id}`}
                                                            </td>
                                                            <td className="p-2.5 text-gray-500 font-mono text-[11px]">
                                                                {bill.invoice_date || (bill.created_at ? bill.created_at.split(' ')[0] : '-')}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 font-bold text-[10px]">
                                                                    {bill.item_count || 1} item(s)
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-right font-black font-mono text-gray-900">
                                                                Rs. {Number(bill.net_amount || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                                                                Rs. {Number(bill.amount_paid || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-right font-bold text-rose-600 font-mono">
                                                                Rs. {Number(bill.remaining_balance || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bill.remaining_balance <= 0
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                    }`}>
                                                                    {bill.remaining_balance <= 0 ? 'Fully Paid' : 'Unpaid / Partial'}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <button
                                                                    onClick={() => handleViewPurchaseBill(bill.id)}
                                                                    className="px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 mx-auto cursor-pointer shadow-xs transition-all bg-[#0B3B7B] hover:bg-[#072B5C] text-white"
                                                                >
                                                                    <IconEye className="w-3.5 h-3.5 text-white" />
                                                                    <span>View Bill</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Footer Summary Bar */}
                            <div className="p-3 sm:p-3.5 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-500">Current Outstanding Payable:</span>
                                    <span className="text-sm sm:text-base font-black text-rose-600 font-mono">
                                        Rs. {currentPendingDue.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenAddBill(activeSupplier)}
                                        className="px-4 py-2 rounded-xl font-bold text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition-all bg-[#0B3B7B] hover:bg-[#072B5C] text-white text-center"
                                    >
                                        <IconBill className="w-3.5 h-3.5 text-white" />
                                        <span>+ Add Inward Bill</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPayFifo(activeSupplier)}
                                        className="px-4 py-2 rounded-xl font-bold text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-700 text-white text-center"
                                    >
                                        <IconPayments className="w-3.5 h-3.5 text-white" />
                                        <span>Pay Supplier (Rs. {currentPendingDue.toLocaleString()})</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 7: VIEW PURCHASE BILL DETAILS (Items & Rates Breakdown) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {purchaseDetailModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[96vh] sm:max-h-[88vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
                        <div className="p-3.5 sm:p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                            <div className="min-w-0 pr-2">
                                <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2 truncate">
                                    <IconBill className="w-4 h-4 text-[#0B3B7B] shrink-0" />
                                    <span className="truncate">Purchase Bill: {selectedPurchaseDetail?.supplier_invoice_no || `PUR-#${selectedPurchaseDetail?.id}`}</span>
                                </h3>
                                <p className="text-[11px] text-gray-500 truncate">
                                    Supplier: <span className="font-bold text-gray-800">{selectedPurchaseDetail?.supplier_name}</span> • Date: {selectedPurchaseDetail?.invoice_date || selectedPurchaseDetail?.created_at}
                                </p>
                            </div>
                            <button
                                onClick={() => setPurchaseDetailModalOpen(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer shrink-0"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                            {purchaseDetailLoading || !selectedPurchaseDetail ? (
                                <div className="py-8 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                                    <IconSpinner className="w-4 h-4 text-[#0B3B7B]" />
                                    Loading purchase items...
                                </div>
                            ) : (
                                <div className="space-y-4 text-xs">
                                    <div className="overflow-x-auto w-full border border-gray-200 rounded-xl">
                                        <table className="w-full text-left border-collapse min-w-[500px]">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                                                    <th className="p-2">Product Name</th>
                                                    <th className="p-2 text-center">Packaging</th>
                                                    <th className="p-2 text-center">Inward Qty</th>
                                                    <th className="p-2 text-right">Cost Rate</th>
                                                    <th className="p-2 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(selectedPurchaseDetail.items || []).map((it, idx) => (
                                                    <tr key={idx}>
                                                        <td className="p-2 font-bold text-gray-800">
                                                            {it.product_name}
                                                            {it.variant_name && it.variant_name !== 'Standard' && (
                                                                <span className="text-[10px] text-gray-500 ml-1">({it.variant_name})</span>
                                                            )}
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 font-semibold text-[10px]">
                                                                {it.packaging_name || 'Piece'}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-center font-bold">
                                                            {it.quantity}
                                                        </td>
                                                        <td className="p-2 text-right font-mono text-gray-600">
                                                            Rs. {Number(it.purchase_price || 0).toLocaleString()}
                                                        </td>
                                                        <td className="p-2 text-right font-black font-mono text-gray-900">
                                                            Rs. {Number(it.total || (it.quantity * it.purchase_price) || 0).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Bill Financial Summary */}
                                    <div className="bg-gray-50 p-3 rounded-xl space-y-1 font-mono text-xs">
                                        <div className="flex justify-between text-gray-600">
                                            <span>Gross Amount:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.gross_amount || 0).toLocaleString()}</span>
                                        </div>
                                        {selectedPurchaseDetail.discount > 0 && (
                                            <div className="flex justify-between text-rose-600">
                                                <span>Discount:</span>
                                                <span>-Rs. {Number(selectedPurchaseDetail.discount).toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-black text-gray-900 text-sm border-t pt-1">
                                            <span>Net Total:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.net_amount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-700 font-bold">
                                            <span>Amount Paid:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.amount_paid || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-rose-600 font-bold">
                                            <span>Remaining Payable Due:</span>
                                            <span>Rs. {Number(selectedPurchaseDetail.remaining_balance || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setPurchaseDetailModalOpen(false)}
                                className="w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer"
                            >
                                <span>Close Details</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 5: PAYMENT RECEIPT / VOUCHER (Printable)                */}
            {/* ───────────────────────────────────────────────────────────── */}
            {receiptModalOpen && activeReceipt && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-2.5 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[96vh] overflow-y-auto">
                        {/* Printable Voucher Section */}
                        <div id="printable-receipt" className="border border-gray-200 rounded-xl p-3.5 sm:p-4 bg-white space-y-3">
                            <div className="text-center border-b border-gray-100 pb-2">
                                <h3 className="font-black text-base text-[#0B3B7B]">{(settings?.shop_name || 'HILAL WHOLESALER SHOP').toUpperCase()}</h3>
                                <p className="text-[10px] text-gray-500">{settings?.shop_address || 'Main Bazar, Timergara, Dir Lower'} • Contact: {settings?.shop_phone || '0300-1234567'}</p>
                                <div className="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-black rounded border border-emerald-200 uppercase">
                                    Supplier Payment Voucher
                                </div>
                            </div>

                            <div className="text-[11px] space-y-1 text-gray-700">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Voucher #:</span>
                                    <span className="font-bold text-gray-900">VCH-{activeReceipt.paymentId}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Date:</span>
                                    <span className="font-semibold">{activeReceipt.date}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Paid To:</span>
                                    <span className="font-bold text-gray-900">{activeReceipt.supplier?.name} ({activeReceipt.supplier?.company_name})</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Payment Mode:</span>
                                    <span className="font-bold uppercase text-gray-800">{activeReceipt.payment_method}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Ref / Cheque #:</span>
                                    <span className="font-semibold">{activeReceipt.reference_no || '-'}</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                <span className="font-bold text-xs text-gray-700">Amount Paid:</span>
                                <span className="text-lg font-black text-emerald-800">
                                    Rs. {Number(activeReceipt.amount).toLocaleString()}
                                </span>
                            </div>

                            {activeReceipt.settledBills && activeReceipt.settledBills.length > 0 && (
                                <div className="text-[10px] text-gray-500 space-y-0.5 border-t border-gray-100 pt-2">
                                    <div className="font-bold text-gray-700">Settled Purchase Bills (FIFO):</div>
                                    {activeReceipt.settledBills.map((sb, i) => (
                                        <div key={i} className="flex justify-between">
                                            <span>Bill {sb.invoice_no || sb.purchase_id}</span>
                                            <span className="font-semibold text-emerald-700">Allocated: Rs. {sb.allocated_amount.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-6 flex justify-between text-[10px] text-gray-400 border-t border-gray-100">
                                <div>Prepared by: Cashier</div>
                                <div>Receiver Signature: ____________</div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={() => setReceiptModalOpen(false)}
                                className="w-full sm:flex-1 py-2 border border-gray-300 rounded-xl font-bold text-xs hover:bg-gray-50 cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="w-full sm:flex-1 py-2 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <IconPrinter className="w-4 h-4" />
                                <span>Print Voucher</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 6: + ADD SUPPLIER (Top Right Header Button)            */}
            {/* ───────────────────────────────────────────────────────────── */}
            {addModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSaveAddSupplier} className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                <IconSuppliers className="w-5 h-5 text-[#0B3B7B]" />
                                <span>Add New Wholesale Supplier</span>
                            </h3>
                            <button type="button" onClick={() => setAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Supplier / Contact Person *</label>
                                <input
                                    type="text"
                                    required
                                    value={addForm.name}
                                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                                    placeholder="e.g. Haji Muhammad Tariq"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Company / Mill / Brand Name</label>
                                <input
                                    type="text"
                                    value={addForm.company_name}
                                    onChange={(e) => setAddForm({ ...addForm, company_name: e.target.value })}
                                    placeholder="e.g. National Foods Ltd"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Phone Number *</label>
                                <input
                                    type="text"
                                    required
                                    value={addForm.phone}
                                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                                    placeholder="e.g. 03001234567"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">City / Address</label>
                                <input
                                    type="text"
                                    value={addForm.address}
                                    onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                                    placeholder="e.g. Timergara / Peshawar"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Opening Payable Balance (Rs.)</label>
                                <input
                                    type="number"
                                    value={addForm.opening_balance}
                                    onChange={(e) => setAddForm({ ...addForm, opening_balance: e.target.value })}
                                    placeholder="0"
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold"
                                />
                                <span className="text-[10px] text-gray-400 mt-0.5 block">Previous due if migrating accounts</span>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setAddModalOpen(false)}
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                            >
                                <span>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#16A34A] hover:bg-[#15803D] text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <IconCheck className="w-4 h-4 text-white" />
                                <span>Save Supplier Profile</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 7: EDIT SUPPLIER                                       */}
            {/* ───────────────────────────────────────────────────────────── */}
            {editModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2.5 sm:p-4 overflow-y-auto">
                    <form onSubmit={handleSaveEdit} className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-gray-200 max-h-[96vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                <IconEdit className="w-5 h-5 text-[#0B3B7B]" />
                                <span>Edit Supplier Profile</span>
                            </h3>
                            <button type="button" onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Supplier / Contact Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Company / Brand Name</label>
                                <input
                                    type="text"
                                    value={editForm.company_name}
                                    onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Address / Location</label>
                                <input
                                    type="text"
                                    value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 mb-1 flex items-center justify-between text-xs">
                                    <span>Opening Due Balance (Rs.)</span>
                                    <span className="text-[10px] font-semibold text-[#0B3B7B] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                        Editable
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={editForm.opening_balance}
                                    onChange={(e) => setEditForm({ ...editForm, opening_balance: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold font-mono text-gray-900 focus:bg-white focus:outline-none focus:border-[#0B3B7B]"
                                />
                                <span className="text-[10px] text-gray-400">
                                    Adjusting opening balance updates supplier running balance and ledger automatically.
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditModalOpen(false)}
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                            >
                                <span>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                className="w-full sm:flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#0B3B7B] hover:bg-[#072B5C] text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <IconCheck className="w-4 h-4 text-white" />
                                <span>Update Profile</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Custom Non-Blocking Alert & Confirmation Dialog */}
            <CustomModalAlert
                {...modalAlert}
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
