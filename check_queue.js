const path = require('path');
const os = require('os');
const sqlite3 = require('./backend/node_modules/sqlite3').verbose();

const appDataDbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'HilalWholesalerShop', 'wholesale.db');
const db = new sqlite3.Database(appDataDbPath);

db.all(
  "SELECT id, uuid, operation_type, entity_id, status, error_message, created_at FROM sync_queue WHERE entity_name = 'sales' AND entity_id IN (28,29,30,31,32,33,58,59,60,61,62)",
  (err, rows) => {
    if (err) console.error(err);
    console.log('Sync queue for today sales:');
    console.table(rows || []);
    db.close();
  }
);

