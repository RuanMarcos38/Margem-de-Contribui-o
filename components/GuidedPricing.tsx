'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,Calculator,CheckCircle2,Factory,LineChart,Package,Plus,ReceiptText,Save,Trash2,TriangleAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';

const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const n=(v:any)=>Number(v||0);
const tabs=[
  {id:1,label:'Manual',icon:BookOpen},
  {id:2,label:'Parâmetros',icon:ReceiptText},
  {id:3,label:'Custos Fixos',icon:Factory},
  {id:4,label:'Custos Diretos',icon:Package},
  {id:5,label:'Precificação',icon:Calculator},
  {id:6,label:'Resultado do Mês',icon:LineChart},
];

export default function GuidedPricing({companyId,userId}:{companyId:string;userId:string}){
 const[step,setStep]=useState(1);
 const[params,setParams]=useState({taxPct:0,cardPct:0,commissionPct:0,otherFeesPct:0,lossPct:0,targetMarginPct:20,rbt12:0});
 const[fixed,setFixed]=useState<any[]>([]);
 const[products,setProducts]=useState<any[]>([]);
 const[selectedProduct,setSelectedProduct]=useState('');
 const[components,setComponents]=useState<any[]>([]);
 const[componentForm,setComponentForm]=useState({name:'',quantity:1,unit_cost:0,waste_pct:0});
 const[production,setProduction]=useState(100);
 const[priceResult,setPriceResult]=useState<any>(null);
 const[monthQty,setMonthQty]=useState<Record<string,number>>({});
 const[monthResult,setMonthResult]=useState<any>(null);
 const[monthRef,setMonthRef]=useState(()=>new Date().toISOString().slice(0,7));
 const[busy,setBusy]=useState(false);
 const[fixedForm,setFixedForm]=useState({name:'',monthly_amount:0});

 useEffect(()=>{loadAll()},[companyId]);
 useEffect(()=>{if(selectedProduct)loadComponents(selectedProduct);else setComponents([])},[selectedProduct]);

 async function loadAll(){
   const [{data:p},{data:f},{data:pp},{data:company}]=await Promise.all([
     supabase.from('products').select('*').eq('company_id',companyId).is('deleted_at',null).order('created_at'),
     supabase.from('fixed_costs').select('*').eq('company_id',companyId).is('deleted_at',null).order('created_at'),
     supabase.from('pricing_parameters').select('*').eq('company_id',companyId).eq('active',true).limit(1),
     supabase.from('companies').select('settings').eq('id',companyId).single()
   ]);
   setProducts(p||[]); setFixed(f||[]);
   const x=pp?.[0];
   if(x)setParams({taxPct:n(x.tax_pct),cardPct:n(x.card_pct),commissionPct:n(x.commission_pct),otherFeesPct:n(x.other_fees_pct),lossPct:n(x.loss_pct),targetMarginPct:n(x.target_margin_pct),rbt12:n(x.metadata?.rbt12)});
   else setParams(q=>({...q,targetMarginPct:n(company?.settings?.default_profit_pct)||20}));
   if((p||[]).length&&!selectedProduct)setSelectedProduct((p||[])[0].id);
 }

 async function loadComponents(productId:string){
   const{data}=await supabase.from('product_components').select('*').eq('company_id',companyId).eq('product_id',productId).is('deleted_at',null).order('created_at');
   setComponents(data||[]);
 }

 const fixedTotal=useMemo(()=>fixed.reduce((s,x)=>s+n(x.monthly_amount),0),[fixed]);
 const directCost=useMemo(()=>components.reduce((s,x)=>s+(n(x.quantity)*n(x.unit_cost)),0),[components]);
 const selected=products.find(x=>x.id===selectedProduct);

 async function calcSimpleAnnexII(){
   if(params.rbt12<=0)return alert('Informe o RBT12.');
   const{data,error}=await supabase.rpc('get_simple_effective_rate',{p_annex:'II',p_rbt12:params.rbt12,p_factor_r:null,p_reference_date:new Date().toISOString().slice(0,10)});
   if(error)return alert(error.message);
   if(!data?.ok)return alert(data?.error||'Não foi possível calcular.');
   setParams(x=>({...x,taxPct:n(data.effective_rate_pct)}));
   alert('Alíquota efetiva do Anexo II calculada: '+n(data.effective_rate_pct).toFixed(4)+'%');
 }

 async function saveParams(){
   const payload={company_id:companyId,name:'Padrão',tax_pct:params.taxPct,card_pct:params.cardPct,commission_pct:params.commissionPct,other_fees_pct:params.otherFeesPct,loss_pct:params.lossPct,target_margin_pct:params.targetMarginPct,active:true,metadata:{rbt12:params.rbt12}};
   const{data:existing}=await supabase.from('pricing_parameters').select('id').eq('company_id',companyId).eq('active',true).limit(1).maybeSingle();
   const{error}=existing?.id?await supabase.from('pricing_parameters').update(payload).eq('id',existing.id):await supabase.from('pricing_parameters').insert(payload);
   alert(error?error.message:'Parâmetros salvos.');
 }

 async function addFixed(e:any){e.preventDefault();const{error}=await supabase.from('fixed_costs').insert({company_id:companyId,name:fixedForm.name,monthly_amount:n(fixedForm.monthly_amount)});if(error)return alert(error.message);setFixedForm({name:'',monthly_amount:0});loadAll()}
 async function deleteFixed(id:string){await supabase.from('fixed_costs').update({deleted_at:new Date().toISOString()}).eq('id',id);loadAll()}

 async function addComponent(e:any){
   e.preventDefault(); if(!selectedProduct)return alert('Selecione um produto.');
   const{error}=await supabase.from('product_components').insert({company_id:companyId,product_id:selectedProduct,name:componentForm.name,component_type:'direct',quantity:n(componentForm.quantity),unit_cost:n(componentForm.unit_cost),waste_pct:n(componentForm.waste_pct)});
   if(error)return alert(error.message);
   setComponentForm({name:'',quantity:1,unit_cost:0,waste_pct:0});loadComponents(selectedProduct);
 }
 async function deleteComponent(id:string){await supabase.from('product_components').update({deleted_at:new Date().toISOString()}).eq('id',id);loadComponents(selectedProduct)}

 async function calculatePrice(){
   if(!selectedProduct)return alert('Selecione um produto.');
   if(!components.length && n(selected?.base_cost)<=0)return alert('Cadastre ao menos um custo direto ou custo-base do produto.');
   setBusy(true);
   const base=directCost>0?directCost:n(selected?.base_cost);
   const{data,error}=await supabase.rpc('calculate_guided_price',{
     p_company_id:companyId,p_direct_cost:base,p_monthly_fixed_cost:fixedTotal,p_expected_units:production,
     p_tax_pct:params.taxPct,p_card_pct:params.cardPct,p_commission_pct:params.commissionPct,
     p_other_fees_pct:params.otherFeesPct,p_loss_pct:params.lossPct,p_target_margin_pct:params.targetMarginPct
   });
   setBusy(false); if(error)return alert(error.message); setPriceResult(data);
 }

 async function savePrice(){
   if(!priceResult?.ok)return;
   const input_data={mode:'guided-6-steps',product_id:selectedProduct,production,params,direct_cost:directCost||n(selected?.base_cost),fixed_total:fixedTotal};
   const{data:s,error}=await supabase.from('pricing_scenarios').insert({company_id:companyId,product_id:selectedProduct,name:'Guiado '+(selected?.name||'Produto')+' '+new Date().toLocaleString('pt-BR'),input_data,created_by:userId}).select().single();
   if(error)return alert(error.message);
   const{error:e2}=await supabase.from('pricing_results').insert({company_id:companyId,scenario_id:s.id,result_data:priceResult,calculation_memory:['Método divisor','Perdas por rendimento: custo/(1-perda)','Rateio fixo: custos fixos/produção mensal estimada'],engine_version:'guided-1.0.0'});
   if(!e2)await supabase.from('products').update({sale_price:priceResult.recommended_price}).eq('id',selectedProduct);
   alert(e2?e2.message:'Preço salvo no produto.');
   loadAll();
 }

 async function calculateMonth(){
   const items=products.map(p=>({quantity:n(monthQty[p.id]),unit_price:n(p.sale_price),unit_variable_cost:n(p.base_cost),tax_pct:params.taxPct,fees_pct:params.cardPct+params.commissionPct+params.otherFeesPct})).filter(x=>x.quantity>0);
   if(!items.length)return alert('Informe ao menos uma quantidade vendida.');
   const{data,error}=await supabase.rpc('calculate_month_result',{p_company_id:companyId,p_monthly_fixed_cost:fixedTotal,p_items:items});
   if(error)return alert(error.message); setMonthResult(data);
 }
 async function saveMonth(){
   if(!monthResult?.ok)return;
   const date=monthRef+'-01';
   const input_data={quantities:monthQty,params};
   const{error}=await supabase.from('monthly_results').upsert({company_id:companyId,reference_month:date,input_data,result_data:monthResult,created_by:userId},{onConflict:'company_id,reference_month'});
   alert(error?error.message:'Resultado mensal salvo.');
 }

 return <div className='guidedWrap'>
   <div className='guidedIntro'>
     <div><span className='eyebrow'>MODO GUIADO</span><h2>Precificação em 6 etapas</h2><p>Preencha somente os campos destacados. O restante é calculado pelo backend.</p></div>
     <div className='simpleBadge'><ShieldCheckIcon/> motor determinístico</div>
   </div>
   <div className='guidedTabs'>{tabs.map(t=>{const Icon=t.icon;return <button key={t.id} className={step===t.id?'guidedTab active':'guidedTab'} onClick={()=>setStep(t.id)}><span>{t.id}</span><Icon size={15}/><b>{t.label}</b></button>})}</div>

   {step===1&&<div className='card guidedPanel'>
     <h3>Manual rápido</h3>
     <div className='manualGrid'>
      <div><b>1. Parâmetros</b><p>Defina imposto, cartão, comissão, margem e perda.</p></div>
      <div><b>2. Custos fixos</b><p>Cadastre despesas mensais e produção estimada.</p></div>
      <div><b>3. Custos diretos</b><p>Monte a ficha técnica de cada produto.</p></div>
      <div><b>4. Precificação</b><p>O sistema aplica o método divisor e mostra o preço mínimo/recomendado.</p></div>
      <div><b>5. Resultado mensal</b><p>Informe o que vendeu e veja se fechou positivo ou negativo.</p></div>
      <div><b>Regra de segurança</b><p>Não trate resultado fiscal como validado se os dados tributários estiverem incompletos.</p></div>
     </div>
     <button className='blueBtn' onClick={()=>setStep(2)}>Começar</button>
   </div>}

   {step===2&&<div className='card guidedPanel'>
     <div className='cardTitle'><div><b>Parâmetros</b><span>Somente estes campos precisam ser informados.</span></div><button className='secondaryBtn' onClick={saveParams}><Save size={15}/>Salvar</button></div>
     <div className='simpleGrid'>
       <label className='userInput'><span>RBT12 — faturamento 12 meses</span><input type='number' step='.01' value={params.rbt12} onChange={e=>setParams({...params,rbt12:n(e.target.value)})}/><small>Para indústria no Simples, use a calculadora do Anexo II.</small></label>
       <label className='userInput'><span>Imposto efetivo (%)</span><input type='number' step='.0001' value={params.taxPct} onChange={e=>setParams({...params,taxPct:n(e.target.value)})}/><small>Não chute: use o perfil fiscal ou calculadora.</small></label>
       <label className='userInput'><span>Taxa cartão (%)</span><input type='number' step='.01' value={params.cardPct} onChange={e=>setParams({...params,cardPct:n(e.target.value)})}/></label>
       <label className='userInput'><span>Comissão (%)</span><input type='number' step='.01' value={params.commissionPct} onChange={e=>setParams({...params,commissionPct:n(e.target.value)})}/></label>
       <label className='userInput'><span>Outras taxas (%)</span><input type='number' step='.01' value={params.otherFeesPct} onChange={e=>setParams({...params,otherFeesPct:n(e.target.value)})}/></label>
       <label className='userInput'><span>Perda de produção (%)</span><input type='number' step='.01' value={params.lossPct} onChange={e=>setParams({...params,lossPct:n(e.target.value)})}/><small>Calculada por rendimento: custo ÷ (1 − perda).</small></label>
       <label className='userInput'><span>Margem desejada (%)</span><input type='number' step='.01' value={params.targetMarginPct} onChange={e=>setParams({...params,targetMarginPct:n(e.target.value)})}/></label>
     </div>
     <div className='simpleActions'><button className='blueBtn' onClick={calcSimpleAnnexII}><Calculator size={15}/>Calcular Simples — Anexo II</button><button className='secondaryBtn' onClick={()=>setStep(3)}>Próximo</button></div>
   </div>}

   {step===3&&<div className='card guidedPanel'>
     <div className='cardTitle'><div><b>Custos Fixos</b><span>Total atual: {brl(fixedTotal)}</span></div></div>
     <form className='guidedInline' onSubmit={addFixed}><input className='userInputField' placeholder='Ex.: aluguel' value={fixedForm.name} onChange={e=>setFixedForm({...fixedForm,name:e.target.value})} required/><input className='userInputField' type='number' step='.01' placeholder='Valor mensal' value={fixedForm.monthly_amount} onChange={e=>setFixedForm({...fixedForm,monthly_amount:n(e.target.value)})}/><button className='blueBtn'><Plus size={15}/>Adicionar</button></form>
     <div className='tableCard'><table><thead><tr><th>Despesa</th><th>Mensal</th><th></th></tr></thead><tbody>{fixed.map(x=><tr key={x.id}><td>{x.name}</td><td>{brl(x.monthly_amount)}</td><td><button className='dangerIcon' onClick={()=>deleteFixed(x.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
     <div className='simpleGrid oneRow'><label className='userInput'><span>Produção mensal estimada</span><input type='number' value={production} onChange={e=>setProduction(n(e.target.value))}/><small>Rateio atual: {brl(production>0?fixedTotal/production:0)} por unidade.</small></label></div>
     <button className='secondaryBtn' onClick={()=>setStep(4)}>Próximo</button>
   </div>}

   {step===4&&<div className='card guidedPanel'>
     <div className='cardTitle'><div><b>Custos Diretos — ficha técnica</b><span>Matéria-prima, tampa, adesivo, embalagem, mão de obra direta etc.</span></div></div>
     <label className='guidedSelect'><span>Produto</span><select value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)}><option value=''>Selecione</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     {!products.length&&<div className='simpleWarn'><TriangleAlert size={15}/>Cadastre primeiro um produto em “Produtos e Serviços”.</div>}
     <form className='guidedInline components' onSubmit={addComponent}>
       <input className='userInputField' placeholder='Componente / insumo' value={componentForm.name} onChange={e=>setComponentForm({...componentForm,name:e.target.value})} required/>
       <input className='userInputField' type='number' step='.0001' placeholder='Quantidade' value={componentForm.quantity} onChange={e=>setComponentForm({...componentForm,quantity:n(e.target.value)})}/>
       <input className='userInputField' type='number' step='.0001' placeholder='Custo unitário' value={componentForm.unit_cost} onChange={e=>setComponentForm({...componentForm,unit_cost:n(e.target.value)})}/>
       <button className='blueBtn'><Plus size={15}/>Adicionar</button>
     </form>
     <div className='tableCard'><table><thead><tr><th>Item</th><th>Qtd.</th><th>Custo unit.</th><th>Total</th><th></th></tr></thead><tbody>{components.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.quantity}</td><td>{brl(x.unit_cost)}</td><td>{brl(n(x.quantity)*n(x.unit_cost))}</td><td><button className='dangerIcon' onClick={()=>deleteComponent(x.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
     <div className='guidedTotal'>Custo direto calculado: <b>{brl(directCost||n(selected?.base_cost))}</b></div>
     <button className='secondaryBtn' onClick={()=>setStep(5)}>Próximo</button>
   </div>}

   {step===5&&<div className='card guidedPanel'>
     <div className='cardTitle'><div><b>Precificação — método do divisor</b><span>Produto: {selected?.name||'Nenhum selecionado'}</span></div></div>
     <div className='formulaBox'>Preço = (Custo direto ajustado + Fixo por unidade) ÷ [1 − (Imposto + Cartão + Comissão + Outras taxas + Margem)]</div>
     <button className='blueBtn' onClick={calculatePrice} disabled={busy}><Calculator size={15}/>{busy?'Calculando...':'Calcular preço'}</button>
     {priceResult&&(!priceResult.ok?<div className='simpleWarn'><TriangleAlert size={16}/>{priceResult.error}</div>:<div className='simpleResult'>
       <div className='resultHero'><span>PREÇO RECOMENDADO</span><strong>{brl(priceResult.recommended_price)}</strong><small>Status: {priceResult.status==='no_lucro'?'🟢 No lucro':priceResult.status==='abaixo_meta'?'🟡 Abaixo da meta':'🔴 Prejuízo'}</small></div>
       <div className='resultMiniGrid'>
         <div><span>Preço mínimo</span><b>{brl(priceResult.minimum_price)}</b><small>Sem lucro operacional.</small></div>
         <div><span>Custo direto ajustado</span><b>{brl(priceResult.adjusted_direct_cost)}</b><small>Já considera perda.</small></div>
         <div><span>Fixo por unidade</span><b>{brl(priceResult.fixed_cost_per_unit)}</b><small>Rateio pela produção estimada.</small></div>
         <div><span>Margem de contribuição</span><b>{priceResult.contribution_margin_pct}%</b><small>{brl(priceResult.contribution_margin_unit)} por unidade.</small></div>
       </div>
       <div className='simpleActions'><button className='secondaryBtn' onClick={savePrice}><Save size={15}/>Salvar preço</button><button className='blueBtn' onClick={()=>setStep(6)}>Ver resultado do mês</button></div>
     </div>)}
   </div>}

   {step===6&&<div className='card guidedPanel'>
     <div className='cardTitle'><div><b>Resultado do Mês</b><span>Informe quantas unidades vendeu de cada produto.</span></div><input className='monthInput' type='month' value={monthRef} onChange={e=>setMonthRef(e.target.value)}/></div>
     <div className='tableCard'><table><thead><tr><th>Produto</th><th>Preço atual</th><th>Custo-base</th><th>Unidades vendidas</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{brl(p.sale_price)}</td><td>{brl(p.base_cost)}</td><td><input className='qtyInput userInputField' type='number' min='0' value={monthQty[p.id]||0} onChange={e=>setMonthQty({...monthQty,[p.id]:n(e.target.value)})}/></td></tr>)}</tbody></table></div>
     <div className='simpleActions'><button className='blueBtn' onClick={calculateMonth}><Calculator size={15}/>Calcular resultado mensal</button>{monthResult?.ok&&<button className='secondaryBtn' onClick={saveMonth}><Save size={15}/>Salvar mês</button>}</div>
     {monthResult?.ok&&<div className='monthResult'>
       <div className={monthResult.status==='lucro'?'monthStatus profit':'monthStatus loss'}>{monthResult.status==='lucro'?'🟢 LUCRO':'🔴 PREJUÍZO'}<strong>{brl(monthResult.operating_result)}</strong></div>
       <div className='resultMiniGrid'>
         <div><span>Receita</span><b>{brl(monthResult.revenue)}</b></div>
         <div><span>Custos variáveis</span><b>{brl(monthResult.variable_costs)}</b></div>
         <div><span>Margem de contribuição</span><b>{brl(monthResult.contribution_margin)}</b><small>{monthResult.contribution_margin_pct}%</small></div>
         <div><span>Custos fixos</span><b>{brl(monthResult.fixed_costs)}</b></div>
         <div><span>Ponto de equilíbrio</span><b>{brl(monthResult.break_even_revenue||0)}</b><small>Faturamento do mix atual.</small></div>
       </div>
     </div>}
   </div>}
 </div>
}

function ShieldCheckIcon(){return <CheckCircle2 size={17}/>}
