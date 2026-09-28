'use client';

type Props={
  priceResult:any;
  taxPct:number;
  cardPct:number;
  commissionPct:number;
  otherFeesPct:number;
  directCost:number;
  lossPct:number;
  production:number;
  fixedTotal:number;
  targetMonthlyProfit:number;
};

const n=(v:any)=>Number(v||0);
const brl=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function PricingMetrics({
  priceResult,taxPct,cardPct,commissionPct,otherFeesPct,directCost,lossPct,
  production,fixedTotal,targetMonthlyProfit
}:Props){
  if(!priceResult?.ok)return null;

  const price=n(priceResult.recommended_price);
  const lossRate=Math.max(0,Math.min(99.999,n(lossPct)))/100;
  const adjustedDirect=n(priceResult.adjusted_direct_cost)||(lossRate>0?n(directCost)/(1-lossRate):n(directCost));
  const fixedPerUnit=n(priceResult.fixed_cost_per_unit)||(production>0?n(fixedTotal)/n(production):0);
  const variablePct=n(taxPct)+n(cardPct)+n(commissionPct)+n(otherFeesPct);
  const variableSaleCosts=price*(variablePct/100);

  const contribution=n(priceResult.contribution_margin_unit)||(price-adjustedDirect-variableSaleCosts);
  const contributionPct=n(priceResult.contribution_margin_pct)||(price>0?(contribution/price)*100:0);

  const operatingProfit=price-adjustedDirect-variableSaleCosts-fixedPerUnit;
  const operatingProfitPct=price>0?(operatingProfit/price)*100:0;
  const grossMarginPct=price>0?((price-adjustedDirect)/price)*100:0;
  const markupBase=adjustedDirect+fixedPerUnit;
  const markup=markupBase>0?price/markupBase:0;

  const minimumPrice=n(priceResult.minimum_price);
  const maxDiscountPct=price>0?Math.max(0,((price-minimumPrice)/price)*100):0;

  const breakEvenRevenue=contributionPct>0?n(fixedTotal)/(contributionPct/100):0;
  const breakEvenUnits=contribution>0?n(fixedTotal)/contribution:0;
  const targetRevenue=contributionPct>0?(n(fixedTotal)+n(targetMonthlyProfit))/(contributionPct/100):0;

  const projectedRevenue=price*Math.max(0,n(production));
  const projectedOperatingResult=(contribution*Math.max(0,n(production)))-n(fixedTotal);
  const marginSafetyPct=projectedRevenue>0?((projectedRevenue-breakEvenRevenue)/projectedRevenue)*100:0;

  return <div className='resultMiniGrid'>
    <div><span>Despesas variáveis por unidade</span><b>{brl(variableSaleCosts)}</b><small>{variablePct.toFixed(2)}% sobre o preço de venda.</small></div>
    <div><span>Margem bruta</span><b>{grossMarginPct.toFixed(2)}%</b><small>Preço menos custo direto ajustado.</small></div>
    <div><span>Markup operacional</span><b>{markup.toFixed(4)}x</b><small>Preço ÷ (custo ajustado + fixo unitário).</small></div>
    <div><span>Lucro operacional por unidade</span><b>{brl(operatingProfit)}</b><small>{operatingProfitPct.toFixed(2)}% do preço de venda.</small></div>
    <div><span>Desconto máximo</span><b>{maxDiscountPct.toFixed(2)}%</b><small>Limite até o preço mínimo calculado.</small></div>
    <div><span>Ponto de equilíbrio em faturamento</span><b>{brl(breakEvenRevenue)}</b><small>Custos fixos ÷ margem de contribuição %.</small></div>
    <div><span>Ponto de equilíbrio em unidades</span><b>{breakEvenUnits.toFixed(0)}</b><small>Custos fixos ÷ contribuição unitária.</small></div>
    <div><span>Faturamento para a meta</span><b>{brl(targetRevenue)}</b><small>(Custos fixos + lucro mensal desejado) ÷ MC%.</small></div>
    <div><span>Faturamento projetado</span><b>{brl(projectedRevenue)}</b><small>Preço recomendado × produção mensal estimada.</small></div>
    <div><span>Resultado operacional projetado</span><b>{brl(projectedOperatingResult)}</b><small>Contribuição total menos custos fixos.</small></div>
    <div><span>Margem de segurança</span><b>{marginSafetyPct.toFixed(2)}%</b><small>Folga do faturamento projetado acima do equilíbrio.</small></div>
    <div><span>Custo total gerencial unitário</span><b>{brl(adjustedDirect+fixedPerUnit)}</b><small>Custo direto ajustado + rateio fixo por unidade.</small></div>
  </div>;
}
