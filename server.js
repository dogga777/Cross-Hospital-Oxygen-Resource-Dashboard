const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = require('./src/config');
const { connectDb, getDb, getDbStatus } = require('./src/db/mongo');
const { seedDatabaseIfEmpty } = require('./src/db/seed');
const simulator = require('./src/simulator/stream');
const { predictDistrictShortages } = require('./src/ml/predictor');
const { validateDistrictModels, validateHospitalPredictor } = require('./src/ml/validator');
const { generateRebalancePlan } = require('./src/optimizer/rebalance');
const { enrichRecommendationsWithGemini, getAiClient } = require('./src/ai/gemini');
const { generateCsv, generatePdf } = require('./src/export/export');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache latest state
let latestRebalancePlan = null;
let latestDistrictValidation = null;

// Real-time WebSocket clients
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send immediate initial state
  if (latestRebalancePlan) {
    ws.send(JSON.stringify({ type: 'INIT_STATE', plan: latestRebalancePlan, validation: latestDistrictValidation }));
  }
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

function broadcastWs(payload) {
  const message = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(message);
      } catch (err) {
        // ignore
      }
    }
  }
}

// Hook simulator ticks into ML predictor and broadcast
simulator.onTick(async (tickData) => {
  try {
    const rawPlan = await generateRebalancePlan();
    // Enrich with Gemini justifications
    const enrichedRecs = await enrichRecommendationsWithGemini(rawPlan.recommendations);
    latestRebalancePlan = { ...rawPlan, recommendations: enrichedRecs };

    // Broadcast live telemetry & rebalance state
    broadcastWs({
      type: 'TICK',
      timestamp: tickData.timestamp,
      hospitals: tickData.hospitals,
      rebalancePlan: latestRebalancePlan
    });
  } catch (err) {
    console.error('[Server] Error processing simulation tick:', err);
  }
});

// Periodic validation against held-out data (every 15s)
setInterval(async () => {
  try {
    latestDistrictValidation = await validateDistrictModels();
    broadcastWs({
      type: 'VALIDATION_UPDATE',
      validation: latestDistrictValidation
    });
  } catch (err) {
    console.warn('[Server] Error updating held-out validation:', err.message);
  }
}, 15000);

// API Routes

// System Status
app.get('/api/status', (req, res) => {
  const dbStatus = getDbStatus();
  const hasGemini = !!(config.geminiApiKey || process.env.GEMINI_API_KEY);

  res.json({
    status: 'ONLINE',
    track: 'Gemini · MongoDB · Render',
    project: 'HN-AI-05: Cross-Hospital Resource Rebalance',
    database: dbStatus,
    gemini: {
      configured: hasGemini,
      model: config.geminiModel,
      activeClient: !!getAiClient()
    },
    simulator: {
      isRunning: simulator.isRunning,
      intervalMs: simulator.intervalMs
    },
    connectedClients: wsClients.size,
    timestamp: Date.now()
  });
});

