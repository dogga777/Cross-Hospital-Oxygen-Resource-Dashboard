const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');

const config = require('./src/config');
const { connectDb, getDb, getDbStatus } = require('./src/db/mongo');
const { seedDatabaseIfEmpty, seedHospitalTelemetry, hashPassword } = require('./src/db/seed');
const { registerHospitalCylinders } = require('./src/cylinders/manager');
const simulator = require('./src/simulator/stream');
const { predictDistrictShortages } = require('./src/ml/predictor');
const { validateDistrictModels, validateHospitalPredictor } = require('./src/ml/validator');
const { generateRebalancePlan, getOptimizerRules, setOptimizerRules } = require('./src/optimizer/rebalance');
const { enrichRecommendationsWithGemini, getAiClient } = require('./src/ai/gemini');
const { generateCsv, generatePdf, generateHospitalsCsv } = require('./src/export/export');

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

// Emergency & Transfer Rules API
app.get('/api/optimizer/rules', (req, res) => {
  res.json(getOptimizerRules());
});

app.post('/api/optimizer/rules', async (req, res) => {
  try {
    const updated = setOptimizerRules(req.body);
    const rawPlan = await generateRebalancePlan();
    const enrichedRecs = await enrichRecommendationsWithGemini(rawPlan.recommendations);
    latestRebalancePlan = { ...rawPlan, recommendations: enrichedRecs };

    broadcastWs({
      type: 'RULES_UPDATED',
      rules: updated,
      rebalancePlan: latestRebalancePlan
    });

    res.json({ success: true, rules: updated, plan: latestRebalancePlan });
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

// Export Current Hospital Inventory as CSV
app.get('/api/hospitals/export/csv', async (req, res) => {
  try {
    const db = getDb();
    const hospitals = await db.collection('hospitals').find().toArray();
    const csvContent = generateHospitalsCsv(hospitals);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="district_hospitals_oxygen_inventory.csv"');
    res.send(csvContent);
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

// Force set hospital stock (Emergency scenario testing)
app.post('/api/simulation/set-stock', async (req, res) => {
  try {
    const { hospitalId, stock } = req.body;
    await simulator.setStock(hospitalId, stock !== undefined ? Number(stock) : 12);
    res.json({ success: true, hospitalId, stock: Number(stock) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Authentication & Hospital Registration API
// ==========================================

// Register New Hospital Facility into the District Network
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name,
      type,
      district,
      address,
      phone,
      dispatchContact,
      capacity,
      initialStock,
      baselineBurnRate,
      email,
      password,
      lat,
      lng
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Hospital facility name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Account email address is required.' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required (minimum 4 characters).' });
    }

    const db = getDb();
    const hospCol = db.collection('hospitals');
    const usersCol = db.collection('users');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if email already registered
    const existingUser = await usersCol.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    // Check if hospital with same name already registered
    const existingHosp = await hospCol.findOne({ name: cleanName });
    if (existingHosp) {
      return res.status(409).json({ error: 'A hospital facility with this name is already registered.' });
    }

    // Generate next unique Hospital ID (HOSP-07, HOSP-08, etc.)
    const existingHospitals = await hospCol.find().toArray();
    let maxNum = 6;
    for (const h of existingHospitals) {
      if (h.id && h.id.startsWith('HOSP-')) {
        const num = parseInt(h.id.replace('HOSP-', ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const newId = `HOSP-${String(maxNum + 1).padStart(2, '0')}`;

    // Clean prefix for cylinder barcode serial numbers (e.g. HOPE, ANNE, CITY)
    const rawLetters = cleanName.replace(/[^A-Za-z]/g, '').toUpperCase();
    const prefix = (rawLetters.slice(0, 4) || 'GEN').padEnd(3, 'X');

    const parsedCap = Math.max(50, Number(capacity) || 250);
    const parsedStock = Math.max(5, Math.min(parsedCap, Number(initialStock) || 80));
    const parsedBurn = Math.max(1.0, Number(baselineBurnRate) || 10.0);

    // Compute realistic coordinates in District 04 if not given
    const randomOffsetLat = (Math.random() - 0.5) * 0.08;
    const randomOffsetLng = (Math.random() - 0.5) * 0.12;
    const computedLat = lat ? Number(lat) : +(40.7300 + randomOffsetLat).toFixed(4);
    const computedLng = lng ? Number(lng) : +(-73.9850 + randomOffsetLng).toFixed(4);

    const hospitalDoc = {
      id: newId,
      name: cleanName,
      type: type || 'General Acute Care & Emergency',
      capacity: parsedCap,
      currentStock: parsedStock,
      baselineBurnRate: parsedBurn,
      location: {
        district: district || 'Metro District 04',
        address: address || `${cleanName} Campus, District 04`,
        gridX: Math.round(25 + Math.random() * 50),
        gridY: Math.round(25 + Math.random() * 50),
        lat: computedLat,
        lng: computedLng,
        phone: phone || '+1 (555) 019-8000',
        dispatchContact: dispatchContact || 'Emergency Intake Coordinator'
      },
      activePatientsOnO2: Math.max(5, Math.round(parsedStock * 0.35)),
      pressurePsi: Math.round(450 + (parsedStock / parsedCap) * 1750),
      status: parsedStock <= 20 ? 'ACUTE_SHORTAGE_IMMINENT' : 'STABLE_SURPLUS',
      createdAt: Date.now()
    };

    await hospCol.insertOne(hospitalDoc);

    // Save user account credentials
    const userDoc = {
      id: `USER-${Date.now()}`,
      hospitalId: newId,
      hospitalName: cleanName,
      email: cleanEmail,
      passwordHash: hashPassword(password),
      contactPerson: dispatchContact || 'Staff Coordinator',
      role: 'HOSPITAL_COORDINATOR',
      createdAt: Date.now()
    };
    await usersCol.insertOne(userDoc);

    // Seed realistic barcoded cylinders for this newly registered hospital
    const cylinderCount = Math.min(parsedCap, Math.max(25, Math.round(parsedStock)));
    await registerHospitalCylinders(newId, cleanName, prefix, cylinderCount, hospitalDoc.pressurePsi);

    // Seed initial 2-hour telemetry history so ML predictor works immediately
    await seedHospitalTelemetry(hospitalDoc);

    const token = `AUTH-${newId}-${Date.now()}`;

    // Broadcast new hospital to all connected clients
    broadcastWs({
      type: 'HOSPITAL_REGISTERED',
      hospital: hospitalDoc
    });

    console.log(`[Auth] ✓ Registered new hospital: ${cleanName} (${newId}) by ${cleanEmail}`);

    res.status(201).json({
      success: true,
      token,
      hospital: {
        id: hospitalDoc.id,
        name: hospitalDoc.name,
        type: hospitalDoc.type,
        address: hospitalDoc.location?.address,
        phone: hospitalDoc.location?.phone,
        currentStock: hospitalDoc.currentStock,
        capacity: hospitalDoc.capacity,
        prefix,
        lat: computedLat,
        lng: computedLng
      },
      user: {
        email: userDoc.email,
        contactPerson: userDoc.contactPerson,
        role: userDoc.role
      }
    });
  } catch (err) {
    console.error('[Auth] Error registering hospital:', err);
    res.status(500).json({ error: err.message });
  }
});

// Hospital Staff Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, hospitalId } = req.body;
    const db = getDb();
    const hospCol = db.collection('hospitals');
    const usersCol = db.collection('users');

    let hospital = null;
    let user = null;

    if (email && email.trim()) {
      // Login via email & password
      const cleanEmail = email.trim().toLowerCase();
      user = await usersCol.findOne({ email: cleanEmail });

      if (!user) {
        return res.status(401).json({ error: 'No account found with this email. Please register your hospital.' });
      }

      if (password && hashPassword(password) !== user.passwordHash) {
        return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
      }

      hospital = await hospCol.findOne({ id: user.hospitalId });
    } else if (hospitalId) {
      // Direct hospital selector / demo sign in
      hospital = await hospCol.findOne({ id: hospitalId });
      if (!hospital) return res.status(404).json({ error: 'Hospital not found.' });
      user = await usersCol.findOne({ hospitalId });
    } else {
      return res.status(400).json({ error: 'Please enter your account email and password, or select a facility.' });
    }

    if (!hospital) {
      return res.status(404).json({ error: 'Hospital record not found.' });
    }

    const token = `AUTH-${hospital.id}-${Date.now()}`;

    res.json({
      success: true,
      token,
      hospital: {
        id: hospital.id,
        name: hospital.name,
        type: hospital.type,
        address: hospital.location?.address,
        phone: hospital.location?.phone,
        currentStock: hospital.currentStock,
        capacity: hospital.capacity,
        lat: hospital.location?.lat,
        lng: hospital.location?.lng
      },
      user: {
        email: user?.email || `coordinator@${hospital.id.toLowerCase()}.med`,
        contactPerson: user?.contactPerson || hospital.location?.dispatchContact || 'Staff Coordinator',
        role: user?.role || 'HOSPITAL_COORDINATOR'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get registered hospitals list for authentication selector & demo logins
app.get('/api/auth/hospitals', async (req, res) => {
  try {
    const db = getDb();
    const hospitals = await db.collection('hospitals').find().toArray();
    res.json(hospitals.map(h => ({
      id: h.id,
      name: h.name,
      type: h.type,
      address: h.location?.address,
      phone: h.location?.phone,
      currentStock: h.currentStock,
      capacity: h.capacity,
      lat: h.location?.lat,
      lng: h.location?.lng
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current user session check
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const hospitalId = req.query.hospitalId || (authHeader ? authHeader.replace('Bearer ', '').split('-')[1] : null);
    if (!hospitalId) {
      return res.status(401).json({ authenticated: false });
    }
    const db = getDb();
    const hospital = await db.collection('hospitals').findOne({ id: hospitalId });
    if (!hospital) return res.status(404).json({ error: 'Hospital not found.' });
    const user = await db.collection('users').findOne({ hospitalId });

    res.json({
      authenticated: true,
      hospital: {
        id: hospital.id,
        name: hospital.name,
        type: hospital.type,
        address: hospital.location?.address,
        phone: hospital.location?.phone,
        currentStock: hospital.currentStock,
        capacity: hospital.capacity,
        lat: hospital.location?.lat,
        lng: hospital.location?.lng
      },
      user: {
        email: user?.email || '',
        contactPerson: user?.contactPerson || '',
        role: user?.role || 'HOSPITAL_COORDINATOR'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cylinders Inventory
const { processBarcodeScan, getCylinders, getNotifications, respondToNotification, seedCylindersIfEmpty } = require('./src/cylinders/manager');

app.get('/api/cylinders', async (req, res) => {
  try {
    const { hospitalId, status } = req.query;
    const list = await getCylinders(hospitalId || 'HOSP-01', status);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Barcode Scan Endpoint (Updates inventory, detects shortage, triggers notifications)
app.post('/api/cylinders/scan', async (req, res) => {
  try {
    const { serialNumber, action, hospitalId } = req.body;
    if (!serialNumber) return res.status(400).json({ error: 'Missing serialNumber' });
    const result = await processBarcodeScan(serialNumber, action || 'CONSUME', hospitalId);
    
    broadcastWs({
      type: 'CYLINDER_SCANNED',
      data: result
    });

    if (result.emergencyTriggered) {
      broadcastWs({
        type: 'NOTIFICATION_RECEIVED',
        notification: result.notification
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-Hospital Notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const notifs = await getNotifications(hospitalId);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Respond to Notification (Approve transfer & send cylinders)
app.post('/api/notifications/respond', async (req, res) => {
  try {
    const { notificationId, action, hospitalId } = req.body;
    const result = await respondToNotification(notificationId, action || 'APPROVE', hospitalId);
    broadcastWs({
      type: 'NOTIFICATION_RESOLVED',
      data: result
    });
    res.json(result);
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
    await seedCylindersIfEmpty();

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
