-- Per-account detail behind vw_bancos (which only shows the total per bank
-- name). Same "latest snapshot per Conta_sdcc" logic as the vw_bancos fix in
-- 005, so the sum here matches vw_bancos exactly -- just broken out by
-- account, with the date each balance was last recorded.
-- Calculado_sdcc is deliberately excluded: sampling showed it holds 0/1
-- values, not a monetary figure, despite the name.
create or replace view public.vw_bancos_detalhado with (security_invoker = true) as
select s."Descri_banco" as banco,
       s."Conta_sdcc" as conta,
       s."Saldo_sdcc" as saldo,
       s."Data_sdcc" as data_saldo
from (
  select distinct on ("Conta_sdcc") *
  from saldo_contas
  order by "Conta_sdcc", "Data_sdcc" desc
) s
order by s."Descri_banco", s."Saldo_sdcc" desc;