// Hospital fleet
app.get('/api/hospitals', async (req, res) => {
  try {
    const db = getDb();
    const hospitals = await db.collection('hospitals').find().toArray();
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shortage predictions
app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = await predictDistrictShortages();
    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rebalance Recommendations + Gemini Justifications
app.get('/api/recommendations', async (req, res) => {
  try {
    const rawPlan = await generateRebalancePlan();
    const enrichedRecs = await enrichRecommendationsWithGemini(rawPlan.recommendations);
    latestRebalancePlan = { ...rawPlan, recommendations: enrichedRecs };
    res.json(latestRebalancePlan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Held-Out Simulated Data Accuracy Check
app.get('/api/validation', async (req, res) => {
  try {
    if (!latestDistrictValidation) {
      latestDistrictValidation = await validateDistrictModels();
    }
    res.json(latestDistrictValidation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Individual hospital held-out validation
app.get('/api/validation/:hospitalId', async (req, res) => {
  try {
    const validation = await validateHospitalPredictor(req.params.hospitalId);
    if (!validation) return res.status(404).json({ error: 'Hospital not found' });
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent telemetry history (for charts)
app.get('/api/telemetry/recent', async (req, res) => {
  try {
    const db = getDb();
    const hospitalId = req.query.hospitalId;
    const limit = parseInt(req.query.limit, 10) || 25;

    const query = hospitalId ? { hospitalId } : {};
    const docs = await db.collection('resource_telemetry')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json(docs.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer history
app.get('/api/transfers/history', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.collection('transfer_logs')
      .find()
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Transfer History as CSV
app.get('/api/transfers/export/csv', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.collection('transfer_logs')
      .find()
      .sort({ timestamp: -1 })
      .toArray();
    const csvContent = generateCsv(logs);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="oxygen_transfer_manifest_history.csv"');
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Transfer History as PDF Report
app.get('/api/transfers/export/pdf', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.collection('transfer_logs')
      .find()
      .sort({ timestamp: -1 })
      .toArray();
    generatePdf(logs, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute a Transfer
app.post('/api/transfers/execute', async (req, res) => {
  try {
    const { donorId, recipientId, quantity, geminiJustification } = req.body;
    if (!donorId || !recipientId || !quantity) {
      return res.status(400).json({ error: 'Missing required transfer fields' });
    }

    const result = await simulator.executeTransfer(
      donorId,
      recipientId,
      parseInt(quantity, 10),
      geminiJustification
    );

    // Broadcast execution
    broadcastWs({
      type: 'TRANSFER_EXECUTED',
      transfer: result
    });

    res.json({ success: true, transfer: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Simulation Controls
app.post('/api/simulation/control', async (req, res) => {
  try {
    const { action, intervalMs } = req.body;
    if (action === 'start') simulator.start();
    else if (action === 'pause') simulator.stop();
    else if (action === 'reset') await simulator.reset();

    if (intervalMs) simulator.setInterval(parseInt(intervalMs, 10));

    res.json({
      success: true,
      isRunning: simulator.isRunning,
      intervalMs: simulator.intervalMs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inject Surge event
app.post('/api/simulation/surge', (req, res) => {
  try {
    const { hospitalId, multiplier } = req.body;
    simulator.injectSurge(hospitalId, multiplier || 2.5);
    res.json({ success: true, hospitalId, multiplier: multiplier || 2.5 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inject Delivery event
app.post('/api/simulation/delivery', async (req, res) => {
  try {
    const { hospitalId, quantity } = req.body;
    await simulator.injectDelivery(hospitalId, quantity || 50);
    res.json({ success: true, hospitalId, quantity: quantity || 50 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dynamic configuration update (API Key or MongoDB URI)
app.post('/api/config/update', async (req, res) => {
  try {
    const { geminiApiKey, mongoUri } = req.body;
    if (geminiApiKey !== undefined) {
      config.geminiApiKey = geminiApiKey.trim();
      process.env.GEMINI_API_KEY = geminiApiKey.trim();
    }
    if (mongoUri !== undefined && mongoUri.trim() !== config.mongoUri) {
      config.mongoUri = mongoUri.trim();
      process.env.MONGODB_URI = mongoUri.trim();
      await connectDb(config.mongoUri);
    }
    res.json({
      success: true,
      geminiConfigured: !!config.geminiApiKey,
      dbStatus: getDbStatus()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bootstrap server
async function bootstrap() {
  try {
    console.log('[System] Initializing Cross-Hospital Resource Rebalance System...');
    await connectDb();
    await seedDatabaseIfEmpty();

    // Generate initial plan & validation
    const rawPlan = await generateRebalancePlan();
    const enrichedRecs = await enrichRecommendationsWithGemini(rawPlan.recommendations);
    latestRebalancePlan = { ...rawPlan, recommendations: enrichedRecs };
    latestDistrictValidation = await validateDistrictModels();

    // Start live simulator feed
    simulator.start();

    server.listen(config.port, config.host, () => {
      console.log(`\n======================================================`);
      console.log(`🏥 HN-AI-05: CROSS-HOSPITAL RESOURCE REBALANCE`);
      console.log(`🌐 Server running at: http://localhost:${config.port}`);
      console.log(`📡 WebSocket stream:  ws://localhost:${config.port}/ws`);
      console.log(`📊 Track: Gemini · MongoDB · Render`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('[System] Fatal startup error:', err);
    process.exit(1);
  }
}

bootstrap();
