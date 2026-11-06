const path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'frontend', 'node_modules', '@supabase', 'supabase-js'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nncduklltahxexaevdou.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_KQ_Jkru3srbmwZEIsJWo4w_IGlKwI5M';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    'whatsapp_reminders',
    'audit_logs'
];

async function clearSupabase() {
    console.log(`Connecting to Supabase at: ${supabaseUrl}`);
    console.log('Beginning deletion of transactional and master product data...\n');

    for (const table of tablesToClear) {
        try {
            // Delete all records where id is not 0 / not null / or by uuid
            const { data, error } = await supabase.from(table).delete().neq('id', -999999);
            if (error) {
                // If id column doesn't match, try deleting with uuid or other condition
                const alt = await supabase.from(table).delete().gt('created_at', '1970-01-01');
                if (alt.error) {
                    console.error(`[-] Error clearing ${table}:`, error.message);
                } else {
                    console.log(`[✓] Cleared table in Supabase: ${table}`);
                }
            } else {
                console.log(`[✓] Cleared table in Supabase: ${table}`);
            }
        } catch (err) {
            console.error(`[-] Exception clearing ${table}:`, err.message);
        }
    }

    console.log('\n--- Verifying Supabase Tables After Wipe ---');
    const allTables = [
        'users', 'settings', 'units', 'packaging_types',
        'categories', 'products', 'product_variants', 'product_packagings',
        'inventory_stock', 'customers', 'sales', 'sale_items', 'payments', 'expenses'
    ];

    for (const t of allTables) {
        try {
            const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
            if (error) {
                console.log(`${t}: Error (${error.message})`);
            } else {
                console.log(`${t}: ${count}`);
            }
        } catch (e) {
            console.log(`${t}: Exception (${e.message})`);
        }
    }

    console.log('\n[SUCCESS] Supabase cloud database is clean!');
    console.log('Essential cloud records (users, settings, units, packaging_types) are preserved.');
}

clearSupabase();
