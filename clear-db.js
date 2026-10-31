const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Locate both the project folder database and the active User AppData folder database used by Electron
const dbPaths = [
  path.join(__dirname, 'backend', 'restaurant.db'),
  path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'RestaurantManagementSystem', 'restaurant.db')
];

console.log("=== Testing Database Cleanup Script ===");

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) {
    console.log(`[-] Database not found at: ${dbPath} (Skipping)`);
    return;
  }

  console.log(`[+] Connecting to database at: ${dbPath}...`);
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`[!] Failed to connect to ${dbPath}:`, err.message);
      return;
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      console.log(`[~] Clearing order_items table...`);
      db.run("DELETE FROM order_items");
      
      console.log(`[~] Clearing orders table...`);
      db.run("DELETE FROM orders");
      
      console.log(`[~] Clearing customer_ledger table...`);
      db.run("DELETE FROM customer_ledger");
      
      console.log(`[~] Clearing customers table...`);
      db.run("DELETE FROM customers");

      console.log(`[~] Clearing supplier_ledger table...`);
      db.run("DELETE FROM supplier_ledger");

      console.log(`[~] Clearing inventory_items table...`);
      db.run("DELETE FROM inventory_items");

      console.log(`[~] Clearing inventory_bills table...`);
      db.run("DELETE FROM inventory_bills");

      console.log(`[~] Clearing suppliers table...`);
      db.run("DELETE FROM suppliers");

      console.log(`[~] Clearing attendance table...`);
      db.run("DELETE FROM attendance");

      console.log(`[~] Clearing staff_salaries table...`);
      db.run("DELETE FROM staff_salaries");

      console.log(`[~] Clearing staff_ledger table...`);
      db.run("DELETE FROM staff_ledger");

      console.log(`[~] Clearing expenses table...`);
      db.run("DELETE FROM expenses");

      console.log(`[~] Clearing restaurant_assets table...`);
      db.run("DELETE FROM restaurant_assets");

      console.log(`[~] Clearing expense_suppliers table...`);
      db.run("DELETE FROM expense_suppliers");

      console.log(`[~] Clearing expense_bills table...`);
      db.run("DELETE FROM expense_bills");

      console.log(`[~] Clearing expense_ledger table...`);
      db.run("DELETE FROM expense_ledger");

      console.log(`[~] Resetting staff balances to 0...`);
      db.run("UPDATE users SET balance = 0");
      
      console.log(`[~] Resetting auto-increment id sequences...`);
      db.run("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items', 'customer_ledger', 'customers', 'suppliers', 'supplier_ledger', 'inventory_bills', 'inventory_items', 'attendance', 'staff_salaries', 'staff_ledger', 'expenses', 'restaurant_assets', 'expense_suppliers', 'expense_bills', 'expense_ledger')");
      
      db.run("COMMIT", (err) => {
        if (err) {
          console.error(`[!] Failed to execute transaction for ${dbPath}:`, err.message);
          db.run("ROLLBACK");
          db.close();
          return;
        }
        
        console.log(`[~] Compacting and optimizing database (VACUUM)...`);
        db.run("VACUUM", (err) => {
          if (err) {
            console.error(`[!] Vacuum failed:`, err.message);
          } else {
            console.log(`[+] Database file successfully compacted and optimized.`);
          }
          console.log(`[+] Cleanup complete! Successfully cleared all customer profiles, customer ledger records, orders, order items, suppliers, supplier ledger, inventory bills, and inventory items, attendance logs, staff salaries, staff ledger entries, expense records, and asset entries for: ${dbPath}\n`);
          db.close();
        });
      });
    });
  });
});
