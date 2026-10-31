const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const userDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
const appDataDir = path.join(userDataPath, 'RestaurantManagementSystem');
const dbPath = path.join(appDataDir, 'restaurant.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  db.all('SELECT * FROM customers', [], (err, customers) => {
    console.log('customers:', customers);
    
    db.all('SELECT * FROM orders', [], (err, orders) => {
      console.log('orders:', orders);
      
      db.all('SELECT * FROM customer_ledger', [], (err, ledger) => {
        console.log('customer_ledger:', ledger);
        db.close();
        process.exit(0);
      });
    });
  });
});
