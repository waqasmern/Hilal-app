const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
}

// Store database in local folder or appData
let dbPath;
if (process.env.ELECTRON_RUN_AS_NODE || process.env.NODE_ENV === 'development') {
    dbPath = path.join(__dirname, 'wholesale.db');
} else {
    const userDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
    const appDataDir = path.join(userDataPath, 'HilalWholesalerShop');
    if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
    }
    dbPath = path.join(appDataDir, 'wholesale.db');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening wholesale SQLite database:', err.message);
    } else {
        console.log('Connected to Wholesale SQLite database at:', dbPath);
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // High-performance SQLite configuration for wholesale POS and concurrency
        db.run(`PRAGMA journal_mode = WAL`);
        db.run(`PRAGMA synchronous = NORMAL`);
        db.run(`PRAGMA busy_timeout = 5000`);
        db.run(`PRAGMA cache_size = -64000`); // 64MB RAM page cache
        db.run(`PRAGMA temp_store = MEMORY`);
        db.run(`PRAGMA foreign_keys = ON`);

        // 1. Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cashier',
            full_name TEXT,
            phone TEXT,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 2. Categories Table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL UNIQUE,
            is_pinned INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 3. Brands Table
        db.run(`CREATE TABLE IF NOT EXISTS brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 4. Measurement Units Table
        db.run(`CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL UNIQUE,
            symbol TEXT,
            description TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 5. Dynamic Packaging Types Table
        db.run(`CREATE TABLE IF NOT EXISTS packaging_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 6. Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            category_id INTEGER NOT NULL,
            brand_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            is_essential INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (category_id) REFERENCES categories(id),
            FOREIGN KEY (brand_id) REFERENCES brands(id)
        )`);

        // 7. Product Variants / SKUs Table
        db.run(`CREATE TABLE IF NOT EXISTS product_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            product_id INTEGER NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            barcode TEXT,
            variant_name TEXT NOT NULL,
            base_unit_id INTEGER NOT NULL,
            minimum_stock REAL DEFAULT 10,
            reorder_level REAL DEFAULT 15,
            is_loose_allowed INTEGER DEFAULT 0,
            current_stock REAL DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (base_unit_id) REFERENCES units(id)
        )`);

        // 8. Product Packagings Table (Dynamic Packaging Rules per SKU)
        db.run(`CREATE TABLE IF NOT EXISTS product_packagings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            conversion_factor REAL NOT NULL DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            purchase_price REAL NOT NULL DEFAULT 0,
            selling_price REAL NOT NULL DEFAULT 0,
            barcode TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
            FOREIGN KEY (packaging_type_id) REFERENCES packaging_types(id)
        )`);

        // 9. Inventory Stock Table
        db.run(`CREATE TABLE IF NOT EXISTS inventory_stock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            variant_id INTEGER NOT NULL UNIQUE,
            quantity REAL DEFAULT 0,
            loose_quantity REAL DEFAULT 0,
            updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (variant_id) REFERENCES product_variants(id)
        )`);

        // 10. Stock Movements Table
        db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            equivalent_qty REAL NOT NULL,
            reference_id TEXT,
            reference_type TEXT,
            notes TEXT,
            user_id INTEGER,
            device_id TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (variant_id) REFERENCES product_variants(id),
            FOREIGN KEY (packaging_type_id) REFERENCES packaging_types(id)
        )`);

        // 11. Customers Table
        db.run(`CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            business_name TEXT,
            phone TEXT,
            mobile TEXT,
            address TEXT,
            cnic_ntn TEXT,
            credit_limit REAL DEFAULT 0,
            opening_balance REAL DEFAULT 0,
            balance REAL DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 12. Customer Specific Pricing Table
        db.run(`CREATE TABLE IF NOT EXISTS customer_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            customer_id INTEGER NOT NULL,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            special_price REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            FOREIGN KEY (variant_id) REFERENCES product_variants(id),
            FOREIGN KEY (packaging_type_id) REFERENCES packaging_types(id)
        )`);

        // 13. Customer Ledger Table
        db.run(`CREATE TABLE IF NOT EXISTS customer_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            customer_id INTEGER NOT NULL,
            sale_id INTEGER,
            payment_id INTEGER,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            payment_method TEXT DEFAULT 'cash',
            payment_date TEXT DEFAULT (date('now', 'localtime')),
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )`);

        // 14. Suppliers Table
        db.run(`CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            company_name TEXT,
            phone TEXT,
            address TEXT,
            opening_balance REAL DEFAULT 0,
            balance REAL DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 15. Supplier Ledger Table
        db.run(`CREATE TABLE IF NOT EXISTS supplier_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            supplier_id INTEGER NOT NULL,
            purchase_id INTEGER,
            payment_id INTEGER,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            payment_date TEXT DEFAULT (date('now', 'localtime')),
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`);

        // 16. Sales Table
        db.run(`CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            invoice_no TEXT NOT NULL UNIQUE,
            customer_id INTEGER,
            supplier_id INTEGER,
            user_id INTEGER,
            device_id TEXT,
            gross_amount REAL NOT NULL DEFAULT 0,
            discount REAL DEFAULT 0,
            special_discount REAL DEFAULT 0,
            additional_charges REAL DEFAULT 0,
            net_amount REAL NOT NULL DEFAULT 0,
            amount_paid REAL DEFAULT 0,
            initial_amount_paid REAL DEFAULT 0,
            remaining_balance REAL DEFAULT 0,
            status TEXT DEFAULT 'completed',
            payment_status TEXT DEFAULT 'unpaid',
            payment_method TEXT DEFAULT 'cash',
            remarks TEXT,
            is_synced INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // 17. Sale Items Table
        db.run(`CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            sale_id INTEGER NOT NULL,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            unit_name TEXT,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            discount REAL DEFAULT 0,
            total REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY (variant_id) REFERENCES product_variants(id),
            FOREIGN KEY (packaging_type_id) REFERENCES packaging_types(id)
        )`);

        // 18. Sale Returns Table
        db.run(`CREATE TABLE IF NOT EXISTS sale_returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            sale_id INTEGER,
            customer_id INTEGER,
            user_id INTEGER,
            total_refund REAL NOT NULL,
            return_type TEXT DEFAULT 'saleable',
            refund_method TEXT DEFAULT 'credit',
            status TEXT DEFAULT 'completed',
            remarks TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )`);

        // 19. Sale Return Items Table
        db.run(`CREATE TABLE IF NOT EXISTS sale_return_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            sale_return_id INTEGER NOT NULL,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            refund_price REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
        )`);

        // 20. Purchases Table
        db.run(`CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            supplier_invoice_no TEXT,
            supplier_id INTEGER NOT NULL,
            user_id INTEGER,
            device_id TEXT,
            gross_amount REAL NOT NULL DEFAULT 0,
            discount REAL DEFAULT 0,
            additional_charges REAL DEFAULT 0,
            net_amount REAL NOT NULL DEFAULT 0,
            amount_paid REAL DEFAULT 0,
            remaining_balance REAL DEFAULT 0,
            status TEXT DEFAULT 'completed',
            payment_method TEXT DEFAULT 'cash',
            invoice_date TEXT DEFAULT (date('now', 'localtime')),
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`);

        // 21. Purchase Items Table
        db.run(`CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            purchase_id INTEGER NOT NULL,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            purchase_price REAL NOT NULL,
            total REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
        )`);

        // 22. Purchase Returns Table
        db.run(`CREATE TABLE IF NOT EXISTS purchase_returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            purchase_id INTEGER,
            supplier_id INTEGER NOT NULL,
            user_id INTEGER,
            total_amount REAL NOT NULL,
            refund_method TEXT DEFAULT 'credit',
            remarks TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`);

        // 23. Purchase Return Items Table
        db.run(`CREATE TABLE IF NOT EXISTS purchase_return_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            purchase_return_id INTEGER NOT NULL,
            variant_id INTEGER NOT NULL,
            packaging_type_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            return_price REAL NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
        )`);

        // 24. Universal Payments Table
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            party_type TEXT NOT NULL,
            party_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash',
            reference_no TEXT,
            user_id INTEGER,
            device_id TEXT,
            payment_date TEXT DEFAULT (date('now', 'localtime')),
            notes TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 25. Expenses Table
        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL DEFAULT 'Other',
            amount REAL NOT NULL,
            description TEXT NOT NULL,
            payment_method TEXT DEFAULT 'cash',
            expense_date TEXT DEFAULT (date('now', 'localtime')),
            user_id INTEGER,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 26. Cash Register Shifts Table
        db.run(`CREATE TABLE IF NOT EXISTS cash_registers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            device_id TEXT,
            opening_cash REAL DEFAULT 0,
            cash_sales REAL DEFAULT 0,
            customer_payments REAL DEFAULT 0,
            cash_refunds REAL DEFAULT 0,
            expenses REAL DEFAULT 0,
            cash_withdrawals REAL DEFAULT 0,
            closing_cash REAL DEFAULT 0,
            expected_cash REAL DEFAULT 0,
            actual_cash REAL DEFAULT 0,
            difference REAL DEFAULT 0,
            status TEXT DEFAULT 'open',
            opened_at DATETIME DEFAULT (datetime('now', 'localtime')),
            closed_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // 27. Devices Table
        db.run(`CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            device_name TEXT,
            is_registered INTEGER DEFAULT 1,
            last_sync_at DATETIME
        )`);

        // 28. Outbox Transaction Sync Queue Table
        db.run(`CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            operation_type TEXT NOT NULL,
            entity_name TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            device_id TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 29. Audit Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            entity_name TEXT,
            entity_id TEXT,
            details TEXT,
            device_id TEXT,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )`);

        // 30. Settings Table
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`);

        // 31. WhatsApp Reminders Log Table
        db.run(`CREATE TABLE IF NOT EXISTS whatsapp_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            phone TEXT,
            amount REAL,
            message TEXT,
            has_pdf INTEGER DEFAULT 0,
            status TEXT DEFAULT 'sent',
            sent_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )`);

        // Indexes for high-speed POS scanning, inventory valuation, ledgers & reporting
        db.run(`CREATE INDEX IF NOT EXISTS idx_variant_sku ON product_variants(sku)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_variant_barcode ON product_variants(barcode)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_variant_prod_id ON product_variants(product_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_packagings_barcode ON product_packagings(barcode)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_packagings_variant ON product_packagings(variant_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_packagings_var_type ON product_packagings(variant_id, packaging_type_id)`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_inv ON sales(invoice_no)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_cust ON sales(customer_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_supp ON sales(supplier_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sales_cust_rem ON sales(customer_id, remaining_balance)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id)`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_supp ON purchases(supplier_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_supp_rem ON purchases(supplier_id, remaining_balance)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_purchase_items_pur ON purchase_items(purchase_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_purchase_items_var ON purchase_items(variant_id)`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_cust_ledger ON customer_ledger(customer_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cust_ledger_date ON customer_ledger(payment_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cust_ledger_sale ON customer_ledger(sale_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_supp_ledger ON supplier_ledger(supplier_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_supp_ledger_date ON supplier_ledger(payment_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_supp_ledger_pur ON supplier_ledger(purchase_id)`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_type, party_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_var ON stock_movements(variant_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cust_prices_cust_var ON customer_prices(customer_id, variant_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status)`);

        // Migration columns if existing db
        db.run("ALTER TABLE sales ADD COLUMN supplier_id INTEGER", () => {});
        db.run("ALTER TABLE sales ADD COLUMN initial_amount_paid REAL DEFAULT 0", () => {});
        db.run("ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id)", () => {});
        db.run(`CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id)`);
        db.run("ALTER TABLE products ADD COLUMN is_essential INTEGER DEFAULT 0", () => {});
        db.run(`CREATE INDEX IF NOT EXISTS idx_products_essential ON products(is_essential)`);
        db.run("ALTER TABLE sale_returns ADD COLUMN refund_method TEXT DEFAULT 'credit'", () => {});
        db.run("ALTER TABLE sale_returns ADD COLUMN status TEXT DEFAULT 'completed'", () => {});
        db.run("ALTER TABLE purchase_returns ADD COLUMN refund_method TEXT DEFAULT 'credit'", () => {});
        db.run("ALTER TABLE customer_ledger ADD COLUMN return_id INTEGER", () => {});

        console.log('Wholesale database schema created successfully.');

        // Seed Default Users & Initial Data
        seedInitialData();
    });
}

function seedInitialData() {
    // 1. Seed Users
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO users (uuid, username, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?, ?)");
            stmt.run(generateUUID(), 'admin', 'admin123', 'admin', 'System Admin', '03000000000');
            stmt.run(generateUUID(), 'cashier', 'cashier123', 'cashier', 'Main Cashier', '03001112223');
            stmt.finalize();
            console.log('Seeded default Admin and Cashier users.');
        }
    });

    // 2. Seed Measurement Units
    db.get("SELECT COUNT(*) as count FROM units", (err, row) => {
        if (row && row.count === 0) {
            const units = [
                { name: 'PCS', symbol: 'pcs', desc: 'Pieces / Single item' },
                { name: 'KG', symbol: 'kg', desc: 'Kilograms' },
                { name: 'GRAM', symbol: 'g', desc: 'Grams' },
                { name: 'LITER', symbol: 'L', desc: 'Liters' },
                { name: 'ML', symbol: 'ml', desc: 'Milliliters' },
                { name: 'DOZEN', symbol: 'doz', desc: 'Dozen (12 items)' }
            ];
            const stmt = db.prepare("INSERT INTO units (uuid, name, symbol, description) VALUES (?, ?, ?, ?)");
            units.forEach(u => stmt.run(generateUUID(), u.name, u.symbol, u.desc));
            stmt.finalize();
            console.log('Seeded standard measurement units.');
        }
    });

    // 3. Seed Dynamic Packaging Types
    const standardPackagings = [
        'Piece', 'Carton', 'Bag', 'Box', 'Packet', 'Bottle', 'Gallon', 'Tin', 'Can', 
        'Pouch', 'Jar', 'Tray', 'Sack', 'Bucket', 'Drum', 'Roll', 'Dozen'
    ];
    standardPackagings.forEach(p => {
        db.get("SELECT id FROM packaging_types WHERE name = ?", [p], (err, row) => {
            if (!row) {
                db.run("INSERT INTO packaging_types (uuid, name, description) VALUES (?, ?, ?)", [generateUUID(), p, `${p} packaging type`]);
            }
        });
    });

    // 4. Seed Initial Categories
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (row && row.count === 0) {
            const categories = [
                'Aata / Flour', 'Sugar', 'Rice', 'Daal / Pulses', 'Cooking Oil', 'Ghee', 
                'Tea', 'Spices', 'Biscuits', 'Beverages', 'Sauces', 'Canned Foods', 
                'Dry Fruits', 'Bakery', 'Cleaning Products', 'Personal Care', 'Other'
            ];
            const stmt = db.prepare("INSERT INTO categories (uuid, name, is_pinned) VALUES (?, ?, ?)");
            categories.forEach((c, idx) => stmt.run(generateUUID(), c, idx < 6 ? 1 : 0));
            stmt.finalize();
            console.log('Seeded wholesale categories.');
        }
    });

    // 5. Seed Settings
    db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
            stmt.run('shop_name', 'Hilal Wholesaler Shop');
            stmt.run('shop_address', 'Main Bazaar, Timergara, KP, Pakistan');
            stmt.run('shop_phone', '+92 300 1234567');
            stmt.run('shop_email', 'hilalwholesaler@gmail.com');
            stmt.run('shop_ntn', '1234567-8');
            stmt.run('currency_symbol', 'Rs.');
            stmt.run('bank_accounts', JSON.stringify([
                {
                    bank_name: 'Meezan Bank',
                    account_title: 'Hilal Wholesaler Shop',
                    account_number: '0101-0102030405',
                    iban: 'PK12MEZN0001010102030405',
                    branch: 'Timergara Branch'
                }
            ]));
            stmt.run('device_id', 'DEVICE-CASHIER-01');
            stmt.run('online_sync_enabled', 'false');
            stmt.run('server_url', 'http://localhost:5000');
            stmt.finalize();
            console.log('Seeded default shop settings.');
        }
    });

    // 6. Seed Sample Wholesaler Customers (if 0)
    db.get("SELECT COUNT(*) as count FROM customers", (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO customers (uuid, name, business_name, phone, mobile, address, credit_limit, opening_balance, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run(generateUUID(), 'Hilal Foods Timergara', 'Hilal Traders', '0945123456', '03009876543', 'Main Market, Timergara', 500000, 0, 0);
            stmt.run(generateUUID(), 'Khan Cash & Carry', 'Khan Enterprise', '0945765432', '03123456789', 'Gimer, Dir Lower', 300000, 0, 0);
            stmt.finalize();
            console.log('Seeded initial wholesale customers.');
        }
    });

    // 7. Automatic sample products & suppliers seeding removed so user maintains a completely clean catalog and supplier directory.

    // 8. Enforce Local Machine Timezone (Pakistan Local Time) on Ledgers & Returns
    db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_customer_ledger_fix_utc
        AFTER INSERT ON customer_ledger
        FOR EACH ROW
        WHEN NEW.payment_date = CURRENT_DATE 
          OR NEW.payment_date IS NULL 
          OR NEW.created_at = CURRENT_TIMESTAMP
          OR NEW.created_at IS NULL
        BEGIN
            UPDATE customer_ledger
            SET payment_date = date('now', 'localtime'),
                created_at = datetime('now', 'localtime'),
                payment_method = CASE WHEN NEW.type = 'return' THEN 'credit_note' ELSE NEW.payment_method END
            WHERE id = NEW.id;
        END;
    `);

    db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_sale_returns_fix_utc
        AFTER INSERT ON sale_returns
        FOR EACH ROW
        WHEN NEW.created_at = CURRENT_TIMESTAMP OR NEW.created_at IS NULL
        BEGIN
            UPDATE sale_returns
            SET created_at = datetime('now', 'localtime')
            WHERE id = NEW.id;
        END;
    `);

    db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_supplier_ledger_fix_utc
        AFTER INSERT ON supplier_ledger
        FOR EACH ROW
        WHEN NEW.payment_date = CURRENT_DATE 
          OR NEW.payment_date IS NULL 
          OR NEW.created_at = CURRENT_TIMESTAMP
          OR NEW.created_at IS NULL
        BEGIN
            UPDATE supplier_ledger
            SET payment_date = date('now', 'localtime'),
                created_at = datetime('now', 'localtime')
            WHERE id = NEW.id;
        END;
    `);

    db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_purchase_returns_fix_utc
        AFTER INSERT ON purchase_returns
        FOR EACH ROW
        WHEN NEW.created_at = CURRENT_TIMESTAMP OR NEW.created_at IS NULL
        BEGIN
            UPDATE purchase_returns
            SET created_at = datetime('now', 'localtime')
            WHERE id = NEW.id;
        END;
    `);
}

module.exports = db;

