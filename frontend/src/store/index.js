import { configureStore, createSlice } from '@reduxjs/toolkit';

// Auth Slice
const authSlice = createSlice({
    name: 'auth',
    initialState: {
        user: null,
        token: null,
        isAuthenticated: false
    },
    reducers: {
        loginSuccess: (state, action) => {
            state.user = action.payload.user;
            state.token = action.payload.token;
            state.isAuthenticated = true;
            if (typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(action.payload.user));
                localStorage.setItem('token', action.payload.token);
            }
        },
        logout: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
            if (typeof window !== 'undefined') {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
            }
        }
    }
});

function recalculateItem(item) {
    const rawQty = parseFloat(item.quantity);
    const qty = isNaN(rawQty) ? 0 : Math.max(0, rawQty);
    const price = Math.max(0, parseFloat(item.price) || 0);
    const lineGross = qty * price;
    const type = item.discount_type || 'direct';
    const val = Math.max(0, parseFloat(item.discount_value) || 0);

    let calculatedDisc = 0;
    if (type === 'percent') {
        calculatedDisc = (lineGross * val) / 100;
    } else {
        calculatedDisc = Math.min(lineGross, val);
    }

    if (typeof item.quantity === 'number') {
        item.quantity = qty;
    }
    item.price = price;
    item.discount_type = type;
    item.discount_value = val;
    item.discount = calculatedDisc;
    item.total = Math.max(0, lineGross - calculatedDisc);
}

function mapSaleToCartState(sale) {
    if (!sale || !sale.id) return null;
    return {
        editingSaleId: sale.id,
        editingInvoiceNo: sale.invoice_no,
        customer: sale.customer_id ? {
            id: sale.customer_id,
            name: sale.customer_name,
            business_name: sale.business_name,
            phone: sale.customer_phone,
            balance: sale.current_customer_balance || 0
        } : null,
        items: (sale.items || []).map(it => {
            const qty = parseFloat(it.quantity) || 1;
            const price = parseFloat(it.price) || 0;
            const disc = parseFloat(it.discount) || 0;
            return {
                variant_id: it.variant_id,
                packaging_type_id: it.packaging_type_id,
                product_name: it.product_name,
                variant_name: it.variant_name,
                unit_name: it.unit_name || it.base_unit || 'pcs',
                base_unit: it.base_unit || 'pcs',
                packaging_name: it.packaging_name,
                conversion_factor: parseFloat(it.conversion_factor) || 1,
                quantity: qty,
                price: price,
                discount_type: 'direct',
                discount_value: disc,
                discount: disc,
                total: parseFloat(it.total) || ((qty * price) - disc)
            };
        }),
        discount: parseFloat(sale.discount) || 0,
        special_discount: parseFloat(sale.special_discount) || 0,
        additional_charges: parseFloat(sale.additional_charges) || 0,
        amount_paid: parseFloat(sale.amount_paid) || 0,
        payment_method: sale.payment_method || 'cash',
        remarks: sale.remarks || ''
    };
}

const defaultCartState = {
    editingSaleId: null,
    editingInvoiceNo: null,
    customer: null,
    items: [],
    discount: 0,
    special_discount: 0,
    additional_charges: 0,
    amount_paid: 0,
    payment_method: 'cash',
    remarks: ''
};

function getInitialCartState() {
    if (typeof window !== 'undefined') {
        try {
            const saved = localStorage.getItem('hws_editing_sale');
            if (saved) {
                const parsed = JSON.parse(saved);
                const mapped = mapSaleToCartState(parsed);
                if (mapped) return mapped;
            }
        } catch (e) {
            console.warn('[Redux] Failed to rehydrate editing sale:', e);
        }
    }
    return defaultCartState;
}

