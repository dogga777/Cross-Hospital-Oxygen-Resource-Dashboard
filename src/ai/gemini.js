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

// Preset definitions for AI Clinical Reasoning
const AI_PROMPT_PRESETS = {
  STANDARD_CRISP: {
    id: 'STANDARD_CRISP',
    name: 'Standard Crisp Justification (Default)',
    description: 'Exact one-line clinical justification with donor surplus runway and recipient depletion horizon.',
    persona: 'You are an emergency medical logistics dispatch commander.',
    directive: 'Write EXACTLY ONE concise, high-impact clinical justification sentence following the standard rebalance format.',
    template: 'Move {transferQuantity} units from {donorName} to {recipientName} — {donorName} has {donorSurplusHours}hrs surplus, {recipientName} depletes in {recipientDepletionHours}hrs'
  },
  PATHOPHYSIOLOGICAL: {
    id: 'PATHOPHYSIOLOGICAL',
    name: 'Pathophysiological & Hypoxia Mitigation',
    description: 'Focuses on SpO2 preservation, organ hypoxia prevention, and acute respiratory distress in critical care units.',
    persona: 'You are a Chief Medical Officer and Critical Care Logistics Director specializing in respiratory medicine.',
    directive: 'Emphasize ward SpO2 stability, organ hypoxia prevention, and physiological reserve vulnerability if delayed.',
    template: 'Move {transferQuantity} units from {donorName} to {recipientName} — critical SpO2 preservation; {recipientName} depletes in {recipientDepletionHours}hrs, {donorName} maintains {donorSurplusHours}hrs buffer'
  },
  HIGH_ACUITY_ICU: {
    id: 'HIGH_ACUITY_ICU',
    name: 'High-Acuity ICU & Ventilator Priority',
    description: 'Prioritizes intensive care ventilator life-support, pediatric trauma reserves, and rapid transit corridor safety.',
    persona: 'You are a Trauma Resuscitation and District Critical Care Rebalance Director.',
    directive: 'Prioritize acute ventilator life support, pediatric emergency capacity, and immediate transit corridor safety.',
    template: 'Move {transferQuantity} units from {donorName} to {recipientName} — emergency ICU ventilator runway protection ({recipientDepletionHours}hrs remaining, {transitMinutes}m transit)'
  },
  CUSTOM: {
    id: 'CUSTOM',
    name: 'Custom Clinical Directives & Template',
    description: 'User-customized clinical persona, priority guidelines, and dynamic template format.',
    persona: 'You are an emergency medical logistics dispatch commander.',
    directive: 'Write an authoritative clinical justification sentence for the district rebalance manifest.',
    template: 'Move {transferQuantity} units from {donorName} to {recipientName} — priority dispatch: {donorSurplusHours}h surplus to {recipientDepletionHours}h deficit'
  }
};

let currentAiConfig = {
  activePreset: 'STANDARD_CRISP',
  customPersona: '',
  customDirective: '',
  customTemplate: '',
  temperature: 0.2
};

function getAiPromptConfig() {
  return {
    config: { ...currentAiConfig },
    presets: AI_PROMPT_PRESETS
  };
}

function setAiPromptConfig(updates = {}) {
  if (updates.activePreset && AI_PROMPT_PRESETS[updates.activePreset]) {
    currentAiConfig.activePreset = updates.activePreset;
  }
  if (updates.customPersona !== undefined) {
    currentAiConfig.customPersona = String(updates.customPersona).trim();
  }
  if (updates.customDirective !== undefined) {
    currentAiConfig.customDirective = String(updates.customDirective).trim();
  }
  if (updates.customTemplate !== undefined) {
    currentAiConfig.customTemplate = String(updates.customTemplate).trim();
  }
  if (updates.temperature !== undefined) {
    currentAiConfig.temperature = Math.max(0.0, Math.min(1.0, Number(updates.temperature) || 0.2));
  }
  return getAiPromptConfig();
}

// Interpolate template tags with recommendation metrics
function interpolateTemplate(templateStr, vars) {
  if (!templateStr) return '';
  return templateStr
    .replace(/\{transferQuantity\}/g, vars.transferQuantity ?? '0')
    .replace(/\{donorName\}/g, vars.donorName ?? 'Donor')
    .replace(/\{recipientName\}/g, vars.recipientName ?? 'Recipient')
    .replace(/\{donorSurplusHours\}/g, vars.donorSurplusHours ?? '0')
    .replace(/\{recipientDepletionHours\}/g, vars.recipientDepletionHours ?? '0')
    .replace(/\{transitMinutes\}/g, vars.transitMinutes ?? '0')
    .replace(/\{transitDistanceKm\}/g, vars.transitDistanceKm ?? '0')
    .replace(/\{donorCurrentStock\}/g, vars.donorCurrentStock ?? '0')
    .replace(/\{recipientCurrentStock\}/g, vars.recipientCurrentStock ?? '0')
    .replace(/\{donorRemainingSurplusHours\}/g, vars.donorRemainingSurplusHours ?? '0')
    .replace(/\{recipientNewRunwayHours\}/g, vars.recipientNewRunwayHours ?? '0');
}

