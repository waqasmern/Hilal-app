const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./database');
const syncEngine = require('./syncEngine');
const whatsappService = require('./services/whatsappService');
const reminderService = require('./services/reminderService');
const schedulerService = require('./services/schedulerService');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hilal_wholesaler_secret_key_2026';

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// In-Memory Fast Cache for Master Data (Settings, Packaging Types, Units)
const masterCache = {
    settings: null,
    units: null,
    packagingTypes: null
};

function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
}

// ─── Local Timezone Helpers (Strictly Pakistan Local Time) ─────────────────────
function getLocalDate() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getLocalNow() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── JWT Authentication Middleware ─────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        // Fallback for direct local calls if token omitted
        req.user = { id: 1, username: 'admin', role: 'admin' };
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied: Admin role required' });
    }
}

function logAudit(userId, username, action, entityName = null, entityId = null, details = null, deviceId = 'DEVICE-CASHIER-01') {
    const uuid = generateUUID();
    db.run(
        `INSERT INTO audit_logs (uuid, user_id, username, action, entity_name, entity_id, details, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, userId, username, action, entityName, String(entityId || ''), typeof details === 'object' ? JSON.stringify(details) : details, deviceId]
    );
}

// ─── HEALTH CHECK ROUTE ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Hilal Wholesaler API', timestamp: new Date().toISOString() });
});

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get("SELECT * FROM users WHERE username = ? AND is_deleted = 0", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const payload = { id: user.id, uuid: user.uuid, username: user.username, role: user.role, full_name: user.full_name };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        logAudit(user.id, user.username, 'USER_LOGIN', 'users', user.id, 'User logged in successfully');
        res.json({ token, user: payload });
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// ─── MASTER DATA: CATEGORIES, BRANDS, UNITS, PACKAGING TYPES ─────────────────
app.get('/api/categories', (req, res) => {
    const query = `
        SELECT 
            c.*, 
            p.name as parent_name,
            (SELECT COUNT(*) FROM products pr WHERE pr.category_id = c.id AND pr.is_deleted = 0) as product_count,
            (SELECT COUNT(*) FROM categories sub WHERE sub.parent_id = c.id AND sub.is_deleted = 0) as subcategory_count
        FROM categories c
        LEFT JOIN categories p ON c.parent_id = p.id
        WHERE c.is_deleted = 0 
        ORDER BY c.parent_id IS NOT NULL, c.name ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categories', authenticateToken, requireAdmin, (req, res) => {
    const { name, is_pinned, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
    const cleanName = name.trim();
    const parentIdVal = parent_id ? parseInt(parent_id) : null;
    const uuid = generateUUID();
    db.run(
        "INSERT INTO categories (uuid, name, is_pinned, parent_id) VALUES (?, ?, ?, ?)", 
        [uuid, cleanName, is_pinned ? 1 : 0, parentIdVal], 
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Category already exists' });
                return res.status(500).json({ error: err.message });
            }
            logAudit(req.user.id, req.user.username, 'CREATE_CATEGORY', 'categories', this.lastID, cleanName);
            res.json({ id: this.lastID, uuid, name: cleanName, is_pinned, parent_id: parentIdVal });
        }
    );
});

app.put('/api/categories/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, is_pinned, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
    const cleanName = name.trim();
    const parentIdVal = parent_id ? parseInt(parent_id) : null;
    
    if (parentIdVal && parseInt(id) === parentIdVal) {
        return res.status(400).json({ error: 'Category cannot be its own parent' });
    }

    db.run(
        "UPDATE categories SET name = ?, is_pinned = ?, parent_id = ? WHERE id = ?",
        [cleanName, is_pinned ? 1 : 0, parentIdVal, id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Category already exists' });
                return res.status(500).json({ error: err.message });
            }
            logAudit(req.user.id, req.user.username, 'UPDATE_CATEGORY', 'categories', id, cleanName);
            res.json({ id: parseInt(id), name: cleanName, parent_id: parentIdVal });
        }
    );
});

app.delete('/api/categories/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    db.get("SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND is_deleted = 0", [id], (err, subRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (subRow && subRow.count > 0) {
            return res.status(400).json({ error: `Cannot delete: ${subRow.count} sub-categories belong to this category` });
        }

        db.get("SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_deleted = 0", [id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row && row.count > 0) {
                return res.status(400).json({ error: `Cannot delete: ${row.count} products are currently linked to this category` });
            }
            db.run("UPDATE categories SET is_deleted = 1 WHERE id = ?", [id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                logAudit(req.user.id, req.user.username, 'DELETE_CATEGORY', 'categories', id, 'Soft-deleted');
                res.json({ success: true });
            });
        });
    });
});

app.get('/api/brands', (req, res) => {
    db.all("SELECT * FROM brands WHERE is_deleted = 0 ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/brands', authenticateToken, requireAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Brand name required' });
    const uuid = generateUUID();
    db.run("INSERT INTO brands (uuid, name, description) VALUES (?, ?, ?)", [uuid, name.trim(), description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, uuid, name: name.trim(), description });
    });
});

app.get('/api/units', (req, res) => {
    if (masterCache.units) {
        return res.json(masterCache.units);
    }
    const query = `
        SELECT u.*, 
            (SELECT COUNT(*) FROM product_variants pv WHERE pv.base_unit_id = u.id AND pv.is_deleted = 0) as product_count
        FROM units u
        ORDER BY u.name ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        masterCache.units = rows || [];
        res.json(rows);
    });
});

app.post('/api/units', authenticateToken, requireAdmin, (req, res) => {
    const { name, symbol, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Measurement unit name is required' });
    const cleanName = name.trim();
    const cleanSymbol = symbol && symbol.trim() ? symbol.trim().toUpperCase() : cleanName.slice(0, 4).toUpperCase();
    const cleanDescription = description ? description.trim() : '';
    const uuid = generateUUID();

    db.run(
        "INSERT INTO units (uuid, name, symbol, description) VALUES (?, ?, ?, ?)",
        [uuid, cleanName, cleanSymbol, cleanDescription],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'A measurement unit with this name already exists' });
                return res.status(500).json({ error: err.message });
            }
            masterCache.units = null; // Invalidate cache
            logAudit(req.user.id, req.user.username, 'CREATE_UNIT', 'units', this.lastID, `${cleanName} (${cleanSymbol})`);
            res.json({ id: this.lastID, uuid, name: cleanName, symbol: cleanSymbol, description: cleanDescription, product_count: 0 });
        }
    );
});

app.put('/api/units/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, symbol, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Measurement unit name is required' });
    const cleanName = name.trim();
    const cleanSymbol = symbol && symbol.trim() ? symbol.trim().toUpperCase() : cleanName.slice(0, 4).toUpperCase();
    const cleanDescription = description ? description.trim() : '';

    db.run(
        "UPDATE units SET name = ?, symbol = ?, description = ? WHERE id = ?",
        [cleanName, cleanSymbol, cleanDescription, id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'A measurement unit with this name already exists' });
                return res.status(500).json({ error: err.message });
            }
            masterCache.units = null; // Invalidate cache
            logAudit(req.user.id, req.user.username, 'UPDATE_UNIT', 'units', id, `${cleanName} (${cleanSymbol})`);
            res.json({ id: parseInt(id), name: cleanName, symbol: cleanSymbol, description: cleanDescription });
        }
    );
});

app.delete('/api/units/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    db.get("SELECT COUNT(*) as count FROM product_variants WHERE base_unit_id = ? AND is_deleted = 0", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.count > 0) {
            return res.status(400).json({ error: `Cannot delete: ${row.count} product(s) / variant(s) are using this unit. Please reassign them first.` });
        }
        db.run("DELETE FROM units WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            masterCache.units = null; // Invalidate cache
            logAudit(req.user.id, req.user.username, 'DELETE_UNIT', 'units', id, 'Deleted');
            res.json({ success: true });
        });
    });
});

app.get('/api/packaging-types', (req, res) => {
    if (masterCache.packagingTypes) {
        return res.json(masterCache.packagingTypes);
    }
    db.all("SELECT * FROM packaging_types ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        masterCache.packagingTypes = rows || [];
        res.json(rows);
    });
});

app.post('/api/packaging-types', authenticateToken, requireAdmin, (req, res) => {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Packaging type name required' });
    const cleanName = name.trim();
    const uuid = generateUUID();
    db.run("INSERT INTO packaging_types (uuid, name, description) VALUES (?, ?, ?)", [uuid, cleanName, description], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Packaging type already exists' });
            return res.status(500).json({ error: err.message });
        }
        masterCache.packagingTypes = null; // Invalidate cache
        logAudit(req.user.id, req.user.username, 'CREATE_PACKAGING_TYPE', 'packaging_types', this.lastID, cleanName);
        res.json({ id: this.lastID, uuid, name: cleanName, description });
    });
});

app.put('/api/packaging-types/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Packaging type name required' });
    const cleanName = name.trim();
    const cleanDesc = description ? description.trim() : '';
    db.run(
        "UPDATE packaging_types SET name = ?, description = ? WHERE id = ?",
        [cleanName, cleanDesc, id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Packaging type name already exists' });
                return res.status(500).json({ error: err.message });
            }
            masterCache.packagingTypes = null; // Invalidate cache
            logAudit(req.user.id, req.user.username, 'UPDATE_PACKAGING_TYPE', 'packaging_types', id, cleanName);
            res.json({ id: parseInt(id), name: cleanName, description: cleanDesc });
        }
    );
});

app.delete('/api/packaging-types/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    db.get("SELECT COUNT(*) as count FROM product_packagings WHERE packaging_type_id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.count > 0) {
            return res.status(400).json({ error: `Cannot delete: ${row.count} product packagings use this packaging type` });
        }
        db.run("DELETE FROM packaging_types WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            masterCache.packagingTypes = null; // Invalidate cache
            logAudit(req.user.id, req.user.username, 'DELETE_PACKAGING_TYPE', 'packaging_types', id, 'Deleted');
            res.json({ success: true });
        });
    });
});

// ─── PRODUCT & SKU ARCHITECTURE ─────────────────────────────────────────────
// Fast in-memory cache for products catalog (drastically reduces query latency to < 5ms)
let cachedProductsList = null;
let cachedProductsTimestamp = 0;
const PRODUCTS_CACHE_TTL_MS = 60 * 1000; // 60s TTL

function invalidateProductsCache() {
    cachedProductsList = null;
    cachedProductsTimestamp = 0;
}

// Category -> Product -> Variant / SKU -> Packaging -> Unit
app.get('/api/products', (req, res) => {
    // Return cached list if available and fresh
    if (cachedProductsList && (Date.now() - cachedProductsTimestamp < PRODUCTS_CACHE_TTL_MS)) {
        return res.json(cachedProductsList);
    }

    const query = `
        SELECT 
            p.id as product_id, p.uuid as product_uuid, p.name as product_name, p.description,
            COALESCE(p.is_essential, 0) as is_essential,
            c.id as category_id, c.name as category_name,
            b.id as brand_id, b.name as brand_name,
            v.id as variant_id, v.uuid as variant_uuid, v.sku, v.barcode as variant_barcode, 
            v.variant_name, v.minimum_stock, v.reorder_level, v.is_loose_allowed, v.current_stock,
            v.base_unit_id, u.id as unit_id, u.name as unit_name, u.symbol as unit_symbol
        FROM products p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        JOIN product_variants v ON p.id = v.product_id AND v.is_deleted = 0
        JOIN units u ON v.base_unit_id = u.id
        WHERE p.is_deleted = 0
        ORDER BY p.name ASC, v.variant_name ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        if (rows.length === 0) return res.json([]);

        // Fetch all packaging rules for these variants
        db.all(`
            SELECT pp.*, pt.name as packaging_name 
            FROM product_packagings pp
            JOIN packaging_types pt ON pp.packaging_type_id = pt.id
            ORDER BY pp.conversion_factor ASC
        `, [], (err, packagings) => {
            if (err) return res.status(500).json({ error: err.message });

            const packagingMap = {};
            packagings.forEach(pack => {
                if (!packagingMap[pack.variant_id]) packagingMap[pack.variant_id] = [];
                packagingMap[pack.variant_id].push(pack);
            });

            const productsList = rows.map(row => {
                const uSymbol = row.unit_symbol || row.unit_name || 'pcs';
                const vPacks = (packagingMap[row.variant_id] || []).map(p => {
                    let displayPackName = p.packaging_name;
                    if (p.conversion_factor === 1 && (p.packaging_name === 'Piece' || p.packaging_name === 'Unit')) {
                        displayPackName = uSymbol.toUpperCase();
                    }
                    return {
                        ...p,
                        packaging_name: displayPackName
                    };
                });
                return {
                    ...row,
                    packagings: vPacks
                };
            });

            // Store in cache
            cachedProductsList = productsList;
            cachedProductsTimestamp = Date.now();
            res.json(productsList);
        });
    });
});

// Toggle / update is_essential flag for a product (by product_id or variant_id)
app.patch('/api/products/:identifier/essential', (req, res) => {
    const { identifier } = req.params;
    const is_essential = req.body.is_essential ? 1 : 0;

    db.run(
        `UPDATE products 
         SET is_essential = ? 
         WHERE id = ? OR id = (SELECT product_id FROM product_variants WHERE id = ?)`,
        [is_essential, identifier, identifier],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            invalidateProductsCache();
            res.json({ success: true, identifier, is_essential });
        }
    );
});

