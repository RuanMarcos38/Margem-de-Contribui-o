'use client';
import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Plus,Save,Trash2,TriangleAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';

const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=(v:any)=>Number(v||0);

export function VariableCostsModule({companyId}:{companyId:string}){
 const[rows,setRows]=useState<any[]>([]),[f,setF]=useState({name:'',amount:0,percentage_of_sale:0});
 useEffect(()=>{load()},[companyId]);
 async function load(){const{data}=await supabase.from('variable_costs').select('*').eq('company_id',companyId).is('deleted_at',null).order('created_at',{ascending:false});setRows(data||[])}
 async function add(e:any){e.preventDefault();const{error}=await supabase.from('variable_costs').insert({company_id:companyId,name:f.name,amount:num(f.amount),percentage_of_sale:num(f.percentage_of_sale)});if(error)return alert(error.message);setF({name:'',amount:0,percentage_of_sale:0});load()}
 async function del(id:string){await supabase.from('variable_costs').update({deleted_at:new Date().toISOString()}).eq('id',id);load()}
 const total=rows.reduce((s,r)=>s+num(r.amount),0),pct=rows.reduce((s,r)=>s+num(r.percentage_of_sale),0);
 return <ModuleShell title='Custos Variáveis' subtitle='Cadastre somente os custos que variam com a venda ou produção.'>
   <div className='kpis compactKpis'><Mini title='Custos cadastrados' value={brl(total)}/><Mini title='% sobre venda' value={pct.toFixed(2)+'%'}/><Mini title='Itens ativos' value={String(rows.length)}/></div>
   <form className='card inlineForm' onSubmit={add}><b>Novo custo variável</b><input placeholder='Ex.: embalagem' value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/><input type='number' step='.01' placeholder='R$ por unidade' value={f.amount} onChange={e=>setF({...f,amount:num(e.target.value)})}/><input type='number' step='.01' placeholder='% da venda' value={f.percentage_of_sale} onChange={e=>setF({...f,percentage_of_sale:num(e.target.value)})}/><button className='blueBtn'><Plus size={15}/>Adicionar</button></form>
   <Table headers={['Nome','Valor','% venda','']} rows={rows.map(r=>[r.name,brl(r.amount),num(r.percentage_of_sale).toFixed(2)+'%',<button className='dangerIcon' onClick={()=>del(r.id)}><Trash2 size={15}/></button>])}/>
 </ModuleShell>
}

export function FixedCostsModule({companyId}:{companyId:string}){
 const[rows,setRows]=useState<any[]>([]),[f,setF]=useState({name:'',monthly_amount:0});
 useEffect(()=>{load()},[companyId]);
 async function load(){const{data}=await supabase.from('fixed_costs').select('*').eq('company_id',companyId).is('deleted_at',null).order('created_at',{ascending:false});setRows(data||[])}
 async function add(e:any){e.preventDefault();const{error}=await supabase.from('fixed_costs').insert({company_id:companyId,name:f.name,monthly_amount:num(f.monthly_amount)});if(error)return alert(error.message);setF({name:'',monthly_amount:0});load()}
 async function del(id:string){await supabase.from('fixed_costs').update({deleted_at:new Date().toISOString()}).eq('id',id);load()}
 const total=rows.reduce((s,r)=>s+num(r.monthly_amount),0);
 return <ModuleShell title='Custos Fixos' subtitle='Cadastre despesas mensais que existem mesmo sem venda.'>
   <div className='kpis compactKpis'><Mini title='Total mensal' value={brl(total)}/><Mini title='Itens ativos' value={String(rows.length)}/><Mini title='Uso' value='Ponto de equilíbrio'/></div>
   <form className='card inlineForm' onSubmit={add}><b>Novo custo fixo</b><input placeholder='Ex.: aluguel' value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/><input type='number' step='.01' placeholder='Valor mensal' value={f.monthly_amount} onChange={e=>setF({...f,monthly_amount:num(e.target.value)})}/><button className='blueBtn'><Plus size={15}/>Adicionar</button></form>
   <Table headers={['Nome','Valor mensal','']} rows={rows.map(r=>[r.name,brl(r.monthly_amount),<button className='dangerIcon' onClick={()=>del(r.id)}><Trash2 size={15}/></button>])}/>
 </ModuleShell>
}

