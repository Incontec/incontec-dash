function rand(min, max) { return Math.random() * (max - min) + min; }

const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtM = v => `${(v / 1e6).toFixed(1)}M`;
const fmtK = v => `${(v / 1e3).toFixed(0)}k`;

// Same as fmtBRL, but colors by sign — red when negative, green when
// positive — for spots where a value is a genuine balance (saldo,
// saldo atual, valor vendido) and the sign itself is the signal.
const fmtBRLSigned = v => `<span style="color:${v < 0 ? '#E38C8C' : 'var(--accent)'}">${fmtBRL(v)}</span>`;

// Always red, regardless of sign — for amounts that are inherently a
// receivable/overdue (money not yet in hand), where the color signals
// "still owed to you" rather than "this happens to be negative".
const fmtBRLRed = v => `<span style="color:#E38C8C">${fmtBRL(v)}</span>`;
