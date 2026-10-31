const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const userDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
const appDataDir = path.join(userDataPath, 'HilalWholesalerShop');
const dbPath = path.join(appDataDir, 'wholesale.db');

console.log('Connecting to database at:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to open database:', err.message);
        process.exit(1);
    }
});

db.serialize(() => {
    db.run("PRAGMA foreign_keys = OFF");

    const tablesToClear = [
        'sales',
        'sale_items',
        'sale_returns',
        'sale_return_items',
        'purchases',
        'purchase_items',
        'purchase_returns',
        'purchase_return_items',
        'payments',
        'expenses',
        'cash_registers',
        'customer_ledger',
        'supplier_ledger',
        'stock_movements',
        'inventory_stock',
        'product_packagings',
        'product_variants',
        'products',
        'customer_prices',
        'audit_logs',
        'sync_queue'
    ];

    tablesToClear.forEach((tbl) => {
        db.run(`DELETE FROM ${tbl}`, (err) => {
            if (err) console.error(`Error clearing ${tbl}:`, err.message);
            else console.log(`✓ Cleared table: ${tbl}`);
        });
    });

    // Reset customer and supplier balances to 0
    db.run("UPDATE customers SET opening_balance = 0, balance = 0", (err) => {
        if (!err) console.log("✓ Reset all customer balances to 0");
    });
    db.run("UPDATE suppliers SET opening_balance = 0, balance = 0", (err) => {
        if (!err) console.log("✓ Reset all supplier balances to 0");
    });

    // Reset autoincrement sequences
    db.run("DELETE FROM sqlite_sequence WHERE name IN (" + tablesToClear.map(t => `'${t}'`).join(',') + ")", (err) => {
        if (!err) console.log("✓ Reset autoincrement sequences");
    });

    db.run("PRAGMA foreign_keys = ON");
    db.run("VACUUM", (err) => {
        if (err) console.error("VACUUM error:", err.message);
        else console.log("✓ Database vacuumed and optimized successfully.");
        console.log("\nDATABASE RESET COMPLETE: Clean slate ready for production use.");
        db.close();
    });
});
