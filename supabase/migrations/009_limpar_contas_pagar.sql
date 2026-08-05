-- Matches the existing limpar_fluxo_caixa / limpar_resumo_vendas /
-- limpar_saldo_contas pattern used by the "Projeto Final - Visconde" sync
-- workflow: a scheduled trigger calls this via rpc/limpar_contas_pagar to
-- truncate the table right before the ERP sync repopulates it.
create or replace function public.limpar_contas_pagar()
returns void
language sql
security definer
as $function$
truncate table contas_pagar restart identity;
$function$;
