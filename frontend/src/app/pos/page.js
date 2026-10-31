'use client';
import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    setCustomer, addItem, updateItemQty, updateItemPrice,
    updateItemDiscount, removeItem, setDiscountsAndCharges, clearCart,
    setSettings
} from '../../store';
import {
    IconSearch, IconPOS, IconProducts, IconPrinter, IconWarning,
    IconClose, IconCustomers, IconSuppliers, IconDownload, IconReceipt, IconSpinner, IconCreditCard,
    IconWhatsApp, IconBank, IconPlus, IconBox, IconPackage, IconTag, IconBolt, IconLayers,
    IconArrowRight, IconBarcode
} from '../components/Icons';
import CustomModalAlert from '../components/CustomModalAlert';
import ThermalReceipt from '../components/ThermalReceipt';
import WholesaleA4InvoiceModal from '../components/WholesaleA4InvoiceModal';
import { triggerPrintHtml, generateThermalReceiptHtml, generateWholesaleInvoiceA4Html, truncateItemName, formatPackShort } from '../../lib/printHelper';

function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    let s = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
        s = s.replace(' ', 'T');
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(dateInput) : d;
}

function numberToWords(num) {
    if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
    num = Math.floor(Math.abs(num));
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function inWords(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
        if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
        if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
        return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    }
    return inWords(num) + ' Rupees Only';
}

function formatPosStockPure(product, packList) {
    if (!product) return '0 in stock';
    const totalPcs = parseFloat(product.current_stock) || 0;
    const unitName = product.unit_symbol || product.unit_name || 'pcs';
    const bulkPacks = (packList || product.packagings || [])
        .filter(p => (parseFloat(p.conversion_factor) || 1) > 1)
        .sort((a, b) => (parseFloat(b.conversion_factor) || 0) - (parseFloat(a.conversion_factor) || 0));

    if (bulkPacks.length === 0) {
        return `${Number(totalPcs).toLocaleString()} ${unitName}`;
    }

    let remaining = totalPcs;
    let parts = [];

    bulkPacks.forEach(pack => {
        const factor = parseFloat(pack.conversion_factor);
        if (factor > 1) {
            const count = Math.floor(remaining / factor);
            if (count > 0) {
                const name = pack.packaging_name || 'Bulk';
                parts.push(`${count} ${name}${count > 1 ? 's' : ''}`);
                remaining = remaining % factor;
            }
        }
    });

    if (remaining > 0 || parts.length === 0) {
        parts.push(`${remaining} ${unitName}`);
    }

    return `${parts.join(' + ')} (Total: ${Number(totalPcs).toLocaleString()} ${unitName})`;
}

function enrichProducts(rawProducts) {
    if (!Array.isArray(rawProducts)) return [];
    return rawProducts.map(p => {
        const packList = (p.packagings && p.packagings.length > 0)
            ? [...p.packagings].sort((a, b) => (parseFloat(a.conversion_factor) || 1) - (parseFloat(b.conversion_factor) || 1))
            : [{ packaging_type_id: 1, packaging_name: p.unit_symbol || p.unit_name || 'Unit', conversion_factor: 1, selling_price: 0 }];

        const defaultPack = packList.find(pk => pk.is_default) || packList[0];
        const maxFactor = packList.reduce((max, pk) => Math.max(max, parseFloat(pk.conversion_factor) || 1), 1);
        const isLowStock = (parseFloat(p.current_stock) || 0) <= (parseFloat(p.minimum_stock) || 0);
        const formattedStock = formatPosStockPure(p, packList);

        const barcodeTokens = [
            p.variant_barcode || '',
            ...packList.map(pk => pk.barcode || '')
        ].filter(Boolean).join(' ');

        const searchTokens = `${p.product_name || ''} ${p.sku || ''} ${p.variant_name || ''} ${p.category_name || ''} ${barcodeTokens}`.toLowerCase();

        return {
            ...p,
            _sortedPackagings: packList,
            _defaultPack: defaultPack,
            _maxFactor: maxFactor,
            _isLowStock: isLowStock,
            _formattedStock: formattedStock,
            _searchTokens: searchTokens
        };
    });
}

