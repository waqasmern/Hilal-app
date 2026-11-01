const db = require('./database');
const crypto = require('crypto');

const DEFAULT_CLOUD_URL = 'https://hilal-app-three.vercel.app';
const SYNC_TIMEOUT_MS = 10000;
const STRANDED_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-process single-worker mutex lock
let isSyncRunning = false;

function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
}

/**
 * Format any cloud ISO or UTC timestamp strictly into Pakistan Standard Time (Asia/Karachi)
 * stored as "YYYY-MM-DD HH:MM:SS" matching local SQLite standards.
 */
function formatToLocalDbTime(dateStr) {
    if (!dateStr) {
        const d = new Date();
        const str = d.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: false });
        const [datePart, timePart] = str.split(', ');
        const [m, day, y] = datePart.split('/');
        const pad = n => String(n).padStart(2, '0');
        return `${y}-${pad(m)}-${pad(day)} ${timePart}`;
    }
    let s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
        s = s + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return dateStr;
    const pad = n => String(n).padStart(2, '0');
    const str = d.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: false });
    const [datePart, timePart] = str.split(', ');
    const [m, day, y] = datePart.split('/');
    return `${y}-${pad(m)}-${pad(day)} ${timePart}`;
}

/**
 * Promise-wrapped db.run with strict error callback
 */
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

/**
 * Promise-wrapped db.get with strict error callback
 */
function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * Promise-wrapped db.all with strict error callback
 */
function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

/**
 * Fetch a setting from SQLite settings table
 */
async function getSetting(key, defaultValue = null) {
    const row = await getQuery("SELECT value FROM settings WHERE key = ?", [key]);
    return row && row.value ? row.value : defaultValue;
}

/**
 * Save a setting into SQLite settings table
 */
async function setSetting(key, value) {
    return await runQuery(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, String(value)]
    );
}

/**
 * Get target cloud server URL (falls back to production Vercel URL if local or unset)
 */
async function getServerUrl() {
    const val = await getSetting('server_url', DEFAULT_CLOUD_URL);
    if (!val || val.includes('localhost') || val.includes('127.0.0.1')) {
        return DEFAULT_CLOUD_URL;
    }
    return val.replace(/\/+$/, '');
}

/**
 * Get local device identifier
 */
async function getDeviceId() {
    return await getSetting('device_id', 'DEVICE-CASHIER-01');
}

/**
 * Enqueue a transaction operation into local sync_queue outbox
 */
async function enqueueSync(operationType, entityName, entityId, payload, deviceId = null) {
    const uuid = generateUUID();
    const effectiveDeviceId = deviceId || await getDeviceId();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const query = `
        INSERT INTO sync_queue (uuid, operation_type, entity_name, entity_id, payload, status, retry_count, device_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `;
    const res = await runQuery(query, [uuid, operationType, entityName, String(entityId), payloadStr, effectiveDeviceId]);
    console.log(`[SyncEngine] Enqueued transaction ${uuid} for ${operationType}:${entityName}`);
    return { id: res.lastID, uuid };
}

/**
 * Recover stranded SYNCING events (e.g., after application crash or power loss)
 */
async function recoverStrandedSyncEvents() {
    const res = await runQuery(
        `UPDATE sync_queue 
         SET status = 'PENDING', updated_at = datetime('now', 'localtime') 
         WHERE status = 'SYNCING' AND updated_at < datetime('now', '-5 minutes')`,
        []
    );
    if (res && res.changes > 0) {
        console.log(`[SyncEngine] Recovered ${res.changes} stranded SYNCING events back to PENDING.`);
    }
    return res ? res.changes : 0;
}

/**
 * Get pending sync items eligible for push with exponential backoff
 */
async function getPendingSyncItems() {
    const rows = await allQuery(
        `SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED') ORDER BY id ASC LIMIT 100`,
        []
    );
    const now = Date.now();
    return rows.filter(item => {
        if (item.status === 'PENDING') return true;
        // Exponential backoff: min(300s, 2^retries * 5s)
        const retries = Number(item.retry_count) || 0;
        const backoffSeconds = Math.min(300, Math.pow(2, retries) * 5);
        const lastUpdated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
        return (now - lastUpdated) >= (backoffSeconds * 1000);
    });
}

/**
 * Mark sync item status and error details
 */
