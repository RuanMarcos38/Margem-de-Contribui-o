'use client';
import {useEffect,useState} from 'react';
import {Calculator,CheckCircle2,Save,ShieldCheck,TriangleAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';

const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function QuickResult({companyId,userId}:{companyId:string;userId:string}){
  const [form,setForm]=useState({directCost:0,extraUnitCost:0,monthlyFixedCost:0,expectedUnits:100,taxPct:0,feesPct:0,desiredProfitPct:20});
  const [result,setResult]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{loadDefaults()},[companyId]);

  async function loadDefaults(){
    const [{data:fixed},{data:channels},{data:taxProfiles}]=await Promise.all([
      supabase.from('fixed_costs').select('monthly_amount').eq('company_id',companyId).is('deleted_at',null),
      supabase.from('sales_channels').select('commission_pct,marketplace_pct,outbound_freight_pct').eq('company_id',companyId).eq('active',true).limit(1),
      supabase.from('company_tax_profiles').select('settings').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1)
    ]);
    const fixedTotal=(fixed||[]).reduce((s:any,x:any)=>s+Number(x.monthly_amount||0),0);
    const c=channels?.[0];
    const fees=Number(c?.commission_pct||0)+Number(c?.marketplace_pct||0)+Number(c?.outbound_freight_pct||0);
    const salesTax=Number((taxProfiles?.[0]?.settings as any)?.sales_tax_pct||0);
    setForm(f=>({...f,monthlyFixedCost:fixedTotal,feesPct:fees,taxPct:salesTax}));
    setLoaded(true);
  }

  async function calculate(){
    setBusy(true);
    const {data,error}=await supabase.rpc('calculate_quick_pricing',{
      p_company_id:companyId,
      p_direct_cost:Number(form.directCost||0),
      p_extra_unit_cost:Number(form.extraUnitCost||0),
      p_monthly_fixed_cost:Number(form.monthlyFixedCost||0),
      p_expected_units:Number(form.expectedUnits||1),
      p_tax_pct:Number(form.taxPct||0),
      p_card_pct:0,
      p_commission_pct:0,
      p_other_variable_pct:Number(form.feesPct||0),
      p_desired_profit_pct:Number(form.desiredProfitPct||0)
    });
    if(error) alert(error.message); else setResult(data);
    setBusy(false);
  }

  async function save(){
    if(!result?.ok)return;
    const input_data={mode:'simple',...form};
    const {data:s,error}=await supabase.from('pricing_scenarios').insert({
      company_id:companyId,name:'Resultado simples '+new Date().toLocaleString('pt-BR'),input_data,created_by:userId
    }).select().single();
    if(error)return alert(error.message);
    const {error:e2}=await supabase.from('pricing_results').insert({
      company_id:companyId,scenario_id:s.id,result_data:result,
      calculation_memory:['Cálculo pelo modo simples','Custos fixos rateados pela quantidade mensal esperada','Margem de contribuição não inclui custos fixos'],
      engine_version:'quick-1.0.0'
    });
    alert(e2?e2.message:'Resultado salvo com sucesso.');
  }

  return <div className='simpleBox'>
    <div className='simpleHead'>
      <div>
        <span className='eyebrow'>MODO SIMPLES</span>
        <h2>Descubra o preço certo em poucos passos</h2>
        <p>Preencha somente os dados essenciais. O cálculo é feito no backend e mostra preço recomendado, mínimo, margem e ponto de equilíbrio.</p>
      </div>
      <div className='simpleBadge'><ShieldCheck size={18}/> cálculo centralizado</div>
    </div>

    <div className='simpleGrid'>
      <label><span>1. Custo direto por unidade</span><input type='number' step='.01' value={form.directCost} onChange={e=>setForm({...form,directCost:Number(e.target.value)})}/><small>Compra, matéria-prima ou custo base.</small></label>
      <label><span>2. Outros custos por unidade</span><input type='number' step='.01' value={form.extraUnitCost} onChange={e=>setForm({...form,extraUnitCost:Number(e.target.value)})}/><small>Embalagem, personalização, frete, mão de obra direta.</small></label>
      <label><span>3. Quantidade esperada por mês</span><input type='number' step='1' value={form.expectedUnits} onChange={e=>setForm({...form,expectedUnits:Number(e.target.value)})}/><small>Usada para ratear os custos fixos.</small></label>
      <label><span>4. Custos fixos mensais</span><input type='number' step='.01' value={form.monthlyFixedCost} onChange={e=>setForm({...form,monthlyFixedCost:Number(e.target.value)})}/><small>{loaded?'Carregado do cadastro quando disponível.':'Carregando cadastro...'}</small></label>
      <label><span>5. Impostos sobre a venda (%)</span><input type='number' step='.01' value={form.taxPct} onChange={e=>setForm({...form,taxPct:Number(e.target.value)})}/><small>Use a alíquota efetiva aplicável ao seu caso.</small></label>
      <label><span>6. Taxas e comissões (%)</span><input type='number' step='.01' value={form.feesPct} onChange={e=>setForm({...form,feesPct:Number(e.target.value)})}/><small>Cartão, marketplace, comissão, frete percentual.</small></label>
      <label><span>7. Lucro desejado (%)</span><input type='number' step='.01' value={form.desiredProfitPct} onChange={e=>setForm({...form,desiredProfitPct:Number(e.target.value)})}/><small>Meta de lucro após o rateio dos fixos.</small></label>
    </div>

    <div className='simpleActions'>
      <button className='blueBtn' onClick={calculate} disabled={busy}><Calculator size={16}/>{busy?'Calculando...':'Gerar resultado'}</button>
      {result?.ok&&<button className='secondaryBtn' onClick={save}><Save size={16}/>Salvar resultado</button>}
    </div>

    {result&&(!result.ok?<div className='simpleWarn'><TriangleAlert size={18}/>{result.error}</div>:
      <div className='simpleResult'>
        <div className='resultHero'><span>PREÇO RECOMENDADO</span><strong>{brl(result.recommended_price)}</strong><small>Valor calculado com os dados informados</small></div>
        <div className='resultMiniGrid'>
          <div><span>Preço mínimo</span><b>{brl(result.minimum_price)}</b><small>Sem lucro após o rateio informado</small></div>
          <div><span>Margem de contribuição</span><b>{result.contribution_margin_pct}%</b><small>{brl(result.contribution_margin_unit)} por unidade</small></div>
          <div><span>Lucro estimado</span><b>{brl(result.target_profit_unit)}</b><small>{result.target_profit_pct}% do preço</small></div>
          <div><span>Ponto de equilíbrio</span><b>{brl(result.break_even_revenue||0)}</b><small>Faturamento mensal estimado</small></div>
        </div>
        <div className={form.taxPct>0?'confidence ok':'confidence warn'}>
          {form.taxPct>0?<CheckCircle2 size={18}/>:<TriangleAlert size={18}/>}
          <div><b>{form.taxPct>0?'Cálculo matemático consistente':'Atenção ao imposto'}</b><span>{form.taxPct>0?'Os resultados são determinísticos para os dados preenchidos.':'Preencha a alíquota efetiva correta para o seu regime antes de usar o preço como decisão final.'}</span></div>
        </div>
        {Array.isArray(result.warnings)&&result.warnings.map((w:string)=><div className='simpleWarn' key={w}><TriangleAlert size={16}/>{w}</div>)}
      </div>
    )}
  </div>
}