export function ChannelsModule({companyId}:{companyId:string}){
 const[rows,setRows]=useState<any[]>([]),[f,setF]=useState({name:'',commission_pct:0,marketplace_pct:0,outbound_freight_pct:0});
 useEffect(()=>{load()},[companyId]);
 async function load(){const{data}=await supabase.from('sales_channels').select('*').eq('company_id',companyId).order('created_at');setRows(data||[])}
 async function add(e:any){e.preventDefault();const{error}=await supabase.from('sales_channels').insert({company_id:companyId,name:f.name,channel_type:'custom',commission_pct:num(f.commission_pct),marketplace_pct:num(f.marketplace_pct),outbound_freight_pct:num(f.outbound_freight_pct)});if(error)return alert(error.message);setF({name:'',commission_pct:0,marketplace_pct:0,outbound_freight_pct:0});load()}
 async function toggle(r:any){await supabase.from('sales_channels').update({active:!r.active}).eq('id',r.id);load()}
 return <ModuleShell title='Canais de Venda' subtitle='Centralize taxas de cada canal para não esquecer custos na precificação.'>
  <form className='card inlineForm' onSubmit={add}><b>Novo canal</b><input placeholder='Nome do canal' value={f.name} onChange={e=>setF({...f,name:e.target.value})} required/><input type='number' step='.01' placeholder='Comissão %' value={f.commission_pct} onChange={e=>setF({...f,commission_pct:num(e.target.value)})}/><input type='number' step='.01' placeholder='Marketplace %' value={f.marketplace_pct} onChange={e=>setF({...f,marketplace_pct:num(e.target.value)})}/><input type='number' step='.01' placeholder='Frete %' value={f.outbound_freight_pct} onChange={e=>setF({...f,outbound_freight_pct:num(e.target.value)})}/><button className='blueBtn'><Plus size={15}/>Adicionar</button></form>
  <Table headers={['Canal','Comissão','Marketplace','Frete','Status']} rows={rows.map(r=>[r.name,num(r.commission_pct).toFixed(2)+'%',num(r.marketplace_pct).toFixed(2)+'%',num(r.outbound_freight_pct).toFixed(2)+'%',<button className={r.active?'statusOn':'statusOff'} onClick={()=>toggle(r)}>{r.active?'Ativo':'Inativo'}</button>])}/>
 </ModuleShell>
}

export function TaxProfileModule({companyId,company}:{companyId:string;company:any}){
 const[regimes,setRegimes]=useState<any[]>([]),[profile,setProfile]=useState<any>(null);
 const[f,setF]=useState({regime_id:'',rbt12:0,factor_r:0,cnae:'',sales_tax_pct:0});
 useEffect(()=>{load()},[companyId]);
 async function load(){
  const[{data:r},{data:p}]=await Promise.all([supabase.from('tax_regimes').select('*').order('name'),supabase.from('company_tax_profiles').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1)]);
  setRegimes(r||[]); const x=p?.[0]; setProfile(x||null);
  if(x)setF({regime_id:x.regime_id,rbt12:num(x.rbt12),factor_r:num(x.factor_r),cnae:(x.cnae_codes||[]).join(', '),sales_tax_pct:num(x.settings?.sales_tax_pct)});
 }
 async function save(e:any){e.preventDefault();const payload={company_id:companyId,regime_id:f.regime_id,cnae_codes:f.cnae.split(',').map(x=>x.trim()).filter(Boolean),state_code:company?.state_code,city:company?.city,rbt12:num(f.rbt12),factor_r:num(f.factor_r),settings:{sales_tax_pct:num(f.sales_tax_pct)}};const q=profile?supabase.from('company_tax_profiles').update(payload).eq('id',profile.id):supabase.from('company_tax_profiles').insert(payload);const{error}=await q;if(error)return alert(error.message);alert('Perfil tributário salvo.');load()}
 return <ModuleShell title='Impostos' subtitle='Defina o perfil fiscal que alimenta os cálculos. Não use uma alíquota genérica se houver particularidades de CNAE, NCM, UF ou município.'>
  <div className='notice'><TriangleAlert size={18}/><span>A matemática pode ser determinística; a exatidão fiscal depende dos dados tributários corretos e da legislação vigente.</span></div>
  <form className='card formGrid' onSubmit={save}>
   <label><span>Regime tributário</span><select value={f.regime_id} onChange={e=>setF({...f,regime_id:e.target.value})} required><option value=''>Selecione</option>{regimes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <label><span>Alíquota efetiva usada nas vendas (%)</span><input type='number' step='.0001' value={f.sales_tax_pct} onChange={e=>setF({...f,sales_tax_pct:num(e.target.value)})}/></label>
   <label><span>RBT12</span><input type='number' step='.01' value={f.rbt12} onChange={e=>setF({...f,rbt12:num(e.target.value)})}/></label>
   <label><span>Fator R (%)</span><input type='number' step='.01' value={f.factor_r} onChange={e=>setF({...f,factor_r:num(e.target.value)})}/></label>
   <label><span>CNAE(s)</span><input value={f.cnae} onChange={e=>setF({...f,cnae:e.target.value})} placeholder='Separados por vírgula'/></label>
   <div className='formAction'><button className='blueBtn'><Save size={15}/>Salvar perfil tributário</button></div>
  </form>
 </ModuleShell>
}

