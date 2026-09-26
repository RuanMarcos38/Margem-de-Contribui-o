'use client';
import {useEffect,useMemo,useState} from 'react';
import {Building2,Calculator,CheckCircle2,RefreshCw,Save,ShieldCheck,TriangleAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';

const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const n=(v:any)=>Number(v||0);

export default function QuickResult({companyId,userId}:{companyId:string;userId:string}){
  const [form,setForm]=useState({
    sector:'varejo',directCost:0,extraUnitCost:0,monthlyFixedCost:0,expectedUnits:100,
    feesPct:0,targetProfitPct:20,targetMonthlyProfit:0,expectedMonthlyRevenue:0
  });
  const [fiscal,setFiscal]=useState<any>(null);
  const [cnpj,setCnpj]=useState('');
  const [fiscalForm,setFiscalForm]=useState({regime:'',annex:'',rbt12:0,factorR:0,effectiveTaxPct:0});
  const [result,setResult]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [fiscalBusy,setFiscalBusy]=useState(false);
  const [syncBusy,setSyncBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{loadDefaults()},[companyId]);

  async function loadDefaults(){
    const [{data:fixed},{data:channels},{data:profile},{data:company}]=await Promise.all([
      supabase.from('fixed_costs').select('monthly_amount').eq('company_id',companyId).is('deleted_at',null),
      supabase.from('sales_channels').select('commission_pct,marketplace_pct,outbound_freight_pct').eq('company_id',companyId).eq('active',true).limit(1),
      supabase.from('company_fiscal_verifications').select('*').eq('company_id',companyId).neq('regime_status','stale').order('updated_at',{ascending:false}).limit(1),
      supabase.from('companies').select('tax_id,settings').eq('id',companyId).single()
    ]);
    const fixedTotal=(fixed||[]).reduce((s:any,x:any)=>s+n(x.monthly_amount),0);
    const c=channels?.[0];
    const fees=n(c?.commission_pct)+n(c?.marketplace_pct)+n(c?.outbound_freight_pct);
    const p=profile?.[0]||null;
    setFiscal(p);
    setCnpj(String(p?.cnpj||company?.tax_id||''));
    setFiscalForm({
      regime:String(p?.detected_regime||''),
      annex:String(p?.simple_annex||''),
      rbt12:n(p?.rbt12),
      factorR:n(p?.factor_r),
      effectiveTaxPct:n(p?.effective_sales_tax_pct)
    });
    setForm(x=>({
      ...x,monthlyFixedCost:fixedTotal,feesPct:fees,
      expectedUnits:n(company?.settings?.default_expected_units)||100,
      targetProfitPct:n(company?.settings?.default_profit_pct)||20
    }));
    setLoaded(true);
  }

  async function lookupCnpj(){
    const clean=cnpj.toUpperCase().replace(/[^0-9A-Z]/g,'');
    if(clean.length!==14)return alert('Informe um CNPJ válido com 14 caracteres.');
    setFiscalBusy(true);
    const {data,error}=await supabase.functions.invoke('lookup-cnpj-fiscal',{body:{company_id:companyId,cnpj:clean}});
    setFiscalBusy(false);
    if(error)return alert(error.message);
    if(!data?.ok)return alert(data?.error||'Não foi possível consultar o CNPJ.');
    await loadDefaults();
    if(data.required_confirmation) alert(data.required_confirmation);
  }

  async function syncCatalogs(){
    setSyncBusy(true);
    const {data,error}=await supabase.functions.invoke('sync-fiscal-catalogs',{body:{mode:'all'}});
    setSyncBusy(false);
    if(error)return alert(error.message);
    alert(data?.ok?'Catálogos CNAE/NCM atualizados.':'Falha ao atualizar catálogos: '+(data?.error||'erro desconhecido'));
  }

  async function confirmFiscal(){
    if(!fiscal)return alert('Consulte o CNPJ primeiro.');
    if(!fiscalForm.regime)return alert('Confirme o regime tributário.');
    if(fiscalForm.regime==='simples_nacional' && (!fiscalForm.annex || !fiscalForm.rbt12))return alert('Para o Simples, informe Anexo e RBT12.');
    if(['lucro_presumido','lucro_real','lucro_arbitrado'].includes(fiscalForm.regime) && fiscalForm.effectiveTaxPct<=0)return alert('Para este regime, informe a alíquota efetiva validada para a operação.');
    setFiscalBusy(true);
    const {error}=await supabase.from('company_fiscal_verifications').update({
      detected_regime:fiscalForm.regime,
      simple_annex:fiscalForm.regime==='simples_nacional'?fiscalForm.annex:null,
      rbt12:fiscalForm.regime==='simples_nacional'?n(fiscalForm.rbt12):null,
      factor_r:fiscalForm.annex==='R'?n(fiscalForm.factorR):null,
      effective_sales_tax_pct:fiscalForm.regime==='simples_nacional'?null:n(fiscalForm.effectiveTaxPct),
      regime_status:'declared',
      verification_source:'confirmacao_usuario',
      verified_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq('id',fiscal.id);
    setFiscalBusy(false);
    if(error)return alert(error.message);
    await loadDefaults();
    alert('Dados fiscais confirmados para cálculo. Para status 100% verificado, valide com documento fiscal/contador e mantenha a evidência.');
  }

  async function calculate(){
    setBusy(true); setResult(null);
    const {data,error}=await supabase.rpc('calculate_decision_engine',{
      p_company_id:companyId,
      p_sector:form.sector,
      p_direct_unit_cost:n(form.directCost),
      p_other_variable_unit_cost:n(form.extraUnitCost),
      p_monthly_fixed_cost:n(form.monthlyFixedCost),
      p_expected_units:n(form.expectedUnits)||1,
      p_fees_pct:n(form.feesPct),
      p_target_profit_pct:n(form.targetProfitPct),
      p_target_monthly_profit:n(form.targetMonthlyProfit),
      p_expected_monthly_revenue:n(form.expectedMonthlyRevenue),
      p_tax_pct_override:null
    });
    setBusy(false);
    if(error)return alert(error.message);
    setResult(data);
  }

  async function save(){
    if(!result?.ok)return;
    const input_data={mode:'decision-v2',...form};
    const {data:s,error}=await supabase.from('pricing_scenarios').insert({
      company_id:companyId,name:'Decisão '+new Date().toLocaleString('pt-BR'),input_data,created_by:userId
    }).select().single();
    if(error)return alert(error.message);
    const [a,b]=await Promise.all([
      supabase.from('pricing_results').insert({
        company_id:companyId,scenario_id:s.id,result_data:result,
        calculation_memory:['Motor determinístico decision-2.0.0','Tributação obtida do perfil fiscal vigente','Custos fixos usados no ponto de equilíbrio e preço operacional'],
        engine_version:'decision-2.0.0'
      }),
      supabase.from('decision_engine_runs').insert({
        company_id:companyId,sector:form.sector,input_data,tax_context:{fiscal_profile_id:fiscal?.id||null,regime:fiscal?.detected_regime||null},
        result_data:result,validation_status:result.validation_status||'warning',calculation_version:'decision-2.0.0',created_by:userId
      })
    ]);
    alert(a.error?.message||b.error?.message||'Análise salva com sucesso.');
  }

  const analysis=useMemo(()=>{
    if(!result?.ok)return [];
    const x:string[]=[];
    if(n(result.projected_operating_result)<0)x.push('A projeção informada fecha no vermelho. O faturamento precisa subir ou custos/preço precisam ser ajustados.');
    else if(form.expectedMonthlyRevenue>0)x.push('A projeção informada cobre os custos e gera resultado operacional positivo.');
    if(result.margin_of_safety_pct!==null && n(result.margin_of_safety_pct)<10)x.push('Margem de segurança abaixo de 10%: pequena queda nas vendas pode levar ao prejuízo.');
    if(n(result.operating_profit_pct)<5)x.push('Lucro operacional unitário abaixo de 5%: preço sensível a aumentos de custo.');
    if(n(result.break_even_units)>n(form.expectedUnits))x.push('A quantidade esperada está abaixo do ponto de equilíbrio em unidades.');
    if(!x.length)x.push('Os indicadores informados não apresentam alerta crítico matemático neste cenário.');
    return x;
  },[result,form.expectedMonthlyRevenue,form.expectedUnits]);

  const fiscalOk=fiscal?.regime_status==='verified';
  return <div className='simpleBox'>
    <div className='simpleHead'>
      <div>
        <span className='eyebrow'>CENTRAL DE DECISÃO</span>
        <h2>Quanto devo cobrar para não operar no vermelho?</h2>
        <p>O cálculo é determinístico no backend. A análise automática explica o resultado; ela não substitui a matemática nem inventa tributos.</p>
      </div>
      <div className='simpleBadge'><ShieldCheck size={18}/> motor decision-2.0.0</div>
    </div>

    <div className='fiscalPanel'>
      <div className='fiscalTitle'><Building2 size={18}/><div><b>1. Identificação fiscal da empresa</b><span>CNPJ, CNAE e regime alimentam a tributação.</span></div></div>
      <div className='cnpjRow'>
        <input placeholder='CNPJ' value={cnpj} onChange={e=>setCnpj(e.target.value)}/>
        <button className='blueBtn' onClick={lookupCnpj} disabled={fiscalBusy}><RefreshCw size={15}/>{fiscalBusy?'Consultando...':'Reconhecer CNPJ'}</button>
        <button className='secondaryBtn' onClick={syncCatalogs} disabled={syncBusy}><RefreshCw size={15}/>{syncBusy?'Atualizando...':'Atualizar CNAE/NCM'}</button>
      </div>
      {fiscal&&<div className='fiscalSummary'>
        <div><span>Razão social</span><b>{fiscal.legal_name||'—'}</b></div>
        <div><span>CNAE principal</span><b>{fiscal.primary_cnae||'—'}</b></div>
        <div><span>Simples</span><b>{fiscal.simples_optant===true?'Sim':fiscal.simples_optant===false?'Não':'Não confirmado'}</b></div>
        <div><span>Status fiscal</span><b className={fiscalOk?'okText':'warnText'}>{fiscal.regime_status}</b></div>
      </div>}

      {fiscal&&<div className='simpleGrid fiscalGrid'>
        <label><span>Regime tributário</span><select value={fiscalForm.regime} onChange={e=>setFiscalForm({...fiscalForm,regime:e.target.value})}>
          <option value=''>Selecione</option><option value='mei'>MEI</option><option value='simples_nacional'>Simples Nacional</option><option value='lucro_presumido'>Lucro Presumido</option><option value='lucro_real'>Lucro Real</option><option value='lucro_arbitrado'>Lucro Arbitrado</option>
        </select></label>
        {fiscalForm.regime==='simples_nacional'&&<label><span>Anexo do Simples</span><select value={fiscalForm.annex} onChange={e=>setFiscalForm({...fiscalForm,annex:e.target.value})}><option value=''>Selecione</option><option>I - Comércio</option><option value='II'>II - Indústria</option><option value='III'>III - Serviços</option><option value='IV'>IV - Serviços</option><option value='V'>V - Serviços</option><option value='R'>III/V por Fator R</option></select></label>}
        {fiscalForm.regime==='simples_nacional'&&<label><span>RBT12</span><input type='number' step='.01' value={fiscalForm.rbt12} onChange={e=>setFiscalForm({...fiscalForm,rbt12:n(e.target.value)})}/></label>}
        {fiscalForm.regime==='simples_nacional'&&fiscalForm.annex==='R'&&<label><span>Fator R (%)</span><input type='number' step='.01' value={fiscalForm.factorR} onChange={e=>setFiscalForm({...fiscalForm,factorR:n(e.target.value)})}/></label>}
        {['lucro_presumido','lucro_real','lucro_arbitrado'].includes(fiscalForm.regime)&&<label><span>Alíquota efetiva validada da operação (%)</span><input type='number' step='.0001' value={fiscalForm.effectiveTaxPct} onChange={e=>setFiscalForm({...fiscalForm,effectiveTaxPct:n(e.target.value)})}/><small>Não é seguro inferir Presumido/Real apenas pelo CNPJ.</small></label>}
      </div>}
      {fiscal&&<button className='secondaryBtn' onClick={confirmFiscal} disabled={fiscalBusy}><CheckCircle2 size={15}/>Confirmar dados fiscais</button>}
      {!fiscalOk&&<div className='simpleWarn'><TriangleAlert size={16}/>O cadastro fiscal pode ser pré-preenchido automaticamente, mas o preço final só deve ser tratado como fiscalmente validado quando o regime/alíquota estiverem confirmados.</div>}
    </div>

    <div className='simpleHead sectionHead'><div><span className='eyebrow'>2. CUSTOS E META</span><h2>Informe somente o essencial</h2></div></div>
    <div className='simpleGrid'>
      <label><span>Tipo de negócio</span><select value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})}><option value='varejo'>Varejo / Comércio</option><option value='industria'>Indústria</option><option value='servico'>Prestação de serviço</option></select><small>A fórmula adapta a leitura gerencial ao setor.</small></label>
      <label><span>Custo direto por unidade</span><input type='number' step='.01' value={form.directCost} onChange={e=>setForm({...form,directCost:n(e.target.value)})}/><small>Compra, matéria-prima ou hora direta.</small></label>
      <label><span>Outros variáveis por unidade</span><input type='number' step='.01' value={form.extraUnitCost} onChange={e=>setForm({...form,extraUnitCost:n(e.target.value)})}/><small>Embalagem, frete, personalização, insumos.</small></label>
      <label><span>Custos fixos mensais</span><input type='number' step='.01' value={form.monthlyFixedCost} onChange={e=>setForm({...form,monthlyFixedCost:n(e.target.value)})}/><small>{loaded?'Carregado do cadastro quando disponível.':'Carregando...'}</small></label>
      <label><span>Quantidade esperada/mês</span><input type='number' step='1' value={form.expectedUnits} onChange={e=>setForm({...form,expectedUnits:n(e.target.value)})}/><small>Usada no preço operacional e equilíbrio.</small></label>
      <label><span>Taxas e comissões (%)</span><input type='number' step='.01' value={form.feesPct} onChange={e=>setForm({...form,feesPct:n(e.target.value)})}/><small>Cartão, marketplace, comissão e frete percentual.</small></label>
      <label><span>Lucro desejado por venda (%)</span><input type='number' step='.01' value={form.targetProfitPct} onChange={e=>setForm({...form,targetProfitPct:n(e.target.value)})}/><small>Meta sobre o preço após custos e taxas.</small></label>
      <label><span>Lucro mensal desejado</span><input type='number' step='.01' value={form.targetMonthlyProfit} onChange={e=>setForm({...form,targetMonthlyProfit:n(e.target.value)})}/><small>Calcula o faturamento-meta.</small></label>
      <label><span>Faturamento mensal projetado</span><input type='number' step='.01' value={form.expectedMonthlyRevenue} onChange={e=>setForm({...form,expectedMonthlyRevenue:n(e.target.value)})}/><small>Mostra se a projeção fecha positiva ou negativa.</small></label>
    </div>

    <div className='simpleActions'>
      <button className='blueBtn' onClick={calculate} disabled={busy}><Calculator size={16}/>{busy?'Calculando...':'Calcular decisão'}</button>
      {result?.ok&&<button className='secondaryBtn' onClick={save}><Save size={16}/>Salvar cenário</button>}
    </div>

    {result&&(!result.ok?<div className='simpleWarn'><TriangleAlert size={18}/><div><b>{result.error}</b><span>{result.required_action||''}</span></div></div>:
      <div className='simpleResult'>
        <div className='resultHero'><span>PREÇO RECOMENDADO POR UNIDADE</span><strong>{brl(result.recommended_unit_price)}</strong><small>Preço operacional com custos, tributação, taxas e lucro desejado.</small></div>
        <div className='resultMiniGrid'>
          <div><span>Preço mínimo operacional</span><b>{brl(result.operating_floor_unit_price)}</b><small>Cobre custos fixos no volume informado, sem lucro.</small></div>
          <div><span>Margem de contribuição</span><b>{result.contribution_margin_pct}%</b><small>{brl(result.contribution_margin_unit)} por unidade.</small></div>
          <div><span>Ponto de equilíbrio</span><b>{brl(result.break_even_revenue||0)}</b><small>{Number(result.break_even_units||0).toFixed(0)} unidades/mês.</small></div>
          <div><span>Faturamento para meta</span><b>{brl(result.target_monthly_revenue||0)}</b><small>Para atingir o lucro mensal informado.</small></div>
          <div><span>Resultado operacional projetado</span><b>{result.projected_operating_result===null?'—':brl(result.projected_operating_result)}</b><small>No faturamento projetado.</small></div>
          <div><span>Margem de segurança</span><b>{result.margin_of_safety_pct===null?'—':result.margin_of_safety_pct+'%'}</b><small>Folga acima do ponto de equilíbrio.</small></div>
          <div><span>Tributação utilizada</span><b>{result.tax_pct}%</b><small>{result.tax_source} · {result.tax_status}</small></div>
          <div><span>Validação</span><b>{result.validation_status}</b><small>Motor {result.calculation_version}</small></div>
        </div>
        <div className={result.validation_status==='complete'?'confidence ok':'confidence warn'}>
          {result.validation_status==='complete'?<CheckCircle2 size={18}/>:<TriangleAlert size={18}/>}
          <div><b>{result.validation_status==='complete'?'Cálculo matemático validado':'Cálculo com pendência de validação fiscal'}</b><span>A matemática é determinística. A camada automática apenas interpreta os indicadores e não altera os valores calculados.</span></div>
        </div>
        <div className='analysisBox'><b>Análise automática para decisão</b>{analysis.map(x=><p key={x}>• {x}</p>)}</div>
        {Array.isArray(result.warnings)&&result.warnings.map((w:string)=><div className='simpleWarn' key={w}><TriangleAlert size={16}/>{w}</div>)}
      </div>
    )}
  </div>
}
