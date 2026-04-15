import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Optima] Supabase env vars missing. Auth will not work. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