export function RegimesModule({companyId}:{companyId:string}){
 const[regimes,setRegimes]=useState<any[]>([]),[selected,setSelected]=useState('');
 useEffect(()=>{(async()=>{const[{data:r},{data:p}]=await Promise.all([supabase.from('tax_regimes').select('*').order('name'),supabase.from('company_tax_profiles').select('regime_id').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1)]);setRegimes(r||[]);setSelected(p?.[0]?.regime_id||'')})()},[companyId]);
 return <ModuleShell title='Regimes Tributários' subtitle='Visão dos regimes disponíveis no motor fiscal.'><div className='cards4'>{regimes.map(r=><div className={selected===r.id?'card regime selected':'card regime'} key={r.id}><h3>{r.name}</h3><p>{r.description}</p>{selected===r.id&&<div className='selectedTag'><CheckCircle2 size={14}/>Regime atual</div>}</div>)}</div></ModuleShell>
}

export function DreModule({companyId}:{companyId:string}){
 const[rows,setRows]=useState<any[]>([]),[f,setF]=useState({period_start:'',period_end:'',revenue_gross:0,taxes_on_sales:0,variable_costs:0,fixed_costs:0});
 useEffect(()=>{load()},[companyId]);
 async function load(){const{data}=await supabase.from('dre_periods').select('*').eq('company_id',companyId).order('period_start',{ascending:false});setRows(data||[])}
 async function add(e:any){e.preventDefault();const calc={net_revenue:num(f.revenue_gross)-num(f.taxes_on_sales),contribution:num(f.revenue_gross)-num(f.taxes_on_sales)-num(f.variable_costs),operating_result:num(f.revenue_gross)-num(f.taxes_on_sales)-num(f.variable_costs)-num(f.fixed_costs)};const{error}=await supabase.from('dre_periods').insert({...f,company_id:companyId,calculated:calc});if(error)return alert(error.message);setF({period_start:'',period_end:'',revenue_gross:0,taxes_on_sales:0,variable_costs:0,fixed_costs:0});load()}
 return <ModuleShell title='DRE' subtitle='Registre períodos reais para substituir dados de demonstração por números da empresa.'>
  <form className='card formGrid' onSubmit={add}>
   <label><span>Início</span><input type='date' value={f.period_start} onChange={e=>setF({...f,period_start:e.target.value})} required/></label>
   <label><span>Fim</span><input type='date' value={f.period_end} onChange={e=>setF({...f,period_end:e.target.value})} required/></label>
   <label><span>Receita bruta</span><input type='number' step='.01' value={f.revenue_gross} onChange={e=>setF({...f,revenue_gross:num(e.target.value)})}/></label>
   <label><span>Impostos vendas</span><input type='number' step='.01' value={f.taxes_on_sales} onChange={e=>setF({...f,taxes_on_sales:num(e.target.value)})}/></label>
   <label><span>Custos variáveis</span><input type='number' step='.01' value={f.variable_costs} onChange={e=>setF({...f,variable_costs:num(e.target.value)})}/></label>
   <label><span>Custos fixos</span><input type='number' step='.01' value={f.fixed_costs} onChange={e=>setF({...f,fixed_costs:num(e.target.value)})}/></label>
   <div className='formAction'><button className='blueBtn'><Plus size={15}/>Salvar período</button></div>
  </form>
  <Table headers={['Período','Receita','Margem contribuição','Resultado']} rows={rows.map(r=>[new Date(r.period_start+'T00:00:00').toLocaleDateString('pt-BR')+' a '+new Date(r.period_end+'T00:00:00').toLocaleDateString('pt-BR'),brl(r.revenue_gross),brl(r.calculated?.contribution||0),brl(r.calculated?.operating_result||0)])}/>
 </ModuleShell>
}

