import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;

        let saleQuery = supabase
            .from('sales')
            .select(`
                *,
                customers (
                    id, name, business_name, phone, address, balance
                ),
                users (
                    id, username
                )
            `);

        if (!isNaN(parseInt(id))) {
            saleQuery = saleQuery.or(`id.eq.${parseInt(id)},invoice_no.eq.${id},uuid.eq.${id}`);
        } else {
            saleQuery = saleQuery.or(`invoice_no.eq.${id},uuid.eq.${id}`);
        }

        const { data: sales, error: sErr } = await saleQuery.limit(1);
        if (sErr || !sales || sales.length === 0) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        const sale = sales[0];

        // Fetch sale items
        const { data: saleItems, error: itemsErr } = await supabase
            .from('sale_items')
            .select('*')
            .eq('sale_id', sale.id);

        if (itemsErr) {
            return NextResponse.json({ error: itemsErr.message }, { status: 500 });
        }

        // Fetch product & packaging details for items
        const variantIds = [...new Set((saleItems || []).map(i => i.variant_id))];
        const pkgTypeIds = [...new Set((saleItems || []).map(i => i.packaging_type_id))];

        const [variantsRes, pkgTypesRes, prodsRes, unitsRes, packagingsRes] = await Promise.all([
            variantIds.length > 0 ? supabase.from('product_variants').select('id, product_id, sku, variant_name, base_unit_id').in('id', variantIds) : { data: [] },
            pkgTypeIds.length > 0 ? supabase.from('packaging_types').select('id, name').in('id', pkgTypeIds) : { data: [] },
            supabase.from('products').select('id, name'),
            supabase.from('units').select('id, name, symbol'),
            variantIds.length > 0 ? supabase.from('product_packagings').select('variant_id, packaging_type_id, conversion_factor').in('variant_id', variantIds) : { data: [] }
        ]);

        const varMap = Object.fromEntries((variantsRes.data || []).map(v => [v.id, v]));
        const pkgTypeMap = Object.fromEntries((pkgTypesRes.data || []).map(pt => [pt.id, pt.name]));
        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p.name]));
        const unitMap = Object.fromEntries((unitsRes.data || []).map(u => [u.id, u]));
        const ppMap = Object.fromEntries((packagingsRes.data || []).map(pp => [`${pp.variant_id}_${pp.packaging_type_id}`, Number(pp.conversion_factor) || 1]));

        const items = (saleItems || []).map(item => {
            const variant = varMap[item.variant_id] || {};
            const productName = prodMap[variant.product_id] || 'Product';
            const baseUnit = unitMap[variant.base_unit_id] || { name: 'Piece', symbol: 'pcs' };
            const ppKey = `${item.variant_id}_${item.packaging_type_id}`;
            const convFactor = ppMap[ppKey] || 1;
            const packagingName = pkgTypeMap[item.packaging_type_id] || item.unit_name || (convFactor > 1 ? 'Bulk' : baseUnit.symbol);

            return {
                ...item,
                product_name: productName,
                variant_name: variant.variant_name || '',
                sku: variant.sku || '',
                packaging_name: packagingName,
                conversion_factor: convFactor,
                base_unit: baseUnit.symbol,
                unit_full_name: baseUnit.name
            };
        });

        const fullSale = {
            ...sale,
            customer_name: sale.customers?.name || 'Walk-in Customer',
            business_name: sale.customers?.business_name || '',
            customer_phone: sale.customers?.phone || '',
            customer_address: sale.customers?.address || '',
            current_customer_balance: sale.customers?.balance || 0,
            cashier_name: sale.users?.username || 'Cashier',
            items
        };

        return NextResponse.json(fullSale);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
