const fs = require('fs');
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

async function checkAllSales() {
  const { data: sales, error } = await supabase.from('sales').select('*').order('id', { ascending: true });
  console.log('Total sales in Supabase:', sales ? sales.length : 0);
  console.table((sales || []).map(s => ({
    id: s.id,
    uuid: s.uuid,
    invoice_no: s.invoice_no,
    customer_id: s.customer_id,
    net_amount: s.net_amount,
    created_at: s.created_at
  })));
}
checkAllSales();

