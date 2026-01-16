// src/core/signalLibrary.js

/**
 * Canonical Signal Library v1
 * These are the ONLY metrics ExecBrief is allowed to reason about
 */

const SIGNAL_DEFINITIONS = [
  { key: "revenue", tier: 1 },
  { key: "revenue_growth", tier: 1 },
  { key: "gross_margin", tier: 1 },
  { key: "burn_rate", tier: 1 },

  { key: "cac", tier: 2 },
  { key: "ltv", tier: 2 },
  { key: "ltv_cac_ratio", tier: 2 },
  { key: "churn_rate", tier: 2 },
  { key: "conversion_rate", tier: 2 }
];

function calculateChange(current, previous) {
  if (previous === null || previous === 0 || previous === undefined) return null;
  return ((current - previous) / previous) * 100;
}

function classifySignal(changePct) {
  if (changePct === null) return "STABLE";
  if (changePct <= -3) return "NEGATIVE";
  if (changePct >= 3) return "POSITIVE";
  return "STABLE";
}

function buildSignals(normalized) {
  const signals = [];

  for (const def of SIGNAL_DEFINITIONS) {
    const curr = normalized.current?.[def.key];
    const prev = normalized.previous?.[def.key];

    if (curr === undefined) continue;

    const changePct = calculateChange(curr, prev);
    const health = classifySignal(changePct);

    signals.push({
      metric: def.key,
      tier: def.tier,
      current_value: curr,
      previous_value: prev ?? null,
      change_pct: changePct,
      health,
      direction:
        changePct === null ? "→" :
        changePct > 0 ? "↑" : "↓",
      severity:
        health === "NEGATIVE" ? "HIGH" :
        health === "POSITIVE" ? "LOW" :
        "MEDIUM"
    });
  }

  // 🔥 FIRE-FIRST SORT
  return signals
    .sort((a, b) => {
      // 1️⃣ Negative first
      if (a.health !== b.health) {
        return a.health === "NEGATIVE" ? -1 : 1;
      }
      // 2️⃣ Tier 1 before Tier 2
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      // 3️⃣ Largest magnitude change
      return Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0);
    })
    // 🧠 EXECUTIVE LIMIT
    .slice(0, 6);
}

module.exports = { buildSignals };
