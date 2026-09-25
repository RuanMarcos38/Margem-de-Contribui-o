# Margem de Contribuição

SaaS de precificação, custos, margem de contribuição, DRE e análise tributária para empresas brasileiras.

## Recursos
- Dashboard financeiro responsivo
- Motor de precificação com memória de cálculo
- Margem de contribuição, lucro, markup, preço mínimo e desconto máximo
- Ponto de equilíbrio e DRE gerencial
- Regimes tributários parametrizáveis: MEI, Simples Nacional, Lucro Presumido, Lucro Real e Lucro Arbitrado
- Transição IBS/CBS 2026-2033 preparada por vigência
- Simulador de copos e brindes personalizados
- API backend POST /api/calculate

## Observação fiscal
CNAE, NCM, UF, município, substituição tributária, monofásico, retenções e benefícios fiscais podem alterar a tributação. Valide os parâmetros com a contabilidade antes de uso fiscal.


## Backend Supabase
O frontend usa as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
O banco é multiempresa, usa RLS e possui onboarding por RPC para criar empresa + administrador de forma atômica.

## Segurança
As tabelas tributárias compartilhadas são somente leitura para usuários autenticados. Dados operacionais são isolados por `company_id`.
