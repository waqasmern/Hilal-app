import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor') || searchParams.get('since');
        const isIncremental = cursor && cursor !== '1970-01-01' && !isNaN(new Date(cursor).getTime());

        const serverTimestamp = new Date().toISOString();

        // 1. Core catalog dictionaries (always return active sets to ensure reference integrity)
        const [catsRes, unitsRes, pkgTypesRes] = await Promise.all([
            supabase.from('categories').select('*'),
            supabase.from('units').select('*'),
            supabase.from('packaging_types').select('*')
        ]);

        // 2. Incremental or Full queries for Products & Packagings
        let prodsQuery = supabase.from('products').select('*');
        let varsQuery = supabase.from('product_variants').select('*');
        let pkgsQuery = supabase.from('product_packagings').select('*');
        let custsQuery = supabase.from('customers').select('*');
        let movementsQuery = supabase.from('stock_movements').select('*').order('created_at', { ascending: true });
        let ledgerQuery = supabase.from('customer_ledger').select('*').order('created_at', { ascending: true });
        let salesQuery = supabase.from('sales').select('*').order('created_at', { ascending: true });
        let paymentsQuery = supabase.from('payments').select('*').order('created_at', { ascending: true });

        if (isIncremental) {
            // Incremental: only changes after cursor
            prodsQuery = prodsQuery.gt('created_at', cursor);
            varsQuery = varsQuery.gt('created_at', cursor);
            pkgsQuery = pkgsQuery.gt('created_at', cursor);
            custsQuery = custsQuery.gt('created_at', cursor);
            movementsQuery = movementsQuery.gt('created_at', cursor);
            ledgerQuery = ledgerQuery.gt('created_at', cursor);
            salesQuery = salesQuery.gt('created_at', cursor);
            paymentsQuery = paymentsQuery.gt('created_at', cursor);
        } else {
            // Initial sync: fetch all active products, customers, and recent history
            movementsQuery = movementsQuery.limit(2000);
            ledgerQuery = ledgerQuery.limit(2000);
            salesQuery = salesQuery.limit(1000);
            paymentsQuery = paymentsQuery.limit(1000);
        }

        const [
            prodsRes,
            varsRes,
            pkgsRes,
            custsRes,
            movementsRes,
            ledgerRes,
            salesRes,
            paymentsRes
        ] = await Promise.all([
            prodsQuery,
            varsQuery,
            pkgsQuery,
            custsQuery,
            movementsQuery,
            ledgerQuery,
            salesQuery,
            paymentsQuery
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

        return NextResponse.json({
            success: true,
            cursor: serverTimestamp,
            serverTimestamp,
            isIncremental: Boolean(isIncremental),
            categories: catsRes.data || [],
            units: unitsRes.data || [],
            packagingTypes: pkgTypesRes.data || [],
            products: prodsRes.data || [],
            productVariants: varsRes.data || [],
            productPackagings: pkgsRes.data || [],
            customers: custsRes.data || [],
            stockMovements: movementsRes.data || [],
            customerLedger: ledgerRes.data || [],
            sales: downloadedSales,
            saleItems,
            payments: paymentsRes.data || []
        });
    } catch (err) {
        console.error('API /api/sync/pull error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
