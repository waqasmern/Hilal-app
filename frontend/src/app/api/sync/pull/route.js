import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor') || searchParams.get('since');
        const isIncremental = cursor && cursor !== '1970-01-01' && !isNaN(new Date(cursor).getTime());

        const serverTimestamp = new Date().toISOString();

        // 1. Core catalog reference data (categories, units, packagingTypes, products, productVariants, productPackagings, customers)
        // Catalog data is lightweight reference metadata without updated_at columns in cloud DB;
        // always returning the active catalog ensures counter desktops never miss products or price changes.
        const [
            catsRes,
            unitsRes,
            pkgTypesRes,
            prodsRes,
            varsRes,
            pkgsRes,
            custsRes,
            suppsRes
        ] = await Promise.all([
            supabase.from('categories').select('*').order('id', { ascending: true }),
            supabase.from('units').select('*').order('id', { ascending: true }),
            supabase.from('packaging_types').select('*').order('id', { ascending: true }),
            supabase.from('products').select('*').order('id', { ascending: true }),
            supabase.from('product_variants').select('*').order('id', { ascending: true }),
            supabase.from('product_packagings').select('*').order('id', { ascending: true }),
            supabase.from('customers').select('*').order('id', { ascending: true }),
            supabase.from('suppliers').select('*').order('id', { ascending: true })
        ]);

        // 2. Incremental or Full queries for Transactional Streams (movements, ledger, sales, payments, returns)
        let movementsQuery = supabase.from('stock_movements').select('*').order('created_at', { ascending: true });
        let ledgerQuery = supabase.from('customer_ledger').select('*').order('created_at', { ascending: true });
        let salesQuery = supabase.from('sales').select('*').order('created_at', { ascending: true });
        let paymentsQuery = supabase.from('payments').select('*').order('created_at', { ascending: true });
        let returnsQuery = supabase.from('sale_returns').select('*').order('created_at', { ascending: true });

        if (isIncremental) {
            // Incremental: only transactional events after cursor
            movementsQuery = movementsQuery.gt('created_at', cursor);
            ledgerQuery = ledgerQuery.gt('created_at', cursor);
            salesQuery = salesQuery.gt('created_at', cursor);
            paymentsQuery = paymentsQuery.gt('created_at', cursor);
            returnsQuery = returnsQuery.gt('created_at', cursor);
        } else {
            // Initial sync: fetch recent history
            movementsQuery = movementsQuery.limit(2000);
            ledgerQuery = ledgerQuery.limit(2000);
            salesQuery = salesQuery.limit(1000);
            paymentsQuery = paymentsQuery.limit(1000);
            returnsQuery = returnsQuery.limit(500);
        }

        const [
            movementsRes,
            ledgerRes,
            salesRes,
            paymentsRes,
            returnsRes
        ] = await Promise.all([
            movementsQuery,
            ledgerQuery,
            salesQuery,
            paymentsQuery,
            returnsQuery
        ]);

        // Fetch corresponding sale items for downloaded sales
        let saleItems = [];
        const downloadedSales = salesRes.data || [];
        if (downloadedSales.length > 0) {
            const saleIds = downloadedSales.map(s => s.id);
            const { data: itemsData } = await supabase
                .from('sale_items')
                .select('*')
                .in('sale_id', saleIds);
            saleItems = itemsData || [];
        }

        // Fetch corresponding return items for downloaded returns
        let saleReturnItems = [];
        const downloadedReturns = returnsRes.data || [];
        if (downloadedReturns.length > 0) {
            const returnIds = downloadedReturns.map(r => r.id);
            const { data: retItemsData } = await supabase
                .from('sale_return_items')
                .select('*')
                .in('sale_return_id', returnIds);
            saleReturnItems = retItemsData || [];
        }

        // Deduplicate reference dictionaries by LOWER(name) to prevent local SQLite UNIQUE constraint errors
        const dedupeByName = (list = []) => {
            const seen = new Set();
            const result = [];
            for (const item of list) {
                const key = (item.name || '').trim().toLowerCase();
                if (key && !seen.has(key)) {
                    seen.add(key);
                    result.push(item);
                }
            }
            return result;
        };

        const cleanPkgTypes = dedupeByName(pkgTypesRes.data || []);
        const cleanUnits = dedupeByName(unitsRes.data || []);
        const cleanCats = dedupeByName(catsRes.data || []);

        return NextResponse.json({
            success: true,
            cursor: serverTimestamp,
            serverTimestamp,
            isIncremental: Boolean(isIncremental),
            categories: cleanCats,
            units: cleanUnits,
            packagingTypes: cleanPkgTypes,
            products: prodsRes.data || [],
            productVariants: varsRes.data || [],
            productPackagings: pkgsRes.data || [],
            customers: custsRes.data || [],
            suppliers: suppsRes.data || [],
            stockMovements: movementsRes.data || [],
            customerLedger: ledgerRes.data || [],
            sales: downloadedSales,
            saleItems,
            saleReturns: downloadedReturns,
            saleReturnItems,
            payments: paymentsRes.data || []
        });
    } catch (err) {
        console.error('API /api/sync/pull error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
