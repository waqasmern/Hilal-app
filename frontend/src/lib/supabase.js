import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nncduklltahxexaevdou.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_KQ_Jkru3srbmwZEIsJWo4w_IGlKwI5M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