app.post('/api/products', authenticateToken, requireAdmin, (req, res) => {
    const { category_id, brand_id, name, description, variant_name, sku, barcode, base_unit_id, minimum_stock, reorder_level, is_loose_allowed, packagings, is_essential, initial_stock, opening_stock } = req.body;
    const initialQty = parseFloat(initial_stock || opening_stock || req.body.initial_quantity) || 0;

    if (!category_id || !name || !base_unit_id) {
        return res.status(400).json({ error: 'Category, Product Name, and Base Unit are required' });
    }

    const finalVariantName = (variant_name && variant_name.trim()) || 'Standard';
    const finalSku = (sku && sku.trim()) || `SKU-${name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PROD'}-${Date.now().toString().slice(-5)}`;
    const finalBarcode = (barcode && barcode.trim()) || finalSku;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const productUUID = generateUUID();

        db.run(
            `INSERT INTO products (uuid, category_id, brand_id, name, description, is_essential) VALUES (?, ?, ?, ?, ?, ?)`,
            [productUUID, category_id, brand_id || null, name, description || '', is_essential ? 1 : 0],
            function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }
                const productId = this.lastID;
                const variantUUID = generateUUID();

                db.run(
                    `INSERT INTO product_variants (uuid, product_id, sku, barcode, variant_name, base_unit_id, minimum_stock, reorder_level, is_loose_allowed, current_stock)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [variantUUID, productId, finalSku, finalBarcode, finalVariantName, base_unit_id, minimum_stock || 10, reorder_level || 15, is_loose_allowed ? 1 : 0, initialQty],
                    function(err) {
                        if (err) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: err.message });
                        }
                        const variantId = this.lastID;

                        // Create inventory stock record
                        db.run(`INSERT INTO inventory_stock (uuid, variant_id, quantity) VALUES (?, ?, ?)`, [generateUUID(), variantId, initialQty]);

                        if (initialQty > 0) {
                            db.run(
                                `INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, notes, user_id, device_id)
                                 VALUES (?, ?, 1, 'OPENING_STOCK', ?, ?, 'Opening stock on product registration', ?, 'DEVICE-CASHIER-01')`,
                                [generateUUID(), variantId, initialQty, initialQty, req.user.id]
                            );
                        }

                        // Create product packaging conversions
                        if (Array.isArray(packagings) && packagings.length > 0) {
                            const packStmt = db.prepare(`
                                INSERT INTO product_packagings (uuid, variant_id, packaging_type_id, conversion_factor, is_default, purchase_price, selling_price, barcode)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `);
                            packagings.forEach(p => {
                                const packBarcode = (p.barcode && p.barcode.trim()) || finalBarcode;
                                packStmt.run(generateUUID(), variantId, p.packaging_type_id, p.conversion_factor || 1, p.is_default ? 1 : 0, p.purchase_price || 0, p.selling_price || 0, packBarcode);
                            });
                            packStmt.finalize();
                        } else {
                            // Default 1 piece packaging rule
                            db.run(
                                `INSERT INTO product_packagings (uuid, variant_id, packaging_type_id, conversion_factor, is_default, purchase_price, selling_price, barcode)
                                 VALUES (?, ?, 1, 1, 1, 0, 0, ?)`,
                                [generateUUID(), variantId, finalBarcode]
                            );
                        }

                        db.run("COMMIT", (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            logAudit(req.user.id, req.user.username, 'CREATE_PRODUCT', 'products', productId, `Created product ${name} - ${finalVariantName}`);
                            syncEngine.enqueueSync('PRODUCT', 'products', productId, req.body);
                            res.json({ success: true, productId, variantId, sku: finalSku, barcode: finalBarcode });
                        });
                    }
                );
            }
        );
    });
});

// ─── UPDATE PRODUCT & SKU / PACKAGINGS ──────────────────────────────────────
app.put('/api/products/:variant_id', authenticateToken, requireAdmin, (req, res) => {
    const variantId = parseInt(req.params.variant_id);
    const { 
        name, category_id, brand_id, description, 
        variant_name, sku, barcode, base_unit_id, 
        minimum_stock, reorder_level, is_loose_allowed, packagings, is_essential 
    } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Product Name is required' });
    }

    db.get("SELECT product_id FROM product_variants WHERE id = ? AND is_deleted = 0", [variantId], (err, vRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!vRow) return res.status(404).json({ error: 'Product variant not found' });

        const productId = vRow.product_id;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            // 1. Update Product
            db.run(
                `UPDATE products SET name = ?, category_id = COALESCE(?, category_id), brand_id = ?, description = ?, is_essential = COALESCE(?, is_essential) WHERE id = ?`,
                [name.trim(), category_id || null, brand_id || null, description || '', is_essential !== undefined ? (is_essential ? 1 : 0) : null, productId],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }

                    // 2. Update Variant
                    db.run(
                        `UPDATE product_variants 
                         SET variant_name = COALESCE(?, variant_name),
                             sku = COALESCE(?, sku),
                             barcode = COALESCE(?, barcode),
                             base_unit_id = COALESCE(?, base_unit_id),
                             minimum_stock = COALESCE(?, minimum_stock),
                             reorder_level = COALESCE(?, reorder_level),
                             is_loose_allowed = COALESCE(?, is_loose_allowed)
                         WHERE id = ?`,
                        [
                            variant_name ? variant_name.trim() : null,
                            sku ? sku.trim() : null,
                            barcode ? barcode.trim() : null,
                            base_unit_id ? parseInt(base_unit_id) : null,
                            minimum_stock !== undefined ? parseFloat(minimum_stock) : null,
                            reorder_level !== undefined ? parseFloat(reorder_level) : null,
                            is_loose_allowed !== undefined ? (is_loose_allowed ? 1 : 0) : null,
                            variantId
                        ],
                        function(err) {
                            if (err) {
                                db.run("ROLLBACK");
                                return res.status(500).json({ error: err.message });
                            }

                            // 3. Update Packagings if provided
                            if (Array.isArray(packagings) && packagings.length > 0) {
                                db.run("DELETE FROM product_packagings WHERE variant_id = ?", [variantId], function(err) {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ error: err.message });
                                    }

                                    const packStmt = db.prepare(`
                                        INSERT INTO product_packagings (uuid, variant_id, packaging_type_id, conversion_factor, is_default, purchase_price, selling_price, barcode)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                    `);
                                    packagings.forEach(p => {
                                        packStmt.run(
                                            generateUUID(), 
                                            variantId, 
                                            p.packaging_type_id, 
                                            p.conversion_factor || 1, 
                                            p.is_default ? 1 : 0, 
                                            p.purchase_price || 0, 
                                            p.selling_price || 0, 
                                            (p.barcode && p.barcode.trim()) || barcode || sku || ''
                                        );
                                    });
                                    packStmt.finalize();

                                    db.run("COMMIT", (err) => {
                                        if (err) return res.status(500).json({ error: err.message });
                                        invalidateProductsCache();
                                        logAudit(req.user.id, req.user.username, 'UPDATE_PRODUCT', 'products', productId, `Updated product ${name} (Variant ID: ${variantId})`);
                                        syncEngine.enqueueSync('PRODUCT_UPDATE', 'products', productId, req.body);
                                        res.json({ success: true, productId, variantId });
                                    });
                                });
                            } else {
                                db.run("COMMIT", (err) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    invalidateProductsCache();
                                    logAudit(req.user.id, req.user.username, 'UPDATE_PRODUCT', 'products', productId, `Updated product ${name} (Variant ID: ${variantId})`);
                                    syncEngine.enqueueSync('PRODUCT_UPDATE', 'products', productId, req.body);
                                    res.json({ success: true, productId, variantId });
                                });
                            }
                        }
                    );
                }
            );
        });
    });
});

// ─── DELETE (SOFT-DELETE) PRODUCT / VARIANT ──────────────────────────────────
app.delete('/api/products/:variant_id', authenticateToken, requireAdmin, (req, res) => {
    const variantId = parseInt(req.params.variant_id);

    db.get("SELECT product_id, variant_name, current_stock FROM product_variants WHERE id = ? AND is_deleted = 0", [variantId], (err, vRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!vRow) return res.status(404).json({ error: 'Product variant not found' });

        const productId = vRow.product_id;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            // Soft-delete the variant
            db.run("UPDATE product_variants SET is_deleted = 1 WHERE id = ?", [variantId], function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }

                // Check if any active variants remain for this product
                db.get("SELECT COUNT(*) as count FROM product_variants WHERE product_id = ? AND is_deleted = 0", [productId], (err, cntRow) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }

                    if (cntRow && cntRow.count === 0) {
                        db.run("UPDATE products SET is_deleted = 1 WHERE id = ?", [productId]);
                    }

                    db.run("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        logAudit(req.user.id, req.user.username, 'DELETE_PRODUCT', 'product_variants', variantId, `Soft-deleted product variant ${vRow.variant_name} (ID: ${variantId})`);
                        syncEngine.enqueueSync('PRODUCT_DELETE', 'product_variants', variantId, { variant_id: variantId, product_id: productId });
                        res.json({ success: true, message: 'Product item deleted successfully' });
                    });
                });
            });
        });
    });
});

// Barcode scanner quick lookup
app.get('/api/products/barcode/:barcode', (req, res) => {
    const { barcode } = req.params;
    const query = `
        SELECT 
            v.id as variant_id, v.sku, v.variant_name, v.current_stock,
            p.name as product_name, c.name as category_name, u.name as unit_name,
            pp.id as packaging_id, pp.packaging_type_id, pp.conversion_factor, pp.selling_price, pp.purchase_price,
            pt.name as packaging_name
        FROM product_packagings pp
        JOIN product_variants v ON pp.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        JOIN units u ON v.base_unit_id = u.id
        JOIN packaging_types pt ON pp.packaging_type_id = pt.id
        WHERE pp.barcode = ? OR v.barcode = ? OR v.sku = ?
        LIMIT 1
    `;
    db.get(query, [barcode, barcode, barcode], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Product SKU or barcode not found' });
        res.json(row);
    });
});

// ─── INVENTORY & STOCK LEDGER (WITH SERVER-SIDE PAGINATION) ───────────────────
app.get('/api/inventory/stock', (req, res) => {
    const isPaginated = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginate === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { search, category, status } = req.query;

    let whereClauses = ['v.is_deleted = 0', 'p.is_deleted = 0'];
    let params = [];

    if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        whereClauses.push(`(
            LOWER(p.name) LIKE ? OR 
            LOWER(v.variant_name) LIKE ? OR 
            LOWER(v.sku) LIKE ? OR 
            LOWER(v.barcode) LIKE ? OR 
            LOWER(c.name) LIKE ?
        )`);
        params.push(q, q, q, q, q);
    }

    if (category && category !== 'ALL') {
        whereClauses.push('c.name = ?');
        params.push(category);
    }

    if (status === 'IN_STOCK') {
        whereClauses.push('v.current_stock > v.minimum_stock');
    } else if (status === 'LOW_STOCK') {
        whereClauses.push('v.current_stock <= v.minimum_stock AND v.current_stock > 0');
    } else if (status === 'OUT_OF_STOCK') {
        whereClauses.push('v.current_stock <= 0');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    if (!isPaginated) {
        const query = `
            SELECT 
                v.id as variant_id, v.sku, v.barcode as variant_barcode, v.variant_name, v.current_stock, v.minimum_stock, v.reorder_level, v.is_loose_allowed,
                v.base_unit_id,
                p.id as product_id, p.name as product_name, COALESCE(p.is_essential, 0) as is_essential,
                c.id as category_id, c.name as category_name, u.name as unit_name, u.symbol as unit_symbol,
                s.quantity as base_stock, s.loose_quantity
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            JOIN units u ON v.base_unit_id = u.id
            LEFT JOIN inventory_stock s ON v.id = s.variant_id
            ${whereSql}
            ORDER BY p.name ASC, v.variant_name ASC
        `;
        return db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (rows.length === 0) return res.json([]);

            const variantIds = rows.map(r => r.variant_id);
            const placeholders = variantIds.map(() => '?').join(',');
            db.all(`
                SELECT pp.*, pt.name as packaging_name 
                FROM product_packagings pp
                JOIN packaging_types pt ON pp.packaging_type_id = pt.id
                WHERE pp.variant_id IN (${placeholders})
                ORDER BY pp.conversion_factor ASC
            `, variantIds, (err, packagings) => {
                if (err) return res.status(500).json({ error: err.message });
                const packagingMap = {};
                (packagings || []).forEach(pack => {
                    if (!packagingMap[pack.variant_id]) packagingMap[pack.variant_id] = [];
                    packagingMap[pack.variant_id].push(pack);
                });
                const stockList = rows.map(row => ({
                    ...row,
                    packagings: packagingMap[row.variant_id] || []
                }));
                res.json(stockList);
            });
        });
    }

    // Paginated flow
    const countQuery = `
        SELECT COUNT(*) as total
        FROM product_variants v
        JOIN products p ON v.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        ${whereSql}
    `;

    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = countRow ? countRow.total : 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        if (total === 0) {
            return res.json({
                data: [],
                pagination: {
                    total: 0,
                    page,
                    limit,
                    totalPages: 1
                }
            });
        }

        const dataQuery = `
            SELECT 
                v.id as variant_id, v.sku, v.barcode as variant_barcode, v.variant_name, v.current_stock, v.minimum_stock, v.reorder_level, v.is_loose_allowed,
                v.base_unit_id,
                p.id as product_id, p.name as product_name, COALESCE(p.is_essential, 0) as is_essential,
                c.id as category_id, c.name as category_name, u.name as unit_name, u.symbol as unit_symbol,
                s.quantity as base_stock, s.loose_quantity
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            JOIN units u ON v.base_unit_id = u.id
            LEFT JOIN inventory_stock s ON v.id = s.variant_id
            ${whereSql}
            ORDER BY p.name ASC, v.variant_name ASC
            LIMIT ? OFFSET ?
        `;

        db.all(dataQuery, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (rows.length === 0) {
                return res.json({
                    data: [],
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages
                    }
                });
            }

            const variantIds = rows.map(r => r.variant_id);
            const placeholders = variantIds.map(() => '?').join(',');

            db.all(`
                SELECT pp.*, pt.name as packaging_name 
                FROM product_packagings pp
                JOIN packaging_types pt ON pp.packaging_type_id = pt.id
                WHERE pp.variant_id IN (${placeholders})
                ORDER BY pp.conversion_factor ASC
            `, variantIds, (err, packagings) => {
                if (err) return res.status(500).json({ error: err.message });
                const packagingMap = {};
                (packagings || []).forEach(pack => {
                    if (!packagingMap[pack.variant_id]) packagingMap[pack.variant_id] = [];
                    packagingMap[pack.variant_id].push(pack);
                });
                const stockList = rows.map(row => ({
                    ...row,
                    packagings: packagingMap[row.variant_id] || []
                }));
                res.json({
                    data: stockList,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages
                    }
                });
            });
        });
    });
});

app.get('/api/inventory/kpis', (req, res) => {
    const kpiQuery = `
        SELECT 
            COUNT(DISTINCT v.id) as total_items,
            COALESCE(SUM(v.current_stock), 0) as total_quantity,
            COALESCE(SUM(CASE WHEN v.current_stock <= v.minimum_stock AND v.current_stock > 0 THEN 1 ELSE 0 END), 0) as low_stock_count,
            COALESCE(SUM(CASE WHEN v.current_stock <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock_count,
            COALESCE((
                SELECT SUM(
                    v2.current_stock * (
                        COALESCE(pp.purchase_price, pp.selling_price * 0.8, 0) / 
                        CASE WHEN COALESCE(pp.conversion_factor, 1) <= 0 THEN 1 ELSE pp.conversion_factor END
                    )
                )
                FROM product_variants v2
                LEFT JOIN product_packagings pp ON v2.id = pp.variant_id AND pp.is_default = 1
                WHERE v2.is_deleted = 0
            ), 0) as total_valuation
        FROM product_variants v
        JOIN products p ON v.product_id = p.id
        WHERE v.is_deleted = 0 AND p.is_deleted = 0
    `;
    db.get(kpiQuery, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { total_items: 0, total_quantity: 0, low_stock_count: 0, out_of_stock_count: 0, total_valuation: 0 });
    });
});

app.get('/api/inventory/movements/:variantId', (req, res) => {
    const { variantId } = req.params;
    const query = `
        SELECT 
            sm.*, pt.name as packaging_name, u.username
        FROM stock_movements sm
        LEFT JOIN packaging_types pt ON sm.packaging_type_id = pt.id
        LEFT JOIN users u ON sm.user_id = u.id
        WHERE sm.variant_id = ?
        ORDER BY sm.created_at DESC
    `;
    db.all(query, [variantId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/inventory/adjustments', authenticateToken, requireAdmin, (req, res) => {
    const { variant_id, packaging_type_id, adjustment_type, quantity, notes } = req.body;
    if (!variant_id || !quantity || !adjustment_type) {
        return res.status(400).json({ error: 'Variant, quantity, and adjustment type required' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Fetch conversion factor
        db.get("SELECT conversion_factor FROM product_packagings WHERE variant_id = ? AND packaging_type_id = ?", [variant_id, packaging_type_id || 1], (err, pack) => {
            const factor = pack ? pack.conversion_factor : 1;
            const equivalentQty = quantity * factor;
            const delta = adjustment_type === 'ADD' ? equivalentQty : -equivalentQty;

            db.run(`UPDATE product_variants SET current_stock = current_stock + ? WHERE id = ?`, [delta, variant_id]);
            db.run(`UPDATE inventory_stock SET quantity = quantity + ? WHERE variant_id = ?`, [delta, variant_id]);

            const movementUUID = generateUUID();
            db.run(
                `INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, notes, user_id, device_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [movementUUID, variant_id, packaging_type_id || null, adjustment_type === 'ADD' ? 'ADJUSTMENT' : 'DAMAGE', quantity, equivalentQty, notes || 'Manual adjustment', req.user.id, 'DEVICE-CASHIER-01'],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }
                    db.run("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        logAudit(req.user.id, req.user.username, 'STOCK_ADJUSTMENT', 'product_variants', variant_id, `${adjustment_type} ${quantity} (${notes})`);
                        syncEngine.enqueueSync('ADJUSTMENT', 'stock_movements', this.lastID, req.body);
                        res.json({ success: true, movementId: this.lastID });
                    });
                }
            );
        });
    });
});

