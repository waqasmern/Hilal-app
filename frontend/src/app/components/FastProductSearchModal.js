'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconSearch, IconClose, IconInventory } from './Icons';

/**
 * Reusable, ultra-fast floating product search modal.
 * Shows clean product name and current stock for rapid 60fps item selection.
 */
export default React.memo(function FastProductSearchModal({
    isOpen,
    onClose,
    products = [],
    targetRowIndex,
    selectedVariantId,
    onSelect
}) {
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const inputRef = useRef(null);

    // Auto-focus search input on modal open
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setCategoryFilter('ALL');
            const timer = setTimeout(() => {
                if (inputRef.current) inputRef.current.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Distinct category list
    const categories = useMemo(() => {
        const cats = new Set();
        (products || []).forEach(p => {
            if (p.category_name) cats.add(p.category_name);
        });
        return Array.from(cats);
    }, [products]);

    // Instant filter with precomputed _searchText & slice cap
    const filteredProducts = useMemo(() => {
        if (!products || products.length === 0) return [];
        const q = (query || '').toLowerCase().trim();
        const cat = categoryFilter;

        let res = products;
        if (cat !== 'ALL') {
            res = res.filter(p => p.category_name === cat);
        }
        if (q) {
            res = res.filter(p => {
                if (p._searchText) return p._searchText.includes(q);
                const s = `${p.product_name || ''} ${p.variant_name || ''} ${p.sku || ''} ${p.category_name || ''} ${p.variant_barcode || ''}`.toLowerCase();
                return s.includes(q);
            });
        }
        return res.slice(0, 60);
    }, [products, query, categoryFilter]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-100"
            onClick={onClose}
            style={{ zIndex: 120 }}
        >
            <div
                className="bg-white rounded-2xl max-w-xl w-full p-4 border border-gray-200 shadow-2xl flex flex-col max-h-[82vh] space-y-2.5 animate-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B7B] shrink-0">
                            <IconSearch className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm text-gray-800">Select Item / Product Variant</h4>
                            <p className="text-[10.5px] text-gray-400 font-normal">Search catalog by product name, variant, or category</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        <IconClose className="w-4 h-4" />
                    </button>
                </div>

                {/* Instant Search Bar */}
                <div className="shrink-0 relative">
                    <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Type to search items (e.g. Adams, Cheese, Milk, SKU...)"
                        className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-normal text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B3B7B]/20 transition-all"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                        >
                            <IconClose className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Category Pills (Pinned, High-Contrast & Clear) */}
                {categories.length > 0 && (
                    <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto py-1.5 min-h-[40px] text-xs no-scrollbar">
                        <button
                            type="button"
                            onClick={() => setCategoryFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 leading-normal ${
                                categoryFilter === 'ALL'
                                    ? 'bg-[#0B3B7B] text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            All ({products.length})
                        </button>
                        {categories.map(cat => {
                            const count = products.filter(p => p.category_name === cat).length;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 leading-normal ${
                                        categoryFilter === cat
                                            ? 'bg-[#0B3B7B] text-white shadow-xs'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                    {cat} ({count})
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Instant Filtered Products List - Simplified & Fast */}
                <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-gray-100 pr-1 max-h-[350px]">
                    {filteredProducts.length === 0 ? (
                        <div className="py-10 text-center text-gray-400">
                            <IconInventory className="w-7 h-7 mx-auto text-gray-300 mb-1.5" />
                            <div className="text-xs font-medium text-gray-700">No matching items found</div>
                            <div className="text-[10px] text-gray-400 mt-0.5 font-normal">Try a different search query or category</div>
                        </div>
                    ) : (
                        filteredProducts.map((p) => {
                            const stock = p.current_stock || 0;
                            const isSelected = selectedVariantId === p.variant_id;
                            const unitName = p.unit_symbol || p.unit_name || 'pcs';
                            const variantTag = p.variant_name && p.variant_name !== 'Standard' ? `(${p.variant_name})` : '';

                            return (
                                <div
                                    key={p.variant_id}
                                    onClick={() => onSelect(p)}
                                    className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-between gap-2 group ${
                                        isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                                    }`}
                                >
                                    {/* Left: Product Name */}
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span className="font-semibold text-xs text-gray-900 group-hover:text-[#0B3B7B] truncate">
                                            {p.product_name}
                                        </span>
                                        {variantTag && (
                                            <span className="text-[10px] text-gray-500 font-normal shrink-0">
                                                {variantTag}
                                            </span>
                                        )}
                                        {isSelected && (
                                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9.5px] font-bold shrink-0">
                                                Selected
                                            </span>
                                        )}
                                    </div>

                                    {/* Right: Current Stock */}
                                    <div className="shrink-0">
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium border font-mono ${
                                            stock > 10
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : stock > 0
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                        }`}>
                                            Stock: {stock} {unitName}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer with item count */}
                <div className="shrink-0 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 font-normal">
                    <span>Showing {filteredProducts.length} of {products.length} items</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-lg transition-colors cursor-pointer text-xs"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
});