// Wholesale Cart Slice
const cartSlice = createSlice({
    name: 'cart',
    initialState: getInitialCartState(),
    reducers: {
        setCustomer: (state, action) => {
            state.customer = action.payload;
        },
        addItem: (state, action) => {
            const newItem = action.payload;
            const existingIndex = state.items.findIndex(
                item => item.variant_id === newItem.variant_id && item.packaging_type_id === newItem.packaging_type_id
            );

            if (existingIndex >= 0) {
                state.items[existingIndex].quantity += (newItem.quantity || 1);
                recalculateItem(state.items[existingIndex]);
            } else {
                const item = {
                    ...newItem,
                    quantity: newItem.quantity || 1,
                    price: newItem.price || 0,
                    discount_type: newItem.discount_type || 'direct',
                    discount_value: newItem.discount_value || 0,
                    discount: 0,
                    total: 0
                };
                recalculateItem(item);
                state.items.push(item);
            }
        },
        updateItemQty: (state, action) => {
            const { index, quantity } = action.payload;
            if (state.items[index]) {
                if (typeof quantity === 'number' && quantity <= 0) {
                    state.items.splice(index, 1);
                    return;
                }
                state.items[index].quantity = quantity;
                recalculateItem(state.items[index]);
            }
        },
        updateItemPrice: (state, action) => {
            const { index, price } = action.payload;
            if (state.items[index]) {
                state.items[index].price = price;
                recalculateItem(state.items[index]);
            }
        },
        updateItemDiscount: (state, action) => {
            const { index, discount_value, discount_type } = action.payload;
            if (state.items[index]) {
                if (discount_type !== undefined) state.items[index].discount_type = discount_type;
                if (discount_value !== undefined) state.items[index].discount_value = discount_value;
                recalculateItem(state.items[index]);
            }
        },
        removeItem: (state, action) => {
            state.items.splice(action.payload, 1);
        },
        setDiscountsAndCharges: (state, action) => {
            if (action.payload.discount !== undefined) state.discount = parseFloat(action.payload.discount) || 0;
            if (action.payload.special_discount !== undefined) state.special_discount = parseFloat(action.payload.special_discount) || 0;
            if (action.payload.additional_charges !== undefined) state.additional_charges = parseFloat(action.payload.additional_charges) || 0;
            if (action.payload.amount_paid !== undefined) state.amount_paid = parseFloat(action.payload.amount_paid) || 0;
            if (action.payload.payment_method !== undefined) state.payment_method = action.payload.payment_method;
            if (action.payload.remarks !== undefined) state.remarks = action.payload.remarks;
        },
        loadSaleForEdit: (state, action) => {
            const sale = action.payload;
            const mapped = mapSaleToCartState(sale);
            if (mapped) {
                Object.assign(state, mapped);
                if (typeof window !== 'undefined') {
                    try {
                        localStorage.setItem('hws_editing_sale', JSON.stringify(sale));
                    } catch (e) {
                        console.warn('[Redux] Failed to persist editing sale:', e);
                    }
                }
            }
        },
        clearCart: (state) => {
            Object.assign(state, defaultCartState);
            if (typeof window !== 'undefined') {
                try {
                    localStorage.removeItem('hws_editing_sale');
                } catch (e) {
                    console.warn('[Redux] Failed to clear editing sale from localStorage:', e);
                }
            }
        }
    }
});

// Sync Status Slice
const syncSlice = createSlice({
    name: 'sync',
    initialState: {
        isOnline: true,
        isSyncing: false,
        pendingCount: 0,
        lastSyncTime: null
    },
    reducers: {
        setNetworkStatus: (state, action) => {
            state.isOnline = action.payload;
        },
        setSyncing: (state, action) => {
            state.isSyncing = action.payload;
        },
        setPendingCount: (state, action) => {
            state.pendingCount = action.payload;
        },
        setLastSyncTime: (state, action) => {
            state.lastSyncTime = action.payload;
        }
    }
});

// Settings Slice
const initialSettings = {
    shop_name: 'Hilal Wholesaler Shop',
    shop_tagline: 'Wholesale & Retail Distribution',
    shop_address: 'Main Bazaar, Timergara, KP, Pakistan',
    shop_phone: '+92 300 1234567',
    shop_email: 'hilalwholesaler@gmail.com',
    shop_ntn: '1234567-8',
    currency_symbol: 'Rs.',
    shop_logo: '',
    bank_accounts: JSON.stringify([
        {
            bank_name: 'Meezan Bank',
            account_title: 'Hilal Wholesaler Shop',
            account_number: '0101-0102030405',
            iban: 'PK12MEZN0001010102030405',
            branch: 'Timergara Branch'
        }
    ]),
    selected_printer: 'POS-80',
    silent_print: 'true',
    auto_print_sale: 'true',
    default_print_format: 'thermal',
    loaded: false
};

const settingsSlice = createSlice({
    name: 'settings',
    initialState: initialSettings,
    reducers: {
        setSettings: (state, action) => {
            const updated = { ...state, ...action.payload, loaded: true };
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem('shop_settings', JSON.stringify(updated));
                } catch (e) { }
            }
            return updated;
        }
    }
});

// UI Slice (Mobile Sidebar Drawer)
const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        isSidebarOpen: false
    },
    reducers: {
        toggleSidebar: (state) => {
            state.isSidebarOpen = !state.isSidebarOpen;
        },
        openSidebar: (state) => {
            state.isSidebarOpen = true;
        },
        closeSidebar: (state) => {
            state.isSidebarOpen = false;
        }
    }
});

export const { loginSuccess, logout } = authSlice.actions;
export const { 
    setCustomer, addItem, updateItemQty, updateItemPrice, 
    updateItemDiscount, removeItem, setDiscountsAndCharges, clearCart, loadSaleForEdit 
} = cartSlice.actions;
export const { setNetworkStatus, setSyncing, setPendingCount, setLastSyncTime } = syncSlice.actions;
export const { setSettings } = settingsSlice.actions;
export const { toggleSidebar, openSidebar, closeSidebar } = uiSlice.actions;

export const store = configureStore({
    reducer: {
        auth: authSlice.reducer,
        cart: cartSlice.reducer,
        sync: syncSlice.reducer,
        settings: settingsSlice.reducer,
        ui: uiSlice.reducer
    }
});

