import { createSlice } from '@reduxjs/toolkit';

const getInitialUser = () => {
  if (typeof window !== 'undefined') {
    try {
      return JSON.parse(localStorage.getItem('luxe_resto_user') || 'null');
    } catch {
      return null;
    }
  }
  return null;
};

const initialState = {
  categories: [],
  menuItems: [],
  tables: [],
  staff: [],
  customersList: [],
  globalSettings: {},
  tableAreas: [],
  suppliers: [],
  allSuppliers: [],
  expenseSuppliers: [],
  expenseBills: [],
  expenseLedger: [],
  salaries: [],
  assets: [],
  detailedOrders: [],
  reportDetailedOrders: [],
  reportSummary: {
    totalSales: 0,
    totalOrders: 0,
    totalExpenses: 0,
    inventoryPending: 0,
    inventoryPaid: 0,
    totalMenuItems: 0,
    totalPaidDues: 0,
    totalPendingDues: 0
  },
  bestSellers: [],
  currentUser: getInitialUser(),
  menuCardCategories: [],
  menuCardItems: [],
  inventoryBills: []
};

const adminDataSlice = createSlice({
  name: 'adminData',
  initialState,
  reducers: {
    setCategories: (state, action) => { state.categories = action.payload; },
    setMenuItems: (state, action) => { state.menuItems = action.payload; },
    setTables: (state, action) => { state.tables = action.payload; },
    setStaff: (state, action) => { state.staff = action.payload; },
    setCustomersList: (state, action) => { state.customersList = action.payload; },
    setGlobalSettings: (state, action) => { state.globalSettings = action.payload; },
    setTableAreas: (state, action) => { state.tableAreas = action.payload; },
    setSuppliers: (state, action) => { state.suppliers = action.payload; },
    setAllSuppliers: (state, action) => { state.allSuppliers = action.payload; },
    setExpenseSuppliers: (state, action) => { state.expenseSuppliers = action.payload; },
    setExpenseBills: (state, action) => { state.expenseBills = action.payload; },
    setExpenseLedger: (state, action) => { state.expenseLedger = action.payload; },
    setSalaries: (state, action) => { state.salaries = action.payload; },
    setAssets: (state, action) => { state.assets = action.payload; },
    setDetailedOrders: (state, action) => { state.detailedOrders = action.payload; },
    setReportDetailedOrders: (state, action) => { state.reportDetailedOrders = action.payload; },
    setReportSummary: (state, action) => { state.reportSummary = action.payload; },
    setBestSellers: (state, action) => { state.bestSellers = action.payload; },
    setCurrentUser: (state, action) => { state.currentUser = action.payload; },
    setMenuCardCategories: (state, action) => { state.menuCardCategories = action.payload; },
    setMenuCardItems: (state, action) => { state.menuCardItems = action.payload; },
    setInventoryBills: (state, action) => { state.inventoryBills = action.payload; }
  }
});

export const {
  setCategories,
  setMenuItems,
  setTables,
  setStaff,
  setCustomersList,
  setGlobalSettings,
  setTableAreas,
  setSuppliers,
  setAllSuppliers,
  setExpenseSuppliers,
  setExpenseBills,
  setExpenseLedger,
  setSalaries,
  setAssets,
  setDetailedOrders,
  setReportDetailedOrders,
  setReportSummary,
  setBestSellers,
  setCurrentUser,
  setMenuCardCategories,
  setMenuCardItems,
  setInventoryBills
} = adminDataSlice.actions;

export default adminDataSlice.reducer;