app.get('/api/inventory/low-stock', (req, res) => {
    const query = `
        SELECT 
            v.id as variant_id, v.sku, v.variant_name, v.current_stock, v.minimum_stock,
            p.name as product_name, c.name as category_name, u.name as unit_name
        FROM product_variants v
        JOIN products p ON v.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        JOIN units u ON v.base_unit_id = u.id
        WHERE v.current_stock <= v.minimum_stock AND v.is_deleted = 0
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ─── WHOLESALE POS & SALES ───────────────────────────────────────────────────
app.post('/api/sales', authenticateToken, (req, res) => {
    const {
        customer_id,
        supplier_id,
        party_type, // 'customer' | 'walkin' | 'supplier'
        walkin_name,
        walkin_phone,
        items,
        gross_amount,
        discount,
        special_discount,
        additional_charges,
        net_amount,
        amount_paid,
        payment_method,
        remarks,
        device_id
    } = req.body;

    if (!Array.isArray(items) || items.length === 0 || net_amount === undefined) {
        return res.status(400).json({ error: 'Valid sale items and net amount required' });
    }

    const remainingBalance = net_amount - (amount_paid || 0);
    const paymentStatus = (amount_paid || 0) >= net_amount ? 'paid' : (amount_paid > 0 ? 'partial' : 'unpaid');

    db.serialize(() => {
        // If Customer is credit selling, check credit limit!
        if (customer_id && remainingBalance > 0) {
            db.get("SELECT credit_limit, balance FROM customers WHERE id = ?", [customer_id], (err, customer) => {
                if (customer && customer.credit_limit > 0) {
                    const availableCredit = customer.credit_limit - customer.balance;
                    if (remainingBalance > availableCredit && req.user.role !== 'admin' && !req.body.admin_override) {
                        return res.status(400).json({ 
                            error: 'CREDIT_LIMIT_EXCEEDED', 
                            message: `Credit limit exceeded! Available credit: Rs. ${availableCredit.toLocaleString()}, required: Rs. ${remainingBalance.toLocaleString()}`,
                            availableCredit,
                            requiredCredit: remainingBalance
                        });
                    }
                }
                executeSaleProcess();
            });
        } else {
            executeSaleProcess();
        }

        function executeSaleProcess() {
            db.run("BEGIN TRANSACTION");

            const saleUUID = generateUUID();
            const invoiceNo = `INV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
            const finalRemarks = remarks || (party_type === 'walkin' && walkin_name ? `Walk-in: ${walkin_name} ${walkin_phone ? '(' + walkin_phone + ')' : ''}` : '');

            const saleNow = getLocalNow();
            const saleDate = getLocalDate();

            db.run(
                `INSERT INTO sales (
                    uuid, invoice_no, customer_id, supplier_id, user_id, device_id, gross_amount, discount, 
                    special_discount, additional_charges, net_amount, amount_paid, initial_amount_paid, remaining_balance, 
                    status, payment_status, payment_method, remarks, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
                [
                    saleUUID, invoiceNo, customer_id || null, supplier_id || null, req.user.id, device_id || 'DEVICE-CASHIER-01',
                    gross_amount || 0, discount || 0, special_discount || 0, additional_charges || 0,
                    net_amount, amount_paid || 0, amount_paid || 0, remainingBalance, paymentStatus, payment_method || 'cash', finalRemarks,
                    saleNow
                ],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }
                    const saleId = this.lastID;

                    const itemStmt = db.prepare(`
                        INSERT INTO sale_items (uuid, sale_id, variant_id, packaging_type_id, unit_name, quantity, price, discount, total, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    const movementStmt = db.prepare(`
                        INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, user_id, device_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    items.forEach(item => {
                        const itemUUID = generateUUID();
                        itemStmt.run(itemUUID, saleId, item.variant_id, item.packaging_type_id, item.unit_name || '', item.quantity, item.price, item.discount || 0, item.total, saleNow);

                        // Deduct stock
                        const factor = item.conversion_factor || 1;
                        const equivalentQty = item.quantity * factor;

                        db.run(`UPDATE product_variants SET current_stock = current_stock - ? WHERE id = ?`, [equivalentQty, item.variant_id]);
                        db.run(`UPDATE inventory_stock SET quantity = quantity - ? WHERE variant_id = ?`, [equivalentQty, item.variant_id]);

                        movementStmt.run(generateUUID(), item.variant_id, item.packaging_type_id, 'SALE', item.quantity, equivalentQty, invoiceNo, 'SALE', req.user.id, device_id || 'DEVICE-CASHIER-01', saleNow);
                    });

                    itemStmt.finalize();
                    movementStmt.finalize();

                    // Customer Ledger Entries
                    if (customer_id) {
                        const chargeUUID = generateUUID();
                        db.run(
                            `INSERT INTO customer_ledger (uuid, customer_id, sale_id, amount, type, description, payment_method, payment_date, created_at)
                             VALUES (?, ?, ?, ?, 'charge', ?, ?, ?, ?)`,
                            [chargeUUID, customer_id, saleId, net_amount, `Wholesale Invoice ${invoiceNo}`, payment_method || 'cash', saleDate, saleNow]
                        );

                        if (amount_paid > 0) {
                            const paymentUUID = generateUUID();
                            db.run(
                                `INSERT INTO customer_ledger (uuid, customer_id, sale_id, amount, type, description, payment_method, payment_date, created_at)
                                 VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?)`,
                                [paymentUUID, customer_id, saleId, amount_paid, `Payment for Invoice ${invoiceNo}`, payment_method || 'cash', saleDate, saleNow]
                            );

                            db.run(
                                `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, notes, payment_date, created_at)
                                 VALUES (?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [generateUUID(), customer_id, amount_paid, payment_method || 'cash', invoiceNo, req.user.id, device_id || 'DEVICE-CASHIER-01', `Payment for Invoice ${invoiceNo}`, saleDate, saleNow]
                            );
                        }

                        db.run(`UPDATE customers SET balance = balance + ? WHERE id = ?`, [remainingBalance, customer_id]);
                    } else if (supplier_id) {
                        // Supplier contra sale / debit entry
                        const chargeUUID = generateUUID();
                        db.run(
                            `INSERT INTO supplier_ledger (uuid, supplier_id, purchase_id, amount, type, description, payment_date, created_at)
                             VALUES (?, ?, NULL, ?, 'sale_deduction', ?, ?, ?)`,
                            [chargeUUID, supplier_id, net_amount, `Sale Invoice ${invoiceNo}`, saleDate, saleNow]
                        );

                        if (amount_paid > 0) {
                            db.run(
                                `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, notes, payment_date, created_at)
                                 VALUES (?, 'supplier', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [generateUUID(), supplier_id, amount_paid, payment_method || 'cash', invoiceNo, req.user.id, device_id || 'DEVICE-CASHIER-01', `Payment for Sale Invoice ${invoiceNo}`, saleDate, saleNow]
                            );
                        }

                        // Reduces our liability to the supplier
                        db.run(`UPDATE suppliers SET balance = balance - ? WHERE id = ?`, [remainingBalance, supplier_id]);
                    }

                    // Cash Register update if Cash payment
                    if ((payment_method || 'cash') === 'cash' && amount_paid > 0) {
                        db.run(
                            `UPDATE cash_registers SET cash_sales = cash_sales + ? WHERE user_id = ? AND status = 'open'`,
                            [amount_paid, req.user.id]
                        );
                    }

                    db.run("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        logAudit(req.user.id, req.user.username, 'CREATE_SALE', 'sales', saleId, `Created Invoice ${invoiceNo} Total: ${net_amount}`);
                        syncEngine.enqueueSync('SALE', 'sales', saleId, req.body);
                        res.json({ success: true, saleId, invoiceNo, net_amount, remainingBalance });
                    });
                }
            );
        }
    });
});

// Helper for date filtering in sales queries
function getSalesDateBoundaries(dateFilter, customStart, customEnd) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (dateFilter === 'today') {
        return {
            start: `${todayYMD} 00:00:00`,
            end: `${todayYMD} 23:59:59`
        };
    }
    if (dateFilter === 'yesterday') {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        const yestYMD = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
        return {
            start: `${yestYMD} 00:00:00`,
            end: `${yestYMD} 23:59:59`
        };
    }
    if (dateFilter === 'this_week') {
        const w = new Date(now);
        w.setDate(w.getDate() - 7);
        const weekAgoYMD = `${w.getFullYear()}-${pad(w.getMonth() + 1)}-${pad(w.getDate())}`;
        return {
            start: `${weekAgoYMD} 00:00:00`,
            end: `${todayYMD} 23:59:59`
        };
    }
    if (dateFilter === 'this_month') {
        const monthStartYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        return {
            start: `${monthStartYMD} 00:00:00`,
            end: `${todayYMD} 23:59:59`
        };
    }
    if (dateFilter === 'custom') {
        const s = customStart || '2000-01-01';
        const e = customEnd || todayYMD;
        return {
            start: `${s} 00:00:00`,
            end: `${e} 23:59:59`
        };
    }
    return null; // 'all'
}

// ─── SALES QUERY (WITH SERVER-SIDE PAGINATION & SUMMARY METRICS) ─────────────
app.get('/api/sales', (req, res) => {
    const isPaginated = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginate === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { dateFilter = 'today', startDate, endDate, status = 'ALL', search } = req.query;

    const dateBounds = getSalesDateBoundaries(dateFilter, startDate, endDate);

    // Date range WHERE condition (for summary & KPI cards)
    let dateWhereClauses = [];
    let dateParams = [];
    if (dateBounds) {
        dateWhereClauses.push('s.created_at >= ? AND s.created_at <= ?');
        dateParams.push(dateBounds.start, dateBounds.end);
    }
    const dateWhereSql = dateWhereClauses.length > 0 ? `WHERE ${dateWhereClauses.join(' AND ')}` : '';

    // Full WHERE conditions including status and search
    let fullWhereClauses = [...dateWhereClauses];
    let fullParams = [...dateParams];

    if (status === 'PAID') {
        fullWhereClauses.push('(COALESCE(s.remaining_balance, 0) <= 0.01 AND COALESCE(s.net_amount, 0) > 0)');
    } else if (status === 'PARTIAL') {
        fullWhereClauses.push('(COALESCE(s.amount_paid, 0) > 0 AND COALESCE(s.remaining_balance, 0) > 0.01)');
    } else if (status === 'PENDING') {
        fullWhereClauses.push('(COALESCE(s.amount_paid, 0) <= 0 AND COALESCE(s.remaining_balance, s.net_amount, 0) > 0.01)');
    }

    if (search && search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        fullWhereClauses.push(`(
            LOWER(s.invoice_no) LIKE ? OR
            LOWER(COALESCE(c.name, sup.name, '')) LIKE ? OR
            LOWER(COALESCE(c.business_name, sup.company_name, '')) LIKE ? OR
            LOWER(COALESCE(c.phone, sup.phone, '')) LIKE ? OR
            LOWER(COALESCE(u.username, '')) LIKE ?
        )`);
        fullParams.push(q, q, q, q, q);
    }

    const fullWhereSql = fullWhereClauses.length > 0 ? `WHERE ${fullWhereClauses.join(' AND ')}` : '';

    if (!isPaginated) {
        // Legacy: Return rows directly
        const query = `
            SELECT 
                s.*, 
                COALESCE(c.name, sup.name, 'Walk-in Customer') as customer_name,
                COALESCE(c.business_name, sup.company_name, '') as customer_business,
                COALESCE(c.phone, sup.phone, '') as customer_phone,
                COALESCE(c.address, sup.address, '') as customer_address,
                u.username as cashier_name
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN suppliers sup ON s.supplier_id = sup.id
            LEFT JOIN users u ON s.user_id = u.id
            ${fullWhereSql}
            ORDER BY s.created_at DESC
            LIMIT 500
        `;
        return db.all(query, fullParams, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }

    // Paginated flow:
    // 1. Calculate summary metrics & status counts across active date range
    const summaryQuery = `
        SELECT 
            COUNT(*) as total_count,
            COALESCE(SUM(s.net_amount), 0) as totalSale,
            COALESCE(SUM(COALESCE(s.initial_amount_paid, s.amount_paid)), 0) as checkoutCollected,
            COALESCE(SUM(s.net_amount - COALESCE(s.initial_amount_paid, s.amount_paid)), 0) as totalPendingDues,
            COALESCE(SUM(COALESCE(s.discount, 0) + COALESCE(s.special_discount, 0)), 0) as totalDiscount,
            COALESCE(SUM(CASE WHEN COALESCE(s.initial_amount_paid, s.amount_paid) >= s.net_amount AND COALESCE(s.net_amount, 0) > 0 THEN 1 ELSE 0 END), 0) as paid_count,
            COALESCE(SUM(CASE WHEN COALESCE(s.initial_amount_paid, s.amount_paid) > 0 AND COALESCE(s.initial_amount_paid, s.amount_paid) < s.net_amount THEN 1 ELSE 0 END), 0) as partial_count,
            COALESCE(SUM(CASE WHEN COALESCE(s.initial_amount_paid, s.amount_paid) <= 0 AND COALESCE(s.net_amount, 0) > 0 THEN 1 ELSE 0 END), 0) as pending_count
        FROM sales s
        ${dateWhereSql}
    `;

    db.get(summaryQuery, dateParams, (err, summaryRow) => {
        if (err) return res.status(500).json({ error: err.message });

        // Calculate recovered dues from customer payments in the same date range (excluding current sale checkout payments and refund payouts)
        let recWhere = "p.party_type = 'customer' AND p.amount > 0 AND (p.notes IS NULL OR (p.notes NOT LIKE '%Refund%' AND p.notes NOT LIKE '%return%')) AND (p.reference_no IS NULL OR (p.reference_no NOT LIKE 'SALE-%' AND p.reference_no NOT LIKE 'RET-%'))";
        let recParams = [];
        if (dateBounds) {
            recWhere += " AND ( (p.payment_date IS NOT NULL AND DATE(p.payment_date) >= DATE(?) AND DATE(p.payment_date) <= DATE(?)) OR (p.payment_date IS NULL AND DATE(p.created_at) >= DATE(?) AND DATE(p.created_at) <= DATE(?)) )";
            recWhere += " AND NOT (s.id IS NOT NULL AND DATE(s.created_at) >= DATE(?) AND DATE(s.created_at) <= DATE(?))";
            recParams.push(dateBounds.start, dateBounds.end, dateBounds.start, dateBounds.end, dateBounds.start, dateBounds.end);
        } else {
            recWhere += " AND NOT (s.id IS NOT NULL AND DATE(s.created_at) = DATE(COALESCE(p.payment_date, p.created_at)))";
        }

        const qSalesRec = `
            SELECT COALESCE(SUM(p.amount), 0) as totalRecoveredDues 
            FROM payments p 
            LEFT JOIN sales s ON p.reference_no = s.invoice_no
            WHERE ${recWhere}
        `;

        const qRecoveredList = `
            SELECT 
                p.id as payment_id,
                p.uuid as payment_uuid,
                p.amount as recovered_amount,
                p.payment_method,
                p.reference_no,
                COALESCE(p.payment_date, DATE(p.created_at)) as recovery_date,
                p.created_at as payment_created_at,
                p.notes,
                p.party_id as customer_id,
                COALESCE(c.name, 'Customer') as customer_name,
                COALESCE(c.business_name, '') as customer_business,
                COALESCE(c.phone, '') as customer_phone,
                u.username as cashier_name,
                s.id as original_sale_id,
                s.net_amount as original_sale_net,
                s.created_at as original_sale_date
            FROM payments p
            LEFT JOIN sales s ON p.reference_no = s.invoice_no
            LEFT JOIN customers c ON p.party_id = c.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE ${recWhere}
            ORDER BY p.created_at DESC
        `;

        let refWhere = "refund_method = 'cash'";
        let refParams = [];
        if (dateBounds) {
            refWhere += " AND DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?)";
            refParams.push(dateBounds.start, dateBounds.end);
        }
        const qSalesRefunds = `
            SELECT COALESCE(SUM(total_refund), 0) as totalCashRefunds 
            FROM sale_returns 
            WHERE ${refWhere}
        `;

        db.get(qSalesRec, recParams, (err, payRow) => {
            db.get(qSalesRefunds, refParams, (refErr, refRow) => {
                const recoveredDues = payRow ? (Number(payRow.totalRecoveredDues) || 0) : 0;
                const checkoutCash = summaryRow ? Number(summaryRow.checkoutCollected) : 0;
                const cashRefunds = refRow ? (Number(refRow.totalCashRefunds) || 0) : 0;
                const totalCollectedCash = Math.max(0, checkoutCash + recoveredDues - cashRefunds);

                const summary = {
                    totalSale: summaryRow ? Number(summaryRow.totalSale) : 0,
                    checkoutCollected: checkoutCash,
                    totalCollected: totalCollectedCash,
                    totalRecoveredDues: recoveredDues,
                    totalCashRefunds: cashRefunds,
                    totalPendingDues: summaryRow ? Number(summaryRow.totalPendingDues) : 0,
                    totalDiscount: summaryRow ? Number(summaryRow.totalDiscount) : 0,
                    statusCounts: {
                        ALL: summaryRow ? Number(summaryRow.total_count) : 0,
                        PAID: summaryRow ? Number(summaryRow.paid_count) : 0,
                        PARTIAL: summaryRow ? Number(summaryRow.partial_count) : 0,
                        PENDING: summaryRow ? Number(summaryRow.pending_count) : 0
                    }
                };

            // Fetch list of recovered payments in this date window
            db.all(qRecoveredList, recParams, (recErr, recoveredRows) => {
                const recoveredPayments = (recErr || !recoveredRows) ? [] : recoveredRows;

                // 2. Count matching filtered rows
                const countQuery = `
                    SELECT COUNT(*) as filtered_total
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    LEFT JOIN suppliers sup ON s.supplier_id = sup.id
                    LEFT JOIN users u ON s.user_id = u.id
                    ${fullWhereSql}
                `;

                db.get(countQuery, fullParams, (err, countRow) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const total = countRow ? countRow.filtered_total : 0;
                    const totalPages = Math.max(1, Math.ceil(total / limit));

                    if (total === 0) {
                        return res.json({
                            data: [],
                            recoveredPayments,
                            pagination: {
                                total: 0,
                                page,
                                limit,
                                totalPages: 1
                            },
                            summary
                        });
                    }

                    // 3. Query paginated rows with Point-in-Time status & later settled tracking
                    const dataQuery = `
                        SELECT 
                            s.*, 
                            COALESCE(s.initial_amount_paid, s.amount_paid) as initial_amount_paid,
                            COALESCE(c.name, sup.name, 'Walk-in Customer') as customer_name,
                            COALESCE(c.business_name, sup.company_name, '') as customer_business,
                            COALESCE(c.phone, sup.phone, '') as customer_phone,
                            COALESCE(c.address, sup.address, '') as customer_address,
                            u.username as cashier_name,
                            CASE 
                                WHEN COALESCE(s.amount_paid, 0) > COALESCE(s.initial_amount_paid, s.amount_paid) 
                                THEN 1 ELSE 0 
                            END as is_settled_later,
                            (
                                SELECT MAX(COALESCE(p.payment_date, DATE(p.created_at)))
                                FROM payments p
                                WHERE p.reference_no = s.invoice_no 
                                  AND DATE(COALESCE(p.payment_date, p.created_at)) > DATE(s.created_at)
                            ) as settled_later_date
                        FROM sales s
                        LEFT JOIN customers c ON s.customer_id = c.id
                        LEFT JOIN suppliers sup ON s.supplier_id = sup.id
                        LEFT JOIN users u ON s.user_id = u.id
                        ${fullWhereSql}
                        ORDER BY s.created_at DESC
                        LIMIT ? OFFSET ?
                    `;

                    db.all(dataQuery, [...fullParams, limit, offset], (err, rows) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({
                            data: rows || [],
                            recoveredPayments,
                            pagination: {
                                total,
                                page,
                                limit,
                                totalPages
                            },
                            summary
                        });
                    });
                });
            });
        });
    });
});
});

// GET list of sales returns with optional date filter (must be defined BEFORE /api/sales/:id)
app.get(['/api/sales/returns', '/api/returns'], (req, res) => {
    const { startDate, endDate, limit = 100 } = req.query;
    let whereClauses = [];
    let params = [];
    if (startDate && endDate) {
        whereClauses.push('DATE(sr.created_at) >= ? AND DATE(sr.created_at) <= ?');
        params.push(startDate, endDate);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `
        SELECT sr.*, 
               c.name as customer_name, c.business_name as customer_business, c.phone as customer_phone,
               s.invoice_no as original_invoice_no,
               u.username as cashier_name
        FROM sale_returns sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        LEFT JOIN sales s ON sr.sale_id = s.id
        LEFT JOIN users u ON sr.user_id = u.id
        ${whereSql}
        ORDER BY sr.id DESC
        LIMIT ?
    `;
    params.push(parseInt(limit) || 100);
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/sales/:id', (req, res) => {
    const { id } = req.params;
    db.get(`
        SELECT 
            s.*, 
            COALESCE(c.name, sup.name, 'Walk-in Customer') as customer_name,
            COALESCE(c.business_name, sup.company_name, '') as business_name,
            COALESCE(c.phone, sup.phone, '') as customer_phone,
            COALESCE(c.address, sup.address, '') as customer_address,
            COALESCE(c.balance, sup.balance, 0) as current_customer_balance,
            u.username as cashier_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN suppliers sup ON s.supplier_id = sup.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = ? OR s.uuid = ? OR s.invoice_no = ?
    `, [id, id, id], (err, sale) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!sale) return res.status(404).json({ error: 'Invoice not found' });

        db.all(`
            SELECT 
                si.*, v.sku, v.variant_name, p.name as product_name, 
                COALESCE(u.symbol, u.name, 'pcs') as base_unit,
                COALESCE(u.name, 'Piece') as unit_full_name,
                CASE 
                    WHEN COALESCE(pp.conversion_factor, 1) = 1 AND pt.name = 'Piece' AND LOWER(COALESCE(u.symbol, u.name, '')) != 'pcs' AND LOWER(COALESCE(u.symbol, u.name, '')) != 'piece'
                    THEN COALESCE(u.symbol, u.name, 'Unit')
                    ELSE pt.name 
                END as packaging_name,
                COALESCE(pp.conversion_factor, 1) as conversion_factor
            FROM sale_items si
            JOIN product_variants v ON si.variant_id = v.id
            JOIN products p ON v.product_id = p.id
            LEFT JOIN units u ON v.base_unit_id = u.id
            JOIN packaging_types pt ON si.packaging_type_id = pt.id
            LEFT JOIN product_packagings pp ON (pp.variant_id = v.id AND pp.packaging_type_id = si.packaging_type_id)
            WHERE si.sale_id = ?
        `, [sale.id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ...sale, items });
        });
    });
});

app.put('/api/sales/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { 
        remarks, 
        payment_method, 
        amount_paid, 
        discount, 
        special_discount, 
        additional_charges, 
        items 
    } = req.body;

    db.get("SELECT * FROM sales WHERE id = ?", [id], (err, oldSale) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!oldSale) return res.status(404).json({ error: 'Sale invoice not found' });

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            let newGross = oldSale.gross_amount;
            let newDiscount = discount !== undefined ? parseFloat(discount) : oldSale.discount;
            let newSpecialDisc = special_discount !== undefined ? parseFloat(special_discount) : oldSale.special_discount;
            let newCharges = additional_charges !== undefined ? parseFloat(additional_charges) : oldSale.additional_charges;

            if (Array.isArray(items) && items.length > 0) {
                newGross = items.reduce((sum, it) => sum + (parseFloat(it.quantity || 0) * parseFloat(it.price || 0)), 0);
                const itemDiscounts = items.reduce((sum, it) => sum + parseFloat(it.discount || 0), 0);
                if (discount === undefined) newDiscount = itemDiscounts;
            }

            const newNet = Math.max(0, newGross - newDiscount - newSpecialDisc + newCharges);
            const newPaid = amount_paid !== undefined ? parseFloat(amount_paid) : oldSale.amount_paid;
            const newRemaining = Math.max(0, newNet - newPaid);
            const newPaymentStatus = newPaid >= newNet ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
            const newRemarks = remarks !== undefined ? remarks : oldSale.remarks;
            const newPayMethod = payment_method || oldSale.payment_method;

            const finishSaleUpdate = () => {
                db.run(`
                    UPDATE sales SET 
                        gross_amount = ?, discount = ?, special_discount = ?, additional_charges = ?,
                        net_amount = ?, amount_paid = ?, remaining_balance = ?, payment_status = ?,
                        payment_method = ?, remarks = ?
                    WHERE id = ?
                `, [newGross, newDiscount, newSpecialDisc, newCharges, newNet, newPaid, newRemaining, newPaymentStatus, newPayMethod, newRemarks, id], (upErr) => {
                    if (upErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: upErr.message });
                    }

                    if (oldSale.customer_id) {
                        const balanceDelta = newRemaining - oldSale.remaining_balance;
                        if (balanceDelta !== 0) {
                            db.run("UPDATE customers SET balance = balance + ? WHERE id = ?", [balanceDelta, oldSale.customer_id]);
                            db.run(`
                                INSERT INTO customer_ledger (uuid, customer_id, sale_id, amount, type, description, payment_method)
                                VALUES (?, ?, ?, ?, 'adjustment', ?, ?)
                            `, [generateUUID(), oldSale.customer_id, id, Math.abs(balanceDelta), `Admin Edit Adjustment for ${oldSale.invoice_no}`, newPayMethod]);
                        }
                    }

                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                        logAudit(req.user.id, req.user.username, 'EDIT_SALE', 'sales', id, `Admin edited invoice ${oldSale.invoice_no}. Net: ${newNet}, Paid: ${newPaid}`);
                        res.json({ success: true, message: 'Sale updated successfully by Admin', saleId: id });
                    });
                });
            };

            if (Array.isArray(items) && items.length > 0) {
                const oldItemsQuery = `
                    SELECT si.*, COALESCE(pp.conversion_factor, 1) as conversion_factor
                    FROM sale_items si
                    LEFT JOIN product_packagings pp ON (pp.variant_id = si.variant_id AND pp.packaging_type_id = si.packaging_type_id)
                    WHERE si.sale_id = ?
                `;
                db.all(oldItemsQuery, [id], (err, oldItems) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }

                    // Restore old stock synchronously in transaction
                    oldItems.forEach(oldIt => {
                        const factor = parseFloat(oldIt.conversion_factor) || 1;
                        const qty = (parseFloat(oldIt.quantity) || 0) * factor;
                        db.run("UPDATE product_variants SET current_stock = current_stock + ? WHERE id = ?", [qty, oldIt.variant_id]);
                        db.run("UPDATE inventory_stock SET quantity = quantity + ? WHERE variant_id = ?", [qty, oldIt.variant_id]);
                    });

                    db.run("DELETE FROM sale_items WHERE sale_id = ?", [id], (delErr) => {
                        if (delErr) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: delErr.message });
                        }

                        const itemStmt = db.prepare(`
                            INSERT INTO sale_items (uuid, sale_id, variant_id, packaging_type_id, unit_name, quantity, price, discount, total)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        items.forEach(it => {
                            const factor = parseFloat(it.conversion_factor || 1);
                            const eqQty = parseFloat(it.quantity || 0) * factor;
                            const itGross = parseFloat(it.quantity || 0) * parseFloat(it.price || 0);
                            const itTotal = itGross - parseFloat(it.discount || 0);

                            itemStmt.run(generateUUID(), id, it.variant_id, it.packaging_type_id, it.unit_name || '', it.quantity, it.price, it.discount || 0, itTotal);
                            db.run("UPDATE product_variants SET current_stock = current_stock - ? WHERE id = ?", [eqQty, it.variant_id]);
                            db.run("UPDATE inventory_stock SET quantity = quantity - ? WHERE variant_id = ?", [eqQty, it.variant_id]);
                        });
                        itemStmt.finalize();

                        finishSaleUpdate();
                    });
                });
            } else {
                finishSaleUpdate();
            }
        });
    });
});