// Generate clinical reasoning justification using Gemini or configured preset fallback
async function generateTransferJustification(rec, customApiKey = null) {
  const client = getAiClient(customApiKey);
  const presetKey = currentAiConfig.activePreset || 'STANDARD_CRISP';
  const activePreset = AI_PROMPT_PRESETS[presetKey] || AI_PROMPT_PRESETS.STANDARD_CRISP;

  const effectivePersona = (presetKey === 'CUSTOM' && currentAiConfig.customPersona)
    ? currentAiConfig.customPersona
    : activePreset.persona;

  const effectiveDirective = (presetKey === 'CUSTOM' && currentAiConfig.customDirective)
    ? currentAiConfig.customDirective
    : activePreset.directive;

  const effectiveTemplate = (presetKey === 'CUSTOM' && currentAiConfig.customTemplate)
    ? currentAiConfig.customTemplate
    : activePreset.template;

  const vars = {
    transferQuantity: rec.transferQuantity || 0,
    donorName: rec.donorName || 'Donor Facility',
    recipientName: rec.recipientName || 'Recipient Facility',
    donorSurplusHours: rec.donorSurplusHours != null ? (+rec.donorSurplusHours).toFixed(1) : '6.0',
    recipientDepletionHours: rec.recipientDepletionHours != null ? (+rec.recipientDepletionHours).toFixed(1) : '2.0',
    transitMinutes: rec.transitMinutes || 15,
    transitDistanceKm: rec.transitDistanceKm || 5,
    donorCurrentStock: Math.round(rec.donorCurrentStock || 0),
    recipientCurrentStock: Math.round(rec.recipientCurrentStock || 0),
    donorRemainingSurplusHours: rec.donorRemainingSurplusHours != null ? (+rec.donorRemainingSurplusHours).toFixed(1) : '4.5',
    recipientNewRunwayHours: rec.recipientNewRunwayHours != null ? (+rec.recipientNewRunwayHours).toFixed(1) : '6.5'
  };

  // Base fallback formatted according to active clinical template
  let fallbackJustification = interpolateTemplate(effectiveTemplate, vars);
  if (!fallbackJustification || fallbackJustification.length < 10) {
    fallbackJustification = `Move ${vars.transferQuantity} units from ${vars.donorName} to ${vars.recipientName} — ${vars.donorName} has ${vars.donorSurplusHours}hrs surplus, ${vars.recipientName} depletes in ${vars.recipientDepletionHours}hrs`;
  }
  if (rec.recipientCurrentStock <= 20 && presetKey === 'STANDARD_CRISP') {
    fallbackJustification = `Move ${vars.transferQuantity} units from ${vars.donorName} to ${vars.recipientName} — ${vars.donorName} has ${vars.donorCurrentStock} cylinders (surplus), ${vars.recipientName} has only ${vars.recipientCurrentStock} cylinders left`;
  }

  if (!client) {
    return {
      justification: fallbackJustification,
      modelUsed: 'heuristic-fallback',
      poweredByGemini: false,
      preset: presetKey,
      reason: 'No GEMINI_API_KEY configured (using clinical preset format)'
    };
  }

  const prompt = `${effectivePersona}
Task: ${effectiveDirective}

Transfer Clinical Details:
- Donor Facility: ${vars.donorName} (Current stock: ${vars.donorCurrentStock} cyl, Surplus runway: ${vars.donorSurplusHours} hrs, Retains post-transfer: ${vars.donorRemainingSurplusHours} hrs)
- Recipient Facility: ${vars.recipientName} (Current stock: ${vars.recipientCurrentStock} cyl, Depletes in: ${vars.recipientDepletionHours} hrs, Extended to: ${vars.recipientNewRunwayHours} hrs)
- Dispatch Batch: ${vars.transferQuantity} Medical Oxygen Cylinders (Type-D 40L)
- Transit ETA: ${vars.transitMinutes} mins (${vars.transitDistanceKm} km)

Formatting Directive:
Follow this structure:
"${effectiveTemplate}"

Rules:
1. Provide EXACTLY ONE crisp, authoritative clinical justification sentence.
2. Do NOT enclose in markdown bullets or quotation marks.
3. Be strictly clinical, factual, and actionable.`;

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
        poweredByGemini: true,
        preset: presetKey,
        promptTemplate: effectiveTemplate
      };
    }

    return {
      justification: fallbackJustification,
      modelUsed: 'gemini-fallback',
      poweredByGemini: true,
      preset: presetKey
    };
  } catch (err) {
    console.warn(`[Gemini] API call error (${err.message}). Using fallback justification.`);
    return {
      justification: fallbackJustification,
      modelUsed: 'heuristic-fallback',
      poweredByGemini: false,
      preset: presetKey,
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
        poweredByGemini: aiResult.poweredByGemini,
        preset: aiResult.preset
      }
    });
  }

  return enriched;
}

module.exports = {
  getAiClient,
  getAiPromptConfig,
  setAiPromptConfig,
  generateTransferJustification,
  enrichRecommendationsWithGemini,
  AI_PROMPT_PRESETS,
  interpolateTemplate
};
