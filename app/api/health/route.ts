import {NextResponse} from 'next/server';

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vtlorjxornqrbaemixvn.supabase.co';
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  try{
    const res=await fetch(url+'/auth/v1/health',{
      cache:'no-store',
      headers:key?{apikey:key,Authorization:'Bearer '+key}:{}
    });
    const supabaseOk=res.ok;
    return NextResponse.json({
      ok:supabaseOk,
      app:'margem-de-contribuicao',
      frontend:'online',
      backend:'online',
      supabase:supabaseOk?'reachable':'unreachable',
      supabase_status:res.status,
      timestamp:new Date().toISOString()
    },{status:supabaseOk?200:503});
  }catch{
    return NextResponse.json({
      ok:false,
      app:'margem-de-contribuicao',
      frontend:'online',
      backend:'online',
      supabase:'unreachable',
      timestamp:new Date().toISOString()
    },{status:503});
  }
}