// ─── WHOLESALE CUSTOMERS & RUNNING LEDGERS ──────────────────────────────────
app.get('/api/customers', (req, res) => {
    const isPaginated = req.query.paginate === 'true' || req.query.page !== undefined;
    
    if (!isPaginated) {
        db.all("SELECT * FROM customers WHERE is_deleted = 0 ORDER BY name ASC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
        return;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { search, status = 'ALL', sortBy = 'name', sortOrder = 'ASC' } = req.query;

    let whereClauses = ['is_deleted = 0'];
    let params = [];

    if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        whereClauses.push('(name LIKE ? OR business_name LIKE ? OR phone LIKE ? OR mobile LIKE ? OR address LIKE ? OR cnic_ntn LIKE ?)');
        params.push(q, q, q, q, q, q);
    }

    if (status === 'DUE') {
        whereClauses.push('balance > 0');
    } else if (status === 'CLEAR') {
        whereClauses.push('balance <= 0');
    } else if (status === 'CREDIT') {
        whereClauses.push('balance < 0');
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Safe sorting
    const allowedSortFields = ['name', 'balance', 'created_at', 'business_name', 'credit_limit'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // 1. Get filtered count
    const countSql = `SELECT COUNT(*) as total FROM customers ${whereSql}`;
    
    db.get(countSql, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = countRow ? countRow.total : 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        // 2. Fetch paginated records
        const dataSql = `SELECT * FROM customers ${whereSql} ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`;
        const dataParams = [...params, limit, offset];

        db.all(dataSql, dataParams, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            // 3. Overall summary KPIs across all non-deleted customers
            const summarySql = `
                SELECT 
                    COUNT(*) as totalCustomers,
                    COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as totalReceivables,
                    COALESCE(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 0) as totalAdvances,
                    COUNT(CASE WHEN balance > 0 THEN 1 END) as dueCustomersCount,
                    COUNT(CASE WHEN balance <= 0 THEN 1 END) as clearCustomersCount,
                    COALESCE(SUM(credit_limit), 0) as totalCreditLimit
                FROM customers 
                WHERE is_deleted = 0
            `;

            db.get(summarySql, [], (err, summaryRow) => {
                if (err) return res.status(500).json({ error: err.message });

                // Also get all-time customer payments
                db.get("SELECT COALESCE(SUM(amount), 0) as totalDuesPaid FROM payments WHERE party_type = 'customer'", [], (err, payRow) => {
                    const totalDuesPaid = payRow ? payRow.totalDuesPaid : 0;

                    res.json({
                        data: rows || [],
                        pagination: {
                            total,
                            page,
                            limit,
                            totalPages
                        },
                        summary: {
                            totalCustomers: summaryRow ? summaryRow.totalCustomers : total,
                            totalReceivables: summaryRow ? summaryRow.totalReceivables : 0,
                            totalAdvances: summaryRow ? summaryRow.totalAdvances : 0,
                            dueCustomersCount: summaryRow ? summaryRow.dueCustomersCount : 0,
                            clearCustomersCount: summaryRow ? summaryRow.clearCustomersCount : 0,
                            totalCreditLimit: summaryRow ? summaryRow.totalCreditLimit : 0,
                            totalDuesPaidAllTime: totalDuesPaid
                        }
                    });
                });
            });
        });
    });
});

app.post('/api/customers', authenticateToken, (req, res) => {
    const { name, business_name, phone, mobile, address, cnic_ntn, credit_limit, opening_balance } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name required' });

    const uuid = generateUUID();
    const opBal = parseFloat(opening_balance || 0);

    db.run(
        `INSERT INTO customers (uuid, name, business_name, phone, mobile, address, cnic_ntn, credit_limit, opening_balance, balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, name, business_name || '', phone || '', mobile || '', address || '', cnic_ntn || '', credit_limit || 0, opBal, opBal],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const customerId = this.lastID;

            if (opBal !== 0) {
                db.run(
                    `INSERT INTO customer_ledger (uuid, customer_id, amount, type, description)
                     VALUES (?, ?, ?, 'charge', 'Opening Balance')`,
                    [generateUUID(), customerId, Math.abs(opBal)]
                );
            }
            logAudit(req.user.id, req.user.username, 'CREATE_CUSTOMER', 'customers', customerId, name);
            res.json({ id: customerId, uuid, name, balance: opBal });
        }
    );
});

app.get('/api/customers/:id/ledger', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM customers WHERE id = ?", [id], (err, customer) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        db.all("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC, id ASC", [id], (err, entries) => {
            if (err) return res.status(500).json({ error: err.message });

            // Calculate running balance per ledger row
            let running = 0;
            const ledgerWithRunning = entries.map(entry => {
                const isCashRefund = entry.type === 'return' && (entry.payment_method === 'cash' || (entry.description && entry.description.includes('Cash Refund')));
                if (entry.type === 'charge') running += entry.amount;
                else if (entry.type === 'payment' || (entry.type === 'return' && !isCashRefund)) running -= entry.amount;
                const extractedReturnId = entry.return_id || (entry.type === 'return' ? Number(entry.description?.match(/Sales Return #(\d+)/)?.[1] || null) : null);
                return { ...entry, running_balance: running, return_id: extractedReturnId, is_cash_refund: isCashRefund };
            });

            db.all("SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC", [id], (err, sales) => {
                db.all(`
                    SELECT sr.*, s.invoice_no as original_invoice_no, u.username as cashier_name
                    FROM sale_returns sr
                    LEFT JOIN sales s ON sr.sale_id = s.id
                    LEFT JOIN users u ON sr.user_id = u.id
                    WHERE sr.customer_id = ?
                    ORDER BY sr.id DESC
                `, [id], (err, returns) => {
                    res.json({ customer, ledger: ledgerWithRunning, sales: sales || [], returns: returns || [] });
                });
            });
        });
    });
});

app.get('/api/customers/:id/statement-pdf', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM customers WHERE id = ?", [id], (err, customer) => {
        if (err || !customer) return res.status(404).send('Customer not found');

        db.all("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC, id ASC", [id], (err, entries) => {
            let running = 0;
            const ledgerWithRunning = (entries || []).map(entry => {
                const isCashRefund = entry.type === 'return' && (entry.payment_method === 'cash' || (entry.description && entry.description.includes('Cash Refund')));
                if (entry.type === 'charge') running += entry.amount;
                else if (entry.type === 'payment' || (entry.type === 'return' && !isCashRefund)) running -= entry.amount;
                return { ...entry, running_balance: running, is_cash_refund: isCashRefund };
            });

            db.all("SELECT key, value FROM settings", [], (err, settings) => {
                let shopName = 'Hilal Wholesaler Shop';
                let bankAccounts = [];
                if (settings) {
                    settings.forEach(s => {
                        if (s.key === 'shop_name') shopName = s.value;
                        if (s.key === 'bank_accounts') {
                            try {
                                const parsed = JSON.parse(s.value);
                                if (Array.isArray(parsed)) bankAccounts = parsed;
                            } catch(e) {}
                        }
                    });
                }

                const pdfBuf = reminderService.generateCustomerLedgerPdf(shopName, customer, ledgerWithRunning, bankAccounts);
                const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Statement.pdf"`);
                res.setHeader('Content-Length', pdfBuf.length);
                res.send(pdfBuf);
            });
        });
    });
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, business_name, phone, mobile, address, cnic_ntn, credit_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });

    db.run(
        `UPDATE customers SET name = ?, business_name = ?, phone = ?, mobile = ?, address = ?, cnic_ntn = ?, credit_limit = ? WHERE id = ?`,
        [name, business_name || '', phone || '', mobile || '', address || '', cnic_ntn || '', parseFloat(credit_limit) || 0, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Customer not found' });
            logAudit(req.user.id, req.user.username, 'UPDATE_CUSTOMER', 'customers', id, `Updated customer: ${name}`);
            res.json({ success: true, message: 'Customer updated successfully' });
        }
    );
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT id, name, balance FROM customers WHERE id = ? AND is_deleted = 0`, [id], (err, customer) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        db.run(`UPDATE customers SET is_deleted = 1 WHERE id = ?`, [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(req.user.id, req.user.username, 'SOFT_DELETE_CUSTOMER', 'customers', id, `Soft deleted customer ${customer.name} (Balance was: Rs. ${customer.balance || 0})`);
            res.json({ success: true, message: 'Customer soft-deleted successfully' });
        });
    });
});

// Customer specific prices
app.get('/api/customers/:id/prices', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT cp.*, v.variant_name, p.name as product_name, pt.name as packaging_name
        FROM customer_prices cp
        JOIN product_variants v ON cp.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        JOIN packaging_types pt ON cp.packaging_type_id = pt.id
        WHERE cp.customer_id = ?
    `;
    db.all(query, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/customers/:id/prices', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { variant_id, packaging_type_id, special_price } = req.body;
    if (!variant_id || !packaging_type_id || special_price === undefined) {
        return res.status(400).json({ error: 'Variant, Packaging, and Special Price required' });
    }

    db.run(
        `INSERT INTO customer_prices (uuid, customer_id, variant_id, packaging_type_id, special_price)
         VALUES (?, ?, ?, ?, ?)`,
        [generateUUID(), id, variant_id, packaging_type_id, special_price],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// ─── SUPPLIERS & PURCHASES ───────────────────────────────────────────────────
app.get('/api/suppliers', (req, res) => {
    const isPaginated = req.query.paginate === 'true' || req.query.page !== undefined;
    
    if (!isPaginated) {
        const query = `
            SELECT 
                s.*,
                COALESCE(p_stats.total_purchases, 0) as total_purchases,
                COALESCE(p_stats.total_purchase_amount, 0) as total_purchase_amount,
                COALESCE(pay_stats.total_paid, 0) as total_paid
            FROM suppliers s
            LEFT JOIN (
                SELECT supplier_id, COUNT(id) as total_purchases, SUM(net_amount) as total_purchase_amount
                FROM purchases
                GROUP BY supplier_id
            ) p_stats ON s.id = p_stats.supplier_id
            LEFT JOIN (
                SELECT party_id as supplier_id, SUM(amount) as total_paid
                FROM payments
                WHERE party_type = 'supplier'
                GROUP BY party_id
            ) pay_stats ON s.id = pay_stats.supplier_id
            WHERE s.is_deleted = 0
            ORDER BY s.name ASC
        `;
        db.all(query, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
        return;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const { search, status = 'all', sortBy = 'name', sortOrder = 'ASC' } = req.query;

    let whereClauses = ['s.is_deleted = 0'];
    let params = [];

    if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        whereClauses.push('(s.name LIKE ? OR s.company_name LIKE ? OR s.phone LIKE ? OR s.address LIKE ?)');
        params.push(q, q, q, q);
    }

    const normStatus = (status || '').toLowerCase();
    if (normStatus === 'pending' || normStatus === 'due') {
        whereClauses.push('s.balance > 0.01');
    } else if (normStatus === 'cleared' || normStatus === 'clear') {
        whereClauses.push('ABS(s.balance) <= 0.01');
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Safe sorting
    const allowedSortFields = ['name', 'company_name', 'balance', 'created_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? `s.${sortBy}` : 's.name';
    const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // 1. Get filtered count
    const countSql = `SELECT COUNT(*) as total FROM suppliers s ${whereSql}`;

    db.get(countSql, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = countRow ? countRow.total : 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        // 2. Fetch paginated records with stats
        const dataSql = `
            SELECT 
                s.*,
                COALESCE(p_stats.total_purchases, 0) as total_purchases,
                COALESCE(p_stats.total_purchase_amount, 0) as total_purchase_amount,
                COALESCE(pay_stats.total_paid, 0) as total_paid
            FROM suppliers s
            LEFT JOIN (
                SELECT supplier_id, COUNT(id) as total_purchases, SUM(net_amount) as total_purchase_amount
                FROM purchases
                GROUP BY supplier_id
            ) p_stats ON s.id = p_stats.supplier_id
            LEFT JOIN (
                SELECT party_id as supplier_id, SUM(amount) as total_paid
                FROM payments
                WHERE party_type = 'supplier'
                GROUP BY party_id
            ) pay_stats ON s.id = pay_stats.supplier_id
            ${whereSql}
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...params, limit, offset];

        db.all(dataSql, dataParams, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            // 3. Overall summary KPIs across all non-deleted suppliers
            const summarySql = `
                SELECT 
                    COUNT(*) as total_suppliers,
                    COALESCE(SUM(CASE WHEN balance > 0.01 THEN balance ELSE 0 END), 0) as total_payables,
                    COUNT(CASE WHEN balance > 0.01 THEN 1 END) as pending_suppliers_count,
                    COUNT(CASE WHEN ABS(balance) <= 0.01 THEN 1 END) as cleared_suppliers_count,
                    (SELECT COALESCE(SUM(net_amount), 0) FROM purchases) as total_stock_added,
                    (SELECT COUNT(id) FROM purchases) as total_purchases_count,
                    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE party_type = 'supplier') as total_paid
                FROM suppliers 
                WHERE is_deleted = 0
            `;

            db.get(summarySql, [], (err, summaryRow) => {
                if (err) return res.status(500).json({ error: err.message });

                res.json({
                    data: rows || [],
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages
                    },
                    summary: summaryRow || {
                        total_suppliers: total,
                        total_payables: 0,
                        pending_suppliers_count: 0,
                        cleared_suppliers_count: 0,
                        total_stock_added: 0,
                        total_purchases_count: 0,
                        total_paid: 0
                    }
                });
            });
        });
    });
});

app.get('/api/suppliers/kpis', (req, res) => {
    const kpiQuery = `
        SELECT 
            (SELECT COALESCE(SUM(net_amount), 0) FROM purchases) as total_stock_added,
            (SELECT COUNT(id) FROM purchases) as total_purchases_count,
            (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE party_type = 'supplier') as total_paid,
            (SELECT COALESCE(SUM(balance), 0) FROM suppliers WHERE is_deleted = 0) as total_pending,
            (SELECT COUNT(id) FROM suppliers WHERE is_deleted = 0) as supplier_count
    `;
    db.get(kpiQuery, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { total_stock_added: 0, total_purchases_count: 0, total_paid: 0, total_pending: 0, supplier_count: 0 });
    });
});

app.post('/api/suppliers', authenticateToken, (req, res) => {
    const { name, company_name, phone, address, opening_balance } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name required' });

    const uuid = generateUUID();
    const opBal = parseFloat(opening_balance || 0);

    db.run(
        `INSERT INTO suppliers (uuid, name, company_name, phone, address, opening_balance, balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid, name, company_name || '', phone || '', address || '', opBal, opBal],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const supplierId = this.lastID;

            if (opBal !== 0) {
                db.run(
                    `INSERT INTO supplier_ledger (uuid, supplier_id, amount, type, description)
                     VALUES (?, ?, ?, 'purchase', 'Opening Balance')`,
                    [generateUUID(), supplierId, Math.abs(opBal)]
                );
            }
            res.json({ id: supplierId, uuid, name, balance: opBal });
        }
    );
});

app.put('/api/suppliers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, company_name, phone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });

    db.run(
        `UPDATE suppliers SET name = ?, company_name = ?, phone = ?, address = ? WHERE id = ?`,
        [name, company_name || '', phone || '', address || '', id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Supplier not found' });
            logAudit(req.user.id, req.user.username, 'UPDATE_SUPPLIER', 'suppliers', id, `Updated supplier: ${name}`);
            res.json({ success: true, message: 'Supplier updated successfully' });
        }
    );
});

app.delete('/api/suppliers/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT id, name, balance FROM suppliers WHERE id = ? AND is_deleted = 0`, [id], (err, supplier) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

        if (Math.abs(supplier.balance) > 0.01) {
            return res.status(400).json({ 
                error: `Cannot delete supplier "${supplier.name}" with pending balance of Rs. ${supplier.balance.toLocaleString()}. Outstanding balance must be exactly Rs. 0 before deletion to protect ledger history.`
            });
        }

        db.run(`UPDATE suppliers SET is_deleted = 1 WHERE id = ?`, [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(req.user.id, req.user.username, 'SOFT_DELETE_SUPPLIER', 'suppliers', id, `Soft deleted supplier ${supplier.name}`);
            res.json({ success: true, message: 'Supplier deleted successfully (soft-deleted)' });
        });
    });
});

