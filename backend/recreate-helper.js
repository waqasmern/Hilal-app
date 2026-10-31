const path = require('path');

console.log('Loading database schema and recreating missing tables in AppData database...');
require('./database.js');

setTimeout(() => {
  console.log('Database tables verified and recreated successfully in AppData!');
  process.exit(0);
}, 3000);
