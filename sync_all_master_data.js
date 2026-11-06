const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('./backend/node_modules/sqlite3').verbose();

const dotenv = fs.readFileSync('./frontend/.env.local', 'utf8');
const lines = dotenv.split('\n').filter(l => l.trim() && !l.startsWith('#'));
const env = {};
lines.forEach(l => {
  const idx = l.indexOf('=');
  if (idx > -1) {
    env[l.substring(0, idx).trim()] = l.substring(idx+1).trim();
  }
});
const { createClient } = require('./frontend/node_modules/@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const appDataDbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'HilalWholesalerShop', 'wholesale.db');
const db = new sqlite3.Database(appDataDbPath);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function toUtcIso(dateStr) {
  if (!dateStr) return new Date().toISOString();
  let s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) {
    return new Date(s.replace(' ', 'T') + '+05:00').toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function syncAll() {
  console.log('--- Step 1: Sync Units ---');
  const units = await query('SELECT * FROM units');
  for (const u of units) {
    const { error } = await supabase.from('units').upsert({
      id: u.id,
      uuid: u.uuid || crypto.randomUUID(),
      name: u.name,
      symbol: u.symbol || u.name.toLowerCase(),
      description: u.description || ''
    }, { onConflict: 'id' });
    if (error) console.error('Unit error:', u.name, error.message);
  }
  console.log(`Units synced: ${units.length}`);

  console.log('--- Step 2: Sync Packaging Types ---');
  const pkgs = await query('SELECT * FROM packaging_types');
  for (const p of pkgs) {
    // Check if name exists in Supabase
    const { data: exist } = await supabase.from('packaging_types').select('id, name').ilike('name', p.name.trim()).maybeSingle();
    if (exist) {
      // update
      await supabase.from('packaging_types').update({ description: p.description || '' }).eq('id', exist.id);
    } else {
      const { error } = await supabase.from('packaging_types').upsert({
        id: p.id,
        uuid: p.uuid || crypto.randomUUID(),
        name: p.name.trim(),
        description: p.description || ''
      }, { onConflict: 'id' });
      if (error) console.error('Pkg type error:', p.name, error.message);
    }
  }
  console.log(`Packaging types processed: ${pkgs.length}`);

  console.log('--- Step 3: Sync Categories ---');
  const categories = await query('SELECT * FROM categories WHERE is_deleted = 0');
  for (const c of categories) {
    const { error } = await supabase.from('categories').upsert({
      id: c.id,
      uuid: c.uuid || crypto.randomUUID(),
      name: c.name,
      is_pinned: c.is_pinned ? 1 : 0,
      is_deleted: 0
    }, { onConflict: 'id' });
    if (error) console.error('Category error:', c.name, error.message);
  }
  console.log(`Categories synced: ${categories.length}`);

  console.log('--- Step 4: Sync Products ---');
  const products = await query('SELECT * FROM products WHERE is_deleted = 0');
  for (const p of products) {
    const { error } = await supabase.from('products').upsert({
      id: p.id,
      uuid: p.uuid || crypto.randomUUID(),
      category_id: p.category_id || 1,
      brand_id: p.brand_id || null,
      name: p.name,
      description: p.description || '',
      is_essential: p.is_essential ? 1 : 0,
      is_deleted: 0
    }, { onConflict: 'id' });
    if (error) console.error('Product error:', p.name, error.message);
  }
  console.log(`Products synced: ${products.length}`);

  console.log('--- Step 5: Sync Product Variants ---');
  const variants = await query('SELECT * FROM product_variants WHERE is_deleted = 0');
  for (const v of variants) {
    const { error } = await supabase.from('product_variants').upsert({
      id: v.id,
      uuid: v.uuid || crypto.randomUUID(),
      product_id: v.product_id,
      sku: v.sku || `SKU-${v.id}`,
      barcode: v.barcode || '',
      variant_name: v.variant_name || 'Standard',
      base_unit_id: v.base_unit_id || 1,
      minimum_stock: v.minimum_stock || 10,
      reorder_level: v.reorder_level || 15,
      is_loose_allowed: v.is_loose_allowed ? 1 : 0,
      current_stock: v.current_stock || 0,
      is_deleted: 0
    }, { onConflict: 'id' });
    if (error) console.error('Variant error:', v.id, error.message);
  }
  console.log(`Variants synced: ${variants.length}`);

  console.log('--- Step 6: Sync Product Packagings ---');
  const packagings = await query('SELECT * FROM product_packagings');
  for (const pkg of packagings) {
    const { error } = await supabase.from('product_packagings').upsert({
      id: pkg.id,
      uuid: pkg.uuid || crypto.randomUUID(),
      variant_id: pkg.variant_id,
      packaging_type_id: pkg.packaging_type_id || 1,
      conversion_factor: pkg.conversion_factor || 1,
      is_default: pkg.is_default ? 1 : 0,
      purchase_price: pkg.purchase_price || 0,
      selling_price: pkg.selling_price || 0,
      barcode: pkg.barcode || ''
    }, { onConflict: 'id' });
    if (error) console.error('Packaging error:', pkg.id, error.message);
  }
  console.log(`Product packagings synced: ${packagings.length}`);

  console.log('--- Step 7: Sync Customers ---');
  const customers = await query('SELECT * FROM customers WHERE is_deleted = 0');
  for (const c of customers) {
    const { error } = await supabase.from('customers').upsert({
      id: c.id,
      uuid: c.uuid || crypto.randomUUID(),
      name: c.name,
      business_name: c.business_name || '',
      phone: c.phone || '',
      mobile: c.mobile || c.phone || '',
      address: c.address || '',
      cnic_ntn: c.cnic_ntn || '',
      credit_limit: c.credit_limit || 0,
      opening_balance: c.opening_balance || 0,
      balance: c.balance || 0,
      is_deleted: 0
    }, { onConflict: 'id' });
    if (error) console.error('Customer error:', c.name, error.message);
  }
  console.log(`Customers synced: ${customers.length}`);

  console.log('--- Step 8: Sync Suppliers ---');
  const suppliers = await query('SELECT * FROM suppliers WHERE is_deleted = 0');
  for (const s of suppliers) {
    const { error } = await supabase.from('suppliers').upsert({
      id: s.id,
      uuid: s.uuid || crypto.randomUUID(),
      name: s.name,
      company_name: s.company_name || '',
      phone: s.phone || '',
      address: s.address || '',
      opening_balance: s.opening_balance || 0,
      balance: s.balance || 0,
      is_deleted: 0
    }, { onConflict: 'id' });
    if (error) console.error('Supplier error:', s.name, error.message);
  }
  console.log(`Suppliers synced: ${suppliers.length}`);

  console.log('--- Step 9: Sync Missing Sales and Sale Items ---');
  // Clean ghost SALE events from ingested_sync_events
  const { data: existingSales } = await supabase.from('sales').select('uuid');
  const existingSaleUuids = new Set((existingSales || []).map(s => s.uuid));
  const { data: ghostEvents } = await supabase.from('ingested_sync_events').select('uuid').eq('operation_type', 'SALE');
  for (const g of (ghostEvents || [])) {
    if (!existingSaleUuids.has(g.uuid)) {
      await supabase.from('ingested_sync_events').delete().eq('uuid', g.uuid);
    }
  }

  // Get all sales from local DB
  const localSales = await query('SELECT * FROM sales');
  console.log(`Total local sales to check: ${localSales.length}`);

  for (const s of localSales) {
    // Check if sale exists by uuid or invoice_no
    const { data: found } = await supabase
      .from('sales')
      .select('id, invoice_no')
      .or(`uuid.eq.${s.uuid},invoice_no.eq.${s.invoice_no}`)
      .maybeSingle();

    let targetSaleId;
    if (found) {
      targetSaleId = found.id;
      // Update customer_id, invoice_no, amounts if needed
      await supabase.from('sales').update({
        invoice_no: s.invoice_no,
        customer_id: s.customer_id,
        gross_amount: s.gross_amount,
        discount: s.discount,
        special_discount: s.special_discount,
        net_amount: s.net_amount,
        amount_paid: s.amount_paid,
        remaining_balance: s.remaining_balance,
        payment_method: s.payment_method,
        status: s.status,
        created_at: toUtcIso(s.created_at)
      }).eq('id', found.id);
    } else {
      // Find a safe ID
      const { data: highest } = await supabase.from('sales').select('id').order('id', { ascending: false }).limit(1);
      targetSaleId = (highest?.[0]?.id || 0) + 1;

      const { data: inserted, error: sErr } = await supabase.from('sales').insert([{
        id: targetSaleId,
        uuid: s.uuid || crypto.randomUUID(),
        invoice_no: s.invoice_no,
        customer_id: s.customer_id,
        user_id: 1,
        device_id: 'DEVICE-CASHIER-01',
        gross_amount: s.gross_amount,
        discount: s.discount,
        special_discount: s.special_discount,
        additional_charges: s.additional_charges || 0,
        net_amount: s.net_amount,
        amount_paid: s.amount_paid,
        remaining_balance: s.remaining_balance,
        status: s.status,
        payment_status: s.payment_status || (s.remaining_balance > 0 ? (s.amount_paid > 0 ? 'partial' : 'unpaid') : 'paid'),
        payment_method: s.payment_method || 'cash',
        remarks: s.remarks || '',
        is_synced: 1,
        created_at: toUtcIso(s.created_at)
      }]).select().single();

      if (sErr) {
        console.error('Failed to insert sale:', s.invoice_no, sErr.message);
        continue;
      }
    }

    // Now sync sale_items for this sale
    const localItems = await query('SELECT * FROM sale_items WHERE sale_id = ?', [s.id]);
    for (const item of localItems) {
      const { data: existItem } = await supabase
        .from('sale_items')
        .select('id')
        .or(`uuid.eq.${item.uuid}`)
        .maybeSingle();

      if (!existItem) {
        const { data: hItem } = await supabase.from('sale_items').select('id').order('id', { ascending: false }).limit(1);
        const nextItemId = (hItem?.[0]?.id || 0) + 1;

        const { error: iErr } = await supabase.from('sale_items').insert([{
          id: nextItemId,
          uuid: item.uuid || crypto.randomUUID(),
          sale_id: targetSaleId,
          variant_id: item.variant_id,
          packaging_type_id: item.packaging_type_id || 1,
          unit_name: item.unit_name || 'PCS',
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          total: item.total
        }]);
        if (iErr) console.error('Sale item insert error:', s.invoice_no, iErr.message);
      }
    }
  }

  console.log('--- ALL MASTER DATA AND SALES SYNCED SUCCESSFULLY! ---');
  db.close();
}

syncAll().catch(err => {
  console.error('Fatal sync error:', err);
  db.close();
});