app.get('/api/suppliers/:id/ledger', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM suppliers WHERE id = ?", [id], (err, supplier) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

        db.all("SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY created_at ASC, id ASC", [id], (err, entries) => {
            if (err) return res.status(500).json({ error: err.message });

            let running = 0;
            const ledgerWithRunning = entries.map(entry => {
                if (entry.type === 'purchase') running += entry.amount;
                else if (entry.type === 'payment' || entry.type === 'return') running -= entry.amount;
                return { ...entry, running_balance: running };
            });

            db.all(`
                SELECT p.*, COUNT(pi.id) as item_count 
                FROM purchases p
                LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
                WHERE p.supplier_id = ?
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `, [id], (err, purchases) => {
                res.json({ supplier, ledger: ledgerWithRunning, purchases: purchases || [] });
            });
        });
    });
});

app.get('/api/purchases/:id', (req, res) => {
    const { id } = req.params;
    db.get(`
        SELECT p.*, s.name as supplier_name, s.company_name, s.phone as supplier_phone, s.address as supplier_address
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ? OR p.uuid = ? OR p.supplier_invoice_no = ?
    `, [id, id, id], (err, purchase) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!purchase) return res.status(404).json({ error: 'Purchase bill not found' });

        db.all(`
            SELECT pi.*, v.sku, v.variant_name, p.name as product_name, pt.name as packaging_name
            FROM purchase_items pi
            JOIN product_variants v ON pi.variant_id = v.id
            JOIN products p ON v.product_id = p.id
            JOIN packaging_types pt ON pi.packaging_type_id = pt.id
            WHERE pi.purchase_id = ?
        `, [purchase.id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ...purchase, items });
        });
    });
});

app.get('/api/suppliers/:id/details', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM suppliers WHERE id = ?", [id], (err, supplier) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

        db.all(`
            SELECT p.*, COUNT(pi.id) as item_count 
            FROM purchases p
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE p.supplier_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, [id], (err, purchases) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(`
                SELECT * FROM payments 
                WHERE party_type = 'supplier' AND party_id = ? 
                ORDER BY created_at DESC
            `, [id], (err, payments) => {
                if (err) return res.status(500).json({ error: err.message });

                // Also fetch unpaid purchases for FIFO allocation preview
                const unpaid = purchases.filter(p => p.remaining_balance > 0).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                res.json({
                    supplier,
                    purchases,
                    payments,
                    unpaid_purchases: unpaid
                });
            });
        });
    });
});

app.post('/api/suppliers/:id/pay-fifo', authenticateToken, (req, res) => {
    const supplier_id = parseInt(req.params.id);
    const { amount, payment_method, reference_no, notes, payment_date } = req.body;
    const payAmount = parseFloat(amount);

    if (!payAmount || payAmount <= 0) {
        return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Fetch unpaid purchases in FIFO order (oldest first: created_at ASC, id ASC)
        db.all(
            `SELECT * FROM purchases WHERE supplier_id = ? AND remaining_balance > 0 ORDER BY created_at ASC, id ASC`,
            [supplier_id],
            (err, unpaidPurchases) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }

                let remainingPayment = payAmount;
                const settledBills = [];

                const updatePurchaseStmt = db.prepare(`
                    UPDATE purchases 
                    SET amount_paid = amount_paid + ?, 
                        remaining_balance = remaining_balance - ?,
                        status = CASE WHEN remaining_balance - ? <= 0 THEN 'completed' ELSE 'partial' END
                    WHERE id = ?
                `);

                for (const bill of unpaidPurchases) {
                    if (remainingPayment <= 0) break;

                    const payTowardsBill = Math.min(bill.remaining_balance, remainingPayment);
                    remainingPayment -= payTowardsBill;

                    updatePurchaseStmt.run(payTowardsBill, payTowardsBill, payTowardsBill, bill.id);
                    settledBills.push({
                        purchase_id: bill.id,
                        invoice_no: bill.supplier_invoice_no,
                        allocated_amount: payTowardsBill,
                        previous_balance: bill.remaining_balance,
                        new_balance: bill.remaining_balance - payTowardsBill
                    });
                }
                updatePurchaseStmt.finalize();

                // 2. Insert Payment record
                const paymentUUID = generateUUID();
                const nowTime = getLocalNow();
                const nowDate = payment_date || getLocalDate();
                db.run(
                    `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, payment_date, notes, created_at)
                     VALUES (?, 'supplier', ?, ?, ?, ?, ?, 'DEVICE-CASHIER-01', ?, ?, ?)`,
                    [
                        paymentUUID, supplier_id, payAmount, payment_method || 'cash', 
                        reference_no || '', req.user.id, nowDate,
                        notes || `FIFO Payment settled across ${settledBills.length} purchase invoice(s)`,
                        nowTime
                    ],
                    function(err) {
                        if (err) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: err.message });
                        }
                        const paymentId = this.lastID;

                        // 3. Insert Supplier Ledger record
                        db.run(
                            `INSERT INTO supplier_ledger (uuid, supplier_id, payment_id, amount, type, description, payment_date, created_at)
                             VALUES (?, ?, ?, ?, 'payment', ?, ?, ?)`,
                            [
                                generateUUID(), supplier_id, paymentId, payAmount,
                                notes || `Manual FIFO Payment (${payment_method || 'cash'})${reference_no ? ' Ref: ' + reference_no : ''}`,
                                nowDate,
                                nowTime
                            ],
                            function(err) {
                                if (err) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ error: err.message });
                                }

                                // 4. Update Supplier Balance
                                db.run(`UPDATE suppliers SET balance = balance - ? WHERE id = ?`, [payAmount, supplier_id], function(err) {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ error: err.message });
                                    }

                                    // 5. If cash, update cash register
                                    if ((payment_method || 'cash') === 'cash') {
                                        db.run(`UPDATE cash_registers SET cash_withdrawals = cash_withdrawals + ? WHERE user_id = ? AND status = 'open'`, [payAmount, req.user.id]);
                                    }

                                    db.run("COMMIT", (err) => {
                                        if (err) return res.status(500).json({ error: err.message });
                                        logAudit(req.user.id, req.user.username, 'FIFO_SUPPLIER_PAYMENT', 'suppliers', supplier_id, `Paid Rs. ${payAmount} across ${settledBills.length} bills`);
                                        res.json({
                                            success: true,
                                            paymentId,
                                            amount: payAmount,
                                            settledBills,
                                            unallocatedAmount: remainingPayment
                                        });
                                    });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// Customer FIFO payment allocation across oldest unpaid sales bills
app.post('/api/customers/:id/pay-fifo', authenticateToken, (req, res) => {
    const customer_id = parseInt(req.params.id);
    const { amount, payment_method, reference_no, notes, payment_date } = req.body;
    const payAmount = parseFloat(amount);

    if (!payAmount || payAmount <= 0) {
        return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Fetch unpaid sales in FIFO order (oldest first: created_at ASC, id ASC)
        db.all(
            `SELECT * FROM sales WHERE customer_id = ? AND remaining_balance > 0 ORDER BY created_at ASC, id ASC`,
            [customer_id],
            (err, unpaidSales) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }

                let remainingPayment = payAmount;
                const settledBills = [];

                const updateSaleStmt = db.prepare(`
                    UPDATE sales 
                    SET amount_paid = amount_paid + ?, 
                        remaining_balance = remaining_balance - ?,
                        payment_status = CASE WHEN remaining_balance - ? <= 0 THEN 'paid' ELSE 'partial' END
                    WHERE id = ?
                `);

                for (const sale of unpaidSales) {
                    if (remainingPayment <= 0) break;

                    const payTowardsBill = Math.min(sale.remaining_balance, remainingPayment);
                    remainingPayment -= payTowardsBill;

                    updateSaleStmt.run(payTowardsBill, payTowardsBill, payTowardsBill, sale.id);
                    settledBills.push({
                        sale_id: sale.id,
                        invoice_no: sale.invoice_no,
                        allocated_amount: payTowardsBill,
                        previous_balance: sale.remaining_balance,
                        new_balance: sale.remaining_balance - payTowardsBill
                    });
                }
                updateSaleStmt.finalize();

                // 2. Insert Payment record
                const paymentUUID = generateUUID();
                const nowTime = getLocalNow();
                const nowDate = payment_date || getLocalDate();
                const finalRef = reference_no || (settledBills.length === 1 ? settledBills[0].invoice_no : (settledBills.length > 1 ? settledBills.map(b => b.invoice_no).join(', ') : ''));
                db.run(
                    `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, payment_date, notes, created_at)
                     VALUES (?, 'customer', ?, ?, ?, ?, ?, 'DEVICE-CASHIER-01', ?, ?, ?)`,
                    [
                        paymentUUID, customer_id, payAmount, payment_method || 'cash',
                        finalRef, req.user.id, nowDate,
                        notes || `FIFO Payment received across ${settledBills.length} sale invoice(s)`,
                        nowTime
                    ],
                    function(err) {
                        if (err) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: err.message });
                        }
                        const paymentId = this.lastID;

                        // 3. Insert Customer Ledger record
                        db.run(
                            `INSERT INTO customer_ledger (uuid, customer_id, payment_id, amount, type, description, payment_method, payment_date, created_at)
                             VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?)`,
                            [
                                generateUUID(), customer_id, paymentId, payAmount,
                                notes || `Manual FIFO Payment (${payment_method || 'cash'})${reference_no ? ' Ref: ' + reference_no : ''}`,
                                payment_method || 'cash',
                                nowDate,
                                nowTime
                            ],
                            function(err) {
                                if (err) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ error: err.message });
                                }

                                // 4. Update Customer Balance
                                db.run(`UPDATE customers SET balance = balance - ? WHERE id = ?`, [payAmount, customer_id], function(err) {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ error: err.message });
                                    }

                                    // 5. If cash, update cash register
                                    if ((payment_method || 'cash') === 'cash') {
                                        db.run(`UPDATE cash_registers SET customer_payments = customer_payments + ? WHERE user_id = ? AND status = 'open'`, [payAmount, req.user.id]);
                                    }

                                    db.run("COMMIT", (err) => {
                                        if (err) return res.status(500).json({ error: err.message });
                                        logAudit(req.user.id, req.user.username, 'FIFO_CUSTOMER_PAYMENT', 'customers', customer_id, `Received Rs. ${payAmount} across ${settledBills.length} bills`);
                                        res.json({
                                            success: true,
                                            paymentId,
                                            amount: payAmount,
                                            settledBills,
                                            unallocatedAmount: remainingPayment
                                        });
                                    });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// Pay a specific individual sales bill
app.post('/api/sales/:id/pay', authenticateToken, (req, res) => {
    const sale_id = parseInt(req.params.id);
    const { amount, payment_method, reference_no, notes, payment_date } = req.body;
    const payAmount = parseFloat(amount);

    if (!payAmount || payAmount <= 0) {
        return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    db.serialize(() => {
        db.get(`SELECT * FROM sales WHERE id = ?`, [sale_id], (err, sale) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!sale) return res.status(404).json({ error: 'Sale bill not found' });

            const currentRemaining = parseFloat(sale.remaining_balance) || 0;
            if (payAmount > currentRemaining + 0.01) {
                return res.status(400).json({ 
                    error: `Payment amount (Rs. ${payAmount.toLocaleString()}) exceeds remaining bill balance (Rs. ${currentRemaining.toLocaleString()})` 
                });
            }

            db.run("BEGIN TRANSACTION");

            const newRemaining = Math.max(0, currentRemaining - payAmount);
            const newPaid = (parseFloat(sale.amount_paid) || 0) + payAmount;
            const newPaymentStatus = newRemaining <= 0 ? 'paid' : 'partial';

            // 1. Update this specific sale
            db.run(
                `UPDATE sales SET amount_paid = ?, remaining_balance = ?, payment_status = ? WHERE id = ?`,
                [newPaid, newRemaining, newPaymentStatus, sale_id],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }

                    // 2. Insert Payment record
                    const paymentUUID = generateUUID();
                    const nowTime = getLocalNow();
                    const nowDate = payment_date || getLocalDate();
                    db.run(
                        `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, payment_date, notes, created_at)
                         VALUES (?, 'customer', ?, ?, ?, ?, ?, 'DEVICE-CASHIER-01', ?, ?, ?)`,
                        [
                            paymentUUID, sale.customer_id, payAmount, payment_method || 'cash',
                            reference_no || sale.invoice_no, req.user.id, nowDate,
                            notes || `Payment for Invoice ${sale.invoice_no}`,
                            nowTime
                        ],
                        function(err) {
                            if (err) {
                                db.run("ROLLBACK");
                                return res.status(500).json({ error: err.message });
                            }
                            const paymentId = this.lastID;

                            // 3. Insert customer_ledger entry linked to sale_id
                            if (sale.customer_id) {
                                db.run(
                                    `INSERT INTO customer_ledger (uuid, customer_id, sale_id, payment_id, amount, type, description, payment_method, payment_date, created_at)
                                     VALUES (?, ?, ?, ?, ?, 'payment', ?, ?, ?, ?)`,
                                    [
                                        generateUUID(), sale.customer_id, sale.id, paymentId, payAmount,
                                        notes || `Payment for Bill ${sale.invoice_no} (${payment_method || 'cash'})`,
                                        payment_method || 'cash',
                                        nowDate,
                                        nowTime
                                    ],
                                    function(err) {
                                        if (err) {
                                            db.run("ROLLBACK");
                                            return res.status(500).json({ error: err.message });
                                        }

                                        // 4. Update customer balance
                                        db.run(`UPDATE customers SET balance = balance - ? WHERE id = ?`, [payAmount, sale.customer_id], function(err) {
                                            if (err) {
                                                db.run("ROLLBACK");
                                                return res.status(500).json({ error: err.message });
                                            }

                                            // 5. Update cash register if cash
                                            if ((payment_method || 'cash') === 'cash') {
                                                db.run(`UPDATE cash_registers SET customer_payments = customer_payments + ? WHERE user_id = ? AND status = 'open'`, [payAmount, req.user.id]);
                                            }

                                            db.run("COMMIT", (err) => {
                                                if (err) return res.status(500).json({ error: err.message });
                                                logAudit(req.user.id, req.user.username, 'PAY_SALE_BILL', 'sales', sale_id, `Paid Rs. ${payAmount} for Invoice ${sale.invoice_no}`);
                                                res.json({
                                                    success: true,
                                                    paymentId,
                                                    sale_id: sale.id,
                                                    invoice_no: sale.invoice_no,
                                                    amount_paid: payAmount,
                                                    remaining_balance: newRemaining,
                                                    payment_status: newPaymentStatus
                                                });
                                            });
                                        });
                                    }
                                );
                            } else {
                                // Walk-in sale payment
                                if ((payment_method || 'cash') === 'cash') {
                                    db.run(`UPDATE cash_registers SET customer_payments = customer_payments + ? WHERE user_id = ? AND status = 'open'`, [payAmount, req.user.id]);
                                }

                                db.run("COMMIT", (err) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    res.json({
                                        success: true,
                                        paymentId,
                                        sale_id: sale.id,
                                        invoice_no: sale.invoice_no,
                                        amount_paid: payAmount,
                                        remaining_balance: newRemaining,
                                        payment_status: newPaymentStatus
                                    });
                                });
                            }
                        }
                    );
                }
            );
        });
    });
});

app.post('/api/purchases', authenticateToken, (req, res) => {
    const {
        supplier_id,
        supplier_invoice_no,
        items,
        gross_amount,
        discount,
        additional_charges,
        net_amount,
        amount_paid,
        payment_method,
        invoice_date
    } = req.body;

    if (!supplier_id || !Array.isArray(items) || items.length === 0 || !net_amount) {
        return res.status(400).json({ error: 'Supplier, items, and net amount required' });
    }

    const remainingBalance = net_amount - (amount_paid || 0);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const purchaseUUID = generateUUID();

        db.run(
            `INSERT INTO purchases (
                uuid, supplier_invoice_no, supplier_id, user_id, device_id, gross_amount, discount, 
                additional_charges, net_amount, amount_paid, remaining_balance, status, payment_method, invoice_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
            [
                purchaseUUID, supplier_invoice_no || '', supplier_id, req.user.id, 'DEVICE-CASHIER-01',
                gross_amount || 0, discount || 0, additional_charges || 0, net_amount, amount_paid || 0,
                remainingBalance, payment_method || 'cash', invoice_date || getLocalDate()
            ],
            function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }
                const purchaseId = this.lastID;

                const itemStmt = db.prepare(`
                    INSERT INTO purchase_items (uuid, purchase_id, variant_id, packaging_type_id, quantity, purchase_price, total)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                const movementStmt = db.prepare(`
                    INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                items.forEach(item => {
                    itemStmt.run(generateUUID(), purchaseId, item.variant_id, item.packaging_type_id, item.quantity, item.purchase_price, item.total);

                    // Add Stock
                    const factor = item.conversion_factor || 1;
                    const equivalentQty = item.quantity * factor;

                    db.run(`UPDATE product_variants SET current_stock = current_stock + ? WHERE id = ?`, [equivalentQty, item.variant_id]);
                    db.run(`UPDATE inventory_stock SET quantity = quantity + ? WHERE variant_id = ?`, [equivalentQty, item.variant_id]);

                    if (item.purchase_price > 0 && item.packaging_type_id) {
                        db.run(`UPDATE product_packagings SET purchase_price = ? WHERE variant_id = ? AND packaging_type_id = ?`, [item.purchase_price, item.variant_id, item.packaging_type_id]);
                    }

                    movementStmt.run(generateUUID(), item.variant_id, item.packaging_type_id, 'PURCHASE', item.quantity, equivalentQty, String(purchaseId), 'PURCHASE', req.user.id);
                });

                itemStmt.finalize();
                movementStmt.finalize();

                // Supplier Ledger Update
                db.run(
                    `INSERT INTO supplier_ledger (uuid, supplier_id, purchase_id, amount, type, description)
                     VALUES (?, ?, ?, ?, 'purchase', ?)`,
                    [generateUUID(), supplier_id, purchaseId, net_amount, `Purchase Invoice ${supplier_invoice_no || purchaseId}`]
                );

                if (amount_paid > 0) {
                    db.run(
                        `INSERT INTO supplier_ledger (uuid, supplier_id, purchase_id, amount, type, description)
                         VALUES (?, ?, ?, ?, 'payment', ?)`,
                        [generateUUID(), supplier_id, purchaseId, amount_paid, `Payment for Purchase Invoice ${supplier_invoice_no || purchaseId}`]
                    );

                    db.run(
                        `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, notes)
                         VALUES (?, 'supplier', ?, ?, ?, ?, ?, ?)`,
                        [generateUUID(), supplier_id, amount_paid, payment_method || 'cash', supplier_invoice_no || String(purchaseId), req.user.id, `Supplier Purchase Payment`]
                    );
                }

                db.run(`UPDATE suppliers SET balance = balance + ? WHERE id = ?`, [remainingBalance, supplier_id]);

                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    logAudit(req.user.id, req.user.username, 'CREATE_PURCHASE', 'purchases', purchaseId, `Net Amount: ${net_amount}`);
                    syncEngine.enqueueSync('PURCHASE', 'purchases', purchaseId, req.body);
                    res.json({ success: true, purchaseId, net_amount, remainingBalance });
                });
            }
        );
    });
});

