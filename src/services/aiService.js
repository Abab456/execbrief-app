// /src/services/aiService.js




const openai = require("./openaiClient");

async function generateBriefFromPrompt(prompt) {
  const response = await openai.responses.create({
    model: "gpt-5",
    input: prompt,
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.output_text);
}

module.exports = { generateBriefFromPrompt };
