const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios (veja .env.example)."
  );
}

// PostgREST cap a single response at 1000 rows -- same limit the dashboard's
// own fetchView() (js/supabase-client.js) works around, so a filtered tool
// call that still matches a lot of rows doesn't get silently truncated.
const PAGE_SIZE = 1000;

// filters: array of [column, "eq"|"gte"|"lte"|"ilike"|..., value]. Column
// names that contain spaces or capitals (e.g. resumo_vendas' "Data Venda")
// must be passed exactly as they exist in Postgres -- PostgREST matches
// them verbatim in the querystring, no extra quoting needed there.
export async function fetchFromSupabase(table, { select = "*", filters = [], order, limit } = {}) {
  const base = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  base.searchParams.set("select", select);
  for (const [column, op, value] of filters) {
    base.searchParams.append(column, `${op}.${value}`);
  }
  if (order) base.searchParams.set("order", order);

  let from = 0;
  const all = [];
  while (true) {
    const to = limit ? Math.min(from + PAGE_SIZE - 1, limit - 1) : from + PAGE_SIZE - 1;
    const res = await fetch(base, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${from}-${to}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase respondeu ${res.status} ao consultar ${table}: ${await res.text()}`);
    }
    const page = await res.json();
    all.push(...page);
    if (page.length < to - from + 1) break; // last page was short -> done
    if (limit && all.length >= limit) break;
    from = to + 1;
  }
  return limit ? all.slice(0, limit) : all;
}