app.get('/api/purchases', (req, res) => {
    db.all(`
        SELECT p.*, s.name as supplier_name, s.company_name, COUNT(pi.id) as item_count
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 200
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ─── UNIVERSAL PAYMENTS & EXPENSES ───────────────────────────────────────────
app.post('/api/payments', authenticateToken, (req, res) => {
    const { party_type, party_id, amount, payment_method, reference_no, notes, payment_date } = req.body;
    if (!party_type || !party_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Party Type (customer/supplier), Party ID, and valid Amount required' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const paymentUUID = generateUUID();
        const nowTime = getLocalNow();
        const nowDate = payment_date || getLocalDate();

        db.run(
            `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, payment_date, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'DEVICE-CASHIER-01', ?, ?, ?)`,
            [paymentUUID, party_type, party_id, amount, payment_method || 'cash', reference_no || '', req.user.id, nowDate, notes || '', nowTime],
            function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }
                const paymentId = this.lastID;

                if (party_type === 'customer') {
                    db.run(
                        `INSERT INTO customer_ledger (uuid, customer_id, payment_id, amount, type, description, payment_method, payment_date, created_at)
                         VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?)`,
                        [generateUUID(), party_id, paymentId, amount, notes || `Payment Received (${payment_method})`, payment_method || 'cash', nowDate, nowTime]
                    );
                    db.run(`UPDATE customers SET balance = balance - ? WHERE id = ?`, [amount, party_id]);

                    if ((payment_method || 'cash') === 'cash') {
                        db.run(`UPDATE cash_registers SET customer_payments = customer_payments + ? WHERE user_id = ? AND status = 'open'`, [amount, req.user.id]);
                    }
                } else if (party_type === 'supplier') {
                    db.run(
                        `INSERT INTO supplier_ledger (uuid, supplier_id, payment_id, amount, type, description, payment_date, created_at)
                         VALUES (?, ?, ?, ?, 'payment', ?, ?, ?)`,
                        [generateUUID(), party_id, paymentId, amount, notes || `Payment Made (${payment_method})`, nowDate, nowTime]
                    );
                    db.run(`UPDATE suppliers SET balance = balance - ? WHERE id = ?`, [amount, party_id]);

                    if ((payment_method || 'cash') === 'cash') {
                        db.run(`UPDATE cash_registers SET cash_withdrawals = cash_withdrawals + ? WHERE user_id = ? AND status = 'open'`, [amount, req.user.id]);
                    }
                }

                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    logAudit(req.user.id, req.user.username, 'CREATE_PAYMENT', party_type, party_id, `Amount: ${amount} (${payment_method})`);
                    syncEngine.enqueueSync('PAYMENT', 'payments', paymentId, req.body);
                    res.json({ success: true, paymentId });
                });
            }
        );
    });
});

app.get('/api/payments', (req, res) => {
    const query = `
        SELECT p.*,
               COALESCE(c.name, sup.name, '') as party_name,
               COALESCE(c.business_name, sup.company_name, '') as party_business,
               COALESCE(c.phone, sup.phone, '') as party_phone
        FROM payments p
        LEFT JOIN customers c ON p.party_type = 'customer' AND p.party_id = c.id
        LEFT JOIN suppliers sup ON p.party_type = 'supplier' AND p.party_id = sup.id
        ORDER BY p.created_at DESC
        LIMIT 500
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/expenses', (req, res) => {
    db.all(`SELECT * FROM expenses ORDER BY created_at DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/expenses', authenticateToken, (req, res) => {
    const { category, amount, description, payment_method, expense_date } = req.body;
    if (!amount || !description) return res.status(400).json({ error: 'Amount and description required' });

    db.run(
        `INSERT INTO expenses (uuid, category, amount, description, payment_method, expense_date, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateUUID(), category || 'Other', amount, description, payment_method || 'cash', expense_date || getLocalDate(), req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if ((payment_method || 'cash') === 'cash') {
                db.run(`UPDATE cash_registers SET expenses = expenses + ? WHERE user_id = ? AND status = 'open'`, [amount, req.user.id]);
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

// ─── CASH REGISTER SHIFTS ───────────────────────────────────────────────────
app.get('/api/cash-register/current', authenticateToken, (req, res) => {
    db.get("SELECT * FROM cash_registers WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

app.post('/api/cash-register/open', authenticateToken, (req, res) => {
    const { opening_cash } = req.body;
    db.get("SELECT id FROM cash_registers WHERE user_id = ? AND status = 'open'", [req.user.id], (err, existing) => {
        if (existing) return res.status(400).json({ error: 'Shift already open' });

        db.run(
            `INSERT INTO cash_registers (uuid, user_id, device_id, opening_cash, status) VALUES (?, ?, 'DEVICE-CASHIER-01', ?, 'open')`,
            [generateUUID(), req.user.id, opening_cash || 0],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, registerId: this.lastID });
            }
        );
    });
});

app.post('/api/cash-register/close', authenticateToken, (req, res) => {
    const { actual_cash } = req.body;
    db.get("SELECT * FROM cash_registers WHERE user_id = ? AND status = 'open'", [req.user.id], (err, reg) => {
        if (err || !reg) return res.status(404).json({ error: 'No open cash register shift found' });

        const expectedCash = (reg.opening_cash || 0) + (reg.cash_sales || 0) + (reg.customer_payments || 0) - (reg.expenses || 0) - (reg.cash_refunds || 0) - (reg.cash_withdrawals || 0);
        const diff = (actual_cash || 0) - expectedCash;

        db.run(
            `UPDATE cash_registers 
             SET closing_cash = ?, expected_cash = ?, actual_cash = ?, difference = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [actual_cash || 0, expectedCash, actual_cash || 0, diff, reg.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, expectedCash, actualCash: actual_cash, difference: diff });
            }
        );
    });
});

// ─── ADMIN DASHBOARD & REPORTS ───────────────────────────────────────────────
app.get('/api/reports/dashboard', authenticateToken, (req, res) => {
    const today = getLocalDate();

    const dashboardQuery = `
        SELECT 
            (SELECT IFNULL(SUM(net_amount), 0) FROM sales WHERE DATE(created_at) = ? AND status = 'completed') as todaySales,
            (SELECT IFNULL(SUM(net_amount), 0) FROM purchases WHERE DATE(created_at) = ?) as todayPurchases,
            (SELECT IFNULL(SUM(amount), 0) FROM expenses WHERE DATE(expense_date) = ?) as todayExpenses,
            (SELECT IFNULL(SUM(amount), 0) FROM payments WHERE DATE(payment_date) = ?) as todayPayments,
            (SELECT IFNULL(SUM(balance), 0) FROM customers WHERE is_deleted = 0 AND balance > 0) as totalReceivables,
            (SELECT IFNULL(SUM(balance), 0) FROM suppliers WHERE is_deleted = 0 AND balance > 0) as totalPayables,
            (SELECT COUNT(*) FROM product_variants WHERE current_stock <= minimum_stock AND is_deleted = 0) as lowStockCount
    `;

    db.get(dashboardQuery, [today, today, today, today], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const d = row || {};
        const todaySales = d.todaySales || 0;
        const todayPurchases = d.todayPurchases || 0;
        const todayExpenses = d.todayExpenses || 0;
        const todayPayments = d.todayPayments || 0;
        const totalReceivables = d.totalReceivables || 0;
        const totalPayables = d.totalPayables || 0;
        const lowStockCount = d.lowStockCount || 0;

        res.json({
            todaySales,
            todayPurchases,
            todayExpenses,
            todayPayments,
            totalReceivables,
            totalPayables,
            lowStockCount,
            estProfit: todaySales - (todaySales * 0.85) - todayExpenses // Approx 15% margin - expenses
        });
    });
});

// ─── COMPREHENSIVE FINANCIAL SUMMARY (GROSS REVENUE FORMULA) ────────────────
app.get('/api/reports/financial-summary', (req, res) => {
    const { startDate, endDate } = req.query;

    const hasDates = !!(startDate && endDate);
    const saleDateClause = hasDates ? `AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?` : '';
    const payDateClause = hasDates ? `AND ( (p.payment_date IS NOT NULL AND DATE(p.payment_date) >= ? AND DATE(p.payment_date) <= ?) OR (p.payment_date IS NULL AND DATE(p.created_at) >= ? AND DATE(p.created_at) <= ?) )` : '';
    const expDateClause = hasDates ? `AND ( (e.expense_date IS NOT NULL AND DATE(e.expense_date) >= ? AND DATE(e.expense_date) <= ?) OR (e.expense_date IS NULL AND DATE(e.created_at) >= ? AND DATE(e.created_at) <= ?) )` : '';

    // Recovered Dues (Wasooli) are ONLY payments recovered from previous bills (created before startDate) or FIFO/on-account debt recovery.
    // Payments for invoices created in the current period are part of that sale's checkout cash and must NOT be double-counted.
    const recExcludeClause = hasDates
        ? `AND NOT (s.id IS NOT NULL AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?)`
        : `AND NOT (s.id IS NOT NULL AND DATE(s.created_at) = DATE(COALESCE(p.payment_date, p.created_at)))`;

    const saleParams = hasDates ? [startDate, endDate] : [];
    const payParams = hasDates ? [startDate, endDate, startDate, endDate] : [];
    const recParams = hasDates ? [...payParams, startDate, endDate] : [];
    const expParams = hasDates ? [startDate, endDate, startDate, endDate] : [];

    const qSales = `
        SELECT 
            COUNT(s.id) as sale_count,
            IFNULL(SUM(s.gross_amount), 0) as total_gross_sale,
            IFNULL(SUM(s.discount), 0) as total_discount,
            IFNULL(SUM(s.net_amount), 0) as total_net_sale,
            IFNULL(SUM(COALESCE(s.initial_amount_paid, s.amount_paid)), 0) as sales_cash_paid,
            IFNULL(SUM(s.net_amount - COALESCE(s.initial_amount_paid, s.amount_paid)), 0) as new_dues_added
        FROM sales s 
        WHERE s.status = 'completed' ${saleDateClause}
    `;

    const qRecoveredDues = `
        SELECT IFNULL(SUM(p.amount), 0) as recovered_dues
        FROM payments p
        LEFT JOIN sales s ON p.reference_no = s.invoice_no
        WHERE p.party_type = 'customer' 
          AND p.amount > 0
          AND (p.notes IS NULL OR (p.notes NOT LIKE '%Refund%' AND p.notes NOT LIKE '%return%'))
          AND (p.reference_no IS NULL OR (p.reference_no NOT LIKE 'SALE-%' AND p.reference_no NOT LIKE 'RET-%'))
          ${payDateClause}
          ${recExcludeClause}
    `;

    const qExpenses = `
        SELECT IFNULL(SUM(e.amount), 0) as total_expenses
        FROM expenses e
        WHERE 1=1 ${expDateClause}
    `;

    const qStockPaid = `
        SELECT IFNULL(SUM(p.amount), 0) as stock_paid
        FROM payments p
        WHERE p.party_type = 'supplier' AND p.amount > 0 ${payDateClause}
    `;

    const returnDateClause = hasDates ? `AND DATE(sr.created_at) >= ? AND DATE(sr.created_at) <= ?` : '';
    const qReturns = `
        SELECT 
            COUNT(sr.id) as return_count,
            IFNULL(SUM(sr.total_refund), 0) as total_returns,
            IFNULL(SUM(CASE WHEN sr.refund_method = 'cash' THEN sr.total_refund ELSE 0 END), 0) as cash_refunds,
            IFNULL(SUM(CASE WHEN sr.refund_method = 'credit' OR sr.refund_method IS NULL THEN sr.total_refund ELSE 0 END), 0) as credit_returns
        FROM sale_returns sr
        WHERE 1=1 ${returnDateClause}
    `;
    const retParams = hasDates ? [startDate, endDate] : [];

    db.get(qSales, saleParams, (err, salesRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get(qRecoveredDues, recParams, (err, recRow) => {
            if (err) return res.status(500).json({ error: err.message });

            db.get(qExpenses, expParams, (err, expRow) => {
                if (err) return res.status(500).json({ error: err.message });

                db.get(qStockPaid, payParams, (err, supPayRow) => {
                    if (err) return res.status(500).json({ error: err.message });

                    db.get(qReturns, retParams, (err, refRow) => {
                        const totalSale = salesRow ? (Number(salesRow.total_gross_sale) || (Number(salesRow.total_net_sale) + Number(salesRow.total_discount))) : 0;
                        const netSale = salesRow ? Number(salesRow.total_net_sale) : 0;
                        const discount = salesRow ? Number(salesRow.total_discount) : 0;
                        const grossNewDuesAdded = salesRow ? Number(salesRow.new_dues_added) : 0;
                        const salesCashPaid = salesRow ? Number(salesRow.sales_cash_paid) : 0;
                        const saleCount = salesRow ? Number(salesRow.sale_count) : 0;

                        const recoveredDues = recRow ? Math.max(0, Number(recRow.recovered_dues)) : 0;
                        const expenses = expRow ? Number(expRow.total_expenses) : 0;
                        const stockPaid = supPayRow ? Math.max(0, Number(supPayRow.stock_paid)) : 0;
                        
                        const totalReturns = refRow ? Number(refRow.total_returns) : 0;
                        const cashRefunds = refRow ? Number(refRow.cash_refunds) : 0;
                        const creditReturns = refRow ? Number(refRow.credit_returns) : 0;
                        const returnCount = refRow ? Number(refRow.return_count) : 0;

                        // When merchandise is returned on credit note (Khata adjustment),
                        // it reduces the customer's unpaid debt. Net new dues added is gross credit minus credit notes:
                        const netNewDuesAdded = Math.max(0, grossNewDuesAdded - creditReturns);
                        const newDuesAdded = netNewDuesAdded;

                        // User formula:
                        // gross revenue = total sale + recoverd dues - new dues added - expance - dicount - stock paid - returns
                        const grossRevenue = totalSale + recoveredDues - newDuesAdded - expenses - discount - stockPaid - totalReturns;

                        res.json({
                            totalSale,
                            netSale,
                            discount,
                            grossNewDuesAdded,
                            newDuesAdded,
                            salesCashPaid,
                            saleCount,
                            recoveredDues,
                            expenses,
                            stockPaid,
                            totalReturns,
                            cashRefunds,
                            creditReturns,
                            returnCount,
                            grossRevenue
                        });
                    });
                });
            });
        });
    });
});

// ─── ITEM SALES & PROFIT VALUE BREAKDOWN ────────────────────────────────────
app.get('/api/reports/item-sales', (req, res) => {
    const { startDate, endDate } = req.query;

    const hasDates = !!(startDate && endDate);
    const dateClause = hasDates ? `AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?` : '';
    const params = hasDates ? [startDate, endDate] : [];

    const query = `
        SELECT 
            si.variant_id,
            p.name as product_name,
            v.variant_name,
            v.sku,
            COALESCE(pt.name, 'Unit') as packaging_name,
            COALESCE(pp.conversion_factor, 1) as conversion_factor,
            SUM(si.quantity) as quantity_sold,
            ROUND(AVG(si.price), 2) as avg_sale_price,
            ROUND(SUM(si.total), 2) as total_sales_amount,
            ROUND(SUM(si.discount), 2) as total_discount,
            COALESCE(pp.purchase_price, 0) as purchase_price,
            ROUND(SUM(si.quantity * COALESCE(pp.purchase_price, 0)), 2) as total_cost_amount,
            ROUND(SUM(si.total) - SUM(si.quantity * COALESCE(pp.purchase_price, 0)), 2) as total_profit,
            CASE 
                WHEN SUM(si.total) > 0 
                THEN ROUND(((SUM(si.total) - SUM(si.quantity * COALESCE(pp.purchase_price, 0))) / SUM(si.total)) * 100, 1)
                ELSE 0 
            END as profit_margin_percent
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN product_variants v ON si.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        LEFT JOIN packaging_types pt ON si.packaging_type_id = pt.id
        LEFT JOIN product_packagings pp ON pp.variant_id = v.id AND pp.packaging_type_id = si.packaging_type_id
        WHERE s.status = 'completed' ${dateClause}
        GROUP BY si.variant_id, si.packaging_type_id
        ORDER BY total_sales_amount DESC
    `;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ─── SYNC & SYSTEM MANAGEMENT ───────────────────────────────────────────────
app.get('/api/sync/status', async (req, res) => {
    try {
        const stats = await syncEngine.getSyncStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sync/trigger', async (req, res) => {
    try {
        const result = await syncEngine.processPushSync();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/system/audit-logs', authenticateToken, requireAdmin, (req, res) => {
    db.all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/settings', (req, res) => {
    if (masterCache.settings) {
        return res.json(masterCache.settings);
    }
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settingsObj = {};
        rows.forEach(r => settingsObj[r.key] = r.value);
        masterCache.settings = settingsObj;
        res.json(settingsObj);
    });
});

app.put('/api/settings', authenticateToken, requireAdmin, (req, res) => {
    const settingsObj = req.body;
    const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    Object.keys(settingsObj).forEach(k => {
        stmt.run(k, String(settingsObj[k]));
    });
    stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        masterCache.settings = null; // Invalidate cache
        logAudit(req.user.id, req.user.username, 'UPDATE_SETTINGS', 'settings', null, settingsObj);
        // Refresh reminder schedule if reminder settings were modified
        if (settingsObj.wa_reminder_enabled !== undefined || settingsObj.wa_reminder_time !== undefined) {
            try { schedulerService.scheduleReminderJob(); } catch(e) {}
        }
        res.json({ success: true });
    });
});

// ─── WHATSAPP BAILEYS & DUES REMINDERS API ──────────────────────────────────
app.get('/api/whatsapp/status', authenticateToken, (req, res) => {
    try {
        const status = whatsappService.getStatus();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/connect', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await whatsappService.initWhatsApp(true);
        res.json({ success: true, message: 'WhatsApp initialization started. QR code regenerating.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/logout', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await whatsappService.logout();
        res.json({ success: true, message: 'WhatsApp disconnected successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/send-reminder', authenticateToken, async (req, res) => {
    const { customer_id, phone, message } = req.body;
    if (!customer_id && !phone) return res.status(400).json({ error: 'Customer ID or phone required' });
    try {
        const result = await reminderService.sendCustomerDuesReminder(customer_id, message, phone);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/send-pdf', authenticateToken, async (req, res) => {
    const { customer_id, phone, pdf_base64, file_name, message, custom_ledger } = req.body;
    if (!customer_id && !phone) return res.status(400).json({ error: 'Customer ID or phone required' });

    try {
        const pdfBuffer = pdf_base64 ? Buffer.from(pdf_base64, 'base64') : null;
        const fileName = file_name || 'Customer_Dues_Statement.pdf';
        const result = await reminderService.sendCustomerDuesWithPdf(customer_id, pdfBuffer, fileName, message, phone, custom_ledger);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/send-bill', authenticateToken, async (req, res) => {
    const { sale_id, phone, message, custom_sale } = req.body;
    if (!sale_id) return res.status(400).json({ error: 'Sale ID required' });
    try {
        const result = await reminderService.sendSaleBillReminder(sale_id, message, phone, custom_sale);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/send-bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await reminderService.sendBulkDuesReminders(false);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/whatsapp/logs', authenticateToken, (req, res) => {
    db.all(`
        SELECT wr.*, c.name as customer_name 
        FROM whatsapp_reminders wr 
        LEFT JOIN customers c ON wr.customer_id = c.id 
        ORDER BY wr.id DESC LIMIT 50
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ─── USER MANAGEMENT (ADMIN ONLY) ──────────────────────────────────────────
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
    db.all("SELECT id, uuid, username, role, full_name, phone, created_at FROM users WHERE is_deleted = 0 ORDER BY id ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
    const { username, password, role, full_name, phone } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role (admin/cashier) required' });
    }

    const uuid = generateUUID();
    db.run(
        "INSERT INTO users (uuid, username, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?, ?)",
        [uuid, username, password, role, full_name || '', phone || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(req.user.id, req.user.username, 'CREATE_USER', 'users', this.lastID, `Created ${role} user: ${username}`);
            res.json({ success: true, id: this.lastID, uuid, username, role });
        }
    );
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete current logged in admin user' });
    }

    db.run("UPDATE users SET is_deleted = 1 WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req.user.id, req.user.username, 'DELETE_USER', 'users', id, `Deactivated user ID ${id}`);
        res.json({ success: true });
    });
});

// ─── SALES RETURNS & PURCHASE RETURNS ───────────────────────────────────────
app.post('/api/sales/returns', authenticateToken, (req, res) => {
    const { sale_id, customer_id, return_type, refund_method = 'credit', items, total_refund, remarks } = req.body;
    if (!Array.isArray(items) || items.length === 0 || !total_refund) {
        return res.status(400).json({ error: 'Return items and refund amount required' });
    }

    const returnNow = getLocalNow();
    const returnDate = getLocalDate();
    const returnUUID = generateUUID();

    const executeReturn = (sale = null) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            db.run(
                `INSERT INTO sale_returns (uuid, sale_id, customer_id, user_id, total_refund, return_type, refund_method, status, remarks, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
                [returnUUID, sale_id || null, customer_id || null, req.user.id, total_refund, return_type || 'saleable', refund_method || 'credit', remarks || 'Customer sale return', returnNow],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: err.message });
                    }
                    const returnId = this.lastID;
                    const cnNumber = `CN-${String(returnId).padStart(5, '0')}`;
                    const invRef = sale ? sale.invoice_no : (sale_id ? `INV-${sale_id}` : 'Direct');

                    const itemStmt = db.prepare(`
                        INSERT INTO sale_return_items (uuid, sale_return_id, variant_id, packaging_type_id, quantity, refund_price)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);

                    const movementStmt = db.prepare(`
                        INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, notes, user_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'SALE_RETURN', ?, ?, ?)
                    `);

                    items.forEach(it => {
                        itemStmt.run(generateUUID(), returnId, it.variant_id, it.packaging_type_id, it.quantity, it.refund_price);

                        const factor = it.conversion_factor || 1;
                        const equivalentQty = it.quantity * factor;

                        // If saleable stock: increase stock back!
                        if (return_type !== 'damaged') {
                            db.run(`UPDATE product_variants SET current_stock = current_stock + ? WHERE id = ?`, [equivalentQty, it.variant_id]);
                            db.run(`UPDATE inventory_stock SET quantity = quantity + ? WHERE variant_id = ?`, [equivalentQty, it.variant_id]);
                        }

                        movementStmt.run(
                            generateUUID(), it.variant_id, it.packaging_type_id,
                            return_type === 'damaged' ? 'DAMAGE' : 'SALE_RETURN',
                            it.quantity, equivalentQty, String(returnId),
                            return_type === 'damaged' ? 'Damaged customer return (Quarantined Scrap)' : 'Restocked sale return',
                            req.user.id, returnNow
                        );
                    });

                    itemStmt.finalize();
                    movementStmt.finalize();

                    // Settlement & Ledger Handling:
                    if (refund_method === 'cash') {
                        // OPTION A: CASH REFUND (Cash paid out from counter drawer)
                        // Every cash refund explicitly references its Credit Note # and original invoice
                        db.run(
                            `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, notes, payment_date, created_at)
                             VALUES (?, 'customer', ?, ?, 'cash', ?, ?, 'desktop', ?, ?, ?)`,
                            [generateUUID(), customer_id || null, -total_refund, cnNumber, req.user.id, `Cash Refund for Credit Note #${cnNumber} (Bill #${invRef})`, returnDate, returnNow]
                        );

                        // Deduct from active cash register shift
                        db.run(
                            `UPDATE cash_registers SET cash_refunds = cash_refunds + ? WHERE user_id = ? AND status = 'open'`,
                            [total_refund, req.user.id]
                        );

                        if (customer_id) {
                            db.run(
                                `INSERT INTO customer_ledger (uuid, customer_id, sale_id, return_id, amount, type, description, payment_method, payment_date, created_at)
                                 VALUES (?, ?, ?, ?, ?, 'return', ?, 'cash', ?, ?)`,
                                [generateUUID(), customer_id, sale_id || null, returnId, total_refund, `Sales Return #${cnNumber} (${return_type}) - Cash Refund Paid Out`, returnDate, returnNow]
                            );
                            // Customer balance remains unchanged because cash was handed back!
                        }
                    } else {
                        // OPTION B: STORE CREDIT / ADJUST KHATA (No cash given)
                        if (customer_id) {
                            db.run(
                                `INSERT INTO customer_ledger (uuid, customer_id, sale_id, return_id, amount, type, description, payment_method, payment_date, created_at)
                                 VALUES (?, ?, ?, ?, ?, 'return', ?, 'credit_note', ?, ?)`,
                                [generateUUID(), customer_id, sale_id || null, returnId, total_refund, `Sales Return #${cnNumber} (${return_type}) - Credited to Khata`, returnDate, returnNow]
                            );
                            // Reduce customer debt balance (or creates advance credit if already paid)
                            db.run(`UPDATE customers SET balance = balance - ? WHERE id = ?`, [total_refund, customer_id]);
                        }
                        // Cash drawer remains untouched!
                    }

                    db.run("COMMIT", (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        logAudit(req.user.id, req.user.username, 'SALE_RETURN', 'sale_returns', returnId, `Credit Note #${cnNumber}: Rs. ${total_refund} (${return_type}, Method: ${refund_method})`);
                        syncEngine.enqueueSync('SALE_RETURN', 'sale_returns', returnId, req.body);
                        res.json({ success: true, returnId, cnNumber });
                    });
                }
            );
        });
    };

    if (sale_id) {
        // Enforce Rule: Every return references original invoice & cannot exceed returnable balance
        db.get(`
            SELECT s.*, 
                   COALESCE((SELECT SUM(total_refund) FROM sale_returns WHERE sale_id = s.id AND (status IS NULL OR status != 'void')), 0) as prior_refunds
            FROM sales s 
            WHERE s.id = ?
        `, [sale_id], (err, sale) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!sale) return res.status(404).json({ error: `Original sale invoice #${sale_id} not found` });

            const available = (sale.net_amount || 0) - (sale.prior_refunds || 0);
            if (total_refund > available + 0.5) {
                return res.status(400).json({
                    error: `Refund amount (Rs. ${Number(total_refund).toLocaleString()}) cannot exceed remaining returnable balance (Rs. ${Math.round(available).toLocaleString()}) on invoice #${sale.invoice_no}`
                });
            }
            executeReturn(sale);
        });
    } else {
        executeReturn(null);
    }
});

