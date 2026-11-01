'use client';
import React, { useState, useEffect, useMemo } from 'react';
import CustomModalAlert from '../components/CustomModalAlert';
import { 
    IconPlus, IconClose, IconInventory, IconSuppliers, 
    IconProducts, IconCheck, IconWarning, IconSearch,
    IconBill, IconPOS, IconPrinter, IconEye, IconSync,
    IconReceipt, IconEdit, IconTrash, IconDotsVertical,
    IconBox, IconBolt, IconLayers, IconPackage, IconTag, 
    IconBarcode, IconArrowRight, IconSparkles,
    IconChevronLeft, IconChevronRight, IconChevronDoubleLeft, IconChevronDoubleRight
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

export default function InventoryPage() {
    const [stocks, setStocks] = useState([]);
    const [kpis, setKpis] = useState({
        total_items: 0,
        total_quantity: 0,
        low_stock_count: 0,
        out_of_stock_count: 0,
        total_valuation: 0
    });
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
    const [stockStatusFilter, setStockStatusFilter] = useState('ALL'); // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

    // Server-Side Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalServerItems, setTotalServerItems] = useState(0);
    const [totalServerPages, setTotalServerPages] = useState(1);
    const [tableLoading, setTableLoading] = useState(false);

    // Master lists for inward & item creation
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [packagingTypes, setPackagingTypes] = useState([]);

    // Modals
    const [inwardModalOpen, setInwardModalOpen] = useState(false);
    const [addItemModalOpen, setAddItemModalOpen] = useState(false);
    const [editItemModalOpen, setEditItemModalOpen] = useState(false);
    const [addSupplierModalOpen, setAddSupplierModalOpen] = useState(false);
    const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
    const [movementsModalOpen, setMovementsModalOpen] = useState(false);
    const [actionModalItem, setActionModalItem] = useState(null);

    // Edit Item Form State
    const [editVariantId, setEditVariantId] = useState(null);
    const [editProductName, setEditProductName] = useState('');
    const [editVariantName, setEditVariantName] = useState('Standard');
    const [editCategoryId, setEditCategoryId] = useState('');
    const [editBaseUnitId, setEditBaseUnitId] = useState('');
    const [editBaseBarcode, setEditBaseBarcode] = useState('');
    const [editSku, setEditSku] = useState('');
    const [editMinStock, setEditMinStock] = useState('10');
    const [editReorderLevel, setEditReorderLevel] = useState('20');
    const [editPieceBuyPrice, setEditPieceBuyPrice] = useState('');
    const [editPieceSalePrice, setEditPieceSalePrice] = useState('');
    const [editIsEssential, setEditIsEssential] = useState(false);

    // Edit Bulk / Carton Packaging State
    const [editHasCartonPackaging, setEditHasCartonPackaging] = useState(true);
    const [editBulkPackagingTypeId, setEditBulkPackagingTypeId] = useState('');
    const [editConversionFactor, setEditConversionFactor] = useState('4');
    const [editCartonBuyPrice, setEditCartonBuyPrice] = useState('');
    const [editCartonSalePrice, setEditCartonSalePrice] = useState('');
    const [editCartonBarcode, setEditCartonBarcode] = useState('');

    // Edit Inner Packaging State (e.g. 1 Carton = 4 Packets = 200 Pieces)
    const [editHasInnerPackaging, setEditHasInnerPackaging] = useState(false);
    const [editInnerPackagingTypeId, setEditInnerPackagingTypeId] = useState('');
    const [editCartonPacketsCount, setEditCartonPacketsCount] = useState('4');
    const [editInnerPiecesCount, setEditInnerPiecesCount] = useState('50');
    const [editInnerBuyPrice, setEditInnerBuyPrice] = useState('');
    const [editInnerSalePrice, setEditInnerSalePrice] = useState('');
    const [editInnerBarcode, setEditInnerBarcode] = useState('');

    // Inward Stock Form State
    const [inwardSupplierId, setInwardSupplierId] = useState('');
    const [inwardInvoiceNo, setInwardInvoiceNo] = useState('');
    const [inwardVariantId, setInwardVariantId] = useState('');
    const [inwardPackagingId, setInwardPackagingId] = useState('');
    const [inwardQuantity, setInwardQuantity] = useState('10');
    const [inwardPurchasePrice, setInwardPurchasePrice] = useState('1000');
    const [inwardAmountPaid, setInwardAmountPaid] = useState('0');
    const [inwardPaymentMethod, setInwardPaymentMethod] = useState('cash');

    // Barcode Generator Utility
    const generateBarcode = (prefix = '896') => {
        const timestamp = Date.now().toString().slice(-7);
        const random = Math.floor(100 + Math.random() * 900);
        return `${prefix}${timestamp}${random}`;
    };

    // Add Product Item Form State (Starts with 0 stock)
    const [newProductName, setNewProductName] = useState('');
    const [newVariantName, setNewVariantName] = useState('Standard');
    const [newCategoryId, setNewCategoryId] = useState('');
    const [newBaseUnitId, setNewBaseUnitId] = useState('');
    const [newBaseBarcode, setNewBaseBarcode] = useState('');
    const [newPieceBuyPrice, setNewPieceBuyPrice] = useState('');
    const [newPieceSalePrice, setNewPieceSalePrice] = useState('');
    const [newIsEssential, setNewIsEssential] = useState(false);
    const [newInitialStock, setNewInitialStock] = useState('0');

    // Bulk / Carton Packaging State
    const [hasCartonPackaging, setHasCartonPackaging] = useState(true);
    const [newBulkPackagingTypeId, setNewBulkPackagingTypeId] = useState('');
    const [newConversionFactor, setNewConversionFactor] = useState('4');
    const [newCartonBuyPrice, setNewCartonBuyPrice] = useState('');
    const [newCartonSalePrice, setNewCartonSalePrice] = useState('');
    const [newCartonBarcode, setNewCartonBarcode] = useState('');

    // Inner Packaging State (e.g. 1 Carton = 4 Packets = 200 Pieces)
    const [hasInnerPackaging, setHasInnerPackaging] = useState(false);
    const [newInnerPackagingTypeId, setNewInnerPackagingTypeId] = useState('');
    const [newCartonPacketsCount, setNewCartonPacketsCount] = useState('4');
    const [newInnerPiecesCount, setNewInnerPiecesCount] = useState('50');
    const [newInnerBuyPrice, setNewInnerBuyPrice] = useState('');
    const [newInnerSalePrice, setNewInnerSalePrice] = useState('');
    const [newInnerBarcode, setNewInnerBarcode] = useState('');

    // Modal Trigger with fresh auto-generated barcodes
    const handleOpenAddItemModal = () => {
        setNewProductName('');
        setNewVariantName('Standard');
        setNewInitialStock('0');
        setNewBaseBarcode(generateBarcode('896'));
        setNewCartonBarcode(generateBarcode('897'));
        setNewInnerBarcode(generateBarcode('898'));
        setNewPieceBuyPrice('');
        setNewPieceSalePrice('');
        setHasCartonPackaging(true);
        setHasInnerPackaging(false);
        setNewConversionFactor('4');
        setNewCartonPacketsCount('4');
        setNewInnerPiecesCount('50');
        setNewCartonBuyPrice('');
        setNewCartonSalePrice('');
        setNewInnerBuyPrice('');
        setNewInnerSalePrice('');
        if (categories.length > 0 && !newCategoryId) setNewCategoryId(categories[0].id);
        if (units.length > 0 && !newBaseUnitId) setNewBaseUnitId(units[0].id);
        if (packagingTypes.length > 0) {
            const ctn = packagingTypes.find(p => p.name.toLowerCase() === 'carton') || packagingTypes[0];
            const pkt = packagingTypes.find(p => p.name.toLowerCase() === 'packet') || packagingTypes[0];
            setNewBulkPackagingTypeId(ctn.id);
            setNewInnerPackagingTypeId(pkt.id);
        }
        setNewIsEssential(false);
        setAddItemModalOpen(true);
    };

    // Live update when Bulk / Carton Buy Price is typed
    const handleBulkBuyChange = (val) => {
        setNewCartonBuyPrice(val);
        const cBuy = parseFloat(val);
        if (isNaN(cBuy) || val === '') {
            if (val === '') {
                if (hasInnerPackaging) setNewInnerBuyPrice('');
                setNewPieceBuyPrice('');
            }
            return;
        }

        if (hasInnerPackaging) {
            const pkts = parseFloat(newCartonPacketsCount) || 1;
            const pcs = parseFloat(newInnerPiecesCount) || 1;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setNewInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else {
            const factor = parseFloat(newConversionFactor) || 1;
            if (factor > 0) {
                const calcBuy = cBuy / factor;
                setNewPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
            }
        }
    };

    // Live update when Bulk / Carton Sale Price is typed
    const handleBulkSaleChange = (val) => {
        setNewCartonSalePrice(val);
        const cSale = parseFloat(val);
        if (isNaN(cSale) || val === '') {
            if (val === '') {
                if (hasInnerPackaging) setNewInnerSalePrice('');
                setNewPieceSalePrice('');
            }
            return;
        }

        if (hasInnerPackaging) {
            const pkts = parseFloat(newCartonPacketsCount) || 1;
            const pcs = parseFloat(newInnerPiecesCount) || 1;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setNewInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else {
            const factor = parseFloat(newConversionFactor) || 1;
            if (factor > 0) {
                const calcSale = cSale / factor;
                setNewPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Live update when Inner Packaging Buy Price (e.g. Packet) is typed
    const handleInnerBuyChange = (val) => {
        setNewInnerBuyPrice(val);
        const inBuy = parseFloat(val);
        if (isNaN(inBuy) || val === '') {
            return;
        }
        const pkts = parseFloat(newCartonPacketsCount) || 1;
        const pcs = parseFloat(newInnerPiecesCount) || 1;
        const cBuy = inBuy * pkts;
        const pcBuy = pcs > 0 ? inBuy / pcs : 0;
        setNewCartonBuyPrice(String(Math.round(cBuy)));
        setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
    };

    // Live update when Inner Packaging Sale Price (e.g. Packet) is typed
    const handleInnerSaleChange = (val) => {
        setNewInnerSalePrice(val);
        const inSale = parseFloat(val);
        if (isNaN(inSale) || val === '') {
            return;
        }
        const pkts = parseFloat(newCartonPacketsCount) || 1;
        const pcs = parseFloat(newInnerPiecesCount) || 1;
        const cSale = inSale * pkts;
        const pcSale = pcs > 0 ? inSale / pcs : 0;
        setNewCartonSalePrice(String(Math.round(cSale)));
        setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
    };

    // Live update when Packets Per Carton is changed
    const handleCartonPacketsCountChange = (val) => {
        setNewCartonPacketsCount(val);
        const pkts = parseFloat(val) || 1;
        const pcs = parseFloat(newInnerPiecesCount) || 1;
        setNewConversionFactor(String(pkts * pcs));
        if (newCartonBuyPrice !== '') {
            const cBuy = parseFloat(newCartonBuyPrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setNewInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else if (newInnerBuyPrice !== '') {
            const inBuy = parseFloat(newInnerBuyPrice) || 0;
            setNewCartonBuyPrice(String(Math.round(inBuy * pkts)));
        }
        if (newCartonSalePrice !== '') {
            const cSale = parseFloat(newCartonSalePrice) || 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setNewInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else if (newInnerSalePrice !== '') {
            const inSale = parseFloat(newInnerSalePrice) || 0;
            setNewCartonSalePrice(String(Math.round(inSale * pkts)));
        }
    };

    // Live update when Pieces Per Packet is changed
    const handleInnerPiecesCountChange = (val) => {
        setNewInnerPiecesCount(val);
        const pkts = parseFloat(newCartonPacketsCount) || 1;
        const pcs = parseFloat(val) || 1;
        setNewConversionFactor(String(pkts * pcs));
        if (newInnerBuyPrice !== '') {
            const inBuy = parseFloat(newInnerBuyPrice) || 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else if (newCartonBuyPrice !== '') {
            const cBuy = parseFloat(newCartonBuyPrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        }
        if (newInnerSalePrice !== '') {
            const inSale = parseFloat(newInnerSalePrice) || 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else if (newCartonSalePrice !== '') {
            const cSale = parseFloat(newCartonSalePrice) || 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        }
    };

    // Live update when Conversion Factor is changed (for standard 2-tier)
    const handleConversionFactorChange = (val) => {
        setNewConversionFactor(val);
        const factor = parseFloat(val) || 1;
        if (factor > 0) {
            if (newCartonBuyPrice !== '') {
                const cBuy = parseFloat(newCartonBuyPrice) || 0;
                const calcBuy = cBuy / factor;
                setNewPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
            }
            if (newCartonSalePrice !== '') {
                const cSale = parseFloat(newCartonSalePrice) || 0;
                const calcSale = cSale / factor;
                setNewPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Auto-calculate piece rates from carton rates
    const handleCalculatePieceFromCarton = () => {
        if (hasInnerPackaging) {
            const pkts = parseFloat(newCartonPacketsCount) || 1;
            const pcs = parseFloat(newInnerPiecesCount) || 1;
            const cBuy = parseFloat(newCartonBuyPrice) || 0;
            const cSale = parseFloat(newCartonSalePrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setNewInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setNewInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else {
            const factor = parseFloat(newConversionFactor) || 1;
            if (factor > 0) {
                const cBuy = parseFloat(newCartonBuyPrice) || 0;
                const cSale = parseFloat(newCartonSalePrice) || 0;
                const calcBuy = cBuy / factor;
                const calcSale = cSale / factor;
                setNewPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
                setNewPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Auto-calculate carton rates from piece rates
    const handleCalculateCartonFromPiece = () => {
        if (hasInnerPackaging) {
            const pkts = parseFloat(newCartonPacketsCount) || 1;
            const pcs = parseFloat(newInnerPiecesCount) || 1;
            const pBuy = parseFloat(newPieceBuyPrice) || 0;
            const pSale = parseFloat(newPieceSalePrice) || 0;
            const inBuy = pBuy * pcs;
            const inSale = pSale * pcs;
            setNewInnerBuyPrice(String(Math.round(inBuy)));
            setNewInnerSalePrice(String(Math.round(inSale)));
            setNewCartonBuyPrice(String(Math.round(inBuy * pkts)));
            setNewCartonSalePrice(String(Math.round(inSale * pkts)));
        } else {
            const factor = parseFloat(newConversionFactor) || 1;
            if (factor > 0) {
                const pBuy = parseFloat(newPieceBuyPrice) || 0;
                const pSale = parseFloat(newPieceSalePrice) || 0;
                setNewCartonBuyPrice(String(Math.round(pBuy * factor)));
                setNewCartonSalePrice(String(Math.round(pSale * factor)));
            }
        }
    };

    // Open Edit Item Modal
    const handleOpenEditItemModal = (item) => {
        setEditVariantId(item.variant_id);
        setEditProductName(item.product_name || '');
        setEditVariantName(item.variant_name || 'Standard');

        // Robust category matching: by ID or by name
        let matchedCategoryId = item.category_id;
        if (!matchedCategoryId && item.category_name) {
            const foundCat = categories.find(c => c.name && c.name.toLowerCase() === item.category_name.toLowerCase());
            if (foundCat) matchedCategoryId = foundCat.id;
        }
        setEditCategoryId(matchedCategoryId ? Number(matchedCategoryId) : (categories[0]?.id || ''));

        // Robust base unit matching: by base_unit_id, unit_id, or symbol/name
        let matchedUnitId = item.base_unit_id || item.unit_id;
        if (!matchedUnitId && (item.unit_symbol || item.unit_name)) {
            const sym = (item.unit_symbol || '').trim().toLowerCase();
            const nm = (item.unit_name || '').trim().toLowerCase();
            const foundUnit = units.find(u => {
                const uSym = (u.symbol || '').trim().toLowerCase();
                const uNm = (u.name || '').trim().toLowerCase();
                return (sym && uSym === sym) || 
                       (nm && uNm === nm) || 
                       (sym && uNm === sym) || 
                       (nm && uSym === nm) ||
                       (sym === 'pcs' && (uNm === 'piece' || uNm === 'pieces')) ||
                       (nm === 'piece' && uSym === 'pcs') ||
                       (nm === 'pieces' && uSym === 'pcs') ||
                       (sym === 'pc' && (uSym === 'pcs' || uNm === 'piece'));
            });
            if (foundUnit) matchedUnitId = foundUnit.id;
        }
        setEditBaseUnitId(matchedUnitId ? Number(matchedUnitId) : (units[0]?.id || ''));
        setEditSku(item.sku || '');
        setEditBaseBarcode(item.variant_barcode || '');
        setEditMinStock(String(item.minimum_stock ?? 10));
        setEditReorderLevel(String(item.reorder_level ?? 20));
        let isEss = item.is_essential === 1 || item.is_essential === true;
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('pos_essential_ids');
                if (saved) {
                    const ids = JSON.parse(saved);
                    if (ids.includes(item.variant_id) || ids.includes(item.product_id)) {
                        isEss = true;
                    }
                }
            } catch (e) {}
        }
        setEditIsEssential(isEss);

        const packList = item.packagings || [];
        const basePack = packList.find(p => (p.conversion_factor || 1) === 1) || packList[0];
        const bulkPacks = packList.filter(p => (p.conversion_factor || 1) > 1).sort((a, b) => b.conversion_factor - a.conversion_factor);

        if (basePack) {
            setEditPieceBuyPrice(String(basePack.purchase_price ?? ''));
            setEditPieceSalePrice(String(basePack.selling_price ?? ''));
            setEditBaseBarcode(basePack.barcode || item.variant_barcode || '');
        } else {
            setEditPieceBuyPrice('');
            setEditPieceSalePrice('');
            setEditBaseBarcode(item.variant_barcode || '');
        }

        if (bulkPacks.length >= 2) {
            // Multi-tier (e.g. Outer Carton x200 and Inner Packet x50)
            const outerPack = bulkPacks[0]; // Carton
            const innerPack = bulkPacks[1]; // Packet
            setEditHasCartonPackaging(true);
            setEditHasInnerPackaging(true);

            setEditBulkPackagingTypeId(outerPack.packaging_type_id);
            setEditCartonBuyPrice(String(outerPack.purchase_price ?? ''));
            setEditCartonSalePrice(String(outerPack.selling_price ?? ''));
            setEditCartonBarcode(outerPack.barcode || generateBarcode('897'));

            setEditInnerPackagingTypeId(innerPack.packaging_type_id);
            const innerPcs = innerPack.conversion_factor || 50;
            const outerPcs = outerPack.conversion_factor || 200;
            const pktCount = Math.round(outerPcs / innerPcs) || 4;
            setEditCartonPacketsCount(String(pktCount));
            setEditInnerPiecesCount(String(innerPcs));
            setEditInnerBuyPrice(String(innerPack.purchase_price ?? ''));
            setEditInnerSalePrice(String(innerPack.selling_price ?? ''));
            setEditInnerBarcode(innerPack.barcode || generateBarcode('898'));
            setEditConversionFactor(String(outerPcs));
        } else if (bulkPacks.length === 1) {
            // Standard 2-tier (e.g. Carton x4)
            const bulkPack = bulkPacks[0];
            setEditHasCartonPackaging(true);
            setEditHasInnerPackaging(false);
            setEditBulkPackagingTypeId(bulkPack.packaging_type_id);
            setEditConversionFactor(String(bulkPack.conversion_factor || 4));
            setEditCartonBuyPrice(String(bulkPack.purchase_price ?? ''));
            setEditCartonSalePrice(String(bulkPack.selling_price ?? ''));
            setEditCartonBarcode(bulkPack.barcode || generateBarcode('897'));

            const pkt = packagingTypes.find(p => p.name.toLowerCase() === 'packet') || packagingTypes[0];
            setEditInnerPackagingTypeId(pkt?.id || '');
            setEditCartonPacketsCount('4');
            setEditInnerPiecesCount('50');
            setEditInnerBuyPrice('');
            setEditInnerSalePrice('');
            setEditInnerBarcode(generateBarcode('898'));
        } else {
            // Standalone single item
            setEditHasCartonPackaging(false);
            setEditHasInnerPackaging(false);
            const ctn = packagingTypes.find(p => p.name.toLowerCase() === 'carton') || packagingTypes[0];
            const pkt = packagingTypes.find(p => p.name.toLowerCase() === 'packet') || packagingTypes[0];
            setEditBulkPackagingTypeId(ctn?.id || '');
            setEditInnerPackagingTypeId(pkt?.id || '');
            setEditConversionFactor('4');
            setEditCartonPacketsCount('4');
            setEditInnerPiecesCount('50');
            setEditCartonBuyPrice('');
            setEditCartonSalePrice('');
            setEditInnerBuyPrice('');
            setEditInnerSalePrice('');
            setEditCartonBarcode(generateBarcode('897'));
            setEditInnerBarcode(generateBarcode('898'));
        }

        setEditItemModalOpen(true);
    };

    // Live update when Edit Bulk / Carton Buy Price is typed
    const handleEditBulkBuyChange = (val) => {
        setEditCartonBuyPrice(val);
        const cBuy = parseFloat(val);
        if (isNaN(cBuy) || val === '') {
            if (val === '') {
                if (editHasInnerPackaging) setEditInnerBuyPrice('');
                setEditPieceBuyPrice('');
            }
            return;
        }

        if (editHasInnerPackaging) {
            const pkts = parseFloat(editCartonPacketsCount) || 1;
            const pcs = parseFloat(editInnerPiecesCount) || 1;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setEditInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else {
            const factor = parseFloat(editConversionFactor) || 1;
            if (factor > 0) {
                const calcBuy = cBuy / factor;
                setEditPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
            }
        }
    };

    // Live update when Edit Bulk / Carton Sale Price is typed
    const handleEditBulkSaleChange = (val) => {
        setEditCartonSalePrice(val);
        const cSale = parseFloat(val);
        if (isNaN(cSale) || val === '') {
            if (val === '') {
                if (editHasInnerPackaging) setEditInnerSalePrice('');
                setEditPieceSalePrice('');
            }
            return;
        }

        if (editHasInnerPackaging) {
            const pkts = parseFloat(editCartonPacketsCount) || 1;
            const pcs = parseFloat(editInnerPiecesCount) || 1;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setEditInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else {
            const factor = parseFloat(editConversionFactor) || 1;
            if (factor > 0) {
                const calcSale = cSale / factor;
                setEditPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Live update when Edit Inner Buy Price is typed
    const handleEditInnerBuyChange = (val) => {
        setEditInnerBuyPrice(val);
        const inBuy = parseFloat(val);
        if (isNaN(inBuy) || val === '') return;
        const pkts = parseFloat(editCartonPacketsCount) || 1;
        const pcs = parseFloat(editInnerPiecesCount) || 1;
        const cBuy = inBuy * pkts;
        const pcBuy = pcs > 0 ? inBuy / pcs : 0;
        setEditCartonBuyPrice(String(Math.round(cBuy)));
        setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
    };

    // Live update when Edit Inner Sale Price is typed
    const handleEditInnerSaleChange = (val) => {
        setEditInnerSalePrice(val);
        const inSale = parseFloat(val);
        if (isNaN(inSale) || val === '') return;
        const pkts = parseFloat(editCartonPacketsCount) || 1;
        const pcs = parseFloat(editInnerPiecesCount) || 1;
        const cSale = inSale * pkts;
        const pcSale = pcs > 0 ? inSale / pcs : 0;
        setEditCartonSalePrice(String(Math.round(cSale)));
        setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
    };

    // Live update when Edit Packets Per Carton is changed
    const handleEditCartonPacketsCountChange = (val) => {
        setEditCartonPacketsCount(val);
        const pkts = parseFloat(val) || 1;
        const pcs = parseFloat(editInnerPiecesCount) || 1;
        setEditConversionFactor(String(pkts * pcs));
        if (editCartonBuyPrice !== '') {
            const cBuy = parseFloat(editCartonBuyPrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setEditInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else if (editInnerBuyPrice !== '') {
            const inBuy = parseFloat(editInnerBuyPrice) || 0;
            setEditCartonBuyPrice(String(Math.round(inBuy * pkts)));
        }
        if (editCartonSalePrice !== '') {
            const cSale = parseFloat(editCartonSalePrice) || 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setEditInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else if (editInnerSalePrice !== '') {
            const inSale = parseFloat(editInnerSalePrice) || 0;
            setEditCartonSalePrice(String(Math.round(inSale * pkts)));
        }
    };

    // Live update when Edit Pieces Per Packet is changed
    const handleEditInnerPiecesCountChange = (val) => {
        setEditInnerPiecesCount(val);
        const pkts = parseFloat(editCartonPacketsCount) || 1;
        const pcs = parseFloat(val) || 1;
        setEditConversionFactor(String(pkts * pcs));
        if (editInnerBuyPrice !== '') {
            const inBuy = parseFloat(editInnerBuyPrice) || 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        } else if (editCartonBuyPrice !== '') {
            const cBuy = parseFloat(editCartonBuyPrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
        }
        if (editInnerSalePrice !== '') {
            const inSale = parseFloat(editInnerSalePrice) || 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else if (editCartonSalePrice !== '') {
            const cSale = parseFloat(editCartonSalePrice) || 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        }
    };

    // Live update when Edit Conversion Factor is changed
    const handleEditConversionFactorChange = (val) => {
        setEditConversionFactor(val);
        const factor = parseFloat(val) || 1;
        if (factor > 0) {
            if (editCartonBuyPrice !== '') {
                const cBuy = parseFloat(editCartonBuyPrice) || 0;
                const calcBuy = cBuy / factor;
                setEditPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
            }
            if (editCartonSalePrice !== '') {
                const cSale = parseFloat(editCartonSalePrice) || 0;
                const calcSale = cSale / factor;
                setEditPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Auto-calculate piece rates from carton rates in Edit Modal
    const handleEditCalculatePieceFromCarton = () => {
        if (editHasInnerPackaging) {
            const pkts = parseFloat(editCartonPacketsCount) || 1;
            const pcs = parseFloat(editInnerPiecesCount) || 1;
            const cBuy = parseFloat(editCartonBuyPrice) || 0;
            const cSale = parseFloat(editCartonSalePrice) || 0;
            const inBuy = pkts > 0 ? cBuy / pkts : 0;
            const inSale = pkts > 0 ? cSale / pkts : 0;
            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
            const pcSale = pcs > 0 ? inSale / pcs : 0;
            setEditInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
            setEditInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
        } else {
            const factor = parseFloat(editConversionFactor) || 1;
            if (factor > 0) {
                const cBuy = parseFloat(editCartonBuyPrice) || 0;
                const cSale = parseFloat(editCartonSalePrice) || 0;
                const calcBuy = cBuy / factor;
                const calcSale = cSale / factor;
                setEditPieceBuyPrice(String(calcBuy % 1 === 0 ? calcBuy : Math.round(calcBuy * 100) / 100));
                setEditPieceSalePrice(String(calcSale % 1 === 0 ? calcSale : Math.round(calcSale * 100) / 100));
            }
        }
    };

    // Auto-calculate carton rates from piece rates in Edit Modal
    const handleEditCalculateCartonFromPiece = () => {
        if (editHasInnerPackaging) {
            const pkts = parseFloat(editCartonPacketsCount) || 1;
            const pcs = parseFloat(editInnerPiecesCount) || 1;
            const pBuy = parseFloat(editPieceBuyPrice) || 0;
            const pSale = parseFloat(editPieceSalePrice) || 0;
            const inBuy = pBuy * pcs;
            const inSale = pSale * pcs;
            setEditInnerBuyPrice(String(Math.round(inBuy)));
            setEditInnerSalePrice(String(Math.round(inSale)));
            setEditCartonBuyPrice(String(Math.round(inBuy * pkts)));
            setEditCartonSalePrice(String(Math.round(inSale * pkts)));
        } else {
            const factor = parseFloat(editConversionFactor) || 1;
            if (factor > 0) {
                const pBuy = parseFloat(editPieceBuyPrice) || 0;
                const pSale = parseFloat(editPieceSalePrice) || 0;
                setEditCartonBuyPrice(String(Math.round(pBuy * factor)));
                setEditCartonSalePrice(String(Math.round(pSale * factor)));
            }
        }
    };

    // Save Edit Item
    const handleSaveEditItem = async (e) => {
        e.preventDefault();
        if (!editProductName.trim()) return showAlert('Product Name is required', 'warning');

        const catId = editCategoryId || categories[0]?.id || 1;
        const baseUnitId = editBaseUnitId || units[0]?.id || 1;

        const pieceType = packagingTypes.find(p => p.name.toLowerCase() === 'piece') || packagingTypes[0];
        const pieceTypeId = pieceType ? pieceType.id : 1;

        const baseBarcode = editBaseBarcode.trim() || generateBarcode('896');
        const packagingsList = [];

        if (editHasCartonPackaging) {
            const cartonPackType = packagingTypes.find(p => p.id === parseInt(editBulkPackagingTypeId)) 
                || packagingTypes.find(p => p.name.toLowerCase() === 'carton') 
                || packagingTypes[1] 
                || pieceType;
            const cartonBarcode = editCartonBarcode.trim() || generateBarcode('897');

            // 1. Base Unit / Piece packaging
            packagingsList.push({
                packaging_type_id: pieceTypeId,
                conversion_factor: 1,
                is_default: 0,
                purchase_price: parseFloat(editPieceBuyPrice) || 0,
                selling_price: parseFloat(editPieceSalePrice) || 0,
                barcode: baseBarcode
            });

            // 2. Inner Packaging (e.g. Packet of 50 pcs) if enabled
            if (editHasInnerPackaging) {
                const innerPackType = packagingTypes.find(p => p.id === parseInt(editInnerPackagingTypeId))
                    || packagingTypes.find(p => p.name.toLowerCase() === 'packet')
                    || packagingTypes[0];
                const innerPcs = parseFloat(editInnerPiecesCount) || 50;
                const innerBarcode = editInnerBarcode.trim() || generateBarcode('898');

                packagingsList.push({
                    packaging_type_id: innerPackType.id,
                    conversion_factor: innerPcs,
                    is_default: 0,
                    purchase_price: parseFloat(editInnerBuyPrice) || 0,
                    selling_price: parseFloat(editInnerSalePrice) || 0,
                    barcode: innerBarcode
                });

                const packetsCount = parseFloat(editCartonPacketsCount) || 4;
                const totalCartonPieces = packetsCount * innerPcs;

                // 3. Outer Bulk / Carton packaging (is_default: 1)
                packagingsList.push({
                    packaging_type_id: cartonPackType.id,
                    conversion_factor: totalCartonPieces,
                    is_default: 1,
                    purchase_price: parseFloat(editCartonBuyPrice) || 0,
                    selling_price: parseFloat(editCartonSalePrice) || 0,
                    barcode: cartonBarcode
                });
            } else {
                const factor = parseFloat(editConversionFactor) || 1;
                packagingsList.push({
                    packaging_type_id: cartonPackType.id,
                    conversion_factor: factor,
                    is_default: 1,
                    purchase_price: parseFloat(editCartonBuyPrice) || 0,
                    selling_price: parseFloat(editCartonSalePrice) || 0,
                    barcode: cartonBarcode
                });
            }
        } else {
            packagingsList.push({
                packaging_type_id: pieceTypeId,
                conversion_factor: 1,
                is_default: 1,
                purchase_price: parseFloat(editPieceBuyPrice) || 0,
                selling_price: parseFloat(editPieceSalePrice) || 0,
                barcode: baseBarcode
            });
        }

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`http://localhost:5000/api/products/${editVariantId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    name: editProductName.trim(),
                    category_id: catId,
                    variant_name: editVariantName.trim() || 'Standard',
                    sku: editSku.trim(),
                    barcode: baseBarcode,
                    base_unit_id: baseUnitId,
                    minimum_stock: parseFloat(editMinStock) || 10,
                    reorder_level: parseFloat(editReorderLevel) || 20,
                    is_loose_allowed: true,
                    is_essential: editIsEssential ? 1 : 0,
                    packagings: packagingsList
                })
            });

            if (res.ok) {
                // Immediately synchronize essential status in localStorage for POS
                if (typeof window !== 'undefined') {
                    try {
                        const saved = localStorage.getItem('pos_essential_ids');
                        let ids = saved ? JSON.parse(saved) : [];
                        const targetVId = editVariantId;
                        if (editIsEssential) {
                            if (!ids.includes(targetVId)) ids.push(targetVId);
                        } else {
                            ids = ids.filter(id => id !== targetVId);
                        }
                        localStorage.setItem('pos_essential_ids', JSON.stringify(ids));
                        window.dispatchEvent(new Event('storage'));
                    } catch (e) {}
                }

                setEditItemModalOpen(false);
                fetchStock();
                fetchKpis();
                showAlert(`Product "${editProductName}" updated successfully!`, 'success', 'Item Updated');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to update item', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // Delete Item
    const handleDeleteItem = (item) => {
        showConfirm(
            `Are you sure you want to delete "${item.product_name}" (${item.variant_name || 'Standard'})? This will remove the item from Inventory and POS catalogs.`,
            async () => {
                try {
                    const token = localStorage.getItem('token');
                    const headers = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const res = await fetch(`http://localhost:5000/api/products/${item.variant_id}`, {
                        method: 'DELETE',
                        headers
                    });

                    if (res.ok) {
                        fetchStock();
                        fetchKpis();
                        showAlert(`Product "${item.product_name}" deleted successfully.`, 'success', 'Item Deleted');
                    } else {
                        const data = await res.json();
                        showAlert(data.error || 'Failed to delete product', 'error');
                    }
                } catch (err) {
                    showAlert(err.message, 'error');
                }
            },
            'Delete Product Confirmation'
        );
    };

    // Add Supplier Form State
    const [supName, setSupName] = useState('');
    const [supCompanyName, setSupCompanyName] = useState('');
    const [supPhone, setSupPhone] = useState('');
    const [supAddress, setSupAddress] = useState('Timergara');
    const [supOpeningBal, setSupOpeningBal] = useState('0');

    // Adjustment Form State
    const [adjustmentType, setAdjustmentType] = useState('ADD');
    const [adjustmentQuantity, setAdjustmentQuantity] = useState('1');
    const [adjustmentNotes, setAdjustmentNotes] = useState('');

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
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchStock(),
                fetchKpis(),
                fetchSuppliers(),
                fetchCategories(),
                fetchUnits(),
                fetchPackagingTypes()
            ]);
        } catch (err) {
            console.error('Error loading inventory data:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStock = async (page = currentPage, limit = pageSize, search = searchQuery, cat = selectedCategoryFilter, status = stockStatusFilter) => {
        try {
            setTableLoading(true);
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                paginate: 'true'
            });
            if (search && search.trim()) params.append('search', search.trim());
            if (cat && cat !== 'ALL') params.append('category', cat);
            if (status && status !== 'ALL') params.append('status', status);

            const res = await fetch(`http://localhost:5000/api/inventory/stock?${params.toString()}`);
            if (res.ok) {
                const result = await res.json();
                if (result && result.pagination) {
                    const rows = result.data || [];
                    setStocks(rows);
                    setTotalServerItems(result.pagination.total);
                    setTotalServerPages(result.pagination.totalPages);
                    if (rows.length > 0 && !inwardVariantId) {
                        setInwardVariantId(rows[0].variant_id);
                    }
                } else if (Array.isArray(result)) {
                    // Graceful fallback if unpaginated backend
                    const q = (search || '').toLowerCase().trim();
                    const filtered = result.filter(item => {
                        const matches = !q ||
                            (item.product_name && item.product_name.toLowerCase().includes(q)) ||
                            (item.variant_name && item.variant_name.toLowerCase().includes(q)) ||
                            (item.sku && item.sku.toLowerCase().includes(q)) ||
                            (item.variant_barcode && item.variant_barcode.toLowerCase().includes(q)) ||
                            (item.category_name && item.category_name.toLowerCase().includes(q));
                        if (!matches) return false;
                        if (cat !== 'ALL' && item.category_name !== cat) return false;
                        if (status === 'IN_STOCK') return item.current_stock > item.minimum_stock;
                        if (status === 'LOW_STOCK') return item.current_stock <= item.minimum_stock && item.current_stock > 0;
                        if (status === 'OUT_OF_STOCK') return item.current_stock <= 0;
                        return true;
                    });
                    setTotalServerItems(filtered.length);
                    setTotalServerPages(Math.max(1, Math.ceil(filtered.length / limit)));
                    const start = (page - 1) * limit;
                    setStocks(filtered.slice(start, start + limit));
                }
            }
        } catch (err) {
            console.error('Failed to fetch stock:', err);
        } finally {
            setTableLoading(false);
        }
    };

    // Auto-fetch with 200ms debounce when search or filters or page change
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchStock(currentPage, pageSize, searchQuery, selectedCategoryFilter, stockStatusFilter);
        }, 200);
        return () => clearTimeout(handler);
    }, [searchQuery, selectedCategoryFilter, stockStatusFilter, currentPage, pageSize]);

    const fetchKpis = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/inventory/kpis');
            if (res.ok) {
                const data = await res.json();
                setKpis(data);
            }
        } catch (err) {
            console.error('Failed to fetch KPIs:', err);
        }
    };

    const fetchMovements = async (variantId) => {
        try {
            const res = await fetch(`http://localhost:5000/api/inventory/movements/${variantId}`);
            if (res.ok) {
                const data = await res.json();
                setMovements(data);
            }
        } catch (err) {
            console.error('Failed to fetch stock movements:', err);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/suppliers');
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data);
                if (data.length > 0 && !inwardSupplierId) {
                    setInwardSupplierId(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch suppliers:', err);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/categories');
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
                if (data.length > 0 && !newCategoryId) setNewCategoryId(data[0].id);
            }
        } catch (err) {}
    };

    const fetchUnits = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/units');
            if (res.ok) {
                const data = await res.json();
                setUnits(data);
                if (data.length > 0 && !newBaseUnitId) setNewBaseUnitId(data[0].id);
            }
        } catch (err) {}
    };

    const fetchPackagingTypes = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/packaging-types');
            if (res.ok) {
                const data = await res.json();
                setPackagingTypes(data);
                if (data.length > 0) {
                    if (!inwardPackagingId) setInwardPackagingId(data[0].id);
                    if (!newPackagingTypeId) setNewPackagingTypeId(data[0].id);
                }
            }
        } catch (err) {}
    };

    // Helper to format stock into wholesale breakdown: e.g. "3 Ctns + 2 Pkts + 11 pcs (Total: 711 pcs)"
    const formatStockBreakdown = (stockItem) => {
        if (!stockItem) return { formatted: '0 pcs', ctnCount: 0, looseCount: 0, totalPcs: 0, bulkName: 'Ctn', unitName: 'pcs', hasBulk: false };
        
        const totalPcs = parseFloat(stockItem.current_stock) || 0;
        const unitName = stockItem.unit_symbol || stockItem.unit_name || 'pcs';
        
        // Find all bulk packagings with factor > 1 sorted descending (Carton x200, Packet x50, etc.)
        const bulkPacks = (stockItem.packagings || [])
            .filter(p => (p.conversion_factor || 1) > 1)
            .sort((a, b) => (b.conversion_factor || 1) - (a.conversion_factor || 1));
        
        if (bulkPacks.length === 0) {
            return {
                formatted: `${Number(totalPcs).toLocaleString()} ${unitName}`,
                breakdownStr: `${Number(totalPcs).toLocaleString()} ${unitName}`,
                ctnCount: 0,
                looseCount: totalPcs,
                totalPcs,
                bulkName: '',
                unitName,
                hasBulk: false
            };
        }
        
        const isNegative = totalPcs < 0;
        let rem = Math.abs(totalPcs);
        let parts = [];
        let primaryBulkCount = 0;
        
        bulkPacks.forEach((bp, index) => {
            const f = bp.conversion_factor || 1;
            const count = Math.floor(rem / f);
            rem = rem % f;
            if (index === 0) primaryBulkCount = count;
            if (count > 0) {
                const rawBulkName = bp.packaging_name || 'Carton';
                const bulkName = rawBulkName.replace(/s$/i, '');
                parts.push(`${count} ${bulkName}${count > 1 ? 's' : ''}`);
            }
        });
        
        if (rem > 0) {
            parts.push(`${rem} ${unitName}`);
        }
        if (parts.length === 0) {
            const primaryBulk = bulkPacks[0];
            const rawBulkName = primaryBulk.packaging_name || 'Carton';
            const bulkName = rawBulkName.replace(/s$/i, '');
            parts.push(`0 ${bulkName}s`);
        }
        
        const prefix = isNegative ? '-' : '';
        const breakdownStr = prefix + parts.join(' + ');
        const fullDisplay = `${breakdownStr} (Total: ${Number(totalPcs).toLocaleString()} ${unitName})`;
        
        const primaryBulk = bulkPacks[0];
        const rawBulkName = primaryBulk.packaging_name || 'Carton';
        const bulkName = rawBulkName.replace(/s$/i, '');

        return {
            formatted: fullDisplay,
            breakdownStr,
            ctnCount: isNegative ? -primaryBulkCount : primaryBulkCount,
            looseCount: isNegative ? -rem : rem,
            totalPcs,
            bulkName,
            unitName,
            factor: primaryBulk.conversion_factor,
            hasBulk: true
        };
    };

    // Helper to calculate exact stock valuation based on wholesale bulk tiers and packaging conversions
    const calculateStockValuation = (stockItem) => {
        if (!stockItem) return 0;
        const totalUnits = parseFloat(stockItem.current_stock) || 0;
        if (totalUnits === 0) return 0;

        const packagings = stockItem.packagings || [];
        if (packagings.length === 0) {
            return totalUnits * (parseFloat(stockItem.cost_price) || 0);
        }

        const bulkPacks = packagings
            .filter(p => (p.conversion_factor || 1) > 1)
            .sort((a, b) => (b.conversion_factor || 1) - (a.conversion_factor || 1));

        if (bulkPacks.length > 0) {
            let rem = Math.abs(totalUnits);
            let totalVal = 0;

            for (const bp of bulkPacks) {
                const factor = bp.conversion_factor || 1;
                const count = Math.floor(rem / factor);
                rem = rem % factor;
                const bulkCost = parseFloat(bp.purchase_price) || (parseFloat(bp.selling_price) ? bp.selling_price * 0.8 : 0);
                totalVal += count * bulkCost;
            }

            const basePack = packagings.find(p => (p.conversion_factor || 1) === 1);
            let looseCost = 0;
            if (basePack && parseFloat(basePack.purchase_price) > 0) {
                looseCost = parseFloat(basePack.purchase_price);
            } else {
                const primaryBulk = bulkPacks[0];
                const bulkCost = parseFloat(primaryBulk.purchase_price) || 0;
                looseCost = primaryBulk.conversion_factor > 0 ? (bulkCost / primaryBulk.conversion_factor) : 0;
            }

            totalVal += rem * looseCost;
            return totalUnits < 0 ? -totalVal : totalVal;
        } else {
            const singlePack = packagings.find(p => p.is_default === 1) || packagings[0];
            const factor = singlePack?.conversion_factor || 1;
            const singleCost = parseFloat(singlePack?.purchase_price) || (parseFloat(singlePack?.selling_price) ? singlePack.selling_price * 0.8 : 0);
            const unitCost = factor > 0 ? (singleCost / factor) : singleCost;
            return totalUnits * unitCost;
        }
    };

    // Open Movements Ledger Modal for a variant
    const handleOpenMovementsModal = (item) => {
        setSelectedVariant(item);
        fetchMovements(item.variant_id);
        setMovementsModalOpen(true);
    };

    // Open Inward Modal for a specific variant
    const handleOpenInwardForVariant = (item) => {
        setInwardVariantId(item.variant_id);
        const defaultPack = item.packagings?.find(p => p.is_default === 1) || item.packagings?.[0];
        if (defaultPack) {
            setInwardPackagingId(defaultPack.packaging_type_id);
            setInwardPurchasePrice(defaultPack.purchase_price > 0 ? String(defaultPack.purchase_price) : '1000');
        }
        setInwardQuantity('10');
        setInwardAmountPaid('0');
        setInwardInvoiceNo(`INV-${Date.now().toString().slice(-5)}`);
        setInwardModalOpen(true);
    };

    // Open Adjustment Modal for a specific variant
    const handleOpenAdjustmentForVariant = (item) => {
        setSelectedVariant(item);
        setAdjustmentType('DAMAGE');
        setAdjustmentQuantity('1');
        setAdjustmentNotes('');
        setAdjustmentModalOpen(true);
    };

    // 1. INWARD STOCK FROM SUPPLIER
    const handleSaveInwardStock = async (e) => {
        e.preventDefault();
        if (!inwardSupplierId || !inwardVariantId) return showAlert('Supplier and Product Variant required', 'warning');
        
        const qty = parseFloat(inwardQuantity) || 1;
        const rate = parseFloat(inwardPurchasePrice) || 0;
        const gross = qty * rate;
        const paid = parseFloat(inwardAmountPaid) || 0;

        const currentItem = stocks.find(s => s.variant_id === inwardVariantId);
        const selectedPack = currentItem?.packagings?.find(p => p.packaging_type_id === inwardPackagingId) || currentItem?.packagings?.[0];
        const conversionFactor = selectedPack?.conversion_factor || 1;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('http://localhost:5000/api/purchases', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    supplier_id: inwardSupplierId,
                    supplier_invoice_no: inwardInvoiceNo || `SUP-${Date.now().toString().slice(-5)}`,
                    items: [{
                        variant_id: inwardVariantId,
                        packaging_type_id: inwardPackagingId || 1,
                        quantity: qty,
                        purchase_price: rate,
                        total: gross,
                        conversion_factor: conversionFactor
                    }],
                    gross_amount: gross,
                    discount: 0,
                    additional_charges: 0,
                    net_amount: gross,
                    amount_paid: paid,
                    payment_method: inwardPaymentMethod,
                    invoice_date: new Date().toISOString().split('T')[0]
                })
            });

            if (res.ok) {
                setInwardModalOpen(false);
                setInwardInvoiceNo('');
                fetchStock();
                fetchKpis();
                if (selectedVariant && selectedVariant.variant_id === inwardVariantId) {
                    fetchMovements(inwardVariantId);
                }
                const addedUnits = qty * conversionFactor;
                showAlert(`Stock inward recorded successfully! +${addedUnits} ${currentItem?.unit_symbol || currentItem?.unit_name || 'units'} added to warehouse inventory.`, 'success', 'Stock Inwarded');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to inward stock', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // 2. ADD PRODUCT ITEM (0 INITIAL STOCK)
    const handleSaveNewItem = async (e) => {
        e.preventDefault();
        if (!newProductName.trim()) return showAlert('Product Name is required', 'warning');

        const catId = newCategoryId || categories[0]?.id || 1;
        const baseUnitId = newBaseUnitId || units[0]?.id || 1;
        const baseUnitObj = units.find(u => u.id === baseUnitId) || units[0];

        // Piece packaging type ID
        const pieceType = packagingTypes.find(p => p.name.toLowerCase() === 'piece') || packagingTypes[0];
        const pieceTypeId = pieceType ? pieceType.id : 1;

        const baseBarcode = newBaseBarcode.trim() || generateBarcode('896');
        const packagingsList = [];

        if (hasCartonPackaging) {
            const cartonPackType = packagingTypes.find(p => p.id === parseInt(newBulkPackagingTypeId)) 
                || packagingTypes.find(p => p.name.toLowerCase() === 'carton') 
                || packagingTypes[1] 
                || pieceType;
            const cartonBarcode = newCartonBarcode.trim() || generateBarcode('897');

            // 1. Base / Piece packaging
            packagingsList.push({
                packaging_type_id: pieceTypeId,
                conversion_factor: 1,
                is_default: 0,
                purchase_price: parseFloat(newPieceBuyPrice) || 0,
                selling_price: parseFloat(newPieceSalePrice) || 0,
                barcode: baseBarcode
            });

            // 2. Inner Packaging (e.g. Packet of 50 pcs) if enabled
            if (hasInnerPackaging) {
                const innerPackType = packagingTypes.find(p => p.id === parseInt(newInnerPackagingTypeId))
                    || packagingTypes.find(p => p.name.toLowerCase() === 'packet')
                    || packagingTypes[0];
                const innerPcs = parseFloat(newInnerPiecesCount) || 50;
                const innerBarcode = newInnerBarcode.trim() || generateBarcode('898');

                packagingsList.push({
                    packaging_type_id: innerPackType.id,
                    conversion_factor: innerPcs,
                    is_default: 0,
                    purchase_price: parseFloat(newInnerBuyPrice) || 0,
                    selling_price: parseFloat(newInnerSalePrice) || 0,
                    barcode: innerBarcode
                });

                const packetsCount = parseFloat(newCartonPacketsCount) || 4;
                const totalCartonPieces = packetsCount * innerPcs;

                // 3. Outer Bulk / Carton packaging (is_default: 1)
                packagingsList.push({
                    packaging_type_id: cartonPackType.id,
                    conversion_factor: totalCartonPieces,
                    is_default: 1,
                    purchase_price: parseFloat(newCartonBuyPrice) || 0,
                    selling_price: parseFloat(newCartonSalePrice) || 0,
                    barcode: cartonBarcode
                });
            } else {
                const factor = parseFloat(newConversionFactor) || 1;
                // Standard 2-tier Bulk / Carton packaging
                packagingsList.push({
                    packaging_type_id: cartonPackType.id,
                    conversion_factor: factor,
                    is_default: 1,
                    purchase_price: parseFloat(newCartonBuyPrice) || 0,
                    selling_price: parseFloat(newCartonSalePrice) || 0,
                    barcode: cartonBarcode
                });
            }
        } else {
            // Standalone single packaging (e.g. Gallon, Bottle, Piece)
            const standAloneType = packagingTypes.find(p => p.id === parseInt(newBulkPackagingTypeId)) || pieceType;
            packagingsList.push({
                packaging_type_id: standAloneType.id,
                conversion_factor: 1,
                is_default: 1,
                purchase_price: parseFloat(newPieceBuyPrice) || 0,
                selling_price: parseFloat(newPieceSalePrice) || 0,
                barcode: baseBarcode
            });
        }

        const sku = `SKU-${newProductName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PROD'}-${Date.now().toString().slice(-4)}`;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const initStockQty = parseFloat(newInitialStock) || 0;

            const res = await fetch('http://localhost:5000/api/products', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: newProductName.trim(),
                    category_id: catId,
                    variant_name: newVariantName.trim() || 'Standard',
                    sku,
                    barcode: baseBarcode,
                    base_unit_id: baseUnitId,
                    minimum_stock: 10,
                    reorder_level: 20,
                    is_loose_allowed: true,
                    is_essential: newIsEssential ? 1 : 0,
                    initial_stock: initStockQty,
                    packagings: packagingsList
                })
            });

            if (res.ok) {
                const addResData = await res.json().catch(() => ({}));
                if (newIsEssential && addResData?.variantId && typeof window !== 'undefined') {
                    try {
                        const saved = localStorage.getItem('pos_essential_ids');
                        let ids = saved ? JSON.parse(saved) : [];
                        if (!ids.includes(addResData.variantId)) ids.push(addResData.variantId);
                        localStorage.setItem('pos_essential_ids', JSON.stringify(ids));
                        window.dispatchEvent(new Event('storage'));
                    } catch (e) {}
                }

                setAddItemModalOpen(false);
                setNewProductName('');
                setNewBaseBarcode('');
                setNewCartonBarcode('');
                setNewIsEssential(false);
                setNewInitialStock('0');
                fetchStock();
                fetchKpis();
                if (initStockQty > 0) {
                    showAlert(`Product "${newProductName}" registered with ${initStockQty} units opening stock!`, 'success', 'Product Registered');
                } else {
                    showAlert(`Product "${newProductName}" registered successfully! Use "Inward Stock from Supplier" to add inventory.`, 'success', 'Product Registered');
                }
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to add item', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // 3. ADD SUPPLIER
    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        if (!supName.trim()) return showAlert('Supplier Name required', 'warning');

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('http://localhost:5000/api/suppliers', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: supName,
                    company_name: supCompanyName,
                    phone: supPhone,
                    address: supAddress,
                    opening_balance: parseFloat(supOpeningBal) || 0
                })
            });

            if (res.ok) {
                setAddSupplierModalOpen(false);
                setSupName('');
                setSupCompanyName('');
                setSupPhone('');
                fetchSuppliers();
                showAlert('Supplier profile added successfully!', 'success', 'Supplier Added');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to add supplier', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // 4. MANUAL STOCK ADJUSTMENT (DAMAGE / RECONCILIATION)
    const handleSaveAdjustment = async (e) => {
        e.preventDefault();
        if (!selectedVariant) return;
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('http://localhost:5000/api/inventory/adjustments', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    variant_id: selectedVariant.variant_id,
                    adjustment_type: adjustmentType,
                    quantity: parseFloat(adjustmentQuantity) || 1,
                    notes: adjustmentNotes
                })
            });

            if (res.ok) {
                setAdjustmentModalOpen(false);
                setAdjustmentQuantity('1');
                setAdjustmentNotes('');
                fetchStock();
                fetchKpis();
                fetchMovements(selectedVariant.variant_id);
                showAlert('Stock adjustment recorded successfully!', 'success', 'Adjustment Recorded');
            } else {
                const data = await res.json();
                showAlert(data.error || 'Failed to record stock adjustment', 'error');
            }
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };

    // Dynamic calculations from server KPI master metrics
    const totalCatalogItems = kpis.total_items || totalServerItems;
    const totalUnitsOnHand = kpis.total_quantity || 0;
    const lowStockCount = kpis.low_stock_count || 0;
    const outOfStockCount = kpis.out_of_stock_count || 0;
    const totalValuation = kpis.total_valuation || 0;
    const inStockCount = Math.max(0, totalCatalogItems - lowStockCount - outOfStockCount);

    // Active stock items for current page (Server-Side Paginated)
    const filteredStocks = stocks;
    const paginatedStocks = stocks;
    const totalPages = Math.max(1, totalServerPages);
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startItemIndex = totalServerItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
    const endItemIndex = Math.min(validCurrentPage * pageSize, totalServerItems);

    return (
        <div className="space-y-2.5 sm:space-y-3 pb-8">
            {/* TOP HEADER: Title & Action Triggers */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-2.5 sm:p-3 rounded-xl border border-gray-200 shadow-2xs gap-2.5">
                <div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h1 className="text-xs sm:text-sm font-bold text-gray-900 tracking-tight leading-none flex items-center gap-1.5">
                            <IconInventory className="w-4 h-4 text-gray-700" />
                            <span>Inventory & Warehouse Stock Management</span>
                        </h1>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5">
                        Real-time warehouse stock tracking, packaging conversions, reorder alerts, and stock audits
                    </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <button
                        onClick={handleOpenAddItemModal}
                        className="px-3 py-1 bg-black hover:bg-gray-800 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                    >
                        <IconPlus className="w-3.5 h-3.5 text-white" />
                        <span>+ Add Item</span>
                    </button>

                    <button
                        onClick={() => setAddSupplierModalOpen(true)}
                        className="px-2.5 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg font-semibold text-[11px] transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                        <IconSuppliers className="w-3.5 h-3.5 text-gray-500" />
                        <span>+ Add Supplier</span>
                    </button>
                </div>
            </div>

            {/* 5 KPI SUMMARY CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {/* KPI 1: Stock Valuation */}
                <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-blue-100 hover:border-blue-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Stock Valuation</span>
                        <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <IconInventory className="w-3 h-3" />
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <div className="text-sm sm:text-base font-black text-gray-900 tracking-tight">
                            Rs. {Math.round(totalValuation).toLocaleString()}
                        </div>
                        <div className="text-[8.5px] sm:text-[9px] text-gray-400 font-medium mt-0.5">
                            At purchase cost
                        </div>
                    </div>
                </div>

                {/* KPI 2: Total Items Catalog */}
                <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-indigo-100 hover:border-indigo-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Total SKUs</span>
                        <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <IconProducts className="w-3 h-3" />
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <div className="text-sm sm:text-base font-black text-gray-900 tracking-tight">
                            {totalCatalogItems} Products
                        </div>
                        <div className="text-[8.5px] sm:text-[9px] text-gray-400 font-medium mt-0.5">
                            Registered variants
                        </div>
                    </div>
                </div>

                {/* KPI 3: Units in Stock */}
                <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-emerald-100 hover:border-emerald-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider text-gray-500">In Stock Units</span>
                        <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <IconCheck className="w-3 h-3" />
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <div className="text-sm sm:text-base font-black text-emerald-700 tracking-tight">
                            {totalUnitsOnHand.toLocaleString()}
                        </div>
                        <div className="text-[8.5px] sm:text-[9px] text-gray-400 font-medium mt-0.5">
                            Total warehouse units
                        </div>
                    </div>
                </div>

                {/* KPI 4: Low Stock Alert */}
                <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-amber-100 hover:border-amber-300 shadow-2xs transition-all flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Low Stock</span>
                        <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <IconWarning className="w-3 h-3" />
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <div className="text-sm sm:text-base font-black text-amber-600 tracking-tight">
                            {lowStockCount} Items
                        </div>
                        <div className="text-[8.5px] sm:text-[9px] text-gray-400 font-medium mt-0.5">
                            Below reorder point
                        </div>
                    </div>
                </div>

                {/* KPI 5: Out of Stock */}
                <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-rose-100 hover:border-rose-300 shadow-2xs transition-all flex flex-col justify-between col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Out of Stock</span>
                        <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                            <IconClose className="w-3 h-3" />
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <div className="text-sm sm:text-base font-black text-rose-600 tracking-tight">
                            {outOfStockCount} Items
                        </div>
                        <div className="text-[8.5px] sm:text-[9px] text-gray-400 font-medium mt-0.5">
                            Zero warehouse stock
                        </div>
                    </div>
                </div>
            </div>

            {/* SEARCH & FILTERS BAR */}
            <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 w-full">
                    {/* Search Bar */}
                    <div className="relative w-full md:max-w-xs">
                        <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search item, variant, SKU, barcode..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-400 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                            >
                                <IconClose className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {/* Category Selector */}
                        <div className="shrink-0">
                            <select
                                value={selectedCategoryFilter}
                                onChange={(e) => {
                                    setSelectedCategoryFilter(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[10.5px] font-semibold text-gray-700 outline-none cursor-pointer"
                            >
                                <option value="ALL">All Categories</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.name}>
                                        {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Stock Status Buttons */}
                        <div className="flex items-center p-0.5 bg-gray-100 rounded-lg border border-gray-200 text-[10px] font-semibold overflow-x-auto max-w-full shrink-0">
                            <button
                                onClick={() => {
                                    setStockStatusFilter('ALL');
                                    setCurrentPage(1);
                                }}
                                className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                                    stockStatusFilter === 'ALL'
                                        ? 'bg-black text-white font-bold shadow-2xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                All ({totalCatalogItems})
                            </button>
                            <button
                                onClick={() => {
                                    setStockStatusFilter('IN_STOCK');
                                    setCurrentPage(1);
                                }}
                                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                    stockStatusFilter === 'IN_STOCK'
                                        ? 'bg-emerald-700 text-white font-bold shadow-2xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                In Stock ({inStockCount})
                            </button>
                            <button
                                onClick={() => {
                                    setStockStatusFilter('LOW_STOCK');
                                    setCurrentPage(1);
                                }}
                                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                    stockStatusFilter === 'LOW_STOCK'
                                        ? 'bg-amber-600 text-white font-bold shadow-2xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                Low Stock ({lowStockCount})
                            </button>
                            <button
                                onClick={() => {
                                    setStockStatusFilter('OUT_OF_STOCK');
                                    setCurrentPage(1);
                                }}
                                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                                    stockStatusFilter === 'OUT_OF_STOCK'
                                        ? 'bg-rose-700 text-white font-bold shadow-2xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                Out of Stock ({outOfStockCount})
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* FULL-WIDTH STOCK CONTAINER */}
            <div className="bg-slate-50/70 rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="p-3 sm:p-4 bg-white border-b border-gray-200/80 flex items-center justify-between text-[11px]">
                    <div>
                        <h2 className="font-bold text-sm text-gray-900 tracking-tight">Warehouse Inventory Register</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Current balances, packaging conversions, reorder triggers & movements
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-700 bg-gray-100/90 border border-gray-200 px-2.5 py-1 rounded-lg">
                            {totalServerItems} Items Listed
                        </span>
                        {totalPages > 1 && (
                            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
                                Page {validCurrentPage} of {totalPages}
                            </span>
                        )}
                        {tableLoading && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" title="Loading..."></span>
                        )}
                    </div>
                </div>

                {/* 1. MOBILE RESPONSIVE CARD VIEW (SHOWN ON MOBILE SCREENS < md) */}
                <div className="block md:hidden p-3 space-y-3 bg-slate-50/60">
                    {filteredStocks.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 bg-white rounded-xl border border-gray-200 shadow-xs">
                            <IconInventory className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                            <div className="font-bold text-xs text-gray-700">No inventory items found</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">No matching stock items for selected criteria</div>
                        </div>
                    ) : (
                        paginatedStocks.map((item) => {
                            const isOut = item.current_stock <= 0;
                            const isLow = item.current_stock <= item.minimum_stock && item.current_stock > 0;
                            const itemValuation = calculateStockValuation(item);
                            const isNonStandardVariant = item.variant_name && item.variant_name.toLowerCase() !== 'standard' && item.variant_name.toLowerCase() !== item.product_name.toLowerCase();
                            const stockInfo = formatStockBreakdown(item);

                            return (
                                <div 
                                    key={item.variant_id} 
                                    className="p-3.5 space-y-2.5 bg-white rounded-xl border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all"
                                >
                                    {/* Top Row: Product Name + Category + Status */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-bold text-gray-900 text-xs sm:text-sm">
                                                {item.product_name}
                                                {isNonStandardVariant && (
                                                    <span className="text-[10px] text-blue-700 bg-blue-50 font-semibold px-1.5 py-0.5 rounded border border-blue-200/60 ml-1">
                                                        {item.variant_name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[9.5px] font-semibold text-slate-700">
                                                    {item.category_name}
                                                </span>
                                                {item.is_essential ? (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-[9px] font-black text-amber-900 flex items-center gap-0.5 shadow-2xs">
                                                        ★ Essential
                                                    </span>
                                                ) : null}
                                                <span className="text-[9.5px] text-gray-400 font-mono">
                                                    {item.sku}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            {isOut ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Out of Stock
                                                </span>
                                            ) : isLow ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Low Stock
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> In Stock
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Middle Grid: Stock & Valuation */}
                                    <div className="grid grid-cols-3 gap-1.5 bg-slate-50/80 p-2 rounded-xl border border-slate-200/60 text-[10px]">
                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold tracking-wider">Current Stock</div>
                                            <div className={`font-black text-xs leading-tight mt-0.5 ${
                                                isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-700'
                                            }`}>
                                                {stockInfo.hasBulk ? stockInfo.breakdownStr : `${Number(item.current_stock).toLocaleString()} ${item.unit_symbol || 'Units'}`}
                                            </div>
                                            {stockInfo.hasBulk && (
                                                <div className="text-[9px] text-gray-400 font-medium">
                                                    {Number(stockInfo.totalPcs).toLocaleString()} {stockInfo.unitName}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold tracking-wider">Valuation</div>
                                            <div className="font-black text-gray-900 text-xs font-mono leading-tight mt-0.5">
                                                Rs. {Math.round(itemValuation).toLocaleString()}
                                            </div>
                                            <div className="text-[8.5px] text-gray-400">At cost</div>
                                        </div>

                                        <div>
                                            <div className="text-gray-400 uppercase text-[8px] font-bold tracking-wider">Min / Reorder</div>
                                            <div className="font-bold text-gray-800 text-xs leading-tight mt-0.5">
                                                {item.minimum_stock || 10} / <span className="text-amber-700 font-black">{item.reorder_level || 20}</span>
                                            </div>
                                            <div className="text-[8.5px] text-gray-400">Units</div>
                                        </div>
                                    </div>

                                    {/* Packaging Rates Preview */}
                                    {item.packagings && item.packagings.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                            {item.packagings.map((pk, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-[9.5px] text-gray-700 font-mono border border-slate-200/80">
                                                    <span className="font-bold text-gray-900">{pk.packaging_name}</span>
                                                    <span className="text-gray-400">x{pk.conversion_factor}</span>
                                                    <span className="text-emerald-700 font-extrabold">Rs.{Number(pk.selling_price || 0).toLocaleString()}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Actions Row */}
                                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                        <span className="text-[10px] text-gray-400 font-medium">Quick Operations</span>
                                        <button
                                            type="button"
                                            onClick={() => setActionModalItem(item)}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px] border border-slate-200/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                                        >
                                            <IconDotsVertical className="w-3.5 h-3.5 text-slate-700" />
                                            <span>Actions Menu</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 2. DESKTOP / TABLET DATA TABLE (VISIBLE ON md+ SCREENS) */}
                <div className="hidden md:block overflow-x-auto w-full p-3 sm:p-4">
                    <table className="w-full text-left text-xs border-separate border-spacing-y-2.5">
                        <thead>
                            <tr className="text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                                <th className="pb-1 px-3.5 min-w-[190px]">Product</th>
                                <th className="pb-1 px-3.5 min-w-[140px] text-center">Current Stock</th>
                                <th className="pb-1 px-3.5 min-w-[260px]">Packaging & Rates</th>
                                <th className="pb-1 px-3.5 min-w-[105px] text-center">Min / Reorder</th>
                                <th className="pb-1 px-3.5 min-w-[110px] text-right">Valuation</th>
                                <th className="pb-1 px-3.5 min-w-[100px] text-center">Status</th>
                                <th className="pb-1 px-2.5 w-16 min-w-[64px] text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStocks.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200/80 shadow-xs">
                                        <IconInventory className="w-9 h-9 mx-auto text-gray-300 mb-2" />
                                        <div className="text-sm font-bold text-gray-700">No inventory stock items matching criteria</div>
                                        <div className="text-xs text-gray-400 mt-1">Try adjusting your search query or filters above</div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedStocks.map((item) => {
                                    const isOut = item.current_stock <= 0;
                                    const isLow = item.current_stock <= item.minimum_stock && item.current_stock > 0;
                                    const itemValuation = calculateStockValuation(item);
                                    const isNonStandardVariant = item.variant_name && item.variant_name.toLowerCase() !== 'standard' && item.variant_name.toLowerCase() !== item.product_name.toLowerCase();

                                    return (
                                        <tr 
                                            key={item.variant_id} 
                                            className="bg-white hover:bg-blue-50/20 transition-all duration-200 group shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
                                        >
                                            {/* Column 1: Product & SKU */}
                                            <td className="py-3 px-3.5 bg-white group-hover:bg-blue-50/20 border-y border-l border-gray-200/80 group-hover:border-blue-200/80 rounded-l-xl transition-all duration-150">
                                                <div className="space-y-1">
                                                    <div className="font-bold text-gray-900 text-xs sm:text-[13px] leading-snug">
                                                        {item.product_name}
                                                        {isNonStandardVariant && (
                                                            <span className="text-[10px] text-blue-700 bg-blue-50 font-semibold px-1.5 py-0.5 rounded border border-blue-200/60 ml-1.5">
                                                                {item.variant_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[10px] font-semibold text-slate-700">
                                                            {item.category_name}
                                                        </span>
                                                        {item.is_essential ? (
                                                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-[9.5px] font-black text-amber-900 flex items-center gap-0.5 shadow-2xs">
                                                                ★ Essential
                                                            </span>
                                                        ) : null}
                                                        <span className="text-[10px] text-gray-400 font-mono tracking-wider">
                                                            {item.sku}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Column 2: Current Stock */}
                                            <td className="py-3 px-3.5 text-center bg-white group-hover:bg-blue-50/20 border-y border-gray-200/80 group-hover:border-blue-200/80 transition-all duration-150">
                                                {(() => {
                                                    const stockInfo = formatStockBreakdown(item);
                                                    const badgeBg = isOut ? 'bg-rose-50/80 border-rose-200/70 text-rose-700' : isLow ? 'bg-amber-50/80 border-amber-200/70 text-amber-800' : 'bg-emerald-50/70 border-emerald-200/60 text-emerald-800';
                                                    return (
                                                        <div className="inline-flex flex-col items-center">
                                                            <div className={`px-2.5 py-1 rounded-lg border font-black text-xs tracking-tight ${badgeBg}`}>
                                                                {stockInfo.hasBulk ? stockInfo.breakdownStr : `${Number(item.current_stock).toLocaleString()} ${item.unit_symbol || item.unit_name || 'Units'}`}
                                                            </div>
                                                            {stockInfo.hasBulk && (
                                                                <div className="text-[9.5px] text-gray-400 font-medium mt-0.5">
                                                                    {Number(stockInfo.totalPcs).toLocaleString()} {stockInfo.unitName} total
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* Column 3: Packaging & Rates */}
                                            <td className="py-3 px-3.5 bg-white group-hover:bg-blue-50/20 border-y border-gray-200/80 group-hover:border-blue-200/80 transition-all duration-150">
                                                <div className="space-y-1">
                                                    {item.packagings && item.packagings.length > 0 ? (
                                                        item.packagings.map((pk, idx) => (
                                                            <div 
                                                                key={idx}
                                                                className="flex items-center justify-between gap-2.5 text-[10.5px] py-1 px-2 rounded-lg bg-slate-50/80 border border-slate-200/60 transition-colors"
                                                            >
                                                                <div className="flex items-center gap-1.5 min-w-[95px]">
                                                                    <span className="font-bold text-gray-900">{pk.packaging_name}</span>
                                                                    <span className="text-[9px] text-gray-500 font-mono bg-white px-1 py-0.2 rounded border border-gray-200">x{pk.conversion_factor}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2.5 text-right font-mono text-[10.5px]">
                                                                    <span className="text-gray-500 text-[10px]">
                                                                        Cost: <strong className="text-gray-700 font-semibold">Rs.{Number(pk.purchase_price || 0).toLocaleString()}</strong>
                                                                    </span>
                                                                    <span className="font-extrabold text-emerald-700 text-[11px] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                                                                        Sell: Rs.{Number(pk.selling_price || 0).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <span className="text-gray-400 text-[10.5px] italic">1 {item.unit_name || 'Piece'} (Standard)</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Column 4: Min / Reorder */}
                                            <td className="py-3 px-3.5 text-center bg-white group-hover:bg-blue-50/20 border-y border-gray-200/80 group-hover:border-blue-200/80 transition-all duration-150">
                                                <div className="inline-flex items-center gap-1 font-bold text-xs text-gray-800 bg-gray-50/80 px-2 py-1 rounded-lg border border-gray-200/60">
                                                    <span>{item.minimum_stock || 10}</span>
                                                    <span className="text-gray-300 font-normal">/</span>
                                                    <span className="text-amber-700 font-extrabold">{item.reorder_level || 20}</span>
                                                </div>
                                                <div className="text-[9px] text-gray-400 uppercase tracking-wider font-medium mt-0.5">
                                                    Min / Reorder
                                                </div>
                                            </td>

                                            {/* Column 5: Valuation */}
                                            <td className="py-3 px-3.5 text-right bg-white group-hover:bg-blue-50/20 border-y border-gray-200/80 group-hover:border-blue-200/80 transition-all duration-150">
                                                <div className="font-black text-xs sm:text-[13px] text-gray-900 font-mono tracking-tight">
                                                    Rs. {Math.round(itemValuation).toLocaleString()}
                                                </div>
                                                <div className="text-[9px] text-gray-400 font-medium">
                                                    At cost
                                                </div>
                                            </td>

                                            {/* Column 6: Status */}
                                            <td className="py-3 px-3.5 text-center bg-white group-hover:bg-blue-50/20 border-y border-gray-200/80 group-hover:border-blue-200/80 transition-all duration-150">
                                                {isOut ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                                                        Out of Stock
                                                    </span>
                                                ) : isLow ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                        Low Stock
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                                        In Stock
                                                    </span>
                                                )}
                                            </td>

                                            {/* Column 7: Actions */}
                                            <td className="py-3 px-2.5 text-center bg-white group-hover:bg-blue-50/20 border-y border-r border-gray-200/80 group-hover:border-blue-200/80 rounded-r-xl transition-all duration-150">
                                                <div className="flex items-center justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActionModalItem(item)}
                                                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200/90 transition-all flex items-center justify-center cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                                                        title="Click to view all actions"
                                                    >
                                                        <IconDotsVertical className="w-4 h-4 text-slate-700" />
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
                            Showing <strong className="text-gray-900 font-bold">{startItemIndex}</strong> to <strong className="text-gray-900 font-bold">{endItemIndex}</strong> of <strong className="text-gray-900 font-bold">{totalServerItems}</strong> items
                        </span>
                        {(searchQuery || selectedCategoryFilter !== 'ALL' || stockStatusFilter !== 'ALL') && totalServerItems < totalCatalogItems && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                                (filtered from {totalCatalogItems})
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

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL: ITEM ROW ACTIONS MODAL (CLICKED FROM 3-DOTS)           */}
            {/* ───────────────────────────────────────────────────────────── */}
            {actionModalItem && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[75] p-3 sm:p-4 animate-in fade-in duration-150"
                    onClick={() => setActionModalItem(null)}
                >
                    <div 
                        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden transform transition-all"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-gray-100 bg-slate-50/80 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md bg-blue-100/90 text-blue-800 text-[10px] font-bold uppercase tracking-wider">
                                        Item Actions
                                    </span>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {actionModalItem.sku}
                                    </span>
                                </div>
                                <h3 className="font-extrabold text-gray-900 text-sm sm:text-base mt-1 truncate">
                                    {actionModalItem.product_name}
                                </h3>
                                {actionModalItem.variant_name && actionModalItem.variant_name.toLowerCase() !== 'standard' && (
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                        Variant: <span className="font-semibold text-gray-800">{actionModalItem.variant_name}</span>
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setActionModalItem(null)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors cursor-pointer"
                                title="Close"
                            >
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Quick Info Bar */}
                        <div className="px-4 py-2 bg-slate-100/60 border-b border-gray-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">In-Hand Stock:</span>
                                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                    {formatStockBreakdown(actionModalItem).breakdownStr || `${actionModalItem.current_stock} Units`}
                                </span>
                            </div>
                            <div className="text-gray-500 font-mono text-[11px]">
                                Val: <strong className="text-gray-900">Rs. {Math.round(calculateStockValuation(actionModalItem)).toLocaleString()}</strong>
                            </div>
                        </div>

                        {/* Modal Action Buttons List */}
                        <div className="p-3.5 space-y-2">
                            {/* 1. Inward Stock Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const item = actionModalItem;
                                    setActionModalItem(null);
                                    handleOpenInwardForVariant(item);
                                }}
                                className="w-full p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200/80 transition-all flex items-center justify-between gap-3 group cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                        <IconBill className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-emerald-950">Inward Stock</div>
                                        <div className="text-[10.5px] text-emerald-700">Receive new purchase / inward quantity</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-emerald-800 shrink-0 flex items-center gap-1">Inward <IconArrowRight className="w-3.5 h-3.5" /></span>
                            </button>

                            {/* 2. Movements Ledger Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const item = actionModalItem;
                                    setActionModalItem(null);
                                    handleOpenMovementsModal(item);
                                }}
                                className="w-full p-2.5 rounded-xl bg-white hover:bg-slate-50 text-gray-800 border border-gray-200 transition-all flex items-center justify-between gap-3 group cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-gray-700 flex items-center justify-center shrink-0 border border-gray-200 group-hover:bg-slate-200 transition-colors">
                                        <IconEye className="w-4 h-4 text-gray-600" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-gray-900">Movements Ledger</div>
                                        <div className="text-[10.5px] text-gray-500">View complete audit trail of inward, sales, and transfers</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-gray-600 shrink-0 flex items-center gap-1">View <IconArrowRight className="w-3.5 h-3.5" /></span>
                            </button>

                            {/* 3. Adjustment / Damage Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const item = actionModalItem;
                                    setActionModalItem(null);
                                    handleOpenAdjustmentForVariant(item);
                                }}
                                className="w-full p-2.5 rounded-xl bg-amber-50/70 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition-all flex items-center justify-between gap-3 group cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                        <IconWarning className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-amber-950">Stock Adjustment / Damage</div>
                                        <div className="text-[10.5px] text-amber-700">Reconcile physical counts, damage, or loss</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-amber-800 shrink-0 flex items-center gap-1">Adjust <IconArrowRight className="w-3.5 h-3.5" /></span>
                            </button>

                            {/* 4. Edit Product Item Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const item = actionModalItem;
                                    setActionModalItem(null);
                                    handleOpenEditItemModal(item);
                                }}
                                className="w-full p-2.5 rounded-xl bg-blue-50/70 hover:bg-blue-100 text-blue-900 border border-blue-200/80 transition-all flex items-center justify-between gap-3 group cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                        <IconEdit className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-blue-950">Edit Product & Packaging</div>
                                        <div className="text-[10.5px] text-blue-700">Modify name, packaging, prices, barcodes</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-blue-800 shrink-0 flex items-center gap-1">Edit <IconArrowRight className="w-3.5 h-3.5" /></span>
                            </button>

                            {/* 5. Delete Item Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    const item = actionModalItem;
                                    setActionModalItem(null);
                                    handleDeleteItem(item);
                                }}
                                className="w-full p-2.5 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-rose-900 border border-rose-200/80 transition-all flex items-center justify-between gap-3 group cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                        <IconTrash className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-rose-950">Delete Product</div>
                                        <div className="text-[10.5px] text-rose-700">Permanently delete this product item</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-rose-700 shrink-0 flex items-center gap-1">Delete <IconArrowRight className="w-3.5 h-3.5" /></span>
                            </button>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-slate-50 border-t border-gray-100 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setActionModalItem(null)}
                                className="px-4 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold border border-gray-200 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 1: STOCK MOVEMENTS AUDIT TRAIL LEDGER                   */}
            {/* ───────────────────────────────────────────────────────────── */}
            {movementsModalOpen && selectedVariant && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-2 sm:p-4">
                    <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
                        {/* Header */}
                        <div className="p-3.5 sm:p-4 border-b border-gray-100 bg-gray-50/80 flex items-start justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-1.5">
                                    <IconInventory className="w-4 h-4 text-gray-700" />
                                    <span>Stock Movement Ledger: {selectedVariant.product_name}</span>
                                </h3>
                                <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                                    <span>Variant: <strong className="text-gray-800">{selectedVariant.variant_name}</strong></span>
                                    <span>•</span>
                                    <span>Stock In-Hand: <strong className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{formatStockBreakdown(selectedVariant).formatted}</strong></span>
                                    <span>•</span>
                                    <span className="font-mono text-gray-500">SKU: {selectedVariant.sku}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleOpenInwardForVariant(selectedVariant)}
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                                >
                                    + Inward Stock
                                </button>
                                <button
                                    onClick={() => setMovementsModalOpen(false)}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
                                >
                                    <IconClose className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Movements Table */}
                        <div className="flex-1 overflow-y-auto p-4 min-h-0">
                            {movements.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 text-xs">
                                    No stock movements recorded for this item yet. Use "Inward Stock" to add quantity.
                                </div>
                            ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                                            <th className="p-2.5">Date & Time</th>
                                            <th className="p-2.5">Movement Type</th>
                                            <th className="p-2.5">Packaging Type</th>
                                            <th className="p-2.5 text-right">Quantity</th>
                                            <th className="p-2.5 text-right">Base Eq. Qty</th>
                                            <th className="p-2.5">User / Cashier</th>
                                            <th className="p-2.5">Reference / Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {movements.map((m) => {
                                            const isIn = m.movement_type === 'PURCHASE' || (m.movement_type === 'ADJUSTMENT' && m.equivalent_qty > 0);
                                            return (
                                                <tr key={m.id} className="hover:bg-gray-50/50">
                                                    <td className="p-2.5 text-gray-600">
                                                        {new Date(m.created_at).toLocaleString()}
                                                    </td>
                                                    <td className="p-2.5">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                            m.movement_type === 'PURCHASE' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                                            m.movement_type === 'SALE' ? 'bg-amber-50 text-[#B8860B] border border-amber-200' :
                                                            m.movement_type === 'DAMAGE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                            'bg-amber-50 text-amber-800 border border-amber-200'
                                                        }`}>
                                                            {m.movement_type}
                                                        </span>
                                                    </td>
                                                    <td className="p-2.5 font-semibold text-gray-700">
                                                        {m.packaging_name || 'Base Unit'}
                                                    </td>
                                                    <td className="p-2.5 text-right font-bold text-gray-900">
                                                        {m.quantity}
                                                    </td>
                                                    <td className={`p-2.5 text-right font-black ${isIn ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                        {isIn ? `+${m.equivalent_qty}` : `-${m.equivalent_qty}`}
                                                    </td>
                                                    <td className="p-2.5 text-gray-600">
                                                        {m.username || 'System'}
                                                    </td>
                                                    <td className="p-2.5 text-gray-500 font-mono text-[11px]">
                                                        {m.reference_id || m.notes || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setMovementsModalOpen(false)}
                                className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                            >
                                Close Ledger
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 2: INWARD STOCK FROM SUPPLIER                           */}
            {/* ───────────────────────────────────────────────────────────── */}
            {inwardModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-4 overflow-y-auto" style={{ zIndex: 100 }}>
                    <form onSubmit={handleSaveInwardStock} className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#F3E5AB] max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3.5 shrink-0">
                            <div>
                                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                                    <IconBill className="w-5 h-5 text-[#B8860B]" />
                                    <span>Inward Stock from Supplier</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Record incoming vendor stock invoice to increase physical warehouse inventory & update supplier ledger
                                </p>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setInwardModalOpen(false)} 
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white p-1.5 rounded-xl cursor-pointer hover:opacity-90 transition-all"
                            >
                                <IconClose className="w-5 h-5" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <div className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
                            {/* 2-Column Inputs Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Left Column: Supplier & Invoice Details */}
                                <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
                                    <div className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                        <IconSuppliers className="w-4 h-4 text-[#B8860B]" />
                                        <span>Supplier & Invoice Information</span>
                                    </div>

                                    {/* Supplier Select */}
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Select Supplier *</label>
                                        <select
                                            required
                                            value={inwardSupplierId}
                                            onChange={(e) => setInwardSupplierId(parseInt(e.target.value))}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-xs bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        >
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} ({s.company_name || 'Vendor'}) — Due: Rs. {Number(s.balance || 0).toLocaleString()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Invoice No */}
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Supplier Bill / Invoice # *</label>
                                        <input
                                            type="text"
                                            required
                                            value={inwardInvoiceNo}
                                            onChange={(e) => setInwardInvoiceNo(e.target.value)}
                                            placeholder="e.g. BILL-90184"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-xs bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        />
                                    </div>

                                    {/* Immediate Paid */}
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Immediate Cash Paid on Bill (Rs.)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={inwardAmountPaid}
                                            onChange={(e) => setInwardAmountPaid(e.target.value)}
                                            placeholder="0 (or direct cash paid at delivery)"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-xs bg-white text-emerald-800 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Right Column: Product & Quantity Specifications */}
                                <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
                                    <div className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                        <IconInventory className="w-4 h-4 text-[#B8860B]" />
                                        <span>Product & Quantity Selection</span>
                                    </div>

                                    {/* Product Item Select */}
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Product Item *</label>
                                        <select
                                            required
                                            value={inwardVariantId}
                                            onChange={(e) => {
                                                const vId = parseInt(e.target.value);
                                                setInwardVariantId(vId);
                                                const item = stocks.find(s => s.variant_id === vId);
                                                if (item?.packagings?.[0]) {
                                                    setInwardPackagingId(item.packagings[0].packaging_type_id);
                                                    setInwardPurchasePrice(item.packagings[0].purchase_price || '1000');
                                                }
                                            }}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-xs bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        >
                                            {stocks.map(s => {
                                                const sb = formatStockBreakdown(s);
                                                return (
                                                    <option key={s.variant_id} value={s.variant_id}>
                                                        {s.product_name} ({s.variant_name}) — Stock: {sb.hasBulk ? `${sb.breakdownStr} (Total: ${sb.totalPcs})` : `${sb.totalPcs} ${sb.unitName}`}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>

                                    {/* Packaging Unit & Inward Qty */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block font-bold text-gray-700 mb-1">Packaging Unit *</label>
                                            {(() => {
                                                const currentItem = stocks.find(s => s.variant_id === inwardVariantId);
                                                const availablePacks = currentItem?.packagings?.length > 0 
                                                    ? currentItem.packagings 
                                                    : packagingTypes.map(pt => ({ packaging_type_id: pt.id, packaging_name: pt.name, conversion_factor: 1, purchase_price: 0 }));
                                                return (
                                                    <select
                                                        value={inwardPackagingId}
                                                        onChange={(e) => {
                                                            const pId = parseInt(e.target.value);
                                                            setInwardPackagingId(pId);
                                                            const pk = availablePacks.find(p => p.packaging_type_id === pId);
                                                            if (pk && pk.purchase_price > 0) {
                                                                setInwardPurchasePrice(String(pk.purchase_price));
                                                            }
                                                        }}
                                                        className="w-full p-2.5 border border-gray-200 rounded-xl font-bold text-xs bg-white text-[#B8860B] focus:outline-none"
                                                    >
                                                        {availablePacks.map(pk => (
                                                            <option key={pk.packaging_type_id} value={pk.packaging_type_id}>
                                                                {pk.packaging_name} {pk.conversion_factor > 1 ? `(x${pk.conversion_factor})` : `(Piece)`} — Rs. {Number(pk.purchase_price || 0).toLocaleString()}
                                                            </option>
                                                        ))}
                                                    </select>
                                                );
                                            })()}
                                        </div>

                                        <div>
                                            {(() => {
                                                const currentItem = stocks.find(s => s.variant_id === inwardVariantId);
                                                const selectedPack = currentItem?.packagings?.find(p => p.packaging_type_id === inwardPackagingId) || currentItem?.packagings?.[0];
                                                return (
                                                    <label className="block font-bold text-gray-700 mb-1">
                                                        Quantity ({selectedPack?.packaging_name || 'Units'}) *
                                                    </label>
                                                );
                                            })()}
                                            <input
                                                type="number"
                                                required
                                                min="1"
                                                value={inwardQuantity}
                                                onChange={(e) => setInwardQuantity(e.target.value)}
                                                placeholder="e.g. 10"
                                                className="w-full p-2.5 border border-gray-200 rounded-xl font-black text-sm text-[#B8860B] bg-white text-center focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                            />
                                        </div>
                                    </div>

                                    {/* Cost Rate */}
                                    <div>
                                        {(() => {
                                            const currentItem = stocks.find(s => s.variant_id === inwardVariantId);
                                            const selectedPack = currentItem?.packagings?.find(p => p.packaging_type_id === inwardPackagingId) || currentItem?.packagings?.[0];
                                            return (
                                                <label className="block font-bold text-gray-700 mb-1">
                                                    Rate Per {selectedPack?.packaging_name || 'Unit'} (Rs.) *
                                                </label>
                                            );
                                        })()}
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            value={inwardPurchasePrice}
                                            onChange={(e) => setInwardPurchasePrice(e.target.value)}
                                            placeholder="e.g. 1000"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-black font-mono text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Wholesale Inward Bill Breakdown Card */}
                            {(() => {
                                const currentItem = stocks.find(s => s.variant_id === inwardVariantId);
                                const selectedPack = currentItem?.packagings?.find(p => p.packaging_type_id === inwardPackagingId) || currentItem?.packagings?.[0];
                                const factor = selectedPack?.conversion_factor || 1;
                                const qty = parseFloat(inwardQuantity || 0);
                                const price = parseFloat(inwardPurchasePrice || 0);
                                const gross = qty * price;
                                const paid = parseFloat(inwardAmountPaid || 0);
                                const pendingDue = Math.max(0, gross - paid);
                                const totalPhysicalUnits = qty * factor;
                                const costPerPiece = totalPhysicalUnits > 0 ? (gross / totalPhysicalUnits) : 0;
                                const unitSymbol = currentItem?.unit_symbol || currentItem?.unit_name || 'pcs';
                                const packName = selectedPack?.packaging_name || 'Unit';

                                // Project new stock on hand
                                const currentOnHand = parseFloat(currentItem?.current_stock || 0);
                                const newOnHand = currentOnHand + totalPhysicalUnits;
                                const projectedStock = formatStockBreakdown({ ...currentItem, current_stock: newOnHand });

                                return (
                                    <div className="bg-[#FEF9E7] p-4 sm:p-5 rounded-2xl border border-[#F3E5AB] space-y-3.5 text-xs">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F3E5AB] pb-2.5">
                                            <span className="font-black text-[#B8860B] uppercase text-xs tracking-wider flex items-center gap-1.5">
                                                <IconReceipt className="w-4 h-4 text-[#B8860B]" />
                                                <span>Supplier Bill & Stock Inward Summary</span>
                                            </span>
                                            <span className="font-bold text-xs text-gray-600 bg-white px-3 py-1 rounded-lg border border-[#F3E5AB]">
                                                Packaging Conversion: 1 {packName} = {factor} {unitSymbol}
                                            </span>
                                        </div>

                                        {/* 4 Financial KPI Cards */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                            <div className="bg-white p-3 rounded-2xl border border-[#F3E5AB] shadow-xs">
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">Rate per {packName}</div>
                                                <div className="text-base font-black text-[#B8860B] font-mono mt-0.5">Rs. {price.toLocaleString()}</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-2xl border border-[#F3E5AB] shadow-xs">
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">Cost per {unitSymbol}</div>
                                                <div className="text-base font-black text-blue-700 font-mono mt-0.5">Rs. {Number(costPerPiece.toFixed(2)).toLocaleString()}</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-2xl border border-[#F3E5AB] shadow-xs">
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">Physical Added</div>
                                                <div className="text-base font-black text-emerald-700 mt-0.5">+{totalPhysicalUnits} {unitSymbol}</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-2xl border border-[#F3E5AB] shadow-xs">
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">Total Bill Value</div>
                                                <div className="text-base font-black text-gray-900 font-mono mt-0.5">Rs. {gross.toLocaleString()}</div>
                                            </div>
                                        </div>

                                        {/* Projected Warehouse Balance Banner */}
                                        <div className="bg-white p-3 rounded-2xl border border-[#F3E5AB] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="text-xs text-gray-700 font-bold flex items-center gap-1.5">
                                                <IconInventory className="w-4 h-4 text-[#B8860B]" />
                                                <span>Warehouse Stock After Inward:</span>
                                            </div>
                                            <div className="font-black text-sm text-[#B8860B] bg-[#FEF9E7] px-3 py-1 rounded-xl border border-[#F3E5AB]">
                                                {projectedStock.hasBulk ? `${projectedStock.breakdownStr} (Total: ${newOnHand} ${unitSymbol})` : `${newOnHand} ${unitSymbol}`}
                                            </div>
                                        </div>

                                        {/* Ledger Impact */}
                                        <div className="flex flex-wrap justify-between items-center pt-1 text-xs border-t border-[#F3E5AB]">
                                            <span className="font-bold text-gray-700">Pending Amount Added to Supplier Ledger:</span>
                                            <span className="text-base font-black text-rose-600 font-mono">
                                                Rs. {pendingDue.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Action Buttons: Solid Black Background with White Text */}
                        <div className="flex gap-3 pt-3 border-t border-gray-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setInwardModalOpen(false)}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center hover:opacity-90"
                            >
                                <span style={{ color: '#ffffff' }}>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 hover:opacity-90"
                            >
                                <IconCheck className="w-4 h-4" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                <span style={{ color: '#ffffff' }}>Save & Inward Stock Bill</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 3: + ADD NEW PRODUCT ITEM (Starts with 0 Stock)         */}
            {/* ───────────────────────────────────────────────────────────── */}
            {addItemModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-4 overflow-y-auto" style={{ zIndex: 100 }}>
                    <form onSubmit={handleSaveNewItem} className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#F3E5AB] max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3.5 shrink-0">
                            <div>
                                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                                    <IconProducts className="w-5 h-5 text-[#B8860B]" />
                                    <span>Define Wholesale Product & Packaging Hierarchy</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Auto barcodes, dual Carton & Piece pricing, conversion ratios & 0 initial stock (Inwarded from suppliers)
                                </p>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setAddItemModalOpen(false)} 
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white p-1.5 rounded-xl cursor-pointer hover:opacity-90 transition-all"
                            >
                                <IconClose className="w-5 h-5" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <div className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
                            {/* Section 1: Basic Product Information */}
                            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-black uppercase text-[#B8860B] tracking-wider flex items-center gap-1.5">
                                        <span>1. Basic Product & Base Unit</span>
                                    </div>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-xl text-amber-950 font-bold hover:bg-amber-100 transition-colors shadow-2xs">
                                        <input
                                            type="checkbox"
                                            checked={newIsEssential}
                                            onChange={(e) => setNewIsEssential(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer"
                                        />
                                        <span className="text-[11px] flex items-center gap-1">
                                            <span className="text-amber-600">★</span> Essential Item
                                        </span>
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Product Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={newProductName}
                                            onChange={(e) => setNewProductName(e.target.value)}
                                            placeholder="e.g. Sugar / Lays Chips / Oil Gallon"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Variant / Size Label *</label>
                                        <input
                                            type="text"
                                            required
                                            value={newVariantName}
                                            onChange={(e) => setNewVariantName(e.target.value)}
                                            placeholder="e.g. 40kg Bag / 50g / 300ml / Standard"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Category *</label>
                                        <select
                                            value={newCategoryId}
                                            onChange={(e) => setNewCategoryId(parseInt(e.target.value))}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        >
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Base Measurement Unit *</label>
                                        <select
                                            value={newBaseUnitId}
                                            onChange={(e) => setNewBaseUnitId(parseInt(e.target.value))}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                                        >
                                            {units.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.symbol || 'Unit'}){u.description ? ` — ${u.description}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="font-bold text-gray-700">Individual Unit / Piece Barcode</label>
                                        <button
                                            type="button"
                                            onClick={() => setNewBaseBarcode(generateBarcode('896'))}
                                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                            className="btn-black !bg-black !text-white px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-90"
                                        >
                                            <IconBolt className="w-3 h-3 text-white" />
                                            <span style={{ color: '#ffffff' }}>Auto Generate</span>
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newBaseBarcode}
                                            onChange={(e) => setNewBaseBarcode(e.target.value)}
                                            placeholder="Auto-generated barcode"
                                            className="flex-1 p-2.5 border border-gray-200 rounded-xl font-mono text-xs font-bold text-gray-900 bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setNewBaseBarcode(generateBarcode('896'))}
                                            style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                            className="btn-black !bg-black !text-white px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1 hover:opacity-90"
                                        >
                                            <IconSync className="w-3.5 h-3.5" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                            <span style={{ color: '#ffffff' }}>Regenerate</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Wholesale Packaging Tier Configuration */}
                            {(() => {
                                const selectedBulkPack = packagingTypes.find(p => p.id === parseInt(newBulkPackagingTypeId));
                                const bulkPackName = selectedBulkPack?.name || 'Carton';
                                const selectedInnerPack = packagingTypes.find(p => p.id === parseInt(newInnerPackagingTypeId));
                                const innerPackName = selectedInnerPack?.name || 'Packet';
                                const selectedBaseUnit = units.find(u => u.id === parseInt(newBaseUnitId));
                                const baseUnitName = selectedBaseUnit?.name || 'Pieces';
                                const baseUnitSymbol = selectedBaseUnit?.symbol || baseUnitName || 'Unit';

                                const totalCartonPieces = hasInnerPackaging 
                                    ? ((parseFloat(newCartonPacketsCount) || 1) * (parseFloat(newInnerPiecesCount) || 1))
                                    : (parseFloat(newConversionFactor) || 1);

                                return (
                                    <>
                                        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#F3E5AB] space-y-4 shadow-xs">
                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                                                <div>
                                                    <div className="text-xs font-black uppercase text-[#B8860B] tracking-wider flex items-center gap-1.5">
                                                        <IconLayers className="w-4 h-4 text-[#B8860B]" />
                                                        <span>2. Wholesale Packaging & Bulk Tiers</span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                                        {hasInnerPackaging ? (
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-semibold text-gray-700">3-Tier Wholesale Hierarchy:</span>
                                                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-bold text-[10.5px]">
                                                                    <IconBox className="w-3 h-3 text-amber-700" /> {bulkPackName}
                                                                    <IconArrowRight className="w-2.5 h-2.5 text-amber-500" />
                                                                    <IconPackage className="w-3 h-3 text-blue-700" /> {innerPackName}
                                                                    <IconArrowRight className="w-2.5 h-2.5 text-amber-500" />
                                                                    <IconTag className="w-3 h-3 text-gray-700" /> {baseUnitSymbol}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            `Define wholesale bulk units (e.g. ${bulkPackName} of ${newConversionFactor || 4} ${baseUnitSymbol})`
                                                        )}
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={hasCartonPackaging}
                                                        onChange={(e) => setHasCartonPackaging(e.target.checked)}
                                                        className="w-4 h-4 text-[#B8860B] rounded focus:ring-0 cursor-pointer"
                                                    />
                                                    <span className="font-bold text-gray-800 text-xs">Enable Wholesale Bulk</span>
                                                </label>
                                            </div>

                                            {hasCartonPackaging ? (
                                                <div className="space-y-4 pt-1">
                                                    {/* 3-Tier Multi-Packaging Toggle */}
                                                    <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 p-3 rounded-2xl border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 border border-amber-200">
                                                                <IconLayers className="w-4 h-4 text-amber-800" />
                                                            </div>
                                                            <div>
                                                                <span className="font-extrabold text-amber-950 text-xs inline-flex items-center gap-1.5 flex-wrap">
                                                                    <span>3-Tier Packaging Hierarchy</span>
                                                                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-md">
                                                                        <span>{bulkPackName}</span>
                                                                        <IconArrowRight className="w-2.5 h-2.5 text-amber-700 inline" />
                                                                        <span>{innerPackName}s</span>
                                                                        <IconArrowRight className="w-2.5 h-2.5 text-amber-700 inline" />
                                                                        <span>{baseUnitSymbol}</span>
                                                                    </span>
                                                                </span>
                                                                <p className="text-[10.5px] text-amber-800">
                                                                    Enable when {bulkPackName} contains multiple {innerPackName}s, and each {innerPackName} contains {baseUnitSymbol}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-2xs">
                                                            <input
                                                                type="checkbox"
                                                                checked={hasInnerPackaging}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setHasInnerPackaging(checked);
                                                                    if (checked) {
                                                                        if (!newInnerPackagingTypeId && packagingTypes.length > 0) {
                                                                            const pkt = packagingTypes.find(p => p.name.toLowerCase() === 'packet') || packagingTypes[0];
                                                                            setNewInnerPackagingTypeId(pkt.id);
                                                                        }
                                                                        if (!newInnerBarcode) setNewInnerBarcode(generateBarcode('898'));
                                                                        const pkts = parseFloat(newCartonPacketsCount) || 4;
                                                                        const pcs = parseFloat(newInnerPiecesCount) || 50;
                                                                        setNewConversionFactor(String(pkts * pcs));
                                                                        if (newCartonBuyPrice) {
                                                                            const c = parseFloat(newCartonBuyPrice) || 0;
                                                                            const inBuy = pkts > 0 ? c / pkts : 0;
                                                                            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
                                                                            setNewInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
                                                                            setNewPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
                                                                        }
                                                                        if (newCartonSalePrice) {
                                                                            const s = parseFloat(newCartonSalePrice) || 0;
                                                                            const inSale = pkts > 0 ? s / pkts : 0;
                                                                            const pcSale = pcs > 0 ? inSale / pcs : 0;
                                                                            setNewInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
                                                                            setNewPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
                                                                        }
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-[#B8860B] rounded focus:ring-0 cursor-pointer"
                                                            />
                                                            <span className="font-extrabold text-gray-900 text-xs">Has Inner {innerPackName}s?</span>
                                                        </label>
                                                    </div>

                                                    {/* Hierarchy Configuration */}
                                                    {hasInnerPackaging ? (
                                                        <div className="space-y-3">
                                                            {/* Tier 1 & 2 Units Setup */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-amber-50/40 p-3.5 rounded-2xl border border-amber-200">
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">Outer Bulk Unit</label>
                                                                    <select
                                                                        value={newBulkPackagingTypeId}
                                                                        onChange={(e) => setNewBulkPackagingTypeId(parseInt(e.target.value))}
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 text-xs"
                                                                    >
                                                                        {packagingTypes.map(pt => (
                                                                            <option key={pt.id} value={pt.id}>{pt.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">
                                                                        {innerPackName}s in 1 {bulkPackName} *
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        value={newCartonPacketsCount}
                                                                        onChange={(e) => handleCartonPacketsCountChange(e.target.value)}
                                                                        placeholder="4"
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-black text-xs text-[#B8860B] bg-white text-center"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">Inner Unit Type</label>
                                                                    <select
                                                                        value={newInnerPackagingTypeId}
                                                                        onChange={(e) => setNewInnerPackagingTypeId(parseInt(e.target.value))}
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 text-xs"
                                                                    >
                                                                        {packagingTypes.map(pt => (
                                                                            <option key={pt.id} value={pt.id}>{pt.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">
                                                                        {baseUnitSymbol} in 1 {innerPackName} *
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        value={newInnerPiecesCount}
                                                                        onChange={(e) => handleInnerPiecesCountChange(e.target.value)}
                                                                        placeholder="50"
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-black text-xs text-[#B8860B] bg-white text-center"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Formula Visual Banner */}
                                                            <div className="bg-white p-3 rounded-xl border border-amber-300 shadow-2xs flex items-center justify-between text-xs flex-wrap gap-2">
                                                                <div className="font-extrabold text-gray-800 flex items-center gap-1.5">
                                                                    <IconBox className="w-4 h-4 text-[#B8860B]" />
                                                                    <span>Hierarchy Formula:</span>
                                                                    <span className="text-[#B8860B] font-black">
                                                                        1 {bulkPackName} = {newCartonPacketsCount || 4} {innerPackName}s = {totalCartonPieces} {baseUnitSymbol}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[11px] text-gray-500 font-medium">
                                                                    (Each {innerPackName} = {newInnerPiecesCount || 50} {baseUnitSymbol})
                                                                </span>
                                                            </div>

                                                            {/* Barcodes Grid (Carton Barcode & Packet Barcode) */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                {/* Outer Carton Barcode */}
                                                                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="font-bold text-gray-700 text-xs flex items-center gap-1">
                                                                            <IconBox className="w-3.5 h-3.5 text-amber-700" />
                                                                            <span>Outer {bulkPackName} Barcode</span>
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setNewCartonBarcode(generateBarcode('897'))}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white cursor-pointer hover:opacity-90 flex items-center gap-1"
                                                                        >
                                                                            <IconBolt className="w-2.5 h-2.5 text-white" />
                                                                            <span>Auto</span>
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={newCartonBarcode}
                                                                        onChange={(e) => setNewCartonBarcode(e.target.value)}
                                                                        placeholder={`${bulkPackName} barcode`}
                                                                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                </div>

                                                                {/* Inner Packet Barcode */}
                                                                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="font-bold text-gray-700 text-xs flex items-center gap-1">
                                                                            <IconPackage className="w-3.5 h-3.5 text-blue-700" />
                                                                            <span>Inner {innerPackName} Barcode</span>
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setNewInnerBarcode(generateBarcode('898'))}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white cursor-pointer hover:opacity-90 flex items-center gap-1"
                                                                        >
                                                                            <IconBolt className="w-2.5 h-2.5 text-white" />
                                                                            <span>Auto</span>
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={newInnerBarcode}
                                                                        onChange={(e) => setNewInnerBarcode(e.target.value)}
                                                                        placeholder={`${innerPackName} barcode`}
                                                                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* 3-Tier Synchronized Pricing Cards */}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                {/* 1. Carton Pricing */}
                                                                <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-amber-900 flex items-center gap-1.5">
                                                                            <IconBox className="w-3.5 h-3.5 text-amber-800" />
                                                                            <span>{bulkPackName} (x{totalCartonPieces})</span>
                                                                        </span>
                                                                        {parseFloat(newCartonSalePrice) > parseFloat(newCartonBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(newCartonSalePrice) - parseFloat(newCartonBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newCartonBuyPrice}
                                                                            onChange={(e) => handleBulkBuyChange(e.target.value)}
                                                                            placeholder="e.g. 4000"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newCartonSalePrice}
                                                                            onChange={(e) => handleBulkSaleChange(e.target.value)}
                                                                            placeholder="e.g. 4800"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* 2. Packet Pricing */}
                                                                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-blue-900 flex items-center gap-1.5">
                                                                            <IconPackage className="w-3.5 h-3.5 text-blue-800" />
                                                                            <span>{innerPackName} (x{newInnerPiecesCount || 50})</span>
                                                                        </span>
                                                                        {parseFloat(newInnerSalePrice) > parseFloat(newInnerBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(newInnerSalePrice) - parseFloat(newInnerBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newInnerBuyPrice}
                                                                            onChange={(e) => handleInnerBuyChange(e.target.value)}
                                                                            placeholder="e.g. 1000"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newInnerSalePrice}
                                                                            onChange={(e) => handleInnerSaleChange(e.target.value)}
                                                                            placeholder="e.g. 1200"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* 3. Piece Pricing */}
                                                                <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                                                                            <IconTag className="w-3.5 h-3.5 text-gray-700" />
                                                                            <span>Loose {baseUnitSymbol} (x1)</span>
                                                                        </span>
                                                                        {parseFloat(newPieceSalePrice) > parseFloat(newPieceBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(newPieceSalePrice) - parseFloat(newPieceBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newPieceBuyPrice}
                                                                            onChange={(e) => setNewPieceBuyPrice(e.target.value)}
                                                                            placeholder="e.g. 20"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newPieceSalePrice}
                                                                            onChange={(e) => setNewPieceSalePrice(e.target.value)}
                                                                            placeholder="e.g. 24"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Quick Calculation Helper Buttons */}
                                                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCalculatePieceFromCarton}
                                                                    className="px-3 py-1.5 rounded-xl font-bold text-xs bg-black text-white hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                                                                >
                                                                    <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                    <span>Auto-Calculate {innerPackName} & {baseUnitSymbol} from {bulkPackName}</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCalculateCartonFromPiece}
                                                                    className="px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-800 text-white hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                                                                >
                                                                    <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                    <span>Auto-Calculate {bulkPackName} from {baseUnitSymbol}</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Standard 2-Tier: Bulk Carton + Piece */
                                                        <div className="space-y-4">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200">
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">Bulk Packaging Type</label>
                                                                    <select
                                                                        value={newBulkPackagingTypeId}
                                                                        onChange={(e) => setNewBulkPackagingTypeId(parseInt(e.target.value))}
                                                                        className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900"
                                                                    >
                                                                        {packagingTypes.map(pt => (
                                                                            <option key={pt.id} value={pt.id}>{pt.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">
                                                                        Pieces / Units per {bulkPackName} (Conversion) *
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        value={newConversionFactor}
                                                                        onChange={(e) => handleConversionFactorChange(e.target.value)}
                                                                        placeholder="4"
                                                                        className="w-full p-2.5 border border-gray-200 rounded-xl font-black text-sm text-[#B8860B] bg-white text-center"
                                                                    />
                                                                    <span className="text-[10px] text-gray-500 font-medium mt-1 block">
                                                                        1 {bulkPackName} = {newConversionFactor || 1} {baseUnitName}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Bulk Barcode */}
                                                            <div>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <label className="font-bold text-gray-700 flex items-center gap-1">
                                                                        <IconBox className="w-3.5 h-3.5 text-amber-700" />
                                                                        <span>Bulk / {bulkPackName} Barcode (Outer {bulkPackName})</span>
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setNewCartonBarcode(generateBarcode('897'))}
                                                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                                                        className="btn-black !bg-black !text-white px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-90"
                                                                    >
                                                                        <IconBolt className="w-3 h-3 text-white" />
                                                                        <span style={{ color: '#ffffff' }}>Auto Generate</span>
                                                                    </button>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={newCartonBarcode}
                                                                        onChange={(e) => setNewCartonBarcode(e.target.value)}
                                                                        placeholder={`${bulkPackName} barcode`}
                                                                        className="flex-1 p-2.5 border border-gray-200 rounded-xl font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setNewCartonBarcode(generateBarcode('897'))}
                                                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                                                        className="btn-black !bg-black !text-white px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1 hover:opacity-90"
                                                                    >
                                                                        <IconSync className="w-3.5 h-3.5" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                                                        <span style={{ color: '#ffffff' }}>Regenerate</span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Bulk Pricing Tier */}
                                                            <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-2.5">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                                                        <IconBox className="w-3.5 h-3.5 text-[#B8860B]" />
                                                                        <span>Bulk / {bulkPackName} Pricing (Per {bulkPackName})</span>
                                                                    </span>
                                                                    {parseFloat(newCartonSalePrice) > parseFloat(newCartonBuyPrice) && (
                                                                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                                                                            Profit: +Rs. {(parseFloat(newCartonSalePrice || 0) - parseFloat(newCartonBuyPrice || 0)).toLocaleString()} / {bulkPackName.toLowerCase()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{bulkPackName} Buy / Cost Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newCartonBuyPrice}
                                                                            onChange={(e) => handleBulkBuyChange(e.target.value)}
                                                                            placeholder="e.g. 20000"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{bulkPackName} Wholesale Sale Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newCartonSalePrice}
                                                                            onChange={(e) => handleBulkSaleChange(e.target.value)}
                                                                            placeholder="e.g. 22000"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Auto Calculate Piece Prices Helper Button */}
                                                                <div className="pt-1 flex justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleCalculatePieceFromCarton}
                                                                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                                                        className="btn-black !bg-black !text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5 transition-all hover:opacity-90"
                                                                    >
                                                                        <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                        <span style={{ color: '#ffffff' }}>
                                                                            Auto-Calculate {baseUnitSymbol} Rates
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Individual Piece / Base Unit Pricing Tier */}
                                                            <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-2.5">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                                                        <IconTag className="w-3.5 h-3.5 text-gray-700" />
                                                                        <span>Individual {baseUnitSymbol} / Base Unit Pricing (Per {baseUnitSymbol})</span>
                                                                    </span>
                                                                    {parseFloat(newPieceSalePrice) > parseFloat(newPieceBuyPrice) && (
                                                                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                                                                            Profit: +Rs. {(parseFloat(newPieceSalePrice || 0) - parseFloat(newPieceBuyPrice || 0)).toLocaleString()} / {baseUnitSymbol}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{baseUnitSymbol} Buy / Cost Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newPieceBuyPrice}
                                                                            onChange={(e) => setNewPieceBuyPrice(e.target.value)}
                                                                            placeholder="e.g. 500"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{baseUnitSymbol} Wholesale Sale Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={newPieceSalePrice}
                                                                            onChange={(e) => setNewPieceSalePrice(e.target.value)}
                                                                            placeholder="e.g. 550"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Standalone Single Item (No Bulk) */
                                                <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-3">
                                                    <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                                        <IconTag className="w-3.5 h-3.5 text-gray-600" />
                                                        <span>Standalone Single Item Pricing (e.g. Gallon 300ml, Standalone Bag, or Direct {baseUnitSymbol})</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block font-bold text-gray-700 mb-1">Unit Buy / Cost Price (Rs.) *</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                required
                                                                value={newPieceBuyPrice}
                                                                onChange={(e) => setNewPieceBuyPrice(e.target.value)}
                                                                placeholder="e.g. 2500"
                                                                className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block font-bold text-gray-700 mb-1">Unit Wholesale Sale Price (Rs.) *</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                required
                                                                value={newPieceSalePrice}
                                                                onChange={(e) => setNewPieceSalePrice(e.target.value)}
                                                                placeholder="e.g. 3000"
                                                                className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Section 3: Live Wholesale Preview Summary */}
                                        <div className="bg-[#FEF9E7] p-4 sm:p-5 rounded-2xl border border-[#F3E5AB] space-y-2.5">
                                            <div className="text-[11px] uppercase font-black text-gray-600 tracking-wider flex items-center gap-1.5">
                                                <IconReceipt className="w-4 h-4 text-[#B8860B]" />
                                                <span>Product Summary Preview</span>
                                            </div>
                                            <div className="space-y-2">
                                                {hasCartonPackaging ? (
                                                    <>
                                                        <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                            <span className="font-bold text-[#B8860B] flex items-center gap-1.5">
                                                                <IconBox className="w-4 h-4 text-[#B8860B]" />
                                                                <span>1 {bulkPackName} ({totalCartonPieces} {baseUnitName})</span>
                                                            </span>
                                                            <span className="font-semibold text-gray-700">
                                                                Buy: <strong className="text-gray-900 font-mono">Rs. {Number(newCartonBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(newCartonSalePrice || 0).toLocaleString()}</strong>
                                                            </span>
                                                        </div>
                                                        {hasInnerPackaging && (
                                                            <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-blue-200">
                                                                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                                                                    <IconPackage className="w-4 h-4 text-blue-700" />
                                                                    <span>1 {innerPackName} ({newInnerPiecesCount || 50} {baseUnitSymbol})</span>
                                                                </span>
                                                                <span className="font-semibold text-gray-700">
                                                                    Buy: <strong className="text-gray-900 font-mono">Rs. {Number(newInnerBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(newInnerSalePrice || 0).toLocaleString()}</strong>
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                            <span className="font-bold text-gray-800 flex items-center gap-1.5">
                                                                <IconTag className="w-4 h-4 text-gray-600" />
                                                                <span>1 {baseUnitSymbol} (Loose Piece)</span>
                                                            </span>
                                                            <span className="font-semibold text-gray-700">
                                                                Buy: <strong className="text-gray-900 font-mono">Rs. {Number(newPieceBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(newPieceSalePrice || 0).toLocaleString()}</strong>
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                        <span className="font-bold text-[#B8860B] flex items-center gap-1.5">
                                                            <IconTag className="w-4 h-4 text-[#B8860B]" />
                                                            <span>1 {baseUnitName} (Standalone)</span>
                                                        </span>
                                                        <span className="font-semibold text-gray-700">
                                                            Buy: <strong className="text-gray-900 font-mono">Rs. {Number(newPieceBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(newPieceSalePrice || 0).toLocaleString()}</strong>
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="pt-2 border-t border-[#F3E5AB] flex flex-wrap justify-between items-center text-xs text-gray-700 gap-2 bg-[#FCF8E3]/60 p-2.5 rounded-xl border border-[#F3E5AB]">
                                                    <div>
                                                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                                                            <span>Opening Warehouse Stock:</span>
                                                            <span className="text-[10px] text-gray-500 font-normal">({baseUnitName})</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                                            Enter physical units on hand, or leave 0 to inward from supplier
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            value={newInitialStock}
                                                            onChange={(e) => setNewInitialStock(e.target.value)}
                                                            placeholder="0"
                                                            className="w-24 px-2.5 py-1.5 bg-white border border-gray-300 focus:border-[#B8860B] focus:ring-1 focus:ring-[#B8860B] rounded-lg text-right font-black text-sm text-gray-900 shadow-2xs outline-none"
                                                        />
                                                        <span className="font-bold text-xs text-gray-600 uppercase font-mono">{baseUnitName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Modal Action Buttons: Solid Black Background with White Text */}
                        <div className="flex gap-3 pt-3 border-t border-gray-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setAddItemModalOpen(false)}
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center hover:opacity-90"
                            >
                                <span style={{ color: '#ffffff' }}>Cancel</span>
                            </button>
                            <button
                                type="submit"
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 hover:opacity-90"
                            >
                                <IconCheck className="w-4 h-4" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                <span style={{ color: '#ffffff' }}>Save Product Item</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 3.5: EDIT PRODUCT ITEM & PACKAGING HIERARCHY             */}
            {/* ───────────────────────────────────────────────────────────── */}
            {editItemModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100] p-4 overflow-y-auto" style={{ zIndex: 100 }}>
                    <form onSubmit={handleSaveEditItem} className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-blue-200 max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3.5 shrink-0">
                            <div>
                                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                                    <IconEdit className="w-5 h-5 text-blue-600" />
                                    <span>Edit Wholesale Product & Packaging Rates</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Update product name, classification, packaging conversion rules, barcodes, and buy/sell pricing tiers
                                </p>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setEditItemModalOpen(false)} 
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white p-1.5 rounded-xl cursor-pointer hover:opacity-90 transition-all"
                            >
                                <IconClose className="w-5 h-5" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <div className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
                            {/* Section 1: Basic Product Information */}
                            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-black uppercase text-blue-700 tracking-wider flex items-center gap-1.5">
                                        <span>1. Basic Product & Base Unit</span>
                                    </div>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-xl text-amber-950 font-bold hover:bg-amber-100 transition-colors shadow-2xs">
                                        <input
                                            type="checkbox"
                                            checked={editIsEssential}
                                            onChange={(e) => setEditIsEssential(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer"
                                        />
                                        <span className="text-[11px] flex items-center gap-1">
                                            <span className="text-amber-600">★</span> Essential Item
                                        </span>
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Product Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={editProductName}
                                            onChange={(e) => setEditProductName(e.target.value)}
                                            placeholder="e.g. Sugar / Lays Chips / Oil Gallon"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Variant / Size Label *</label>
                                        <input
                                            type="text"
                                            required
                                            value={editVariantName}
                                            onChange={(e) => setEditVariantName(e.target.value)}
                                            placeholder="e.g. 40kg Bag / 50g / 300ml / Standard"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-semibold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Category *</label>
                                        <select
                                            value={editCategoryId}
                                            onChange={(e) => setEditCategoryId(parseInt(e.target.value))}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Base Measurement Unit *</label>
                                        <select
                                            value={editBaseUnitId}
                                            onChange={(e) => setEditBaseUnitId(parseInt(e.target.value))}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            {units.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.symbol || 'Unit'}){u.description ? ` — ${u.description}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">SKU Code</label>
                                        <input
                                            type="text"
                                            value={editSku}
                                            onChange={(e) => setEditSku(e.target.value)}
                                            placeholder="SKU-XXXX-XXXX"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-mono text-xs font-bold text-gray-900 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="font-bold text-gray-700">Individual Unit Barcode</label>
                                            <button
                                                type="button"
                                                onClick={() => setEditBaseBarcode(generateBarcode('896'))}
                                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer flex items-center gap-1"
                                            >
                                                <IconBolt className="w-2.5 h-2.5 text-gray-700" />
                                                <span>Generate</span>
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={editBaseBarcode}
                                            onChange={(e) => setEditBaseBarcode(e.target.value)}
                                            placeholder="Barcode"
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-mono text-xs font-bold text-gray-900 bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Minimum Alert Stock</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={editMinStock}
                                            onChange={(e) => setEditMinStock(e.target.value)}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-xs bg-white text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-gray-700 mb-1">Reorder Level Stock</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={editReorderLevel}
                                            onChange={(e) => setEditReorderLevel(e.target.value)}
                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-xs bg-white text-gray-900"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Wholesale Packaging & Dynamic Pricing Tiers */}
                            {(() => {
                                const baseUnitObj = units.find(u => u.id === parseInt(editBaseUnitId)) || units[0];
                                const baseUnitSymbol = baseUnitObj?.symbol || baseUnitObj?.name || 'pcs';
                                const baseUnitName = baseUnitObj?.name || 'Piece';
                                const selectedBulkType = packagingTypes.find(p => p.id === parseInt(editBulkPackagingTypeId)) || packagingTypes[1] || packagingTypes[0];
                                const bulkPackName = selectedBulkType?.name || 'Carton';
                                const selectedInnerType = packagingTypes.find(p => p.id === parseInt(editInnerPackagingTypeId)) || packagingTypes[0];
                                const innerPackName = selectedInnerType?.name || 'Packet';

                                const totalCartonPieces = editHasInnerPackaging
                                    ? ((parseFloat(editCartonPacketsCount) || 1) * (parseFloat(editInnerPiecesCount) || 1))
                                    : (parseFloat(editConversionFactor) || 1);

                                return (
                                    <>
                                        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-200 space-y-3.5">
                                            <div className="flex flex-wrap justify-between items-center gap-2">
                                                <div>
                                                    <div className="text-xs font-black uppercase text-blue-700 tracking-wider flex items-center gap-1.5">
                                                        <IconLayers className="w-4 h-4 text-blue-600" />
                                                        <span>2. Packaging Configurations & Hierarchy</span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                                        {editHasInnerPackaging ? (
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-semibold text-gray-700">3-Tier Wholesale Hierarchy:</span>
                                                                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md font-bold text-[10.5px]">
                                                                    <IconBox className="w-3 h-3 text-blue-700" /> {bulkPackName}
                                                                    <IconArrowRight className="w-2.5 h-2.5 text-blue-500" />
                                                                    <IconPackage className="w-3 h-3 text-indigo-700" /> {innerPackName}
                                                                    <IconArrowRight className="w-2.5 h-2.5 text-blue-500" />
                                                                    <IconTag className="w-3 h-3 text-gray-700" /> {baseUnitSymbol}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            `Configure wholesale conversion and dual pricing`
                                                        )}
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-xs bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-2xs hover:bg-gray-50">
                                                    <input
                                                        type="checkbox"
                                                        checked={editHasCartonPackaging}
                                                        onChange={(e) => setEditHasCartonPackaging(e.target.checked)}
                                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span>Enable Wholesale Bulk</span>
                                                </label>
                                            </div>

                                            {editHasCartonPackaging ? (
                                                <div className="space-y-3">
                                                    {/* 3-Tier Multi-Packaging Toggle */}
                                                    <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-800 shrink-0 border border-blue-200">
                                                                <IconLayers className="w-4 h-4 text-blue-800" />
                                                            </div>
                                                            <div>
                                                                <span className="font-extrabold text-blue-950 text-xs inline-flex items-center gap-1.5 flex-wrap">
                                                                    <span>3-Tier Packaging Hierarchy</span>
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-200/60 px-2 py-0.5 rounded-md">
                                                                        <span>{bulkPackName}</span>
                                                                        <IconArrowRight className="w-2.5 h-2.5 text-blue-700 inline" />
                                                                        <span>{innerPackName}s</span>
                                                                        <IconArrowRight className="w-2.5 h-2.5 text-blue-700 inline" />
                                                                        <span>{baseUnitSymbol}</span>
                                                                    </span>
                                                                </span>
                                                                <p className="text-[10px] text-blue-800">
                                                                    Enable when {bulkPackName} contains multiple {innerPackName}s, and each {innerPackName} contains {baseUnitSymbol}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-blue-300 shadow-2xs">
                                                            <input
                                                                type="checkbox"
                                                                checked={editHasInnerPackaging}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setEditHasInnerPackaging(checked);
                                                                    if (checked) {
                                                                        if (!editInnerPackagingTypeId && packagingTypes.length > 0) {
                                                                            const pkt = packagingTypes.find(p => p.name.toLowerCase() === 'packet') || packagingTypes[0];
                                                                            setEditInnerPackagingTypeId(pkt.id);
                                                                        }
                                                                        if (!editInnerBarcode) setEditInnerBarcode(generateBarcode('898'));
                                                                        const pkts = parseFloat(editCartonPacketsCount) || 4;
                                                                        const pcs = parseFloat(editInnerPiecesCount) || 50;
                                                                        setEditConversionFactor(String(pkts * pcs));
                                                                        if (editCartonBuyPrice) {
                                                                            const c = parseFloat(editCartonBuyPrice) || 0;
                                                                            const inBuy = pkts > 0 ? c / pkts : 0;
                                                                            const pcBuy = pcs > 0 ? inBuy / pcs : 0;
                                                                            setEditInnerBuyPrice(String(inBuy % 1 === 0 ? inBuy : Math.round(inBuy * 100) / 100));
                                                                            setEditPieceBuyPrice(String(pcBuy % 1 === 0 ? pcBuy : Math.round(pcBuy * 100) / 100));
                                                                        }
                                                                        if (editCartonSalePrice) {
                                                                            const s = parseFloat(editCartonSalePrice) || 0;
                                                                            const inSale = pkts > 0 ? s / pkts : 0;
                                                                            const pcSale = pcs > 0 ? inSale / pcs : 0;
                                                                            setEditInnerSalePrice(String(inSale % 1 === 0 ? inSale : Math.round(inSale * 100) / 100));
                                                                            setEditPieceSalePrice(String(pcSale % 1 === 0 ? pcSale : Math.round(pcSale * 100) / 100));
                                                                        }
                                                                    }
                                                                }}
                                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                                            />
                                                            <span className="font-extrabold text-gray-900 text-xs">Has Inner {innerPackName}s?</span>
                                                        </label>
                                                    </div>

                                                    {editHasInnerPackaging ? (
                                                        <div className="space-y-3">
                                                            {/* Tier 1 & 2 Units Setup */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/40 p-3.5 rounded-2xl border border-blue-200/60">
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">Outer Bulk Unit</label>
                                                                    <select
                                                                        value={editBulkPackagingTypeId}
                                                                        onChange={(e) => setEditBulkPackagingTypeId(parseInt(e.target.value))}
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 text-xs"
                                                                    >
                                                                        {packagingTypes.map(p => (
                                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">
                                                                        {innerPackName}s in 1 {bulkPackName} *
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        value={editCartonPacketsCount}
                                                                        onChange={(e) => handleEditCartonPacketsCountChange(e.target.value)}
                                                                        placeholder="4"
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-black text-xs text-blue-900 bg-white text-center"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">Inner Unit Type</label>
                                                                    <select
                                                                        value={editInnerPackagingTypeId}
                                                                        onChange={(e) => setEditInnerPackagingTypeId(parseInt(e.target.value))}
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-bold bg-white text-gray-900 text-xs"
                                                                    >
                                                                        {packagingTypes.map(pt => (
                                                                            <option key={pt.id} value={pt.id}>{pt.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block font-bold text-gray-700 mb-1">
                                                                        {baseUnitSymbol} in 1 {innerPackName} *
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        required
                                                                        value={editInnerPiecesCount}
                                                                        onChange={(e) => handleEditInnerPiecesCountChange(e.target.value)}
                                                                        placeholder="50"
                                                                        className="w-full p-2 border border-gray-200 rounded-xl font-black text-xs text-blue-900 bg-white text-center"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Formula Visual Banner */}
                                                            <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-2xs flex items-center justify-between text-xs flex-wrap gap-2">
                                                                <div className="font-extrabold text-gray-800 flex items-center gap-1.5">
                                                                    <IconBox className="w-4 h-4 text-blue-700" />
                                                                    <span>Hierarchy Formula:</span>
                                                                    <span className="text-blue-900 font-black">
                                                                        1 {bulkPackName} = {editCartonPacketsCount || 4} {innerPackName}s = {totalCartonPieces} {baseUnitSymbol}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[11px] text-gray-500 font-medium">
                                                                    (Each {innerPackName} = {editInnerPiecesCount || 50} {baseUnitSymbol})
                                                                </span>
                                                            </div>

                                                            {/* Barcodes Grid */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                <div className="p-3 bg-white rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="font-bold text-gray-700 text-xs flex items-center gap-1">
                                                                            <IconBox className="w-3.5 h-3.5 text-blue-700" />
                                                                            <span>Outer {bulkPackName} Barcode</span>
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditCartonBarcode(generateBarcode('897'))}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white cursor-pointer hover:opacity-90 flex items-center gap-1"
                                                                        >
                                                                            <IconBolt className="w-2.5 h-2.5 text-white" />
                                                                            <span>Auto</span>
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={editCartonBarcode}
                                                                        onChange={(e) => setEditCartonBarcode(e.target.value)}
                                                                        placeholder={`${bulkPackName} barcode`}
                                                                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                </div>

                                                                <div className="p-3 bg-white rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="font-bold text-gray-700 text-xs flex items-center gap-1">
                                                                            <IconPackage className="w-3.5 h-3.5 text-indigo-700" />
                                                                            <span>Inner {innerPackName} Barcode</span>
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditInnerBarcode(generateBarcode('898'))}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white cursor-pointer hover:opacity-90 flex items-center gap-1"
                                                                        >
                                                                            <IconBolt className="w-2.5 h-2.5 text-white" />
                                                                            <span>Auto</span>
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={editInnerBarcode}
                                                                        onChange={(e) => setEditInnerBarcode(e.target.value)}
                                                                        placeholder={`${innerPackName} barcode`}
                                                                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* 3-Tier Synchronized Pricing Cards */}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                {/* 1. Carton Pricing */}
                                                                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-blue-900 flex items-center gap-1.5">
                                                                            <IconBox className="w-3.5 h-3.5 text-blue-800" />
                                                                            <span>{bulkPackName} (x{totalCartonPieces})</span>
                                                                        </span>
                                                                        {parseFloat(editCartonSalePrice) > parseFloat(editCartonBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(editCartonSalePrice) - parseFloat(editCartonBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editCartonBuyPrice}
                                                                            onChange={(e) => handleEditBulkBuyChange(e.target.value)}
                                                                            placeholder="e.g. 4000"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editCartonSalePrice}
                                                                            onChange={(e) => handleEditBulkSaleChange(e.target.value)}
                                                                            placeholder="e.g. 4800"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* 2. Packet Pricing */}
                                                                <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-indigo-900 flex items-center gap-1.5">
                                                                            <IconPackage className="w-3.5 h-3.5 text-indigo-800" />
                                                                            <span>{innerPackName} (x{editInnerPiecesCount || 50})</span>
                                                                        </span>
                                                                        {parseFloat(editInnerSalePrice) > parseFloat(editInnerBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(editInnerSalePrice) - parseFloat(editInnerBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editInnerBuyPrice}
                                                                            onChange={(e) => handleEditInnerBuyChange(e.target.value)}
                                                                            placeholder="e.g. 1000"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editInnerSalePrice}
                                                                            onChange={(e) => handleEditInnerSaleChange(e.target.value)}
                                                                            placeholder="e.g. 1200"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* 3. Piece Pricing */}
                                                                <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                                                                            <IconTag className="w-3.5 h-3.5 text-gray-700" />
                                                                            <span>Loose {baseUnitSymbol} (x1)</span>
                                                                        </span>
                                                                        {parseFloat(editPieceSalePrice) > parseFloat(editPieceBuyPrice) && (
                                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                                                                +Rs. {(parseFloat(editPieceSalePrice) - parseFloat(editPieceBuyPrice)).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Cost / Buy (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editPieceBuyPrice}
                                                                            onChange={(e) => setEditPieceBuyPrice(e.target.value)}
                                                                            placeholder="e.g. 20"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">Wholesale Sale (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editPieceSalePrice}
                                                                            onChange={(e) => setEditPieceSalePrice(e.target.value)}
                                                                            placeholder="e.g. 24"
                                                                            className="w-full p-2 border border-gray-200 rounded-lg font-bold font-mono text-xs text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Quick Calculation Helper Buttons */}
                                                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleEditCalculatePieceFromCarton}
                                                                    className="px-3 py-1.5 rounded-xl font-bold text-xs bg-black text-white hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                                                                >
                                                                    <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                    <span>Auto-Calculate {innerPackName} & {baseUnitSymbol} from {bulkPackName}</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleEditCalculateCartonFromPiece}
                                                                    className="px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-800 text-white hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                                                                >
                                                                    <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                    <span>Auto-Calculate {bulkPackName} from {baseUnitSymbol}</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Standard 2-Tier: Bulk Carton + Piece */
                                                        <div className="space-y-3">
                                                            <div className="p-3.5 bg-blue-50/40 rounded-2xl border border-blue-200/60 space-y-3">
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">Bulk Packaging Type *</label>
                                                                        <select
                                                                            value={editBulkPackagingTypeId}
                                                                            onChange={(e) => setEditBulkPackagingTypeId(parseInt(e.target.value))}
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold bg-white text-gray-900"
                                                                        >
                                                                            {packagingTypes.map(p => (
                                                                                <option key={p.id} value={p.id}>{p.name} ({p.description || 'Bulk Wholesale'})</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">
                                                                            Conversion: How many {baseUnitSymbol} per 1 {bulkPackName}? *
                                                                        </label>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs font-bold text-gray-500">1 {bulkPackName} =</span>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                step="any"
                                                                                required
                                                                                value={editConversionFactor}
                                                                                onChange={(e) => handleEditConversionFactorChange(e.target.value)}
                                                                                className="w-24 p-2 border border-gray-200 rounded-xl font-black font-mono text-center text-sm bg-white text-blue-900"
                                                                            />
                                                                            <span className="text-xs font-bold text-gray-700">{baseUnitSymbol}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Bulk Barcode */}
                                                                <div className="p-3 bg-white rounded-xl border border-gray-200">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <label className="font-bold text-gray-700 text-xs flex items-center gap-1">
                                                                            <IconBox className="w-3.5 h-3.5 text-blue-700" />
                                                                            <span>Bulk / {bulkPackName} Barcode</span>
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditCartonBarcode(generateBarcode('897'))}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-black text-white cursor-pointer hover:opacity-90 flex items-center gap-1"
                                                                        >
                                                                            <IconBolt className="w-2.5 h-2.5 text-white" />
                                                                            <span>Auto</span>
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={editCartonBarcode}
                                                                        onChange={(e) => setEditCartonBarcode(e.target.value)}
                                                                        placeholder={`${bulkPackName} barcode`}
                                                                        className="w-full p-2 border border-gray-200 rounded-lg font-mono text-xs font-bold text-gray-900 bg-white"
                                                                    />
                                                                </div>

                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{bulkPackName} Buy / Cost Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editCartonBuyPrice}
                                                                            onChange={(e) => handleEditBulkBuyChange(e.target.value)}
                                                                            placeholder="e.g. 20000"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{bulkPackName} Wholesale Sale Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editCartonSalePrice}
                                                                            onChange={(e) => handleEditBulkSaleChange(e.target.value)}
                                                                            placeholder="e.g. 22000"
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="pt-1 flex justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleEditCalculatePieceFromCarton}
                                                                        className="px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all bg-black text-white hover:opacity-90"
                                                                    >
                                                                        <IconBolt className="w-3.5 h-3.5 text-white" />
                                                                        <span>Auto-Calculate {baseUnitSymbol} Rates</span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Base Unit Pricing Tier */}
                                                            <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-2.5">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                                                        <IconTag className="w-3.5 h-3.5 text-gray-700" />
                                                                        <span>Individual {baseUnitSymbol} / Base Unit Pricing (Per {baseUnitSymbol})</span>
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{baseUnitSymbol} Buy / Cost Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editPieceBuyPrice}
                                                                            onChange={(e) => setEditPieceBuyPrice(e.target.value)}
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block font-bold text-gray-700 mb-1">{baseUnitSymbol} Wholesale Sale Price (Rs.) *</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            required
                                                                            value={editPieceSalePrice}
                                                                            onChange={(e) => setEditPieceSalePrice(e.target.value)}
                                                                            className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200 space-y-3">
                                                    <span className="font-extrabold text-gray-800 text-xs flex items-center gap-1.5">
                                                        <IconTag className="w-3.5 h-3.5 text-gray-700" />
                                                        <span>Standalone Pricing per {baseUnitName}</span>
                                                    </span>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block font-bold text-gray-700 mb-1">Buy / Cost Price (Rs.) *</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                required
                                                                value={editPieceBuyPrice}
                                                                onChange={(e) => setEditPieceBuyPrice(e.target.value)}
                                                                className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block font-bold text-gray-700 mb-1">Wholesale Sale Price (Rs.) *</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                required
                                                                value={editPieceSalePrice}
                                                                onChange={(e) => setEditPieceSalePrice(e.target.value)}
                                                                className="w-full p-2.5 border border-gray-200 rounded-xl font-bold font-mono text-sm text-emerald-800 bg-white"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Section 3: Live Wholesale Preview Summary */}
                                        <div className="bg-[#FEF9E7] p-4 sm:p-5 rounded-2xl border border-[#F3E5AB] space-y-2.5 mt-3">
                                            <div className="text-[11px] uppercase font-black text-gray-600 tracking-wider flex items-center gap-1.5">
                                                <IconReceipt className="w-4 h-4 text-[#B8860B]" />
                                                <span>Product Summary Preview</span>
                                            </div>
                                            <div className="space-y-2">
                                                {editHasCartonPackaging ? (
                                                    <>
                                                        <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                            <span className="font-bold text-[#B8860B] flex items-center gap-1.5">
                                                                <IconBox className="w-4 h-4 text-[#B8860B]" />
                                                                <span>1 {bulkPackName} ({totalCartonPieces} {baseUnitName})</span>
                                                            </span>
                                                            <span className="font-semibold text-gray-700">
                                                                Buy: <strong className="text-gray-900 font-mono">Rs. {Number(editCartonBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(editCartonSalePrice || 0).toLocaleString()}</strong>
                                                            </span>
                                                        </div>
                                                        {editHasInnerPackaging && (
                                                            <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-blue-200">
                                                                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                                                                    <IconPackage className="w-4 h-4 text-blue-700" />
                                                                    <span>1 {innerPackName} ({editInnerPiecesCount || 50} {baseUnitSymbol})</span>
                                                                </span>
                                                                <span className="font-semibold text-gray-700">
                                                                    Buy: <strong className="text-gray-900 font-mono">Rs. {Number(editInnerBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(editInnerSalePrice || 0).toLocaleString()}</strong>
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                            <span className="font-bold text-gray-800 flex items-center gap-1.5">
                                                                <IconTag className="w-4 h-4 text-gray-600" />
                                                                <span>1 {baseUnitSymbol} (Loose Piece)</span>
                                                            </span>
                                                            <span className="font-semibold text-gray-700">
                                                                Buy: <strong className="text-gray-900 font-mono">Rs. {Number(editPieceBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(editPieceSalePrice || 0).toLocaleString()}</strong>
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-wrap justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-[#F3E5AB]">
                                                        <span className="font-bold text-[#B8860B] flex items-center gap-1.5">
                                                            <IconTag className="w-4 h-4 text-[#B8860B]" />
                                                            <span>1 {baseUnitName} (Standalone)</span>
                                                        </span>
                                                        <span className="font-semibold text-gray-700">
                                                            Buy: <strong className="text-gray-900 font-mono">Rs. {Number(editPieceBuyPrice || 0).toLocaleString()}</strong> | Sale: <strong className="text-emerald-700 font-mono">Rs. {Number(editPieceSalePrice || 0).toLocaleString()}</strong>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="flex gap-3 pt-3 border-t border-gray-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setEditItemModalOpen(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-xs border border-gray-300 text-gray-700 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 hover:opacity-90"
                            >
                                <IconCheck className="w-4 h-4" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                <span style={{ color: '#ffffff' }}>Update Product Item</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 4: + ADD SUPPLIER                                       */}
            {/* ───────────────────────────────────────────────────────────── */}
            {addSupplierModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <form onSubmit={handleSaveSupplier} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#F3E5AB]">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                <IconSuppliers className="w-5 h-5 text-[#B8860B]" />
                                <span>Register New Supplier</span>
                            </h3>
                            <button type="button" onClick={() => setAddSupplierModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Contact Person / Supplier Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={supName}
                                    onChange={(e) => setSupName(e.target.value)}
                                    placeholder="e.g. Haji Muhammad Tariq"
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Company / Brand Name</label>
                                <input
                                    type="text"
                                    value={supCompanyName}
                                    onChange={(e) => setSupCompanyName(e.target.value)}
                                    placeholder="e.g. Hilal Foods Pvt Ltd"
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    value={supPhone}
                                    onChange={(e) => setSupPhone(e.target.value)}
                                    placeholder="03001234567"
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Address / City</label>
                                <input
                                    type="text"
                                    value={supAddress}
                                    onChange={(e) => setSupAddress(e.target.value)}
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Opening Payable Balance (Rs.)</label>
                                <input
                                    type="number"
                                    value={supOpeningBal}
                                    onChange={(e) => setSupOpeningBal(e.target.value)}
                                    placeholder="0"
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-bold"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setAddSupplierModalOpen(false)}
                                className="flex-1 py-2.5 border border-gray-300 rounded-xl font-bold text-xs hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-2.5 gold-gradient hover:opacity-90 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <IconCheck className="w-4 h-4" />
                                <span>Save Supplier</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODAL 5: MANUAL STOCK ADJUSTMENT (DAMAGE / RECONCILIATION)     */}
            {/* ───────────────────────────────────────────────────────────── */}
            {adjustmentModalOpen && selectedVariant && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <form onSubmit={handleSaveAdjustment} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#F3E5AB]">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                    <IconWarning className="w-5 h-5 text-amber-600" />
                                    <span>Damage / Stock Adjustment</span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Adjust inventory for <span className="font-bold text-gray-900">{selectedVariant.product_name} ({selectedVariant.variant_name})</span>
                                </p>
                            </div>
                            <button type="button" onClick={() => setAdjustmentModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="bg-[#FEF9E7] p-3 rounded-xl border border-[#F3E5AB] flex justify-between">
                                <span className="font-bold text-gray-600">Current Stock:</span>
                                <span className="font-black text-emerald-800">{selectedVariant.current_stock} {selectedVariant.unit_symbol || selectedVariant.unit_name}</span>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Adjustment Type</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAdjustmentType('DAMAGE')}
                                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                                            adjustmentType === 'DAMAGE'
                                                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        Damage / Waste (-)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAdjustmentType('ADD')}
                                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                                            adjustmentType === 'ADD'
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        Physical Found (+)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Quantity ({selectedVariant.unit_symbol || selectedVariant.unit_name}) *</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    value={adjustmentQuantity}
                                    onChange={(e) => setAdjustmentQuantity(e.target.value)}
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-black text-[#B8860B]"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Reason / Notes *</label>
                                <input
                                    type="text"
                                    required
                                    value={adjustmentNotes}
                                    onChange={(e) => setAdjustmentNotes(e.target.value)}
                                    placeholder="e.g. Broken in warehouse handling"
                                    className="w-full p-2.5 border border-[#F3E5AB] rounded-xl font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setAdjustmentModalOpen(false)}
                                style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #d1d5db' }}
                                className="flex-1 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                                className="btn-black !bg-black !text-white flex-1 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90"
                            >
                                <IconCheck className="w-4 h-4" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                                <span style={{ color: '#ffffff' }}>Record Adjustment</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Custom Non-Blocking Alert / Confirm Modal */}
            <CustomModalAlert
                isOpen={modalAlert.isOpen}
                onClose={() => setModalAlert(prev => ({ ...prev, isOpen: false }))}
                type={modalAlert.type}
                title={modalAlert.title}
                message={modalAlert.message}
                confirmText={modalAlert.confirmText}
                cancelText={modalAlert.cancelText}
                onConfirm={modalAlert.onConfirm}
            />
        </div>
    );
}