export function BreakEvenLive({companyId}:{companyId:string}){
 const[fixed,setFixed]=useState(0),[last,setLast]=useState<any>(null);
 useEffect(()=>{(async()=>{const[{data:f},{data:p}]=await Promise.all([supabase.from('fixed_costs').select('monthly_amount').eq('company_id',companyId).is('deleted_at',null),supabase.from('pricing_results').select('result_data,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1)]);setFixed((f||[]).reduce((s:any,x:any)=>s+num(x.monthly_amount),0));setLast(p?.[0]?.result_data||null)})()},[companyId]);
 const pct=num(last?.contribution_margin_pct||last?.contributionPct),be=pct>0?fixed/(pct/100):0;
 return <ModuleShell title='Ponto de Equilíbrio' subtitle='Quanto precisa faturar para cobrir os custos fixos com a margem cadastrada.'>
  <div className='kpis'><Mini title='Custos fixos reais' value={brl(fixed)}/><Mini title='Última MC' value={pct.toFixed(2)+'%'}/><Mini title='Ponto de equilíbrio' value={brl(be)}/><Mini title='Status' value={pct>0?'Calculado':'Salve uma precificação'}/></div>
 </ModuleShell>
}

export function ReportsModule({companyId}:{companyId:string}){
 const[summary,setSummary]=useState<any>({fixed:0,variable:0,products:0,scenarios:0,dre:[]});
 useEffect(()=>{load()},[companyId]);
 async function load(){const[a,b,c,d,e]=await Promise.all([
  supabase.from('fixed_costs').select('monthly_amount').eq('company_id',companyId).is('deleted_at',null),
  supabase.from('variable_costs').select('amount').eq('company_id',companyId).is('deleted_at',null),
  supabase.from('products').select('id').eq('company_id',companyId).is('deleted_at',null),
  supabase.from('pricing_results').select('id').eq('company_id',companyId),
  supabase.from('dre_periods').select('*').eq('company_id',companyId).order('period_start',{ascending:false}).limit(12)
 ]);setSummary({fixed:(a.data||[]).reduce((s:any,x:any)=>s+num(x.monthly_amount),0),variable:(b.data||[]).reduce((s:any,x:any)=>s+num(x.amount),0),products:c.data?.length||0,scenarios:d.data?.length||0,dre:e.data||[]})}
 return <ModuleShell title='Relatórios' subtitle='Resumo objetivo dos dados realmente cadastrados.'>
  <div className='kpis'><Mini title='Fixos mensais' value={brl(summary.fixed)}/><Mini title='Variáveis unitários' value={brl(summary.variable)}/><Mini title='Produtos' value={String(summary.products)}/><Mini title='Cálculos salvos' value={String(summary.scenarios)}/></div>
  <Table headers={['Período DRE','Receita','Resultado']} rows={summary.dre.map((r:any)=>[new Date(r.period_start+'T00:00:00').toLocaleDateString('pt-BR'),brl(r.revenue_gross),brl(r.calculated?.operating_result||0)])}/>
 </ModuleShell>
}

export function CompanyModule({company}:{company:any}){
 const[f,setF]=useState({name:company?.name||'',legal_name:company?.legal_name||'',tax_id:company?.tax_id||'',state_code:company?.state_code||'',city:company?.city||''});
 async function save(e:any){e.preventDefault();const{error}=await supabase.from('companies').update(f).eq('id',company.id);alert(error?error.message:'Empresa atualizada.')}
 return <ModuleShell title='Empresa' subtitle='Dados usados pelo restante do sistema.'><form className='card formGrid' onSubmit={save}>{Object.entries({name:'Nome',legal_name:'Razão social',tax_id:'CNPJ/CPF',state_code:'UF',city:'Cidade'}).map(([k,l])=><label key={k}><span>{l}</span><input value={(f as any)[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}<div className='formAction'><button className='blueBtn'><Save size={15}/>Salvar empresa</button></div></form></ModuleShell>
}

export function UsersModule({companyId}:{companyId:string}){
 const[rows,setRows]=useState<any[]>([]),[email,setEmail]=useState(''),[role,setRole]=useState('visualizacao'),[busy,setBusy]=useState(false);
 useEffect(()=>{load()},[companyId]);
 async function load(){const{data:m}=await supabase.from('memberships').select('*').eq('company_id',companyId);const ids=(m||[]).map(x=>x.user_id);const{data:p}=ids.length?await supabase.from('profiles').select('id,full_name,job_title,status').in('id',ids):{data:[] as any[]};setRows((m||[]).map(x=>({...x,profile:(p||[]).find(y=>y.id===x.user_id)})))}
 async function invite(e:any){e.preventDefault();setBusy(true);const{data,error}=await supabase.functions.invoke('invite-company-user',{body:{company_id:companyId,email,role}});setBusy(false);if(error)return alert(error.message);if(!data?.ok)return alert(data?.error||'Falha ao convidar usuário.');alert('Convite enviado.');setEmail('');setRole('visualizacao');load()}
 return <ModuleShell title='Usuários' subtitle='Usuários vinculados à empresa e seus níveis de acesso.'>
  <form className='card inlineForm' onSubmit={invite}><b>Convidar usuário</b><input type='email' placeholder='email@empresa.com' value={email} onChange={e=>setEmail(e.target.value)} required/><select value={role} onChange={e=>setRole(e.target.value)}><option value='admin'>Administrador</option><option value='contador'>Contador</option><option value='financeiro'>Financeiro</option><option value='comercial'>Comercial</option><option value='visualizacao'>Visualização</option></select><button className='blueBtn' disabled={busy}><Plus size={15}/>{busy?'Enviando...':'Convidar'}</button></form>
  <Table headers={['Usuário','Função','Status']} rows={rows.map(r=>[r.profile?.full_name||r.user_id,r.role,r.profile?.status||'active'])}/>
 </ModuleShell>
}

export function SettingsModule({company}:{company:any}){
 const current=company?.settings||{};
 const[f,setF]=useState({default_profit_pct:num(current.default_profit_pct||20),default_expected_units:num(current.default_expected_units||100),simple_mode:current.simple_mode!==false});
 async function save(e:any){e.preventDefault();const{error}=await supabase.from('companies').update({settings:{...current,...f}}).eq('id',company.id);alert(error?error.message:'Configurações salvas.')}
 return <ModuleShell title='Configurações' subtitle='Preferências simples para reduzir o número de campos no dia a dia.'><form className='card formGrid' onSubmit={save}><label><span>Lucro desejado padrão (%)</span><input type='number' step='.01' value={f.default_profit_pct} onChange={e=>setF({...f,default_profit_pct:num(e.target.value)})}/></label><label><span>Quantidade mensal padrão</span><input type='number' value={f.default_expected_units} onChange={e=>setF({...f,default_expected_units:num(e.target.value)})}/></label><label className='checkLabel'><input type='checkbox' checked={f.simple_mode} onChange={e=>setF({...f,simple_mode:e.target.checked})}/> Usar modo simples como padrão</label><div className='formAction'><button className='blueBtn'><Save size={15}/>Salvar preferências</button></div></form></ModuleShell>
}

function ModuleShell({title,subtitle,children}:{title:string;subtitle:string;children:any}){return <><div className='hero'><div><span>MÓDULO OPERACIONAL</span><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</>}
function Mini({title,value}:{title:string;value:string}){return <div className='card kpi'><div><span>{title}</span><strong>{value}</strong></div></div>}
function Table({headers,rows}:{headers:string[];rows:any[][]}){return <div className='card tableCard'><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length}>Nenhum registro ainda.</td></tr>}</tbody></table></div>}
