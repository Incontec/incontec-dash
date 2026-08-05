-- Aggregates the raw fluxo_caixa table (17k+ rows) by Obra, so the dashboard
-- can show cash flow per construction site without paginating the raw table
-- client-side just to sum it in JS.
create view public.vw_fluxo_obra with (security_invoker = true) as
select "Obra" as obra,
       sum(coalesce("Receber",0)) as receber,
       sum(coalesce("Pagar",0)) as pagar,
       sum(coalesce("Receber",0)) - sum(coalesce("Pagar",0)) as saldo
from public.fluxo_caixa
where "Obra" is not null
group by "Obra";
