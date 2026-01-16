// /src/core/audit.js

const BANNED_VERBS = ["review", "explore", "consider", "monitor", "evaluate", "analyze", "look into"];

function startsWithBannedVerb(text = "") {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase();
  return BANNED_VERBS.includes(first);
}

function auditExecBrief({ briefJson, signalsPack }) {
  const errors = [];
  if (!briefJson || typeof briefJson !== "object") {
    return { ok: false, errors: ["Output is not valid JSON object"] };
  }

  // max limits
  if (Array.isArray(briefJson.key_signals) && briefJson.key_signals.length > 6) {
    errors.push("Too many key_signals (max 6).");
  }
  if (Array.isArray(briefJson.recommended_actions) && briefJson.recommended_actions.length > 3) {
    errors.push("Too many recommended_actions (max 3).");
  }

  // actions rules
  (briefJson.recommended_actions || []).forEach((a, i) => {
    if (!a.action || typeof a.action !== "string") errors.push(`Action ${i} missing action text.`);
    if (startsWithBannedVerb(a.action)) errors.push(`Action ${i} uses banned verb.`);
    if (typeof a.confidence !== "number") errors.push(`Action ${i} missing numeric confidence.`);
    if (a.confidence < 70 && !a.data_gap) errors.push(`Action ${i} confidence <70 must include data_gap.`);
  });

  // contradictions (simple v1 checks)
  const signalKeys = new Set((signalsPack?.signals || []).map(s => s.key));
  // Example: if CAC is bad, don't recommend "Increase spend"
  const cacBad = (signalsPack?.signals || []).some(s => s.key === "cac" && s.trend === "bad");
  (briefJson.recommended_actions || []).forEach((a, i) => {
    const txt = (a.action || "").toLowerCase();
    if (cacBad && txt.includes("increase") && txt.includes("spend")) {
      errors.push(`Action ${i} contradicts CAC signal (CAC bad but action increases spend).`);
    }
  });

  return { ok: errors.length === 0, errors };
}

module.exports = { auditExecBrief };