export default function POSPage() {
    const dispatch = useDispatch();
    const { user } = useSelector(state => state.auth);
    const cart = useSelector(state => state.cart);
    const settings = useSelector(state => state.settings);

    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customerSpecialPrices, setCustomerSpecialPrices] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearch = useDeferredValue(searchQuery);
    const searchInputRef = useRef(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState(null);
    const [mobileTab, setMobileTab] = useState('catalog'); // 'catalog' | 'cart'
    const [showOnlyEssential, setShowOnlyEssential] = useState(false);
    const [essentialIds, setEssentialIds] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('pos_essential_ids');
                if (saved) return JSON.parse(saved);
            } catch (e) {}
        }
        return [];
    });

    // Party Selection: 'customer' (Wholesale Customer) | 'walkin' (Cash Customer)
    const [partyType, setPartyType] = useState('customer');
    const [walkinName, setWalkinName] = useState('Walk-in Customer');
    const [walkinPhone, setWalkinPhone] = useState('');
    const [walkinAddress, setWalkinAddress] = useState('Timergara');

    // Modals
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentTab, setPaymentTab] = useState('payment'); // 'payment' | 'receipt'
    const [cashReceived, setCashReceived] = useState('');
    const [creditLimitModalOpen, setCreditLimitModalOpen] = useState(false);
    const [adminApprovalCode, setAdminApprovalCode] = useState('');
    const [creditErrorMessage, setCreditErrorMessage] = useState('');
    const [directPaymentToggle, setDirectPaymentToggle] = useState(true);

    const [activeInvoice, setActiveInvoice] = useState(null);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [thermalModalOpen, setThermalModalOpen] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [waSending, setWaSending] = useState(false);
    const [loading, setLoading] = useState(false);

    // Custom Non-Blocking Alert Modal State
    const [modalAlert, setModalAlert] = useState({
        isOpen: false,
        type: 'info',
        title: '',
        message: ''
    });

    const showAlert = (title, message, type = 'info') => {
        setModalAlert({ isOpen: true, title, message, type });
    };

    useEffect(() => {
        fetchProducts();
        fetchCategories();
        fetchCustomers();
        fetchGlobalSettings();
    }, []);

    const fetchGlobalSettings = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/settings');
            if (res.ok) {
                const data = await res.json();
                dispatch(setSettings(data));
            }
        } catch (err) {
            console.warn('[POS] Failed to fetch settings:', err);
        }
    };

    useEffect(() => {
        if (cart.editingSaleId) {
            if (cart.customer) {
                setPartyType('customer');
                fetchCustomerPrices(cart.customer.id);
            } else {
                setPartyType('walkin');
                if (cart.remarks && cart.remarks.includes('Walk-in:')) {
                    const match = cart.remarks.match(/Walk-in:\s*([^(\n\r]+)(?:\(([^)]+)\))?/);
                    if (match) {
                        setWalkinName(match[1].trim());
                        if (match[2]) setWalkinPhone(match[2].trim());
                    }
                }
            }
        }
    }, [cart.editingSaleId]);

    const fetchProducts = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/products');
            if (res.ok) {
                const data = await res.json();
                setProducts(enrichProducts(data));
            }
        } catch (err) {
            console.error('Failed to fetch products:', err);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/categories');
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    const fetchCustomers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/customers');
            if (res.ok) {
                const data = await res.json();
                setCustomers(data);
                if (data.length > 0 && !cart.customer && !cart.editingSaleId) {
                    dispatch(setCustomer(data[0]));
                    fetchCustomerPrices(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch customers:', err);
        }
    };


    const fetchCustomerPrices = async (customerId) => {
        if (!customerId) return;
        try {
            const res = await fetch(`http://localhost:5000/api/customers/${customerId}/prices`);
            if (res.ok) {
                const prices = await res.json();
                setCustomerSpecialPrices(prices);
            }
        } catch (err) {
            console.error('Failed to fetch customer specific prices:', err);
        }
    };

    const handleSelectCustomer = (cust) => {
        dispatch(setCustomer(cust));
        if (cust) {
            fetchCustomerPrices(cust.id);
        } else {
            setCustomerSpecialPrices([]);
        }
    };

    // Synchronize essential status from products and localStorage
    useEffect(() => {
        const syncFromStorage = () => {
            if (typeof window !== 'undefined') {
                try {
                    const saved = localStorage.getItem('pos_essential_ids');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setEssentialIds(prev => Array.from(new Set([...prev, ...parsed])));
                        }
                    }
                } catch (e) {}
            }
        };

        syncFromStorage();
        window.addEventListener('storage', syncFromStorage);
        window.addEventListener('focus', syncFromStorage);
        return () => {
            window.removeEventListener('storage', syncFromStorage);
            window.removeEventListener('focus', syncFromStorage);
        };
    }, []);

    useEffect(() => {
        if (products && products.length > 0) {
            const backendEssential = products
                .filter(p => p.is_essential === 1 || p.is_essential === true)
                .map(p => p.variant_id);

            setEssentialIds(prev => {
                const combined = Array.from(new Set([...prev, ...backendEssential]));
                if (typeof window !== 'undefined') {
                    try {
                        localStorage.setItem('pos_essential_ids', JSON.stringify(combined));
                    } catch (e) {}
                }
                return combined;
            });
        }
    }, [products]);

    const essentialSet = useMemo(() => {
        return new Set(essentialIds);
    }, [essentialIds]);

    const isProductEssential = (product) => {
        if (!product) return false;
        return product.is_essential === 1 || 
               product.is_essential === true || 
               essentialSet.has(product.variant_id) || 
               essentialSet.has(product.product_id);
    };

    const essentialProducts = useMemo(() => {
        return products.filter(p => isProductEssential(p));
    }, [products, essentialSet]);

    // O(1) customer price map for instant packaging price lookups
    const customerPriceMap = useMemo(() => {
        const map = new Map();
        if (partyType === 'customer' && customerSpecialPrices && customerSpecialPrices.length > 0) {
            for (let i = 0; i < customerSpecialPrices.length; i++) {
                const sp = customerSpecialPrices[i];
                map.set(`${sp.variant_id}_${sp.packaging_type_id}`, Number(sp.special_price));
            }
        }
        return map;
    }, [partyType, customerSpecialPrices]);

    // O(1) active category filter Set
    const activeCategoryIds = useMemo(() => {
        if (selectedSubCategory) {
            return new Set([selectedSubCategory]);
        }
        if (selectedCategory) {
            const ids = new Set([selectedCategory]);
            for (let i = 0; i < categories.length; i++) {
                if (categories[i].parent_id === selectedCategory) {
                    ids.add(categories[i].id);
                }
            }
            return ids;
        }
        return null;
    }, [selectedCategory, selectedSubCategory, categories]);

    // Lightning-fast multi-token memoized product filter powered by useDeferredValue
    const filteredProducts = useMemo(() => {
        const query = (deferredSearch || '').trim().toLowerCase();
        const tokens = query ? query.split(/\s+/).filter(Boolean) : null;

        return products.filter(p => {
            if (showOnlyEssential && !isProductEssential(p)) {
                return false;
            }

            if (activeCategoryIds && !activeCategoryIds.has(p.category_id)) {
                return false;
            }

            if (!tokens) return true;

            const target = p._searchTokens || '';
            for (let i = 0; i < tokens.length; i++) {
                if (!target.includes(tokens[i])) {
                    return false;
                }
            }
            return true;
        });
    }, [products, deferredSearch, showOnlyEssential, essentialSet, activeCategoryIds]);

    const handleAddToCart = (product, targetPackaging = null) => {
        const packList = product._sortedPackagings || product.packagings || [];
        const defaultPack = product._defaultPack || packList.find(pk => pk.is_default) || packList[0] || {
            id: 1, packaging_type_id: 1, packaging_name: product.unit_symbol || product.unit_name || 'Unit',
            conversion_factor: 1, selling_price: 0
        };

        const chosenPack = targetPackaging || defaultPack;
        const packTypeId = chosenPack.packaging_type_id || chosenPack.id;

        const specialPrice = (partyType === 'customer')
            ? customerPriceMap.get(`${product.variant_id}_${packTypeId}`)
            : undefined;
        const finalPrice = (specialPrice !== undefined) ? specialPrice : (chosenPack.selling_price || 0);

        dispatch(addItem({
            variant_id: product.variant_id,
            packaging_type_id: packTypeId,
            product_name: product.product_name,
            variant_name: product.variant_name,
            packaging_name: chosenPack.packaging_name || product.unit_name || 'Unit',
            unit_name: product.unit_name,
            conversion_factor: chosenPack.conversion_factor || 1,
            price: finalPrice,
            discount_type: 'direct',
            discount_value: 0,
            packagings: packList
        }));
    };

    // High-performance O(1) barcode lookup map for barcode scanner guns & enter-key search
    const barcodeMap = useMemo(() => {
        const map = new Map();
        for (let i = 0; i < products.length; i++) {
            const prod = products[i];
            if (prod.variant_barcode) {
                map.set(String(prod.variant_barcode).toLowerCase().trim(), { product: prod, pack: prod._defaultPack || null });
            }
            if (prod.sku) {
                map.set(String(prod.sku).toLowerCase().trim(), { product: prod, pack: prod._defaultPack || null });
            }
            const packs = prod._sortedPackagings || prod.packagings || [];
            for (let j = 0; j < packs.length; j++) {
                const pk = packs[j];
                if (pk.barcode) {
                    map.set(String(pk.barcode).toLowerCase().trim(), { product: prod, pack: pk });
                }
            }
        }
        return map;
    }, [products]);

    // Quick scanner and Enter key handler for barcode & instant search
    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            const raw = searchQuery.trim();
            if (!raw) return;
            const query = raw.toLowerCase();

            // 1. Direct O(1) Barcode/SKU Map match (Carton, Packet, Piece barcode, or Variant SKU)
            const matched = barcodeMap.get(query);
            if (matched) {
                handleAddToCart(matched.product, matched.pack || undefined);
                setSearchQuery('');
                return;
            }

            // 2. If filtered items exist, instantly add the top matched product
            if (filteredProducts.length > 0) {
                handleAddToCart(filteredProducts[0], filteredProducts[0]._defaultPack || undefined);
                setSearchQuery('');
                return;
            }
        } else if (e.key === 'Escape') {
            setSearchQuery('');
            searchInputRef.current?.blur();
        }
    };

    // Global keyboard shortcuts: F2 or '/' to instantly focus search bar
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            const activeElem = document.activeElement;
            const isTyping = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA' || activeElem.isContentEditable);

            if (e.key === 'F2') {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            } else if (e.key === '/' && !isTyping) {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Helper to format stock for wholesale view
    const formatPosStock = (product) => {
        if (!product) return '0 in stock';
        return product._formattedStock || formatPosStockPure(product, product.packagings);
    };

    const handlePackagingChange = (itemIndex, packId) => {
        const item = cart.items[itemIndex];
        const prod = products.find(p => p.variant_id === item.variant_id);
        const packList = (item.packagings && item.packagings.length > 0)
            ? item.packagings
            : (prod?._sortedPackagings || prod?.packagings || []);
        const selectedPack = packList.find(p => (p.packaging_type_id || p.id) === parseInt(packId));
        if (selectedPack) {
            const packTypeId = selectedPack.packaging_type_id || selectedPack.id;
            const specialPrice = (partyType === 'customer')
                ? customerPriceMap.get(`${item.variant_id}_${packTypeId}`)
                : undefined;
            const finalPrice = (specialPrice !== undefined) ? specialPrice : selectedPack.selling_price;

            dispatch(removeItem(itemIndex));
            dispatch(addItem({
                ...item,
                packaging_type_id: packTypeId,
                packaging_name: selectedPack.packaging_name,
                conversion_factor: selectedPack.conversion_factor,
                price: finalPrice,
                packagings: packList
            }));
        }
    };

    // Financial Calculations
    const grossAmount = cart.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalItemDiscount = cart.items.reduce((sum, item) => sum + (item.discount || 0), 0);
    const netAmount = Math.max(0, grossAmount - totalItemDiscount - (cart.special_discount || 0) + (cart.additional_charges || 0));
    const remainingBalance = Math.max(0, netAmount - (cart.amount_paid || 0));

    const selectedCustomer = cart.customer;
    const currentDue = partyType === 'customer' ? (selectedCustomer ? parseFloat(selectedCustomer.balance || 0) : 0) : 0;
    const isCreditExceeded = false;

    const handleOpenPaymentModal = () => {
        // Direct payment default
        setDirectPaymentToggle(true);
        dispatch(setDiscountsAndCharges({ amount_paid: netAmount }));
        setCashReceived(netAmount.toString());
        setPaymentTab('payment');
        setPaymentModalOpen(true);
    };

    const handleCashReceivedChange = (val) => {
        setCashReceived(val);
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) {
            dispatch(setDiscountsAndCharges({ amount_paid: 0 }));
            setDirectPaymentToggle(false);
        } else if (num >= netAmount) {
            dispatch(setDiscountsAndCharges({ amount_paid: netAmount }));
            setDirectPaymentToggle(true);
        } else {
            dispatch(setDiscountsAndCharges({ amount_paid: num }));
            setDirectPaymentToggle(false);
        }
    };

    const handleDirectPaymentToggle = (isDirect) => {
        setDirectPaymentToggle(isDirect);
        if (isDirect) {
            dispatch(setDiscountsAndCharges({ amount_paid: netAmount }));
            setCashReceived(netAmount.toString());
        } else {
            dispatch(setDiscountsAndCharges({ amount_paid: 0 }));
            setCashReceived('0');
        }
    };

    const handleCheckout = async (isAdminApproved = false) => {
        if (cart.items.length === 0) return alert('Cart is empty!');
        if (isCreditExceeded && !isAdminApproved && user?.role !== 'admin') {
            setCreditErrorMessage(`Credit limit exceeded! Customer available credit is Rs. ${availableCredit.toLocaleString()}, but new invoice due is Rs. ${remainingBalance.toLocaleString()}`);
            setCreditLimitModalOpen(true);
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const isEditing = !!cart.editingSaleId;
            const targetUrl = isEditing ? `http://localhost:5000/api/sales/${cart.editingSaleId}` : 'http://localhost:5000/api/sales';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(targetUrl, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    party_type: partyType,
                    customer_id: partyType === 'customer' && selectedCustomer ? selectedCustomer.id : null,
                    walkin_name: partyType === 'walkin' ? walkinName : null,
                    walkin_phone: partyType === 'walkin' ? walkinPhone : null,
                    items: cart.items,
                    gross_amount: grossAmount,
                    discount: totalItemDiscount,
                    special_discount: cart.special_discount || 0,
                    additional_charges: cart.additional_charges || 0,
                    net_amount: netAmount,
                    amount_paid: cart.amount_paid !== undefined ? cart.amount_paid : netAmount,
                    payment_method: cart.payment_method || 'cash',
                    remarks: cart.remarks || '',
                    admin_override: isAdminApproved
                })
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.error === 'CREDIT_LIMIT_EXCEEDED') {
                    setCreditErrorMessage(data.message);
                    setCreditLimitModalOpen(true);
                    setLoading(false);
                    return;
                }
                throw new Error(data.error || 'Failed to complete sale');
            }

            const targetSaleId = isEditing ? cart.editingSaleId : data.saleId;
            const saleRes = await fetch(`http://localhost:5000/api/sales/${targetSaleId}`);
            if (saleRes.ok) {
                const saleData = await saleRes.json();
                setActiveInvoice(saleData);
                // Open 80mm Thermal Receipt Preview (Strictly Thermal, never A4 by default)
                setThermalModalOpen(true);
                setInvoiceModalOpen(false);

                // Auto-print thermal receipt if enabled in Settings
                if (settings?.auto_print_sale === 'true') {
                    setTimeout(() => {
                        handlePrintInvoice('thermal');
                    }, 150);
                }
            }

            dispatch(clearCart());
            setPaymentModalOpen(false);
            setCreditLimitModalOpen(false);
            fetchProducts();
            fetchCustomers();
            if (isEditing) {
                showAlert('Sale Updated', `Sale Invoice ${cart.editingInvoiceNo || ''} has been updated successfully!`, 'success');
            }
        } catch (err) {
            showAlert('Checkout Notice', err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePrintInvoice = async (format = 'thermal') => {
        const isCartReceipt = format === 'cart-receipt';
        const isThermal = format === 'thermal' || isCartReceipt;
        const a4Printer = (settings?.selected_a4_printer || '').trim();
        const thermalPrinter = (settings?.selected_printer || '').trim();
        const isThermalTarget = isThermal || ((!a4Printer || a4Printer === 'same_as_thermal') && 
            /pos|80|receipt|thermal|blackcopper|xp-|xprinter|rpp/i.test(thermalPrinter));

        const targetPrinter = !isThermal && a4Printer && a4Printer !== 'same_as_thermal' ? a4Printer : thermalPrinter;
        const isSilent = settings?.silent_print === 'true' && targetPrinter !== 'os_dialog';

        // Build target sale object
        let targetSale = activeInvoice;
        let targetPrevBal = prevBalance;
        let targetNewBal = newBalance;

        if (isCartReceipt || (!targetSale && cart.items.length > 0)) {
            targetSale = {
                invoice_no: cart.editingInvoiceNo || 'DRAFT-BILL',
                created_at: new Date().toISOString(),
                customer_name: cart.selectedCustomer?.name || walkinName || 'Walk-in Customer',
                customer_phone: cart.selectedCustomer?.phone || walkinPhone || '',
                customer_address: cart.selectedCustomer?.address || '',
                business_name: cart.selectedCustomer?.business_name || '',
                created_by_name: user?.full_name || user?.username || 'Cashier',
                items: cart.items,
                gross_amount: grossAmount,
                discount: totalItemDiscount,
                special_discount: cart.special_discount || 0,
                additional_charges: cart.additional_charges || 0,
                net_amount: netAmount,
                amount_paid: cart.amount_paid !== undefined ? cart.amount_paid : netAmount,
                remaining_balance: remainingBalance
            };
            targetPrevBal = currentDue;
            targetNewBal = currentDue + remainingBalance;
        }

        if (!targetSale) return;

        let htmlContent = '';
        if (isThermalTarget) {
            htmlContent = generateThermalReceiptHtml(
                targetSale,
                settings,
                user?.full_name || user?.username || 'Cashier',
                targetPrevBal,
                targetNewBal
            );
        } else {
            htmlContent = generateWholesaleInvoiceA4Html(
                targetSale,
                settings,
                targetPrevBal,
                targetNewBal
            );
        }

        await triggerPrintHtml(htmlContent, {
            silent: isSilent,
            printerName: targetPrinter !== 'os_dialog' ? targetPrinter : '',
            format: isThermalTarget ? 'thermal' : 'a4'
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
            const html2canvasModule = await import('html2canvas-pro');
            const html2canvas = html2canvasModule.default || html2canvasModule;
            const { jsPDF } = await import('jspdf');

            const rawInv = activeInvoice?.invoice_no || 'INVOICE';
            const cleanInv = rawInv.replace(/[^a-zA-Z0-9_-]/g, '_');

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const printWidth = pdfWidth - (margin * 2);
            const printHeight = (canvas.height * printWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, Math.min(printHeight, pdfHeight - (margin * 2)));
            pdf.save(`${cleanInv}_A4.pdf`);
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
            (sale.phone && String(sale.phone).trim()) ||
            (selectedCustomer?.phone && String(selectedCustomer.phone).trim()) ||
            (selectedCustomer?.mobile && String(selectedCustomer.mobile).trim());
        if (!phone) {
            showAlert('Missing Phone', 'Customer phone number is required to send invoice via WhatsApp.', 'error');
            return;
        }
        setWaSending(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token && token !== 'null' && token !== 'undefined') headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('http://localhost:5000/api/whatsapp/send-bill', {
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

    // Dynamic Packaging Summary for Wholesale Bill (Handles any bulk units like Bags, Cartons, Boxes, and loose KG/Pcs)
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

    const getSalePaymentStatus = (sale) => {
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
    };

    const prevBalance = activeInvoice ? (
        activeInvoice.current_customer_balance !== undefined
            ? (activeInvoice.current_customer_balance - activeInvoice.remaining_balance)
            : 0
    ) : 0;

    const newBalance = activeInvoice ? (
        activeInvoice.current_customer_balance !== undefined
            ? activeInvoice.current_customer_balance
            : activeInvoice.remaining_balance
    ) : 0;

    const renderThermalSlipContent = (inv, prevBal, newBal, elemId = "printable-invoice-thermal") => {
        if (!inv) return null;
        return (
            <ThermalReceipt
                invoice={inv}
                settings={settings}
                cashierName={inv.created_by_name || inv.cashier_name || user?.full_name || user?.username || 'Cashier'}
                prevBalance={prevBal}
                newBalance={newBal}
                elemId={elemId}
            />
        );
    };

    return (
        <div className="flex flex-col gap-2 w-full lg:h-[calc(100vh-5.5rem)] min-h-0 lg:overflow-hidden relative pb-14 lg:pb-0">
            {/* MOBILE VIEW TOGGLE TABS (Visible only on < lg screens) */}
            <div className="flex lg:hidden items-center bg-gray-100 p-1 rounded-2xl gap-1 shrink-0 border border-gray-200 shadow-2xs">
                <button
                    type="button"
                    onClick={() => setMobileTab('catalog')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        mobileTab === 'catalog'
                            ? 'bg-black text-white shadow-xs font-black'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
                    }`}
                >
                    <IconSearch className="w-3.5 h-3.5" />
                    <span>Catalog</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${mobileTab === 'catalog' ? 'bg-white/20 text-white font-bold' : 'bg-gray-200 text-gray-700 font-semibold'}`}>
                        {filteredProducts.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setMobileTab('cart')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        mobileTab === 'cart'
                            ? 'bg-black text-white shadow-xs font-black'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-white/60'
                    }`}
                >
                    <IconPOS className="w-3.5 h-3.5" />
                    <span>Sale Cart</span>
                    {cart.items.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                            {cart.items.length}
                        </span>
                    )}
                    <span className="font-mono text-xs font-black ml-1 text-emerald-700">
                        Rs. {netAmount.toLocaleString()}
                    </span>
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 w-full flex-1 min-h-0 min-w-0 lg:overflow-hidden">
                {/* LEFT COLUMN: Product Catalog & Search */}
                <div className={`flex-1 flex flex-col min-h-0 min-w-0 bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden h-[calc(100vh-10rem)] lg:h-full ${
                    mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
                }`}>
                    <div className="shrink-0 p-2 sm:p-2.5 border-b border-gray-100 space-y-2 bg-gray-50/50">
                        {/* 1. TOP ROW: Essential Items Quick Sale Bar (Ultra-Compact High Density, Invisible Scrollbar) */}
                        {essentialProducts.length > 0 && (
                            <div 
                                className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth select-none"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                onWheel={(e) => {
                                    if (e.deltaY !== 0) {
                                        e.currentTarget.scrollLeft += e.deltaY;
                                    }
                                }}
                            >
                                <span className="flex items-center gap-0.5 text-[8.5px] font-black uppercase text-amber-950 bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 rounded shrink-0 shadow-2xs leading-none">
                                    <span className="text-amber-600">★</span> Essential ({essentialProducts.length}):
                                </span>
                                {essentialProducts.map((p) => {
                                    const packList = p._sortedPackagings || p.packagings || [];
                                    const defaultPack = p._defaultPack || packList[0] || null;
                                    const specialPrice = (partyType === 'customer' && defaultPack)
                                        ? customerPriceMap.get(`${p.variant_id}_${defaultPack.packaging_type_id || defaultPack.id}`)
                                        : undefined;
                                    const price = (specialPrice !== undefined) ? specialPrice : (defaultPack ? defaultPack.selling_price : 0);
                                    const packName = defaultPack ? (defaultPack.packaging_name || p.unit_symbol || 'Unit') : (p.unit_symbol || 'Unit');

                                    return (
                                        <button
                                            key={`ess-${p.variant_id}`}
                                            type="button"
                                            onClick={() => handleAddToCart(p, defaultPack)}
                                            className="bg-white hover:bg-amber-50/90 border border-amber-300 hover:border-[#D4AF37] rounded px-1.5 py-0.5 flex items-center gap-1 cursor-pointer shadow-2xs hover:shadow-xs transition-all shrink-0 active:scale-[0.98] group"
                                            title={`Click to add 1 ${packName} of ${p.product_name} (Rs. ${Number(price || 0).toLocaleString()}) to cart`}
                                        >
                                            <span className="text-[9px] font-bold text-gray-900 group-hover:text-[#B8860B] transition-colors truncate max-w-[85px] leading-none">
                                                {p.product_name}
                                            </span>
                                            <span className="text-[8px] font-black text-emerald-700 font-mono bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 leading-none">
                                                Rs.{Number(price || 0).toLocaleString()}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* 2. Fast Search Input */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search by Name, SKU or Scan Barcode... (F2 to focus, Enter to add)"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    className="w-full pl-8 pr-28 py-1.5 rounded-lg border border-gray-300 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 outline-none text-xs font-medium bg-white transition-all shadow-2xs"
                                    autoFocus
                                />
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                    <IconSearch className="w-3.5 h-3.5" />
                                </span>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-auto">
                                    {searchQuery ? (
                                        <>
                                            {filteredProducts.length > 0 && (
                                                <span className="hidden sm:inline-flex items-center text-[8.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded leading-none">
                                                    ↵ Enter
                                                </span>
                                            )}
                                            <span className="text-[9px] font-bold text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded leading-none">
                                                {filteredProducts.length}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSearchQuery('');
                                                    searchInputRef.current?.focus();
                                                }}
                                                className="text-gray-400 hover:text-rose-600 p-0.5 rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
                                                title="Clear search (Esc)"
                                            >
                                                <IconClose className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-[8.5px] font-mono font-bold text-gray-400 bg-gray-100 border border-gray-200 px-1 py-0.5 rounded leading-none select-none" title="Press F2 to focus">
                                            F2
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. Main Categories Row - Compact & Clear High-Density Cards (Invisible Scrollbar, Mouse Wheel Scrollable) */}
                        <div 
                            className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth select-none"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            onWheel={(e) => {
                                if (e.deltaY !== 0) {
                                    e.currentTarget.scrollLeft += e.deltaY;
                                }
                            }}
                        >
                            {/* All Categories Card */}
                            <button
                                type="button"
                                onClick={() => {
                                    setShowOnlyEssential(false);
                                    setSelectedCategory(null);
                                    setSelectedSubCategory(null);
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${!selectedCategory && !showOnlyEssential
                                    ? 'bg-black text-white font-extrabold shadow-2xs border border-black'
                                    : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 font-semibold shadow-2xs'
                                    }`}
                            >
                                <IconLayers className={`w-3 h-3 ${!selectedCategory && !showOnlyEssential ? 'text-white' : 'text-gray-500'}`} />
                                <span>All Categories</span>
                                <span className={`px-1 py-0.2 rounded text-[8px] font-black ${!selectedCategory && !showOnlyEssential ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                    {categories.filter(c => !c.parent_id).length}
                                </span>
                            </button>

                            {/* Essential Filter Card */}
                            <button
                                type="button"
                                onClick={() => {
                                    setShowOnlyEssential(prev => !prev);
                                    if (!showOnlyEssential) {
                                        setSelectedCategory(null);
                                        setSelectedSubCategory(null);
                                    }
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${showOnlyEssential
                                    ? 'bg-amber-500 text-white font-extrabold shadow-2xs border border-amber-600'
                                    : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 font-semibold shadow-2xs'
                                    }`}
                                title="Filter only essential products in grid"
                            >
                                <span className={showOnlyEssential ? 'text-white' : 'text-amber-600 font-bold'}>★</span>
                                <span>Essential</span>
                                <span className={`px-1 py-0.2 rounded text-[8px] font-black ${showOnlyEssential ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900 border border-amber-200'}`}>
                                    {essentialProducts.length}
                                </span>
                            </button>

                            {/* Individual Category Cards */}
                            {categories.filter(c => !c.parent_id).map((cat) => {
                                const isSelected = selectedCategory === cat.id;
                                const subCount = categories.filter(c => c.parent_id === cat.id).length;
                                return (
                                    <button
                                        type="button"
                                        key={cat.id}
                                        onClick={() => {
                                            setSelectedCategory(cat.id);
                                            setSelectedSubCategory(null);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer shrink-0 ${isSelected
                                            ? 'bg-black text-white font-extrabold shadow-2xs border border-black'
                                            : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 font-semibold shadow-2xs'
                                            }`}
                                    >
                                        <span>{cat.name}</span>
                                        {subCount > 0 && (
                                            <span className={`px-1 py-0.2 rounded text-[8px] font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                                {subCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Secondary Row: Sub-Category Pill Tabs */}
                        {(() => {
                            const activeSubCategories = selectedCategory ? categories.filter(c => c.parent_id === selectedCategory) : [];
                            if (activeSubCategories.length === 0) return null;
                            const parentCat = categories.find(c => c.id === selectedCategory);
                            return (
                                <div 
                                    className="flex items-center gap-1 overflow-x-auto pt-1.5 pb-0.5 no-scrollbar scroll-smooth select-none border-t border-gray-200 bg-gray-50/80 -mx-2 sm:-mx-2.5 px-2 sm:px-2.5"
                                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                    onWheel={(e) => {
                                        if (e.deltaY !== 0) {
                                            e.currentTarget.scrollLeft += e.deltaY;
                                        }
                                    }}
                                >
                                    <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                                        <IconArrowRight className="w-2.5 h-2.5 text-black inline" /> Sub:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSubCategory(null)}
                                        className={`px-2 py-0.5 rounded-md text-[9.5px] whitespace-nowrap transition-all cursor-pointer ${!selectedSubCategory
                                            ? 'bg-black text-white font-extrabold shadow-2xs border border-black'
                                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium'
                                            }`}
                                    >
                                        All in {parentCat?.name || 'Category'}
                                    </button>
                                    {activeSubCategories.map((sub) => {
                                        const isSubSelected = selectedSubCategory === sub.id;
                                        return (
                                            <button
                                                type="button"
                                                key={sub.id}
                                                onClick={() => setSelectedSubCategory(sub.id)}
                                                className={`px-2 py-0.5 rounded-md text-[9.5px] whitespace-nowrap transition-all cursor-pointer ${isSubSelected
                                                    ? 'bg-black text-white font-extrabold shadow-2xs border border-black'
                                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium'
                                                    }`}
                                            >
                                                {sub.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>

                <div className="flex-1 min-h-0 p-2 sm:p-2.5 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 content-start">
                        {filteredProducts.length === 0 ? (
                            <div className="col-span-full py-12 px-4 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-gray-200">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
                                    <IconSearch className="w-5 h-5" />
                                </div>
                                <h4 className="text-xs font-bold text-gray-800">No matching products found</h4>
                                <p className="text-[11px] text-gray-500 mt-0.5 max-w-sm">
                                    No item matches <span className="font-semibold text-gray-700">"{searchQuery}"</span>. Try typing a different keyword, scanning a barcode, or clearing the search.
                                </p>
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery('');
                                            searchInputRef.current?.focus();
                                        }}
                                        className="mt-2.5 px-3 py-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                                    >
                                        Clear Search (Esc)
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredProducts.map((product) => {
                                const packagingsList = product._sortedPackagings || (
                                    (product.packagings && product.packagings.length > 0)
                                        ? product.packagings
                                        : [{ packaging_type_id: 1, packaging_name: product.unit_symbol || product.unit_name || 'Unit', conversion_factor: 1, selling_price: 0 }]
                                );

                                const defaultPack = product._defaultPack || packagingsList[0];
                                const isLowStock = product._isLowStock !== undefined ? product._isLowStock : (product.current_stock <= product.minimum_stock);
                                const formattedStock = product._formattedStock || formatPosStock(product);
                                const maxFactor = product._maxFactor || 1;

                                return (
                                    <div
                                        key={product.variant_id}
                                        onClick={() => handleAddToCart(product, defaultPack)}
                                        className="bg-white border border-gray-200 hover:border-[#D4AF37] rounded-xl p-2 flex flex-col justify-between cursor-pointer hover:shadow-md transition-all group relative overflow-hidden"
                                    >
                                        {/* Card Header: Category & Stock on Hand */}
                                        <div>
                                            <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                                                <div className="flex items-center gap-1 min-w-0">
                                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                                        {product.category_name}
                                                    </span>
                                                    {isLowStock && (
                                                        <span className="px-1 py-0.2 rounded text-[7.5px] font-black bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                                                            Low
                                                        </span>
                                                    )}
                                                </div>

                                                <span
                                                    title={formattedStock}
                                                    className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md text-right leading-tight truncate shrink-0 max-w-[70%] ${product.current_stock <= 0
                                                        ? 'text-rose-700 bg-rose-50 border border-rose-200'
                                                        : isLowStock
                                                            ? 'text-amber-800 bg-amber-50 border border-amber-200'
                                                            : 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                                                        }`}
                                                >
                                                    {formattedStock}
                                                </span>
                                            </div>

                                            {/* Product Title & Variant */}
                                            <h3 className="font-bold text-gray-900 text-xs group-hover:text-[#B8860B] transition-colors truncate leading-snug">
                                                {product.product_name}
                                            </h3>
                                            <div className="text-[9px] text-gray-500 font-medium truncate mt-0.5">
                                                Variant: <span className="font-medium text-gray-800">{product.variant_name}</span>
                                            </div>
                                        </div>

                                        {/* Packaging Options & Direct Add-to-Cart Action */}
                                        <div className="mt-2 pt-1.5 border-t border-gray-100">
                                            <div className={`grid ${packagingsList.length === 1 ? 'grid-cols-1' : packagingsList.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-1`}>
                                                {packagingsList.map((pack) => {
                                                    const packTypeId = pack.packaging_type_id || pack.id;
                                                    const specialPrice = (partyType === 'customer')
                                                        ? customerPriceMap.get(`${product.variant_id}_${packTypeId}`)
                                                        : undefined;
                                                    const packPrice = (specialPrice !== undefined) ? specialPrice : pack.selling_price;
                                                    const factor = parseFloat(pack.conversion_factor) || 1;
                                                    const isHighestBulk = factor > 1 && factor === maxFactor;
                                                    const isMiddleTier = factor > 1 && factor < maxFactor;

                                                    return (
                                                        <button
                                                            key={pack.id || pack.packaging_type_id}
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAddToCart(product, pack);
                                                            }}
                                                            className={`p-1 sm:p-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between hover:shadow-2xs active:scale-[0.98] ${isHighestBulk
                                                                ? 'bg-[#FEF9E7] border-[#F3E5AB] hover:bg-[#FDF2D0] hover:border-[#D4AF37]'
                                                                : isMiddleTier
                                                                    ? 'bg-blue-50/70 border-blue-200 hover:bg-blue-100/70 hover:border-blue-300'
                                                                    : 'bg-gray-50 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300'
                                                                }`}
                                                            title={`Click to add 1 ${pack.packaging_name} (Rs. ${Number(packPrice || 0).toLocaleString()}) to cart`}
                                                        >
                                                            <div className="flex items-center justify-between gap-0.5 leading-tight">
                                                                <span className="text-[8.5px] font-bold text-gray-800 truncate flex items-center gap-1">
                                                                    {isHighestBulk ? (
                                                                        <IconBox className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                                                    ) : isMiddleTier ? (
                                                                        <IconPackage className="w-2.5 h-2.5 text-blue-700 shrink-0" />
                                                                    ) : (
                                                                        <IconTag className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                                                                    )}
                                                                    <span className="truncate">{pack.packaging_name}</span>
                                                                </span>
                                                                <span className="text-[8.5px] font-black text-emerald-700 font-mono shrink-0">
                                                                    Rs.{Number(packPrice || 0).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[7.5px] text-gray-400 mt-1">
                                                                <span className="truncate">
                                                                    {factor > 1 ? `${factor} ${product.unit_symbol || product.unit_name || 'pcs'}` : `1 ${product.unit_symbol || product.unit_name || 'unit'}`}
                                                                </span>
                                                                <span className="font-bold text-[#B8860B] text-[8px] flex items-center gap-0.5">
                                                                    <IconPlus className="w-2 h-2 inline" strokeWidth={2.5} /> Add
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Wholesale Cart */}
            <div
                className={`w-full lg:w-[380px] xl:w-[410px] lg:min-w-[380px] xl:min-w-[410px] bg-white rounded-2xl border-2 border-gray-300 shadow-md flex flex-col min-h-0 h-[calc(100vh-10rem)] lg:h-full overflow-hidden shrink-0 ${
                    mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
                }`}
            >
                {/* Admin Edit Mode Alert Banner */}
                {cart.editingSaleId && (
                    <div className="bg-amber-500 text-white px-3.5 py-2 flex items-center justify-between text-xs font-bold shadow-inner shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                            <span>Editing: <span className="font-mono bg-amber-600/70 px-1.5 py-0.5 rounded">{cart.editingInvoiceNo}</span> (Admin Mode)</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => dispatch(clearCart())}
                            className="text-[10px] bg-black/40 hover:bg-black/60 text-white font-bold px-2 py-0.5 rounded transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Header: Party Selection (Customer / Walk-in / Supplier) */}
                <div className="shrink-0 p-3 border-b-2 border-[#F3E5AB] bg-[#FEF9E7] space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-lg bg-black flex items-center justify-center text-white shadow-xs">
                                <IconPOS className="w-2.5 h-2.5 text-white" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900 text-[10px] leading-tight">Wholesale Sale Cart</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {/* Mobile Back to Catalog Button */}
                            <button
                                type="button"
                                onClick={() => setMobileTab('catalog')}
                                className="lg:hidden text-[9px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                                <span>← Add Items</span>
                            </button>
                            {cart.items.length > 0 && (
                                <button
                                    onClick={() => dispatch(clearCart())}
                                    className="text-[9px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                                >
                                    Clear Cart ({cart.items.length})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Party Switcher Tabs: Wholesale Customer vs Walk-in Cash */}
                    <div className="grid grid-cols-2 gap-1.5  bg-white border border-[#F3E5AB] rounded-xl text-[10px] font-semibold shadow-xs">
                        <button
                            type="button"
                            onClick={() => setPartyType('customer')}
                            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${partyType === 'customer' ? 'bg-black text-white shadow-xs font-black' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <IconCustomers className="w-3.5 h-3.5" />
                            <span>Wholesale Customer</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setPartyType('walkin')}
                            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${partyType === 'walkin' ? 'bg-black text-white shadow-xs font-black' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <IconPOS className="w-3.5 h-3.5" />
                            <span>Walk-in Customer</span>
                        </button>
                    </div>

                    {/* Customer Selection View */}
                    {partyType === 'customer' && (
                        <div className="space-y-1.5">
                            <select
                                value={selectedCustomer ? selectedCustomer.id : ''}
                                onChange={(e) => {
                                    const cust = customers.find(c => c.id === parseInt(e.target.value));
                                    handleSelectCustomer(cust || null);
                                }}
                                className="w-full px-3 py-0.5 rounded-xl border border-[#F3E5AB] bg-white font-bold text-xs text-gray-900 focus:outline-none focus:border-[#D4AF37] shadow-xs cursor-pointer"
                            >
                                {customers.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} ({c.business_name || 'Retail'})
                                    </option>
                                ))}
                            </select>

                            {selectedCustomer && (
                                <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex items-center justify-between text-xs shadow-xs">
                                    <div>
                                        <div className="text-[9px] uppercase font-semibold tracking-wider text-gray-500">
                                            {currentDue < 0 ? 'Advance Credit (Khata)' : 'Previous Balance'}
                                        </div>
                                        <div className={`font-black text-xs font-mono ${
                                            currentDue < 0 
                                                ? 'text-emerald-700' 
                                                : (currentDue > 0 ? 'text-rose-600' : 'text-gray-800')
                                        }`}>
                                            {currentDue < 0 
                                                ? `Rs. ${Math.abs(currentDue).toLocaleString()} (Available)` 
                                                : `Rs. ${currentDue.toLocaleString()}`}
                                        </div>
                                    </div>
                                    {selectedCustomer.phone && (
                                        <div className="text-right">
                                            <div className="text-[9px] text-gray-500 uppercase font-semibold tracking-wider">Contact Phone</div>
                                            <div className="font-semibold text-gray-800 font-mono">{selectedCustomer.phone}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Walk-in Customer View */}
                    {partyType === 'walkin' && (
                        <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5">
                                <input
                                    type="text"
                                    placeholder="Customer Name"
                                    value={walkinName}
                                    onChange={(e) => setWalkinName(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold bg-white"
                                />
                                <input
                                    type="text"
                                    placeholder="Mobile # (optional)"
                                    value={walkinPhone}
                                    onChange={(e) => setWalkinPhone(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold bg-white"
                                />
                            </div>
                            <div className="text-[9px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 font-semibold flex items-center justify-between">
                                <span>Direct Cash Sale</span>
                                <span>No ledger required</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Cart Items List - Ultra Compact Item Cards */}
                <div className="flex-1 p-2.5 overflow-y-auto space-y-2 min-h-0 bg-gray-50/40 custom-scrollbar">
                    {cart.items.length === 0 ? (
                        <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center p-4 space-y-2">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#B8860B] shadow-xs">
                                <IconPOS className="w-5 h-5 text-[#B8860B]" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-800 text-xs">Sale Cart is Empty</div>
                                <p className="text-[11px] text-gray-500 mt-0.5">Click any product from the catalog on the left to add items to bill.</p>
                            </div>
                        </div>
                    ) : (
                        cart.items.map((item, idx) => {
                            const discType = item.discount_type || 'direct';
                            const discValue = item.discount_value !== undefined ? item.discount_value : (item.discount || 0);

                            return (
                                <div key={idx} className="bg-white rounded-xl p-2 border border-gray-200 hover:border-[#D4AF37] shadow-xs space-y-1.5 transition-all">
                                    {/* Item Header & Line Total */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                                            <span className="font-bold text-gray-900 text-xs truncate">
                                                {item.product_name}
                                            </span>
                                            {item.variant_name && item.variant_name !== 'Standard' && (
                                                <span className="text-[10px] text-gray-500 truncate">
                                                    ({item.variant_name})
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-black text-xs text-emerald-700 font-mono">
                                                Rs. {item.total.toLocaleString()}
                                            </span>
                                            <button
                                                onClick={() => dispatch(removeItem(idx))}
                                                className="text-gray-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 cursor-pointer transition-colors"
                                                title="Remove item"
                                            >
                                                <IconClose className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline Controls: Packaging, Qty, Rate, Discount */}
                                    <div className="flex items-center justify-between gap-2 text-xs pt-1.5 border-t border-gray-100">
                                        {/* Packaging Selector */}
                                        <div className="shrink-0">
                                            {(() => {
                                                const prod = products.find(p => p.variant_id === item.variant_id);
                                                const packList = (item.packagings && item.packagings.length > 0)
                                                    ? item.packagings
                                                    : (prod?.packagings || []);
                                                const factor = parseFloat(item.conversion_factor) || 1;
                                                const maxFactor = packList.length > 0 ? Math.max(...packList.map(p => parseFloat(p.conversion_factor) || 1)) : 1;
                                                const isHighest = factor > 1 && factor === maxFactor;
                                                const isMiddle = factor > 1 && factor < maxFactor;

                                                const tierIcon = isHighest ? (
                                                    <IconBox className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                                ) : isMiddle ? (
                                                    <IconPackage className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                                ) : (
                                                    <IconTag className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                                );

                                                return (
                                                    <div className="flex items-center gap-1">
                                                        {tierIcon}
                                                        {packList.length > 1 ? (
                                                            <select
                                                                value={item.packaging_type_id}
                                                                onChange={(e) => handlePackagingChange(idx, e.target.value)}
                                                                className="text-[9px] bg-gray-50 border border-gray-300 rounded-lg px-1 py-1 font-bold text-[#B8860B] focus:outline-none cursor-pointer"
                                                            >
                                                                {packList.map(pk => (
                                                                    <option key={pk.packaging_type_id || pk.id} value={pk.packaging_type_id || pk.id}>
                                                                        {pk.packaging_name} ({pk.conversion_factor})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                                                {item.packaging_name || 'Unit'}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Qty Stepper */}
                                        <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden shrink-0 shadow-2xs">
                                            <button
                                                onClick={() => dispatch(updateItemQty({ index: idx, quantity: Math.max(1, item.quantity - 1) }))}
                                                className="px-1 py-0.5 text-[9px] font-black hover:bg-gray-100 cursor-pointer"
                                            >
                                                -
                                            </button>
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => dispatch(updateItemQty({ index: idx, quantity: e.target.value }))}
                                                className="w-10 text-center text-xs font-black font-mono focus:outline-none"
                                            />
                                            <button
                                                onClick={() => dispatch(updateItemQty({ index: idx, quantity: item.quantity + 1 }))}
                                                className="px-2 py-0.5 text-xs font-black hover:bg-gray-100 cursor-pointer"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {/* Rate Input */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[10px] text-gray-400 font-bold">@</span>
                                            <input
                                                type="number"
                                                value={item.price}
                                                onChange={(e) => dispatch(updateItemPrice({ index: idx, price: e.target.value }))}
                                                className="w-16 text-right text-xs font-mono font-bold border-b border-gray-300 focus:outline-none focus:border-[#D4AF37]"
                                                title="Unit Selling Price"
                                            />
                                        </div>

                                        {/* Item Discount Toggle & Input */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-[10px] font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => dispatch(updateItemDiscount({ index: idx, discount_type: 'direct' }))}
                                                    className={`px-1.5 py-0.5 transition-all cursor-pointer ${discType === 'direct' ? 'bg-[#D4AF37] text-white' : 'bg-gray-50 text-gray-600'}`}
                                                >
                                                    Rs
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => dispatch(updateItemDiscount({ index: idx, discount_type: 'percent' }))}
                                                    className={`px-1.5 py-0.5 transition-all cursor-pointer ${discType === 'percent' ? 'bg-[#D4AF37] text-white' : 'bg-gray-50 text-gray-600'}`}
                                                >
                                                    %
                                                </button>
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={discValue || ''}
                                                onChange={(e) => dispatch(updateItemDiscount({ index: idx, discount_value: e.target.value }))}
                                                className="w-12 text-right text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white font-mono font-bold"
                                                title="Item Discount"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Fixed Bottom: Totals & Checkout Trigger */}
                <div className="shrink-0 p-3 border-t-2 border-gray-200 bg-white space-y-1.5 shadow-md">
                    <div className="space-y-1 text-xs font-semibold">
                        <div className="flex justify-between items-center text-gray-600">
                            <span>Gross Amount:</span>
                            <span className="font-black text-gray-900 font-mono text-sm">Rs. {grossAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-600">
                            <span>Total Item Discounts:</span>
                            <span className="font-black text-rose-600 font-mono text-sm">- Rs. {totalItemDiscount.toLocaleString()}</span>
                        </div>
                        {cart.special_discount > 0 && (
                            <div className="flex justify-between items-center text-gray-600">
                                <span>Bill Discount:</span>
                                <span className="font-black text-rose-600 font-mono text-sm">- Rs. {Number(cart.special_discount).toLocaleString()}</span>
                            </div>
                        )}
                        {cart.additional_charges > 0 && (
                            <div className="flex justify-between items-center text-gray-600">
                                <span>Add Charges:</span>
                                <span className="font-black text-blue-600 font-mono text-sm">+ Rs. {Number(cart.additional_charges).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-gray-900 font-black pt-1.5 border-t border-gray-200">
                            <span className="text-xs">Net Value:</span>
                            <span className="text-[#B8860B] font-mono text-lg font-black">Rs. {netAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleOpenPaymentModal}
                        disabled={cart.items.length === 0}
                        style={{ backgroundColor: '#000000', color: '#ffffff' }}
                        className="w-full py-2.5 rounded-xl !bg-black !text-white font-black text-sm shadow-md hover:opacity-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <IconPOS className="w-4 h-4 text-white" />
                        <span>
                            {cart.editingSaleId
                                ? `Update Sale (Rs. ${netAmount.toLocaleString()})`
                                : `Proceed to Checkout (Rs. ${netAmount.toLocaleString()})`}
                        </span>
                    </button>
                </div>
            </div>
            </div>

            {/* MOBILE FLOATING CART BAR (Shown when in catalog with items in cart on < lg) */}
            {mobileTab === 'catalog' && cart.items.length > 0 && (
                <div className="fixed bottom-3 left-3 right-3 lg:hidden z-30 animate-in slide-in-from-bottom duration-200">
                    <div
                        onClick={() => setMobileTab('cart')}
                        className="bg-black text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border border-gray-800 cursor-pointer active:scale-[0.99] transition-transform"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
                                {cart.items.length}
                            </div>
                            <div>
                                <div className="text-[11px] font-medium text-gray-300">
                                    {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} in Cart
                                </div>
                                <div className="text-sm font-black font-mono text-white">
                                    Rs. {netAmount.toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-extrabold text-xs text-white shadow-xs">
                            <span>View Cart &amp; Pay</span>
                            <IconArrowRight className="w-3.5 h-3.5" />
                        </div>
                    </div>
                </div>
            )}

            {/* PAYMENT MODAL (Tabs for Settlement & Receipt Preview + Cash Received Tender) */}
            {paymentModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className={`bg-white rounded-2xl ${paymentTab === 'receipt' ? 'max-w-4xl xl:max-w-5xl' : 'max-w-md'} w-full p-4 space-y-2.5 shadow-2xl border border-gray-200 my-4 transition-all`}>
                        {/* Modal Header */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                            <div>
                                {paymentTab === 'receipt' ? (
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-extrabold text-gray-900 text-sm">Wholesale Bill Preview</h3>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${
                                                remainingBalance <= 0
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                    : (parseFloat(cashReceived) > 0 || (cart.amount_paid !== undefined && cart.amount_paid > 0))
                                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                        : 'bg-rose-100 text-rose-800 border-rose-300'
                                            }`}>
                                                {remainingBalance <= 0 ? 'PAID' : ((parseFloat(cashReceived) > 0 || (cart.amount_paid !== undefined && cart.amount_paid > 0)) ? 'PARTIAL' : 'PENDING')}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-medium">
                                            Invoice: <span className="font-bold text-gray-800 font-mono">{cart.editingInvoiceNo || 'PREVIEW'}</span> • Party: <span className="font-bold text-gray-800">{partyType === 'customer' ? (selectedCustomer?.name || 'Wholesale Customer') : partyType === 'supplier' ? (selectedSupplier?.name || 'Supplier') : (walkinName || 'Walk-in Customer')}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-sm">Wholesale Payment</h3>
                                        <div className="text-[10px] text-gray-500 font-medium">
                                            Party: <span className="font-bold text-gray-800">{partyType === 'customer' ? (selectedCustomer?.name || 'Wholesale Customer') : partyType === 'supplier' ? (selectedSupplier?.name || 'Supplier') : (walkinName || 'Walk-in Customer')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setPaymentModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-all cursor-pointer"
                            >
                                <IconClose className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Top Navigation Tabs: Clean Horizontal */}
                        <div className="flex bg-gray-100 p-0.5 rounded-xl gap-1">
                            <button
                                type="button"
                                onClick={() => setPaymentTab('payment')}
                                style={paymentTab === 'payment' ? { backgroundColor: '#000000', color: '#ffffff' } : {}}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center cursor-pointer ${paymentTab === 'payment'
                                    ? '!bg-black !text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                                    }`}
                            >
                                Payment & Settlement
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentTab('receipt')}
                                style={paymentTab === 'receipt' ? { backgroundColor: '#000000', color: '#ffffff' } : {}}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center cursor-pointer ${paymentTab === 'receipt'
                                    ? '!bg-black !text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                                    }`}
                            >
                                Wholesale Bill Preview ({cart.items.length})
                            </button>
                        </div>

                        {/* TAB 1: PAYMENT & SETTLEMENT */}
                        {paymentTab === 'payment' && (
                            <div className="space-y-2.5 text-xs">
                                {/* Financial Summary Card with Item & Bill Discounts */}
                                <div className="bg-[#FEF9E7] p-2.5 rounded-xl border border-[#F3E5AB] space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-[10px] text-gray-500 font-medium">Net Invoice Total</div>
                                            <div className="font-bold text-base text-[#B8860B] font-mono">Rs. {netAmount.toLocaleString()}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-gray-500 font-medium">{currentDue < 0 ? 'Advance Credit' : 'Current Balance'}</div>
                                            <div className={`font-bold text-xs font-mono ${
                                                currentDue < 0 
                                                    ? 'text-emerald-700' 
                                                    : (currentDue > 0 ? 'text-rose-600' : 'text-gray-800')
                                            }`}>
                                                {currentDue < 0 
                                                    ? `Rs. ${Math.abs(currentDue).toLocaleString()} (Cr)` 
                                                    : `Rs. ${currentDue.toLocaleString()}`}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Total Item Discounts (Calculated from Products) */}
                                    <div className="pt-1 border-t border-[#F3E5AB]/60 flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-1 text-gray-700">
                                            <span className="font-semibold">Total Item Discounts:</span>
                                            <span className="text-[9px] text-gray-400">(per product)</span>
                                        </div>
                                        <div className="font-bold text-rose-600 font-mono">
                                            - Rs. {totalItemDiscount.toLocaleString()}
                                        </div>
                                    </div>

                                    {/* Overall Bill Discount (Flat Discount on Invoice) */}
                                    <div className="pt-1 border-t border-[#F3E5AB]/60 flex items-center justify-between gap-2">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-800 flex items-center gap-1">
                                                Bill Discount (Rs.) <span className="text-[10px] text-[#B8860B] font-normal">/ خصوصی رعایت</span>
                                            </label>
                                            <p className="text-[9px] text-gray-500 leading-none">Flat discount on overall invoice</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-rose-600 font-bold font-mono">- Rs.</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={cart.special_discount || ''}
                                                onChange={(e) => {
                                                    const discVal = Math.max(0, parseFloat(e.target.value) || 0);
                                                    dispatch(setDiscountsAndCharges({ special_discount: discVal }));
                                                    const newNet = Math.max(0, grossAmount - totalItemDiscount - discVal + (cart.additional_charges || 0));
                                                    setCashReceived(newNet.toString());
                                                    dispatch(setDiscountsAndCharges({ amount_paid: newNet }));
                                                }}
                                                placeholder="0"
                                                className="w-24 py-1 px-2 rounded-lg border border-gray-300 bg-white font-mono font-bold text-xs text-right text-rose-600 focus:ring-1 focus:ring-black outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Additional Charges (Delivery, Labor, Carriage, etc.) */}
                                    <div className="pt-1 border-t border-[#F3E5AB]/60 flex items-center justify-between gap-2">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-800 flex items-center gap-1">
                                                Add Charges (Rs.) <span className="text-[10px] text-[#B8860B] font-normal">/ اضافی چارجز</span>
                                            </label>
                                            <p className="text-[9px] text-gray-500 leading-none">Delivery, carriage, freight or labor</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-blue-600 font-bold font-mono">+ Rs.</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={cart.additional_charges || ''}
                                                onChange={(e) => {
                                                    const chargesVal = Math.max(0, parseFloat(e.target.value) || 0);
                                                    dispatch(setDiscountsAndCharges({ additional_charges: chargesVal }));
                                                    const newNet = Math.max(0, grossAmount - totalItemDiscount - (cart.special_discount || 0) + chargesVal);
                                                    setCashReceived(newNet.toString());
                                                    dispatch(setDiscountsAndCharges({ amount_paid: newNet }));
                                                }}
                                                placeholder="0"
                                                className="w-24 py-1 px-2 rounded-lg border border-gray-300 bg-white font-mono font-bold text-xs text-right text-blue-600 focus:ring-1 focus:ring-black outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Method Tabs (Horizontal, Pure Clean Text) */}
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Payment Method</label>
                                    <div 
                                        className="flex flex-row items-center gap-1 p-0.5 bg-gray-100 rounded-lg overflow-x-auto no-scrollbar scroll-smooth"
                                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                    >
                                        {[
                                            { id: 'cash', label: 'Cash' },
                                            { id: 'bank', label: 'Bank Transfer' },
                                            { id: 'easypaisa', label: 'Easypaisa' },
                                            { id: 'jazzcash', label: 'JazzCash' },
                                            { id: 'cheque', label: 'Cheque' }
                                        ].map(pm => {
                                            const isSelected = (cart.payment_method || 'cash') === pm.id;
                                            return (
                                                <button
                                                    key={pm.id}
                                                    type="button"
                                                    onClick={() => dispatch(setDiscountsAndCharges({ payment_method: pm.id }))}
                                                    style={isSelected ? { backgroundColor: '#000000', color: '#ffffff' } : {}}
                                                    className={`flex-1 py-1 px-2 rounded-md text-[10px] font-bold transition-all text-center whitespace-nowrap cursor-pointer ${isSelected
                                                        ? '!bg-black !text-white shadow-xs'
                                                        : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-white/70'
                                                        }`}
                                                >
                                                    {pm.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* CASH / AMOUNT RECEIVED NOW INPUT (WITH QUICK CHIPS & CHANGE CALCULATION) */}
                                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-bold text-gray-900">
                                            {cart.payment_method === 'cash' ? (
                                                <>Cash Received Now (Rs.) <span className="text-gray-400 font-normal">/ نوٹ موصول</span></>
                                            ) : (
                                                `Amount Received (${cart.payment_method?.toUpperCase() || 'ONLINE'}) (Rs.)`
                                            )}
                                        </label>
                                        <span className="text-[10px] text-gray-500 font-medium">Customer tendered</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={cashReceived}
                                        onChange={(e) => handleCashReceivedChange(e.target.value)}
                                        className="w-full py-1.5 px-2.5 rounded-lg border border-gray-300 font-bold text-sm text-emerald-800 bg-white focus:ring-1 focus:ring-black outline-none font-mono"
                                        placeholder="0"
                                    />

                                    {/* Quick Tender Denomination Chips */}
                                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                        <span className="text-[9px] text-gray-400 font-semibold mr-0.5">Quick:</span>
                                        <button
                                            type="button"
                                            onClick={() => handleCashReceivedChange(netAmount.toString())}
                                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-gray-300 hover:border-black transition-all cursor-pointer"
                                        >
                                            Exact (Rs. {netAmount.toLocaleString()})
                                        </button>
                                        {cart.payment_method === 'cash' && (
                                            <>
                                                {netAmount <= 500 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCashReceivedChange('500')}
                                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-gray-300 hover:border-black transition-all cursor-pointer"
                                                    >
                                                        500
                                                    </button>
                                                )}
                                                {netAmount <= 1000 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCashReceivedChange('1000')}
                                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-gray-300 hover:border-black transition-all cursor-pointer"
                                                    >
                                                        1,000
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleCashReceivedChange('5000')}
                                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-gray-300 hover:border-black transition-all cursor-pointer"
                                                >
                                                    5,000
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {/* Real-time Change / Return to Customer Card */}
                                    {parseFloat(cashReceived) > (cart.amount_paid !== undefined ? cart.amount_paid : netAmount) && (
                                        <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex justify-between items-center text-emerald-900 mt-1">
                                            <div>
                                                <span className="font-bold text-[10px] uppercase tracking-wide">Change / Return (واپسی):</span>
                                                <p className="text-[9px] text-emerald-700">Return to customer</p>
                                            </div>
                                            <span className="font-bold text-sm font-mono text-emerald-700">
                                                Rs. {(parseFloat(cashReceived) - (cart.amount_paid !== undefined ? cart.amount_paid : netAmount)).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Running Due & Balances */}
                                <div className="p-2 bg-gray-50 rounded-xl space-y-0.5 text-[11px]">
                                    <div className="flex justify-between font-bold text-gray-700">
                                        <span>Remaining Due Balance:</span>
                                        <span className={remainingBalance > 0 ? "text-rose-600 font-bold font-mono" : "text-emerald-600 font-bold font-mono"}>
                                            Rs. {remainingBalance.toLocaleString()}
                                        </span>
                                    </div>
                                    {partyType === 'customer' && selectedCustomer && (
                                        <div className="flex justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-200">
                                            <span>New Running Balance:</span>
                                            <span className={`font-bold font-mono ${
                                                (currentDue + remainingBalance) < 0 
                                                    ? 'text-emerald-700' 
                                                    : ((currentDue + remainingBalance) > 0 ? 'text-rose-600' : 'text-gray-800')
                                            }`}>
                                                {(currentDue + remainingBalance) < 0 
                                                    ? `Rs. -${Math.abs(currentDue + remainingBalance).toLocaleString()} (Advance)` 
                                                    : `Rs. ${(currentDue + remainingBalance).toLocaleString()}`}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Payment Action Buttons (Solid Black) */}
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentModalOpen(false)}
                                        className="py-1.5 px-3 rounded-lg border border-gray-300 text-gray-700 font-bold text-[11px] hover:bg-gray-100 transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentTab('receipt')}
                                        className="py-1.5 px-2.5 rounded-lg border border-gray-300 text-gray-800 font-bold text-[11px] hover:bg-gray-100 transition-all cursor-pointer flex items-center gap-1"
                                    >
                                        <IconReceipt className="w-3 h-3" />
                                        <span>Preview Wholesale Bill</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCheckout(false)}
                                        disabled={loading}
                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                        className="btn-black !bg-black !text-white flex-1 py-1.5 rounded-lg font-bold text-[11px] shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        {loading ? 'Processing...' : (cart.editingSaleId ? 'Update & Save Invoice' : 'Complete & Save Invoice')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: LIVE WHOLESALE BILL PREVIEW (EXACT CLIENT LAYOUT) */}
                        {paymentTab === 'receipt' && (
                            <div className="space-y-3.5 text-xs">
                                <div
                                    id="printable-cart-receipt"
                                    className="bg-white p-5 border border-gray-300 rounded-xl space-y-3.5 text-gray-900 text-xs font-sans max-h-[72vh] overflow-y-auto"
                                >
                                    {/* Bill Header: Left Side (Shop Info) | Right Side (Invoice & Customer Details) */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-gray-300">
                                        {/* LEFT SIDE: Shop Logo, Shop Name, Address, Phone, Gmail */}
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex items-center gap-2.5">
                                                {settings?.shop_logo ? (
                                                    <img
                                                        src={settings.shop_logo}
                                                        alt={settings.shop_name || 'Shop Logo'}
                                                        className="h-11 w-11 object-contain rounded-lg border border-gray-200 bg-white p-0.5 shadow-2xs shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl gold-gradient text-white flex items-center justify-center font-black text-lg shadow-2xs shrink-0">
                                                        {(settings?.shop_name || 'H').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <h2 className="text-sm sm:text-base font-black text-gray-900 tracking-tight leading-tight uppercase">
                                                        {settings?.shop_name || 'HILAL WHOLESALER SHOP'}
                                                    </h2>
                                                    <div className="text-[10px] font-bold text-[#B8860B] uppercase tracking-wider">
                                                        Distribution Network
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-gray-700 text-[11px] leading-tight space-y-0.5 pl-0.5">
                                                <div>
                                                    <span className="font-semibold text-gray-800">Address: </span>
                                                    <span>{settings?.shop_address || 'Main Market, Timergara, Lower Dir, KP'}</span>
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-800">Phone: </span>
                                                    <span className="font-mono">{settings?.shop_phone || '0945-825555 / 0306-0888300'}</span>
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-800">Email: </span>
                                                    <span className="font-mono text-gray-600">{settings?.shop_email || 'hilalwholesaler@gmail.com'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* RIGHT SIDE: Invoice & Customer Details */}
                                        <div className="space-y-2 text-xs text-left md:text-right flex flex-col justify-between">
                                            {/* Invoice Meta Box */}
                                            <div className="bg-gray-50/90 border border-gray-200 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                                                <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                                    <span className="font-bold text-gray-500 text-[11px] uppercase tracking-wider">Invoice # :</span>
                                                    <span className="font-black font-mono text-sm text-[#B8860B]">{cart.editingInvoiceNo || 'PREVIEW'}</span>
                                                </div>
                                                <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                                    <span className="font-semibold text-gray-600 text-[11px]">Invoice Date:</span>
                                                    <span className="font-bold text-gray-900">{new Date().toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex justify-between md:justify-end md:gap-4 items-center">
                                                    <span className="font-semibold text-gray-600 text-[11px]">Payment Status:</span>
                                                    <span className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider border shadow-2xs ${
                                                        remainingBalance <= 0
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                            : (parseFloat(cashReceived) > 0 || (cart.amount_paid !== undefined && cart.amount_paid > 0))
                                                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                                : 'bg-rose-100 text-rose-800 border-rose-300'
                                                    }`}>
                                                        {remainingBalance <= 0 ? 'PAID' : ((parseFloat(cashReceived) > 0 || (cart.amount_paid !== undefined && cart.amount_paid > 0)) ? 'PARTIAL' : 'PENDING')}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Customer Details Box */}
                                            <div className="space-y-1 pt-1 border-t border-gray-200">
                                                <div className="font-bold text-[11px] text-gray-900 uppercase tracking-wider text-left md:text-right border-b border-gray-100 pb-0.5">
                                                    Billed To ({partyType === 'customer' ? (selectedCustomer?.name || 'Walk-in Customer') : partyType === 'supplier' ? (selectedSupplier?.name || 'Supplier') : (walkinName || 'Walk-in Customer')} {partyType === 'customer' && selectedCustomer?.business_name && `(${selectedCustomer.business_name})`})
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-700">Mobile / Phone: </span>
                                                    <span className="font-mono">{partyType === 'customer' ? (selectedCustomer?.phone || selectedCustomer?.mobile || '0945123456') : partyType === 'supplier' ? (selectedSupplier?.phone || '0945123456') : (walkinPhone || '0945123456')}</span>
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-gray-700">Address: </span>
                                                    <span>{partyType === 'customer' ? (selectedCustomer?.address || 'Main Market, Timergara') : partyType === 'supplier' ? (selectedSupplier?.address || 'Main Market, Timergara') : 'Main Market, Timergara'}</span>
                                                </div>
                                                {cart.remarks && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700">Remarks: </span>
                                                        <span className="italic text-gray-600">{cart.remarks}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Line Items Table with Unified Quantity Column */}
                                    <table className="w-full text-left text-xs border-collapse border-t border-b border-gray-300 my-2">
                                        <thead>
                                            <tr className="border-b border-gray-300 font-bold text-green-500 bg-gray-50/70">
                                                <th className="py-2 px-2 text-center w-8">#</th>
                                                <th className="py-2 px-2">Product Description</th>
                                                <th className="py-2 px-2 text-right">Price</th>
                                                <th className="py-2 px-2 text-center">Quantity</th>
                                                <th className="py-2 px-2 text-right">Gross Amount</th>
                                                <th className="py-2 px-2 text-center">Disc.%</th>
                                                <th className="py-2 px-2 text-right">Disc.</th>
                                                <th className="py-2 px-2 text-right">Net Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {cart.items.map((item, idx) => {
                                                const factor = parseFloat(item.conversion_factor) || 1;
                                                const isBulk = factor > 1;
                                                const uSymbol = item.base_unit || item.unit_symbol || item.unit_name || 'pcs';
                                                const packName = item.packaging_name || (isBulk ? 'Bulk' : uSymbol);
                                                const qty = parseFloat(item.quantity) || 0;
                                                const qtyDisplay = isBulk ? `${qty} ${packName} (${qty * factor} ${uSymbol})` : `${qty} ${uSymbol}`;
                                                const lineGross = item.price * qty;
                                                const discPct = lineGross > 0 && item.discount > 0 ? ((item.discount / lineGross) * 100).toFixed(0) + '%' : '0%';
                                                const itemNet = Math.max(0, lineGross - (item.discount || 0));

                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50/50">
                                                        <td className="py-1.5 px-2 text-center font-bold text-gray-500 font-mono">{idx + 1}</td>
                                                        <td className="py-1.5 px-2 font-medium">
                                                            <span className="font-bold text-gray-900">{item.product_name}</span>
                                                            {item.variant_name && item.variant_name !== 'Standard' && (
                                                                <span className="text-gray-600 ml-1">({item.variant_name})</span>
                                                            )}
                                                        </td>
                                                        <td className="py-1.5 px-2 text-right font-mono">{Number(item.price).toFixed(0)}</td>
                                                        <td className="py-1.5 px-2 text-center font-bold text-gray-900">{qtyDisplay}</td>
                                                        <td className="py-1.5 px-2 text-right font-mono">{Number(lineGross).toFixed(2)}</td>
                                                        <td className="py-1.5 px-2 text-center">{discPct}</td>
                                                        <td className="py-1.5 px-2 text-right font-mono">{Number(item.discount || 0).toFixed(0)}</td>
                                                        <td className="py-1.5 px-2 text-right font-bold text-gray-900 font-mono">{Number(itemNet).toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* Balances & Financial Summary Section */}
                                    <div className="grid grid-cols-2 gap-6 pt-2">
                                        {/* Left Box: Running Balances */}
                                        <div className="space-y-1 text-xs">
                                            <div>
                                                <span className="font-semibold">Current Invoice: </span>
                                                <span>Rs. {Number(netAmount).toFixed(2)}</span>
                                            </div>
                                            <div>
                                                <span className="font-semibold">Paid Amount: </span>
                                                <span className="font-semibold text-emerald-700">Rs. {Number(cart.amount_paid !== undefined ? cart.amount_paid : netAmount).toFixed(2)}</span>
                                            </div>
                                            {remainingBalance > 0 && (
                                                <div>
                                                    <span className="font-semibold">Invoice Due: </span>
                                                    <span className="font-semibold text-rose-700">Rs. {Number(remainingBalance).toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div>
                                                <span className="font-bold text-gray-900">Previous Balance : </span>
                                                <span className="font-bold text-gray-900 font-sans">Rs. {Number(currentDue).toFixed(2)}</span>
                                            </div>

                                            <div className="border-b-2 border-gray-900 pb-0.5 inline-block">
                                                <span className="font-bold">New Balance: </span>
                                                <span className="font-bold">Rs. {Number(currentDue + remainingBalance).toFixed(0)}</span>
                                            </div>
                                        </div>

                                        {/* Right Box: Gross, Discounts & Net Value */}
                                        <div className="space-y-1 text-xs text-right">
                                            <div>
                                                <span className="font-semibold">Gross Amount: </span>
                                                <span>Rs. {Number(grossAmount).toFixed(2)}</span>
                                            </div>
                                            <div>
                                                <span className="font-semibold">Less Disc.: </span>
                                                <span>Rs. {Number(totalItemDiscount).toFixed(2)}</span>
                                            </div>
                                            <div>
                                                <span className="font-semibold">Less Special Disc.: </span>
                                                <span>Rs. {Number(cart.special_discount || 0).toFixed(0)}</span>
                                            </div>
                                            <div>
                                                <span className="font-semibold">Add Charges : </span>
                                                <span>Rs. {Number(cart.additional_charges || 0).toFixed(0)}</span>
                                            </div>
                                            <div className="font-bold text-sm text-gray-900 pt-1 border-t border-gray-300">
                                                <span>Net Value: </span>
                                                <span className="text-gray-900 font-extrabold">Rs. {Number(netAmount).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Amount in Words Footer */}
                                    <div className="pt-3 border-t border-gray-300 text-xs font-semibold text-gray-800">
                                        <span>Invoice Amount In Words: </span>
                                        <span className="font-bold">{numberToWords(netAmount)}</span>
                                    </div>

                                    {/* Bank Account Details for Online Payment / Transfer */}
                                    {bankAccounts.length > 0 && (
                                        <div className="pt-2 border-t border-gray-300">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="font-extrabold text-[11px] uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-[#B8860B]"></span>
                                                    Bank Details for Online Payment / Transfer
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-medium">WhatsApp proof: {settings?.shop_phone || ''}</span>
                                            </div>
                                            <div className={`grid gap-2 ${bankAccounts.length === 1 ? 'grid-cols-1' : bankAccounts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                                {bankAccounts.map((acc, idx) => (
                                                    <div key={idx} className="p-2 border border-gray-300 rounded-lg bg-gray-50/70 text-[10.5px] leading-tight space-y-0.5">
                                                        <div className="font-bold text-gray-900 flex items-center justify-between">
                                                            <span>{acc.bank_name}</span>
                                                            {acc.branch && <span className="text-[9.5px] text-gray-500 font-normal truncate max-w-[120px]">{acc.branch}</span>}
                                                        </div>
                                                        {acc.account_title && (
                                                            <div className="text-gray-700">
                                                                <span className="text-gray-500">Title: </span>
                                                                <span className="font-semibold">{acc.account_title}</span>
                                                            </div>
                                                        )}
                                                        <div className="text-gray-900">
                                                            <span className="text-gray-500">A/C #: </span>
                                                            <span className="font-mono font-bold text-gray-900">{acc.account_number}</span>
                                                        </div>
                                                        {acc.iban && (
                                                            <div className="text-gray-600 text-[9.5px]">
                                                                <span className="text-gray-500">IBAN: </span>
                                                                <span className="font-mono">{acc.iban}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-2 pt-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentTab('payment')}
                                        className="py-2 px-4 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer"
                                    >
                                        Back to Payment
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePrintInvoice('cart-receipt')}
                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                        className="btn-black !bg-black !text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <IconPrinter className="w-3.5 h-3.5 text-white" />
                                        <span>Print Wholesale Bill</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCheckout(false)}
                                        disabled={loading}
                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                        className="btn-black !bg-black !text-white px-5 py-2 rounded-xl font-extrabold text-xs shadow-md hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        {loading ? 'Processing...' : (cart.editingSaleId ? 'Update & Save Invoice' : 'Complete & Save Invoice')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ADMIN CREDIT LIMIT APPROVAL MODAL */}
            {creditLimitModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border-2 border-rose-400">
                        <div className="text-rose-600 font-extrabold text-lg flex items-center gap-2">
                            <IconWarning className="w-5 h-5 text-rose-600" />
                            <span>Credit Limit Exceeded</span>
                        </div>

                        <p className="text-xs text-gray-700 leading-relaxed font-medium bg-rose-50 p-3 rounded-xl border border-rose-200">
                            {creditErrorMessage}
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                Enter Admin Override Code / Password
                            </label>
                            <input
                                type="password"
                                value={adminApprovalCode}
                                onChange={(e) => setAdminApprovalCode(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-gray-300 font-bold text-sm"
                                placeholder="Admin password..."
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setCreditLimitModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
                            >
                                Cancel Sale
                            </button>
                            <button
                                onClick={() => {
                                    if (adminApprovalCode === 'admin123' || user?.role === 'admin') {
                                        handleCheckout(true);
                                    } else {
                                        showAlert('Admin Authorization', 'Invalid Administrator Approval Code.', 'error');
                                    }
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-extrabold text-xs shadow-md"
                            >
                                Approve Credit Override
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. REUSABLE WHOLESALE A4 BILL MODAL */}
            <WholesaleA4InvoiceModal
                isOpen={invoiceModalOpen}
                onClose={() => setInvoiceModalOpen(false)}
                invoice={activeInvoice}
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

            {/* 2. DEDICATED 80mm THERMAL RECEIPT MODAL (COMPACT, NARROW RECEIPT SIZE, FULLY RESPONSIVE) */}
            {thermalModalOpen && activeInvoice && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
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
                                    onClick={() => handlePrintInvoice('thermal')}
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
                            {renderThermalSlipContent(activeInvoice, prevBalance, newBalance, "printable-invoice-thermal")}
                        </div>

                        {/* Bottom Actions (Pinned) */}
                        <div className="shrink-0 flex gap-2 p-3 sm:px-4 sm:py-3 border-t border-gray-100 bg-white">
                            <button
                                type="button"
                                onClick={() => {
                                    setThermalModalOpen(false);
                                    setInvoiceModalOpen(true);
                                }}
                                style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                className="flex-1 py-2 rounded-xl font-bold text-xs hover:bg-gray-100 transition-all cursor-pointer text-center"
                            >
                                View Full A4 Bill
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrintInvoice('thermal')}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-2 rounded-xl font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                            >
                                <IconPrinter className="w-3.5 h-3.5 text-white" />
                                <span>Print Receipt</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. ALWAYS-RENDERED OFFSCREEN 80mm THERMAL SLIP (FOR SILENT BACKGROUND AUTO-PRINT) */}
            {activeInvoice && (
                <div
                    id="printable-invoice-thermal-hidden"
                    style={{
                        position: 'fixed',
                        left: '-9999px',
                        top: '-9999px',
                        width: '72mm',
                        opacity: 0,
                        pointerEvents: 'none',
                        zIndex: -1
                    }}
                >
                    {renderThermalSlipContent(activeInvoice, prevBalance, newBalance, "printable-invoice-thermal-content")}
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
        </div>
    );
}
