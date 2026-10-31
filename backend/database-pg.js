/**
 * PostgreSQL Database Adapter for Hilal Wholesaler Cloud Server
 * Used when running on centralized server (process.env.DB_TYPE === 'postgres' or process.env.DATABASE_URL)
 */
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hilal_wholesale',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const PG_SCHEMA = `
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'cashier',
    full_name VARCHAR(255),
    phone VARCHAR(50),
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(150) UNIQUE NOT NULL,
    is_pinned INT DEFAULT 0,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Units Table
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(50) UNIQUE NOT NULL,
    symbol VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Packaging Types Table
CREATE TABLE IF NOT EXISTS packaging_types (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Products Table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    category_id INT REFERENCES categories(id),
    brand_id INT REFERENCES brands(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_essential INT DEFAULT 0,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Product Variants / SKUs Table
CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    product_id INT REFERENCES products(id),
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    variant_name VARCHAR(150) NOT NULL,
    base_unit_id INT REFERENCES units(id),
    minimum_stock NUMERIC DEFAULT 10,
    reorder_level NUMERIC DEFAULT 15,
    is_loose_allowed INT DEFAULT 0,
    current_stock NUMERIC DEFAULT 0,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Product Packagings Table
CREATE TABLE IF NOT EXISTS product_packagings (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    variant_id INT REFERENCES product_variants(id) ON DELETE CASCADE,
    packaging_type_id INT REFERENCES packaging_types(id),
    conversion_factor NUMERIC DEFAULT 1,
    is_default INT DEFAULT 0,
    purchase_price NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    barcode VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Inventory Stock Table
CREATE TABLE IF NOT EXISTS inventory_stock (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    variant_id INT UNIQUE REFERENCES product_variants(id),
    quantity NUMERIC DEFAULT 0,
    loose_quantity NUMERIC DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    movement_type VARCHAR(50) NOT NULL,
    quantity NUMERIC NOT NULL,
    equivalent_qty NUMERIC NOT NULL,
    reference_id VARCHAR(100),
    reference_type VARCHAR(50),
    notes TEXT,
    user_id INT,
    device_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    address TEXT,
    cnic_ntn VARCHAR(100),
    credit_limit NUMERIC DEFAULT 0,
    opening_balance NUMERIC DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Customer Prices Table
CREATE TABLE IF NOT EXISTS customer_prices (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    special_price NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Customer Ledger Table
CREATE TABLE IF NOT EXISTS customer_ledger (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    customer_id INT REFERENCES customers(id),
    sale_id INT,
    payment_id INT,
    amount NUMERIC NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) DEFAULT 'cash',
    payment_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    opening_balance NUMERIC DEFAULT 0,
    balance NUMERIC DEFAULT 0,
    is_deleted INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Supplier Ledger Table
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    supplier_id INT REFERENCES suppliers(id),
    purchase_id INT,
    payment_id INT,
    amount NUMERIC NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    payment_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Sales Table
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    invoice_no VARCHAR(100) UNIQUE NOT NULL,
    customer_id INT REFERENCES customers(id),
    user_id INT REFERENCES users(id),
    device_id VARCHAR(100),
    gross_amount NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    special_discount NUMERIC DEFAULT 0,
    additional_charges NUMERIC DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    remaining_balance NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    payment_method VARCHAR(50) DEFAULT 'cash',
    remarks TEXT,
    is_synced INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Sale Items Table
CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    unit_name VARCHAR(50),
    quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. Universal Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    party_type VARCHAR(50) NOT NULL,
    party_id INT NOT NULL,
    amount NUMERIC NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference_no VARCHAR(100),
    user_id INT,
    device_id VARCHAR(100),
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'Other',
    amount NUMERIC NOT NULL,
    description TEXT NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    expense_date DATE DEFAULT CURRENT_DATE,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. Cash Register Shifts Table
CREATE TABLE IF NOT EXISTS cash_registers (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    user_id INT REFERENCES users(id),
    device_id VARCHAR(100),
    opening_cash NUMERIC DEFAULT 0,
    cash_sales NUMERIC DEFAULT 0,
    customer_payments NUMERIC DEFAULT 0,
    cash_refunds NUMERIC DEFAULT 0,
    expenses NUMERIC DEFAULT 0,
    cash_withdrawals NUMERIC DEFAULT 0,
    closing_cash NUMERIC DEFAULT 0,
    expected_cash NUMERIC DEFAULT 0,
    actual_cash NUMERIC DEFAULT 0,
    difference NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'open',
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

-- 21. Devices Table
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(150),
    is_registered INT DEFAULT 1,
    last_sync_at TIMESTAMP
);

-- 22. Ingested Transactions Table (Cloud Idempotency Record)
CREATE TABLE IF NOT EXISTS ingested_sync_events (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    payload JSONB,
    has_conflict INT DEFAULT 0,
    conflict_details TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

-- 24. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    user_id INT,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100),
    entity_id VARCHAR(100),
    details TEXT,
    device_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 25. Sale Returns Table
CREATE TABLE IF NOT EXISTS sale_returns (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    sale_id INT REFERENCES sales(id),
    customer_id INT REFERENCES customers(id),
    user_id INT REFERENCES users(id),
    total_refund NUMERIC NOT NULL,
    return_type VARCHAR(50) DEFAULT 'saleable',
    refund_method VARCHAR(50) DEFAULT 'credit',
    status VARCHAR(50) DEFAULT 'completed',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    sale_return_id INT REFERENCES sale_returns(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    quantity NUMERIC NOT NULL,
    refund_price NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 26. Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    supplier_invoice_no VARCHAR(100),
    supplier_id INT REFERENCES suppliers(id),
    user_id INT REFERENCES users(id),
    device_id VARCHAR(100),
    gross_amount NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    additional_charges NUMERIC DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    remaining_balance NUMERIC DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    payment_method VARCHAR(50) DEFAULT 'cash',
    invoice_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    purchase_id INT REFERENCES purchases(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    quantity NUMERIC NOT NULL,
    purchase_price NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 27. Purchase Returns Table
CREATE TABLE IF NOT EXISTS purchase_returns (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    purchase_id INT REFERENCES purchases(id),
    supplier_id INT REFERENCES suppliers(id),
    user_id INT REFERENCES users(id),
    total_amount NUMERIC NOT NULL,
    refund_method VARCHAR(50) DEFAULT 'credit',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(64) UNIQUE NOT NULL,
    purchase_return_id INT REFERENCES purchase_returns(id) ON DELETE CASCADE,
    variant_id INT REFERENCES product_variants(id),
    packaging_type_id INT REFERENCES packaging_types(id),
    quantity NUMERIC NOT NULL,
    return_price NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function initPostgres() {
    try {
        const client = await pool.connect();
        try {
            await client.query(PG_SCHEMA);
            console.log('[PostgreSQL] Cloud schema verified and ready.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.warn('[PostgreSQL] Could not connect to PostgreSQL database (running in local SQLite mode):', err.message);
    }
}

module.exports = {
    pool,
    initPostgres
};
