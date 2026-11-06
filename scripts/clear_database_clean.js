const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'backend', 'wholesale.db');

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    process.exit(1);
}

// 1. Create a timestamped backup before wiping anything
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(__dirname, '..', 'backend', `wholesale.db.backup_before_wipe_${timestamp}`);
fs.copyFileSync(dbPath, backupPath);
console.log(`[BACKUP CREATED] Backup safely saved at:\n${backupPath}\n`);

const db = new sqlite3.Database(dbPath);

const tablesToClear = [
    'sale_items',
    'sales',
    'sale_return_items',
    'sale_returns',
    'purchase_items',
    'purchases',
    'purchase_return_items',
    'purchase_returns',
    'payments',
    'expenses',
    'customer_ledger',
    'customer_prices',
    'customers',
    'supplier_ledger',
    'suppliers',
    'inventory_stock',
    'stock_movements',
    'product_packagings',
    'product_variants',
    'products',
    'categories',
    'brands',
    'cash_registers',
    'devices',
    'sync_queue',
    'audit_logs',
    'whatsapp_reminders'
];

db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    tablesToClear.forEach(table => {
        db.run(`DELETE FROM ${table}`, err => {
            if (err) console.error(`Failed to clear ${table}:`, err.message);
            else console.log(`✓ Cleared table: ${table}`);
        });
    });

    // Reset sqlite_sequence for all cleared tables so auto-increment IDs restart from 1
    tablesToClear.forEach(table => {
        db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table], err => {
            if (err) console.error(`Failed to reset auto-increment for ${table}:`, err.message);
        });
    });

    db.run("COMMIT", err => {
        if (err) {
            console.error('Failed to commit transaction:', err);
            db.close();
            process.exit(1);
        }

        console.log('\n[COMMITTED] All products, customers, sales, purchases, and related data have been cleared.');
        console.log('Preserved essential tables: users (admin/cashier accounts), settings, measurement units, packaging types.');

        db.run("VACUUM", vacErr => {
            if (vacErr) console.error('Vacuum error:', vacErr.message);
            else console.log('✓ Database vacuumed and optimized.');

            // Verify final counts
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], async (err, rows) => {
                console.log('\n--- Current Database Summary ---');
                for (const r of rows) {
                    await new Promise(resolve => {
                        db.get(`SELECT count(*) as count FROM ${r.name}`, (e, c) => {
                            console.log(`${r.name}: ${c ? c.count : 0}`);
                            resolve();
                        });
                    });
                }
                db.close();
                console.log('\n[DONE] Database is clean and ready for fresh production use.');
            });
        });
    });
});

