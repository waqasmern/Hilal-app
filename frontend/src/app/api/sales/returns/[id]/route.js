import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const returnId = parseInt(id);

        let query = supabase.from('sale_returns').select(`
            *,
            customers ( id, name, business_name, phone, mobile, address, balance ),
            sales ( id, invoice_no, created_at, net_amount ),
            users ( id, username )
        `);

        if (!isNaN(returnId)) {
            query = query.or(`id.eq.${returnId},uuid.eq.${id}`);
        } else {
            query = query.eq('uuid', id);
        }

        const { data: returns, error: retErr } = await query.limit(1);
        if (retErr || !returns || returns.length === 0) {
            return NextResponse.json({ error: 'Credit Note / Sales Return not found' }, { status: 404 });
        }

        const ret = returns[0];
        const cn_number = `CN-${String(ret.id).padStart(5, '0')}`;

        // Fetch return items
        const { data: rawItems } = await supabase
            .from('sale_return_items')
            .select('*')
            .eq('sale_return_id', ret.id);

        const vIds = [...new Set((rawItems || []).map(i => i.variant_id))];
        const pkgIds = [...new Set((rawItems || []).map(i => i.packaging_type_id))];

        const [varsRes, pkgsRes, prodsRes, unitsRes, settingsRes] = await Promise.all([
            vIds.length > 0 ? supabase.from('product_variants').select('id, sku, variant_name, product_id, base_unit_id').in('id', vIds) : { data: [] },
            pkgIds.length > 0 ? supabase.from('packaging_types').select('id, name').in('id', pkgIds) : { data: [] },
            supabase.from('products').select('id, name'),
            supabase.from('units').select('id, symbol'),
            supabase.from('settings').select('key, value')
        ]);

        const varMap = Object.fromEntries((varsRes.data || []).map(v => [v.id, v]));
        const pkgMap = Object.fromEntries((pkgsRes.data || []).map(p => [p.id, p.name]));
        const prodMap = Object.fromEntries((prodsRes.data || []).map(p => [p.id, p.name]));
        const unitMap = Object.fromEntries((unitsRes.data || []).map(u => [u.id, u.symbol]));

        const items = (rawItems || []).map(it => {
            const v = varMap[it.variant_id] || {};
            return {
                ...it,
                sku: v.sku || '',
                variant_name: v.variant_name || '',
                product_name: prodMap[v.product_id] || 'Product',
                packaging_name: pkgMap[it.packaging_type_id] || 'Unit',
                base_unit: unitMap[v.base_unit_id] || 'pcs'
            };
        });

        const shopData = {
            shop_name: 'Hilal Wholesaler Shop',
            shop_address: 'Main Market, Timergara, Lower Dir, KP',
            shop_phone: '0945-825555 / 0306-0888300',
            shop_email: 'hilalwholesaler@gmail.com'
        };

        (settingsRes.data || []).forEach(s => {
            if (s.key) shopData[s.key] = s.value;
        });

        return NextResponse.json({
            ...ret,
            cn_number,
            customer_name: ret.customers?.name || 'Customer',
            customer_business: ret.customers?.business_name || '',
            customer_phone: ret.customers?.phone || '',
            customer_mobile: ret.customers?.mobile || '',
            customer_address: ret.customers?.address || 'Timergara',
            current_customer_balance: ret.customers?.balance || 0,
            original_invoice_no: ret.sales?.invoice_no || '',
            original_sale_date: ret.sales?.created_at || '',
            original_sale_net: ret.sales?.net_amount || 0,
            cashier_name: ret.users?.username || 'Cashier',
            items,
            shop: shopData
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
