/**
 * Production Database Reset Script for Hilal Wholesaler Shop
 * 
 * Safely clears all transactional data (Sales, Purchases, Returns, Payments, Ledgers, Expenses, Cash Registers, Movements)
 * and all Customers and Suppliers, while preserving:
 * - Product master catalog (products, variants, packagings, categories, brands, units)
 * - Users & Auth accounts (admin, cashier logins)
 * - Shop Settings (shop profile, printer config, bank accounts)
 * 
 * Target environments:
 * 1. Local SQLite: backend/wholesale.db and %APPDATA%/HilalWholesalerShop/wholesale.db
 * 2. Remote Supabase: https://nncduklltahxexaevdou.supabase.co
 */

const path = require('path');
const fs = require('fs');

const sqlite3Path = path.join(__dirname, '../backend/node_modules/sqlite3');
const supabasePath = path.join(__dirname, '../frontend/node_modules/@supabase/supabase-js');

const sqlite3 = require(sqlite3Path).verbose();
const { createClient } = require(supabasePath);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nncduklltahxexaevdou.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KQ_Jkru3srbmwZEIsJWo4w_IGlKwI5M';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// ─── 1. LOCAL SQLITE RESET ───────────────────────────────────────────────────

const TABLES_TO_CLEAR = [
    'sale_return_items',
    'sale_returns',
    'sale_items',
    'sales',
    'purchase_return_items',
    'purchase_returns',
    'purchase_items',
    'purchases',
    'customer_ledger',
    'supplier_ledger',
    'customer_prices',
    'payments',
    'expenses',
    'cash_registers',
    'stock_movements',
    'audit_logs',
    'sync_queue',
    'customers',
    'suppliers'
];

function resetSqliteDatabase(dbFilePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dbFilePath)) {
            console.log(`[SQLite] File not found (skipping): ${dbFilePath}`);
            return resolve();
        }

        console.log(`\n======================================================`);
        console.log(`[SQLite] Processing: ${dbFilePath}`);
        console.log(`======================================================`);

        // Backup first
        const backupPath = `${dbFilePath}.backup_pre_production_${getTimestamp()}`;
        try {
            fs.copyFileSync(dbFilePath, backupPath);
            console.log(`✓ Safety backup created: ${backupPath}`);
        } catch (copyErr) {
            console.error(`✗ Backup failed: ${copyErr.message}`);
            return reject(copyErr);
        }

        const db = new sqlite3.Database(dbFilePath, (err) => {
            if (err) return reject(err);
        });

        db.serialize(() => {
            db.run("PRAGMA foreign_keys = OFF");

            // Query existing tables
            db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
                if (err) {
                    db.close();
                    return reject(err);
                }

                const existingTables = new Set(rows.map(r => r.name));

                TABLES_TO_CLEAR.forEach((tbl) => {
                    if (existingTables.has(tbl)) {
                        db.run(`DELETE FROM ${tbl}`, (dErr) => {
                            if (dErr) console.error(`  ✗ Error clearing ${tbl}:`, dErr.message);
                            else console.log(`  ✓ Cleared table: ${tbl}`);
                        });
                    }
                });

                // Reset stock to 0 for master catalog
                if (existingTables.has('inventory_stock')) {
                    db.run("UPDATE inventory_stock SET quantity = 0, loose_quantity = 0", (sErr) => {
                        if (!sErr) console.log("  ✓ Reset inventory_stock (quantities = 0)");
                    });
                }
                if (existingTables.has('product_variants')) {
                    db.run("UPDATE product_variants SET current_stock = 0", (vErr) => {
                        if (!vErr) console.log("  ✓ Reset product_variants (current_stock = 0)");
                    });
                }

                // Reset SQLite autoincrement sequence counters
                const seqPlaceholders = TABLES_TO_CLEAR.map(t => `'${t}'`).join(',');
                db.run(`DELETE FROM sqlite_sequence WHERE name IN (${seqPlaceholders})`, (seqErr) => {
                    if (!seqErr) console.log("  ✓ Reset autoincrement sequences");
                });

                db.run("PRAGMA foreign_keys = ON");

                db.run("VACUUM", (vErr) => {
                    if (vErr) console.error("  ✗ VACUUM error:", vErr.message);
                    else console.log("  ✓ VACUUM completed (file optimized)");

                    // Verify remaining counts
                    db.get("SELECT COUNT(*) as cnt FROM products", (pErr, pRow) => {
                        console.log(`  ℹ Products preserved: ${pRow?.cnt || 0}`);
                    });
                    db.get("SELECT COUNT(*) as cnt FROM users", (uErr, uRow) => {
                        console.log(`  ℹ Users preserved: ${uRow?.cnt || 0}`);
                    });
                    db.get("SELECT COUNT(*) as cnt FROM settings", (sErr, sRow) => {
                        console.log(`  ℹ Settings preserved: ${sRow?.cnt || 0}`);
                        db.close(() => {
                            console.log(`[SQLite] Finished resetting: ${dbFilePath}`);
                            resolve();
                        });
                    });
                });
            });
        });
    });
}