async function updateSyncStatus(uuid, status, errorMessage = null, incrementRetry = false) {
    const retryClause = incrementRetry ? 'retry_count = retry_count + 1,' : '';
    const sql = `
        UPDATE sync_queue 
        SET status = ?, 
            error_message = ?, 
            ${retryClause}
            updated_at = datetime('now', 'localtime') 
        WHERE uuid = ?
    `;
    return await runQuery(sql, [status, errorMessage, uuid]);
}

/**
 * Get comprehensive synchronization statistics and metrics
 */
async function getSyncStats() {
    const queueRow = await getQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('PENDING', 'FAILED', 'SYNCING') THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'SYNCING' THEN 1 ELSE 0 END) as syncing,
            SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END) as synced,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
        FROM sync_queue
    `, []);

    const pendingOrdersRow = await getQuery(`
        SELECT COUNT(*) as pending_orders 
        FROM sales 
        WHERE order_status = 'PENDING' OR status = 'pending'
    `, []);

    const [lastPush, lastPull, lastFull, lastCursor, lastErr] = await Promise.all([
        getSetting('last_push_at'),
        getSetting('last_pull_at'),
        getSetting('last_full_sync_at'),
        getSetting('last_pull_cursor'),
        getSetting('last_sync_error')
    ]);

    return {
        total: queueRow?.total || 0,
        pending: queueRow?.pending || 0,
        syncing: queueRow?.syncing || 0,
        synced: queueRow?.synced || 0,
        failed: queueRow?.failed || 0,
        pendingOrders: pendingOrdersRow?.pending_orders || 0,
        lastPushAt: lastPush,
        lastPullAt: lastPull,
        lastFullSyncAt: lastFull,
        lastPullCursor: lastCursor,
        lastError: lastErr,
        isSyncRunning
    };
}

/**
 * Push offline transactions with mutex locking, exponential backoff, and response validation
 */
async function processPushSync() {
    await recoverStrandedSyncEvents();
    const pendingItems = await getPendingSyncItems();
    if (pendingItems.length === 0) {
        return { status: 'up_to_date', processed: 0, success: 0, failed: 0 };
    }

    const serverUrl = await getServerUrl();
    const deviceId = await getDeviceId();
    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    for (const item of pendingItems) {
        await updateSyncStatus(item.uuid, 'SYNCING');
        try {
            let parsedPayload;
            try {
                parsedPayload = JSON.parse(item.payload);
            } catch (e) {
                parsedPayload = item.payload;
            }

            const response = await fetch(`${serverUrl}/api/sync/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Id': deviceId
                },
                body: JSON.stringify({
                    uuid: item.uuid,
                    operation_type: item.operation_type,
                    entity_name: item.entity_name,
                    entity_id: item.entity_id,
                    payload: parsedPayload,
                    device_id: deviceId
                }),
                signal: AbortSignal.timeout(SYNC_TIMEOUT_MS)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Server returned HTTP ${response.status}: ${errText.slice(0, 150)}`);
            }

            const resJson = await response.json();
            // Critical Validation: HTTP 200 is only success if server confirms ingestion
            if (resJson && (resJson.success || resJson.idempotent) && resJson.processedUuid === item.uuid) {
                await updateSyncStatus(item.uuid, 'SYNCED', null, false);
                successCount++;
            } else {
                throw new Error(resJson?.error || 'Server did not confirm transaction ingestion');
            }
        } catch (err) {
            lastError = err.message;
            await updateSyncStatus(item.uuid, 'FAILED', err.message, true);
            failCount++;
        }
    }

    const nowIso = new Date().toISOString();
    if (successCount > 0 && failCount === 0) {
        await setSetting('last_push_at', nowIso);
        await setSetting('last_sync_error', '');
    } else if (lastError) {
        await setSetting('last_sync_error', `Push Error: ${lastError}`);
    }

    return {
        status: failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed'),
        processed: pendingItems.length,
        success: successCount,
        failed: failCount,
        lastError
    };
}

/**
 * Pull incremental updates from Cloud with atomic transaction, delta stock movements & ledger integrity
 */
async function processPullSync() {
    const serverUrl = await getServerUrl();
    const cursor = await getSetting('last_pull_cursor', null);
    const pullUrl = new URL(`${serverUrl}/api/sync/pull`);
    if (cursor) pullUrl.searchParams.set('cursor', cursor);

    console.log(`[SyncEngine] Pulling updates from: ${pullUrl.toString()}`);

    const response = await fetch(pullUrl.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS)
    });

    if (!response.ok) {
        throw new Error(`Cloud server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.success) {
        throw new Error(data?.error || 'Invalid pull payload from cloud');
    }

    let pulledProducts = 0;
    let pulledMovements = 0;
    let pulledLedgers = 0;
    let pulledOrders = 0;

    // Apply entire pull transactionally with strict error propagation and rollback
    await runQuery("BEGIN TRANSACTION");
    try {
        // 1. Categories
        if (Array.isArray(data.categories)) {
            for (const c of data.categories) {
                await runQuery(
                    `INSERT INTO categories (id, uuid, name, is_pinned, is_deleted)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         is_pinned = excluded.is_pinned,
                         is_deleted = excluded.is_deleted`,
                    [c.id, c.uuid || generateUUID(), c.name, c.is_pinned ? 1 : 0, c.is_deleted ? 1 : 0]
                );
            }
        }

        // 2. Units
        if (Array.isArray(data.units)) {
            for (const u of data.units) {
                await runQuery(
                    `INSERT INTO units (id, uuid, name, symbol, description)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         symbol = excluded.symbol,
                         description = excluded.description`,
                    [u.id, u.uuid || generateUUID(), u.name, u.symbol || u.name, u.description || '']
                );
            }
        }

        // 3. Packaging Types
        if (Array.isArray(data.packagingTypes)) {
            for (const p of data.packagingTypes) {
                await runQuery(
                    `INSERT INTO packaging_types (id, uuid, name, description)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         description = excluded.description`,
                    [p.id, p.uuid || generateUUID(), p.name, p.description || '']
                );
            }
        }

        // 4. Products: Updates catalog metadata WITHOUT touching stock
        if (Array.isArray(data.products)) {
            for (const p of data.products) {
                await runQuery(
                    `INSERT INTO products (id, uuid, category_id, brand_id, name, description, is_essential, is_deleted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         category_id = excluded.category_id,
                         brand_id = excluded.brand_id,
                         name = excluded.name,
                         description = excluded.description,
                         is_essential = excluded.is_essential,
                         is_deleted = excluded.is_deleted`,
                    [p.id, p.uuid || generateUUID(), p.category_id, p.brand_id || null, p.name, p.description || '', p.is_essential ? 1 : 0, p.is_deleted ? 1 : 0]
                );
                pulledProducts++;
            }
        }

        // 5. Product Variants: Metadata updates ONLY (Preserves current_stock!)
        if (Array.isArray(data.productVariants)) {
            for (const v of data.productVariants) {
                await runQuery(
                    `INSERT INTO product_variants (id, uuid, product_id, sku, barcode, variant_name, base_unit_id, minimum_stock, reorder_level, is_loose_allowed, current_stock, is_deleted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         sku = excluded.sku,
                         barcode = excluded.barcode,
                         variant_name = excluded.variant_name,
                         base_unit_id = excluded.base_unit_id,
                         minimum_stock = excluded.minimum_stock,
                         reorder_level = excluded.reorder_level,
                         is_loose_allowed = excluded.is_loose_allowed,
                         is_deleted = excluded.is_deleted`,
                    [v.id, v.uuid || generateUUID(), v.product_id, v.sku, v.barcode, v.variant_name || 'Standard', v.base_unit_id || 1, v.minimum_stock || 10, v.reorder_level || 15, v.is_loose_allowed ? 1 : 0, Number(v.current_stock || 0), v.is_deleted ? 1 : 0]
                );

                // Ensure corresponding inventory_stock row exists without overwriting current stock
                await runQuery(
                    `INSERT INTO inventory_stock (uuid, variant_id, quantity, loose_quantity, updated_at)
                     VALUES (?, ?, ?, 0, datetime('now', 'localtime'))
                     ON CONFLICT(variant_id) DO NOTHING`,
                    [generateUUID(), v.id, Number(v.current_stock || 0)]
                );
            }
        }

        // 6. Product Packagings
        if (Array.isArray(data.productPackagings)) {
            for (const p of data.productPackagings) {
                await runQuery(
                    `INSERT INTO product_packagings (id, uuid, variant_id, packaging_type_id, conversion_factor, is_default, purchase_price, selling_price, barcode)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         conversion_factor = excluded.conversion_factor,
                         is_default = excluded.is_default,
                         purchase_price = excluded.purchase_price,
                         selling_price = excluded.selling_price,
                         barcode = excluded.barcode`,
                    [p.id, p.uuid || generateUUID(), p.variant_id, p.packaging_type_id, Number(p.conversion_factor) || 1, p.is_default ? 1 : 0, Number(p.purchase_price) || 0, Number(p.selling_price) || 0, p.barcode || '']
                );
            }
        }

        // 7. Customers: Metadata updates ONLY (Preserves balance!)
        if (Array.isArray(data.customers)) {
            for (const c of data.customers) {
                await runQuery(
                    `INSERT INTO customers (id, uuid, name, business_name, phone, mobile, address, cnic_ntn, credit_limit, opening_balance, balance, is_deleted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         business_name = excluded.business_name,
                         phone = excluded.phone,
                         mobile = excluded.mobile,
                         address = excluded.address,
                         credit_limit = excluded.credit_limit,
                         is_deleted = excluded.is_deleted`,
                    [c.id, c.uuid || generateUUID(), c.name, c.business_name || '', c.phone || '', c.mobile || '', c.address || '', c.cnic_ntn || '', Number(c.credit_limit) || 0, Number(c.opening_balance) || 0, Number(c.opening_balance) || 0, c.is_deleted ? 1 : 0]
                );
            }
        }

        // 7b. Suppliers: Metadata updates ONLY (Preserves balance!)
        if (Array.isArray(data.suppliers)) {
            for (const s of data.suppliers) {
                await runQuery(
                    `INSERT INTO suppliers (id, uuid, name, company_name, phone, address, opening_balance, balance, is_deleted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         company_name = excluded.company_name,
                         phone = excluded.phone,
                         address = excluded.address,
                         is_deleted = excluded.is_deleted`,
                    [s.id, s.uuid || generateUUID(), s.name, s.company_name || '', s.phone || '', s.address || '', Number(s.opening_balance) || 0, Number(s.opening_balance) || 0, s.is_deleted ? 1 : 0]
                );
            }
        }

        // 8. Reliable Stock Movements: Delta applied exactly once per UUID
        if (Array.isArray(data.stockMovements)) {
            for (const m of data.stockMovements) {
                if (!m.uuid) continue;
                const exists = await getQuery("SELECT id FROM stock_movements WHERE uuid = ?", [m.uuid]);
                if (exists) continue; // Already applied locally, skip idempotently!

                const equivQty = Number(m.equivalent_qty) || Number(m.quantity) || 0;
                const vId = parseInt(m.variant_id);
                const isPositive = ['PURCHASE', 'ADJUSTMENT', 'RETURN', 'OPENING_STOCK'].includes(m.movement_type);
                const delta = isPositive ? equivQty : -equivQty;

                await runQuery(
                    `INSERT INTO stock_movements (uuid, variant_id, packaging_type_id, movement_type, quantity, equivalent_qty, reference_id, reference_type, notes, user_id, device_id, created_at, is_synced)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [
                        m.uuid, vId, m.packaging_type_id || null, m.movement_type,
                        Number(m.quantity) || 0, equivQty, m.reference_id || '', m.reference_type || '',
                        m.notes || 'Cloud sync movement', m.user_id || 1, m.device_id || 'CLOUD-WEB',
                        formatToLocalDbTime(m.created_at)
                    ]
                );

                await runQuery(`UPDATE product_variants SET current_stock = current_stock + ? WHERE id = ?`, [delta, vId]);
                await runQuery(`UPDATE inventory_stock SET quantity = quantity + ? WHERE variant_id = ?`, [delta, vId]);
                pulledMovements++;
            }
        }

        // 9. Customer Ledger: Financial transactions applied exactly once per UUID
        if (Array.isArray(data.customerLedger)) {
            for (const l of data.customerLedger) {
                if (!l.uuid) continue;
                const exists = await getQuery("SELECT id FROM customer_ledger WHERE uuid = ?", [l.uuid]);
                if (exists) continue; // Already applied locally, skip idempotently!

                const amt = Number(l.amount) || 0;
                const cId = parseInt(l.customer_id);
                const isCharge = l.type === 'charge';
                const delta = isCharge ? amt : -amt;

                await runQuery(
                    `INSERT INTO customer_ledger (uuid, customer_id, sale_id, payment_id, amount, type, description, payment_method, payment_date, created_at, is_synced)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [
                        l.uuid, cId, l.sale_id || null, l.payment_id || null, amt,
                        l.type, l.description || '', l.payment_method || 'cash',
                        l.payment_date || formatToLocalDbTime(l.created_at).split(' ')[0],
                        formatToLocalDbTime(l.created_at)
                    ]
                );

                await runQuery(`UPDATE customers SET balance = balance + ? WHERE id = ?`, [delta, cId]);
                pulledLedgers++;
            }
        }

        // 10. Online Orders & Sales (Distinguishes PENDING from INVOICED)
        if (Array.isArray(data.sales)) {
            for (const s of data.sales) {
                const isPendingOrder = (s.order_status === 'PENDING' || s.status === 'pending');
                const orderStatus = isPendingOrder ? 'PENDING' : (s.order_status || 'COMPLETED');
                const status = isPendingOrder ? 'pending' : (s.status || 'completed');

                const existingSale = await getQuery("SELECT id FROM sales WHERE invoice_no = ? OR uuid = ?", [s.invoice_no, s.uuid]);
                let localSaleId;

                if (existingSale) {
                    localSaleId = existingSale.id;
                    await runQuery(
                        `UPDATE sales SET
                            status = ?,
                            payment_status = ?,
                            order_status = ?,
                            amount_paid = ?,
                            remaining_balance = ?
                         WHERE id = ?`,
                        [status, s.payment_status || 'unpaid', orderStatus, Number(s.amount_paid) || 0, Number(s.remaining_balance) || 0, localSaleId]
                    );
                } else {
                    const insRes = await runQuery(
                        `INSERT INTO sales (
                            uuid, invoice_no, customer_id, user_id, device_id, gross_amount, discount, 
                            special_discount, additional_charges, net_amount, amount_paid, remaining_balance, 
                            status, payment_status, payment_method, remarks, is_synced, order_status, online_order_id, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
                        [
                            s.uuid || generateUUID(), s.invoice_no, s.customer_id || null, s.user_id || 1, s.device_id || 'ONLINE-WEB',
                            Number(s.gross_amount) || 0, Number(s.discount) || 0, Number(s.special_discount) || 0, Number(s.additional_charges) || 0,
                            Number(s.net_amount) || 0, Number(s.amount_paid) || 0, Number(s.remaining_balance) || 0,
                            status, s.payment_status || 'unpaid', s.payment_method || 'cash',
                            s.remarks || 'Online Order', orderStatus, String(s.id), formatToLocalDbTime(s.created_at)
                        ]
                    );
                    localSaleId = insRes.lastID;
                    pulledOrders++;
                }

                // If sale items are provided directly on sale or in data.saleItems
                const itemsForThisSale = (data.saleItems || []).filter(i => String(i.sale_id) === String(s.id));
                for (const i of itemsForThisSale) {
                    const itemUuid = i.uuid || generateUUID();
                    const existingItem = await getQuery("SELECT id FROM sale_items WHERE uuid = ?", [itemUuid]);
                    if (!existingItem) {
                        await runQuery(
                            `INSERT INTO sale_items (uuid, sale_id, variant_id, packaging_type_id, unit_name, quantity, price, discount, total, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                itemUuid, localSaleId, i.variant_id, i.packaging_type_id || 1,
                                i.unit_name || 'Units', Number(i.quantity) || 1, Number(i.price) || 0, Number(i.discount) || 0,
                                Number(i.total) || 0, formatToLocalDbTime(i.created_at)
                            ]
                        );
                    }
                }
            }
        }

        // 11. Sales Returns & Return Items
        if (Array.isArray(data.saleReturns)) {
            for (const r of data.saleReturns) {
                const returnUuid = r.uuid || generateUUID();
                const existingReturn = await getQuery("SELECT id FROM sale_returns WHERE uuid = ? OR id = ?", [returnUuid, r.id]);
                let localReturnId;

                if (existingReturn) {
                    localReturnId = existingReturn.id;
                } else {
                    const insRes = await runQuery(
                        `INSERT INTO sale_returns (
                            id, uuid, sale_id, customer_id, user_id, total_refund, return_type, refund_method, status, remarks, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            r.id, returnUuid, r.sale_id || null, r.customer_id || null, r.user_id || 1,
                            Number(r.total_refund) || 0, r.return_type || 'saleable', r.refund_method || 'credit',
                            r.status || 'completed', r.remarks || 'Customer return', formatToLocalDbTime(r.created_at)
                        ]
                    );
                    localReturnId = insRes.lastID || r.id;
                }

                // If return items are provided
                const itemsForThisReturn = (data.saleReturnItems || []).filter(i => String(i.sale_return_id) === String(r.id));
                for (const it of itemsForThisReturn) {
                    const itemUuid = it.uuid || generateUUID();
                    const existingItem = await getQuery("SELECT id FROM sale_return_items WHERE uuid = ?", [itemUuid]);
                    if (!existingItem) {
                        await runQuery(
                            `INSERT INTO sale_return_items (
                                uuid, sale_return_id, variant_id, packaging_type_id, quantity, refund_price
                            ) VALUES (?, ?, ?, ?, ?, ?)`,
                            [
                                itemUuid, localReturnId, it.variant_id, it.packaging_type_id || 1,
                                Number(it.quantity) || 0, Number(it.refund_price) || 0
                            ]
                        );
                    }
                }
            }
        }

        // Commit transaction
        await runQuery("COMMIT");
    } catch (txErr) {
        await runQuery("ROLLBACK");
        throw txErr;
    }

    // Update cursor ONLY AFTER successful commit
    const nextCursor = data.cursor || data.serverTimestamp || new Date().toISOString();
    await setSetting('last_pull_cursor', nextCursor);
    await setSetting('last_pull_at', new Date().toISOString());
    await setSetting('last_sync_error', '');

    return {
        status: 'completed',
        pulledProducts,
        pulledMovements,
        pulledLedgers,
        pulledOrders,
        cursor: nextCursor
    };
}

/**
 * Execute full bidirectional sync with single-worker mutex lock and independent reporting
 */
async function processTwoWaySync() {
    if (isSyncRunning) {
        console.log('[SyncEngine] Sync already in progress, skipping concurrent run.');
        return { success: false, status: 'busy', message: 'Synchronization already in progress' };
    }

    isSyncRunning = true;
    let pushResult = null;
    let pullResult = null;

    try {
        console.log('[SyncEngine] Starting Production Two-Way Sync...');
        
        // 1. Push offline outbox transactions up to Cloud
        try {
            pushResult = await processPushSync();
        } catch (pushErr) {
            console.error('[SyncEngine] Push sync failed:', pushErr.message);
            pushResult = { status: 'failed', error: pushErr.message };
        }

        // 2. Pull online updates & delta movements down to local SQLite
        try {
            pullResult = await processPullSync();
        } catch (pullErr) {
            console.error('[SyncEngine] Pull sync failed:', pullErr.message);
            pullResult = { status: 'failed', error: pullErr.message };
        }

        const pushOk = pushResult && (pushResult.status === 'completed' || pushResult.status === 'up_to_date');
        const pullOk = pullResult && pullResult.status === 'completed';
        const isOverallSuccess = Boolean(pushOk && pullOk);

        const nowIso = new Date().toISOString();
        if (isOverallSuccess) {
            await setSetting('last_full_sync_at', nowIso);
            await setSetting('last_sync_error', '');
        } else {
            const errSummary = [pushResult?.error, pullResult?.error].filter(Boolean).join(' | ');
            if (errSummary) await setSetting('last_sync_error', errSummary);
        }

        return {
            success: isOverallSuccess,
            push: pushResult,
            pull: pullResult,
            timestamp: nowIso
        };
    } catch (err) {
        console.error('[SyncEngine] Fatal two-way sync error:', err.message);
        await setSetting('last_sync_error', err.message);
        return {
            success: false,
            push: pushResult || { status: 'failed', error: err.message },
            pull: pullResult || { status: 'failed', error: err.message },
            error: err.message,
            timestamp: new Date().toISOString()
        };
    } finally {
        isSyncRunning = false;
    }
}

module.exports = {
    enqueueSync,
    getPendingSyncItems,
    getSyncStats,
    updateSyncStatus,
    recoverStrandedSyncEvents,
    processPushSync,
    processPullSync,
    processTwoWaySync,
    getServerUrl,
    getDeviceId,
    getSetting,
    setSetting
};
