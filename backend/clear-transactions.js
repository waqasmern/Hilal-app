const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbTargets = [
    {
        name: 'AppData Live Database',
        path: path.join(process.env.APPDATA || '', 'HilalWholesalerShop', 'wholesale.db')
    },
    {
        name: 'Backend Local Database',
        path: path.join(__dirname, 'wholesale.db')
    }
];

const tablesToWipe = [
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
    'whatsapp_reminders'
];

async function clearDatabase(target) {
    return new Promise((resolve, reject) => {
        console.log(`\n======================================================`);
        console.log(`Processing [${target.name}]: ${target.path}`);
        console.log(`======================================================`);

        if (!fs.existsSync(target.path)) {
            console.log(`File does not exist: ${target.path}. Skipping.`);
            return resolve();
        }

        const db = new sqlite3.Database(target.path, (err) => {
            if (err) {
                console.error(`Failed to connect to ${target.name}:`, err.message);
                return reject(err);
            }
        });

        db.serialize(() => {
            db.run("PRAGMA busy_timeout = 10000");
            db.run("PRAGMA foreign_keys = OFF");

            // 1. Clear transaction tables
            tablesToWipe.forEach((tbl) => {
                db.run(`DELETE FROM ${tbl}`, (err) => {
                    if (err) {
                        console.warn(`Warning clearing ${tbl}:`, err.message);
                    } else {
                        console.log(`✓ Cleared table: ${tbl}`);
                    }
                });
            });

            // 2. Clear sync_queue for transaction entities
            db.run(
                `DELETE FROM sync_queue WHERE entity_name IN ('sales', 'purchases', 'payments', 'customer_ledger', 'supplier_ledger', 'expenses', 'stock_movements')`,
                (err) => {
                    if (err) console.warn('Warning clearing sync_queue:', err.message);
                    else console.log('✓ Cleared transactional sync queue records');
                }
            );

            // 3. Reset customer balances to 0
            db.run("UPDATE customers SET opening_balance = 0, balance = 0", (err) => {
                if (err) console.error("Error resetting customers:", err.message);
                else console.log("✓ Reset all customer balances and opening balances to 0");
            });

            // 4. Reset supplier balances to 0
            db.run("UPDATE suppliers SET opening_balance = 0, balance = 0", (err) => {
                if (err) console.error("Error resetting suppliers:", err.message);
                else console.log("✓ Reset all supplier balances and opening balances to 0");
            });

            // 5. Reset inventory stock to 0
            db.run("UPDATE inventory_stock SET quantity = 0, loose_quantity = 0, updated_at = datetime('now', 'localtime')", (err) => {
                if (err) console.error("Error resetting inventory_stock:", err.message);
                else console.log("✓ Reset all inventory_stock quantities to 0");
            });

            // 6. Reset product_variants current_stock to 0
            db.run("UPDATE product_variants SET current_stock = 0", (err) => {
                if (err) console.error("Error resetting product_variants current_stock:", err.message);
                else console.log("✓ Reset all product_variants current_stock to 0");
            });

            // 7. Reset autoincrement sequences
            const seqList = tablesToWipe.map(t => `'${t}'`).join(',');
            db.run(`DELETE FROM sqlite_sequence WHERE name IN (${seqList})`, (err) => {
                if (err) console.warn("Notice sqlite_sequence reset:", err.message);
                else console.log("✓ Reset autoincrement sequences for cleared tables");
            });

            db.run("PRAGMA foreign_keys = ON");
            db.run("PRAGMA wal_checkpoint(TRUNCATE)", (ckptErr) => {
                if (ckptErr) console.warn("WAL checkpoint notice:", ckptErr.message);

                db.run("VACUUM", (vacErr) => {
                    if (vacErr) {
                        console.warn("VACUUM notice:", vacErr.message);
                    } else {
                        console.log("✓ Database defragmented and vacuumed.");
                    }
                    db.close((closeErr) => {
                        if (closeErr) console.error("Error closing DB:", closeErr.message);
                        console.log(`✓ Completed processing for: ${target.name}`);
                        resolve();
                    });
                });
            });
        });
    });
}

async function main() {
    for (const target of dbTargets) {
        try {
            await clearDatabase(target);
        } catch (e) {
            console.error(`Error processing ${target.name}:`, e.message);
        }
    }
    console.log("\n======================================================");
    console.log("ALL REQUESTED DATA SUCCESSFULLY CLEARED!");
    console.log("======================================================");
}

main();