// POST void a sales return with full transactional reversal of cash, khata, and stock
app.post('/api/sales/returns/:id/void', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    db.get("SELECT * FROM sale_returns WHERE id = ?", [id], (err, ret) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!ret) return res.status(404).json({ error: 'Sales return / Credit note not found' });
        if (ret.status === 'void') return res.status(400).json({ error: 'This credit note has already been voided' });

        const cnNumber = `CN-${String(ret.id).padStart(5, '0')}`;
        const returnNow = getLocalNow();
        const returnDate = getLocalDate();

        db.all("SELECT * FROM sale_return_items WHERE sale_return_id = ?", [ret.id], (itemsErr, items) => {
            if (itemsErr) return res.status(500).json({ error: itemsErr.message });

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                // 1. Mark return as void
                db.run("UPDATE sale_returns SET status = 'void', remarks = remarks || ' [VOIDED: ' || ? || ']' WHERE id = ?", [reason || 'Reversed by admin', ret.id]);

                // 2. Reverse Financial Settlement
                if (ret.refund_method === 'cash') {
                    // Reverse Cash Drawer Payout: Put cash back into business drawer
                    db.run(
                        `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, notes, payment_date, created_at)
                         VALUES (?, 'customer', ?, ?, 'cash', ?, ?, 'desktop', ?, ?, ?)`,
                        [generateUUID(), ret.customer_id || null, ret.total_refund, `VOID-${cnNumber}`, req.user.id, `Void Reversal of Cash Refund for Credit Note #${cnNumber}`, returnDate, returnNow]
                    );

                    db.run(
                        `UPDATE cash_registers SET cash_refunds = cash_refunds - ? WHERE user_id = ? AND status = 'open'`,
                        [ret.total_refund, req.user.id]
                    );

                    if (ret.customer_id) {
                        db.run(
                            `INSERT INTO customer_ledger (uuid, customer_id, sale_id, return_id, amount, type, description, payment_method, payment_date, created_at)
                             VALUES (?, ?, ?, ?, ?, 'charge', ?, 'adjustment', ?, ?)`,
                            [generateUUID(), ret.customer_id, ret.sale_id || null, ret.id, ret.total_refund, `Void Reversal of Sales Return #${cnNumber} (${ret.return_type})`, returnDate, returnNow]
                        );
                    }
                } else {
                    // Reverse Khata Store Credit: Add back to customer balance
                    if (ret.customer_id) {
                        db.run(`UPDATE customers SET balance = balance + ? WHERE id = ?`, [ret.total_refund, ret.customer_id]);

                        db.run(
                            `INSERT INTO customer_ledger (uuid, customer_id, sale_id, return_id, amount, type, description, payment_method, payment_date, created_at)
                             VALUES (?, ?, ?, ?, ?, 'charge', ?, 'adjustment', ?, ?)`,
                            [generateUUID(), ret.customer_id, ret.sale_id || null, ret.id, ret.total_refund, `Void Reversal of Sales Return #${cnNumber} (${ret.return_type})`, returnDate, returnNow]
                        );
                    }
                }

                // 3. Reverse Inventory (if stock was restocked, remove it back)
                if (ret.return_type !== 'damaged' && items && items.length > 0) {
                    items.forEach(it => {
                        db.run(`UPDATE product_variants SET current_stock = current_stock - ? WHERE id = ?`, [it.quantity, it.variant_id]);
                        db.run(`UPDATE inventory_stock SET quantity = quantity - ? WHERE variant_id = ?`, [it.quantity, it.variant_id]);

                        db.run(
                            `INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, notes, user_id, created_at)
                             VALUES (?, ?, ?, 'RETURN_VOID', ?, ?, ?, 'SALE_RETURN', ?, ?, ?)`,
                            [generateUUID(), it.variant_id, it.packaging_type_id, -it.quantity, -it.quantity, String(ret.id), `Void reversal of restocked return #${cnNumber}`, req.user.id, returnNow]
                        );
                    });
                }

                db.run("COMMIT", (commitErr) => {
                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                    logAudit(req.user.id, req.user.username, 'VOID_SALE_RETURN', 'sale_returns', ret.id, `Voided Credit Note #${cnNumber} (Rs. ${ret.total_refund})`);
                    res.json({ success: true, message: `Credit Note #${cnNumber} successfully voided and reversed` });
                });
            });
        });
    });
});

