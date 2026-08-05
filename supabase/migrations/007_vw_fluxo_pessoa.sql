-- Same shape as vw_fluxo_obra (004), grouping fluxo_caixa by Pessoa instead
-- of Obra. Unlike saldo_contas, fluxo_caixa rows are individual movements,
-- not point-in-time balance snapshots, so summing across all rows per
-- Pessoa is correct here -- no "latest only" filtering needed.
create or replace view public.vw_fluxo_pessoa with (security_invoker = true) as
select "Pessoa" as pessoa,
       sum(coalesce("Receber",0)) as receber,
       sum(coalesce("Pagar",0)) as pagar,
       sum(coalesce("Receber",0)) - sum(coalesce("Pagar",0)) as saldo
from public.fluxo_caixa
where "Pessoa" is not null
group by "Pessoa";
