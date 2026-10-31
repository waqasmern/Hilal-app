import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  cart: [],
  selectedTable: "",
  selectedWaiter: "",
  editingOrderId: null,
  orderType: 'dine_in',
  deliveryAddress: "",
  deliveryCustomerName: "",
  deliveryCustomerPhone: "",
  isCallOrder: false,
  receivedAmount: ""
};

const posCartSlice = createSlice({
  name: 'posCart',
  initialState,
  reducers: {
    setCart: (state, action) => { state.cart = action.payload; },
    addToCart: (state, action) => {
      const item = action.payload;
      const existing = state.cart.find(i => i.id === item.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.cart.push({ ...item, quantity: 1 });
      }
    },
    setSelectedTable: (state, action) => { state.selectedTable = action.payload; },
    setSelectedWaiter: (state, action) => { state.selectedWaiter = action.payload; },
    setEditingOrderId: (state, action) => { state.editingOrderId = action.payload; },
    setOrderType: (state, action) => { state.orderType = action.payload; },
    setDeliveryAddress: (state, action) => { state.deliveryAddress = action.payload; },
    setDeliveryCustomerName: (state, action) => { state.deliveryCustomerName = action.payload; },
    setDeliveryCustomerPhone: (state, action) => { state.deliveryCustomerPhone = action.payload; },
    setIsCallOrder: (state, action) => { state.isCallOrder = action.payload; },
    setReceivedAmount: (state, action) => { state.receivedAmount = action.payload; },
    resetCart: (state) => {
      state.cart = [];
      state.selectedTable = "";
      state.selectedWaiter = "";
      state.editingOrderId = null;
      state.orderType = 'dine_in';
      state.deliveryAddress = "";
      state.deliveryCustomerName = "";
      state.deliveryCustomerPhone = "";
      state.isCallOrder = false;
      state.receivedAmount = "";
    }
  }
});

export const {
  setCart,
  addToCart,
  setSelectedTable,
  setSelectedWaiter,
  setEditingOrderId,
  setOrderType,
  setDeliveryAddress,
  setDeliveryCustomerName,
  setDeliveryCustomerPhone,
  setIsCallOrder,
  setReceivedAmount,
  resetCart
} = posCartSlice.actions;

export default posCartSlice.reducer;
