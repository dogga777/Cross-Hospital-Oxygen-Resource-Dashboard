const { GoogleGenAI } = require('@google/genai');
const config = require('../config');

let aiClient = null;

function getAiClient(customApiKey = null) {
  const key = customApiKey || config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (key && key.trim().length > 0) {
    if (!aiClient || aiClient.apiKey !== key) {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
    return aiClient;
  }
  return null;
}

// Generate the required crisp one-line justification
async function generateTransferJustification(rec, customApiKey = null) {
  const client = getAiClient(customApiKey);

  const fallbackJustification = `Move ${rec.transferQuantity} units from ${rec.donorName} to ${rec.recipientName} — ${rec.donorName} has ${rec.donorSurplusHours}hrs surplus, ${rec.recipientName} depletes in ${rec.recipientDepletionHours}hrs`;

  if (!client) {
    return {
      justification: fallbackJustification,
      modelUsed: 'heuristic-fallback',
      poweredByGemini: false,
      reason: 'No GEMINI_API_KEY configured (using standard format)'
    };
  }

  const prompt = `You are an emergency medical logistics dispatch commander.
Task: Write EXACTLY ONE concise, high-impact clinical justification sentence for the following emergency oxygen transfer.

Transfer Details:
- Donor Hospital: ${rec.donorName} (Current stock: ${rec.donorCurrentStock} cyl, Consumption: ${rec.donorBurnRate} cyl/hr, Surplus runway: ${rec.donorSurplusHours} hrs)
- Recipient Hospital: ${rec.recipientName} (Current stock: ${rec.recipientCurrentStock} cyl, Consumption: ${rec.recipientBurnRate} cyl/hr, Depletes in: ${rec.recipientDepletionHours} hrs)
- Recommended Transfer: ${rec.transferQuantity} units of Oxygen Cylinders
- Transit Time: ${rec.transitMinutes} mins (${rec.transitDistanceKm} km)
- Post-transfer outcome: Recipient runway extended to ${rec.recipientNewRunwayHours} hrs, Donor retains ${rec.donorRemainingSurplusHours} hrs surplus.

Formatting Requirement:
You MUST follow this exact style and structure:
"Move ${rec.transferQuantity} units from [Donor] to [Recipient] — [Donor] has Xhrs surplus, [Recipient] depletes in Yhrs"

Rules:
1. Provide ONLY the single sentence.
2. Do NOT enclose in quotation marks or markdown bullets.
3. Be strictly factual and authoritative.`;

  try {
    const response = await client.models.generateContent({
      model: config.geminiModel || 'gemini-3.8-flash',
      contents: prompt
    });

    const text = (response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const cleanedText = text.replace(/^["'`]+|["'`]+$/g, '').trim();

    if (cleanedText && cleanedText.length > 10) {
      return {
        justification: cleanedText,
        modelUsed: config.geminiModel || 'gemini-3.8-flash',
        poweredByGemini: true
      };
    }

    return {
      justification: fallbackJustification,
      modelUsed: 'gemini-fallback',
      poweredByGemini: true
    };
  } catch (err) {
    console.warn(`[Gemini] API call error (${err.message}). Using fallback justification.`);
    return {
      justification: fallbackJustification,
      modelUsed: 'heuristic-fallback',
      poweredByGemini: false,
      error: err.message
    };
  }
}

// Batch enrich recommendations with Gemini justifications
async function enrichRecommendationsWithGemini(recommendations, customApiKey = null) {
  const enriched = [];

  for (const rec of recommendations) {
    const aiResult = await generateTransferJustification(rec, customApiKey);
    enriched.push({
      ...rec,
      geminiJustification: aiResult.justification,
      aiMetadata: {
        modelUsed: aiResult.modelUsed,
        poweredByGemini: aiResult.poweredByGemini
      }
    });
  }

  return enriched;
}

module.exports = {
  getAiClient,
  generateTransferJustification,
  enrichRecommendationsWithGemini
};
