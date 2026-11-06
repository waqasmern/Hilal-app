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

async function findGhostEvents() {
  const { data: events } = await supabase.from('ingested_sync_events').select('*').eq('operation_type', 'SALE');
  const { data: sales } = await supabase.from('sales').select('uuid, invoice_no');
  const saleUuids = new Set((sales || []).map(s => s.uuid));

  const ghostEvents = (events || []).filter(e => !saleUuids.has(e.uuid));
  console.log(`Found ${ghostEvents.length} SALE events in ingested_sync_events that have NO matching sale in sales table:`);
  console.table(ghostEvents.map(g => ({
    id: g.id,
    uuid: g.uuid,
    entity_id: g.entity_id,
    invoice_no: g.payload?.invoice_no,
    customer_id: g.payload?.customer_id,
    net_amount: g.payload?.net_amount,
    received_at: g.received_at
  })));
}
findGhostEvents();

