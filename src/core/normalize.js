// /src/core/normalize.js

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const safeDiv = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
};

/**
 * raw can include:
 * {
 *   current: {...}, previous: {...},
 *   currency, period: {start,end,granularity},
 *   source, assumptions:[]
 * }
 */
function normalize(raw = {}) {
  const cur = raw.current || {};
  const prev = raw.previous || {};

  const revenue = toNumber(cur.revenue ?? cur.sales ?? cur.gmv);
  const revenuePrev = toNumber(prev.revenue ?? prev.sales ?? prev.gmv);

  const spend = toNumber(cur.marketing_spend ?? cur.ad_spend ?? cur.spend);
  const spendPrev = toNumber(prev.marketing_spend ?? prev.ad_spend ?? prev.spend);

  const cac = toNumber(cur.cac);
  const cacPrev = toNumber(prev.cac);

  const ltv = toNumber(cur.ltv);
  const ltvPrev = toNumber(prev.ltv);

  const churn = toNumber(cur.churn_rate ?? cur.churn);
  const churnPrev = toNumber(prev.churn_rate ?? prev.churn);

  const conv = toNumber(cur.conversion_rate ?? cur.cvr);
  const convPrev = toNumber(prev.conversion_rate ?? prev.cvr);

  const grossMargin = toNumber(cur.gross_margin ?? cur.margin);
  const grossMarginPrev = toNumber(prev.gross_margin ?? prev.margin);

  const burn = toNumber(cur.burn_rate ?? cur.burn);
  const burnPrev = toNumber(prev.burn_rate ?? prev.burn);

  const ltvCac = (ltv !== null && cac !== null) ? safeDiv(ltv, cac) : null;
  const ltvCacPrev = (ltvPrev !== null && cacPrev !== null) ? safeDiv(ltvPrev, cacPrev) : null;

  // growth = (cur - prev) / prev
  const growth = (revenue !== null && revenuePrev) ? (revenue - revenuePrev) / revenuePrev : null;

  return {
    period: raw.period || null,
    metadata: {
      source: raw.source || "upload",
      currency: raw.currency || "USD",
      confidence: raw.confidence || "medium",
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : []
    },
    metrics: {
      revenue: { value: revenue, prev: revenuePrev, currency: raw.currency || "USD" },
      revenue_growth: { value: growth, unit: "ratio" },
      gross_margin: { value: grossMargin, prev: grossMarginPrev, unit: "ratio" },
      burn_rate: { value: burn, prev: burnPrev, currency: raw.currency || "USD" },
      marketing_spend: { value: spend, prev: spendPrev, currency: raw.currency || "USD" },
      cac: { value: cac, prev: cacPrev, currency: raw.currency || "USD" },
      ltv: { value: ltv, prev: ltvPrev, currency: raw.currency || "USD" },
      ltv_cac_ratio: { value: ltvCac, prev: ltvCacPrev, unit: "ratio" },
      churn_rate: { value: churn, prev: churnPrev, unit: "ratio" },
      conversion_rate: { value: conv, prev: convPrev, unit: "ratio" }
    }
  };
}

module.exports = { normalize };
