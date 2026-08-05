-- Tracks token usage per call to the AI assistant, so cost can be broken
-- down by organization instead of relying only on the aggregate spend shown
-- in the Anthropic Console.
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id),
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_log enable row level security;

create policy "ai_usage_log_select_own_org" on public.ai_usage_log for select to authenticated
  using (organizacao_id = (select organizacao_id from public.profiles where id = auth.uid()));

-- Inserts come from n8n via the service_role key (bypasses RLS), same as
-- the other sync workflows -- no insert policy needed for authenticated users.
