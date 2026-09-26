'use client';
import {useEffect,useState} from 'react';
import {CircleDollarSign,Gauge,Landmark,Package,Percent} from 'lucide-react';
import {supabase} from '@/lib/supabase';

const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function LiveDashboard({companyId}:{companyId:string}){
  const [s,setS]=useState<any>({products:0,fixed:0,variable:0,scenarios:0,lastPricing:null,lastDre:null});
  useEffect(()=>{load()},[companyId]);

  async function load(){
    const [p,f,v,r,d]=await Promise.all([
      supabase.from('products').select('id').eq('company_id',companyId).is('deleted_at',null),
      supabase.from('fixed_costs').select('monthly_amount').eq('company_id',companyId).is('deleted_at',null),
      supabase.from('variable_costs').select('amount').eq('company_id',companyId).is('deleted_at',null),
      supabase.from('pricing_results').select('result_data,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1),
      supabase.from('dre_periods').select('*').eq('company_id',companyId).order('period_start',{ascending:false}).limit(1)
    ]);
    setS({
      products:p.data?.length||0,
      fixed:(f.data||[]).reduce((a:any,x:any)=>a+Number(x.monthly_amount||0),0),
      variable:(v.data||[]).reduce((a:any,x:any)=>a+Number(x.amount||0),0),
      scenarios:r.data?.length||0,
      lastPricing:r.data?.[0]?.result_data||null,
      lastDre:d.data?.[0]||null
    });
  }

  const price=Number(s.lastPricing?.recommended_price ?? s.lastPricing?.price ?? 0);
  const mc=Number(s.lastPricing?.contribution_margin_pct ?? s.lastPricing?.contributionPct ?? 0);
  const be=Number(s.lastPricing?.break_even_revenue ?? 0);
  return <>
    <div className='hero'><div><span>DADOS REAIS DA EMPRESA</span><h2>Resumo financeiro</h2><p>Este painel usa apenas informações persistidas no Supabase. Sem dados fictícios.</p></div></div>
    <div className='kpis'>
      <div className='card kpi'><div><span>Produtos cadastrados</span><strong>{s.products}</strong><small>ativos no banco</small></div><div className='kpiIcon'><Package size={21}/></div></div>
      <div className='card kpi'><div><span>Custos fixos mensais</span><strong>{brl(s.fixed)}</strong><small>cadastro real</small></div><div className='kpiIcon'><Landmark size={21}/></div></div>
      <div className='card kpi'><div><span>Último preço calculado</span><strong>{price?brl(price):'—'}</strong><small>{price?'último cenário salvo':'salve uma precificação'}</small></div><div className='kpiIcon'><CircleDollarSign size={21}/></div></div>
      <div className='card kpi'><div><span>Margem de contribuição</span><strong>{mc?mc.toFixed(2)+'%':'—'}</strong><small>{be?'equilíbrio '+brl(be):'último cálculo'}</small></div><div className='kpiIcon'><Percent size={21}/></div></div>
    </div>
    <div className='grid2'>
      <div className='card'>
        <div className='cardTitle'><div><b>Última DRE registrada</b><span>{s.lastDre?'Dados do período informado':'Nenhum período salvo ainda'}</span></div></div>
        {s.lastDre?<div className='resultRows'>
          <p><span>Receita bruta</span><b>{brl(s.lastDre.revenue_gross)}</b></p>
          <p><span>Impostos</span><b>{brl(s.lastDre.taxes_on_sales)}</b></p>
          <p><span>Custos variáveis</span><b>{brl(s.lastDre.variable_costs)}</b></p>
          <p><span>Custos fixos</span><b>{brl(s.lastDre.fixed_costs)}</b></p>
          <p><span>Resultado operacional</span><b>{brl(s.lastDre.calculated?.operating_result||0)}</b></p>
        </div>:<p>Cadastre uma DRE para visualizar números reais aqui.</p>}
      </div>
      <div className='card'>
        <div className='cardTitle'><div><b>Base cadastrada</b><span>Indicadores usados nos cálculos</span></div></div>
        <div className='resultRows'>
          <p><span>Custos variáveis unitários</span><b>{brl(s.variable)}</b></p>
          <p><span>Cenário disponível</span><b>{s.lastPricing?'Sim':'Não'}</b></p>
          <p><span>Ponto de equilíbrio calculado</span><b>{be?brl(be):'—'}</b></p>
        </div>
      </div>
    </div>
  </>;
}