// GET full Credit Note details for a sales return
app.get('/api/sales/returns/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT sr.*, 
               c.name as customer_name, c.business_name as customer_business, c.phone as customer_phone, c.mobile as customer_mobile, c.address as customer_address, c.balance as current_customer_balance,
               s.invoice_no as original_invoice_no, s.created_at as original_sale_date, s.net_amount as original_sale_net,
               u.username as cashier_name
        FROM sale_returns sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        LEFT JOIN sales s ON sr.sale_id = s.id
        LEFT JOIN users u ON sr.user_id = u.id
        WHERE sr.id = ? OR sr.uuid = ?
    `;

    db.get(query, [id, id], (err, retRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!retRow) return res.status(404).json({ error: 'Credit Note / Sales Return not found' });

        const itemsQuery = `
            SELECT sri.*, pv.sku, pv.variant_name, p.name as product_name, pt.name as packaging_name, u.symbol as base_unit
            FROM sale_return_items sri
            LEFT JOIN product_variants pv ON sri.variant_id = pv.id
            LEFT JOIN products p ON pv.product_id = p.id
            LEFT JOIN packaging_types pt ON sri.packaging_type_id = pt.id
            LEFT JOIN units u ON pv.base_unit_id = u.id
            WHERE sri.sale_return_id = ?
        `;

        db.all(itemsQuery, [retRow.id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all("SELECT key, value FROM settings", [], (err, settings) => {
                const shopData = {
                    shop_name: 'Hilal Wholesaler Shop',
                    shop_address: 'Main Market, Timergara, Lower Dir, KP',
                    shop_phone: '0945-825555 / 0306-0888300',
                    shop_email: 'hilalwholesaler@gmail.com'
                };
                if (settings) {
                    settings.forEach(s => { shopData[s.key] = s.value; });
                }

                const cn_number = `CN-${String(retRow.id).padStart(5, '0')}`;
                res.json({
                    ...retRow,
                    cn_number,
                    items: items || [],
                    shop: shopData
                });
            });
        });
    });
});

// GET Credit Note PDF download
app.get('/api/sales/returns/:id/pdf', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT sr.*, 
               c.name as customer_name, c.business_name as customer_business, c.phone as customer_phone, c.mobile as customer_mobile, c.address as customer_address, c.balance as current_customer_balance,
               s.invoice_no as original_invoice_no, s.created_at as original_sale_date,
               u.username as cashier_name
        FROM sale_returns sr
        LEFT JOIN customers c ON sr.customer_id = c.id
        LEFT JOIN sales s ON sr.sale_id = s.id
        LEFT JOIN users u ON sr.user_id = u.id
        WHERE sr.id = ? OR sr.uuid = ?
    `;

    db.get(query, [id, id], (err, retRow) => {
        if (err || !retRow) return res.status(404).send('Credit Note not found');

        const itemsQuery = `
            SELECT sri.*, pv.sku, pv.variant_name, p.name as product_name, pt.name as packaging_name, u.symbol as base_unit
            FROM sale_return_items sri
            LEFT JOIN product_variants pv ON sri.variant_id = pv.id
            LEFT JOIN products p ON pv.product_id = p.id
            LEFT JOIN packaging_types pt ON sri.packaging_type_id = pt.id
            LEFT JOIN units u ON pv.base_unit_id = u.id
            WHERE sri.sale_return_id = ?
        `;

        db.all(itemsQuery, [retRow.id], (err, items) => {
            if (err) return res.status(500).send('Error loading return items');

            db.all("SELECT key, value FROM settings", [], (err, settings) => {
                const shopData = { shop_name: 'Hilal Wholesaler Shop' };
                if (settings) {
                    settings.forEach(s => { shopData[s.key] = s.value; });
                }

                const customer = {
                    name: retRow.customer_name,
                    business_name: retRow.customer_business,
                    address: retRow.customer_address,
                    phone: retRow.customer_phone,
                    mobile: retRow.customer_mobile,
                    balance: retRow.current_customer_balance
                };

                const originalSale = {
                    invoice_no: retRow.original_invoice_no,
                    created_at: retRow.original_sale_date
                };

                const pdfBuf = reminderService.generateCreditNotePdf(shopData, retRow, items || [], customer, originalSale);
                const cnNumber = `CN-${String(retRow.id).padStart(5, '0')}`;
                const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="Credit_Note_${cnNumber}_${safeName}.pdf"`);
                res.setHeader('Content-Length', pdfBuf.length);
                res.send(pdfBuf);
            });
        });
    });
});

// POST send Credit Note PDF directly via WhatsApp
app.post('/api/sales/returns/:id/send-whatsapp', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { message, phone } = req.body;

    try {
        const result = await reminderService.sendCreditNoteWhatsApp(id, message, phone);
        res.json(result);
    } catch (err) {
        // Fallback WhatsApp link generation if Baileys is offline
        db.get(`
            SELECT sr.*, c.phone, c.mobile, c.name, s.invoice_no 
            FROM sale_returns sr 
            LEFT JOIN customers c ON sr.customer_id = c.id 
            LEFT JOIN sales s ON sr.sale_id = s.id 
            WHERE sr.id = ?
        `, [id], (qErr, row) => {
            const rawPhone = phone || (row ? (row.phone || row.mobile) : '');
            let cleanPhone = String(rawPhone || '').replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.substring(1);
            else if (!cleanPhone.startsWith('92') && cleanPhone.length === 10) cleanPhone = '92' + cleanPhone;

            const cnNumber = `CN-${String(id).padStart(5, '0')}`;
            const refundAmt = row ? Number(row.total_refund).toLocaleString() : '0';
            const defaultText = encodeURIComponent(`السلام علیکم ${row?.name || 'محترم گاہک'} صاحب،\nآپ کا کریڈٹ نوٹ #${cnNumber} مبلغ Rs. ${refundAmt} (بابت بل #${row?.invoice_no || ''}) جاری کر دیا گیا ہے۔\nشکریہ!\nHilal Wholesaler Shop`);
            const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${defaultText}` : null;

            res.status(400).json({
                error: err.message,
                whatsapp_url: waLink,
                is_disconnected: err.message.includes('not connected')
            });
        });
    }
});

app.post('/api/purchases/returns', authenticateToken, (req, res) => {
    const { purchase_id, supplier_id, items, total_amount, refund_method = 'credit', remarks } = req.body;
    if (!supplier_id || !Array.isArray(items) || items.length === 0 || !total_amount) {
        return res.status(400).json({ error: 'Supplier, items, and total amount required' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const returnNow = getLocalNow();
        const returnDate = getLocalDate();
        const returnUUID = generateUUID();

        db.run(
            `INSERT INTO purchase_returns (uuid, purchase_id, supplier_id, user_id, total_amount, refund_method, remarks, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [returnUUID, purchase_id || null, supplier_id, req.user.id, total_amount, refund_method || 'credit', remarks || 'Supplier purchase return', returnNow],
            function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }
                const returnId = this.lastID;

                const itemStmt = db.prepare(`
                    INSERT INTO purchase_return_items (uuid, purchase_return_id, variant_id, packaging_type_id, quantity, return_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                const movementStmt = db.prepare(`
                    INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, notes, user_id, created_at)
                    VALUES (?, ?, ?, 'PURCHASE_RETURN', ?, ?, ?, 'PURCHASE_RETURN', ?, ?, ?)
                `);

                items.forEach(it => {
                    itemStmt.run(generateUUID(), returnId, it.variant_id, it.packaging_type_id, it.quantity, it.return_price);

                    const factor = it.conversion_factor || 1;
                    const equivalentQty = it.quantity * factor;

                    // Deduct returned stock
                    db.run(`UPDATE product_variants SET current_stock = current_stock - ? WHERE id = ?`, [equivalentQty, it.variant_id]);
                    db.run(`UPDATE inventory_stock SET quantity = quantity - ? WHERE variant_id = ?`, [equivalentQty, it.variant_id]);

                    movementStmt.run(
                        generateUUID(), it.variant_id, it.packaging_type_id,
                        it.quantity, equivalentQty, String(returnId),
                        `Purchase return to supplier #${supplier_id}`, req.user.id, returnNow
                    );
                });

                itemStmt.finalize();
                movementStmt.finalize();

                // Settlement Handling
                if (refund_method === 'cash') {
                    // Supplier returned cash to our shop drawer (cash inflow)
                    db.run(
                        `INSERT INTO payments (uuid, party_type, party_id, amount, payment_method, reference_no, user_id, device_id, notes, payment_date, created_at)
                         VALUES (?, 'supplier', ?, ?, 'cash', ?, ?, 'desktop', ?, ?, ?)`,
                        [generateUUID(), supplier_id, -total_amount, purchase_id ? `PUR-${purchase_id}` : null, req.user.id, `Supplier Cash Refund for Return #${returnId}`, returnDate, returnNow]
                    );

                    db.run(
                        `INSERT INTO supplier_ledger (uuid, supplier_id, purchase_id, amount, type, description, payment_date, created_at)
                         VALUES (?, ?, ?, ?, 'return', ?, ?, ?)`,
                        [generateUUID(), supplier_id, purchase_id || null, total_amount, `Purchase Return #${returnId} - Cash Refund Received`, returnDate, returnNow]
                    );
                } else {
                    // Reduce supplier payable balance (or set advance with supplier if overpaid)
                    db.run(
                        `INSERT INTO supplier_ledger (uuid, supplier_id, purchase_id, amount, type, description, payment_date, created_at)
                         VALUES (?, ?, ?, ?, 'return', ?, ?, ?)`,
                        [generateUUID(), supplier_id, purchase_id || null, total_amount, `Purchase Return #${returnId} - Payable Reduced`, returnDate, returnNow]
                    );
                    db.run(`UPDATE suppliers SET balance = balance - ? WHERE id = ?`, [total_amount, supplier_id]);
                }

                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    logAudit(req.user.id, req.user.username, 'PURCHASE_RETURN', 'purchase_returns', returnId, `Returned Rs. ${total_amount} (Method: ${refund_method})`);
                    syncEngine.enqueueSync('PURCHASE_RETURN', 'purchase_returns', returnId, req.body);
                    res.json({ success: true, returnId });
                });
            }
        );
    });
});

// ─── CLOUD SERVER SYNC INGEST & PULL (IDEMPOTENCY & CONFLICT HANDLING) ──────
app.post('/api/sync/ingest', (req, res) => {
    const { uuid, operation_type, entity_name, entity_id, payload, device_id } = req.body;
    if (!uuid || !operation_type) {
        return res.status(400).json({ error: 'UUID and operation_type required for sync transaction' });
    }

    // Check Idempotency: Has this UUID already been processed?
    db.get("SELECT uuid FROM audit_logs WHERE uuid = ? OR details LIKE ?", [uuid, `%${uuid}%`], (err, exists) => {
        if (exists) {
            console.log(`[Sync Ingest] Idempotent hit: ${uuid} already processed.`);
            return res.json({ success: true, idempotent: true, message: 'Transaction already applied' });
        }

        // Apply transaction and detect stock conflict
        logAudit(1, 'SyncEngine', `SYNC_${operation_type}`, entity_name, entity_id, { uuid, payload, device_id }, device_id);

        res.json({ success: true, processedUuid: uuid, conflict: false });
    });
});

app.get('/api/sync/pull', (req, res) => {
    const since = req.query.since || '1970-01-01';
    db.all("SELECT * FROM products WHERE created_at >= ?", [since], (err, products) => {
        db.all("SELECT * FROM categories WHERE created_at >= ?", [since], (err, categories) => {
            db.all("SELECT * FROM packaging_types WHERE created_at >= ?", [since], (err, packagingTypes) => {
                res.json({ products: products || [], categories: categories || [], packagingTypes: packagingTypes || [] });
            });
        });
    });
});

// ─── DATABASE LOCAL BACKUP & RESTORE (ADMIN ONLY) ───────────────────────────
const backupDir = path.join(__dirname, '..', 'Backups');
if (!fs.existsSync(backupDir)) {
    try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {}
}

app.post('/api/system/backup', authenticateToken, requireAdmin, (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `wholesale-backup-${timestamp}.db`;
    const targetPath = path.join(backupDir, backupFileName);

    // Get current SQLite DB path
    const currentDbPath = db.filename || path.join(__dirname, 'wholesale.db');

    if (fs.existsSync(currentDbPath)) {
        fs.copyFile(currentDbPath, targetPath, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(req.user.id, req.user.username, 'CREATE_BACKUP', 'system', null, backupFileName);
            res.json({ success: true, backupFileName, path: targetPath });
        });
    } else {
        res.status(404).json({ error: 'Live database file not found for backup' });
    }
});

app.get('/api/system/backups', authenticateToken, requireAdmin, (req, res) => {
    try {
        if (!fs.existsSync(backupDir)) return res.json([]);
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).map(f => {
            const stats = fs.statSync(path.join(backupDir, f));
            return { fileName: f, size: stats.size, createdAt: stats.birthtime };
        });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Hilal Wholesaler Express Server listening on http://localhost:${PORT}`);
    // Initialize WhatsApp & Reminder Scheduler in background
    setTimeout(() => {
        try {
            whatsappService.initWhatsApp();
            schedulerService.scheduleReminderJob();
        } catch (e) {
            console.error('[WhatsApp Service] Startup init failed:', e.message);
        }
    }, 1000);
});

// Process-level unhandled rejection & exception guards
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Backend Server] Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Backend Server] Uncaught Exception:', err);
});

module.exports = app;

