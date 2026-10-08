require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  mongoUri: process.env.MONGODB_URI || '',
  dbName: process.env.DB_NAME || 'cross_hospital_rebalance',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  simulation: {
    defaultIntervalMs: parseInt(process.env.SIMULATION_INTERVAL_MS, 10) || 3000,
    resourceType: 'Oxygen Cylinders (Type-D 40L)',
    planningHorizonHours: 12,
    criticalThresholdHours: 3.5, // hospitals depleting in < 3.5h need emergency transfer
    surplusThresholdHours: 6.0,  // hospitals with > 6h surplus can donate
    safetyBufferUnits: 15        // minimum buffer to leave at any donor hospital
  }
};
