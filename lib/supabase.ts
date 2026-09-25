import {createClient} from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if(!url||!key){
  console.warn('Supabase environment variables are not configured.');
}

export const supabase=createClient(url||'https://placeholder.supabase.co',key||'placeholder');