// ─── 2. SUPABASE CLOUD RESET ─────────────────────────────────────────────────

const SUPABASE_TABLES_ORDER = [
    'sale_return_items',
    'sale_returns',
    'sale_items',
    'sales',
    'purchase_return_items',
    'purchase_returns',
    'purchase_items',
    'purchases',
    'customer_ledger',
    'supplier_ledger',
    'customer_prices',
    'payments',
    'expenses',
    'cash_registers',
    'stock_movements',
    'whatsapp_reminders',
    'whatsapp_logs',
    'customers',
    'suppliers'
];

async function resetSupabase() {
    console.log(`\n======================================================`);
    console.log(`[Supabase] Processing Cloud Database: ${SUPABASE_URL}`);
    console.log(`======================================================`);

    for (const tbl of SUPABASE_TABLES_ORDER) {
        try {
            // Delete all rows where id is not negative (standard blanket delete via Supabase)
            const { error } = await supabase.from(tbl).delete().neq('id', -999999);
            if (error) {
                // If table doesn't have an 'id' column or is empty
                if (error.code === '42P01') {
                    console.log(`  - Table ${tbl} does not exist in Supabase (skipped)`);
                } else {
                    console.warn(`  ✗ [Supabase] ${tbl} delete: ${error.message}`);
                }
            } else {
                console.log(`  ✓ [Supabase] Cleared table: ${tbl}`);
            }
        } catch (e) {
            console.warn(`  ✗ [Supabase] Exception on ${tbl}: ${e.message}`);
        }
    }

    // Reset stock quantities in Supabase
    try {
        const { error: invErr } = await supabase
            .from('inventory_stock')
            .update({ quantity: 0, loose_quantity: 0 })
            .neq('id', -999999);
        if (!invErr) console.log("  ✓ [Supabase] Reset inventory_stock to 0");
    } catch (_) {}

    try {
        const { error: varErr } = await supabase
            .from('product_variants')
            .update({ current_stock: 0 })
            .neq('id', -999999);
        if (!varErr) console.log("  ✓ [Supabase] Reset product_variants current_stock to 0");
    } catch (_) {}

    // Verify Cloud Counts
    console.log(`\n[Supabase] Verification of remaining data:`);
    const verifyTables = ['sales', 'customers', 'suppliers', 'payments', 'products', 'users', 'settings'];
    for (const vt of verifyTables) {
        try {
            const { count, error } = await supabase.from(vt).select('*', { count: 'exact', head: true });
            if (error) console.log(`  ${vt}: error (${error.message})`);
            else console.log(`  ${vt}: ${count} rows`);
        } catch (e) {
            console.log(`  ${vt}: exception (${e.message})`);
        }
    }
}

// ─── MAIN RUNNER ─────────────────────────────────────────────────────────────

async function main() {
    console.log('######################################################');
    console.log('# HILAL WHOLESALER SHOP - PRODUCTION DATABASE RESET  #');
    console.log('######################################################');

    try {
        // 1. Reset Local backend/wholesale.db
        const localDbPath = path.join(__dirname, '../backend/wholesale.db');
        await resetSqliteDatabase(localDbPath);

        // 2. Reset AppData wholesale.db if present
        const appData = process.env.APPDATA || '';
        if (appData) {
            const appDataDbPath = path.join(appData, 'HilalWholesalerShop', 'wholesale.db');
            await resetSqliteDatabase(appDataDbPath);
        }

        // 3. Reset Supabase Cloud Database
        await resetSupabase();

        console.log('\n######################################################');
        console.log('# ✓ PRODUCTION DATABASE RESET COMPLETED SUCCESSFULLY #');
        console.log('######################################################\n');
    } catch (err) {
        console.error('\n✗ FATAL ERROR DURING DATABASE RESET:', err);
        process.exit(1);
    }
}

main();
