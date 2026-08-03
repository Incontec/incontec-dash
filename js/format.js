function rand(min, max) { return Math.random() * (max - min) + min; }

const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtM = v => `${(v / 1e6).toFixed(1)}M`;
const fmtK = v => `${(v / 1e3).toFixed(0)}k`;

// Same as fmtBRL, but wraps negative values in red — for spots where a
// value can legitimately go negative (balances, saldo atual) and that
// shouldn't be visually indistinguishable from a normal positive amount.
const fmtBRLSigned = v => (v < 0 ? `<span style="color:#E38C8C">${fmtBRL(v)}</span>` : fmtBRL(v));
