// aiService.js
// Responsible for synthesizing raw metrics into executive insights.

const generateBriefing = async (companyData) => {
    // 1. CONSTRUCT THE PROMPT (The "Executive Context")
    // In production, you would send this prompt to OpenAI/Anthropic.
    const systemPrompt = `
        You are a ruthless executive consultant. 
        Analyze the following metrics. 
        Output MUST be valid JSON with fields: summary, risks (array), actions (array).
        Rule 1: Be concise. No fluff.
        Rule 2: Actions must be directive ("Cut X", "Hire Y").
    `;

    // 2. SIMULATE AI LATENCY & ANALYSIS (Mocking the LLM)
    // We analyze the input data to return context-aware mock responses.
    
    return new Promise((resolve) => {
        setTimeout(() => {
            // LOGIC: Detect if metrics look bad (Simulation)
            const metaCac = companyData.signals?.find(s => s.label.includes('CAC'));
            const isCrisis = metaCac && parseInt(metaCac.value.replace('$','')) > 130;

            if (isCrisis) {
                resolve({
                    summary: "Efficiency crisis detected in paid acquisition. Immediate intervention required to preserve Q3 margin targets.",
                    risks: ["CAC has breached the $130 profitability threshold.", "LTV:CAC ratio dropped below 3.0."],
                    actions: [
                        { title: "Freeze Meta Ad Spend", impact: "High", confidence: 95 },
                        { title: "Audit Creative Performance", impact: "Medium", confidence: 80 }
                    ]
                });
            } else {
                resolve({
                    summary: "Operations are stable. Capital efficiency is high. Recommend aggressive reinvestment in organic channels.",
                    risks: ["Competitor X is increasing share of voice.", "Seasonality may impact Aug revenue."],
                    actions: [
                        { title: "Increase Content Budget", impact: "Medium", confidence: 85 },
                        { title: "Expand Sales Team", impact: "High", confidence: 70 }
                    ]
                });
            }
        }, 800); // Simulate 800ms API thought process
    });
};

module.exports = { generateBriefing };