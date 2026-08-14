const TP = { backgroundColor:'#141C17', borderColor:'#1E2823', borderWidth:1, titleColor:'#EAF2ED', bodyColor:'#EAF2ED', cornerRadius:8, padding:10 };
const charts = {};

function initChartDefaults() {
  Chart.defaults.color = '#7E9389';
  Chart.defaults.font.family = "'Inter',sans-serif";
  Chart.defaults.font.size = 11;
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// Dashboard: evolução mensal (área) + saldo por banco (barra/rosca, top 8/6 —
// with 124 bancos, plotting all of them makes labels unreadable and crushes
// the bar/slice scale down to the handful of outliers, so both are capped to
// the banks that actually matter and the rest are folded into "Outros".
function renderDashboardCharts(state) {
  const { fluxoMensal, bancos, bancoStats } = state;
  const mensalLabels = fluxoMensal.map(m => MES_LABEL[m.MonthNumber - 1] || m.MonthNumber);
  const mensalEntradas = fluxoMensal.map(m => m.receber);
  const mensalSaidas = fluxoMensal.map(m => Math.abs(m.pagar));

  const bancosPorSaldo = [...bancos].sort((a, b) => b.saldo - a.saldo);
  const topBar = bancosPorSaldo.slice(0, 8);

  // Negative-saldo accounts (overdraft/factoring) can't be netted into a
  // single "Outros" slice with positive ones -- a few dozen accounts here
  // sum to a large negative number that would swamp the real, positive
  // "Outros" balance and make the slice's size meaningless. A donut is a
  // share-of-holdings view, so it only makes sense over positive balances,
  // same reasoning computeBancoStats already applies to "concentração".
  const bancosPositivos = bancosPorSaldo.filter(b => b.saldo > 0);
  const TOP_N_DONUT = 6;
  const topDonut = bancosPositivos.slice(0, TOP_N_DONUT);
  const outrosSaldo = bancosPositivos.slice(TOP_N_DONUT).reduce((s, b) => s + b.saldo, 0);
  const temOutros = bancosPositivos.length > TOP_N_DONUT;
  const donutLabels = topDonut.map(b => b.Descri_banco).concat(temOutros ? [`Outros (${bancosPositivos.length - TOP_N_DONUT})`] : []);
  const donutValues = topDonut.map(b => b.saldo).concat(temOutros ? [outrosSaldo] : []);
  const donutCores = topDonut.map(b => colorForBank(b.Descri_banco)).concat(temOutros ? ['#4A5952'] : []);

  destroyChart('mensal'); destroyChart('bar'); destroyChart('pie');

  // Grouped bars, not a "saldo" line -- a running balance here would be the
  // internal fluxo_caixa ledger's cumulative total (it resets to zero on
  // 2026-01-01, see vw_fluxo_mensal), which has no relation to the actual
  // bank balance shown in "Saldo Consolidado" above it. Entradas x Saídas
  // per month is real activity that can't be misread as a bank balance.
  charts.mensal = new Chart(document.getElementById('lineChart'),{
    type:'bar', data:{ labels:mensalLabels, datasets:[
      { label:'Entradas', data:mensalEntradas, backgroundColor:'#6FE3A6', borderRadius:4 },
      { label:'Saídas', data:mensalSaidas, backgroundColor:'#E38C8C', borderRadius:4 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:true, position:'top', align:'end', labels:{color:'#7E9389', boxWidth:10, font:{size:11}}}, tooltip:{...TP, callbacks:{label:c=>`${c.dataset.label}: ${fmtBRL(c.raw)}`}} },
      scales:{ x:{grid:{display:false}, border:{display:false}}, y:{grid:{color:'#1E2823', drawTicks:false}, border:{display:false}, ticks:{callback:fmtM}} } }
  });
  charts.bar = new Chart(document.getElementById('barChart'),{
    type:'bar', data:{ labels:topBar.map(b=>b.Descri_banco), datasets:[{ data:topBar.map(b=>b.saldo), backgroundColor:topBar.map(b=>colorForBank(b.Descri_banco)), borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...TP, callbacks:{label:c=>fmtBRL(c.raw)}} },
      scales:{ x:{grid:{color:'#1E2823', drawTicks:false}, border:{display:false}, ticks:{callback:fmtK}}, y:{grid:{display:false}, border:{display:false}} } }
  });
  charts.pie = new Chart(document.getElementById('pieChart'),{
    type:'doughnut', data:{ labels:donutLabels, datasets:[{ data:donutValues, backgroundColor:donutCores, borderWidth:0, hoverOffset:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{display:true, position:'right', labels:{color:'#7E9389', font:{size:11}, padding:12,
        generateLabels: chart => chart.data.labels.map((label, i) => {
          const value = chart.data.datasets[0].data[i];
          const pct = bancoStats.totalPositivo ? Math.round(Math.max(value,0) / bancoStats.totalPositivo * 100) : 0;
          return { text:`${label} (${pct}%)`, fillStyle:chart.data.datasets[0].backgroundColor[i], fontColor:'#7E9389', strokeStyle:'transparent', index:i };
        }) } },
        tooltip:{...TP, callbacks:{label:c=>fmtBRL(c.raw)}} } }
  });
}

function renderBancosChart(state) {
  const { bancos } = state;
  destroyChart('bancos');
  charts.bancos = new Chart(document.getElementById('bancosChart'),{
    type:'bar', data:{ labels:bancos.map(b=>b.Descri_banco), datasets:[{ data:bancos.map(b=>b.saldo), backgroundColor:bancos.map(b=>colorForBank(b.Descri_banco)), borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...TP, callbacks:{label:c=>fmtBRL(c.raw)}} },
      scales:{ x:{grid:{display:false}, border:{display:false}}, y:{grid:{color:'#1E2823', drawTicks:false}, border:{display:false}, ticks:{callback:fmtK}} } }
  });
}
