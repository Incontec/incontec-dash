-- vw_bancos was summing every historical row in saldo_contas grouped by
-- Descri_banco. saldo_contas is actually a time series (the same Conta_sdcc
-- reappears at multiple Data_sdcc snapshots, sometimes under a different
-- Descri_banco as accounts got renamed over time), so summing everything
-- added years of snapshots together instead of showing the current balance.
-- Measured impact: saldo consolidado went from -R$298.305.435,62 (wrong,
-- summing ~3 years of snapshots) to R$50.019.108,39 (correct, latest
-- snapshot per Conta_sdcc). No real account is dropped by this change --
-- verified 0 rows with a null Conta_sdcc, and every account still
-- contributes its most recent balance under its most recent bank label.
create or replace view public.vw_bancos with (security_invoker = true) as
select s."Descri_banco",
       sum(s."Saldo_sdcc") as saldo
from (
  select distinct on ("Conta_sdcc") *
  from saldo_contas
  order by "Conta_sdcc", "Data_sdcc" desc
) s
group by s."Descri_banco"
order by sum(s."Saldo_sdcc") desc;
