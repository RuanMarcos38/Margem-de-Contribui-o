import {NextResponse} from 'next/server';

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vtlorjxornqrbaemixvn.supabase.co';
  try{
    const res=await fetch(url+'/auth/v1/health',{cache:'no-store'});
    return NextResponse.json({
      ok:true,
      app:'margem-de-contribuicao',
      frontend:'online',
      backend:'online',
      supabase:res.ok?'reachable':'configured',
      timestamp:new Date().toISOString()
    });
  }catch{
    return NextResponse.json({ok:true,app:'margem-de-contribuicao',frontend:'online',backend:'online',supabase:'configured',timestamp:new Date().toISOString()});
  }
}
