function buildExploratoryPrompt({ normalized, signalsPack, context }) {
  return `
You are a Lead Data Scientist advising a CEO.

GOAL:
Identify non-obvious trends, anomalies, correlations.

RULES:
- No recommendations
- No actions
- Max 6 insights
- Clear executive language

CONTEXT:
${context || "None"}

METRICS:
${JSON.stringify(normalized.metrics, null, 2)}

SIGNALS:
${JSON.stringify(signalsPack.signals, null, 2)}

OUTPUT JSON:
{
  "mode": "exploratory",
  "insights": [
    {
      "title": "",
      "finding": "",
      "why_it_matters": "",
      "confidence": 0
    }
  ]
}
`;
}

module.exports = { buildExploratoryPrompt };
