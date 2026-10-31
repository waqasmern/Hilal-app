import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchQuery: "",
  inventorySearch: "",
  inventoryDateFilter: 'today',
  customDateRange: { start: "", end: "" },
  supplierSearch: "",
  salarySearch: "",
  salaryDateFilter: 'today',
  salaryCustomRange: { start: "", end: "" },
  reportDateFilter: 'today',
  reportCustomRange: { start: "", end: "" },
  auditStatusFilter: 'completed',
  orderTab: 'running',
  assetSearch: "",
  assetCategoryFilter: 'all',
  dateFilter: 'today',
  customDateStart: "",
  customDateEnd: "",
  orderSearchQuery: "",
  paymentStatusFilter: 'all',
  activeMgmtTab: 'menu', // default active management tab
  activeInvSubTab: 'suppliers', // default subtab under inventory
  activeMenuCardTab: 'categories',
  selectedParentCategory: 'All',
  selectedSubCategory: 'All',
  productSearch: ""
};

const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setSelectedParentCategory: (state, action) => { state.selectedParentCategory = action.payload; },
    setSelectedSubCategory: (state, action) => { state.selectedSubCategory = action.payload; },
    setSearchQuery: (state, action) => { state.searchQuery = action.payload; },
    setInventorySearch: (state, action) => { state.inventorySearch = action.payload; },
    setInventoryDateFilter: (state, action) => { state.inventoryDateFilter = action.payload; },
    setCustomDateRange: (state, action) => { state.customDateRange = action.payload; },
    setSupplierSearch: (state, action) => { state.supplierSearch = action.payload; },
    setSalarySearch: (state, action) => { state.salarySearch = action.payload; },
    setSalaryDateFilter: (state, action) => { state.salaryDateFilter = action.payload; },
    setSalaryCustomRange: (state, action) => { state.salaryCustomRange = action.payload; },
    setReportDateFilter: (state, action) => { state.reportDateFilter = action.payload; },
    setReportCustomRange: (state, action) => { state.reportCustomRange = action.payload; },
    setAuditStatusFilter: (state, action) => { state.auditStatusFilter = action.payload; },
    setOrderTab: (state, action) => { state.orderTab = action.payload; },
    setAssetSearch: (state, action) => { state.assetSearch = action.payload; },
    setAssetCategoryFilter: (state, action) => { state.assetCategoryFilter = action.payload; },
    setDateFilter: (state, action) => { state.dateFilter = action.payload; },
    setCustomDateStart: (state, action) => { state.customDateStart = action.payload; },
    setCustomDateEnd: (state, action) => { state.customDateEnd = action.payload; },
    setOrderSearchQuery: (state, action) => { state.orderSearchQuery = action.payload; },
    setPaymentStatusFilter: (state, action) => { state.paymentStatusFilter = action.payload; },
    setActiveMgmtTab: (state, action) => { state.activeMgmtTab = action.payload; },
    setActiveInvSubTab: (state, action) => { state.activeInvSubTab = action.payload; },
    setActiveMenuCardTab: (state, action) => { state.activeMenuCardTab = action.payload; },
    setProductSearch: (state, action) => { state.productSearch = action.payload; }
  }
});

export const {
  setSelectedParentCategory,
  setSelectedSubCategory,
  setSearchQuery,
  setInventorySearch,
  setInventoryDateFilter,
  setCustomDateRange,
  setSupplierSearch,
  setSalarySearch,
  setSalaryDateFilter,
  setSalaryCustomRange,
  setReportDateFilter,
  setReportCustomRange,
  setAuditStatusFilter,
  setOrderTab,
  setAssetSearch,
  setAssetCategoryFilter,
  setDateFilter,
  setCustomDateStart,
  setCustomDateEnd,
  setOrderSearchQuery,
  setPaymentStatusFilter,
  setActiveMgmtTab,
  setActiveInvSubTab,
  setActiveMenuCardTab,
  setProductSearch
} = filtersSlice.actions;

export default filtersSlice.reducer;
