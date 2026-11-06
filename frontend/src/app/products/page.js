'use client';
import React, { useState, useEffect } from 'react';
import { IconPlus, IconClose, IconTrash, IconEdit, IconProducts, IconInventory, IconSearch, IconScale, IconBox, IconSparkles } from '../components/Icons';

export default function CategoriesPackagingPage() {
    const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'units' | 'packaging'
    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [packagingTypes, setPackagingTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal state for Category
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [categoryName, setCategoryName] = useState('');
    const [parentCategoryId, setParentCategoryId] = useState(''); // empty = top-level main category
    const [editingCategory, setEditingCategory] = useState(null);
    const [categorySearch, setCategorySearch] = useState('');

    // Modal state for Base Measurement Unit
    const [unitModalOpen, setUnitModalOpen] = useState(false);
    const [unitName, setUnitName] = useState('');
    const [unitSymbol, setUnitSymbol] = useState('');
    const [unitDescription, setUnitDescription] = useState('');
    const [editingUnit, setEditingUnit] = useState(null);
    const [unitSearch, setUnitSearch] = useState('');

    // Modal state for Packaging Unit
    const [packagingModalOpen, setPackagingModalOpen] = useState(false);
    const [packagingName, setPackagingName] = useState('');
    const [packagingDescription, setPackagingDescription] = useState('');
    const [editingPackaging, setEditingPackaging] = useState(null);
    const [packagingSearch, setPackagingSearch] = useState('');

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        setLoading(true);
        try {
            const [cRes, uRes, pkRes] = await Promise.all([
                fetch('http://localhost:5000/api/categories'),
                fetch('http://localhost:5000/api/units'),
                fetch('http://localhost:5000/api/packaging-types')
            ]);
            if (cRes.ok) setCategories(await cRes.json());
            if (uRes.ok) setUnits(await uRes.json());
            if (pkRes.ok) setPackagingTypes(await pkRes.json());
        } catch (err) {
            console.error('Failed to fetch categories, units & packaging:', err);
        } finally {
            setLoading(false);
        }
    };

    // ─── CATEGORY HANDLERS ────────────────────────────────────────────────────────
    const handleOpenAddCategory = (parentCatId = '') => {
        setEditingCategory(null);
        setCategoryName('');
        setParentCategoryId(parentCatId ? String(parentCatId) : '');
        setCategoryModalOpen(true);
    };

    const handleStartEditCategory = (cat) => {
        setEditingCategory(cat);
        setCategoryName(cat.name);
        setParentCategoryId(cat.parent_id ? String(cat.parent_id) : '');
        setCategoryModalOpen(true);
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        if (!categoryName.trim()) return alert('Please enter category name');

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const url = editingCategory
                ? `http://localhost:5000/api/categories/${editingCategory.id}`
                : 'http://localhost:5000/api/categories';
            const method = editingCategory ? 'PUT' : 'POST';

            const payload = {
                name: categoryName.trim(),
                parent_id: parentCategoryId ? parseInt(parentCategoryId) : null
            };

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                setCategoryModalOpen(false);
                setCategoryName('');
                setParentCategoryId('');
                setEditingCategory(null);
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to save category');
            }
        } catch (err) {
            alert(err.message || 'Error saving category');
        }
    };

    const handleDeleteCategory = async (cat) => {
        if (cat.subcategory_count > 0) {
            return alert(`Cannot delete "${cat.name}" because it contains ${cat.subcategory_count} active sub-categories. Please delete or reassign its sub-categories first.`);
        }
        if (cat.product_count > 0) {
            return alert(`Cannot delete "${cat.name}" because ${cat.product_count} products are assigned to this category.`);
        }
        if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`http://localhost:5000/api/categories/${cat.id}`, {
                method: 'DELETE',
                headers
            });
            const data = await res.json();
            if (res.ok) {
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to delete category');
            }
        } catch (err) {
            alert(err.message || 'Error deleting category');
        }
    };

    // ─── BASE MEASUREMENT UNIT HANDLERS ──────────────────────────────────────────
    const handleOpenAddUnit = () => {
        setEditingUnit(null);
        setUnitName('');
        setUnitSymbol('');
        setUnitDescription('');
        setUnitModalOpen(true);
    };

    const handleStartEditUnit = (u) => {
        setEditingUnit(u);
        setUnitName(u.name || '');
        setUnitSymbol(u.symbol || '');
        setUnitDescription(u.description || '');
        setUnitModalOpen(true);
    };

    const handleSaveUnit = async (e) => {
        e.preventDefault();
        if (!unitName.trim()) return alert('Please enter unit name (e.g. Pieces, Kilogram, Meter, Liter)');

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const url = editingUnit
                ? `http://localhost:5000/api/units/${editingUnit.id}`
                : 'http://localhost:5000/api/units';
            const method = editingUnit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify({
                    name: unitName.trim(),
                    symbol: unitSymbol.trim() || unitName.trim().slice(0, 4).toUpperCase(),
                    description: unitDescription.trim()
                })
            });

            const data = await res.json();
            if (res.ok) {
                setUnitModalOpen(false);
                setUnitName('');
                setUnitSymbol('');
                setUnitDescription('');
                setEditingUnit(null);
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to save measurement unit');
            }
        } catch (err) {
            alert(err.message || 'Error saving measurement unit');
        }
    };

    const handleDeleteUnit = async (u) => {
        if (u.product_count > 0) {
            return alert(`Cannot delete measurement unit "${u.name}" because it is currently assigned as the Base Measurement Unit for ${u.product_count} product(s)/SKU(s). Please reassign those items in Inventory first.`);
        }
        if (!confirm(`Are you sure you want to delete measurement unit "${u.name} (${u.symbol || ''})"?`)) return;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`http://localhost:5000/api/units/${u.id}`, {
                method: 'DELETE',
                headers
            });
            const data = await res.json();
            if (res.ok) {
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to delete measurement unit');
            }
        } catch (err) {
            alert(err.message || 'Error deleting measurement unit');
        }
    };

    // ─── PACKAGING UNIT HANDLERS ──────────────────────────────────────────────────
    const handleOpenAddPackaging = () => {
        setEditingPackaging(null);
        setPackagingName('');
        setPackagingDescription('');
        setPackagingModalOpen(true);
    };

    const handleStartEditPackaging = (pt) => {
        setEditingPackaging(pt);
        setPackagingName(pt.name);
        setPackagingDescription(pt.description || '');
        setPackagingModalOpen(true);
    };

    const handleSavePackaging = async (e) => {
        e.preventDefault();
        if (!packagingName.trim()) return alert('Please enter packaging unit name');

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const url = editingPackaging
                ? `http://localhost:5000/api/packaging-types/${editingPackaging.id}`
                : 'http://localhost:5000/api/packaging-types';
            const method = editingPackaging ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers,
                body: JSON.stringify({
                    name: packagingName.trim(),
                    description: packagingDescription.trim()
                })
            });

            const data = await res.json();
            if (res.ok) {
                setPackagingModalOpen(false);
                setPackagingName('');
                setPackagingDescription('');
                setEditingPackaging(null);
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to save packaging unit');
            }
        } catch (err) {
            alert(err.message || 'Error saving packaging unit');
        }
    };

    const handleDeletePackaging = async (pt) => {
        if (!confirm(`Are you sure you want to delete packaging type "${pt.name}"?`)) return;

        try {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`http://localhost:5000/api/packaging-types/${pt.id}`, {
                method: 'DELETE',
                headers
            });
            const data = await res.json();
            if (res.ok) {
                await fetchMasterData();
            } else {
                alert(data.error || 'Failed to delete packaging unit');
            }
        } catch (err) {
            alert(err.message || 'Error deleting packaging unit');
        }
    };

    // Filtered data
    const mainCategories = categories.filter(c => !c.parent_id);
    const subCategories = categories.filter(c => c.parent_id);

    // Filter main categories by search query (matches parent name or any of its sub-categories)
    const filteredMainCategories = mainCategories.filter(cat => {
        const q = categorySearch.toLowerCase().trim();
        if (!q) return true;
        const matchesParent = cat.name.toLowerCase().includes(q);
        const matchesSub = categories.some(s => s.parent_id === cat.id && s.name.toLowerCase().includes(q));
        return matchesParent || matchesSub;
    });

    // Check for orphaned sub-categories whose parent was deleted or not found
    const orphanedSubCategories = subCategories.filter(sub => !categories.some(c => c.id === sub.parent_id));

    // Filter units by search
    const filteredUnits = units.filter(u =>
        (u.name && u.name.toLowerCase().includes(unitSearch.toLowerCase().trim())) ||
        (u.symbol && u.symbol.toLowerCase().includes(unitSearch.toLowerCase().trim())) ||
        (u.description && u.description.toLowerCase().includes(unitSearch.toLowerCase().trim()))
    );

    // Filter packaging units by search
    const filteredPackaging = packagingTypes.filter(p =>
        p.name.toLowerCase().includes(packagingSearch.toLowerCase().trim()) ||
        (p.description && p.description.toLowerCase().includes(packagingSearch.toLowerCase().trim()))
    );

    return (
        <div className="space-y-4 text-gray-800">
            {/* Page Header with Compact Navigation Tabs and Quick Add */}
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-[#0B3B7B] text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                        <IconProducts className="w-4 h-4 text-white" />
                    </span>
                    <div>
                        <h1 className="text-sm font-bold text-gray-900 tracking-tight leading-none">
                            Categories & Measurement Units
                        </h1>
                        <p className="text-[11px] text-gray-500 mt-1">
                            Manage wholesale product categories, base measurement units (Pieces, KG, Meter), and packaging rules
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Navigation Pills */}
                    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setActiveTab('categories')}
                            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
                                activeTab === 'categories'
                                    ? 'bg-[#0B3B7B] text-white shadow-2xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <IconProducts className="w-3.5 h-3.5" />
                            <span>Categories</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'categories' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                                {categories.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('units')}
                            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
                                activeTab === 'units'
                                    ? 'bg-[#0B3B7B] text-white shadow-2xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <IconScale className={`w-3.5 h-3.5 ${activeTab === 'units' ? 'text-white' : 'text-blue-700'}`} />
                            <span>Base Units</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'units' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}`}>
                                {units.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('packaging')}
                            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
                                activeTab === 'packaging'
                                    ? 'bg-[#0B3B7B] text-white shadow-2xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <IconBox className="w-3.5 h-3.5" />
                            <span>Packaging Types</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'packaging' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                                {packagingTypes.length}
                            </span>
                        </button>
                    </div>

                    {/* Primary "+ Add" Button */}
                    {activeTab === 'categories' && (
                        <button
                            type="button"
                            onClick={() => handleOpenAddCategory()}
                            className="px-3.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <IconPlus className="w-3.5 h-3.5 text-white" />
                            <span>+ Add Category</span>
                        </button>
                    )}
                    {activeTab === 'units' && (
                        <button
                            type="button"
                            onClick={() => handleOpenAddUnit()}
                            className="px-3.5 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <IconPlus className="w-3.5 h-3.5 text-white" />
                            <span>+ Add Base Unit</span>
                        </button>
                    )}
                    {activeTab === 'packaging' && (
                        <button
                            type="button"
                            onClick={() => handleOpenAddPackaging()}
                            className="px-3.5 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            <IconPlus className="w-3.5 h-3.5 text-white" />
                            <span>+ Add Packaging Type</span>
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Summary Cards */}
            {activeTab === 'categories' && (
                <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Categories</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">{categories.length}</div>
                        <div className="text-[10px] text-gray-400">All registered groups</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Main Categories</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">{mainCategories.length}</div>
                        <div className="text-[10px] text-gray-400">Top-level parents</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sub-Categories</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">{subCategories.length}</div>
                        <div className="text-[10px] text-gray-400">Nested sub-divisions</div>
                    </div>
                </div>
            )}

            {activeTab === 'units' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Measurement Units</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">{units.length}</div>
                        <div className="text-[10px] text-gray-400">System measurement standards</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">In-Use in Inventory</div>
                        <div className="text-lg font-black text-emerald-600 mt-0.5">
                            {units.filter(u => (u.product_count || 0) > 0).length}
                        </div>
                        <div className="text-[10px] text-gray-400">Assigned as Base Unit to live SKUs</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customizable / Free Units</div>
                        <div className="text-lg font-black text-amber-700 mt-0.5">
                            {units.filter(u => !u.product_count || u.product_count === 0).length}
                        </div>
                        <div className="text-[10px] text-gray-400">Available to edit or delete</div>
                    </div>
                </div>
            )}

            {activeTab === 'packaging' && (
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Registered Packaging Types</div>
                        <div className="text-lg font-black text-gray-900 mt-0.5">{packagingTypes.length}</div>
                        <div className="text-[10px] text-gray-400">Bulk & piece rules</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Units</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {packagingTypes.slice(0, 5).map(pt => (
                                <span key={pt.id} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    {pt.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: CATEGORIES & SUB-CATEGORIES IN CARDS                         */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'categories' && (
                <div className="space-y-3">
                    {/* Search Bar */}
                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search category or sub-category..."
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <IconSearch className="w-3.5 h-3.5" />
                            </span>
                            {categorySearch && (
                                <button
                                    type="button"
                                    onClick={() => setCategorySearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                                >
                                    <IconClose className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleOpenAddCategory()}
                            className="px-3.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-all shadow-2xs"
                        >
                            <IconPlus className="w-3.5 h-3.5" />
                            <span>Add Main</span>
                        </button>
                    </div>

                    {/* Category Cards Grid */}
                    {filteredMainCategories.length === 0 && orphanedSubCategories.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                            <IconProducts className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                            <div className="text-xs font-medium">No categories found matching your query.</div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                            {filteredMainCategories.map((cat) => {
                                const catSubs = categories.filter(c => c.parent_id === cat.id);

                                return (
                                    <div
                                        key={cat.id}
                                        className="bg-white rounded-xl border border-gray-200 hover:border-blue-200 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden"
                                    >
                                        {/* Main Category Header Card */}
                                        <div className="p-3 bg-slate-50/80 border-b border-gray-100 flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-[#0B3B7B] shrink-0" />
                                                    <h3 className="text-xs font-bold text-gray-900 truncate" title={cat.name}>
                                                        {cat.name}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 font-medium">
                                                    <span className="bg-white border border-gray-200 px-1.5 py-0.2 rounded font-semibold text-gray-700">
                                                        {cat.product_count || 0} SKUs
                                                    </span>
                                                    <span>•</span>
                                                    <span className="text-amber-800 font-semibold">
                                                        {catSubs.length} Sub-categories
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons: + Sub, Edit, Delete */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenAddCategory(cat.id)}
                                                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                                                    title={`Add sub-category under ${cat.name}`}
                                                >
                                                    <IconPlus className="w-2.5 h-2.5" />
                                                    <span>+ Sub</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEditCategory(cat)}
                                                    className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors cursor-pointer"
                                                    title="Edit Category"
                                                >
                                                    <IconEdit className="w-3 h-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteCategory(cat)}
                                                    className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                                    title="Delete Category"
                                                >
                                                    <IconTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Sub-Categories Content inside the Card */}
                                        <div className="p-3 flex-1 flex flex-col justify-between">
                                            {catSubs.length === 0 ? (
                                                <div className="py-2 text-center text-[10px] text-gray-400 font-medium flex items-center justify-center gap-1">
                                                    <span>No sub-categories.</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenAddCategory(cat.id)}
                                                        className="text-amber-800 hover:underline font-bold"
                                                    >
                                                        + Add one
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                        Sub-Categories ({catSubs.length})
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {catSubs.map((sub) => (
                                                            <div
                                                                key={sub.id}
                                                                className="group inline-flex items-center gap-1.5 bg-gray-50 hover:bg-amber-50/60 border border-gray-200 hover:border-amber-200 pl-2 pr-1 py-1 rounded-md text-[10.5px] text-gray-800 transition-colors"
                                                            >
                                                                <span className="font-semibold">{sub.name}</span>
                                                                {sub.product_count > 0 && (
                                                                    <span className="text-[8.5px] bg-white text-gray-600 px-1 rounded border border-gray-200 font-mono">
                                                                        {sub.product_count}
                                                                    </span>
                                                                )}
                                                                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleStartEditCategory(sub)}
                                                                        className="p-0.5 hover:text-amber-700 cursor-pointer"
                                                                        title="Edit Sub-Category"
                                                                    >
                                                                        <IconEdit className="w-2.5 h-2.5" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteCategory(sub)}
                                                                        className="p-0.5 hover:text-rose-600 cursor-pointer"
                                                                        title="Delete Sub-Category"
                                                                    >
                                                                        <IconClose className="w-2.5 h-2.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Orphaned subcategories if any */}
                            {orphanedSubCategories.length > 0 && (
                                <div className="bg-white rounded-xl border border-rose-200 shadow-2xs p-3">
                                    <div className="text-xs font-bold text-rose-800 mb-1">
                                        Unassigned Sub-Categories
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {orphanedSubCategories.map((sub) => (
                                            <div
                                                key={sub.id}
                                                className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md text-[10.5px] text-rose-900"
                                            >
                                                <span className="font-semibold">{sub.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEditCategory(sub)}
                                                    className="p-0.5 hover:text-gray-900 cursor-pointer"
                                                    title="Assign to parent category"
                                                >
                                                    <IconEdit className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* TAB 2: BASE MEASUREMENT UNITS IN CARDS                              */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'units' && (
                <div className="space-y-3">
                    {/* Search Bar & Quick Add */}
                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search base measurement units (e.g. PCS, KG, Meter, Liter)..."
                                value={unitSearch}
                                onChange={(e) => setUnitSearch(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <IconSearch className="w-3.5 h-3.5" />
                            </span>
                            {unitSearch && (
                                <button
                                    type="button"
                                    onClick={() => setUnitSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                                >
                                    <IconClose className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleOpenAddUnit()}
                            className="px-3.5 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-all shadow-2xs"
                        >
                            <IconPlus className="w-3.5 h-3.5" />
                            <span>Add Base Unit</span>
                        </button>
                    </div>

                    {/* Measurement Units Cards Grid */}
                    {filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                            <IconScale className="w-8 h-8 mx-auto text-blue-500/70 mb-2" />
                            <div className="text-xs font-medium">No measurement units found matching your search.</div>
                            <button
                                type="button"
                                onClick={() => handleOpenAddUnit()}
                                className="mt-3 inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl text-xs font-bold"
                            >
                                <IconPlus className="w-3 h-3" />
                                <span>Add New Unit</span>
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                            {filteredUnits.map((u) => {
                                const hasProducts = (u.product_count || 0) > 0;

                                return (
                                    <div
                                        key={u.id}
                                        className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 p-3 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            {/* Card Top: Unit Name & Action Buttons */}
                                            <div className="flex items-start justify-between gap-1.5">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <h3 className="text-xs font-bold text-gray-900 truncate" title={u.name}>
                                                            {u.name}
                                                        </h3>
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-[#0B3B7B] border border-blue-200 shrink-0">
                                                            {u.symbol || u.name.slice(0, 3).toUpperCase()}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEditUnit(u)}
                                                        className="p-1 text-gray-400 hover:text-gray-800 rounded transition-colors cursor-pointer"
                                                        title="Edit Unit"
                                                    >
                                                        <IconEdit className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteUnit(u)}
                                                        className={`p-1 rounded transition-colors cursor-pointer ${
                                                            hasProducts
                                                                ? 'text-gray-300 hover:text-gray-400'
                                                                : 'text-gray-400 hover:text-rose-600'
                                                        }`}
                                                        title={hasProducts ? `In use by ${u.product_count} SKUs (Cannot delete)` : "Delete Unit"}
                                                    >
                                                        <IconTrash className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-[11px] text-gray-500 mt-1.5 leading-snug line-clamp-2">
                                                {u.description || 'Base measurement unit for inventory, pricing and loose stock calculations'}
                                            </p>
                                        </div>

                                        {/* Card Footer: Usage Status & ID */}
                                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
                                            {hasProducts ? (
                                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    {u.product_count} {u.product_count === 1 ? 'SKU' : 'SKUs'}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    Unassigned
                                                </span>
                                            )}
                                            <span className="text-gray-400 font-mono">
                                                ID: #{u.id}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* TAB 3: PACKAGING UNITS IN CARDS                                    */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'packaging' && (
                <div className="space-y-3">
                    {/* Search Bar */}
                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search packaging units..."
                                value={packagingSearch}
                                onChange={(e) => setPackagingSearch(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                <IconSearch className="w-3.5 h-3.5" />
                            </span>
                            {packagingSearch && (
                                <button
                                    type="button"
                                    onClick={() => setPackagingSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                                >
                                    <IconClose className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleOpenAddPackaging()}
                            className="px-3.5 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-all shadow-2xs"
                        >
                            <IconPlus className="w-3.5 h-3.5" />
                            <span>Add Unit</span>
                        </button>
                    </div>

                    {/* Packaging Units Cards Grid */}
                    {filteredPackaging.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                            <IconInventory className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                            <div className="text-xs font-medium">No packaging units found matching your search.</div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                            {filteredPackaging.map((pt) => (
                                <div
                                    key={pt.id}
                                    className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-3 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-1">
                                            <h3 className="text-xs font-bold text-gray-900 truncate">
                                                {pt.name}
                                            </h3>
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEditPackaging(pt)}
                                                    className="p-1 text-gray-400 hover:text-gray-800 rounded transition-colors cursor-pointer"
                                                    title="Edit Unit"
                                                >
                                                    <IconEdit className="w-3 h-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeletePackaging(pt)}
                                                    className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                                    title="Delete Unit"
                                                >
                                                    <IconTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">
                                            {pt.description || 'Standard wholesale packaging unit'}
                                        </p>
                                    </div>
                                    <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                                        <span>Unit ID: #{pt.id}</span>
                                        <span>{pt.created_at ? new Date(pt.created_at).toLocaleDateString() : 'Active'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* MODAL 1: ADD / EDIT CATEGORY & SUB-CATEGORY MODAL                  */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {categoryModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-gray-200 overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-[#0B3B7B] text-white flex items-center justify-center font-bold">
                                    <IconProducts className="w-3.5 h-3.5 text-white" />
                                </span>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-xs leading-tight">
                                        {editingCategory ? 'Edit Category' : 'Add Category'}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        Create a main category or assign to a parent as sub-category
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCategoryModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSaveCategory} className="p-4 space-y-3 text-xs">
                            {/* Category Name */}
                            <div>
                                <label className="block font-bold text-gray-800 mb-1">
                                    Category / Sub-Category Name <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="e.g. Cooking Oil, Spices, Ghee, Basmati Rice..."
                                    value={categoryName}
                                    onChange={(e) => setCategoryName(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Parent Category Dropdown */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="font-bold text-gray-800">
                                        Parent Category (Classification Level)
                                    </label>
                                    <span className="text-[10px] text-gray-400">Optional</span>
                                </div>
                                <select
                                    value={parentCategoryId}
                                    onChange={(e) => setParentCategoryId(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                >
                                    <option value="">None (Top-Level Main Category)</option>
                                    {mainCategories
                                        .filter(c => !editingCategory || c.id !== editingCategory.id)
                                        .map((c) => (
                                            <option key={c.id} value={c.id}>
                                                Sub-category under: {c.name}
                                            </option>
                                        ))
                                    }
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1">
                                    {parentCategoryId 
                                        ? `Will be created under "${mainCategories.find(c => c.id === parseInt(parentCategoryId))?.name || 'Selected'}".`
                                        : 'Leave as None to create a standalone top-level Main Category.'
                                    }
                                </p>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="pt-2.5 border-t border-gray-100 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCategoryModalOpen(false)}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors cursor-pointer text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer text-xs"
                                >
                                    <IconPlus className="w-3.5 h-3.5 text-white" />
                                    <span>{editingCategory ? 'Save Changes' : 'Save Category'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* MODAL 2: ADD / EDIT PACKAGING TYPE MODAL                           */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {packagingModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-gray-200 overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-[#0B3B7B] text-white flex items-center justify-center font-bold">
                                    <IconInventory className="w-3.5 h-3.5 text-white" />
                                </span>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-xs leading-tight">
                                        {editingPackaging ? 'Edit Packaging Unit' : 'Add Packaging Unit'}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        Define packaging type (e.g. Carton, Sack, Tray, Drum, Jar, Box)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPackagingModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSavePackaging} className="p-4 space-y-3 text-xs">
                            {/* Unit Name */}
                            <div>
                                <label className="block font-bold text-gray-800 mb-1">
                                    Packaging Unit Name <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="e.g. Carton, Sack, Tray, Drum, Jar, Box, Gallon..."
                                    value={packagingName}
                                    onChange={(e) => setPackagingName(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block font-bold text-gray-800 mb-1">
                                    Description / Usage Notes
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Standard wholesale bulk carton or 40kg bag"
                                    value={packagingDescription}
                                    onChange={(e) => setPackagingDescription(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="pt-2.5 border-t border-gray-100 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPackagingModalOpen(false)}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors cursor-pointer text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-lg font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer text-xs"
                                >
                                    <IconPlus className="w-3.5 h-3.5 text-white" />
                                    <span>{editingPackaging ? 'Save Changes' : 'Save Packaging Unit'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════ */}
            {/* MODAL 3: ADD / EDIT BASE MEASUREMENT UNIT MODAL                     */}
            {/* ═══════════════════════════════════════════════════════════════════ */}
            {unitModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-gray-200 overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-[#0B3B7B] text-white flex items-center justify-center font-bold">
                                    <IconScale className="w-3.5 h-3.5 text-white" />
                                </span>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-xs leading-tight">
                                        {editingUnit ? 'Edit Base Measurement Unit' : 'Add Base Measurement Unit'}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        Defines the individual item / weight metric (e.g. PCS, KG, Liter, Meter)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setUnitModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSaveUnit} className="p-4 space-y-3 text-xs">
                            {/* Unit Name */}
                            <div>
                                <label className="block font-bold text-gray-800 mb-1">
                                    Unit Name <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="e.g. Pieces, Kilogram, Meter, Liter, Dozen, Gram..."
                                    value={unitName}
                                    onChange={(e) => setUnitName(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Unit Symbol */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="font-bold text-gray-800">
                                        Unit Symbol / Abbreviation <span className="text-rose-600">*</span>
                                    </label>
                                    <span className="text-[10px] text-gray-400">Short label</span>
                                </div>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. PCS, KG, M, L, DOZ, GM, BDL..."
                                    value={unitSymbol}
                                    onChange={(e) => setUnitSymbol(e.target.value.toUpperCase())}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">
                                    Shown on invoices, receipts, and inventory stock tags.
                                </p>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block font-bold text-gray-800 mb-1">
                                    Description / Usage Notes
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Standard piece count for individual retail packages"
                                    value={unitDescription}
                                    onChange={(e) => setUnitDescription(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* Info Banner */}
                            <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200/60 text-[10.5px] text-[#0B3B7B] leading-relaxed">
                                <span className="font-bold inline-flex items-center gap-1"><IconSparkles className="w-3.5 h-3.5 text-blue-600 inline shrink-0" /> Live Integration:</span> Once saved, this unit immediately becomes selectable in the <span className="font-bold">"Base Measurement Unit *"</span> dropdown across Inventory, Product creation, and POS.
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="pt-2.5 border-t border-gray-100 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setUnitModalOpen(false)}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors cursor-pointer text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 bg-[#0B3B7B] hover:bg-[#072B5C] text-white rounded-lg font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer text-xs"
                                >
                                    <IconPlus className="w-3.5 h-3.5 text-white" />
                                    <span>{editingUnit ? 'Save Changes' : 'Create Base Unit'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
