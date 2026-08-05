-- fluxo_caixa.Pagar is stored as a non-positive number (money out is
-- already negative -- confirmed 0 positive rows out of 8540, min -4.37M,
-- max 0.00) and Receber is always >= 0. vw_fluxo_obra (004) and
-- vw_fluxo_pessoa (007) both computed saldo as "receber - pagar", which
-- subtracts an already-negative number and so ADDS the two magnitudes
-- together instead of netting them -- saldo came out positive for every
-- row regardless of how much was actually spent (e.g. obra 01MOF: R$0
-- receber, -R$42.177.882,19 pagar, was showing saldo of +R$42.177.882,19).
-- Fix: add receber+pagar instead of subtracting. After the fix, 95 of 119
-- obras have a negative saldo (vs. 0 before), which matches a normal mix
-- of obras still in the spending phase and obras that have sold through.
create or replace view public.vw_fluxo_obra with (security_invoker = true) as
select "Obra" as obra,
       sum(coalesce("Receber",0)) as receber,
       sum(coalesce("Pagar",0)) as pagar,
       sum(coalesce("Receber",0)) + sum(coalesce("Pagar",0)) as saldo
from public.fluxo_caixa
where "Obra" is not null
group by "Obra";

create or replace view public.vw_fluxo_pessoa with (security_invoker = true) as
select "Pessoa" as pessoa,
       sum(coalesce("Receber",0)) as receber,
       sum(coalesce("Pagar",0)) as pagar,
       sum(coalesce("Receber",0)) + sum(coalesce("Pagar",0)) as saldo
from public.fluxo_caixa
where "Pessoa" is not null
group by "Pessoa";
