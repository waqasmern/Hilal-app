const path = require('path');
const fs = require('fs');
const sqlite3 = require(path.join(__dirname, '../backend/node_modules/sqlite3')).verbose();
const { createClient } = require(path.join(__dirname, '../frontend/node_modules/@supabase/supabase-js'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nncduklltahxexaevdou.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KQ_Jkru3srbmwZEIsJWo4w_IGlKwI5M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const appData = process.env.APPDATA || '';
const dbPath = path.join(appData, 'HilalWholesalerShop', 'wholesale.db');

if (!fs.existsSync(dbPath)) {
    console.error('Database not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

function queryAll(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function cleanRow(row, allowedFields) {
    const cleaned = {};
    for (const field of allowedFields) {
        if (row[field] !== undefined) {
            cleaned[field] = row[field];
        }
    }
    return cleaned;
}

async function seedTable(tableName, rows, allowedFields, idField = 'id') {
    if (!rows || rows.length === 0) {
        console.log(`[${tableName}] 0 rows to seed.`);
        return;
    }

    const cleanedRows = rows.map(r => cleanRow(r, allowedFields));
    console.log(`[${tableName}] Seeding ${cleanedRows.length} rows...`);

    // Use upsert to avoid duplicate key errors
    const { data, error } = await supabase.from(tableName).upsert(cleanedRows, { onConflict: idField });
    if (error) {
        console.error(`[${tableName}] Error seeding:`, error.message, error.details || '');
    } else {
        console.log(`[${tableName}] Successfully seeded ${cleanedRows.length} rows.`);
    }
}

async function run() {
    try {
        console.log('--- Starting Supabase Data Seeding from SQLite ---');

        // 1. Units
        const units = await queryAll('SELECT * FROM units');
        await seedTable('units', units, ['id', 'uuid', 'name', 'symbol', 'description', 'created_at']);

        // 2. Packaging Types
        const pkgTypes = await queryAll('SELECT * FROM packaging_types');
        await seedTable('packaging_types', pkgTypes, ['id', 'uuid', 'name', 'description', 'created_at']);

        // 3. Categories
        const categories = await queryAll('SELECT * FROM categories');
        await seedTable('categories', categories, ['id', 'uuid', 'name', 'is_pinned', 'is_deleted', 'created_at']);

        // 4. Brands
        const brands = await queryAll('SELECT * FROM brands');
        await seedTable('brands', brands, ['id', 'uuid', 'name', 'description', 'is_deleted', 'created_at']);

        // 5. Users
        const users = await queryAll('SELECT * FROM users');
        await seedTable('users', users, ['id', 'uuid', 'username', 'password', 'role', 'full_name', 'phone', 'is_deleted', 'created_at']);

        // 6. Products
        const products = await queryAll('SELECT * FROM products');
        await seedTable('products', products, ['id', 'uuid', 'category_id', 'brand_id', 'name', 'description', 'is_essential', 'is_deleted', 'created_at']);

        // 7. Product Variants
        const variants = await queryAll('SELECT * FROM product_variants');
        await seedTable('product_variants', variants, ['id', 'uuid', 'product_id', 'sku', 'barcode', 'variant_name', 'base_unit_id', 'minimum_stock', 'reorder_level', 'is_loose_allowed', 'current_stock', 'is_deleted', 'created_at']);

        // 8. Product Packagings
        const packagings = await queryAll('SELECT * FROM product_packagings');
        await seedTable('product_packagings', packagings, ['id', 'uuid', 'variant_id', 'packaging_type_id', 'conversion_factor', 'is_default', 'purchase_price', 'selling_price', 'barcode', 'created_at']);

        // 9. Inventory Stock
        const stock = await queryAll('SELECT * FROM inventory_stock');
        await seedTable('inventory_stock', stock, ['id', 'uuid', 'variant_id', 'quantity', 'loose_quantity', 'updated_at']);

        // 10. Customers
        const customers = await queryAll('SELECT * FROM customers');
        await seedTable('customers', customers, ['id', 'uuid', 'name', 'business_name', 'phone', 'mobile', 'address', 'cnic_ntn', 'credit_limit', 'opening_balance', 'balance', 'is_deleted', 'created_at']);

        // 11. Customer Prices
        const customerPrices = await queryAll('SELECT * FROM customer_prices');
        await seedTable('customer_prices', customerPrices, ['id', 'uuid', 'customer_id', 'variant_id', 'packaging_type_id', 'special_price', 'created_at']);

        // 12. Sales
        const sales = await queryAll('SELECT * FROM sales');
        await seedTable('sales', sales, ['id', 'uuid', 'invoice_no', 'customer_id', 'user_id', 'device_id', 'gross_amount', 'discount', 'special_discount', 'additional_charges', 'net_amount', 'amount_paid', 'remaining_balance', 'status', 'payment_status', 'payment_method', 'remarks', 'is_synced', 'created_at']);

        // 13. Sale Items
        const saleItems = await queryAll('SELECT * FROM sale_items');
        await seedTable('sale_items', saleItems, ['id', 'uuid', 'sale_id', 'variant_id', 'packaging_type_id', 'unit_name', 'quantity', 'price', 'discount', 'total', 'created_at']);

        // 14. Customer Ledger
        const ledger = await queryAll('SELECT * FROM customer_ledger');
        await seedTable('customer_ledger', ledger, ['id', 'uuid', 'customer_id', 'sale_id', 'payment_id', 'amount', 'type', 'description', 'payment_method', 'payment_date', 'created_at']);

        // 15. Settings
        const settings = await queryAll('SELECT * FROM settings');
        await seedTable('settings', settings, ['key', 'value'], 'key');

        console.log('--- Data Seeding Completed Successfully! ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        db.close();
    }
}

run();
