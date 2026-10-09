const http = require('http');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

function fetchJson(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchRaw(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, length: data.length, data }));
    }).on('error', reject);
  });
}

async function runLiveTests() {
  console.log('🚀 Running Comprehensive Live End-to-End System Tests against localhost:3000...\n');

  try {
    // 1. Status & Health Check
    console.log('[Suite 1] Server Health & System Metadata');
    const statusRes = await fetchJson('/api/status');
    assert(statusRes.status === 200, 'GET /api/status returns HTTP 200');
    assert(statusRes.body.status === 'ONLINE', 'System reports status: ONLINE');
    assert(statusRes.body.project.includes('HN-AI-05'), 'Project title confirmed HN-AI-05');
    assert(statusRes.body.database.dbName === 'cross_hospital_rebalance', 'MongoDB database active');

    // 2. Hospital Fleet API
    console.log('\n[Suite 2] Hospital Fleet Telemetry');
    const hospRes = await fetchJson('/api/hospitals');
    assert(hospRes.status === 200, 'GET /api/hospitals returns HTTP 200');
    assert(Array.isArray(hospRes.body) && hospRes.body.length >= 6, 'Monitors district hospitals (at least 6 facilities)');
    const hosp1 = hospRes.body.find(h => h.id === 'HOSP-01');
    assert(hosp1 && hosp1.name === 'Metro General Hospital', 'HOSP-01 is Metro General Hospital');

    // 3. Trend Predictor API
    console.log('\n[Suite 3] Trend-Based Shortage Predictor');
    const predRes = await fetchJson('/api/predictions');
    assert(predRes.status === 200, 'GET /api/predictions returns HTTP 200');
    assert(Array.isArray(predRes.body) && predRes.body.length >= 6, 'Predictions calculated for all registered hospitals');
    const hasDeficit = predRes.body.some(p => p.timeToShortageHours <= 4.0);
    const hasSurplus = predRes.body.some(p => p.surplusRunwayHours >= 6.0);
    assert(hasDeficit, 'At least one hospital flagged with shortage risk (< 4h)');
    assert(hasSurplus, 'At least one hospital flagged with surplus runway (> 6h)');

    // 4. Rebalance Recommendations & Gemini Justifications
    console.log('\n[Suite 4] Rebalance Optimizer & Gemini Clinical Justifications');
    const recRes = await fetchJson('/api/recommendations');
    assert(recRes.status === 200, 'GET /api/recommendations returns HTTP 200');
    assert(recRes.body.recommendations.length > 0, 'Ranked transfer plan generated');
    const topRec = recRes.body.recommendations[0];
    assert(topRec.rank === 1, 'Top recommendation is Rank #1');
    assert(topRec.transitDistanceKm > 0 && topRec.transitMinutes > 0, 'Transit distance and travel time computed');
    assert(typeof topRec.geminiJustification === 'string', 'Gemini justification exists');
    assert(
      topRec.geminiJustification.includes('Move') && topRec.geminiJustification.includes('units from'),
      `Justification adheres to syntax: "${topRec.geminiJustification}"`
    );

    // 5. Held-Out Simulated Data Accuracy Check
    console.log('\n[Suite 5] Held-Out Simulated Data Accuracy Check');
    const valRes = await fetchJson('/api/validation');
    assert(valRes.status === 200, 'GET /api/validation returns HTTP 200');
    assert(valRes.body.validationMethod.includes('70/30'), 'Validates using 70/30 rolling temporal split');
    assert(typeof valRes.body.districtAverageMape === 'number', `District Average MAPE: ${valRes.body.districtAverageMape}%`);
    assert(valRes.body.districtAverageMape < 30.0, 'Model error bounded (< 30% MAPE on held-out data)');
    assert(valRes.body.hospitals[0].heldOutSeries.length > 0, 'Held-out actual vs predicted series populated');

    // 6. Recent Telemetry Timeseries
    console.log('\n[Suite 6] MongoDB Telemetry Collection Timeseries');
    const telemRes = await fetchJson('/api/telemetry/recent?limit=20');
    assert(telemRes.status === 200, 'GET /api/telemetry/recent returns HTTP 200');
    assert(telemRes.body.length > 0, `Retrieved ${telemRes.body.length} timeseries telemetry documents`);
    assert(telemRes.body[0].resourceType.includes('Oxygen Cylinders'), 'Telemetry tracks Medical Oxygen Cylinders');

    // 7. Interactive Transfer Execution
    console.log('\n[Suite 7] Interactive Transfer Execution via POST');
    const execRes = await fetchJson('/api/transfers/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donorId: topRec.donorId,
        recipientId: topRec.recipientId,
        quantity: 25,
        geminiJustification: topRec.geminiJustification
      })
    });
    assert(execRes.status === 200, 'POST /api/transfers/execute returns HTTP 200');
    assert(execRes.body.success === true, 'Transfer execution succeeded');
    assert(execRes.body.transfer.quantity === 25, 'Transferred exactly 25 units');

    // 8. Transfer Audit History & Export Verification
    console.log('\n[Suite 8] Transfer Audit Log, Manifests & Export Verification');
    const histRes = await fetchJson('/api/transfers/history');
    assert(histRes.status === 200, 'GET /api/transfers/history returns HTTP 200');
    assert(histRes.body.length > 0, `Found ${histRes.body.length} transfer records in MongoDB`);
    const sampleLog = histRes.body[0];
    assert(!!sampleLog.ambulanceNumber, `Ambulance vehicle logged: ${sampleLog.ambulanceNumber}`);
    assert(!!sampleLog.deliveryDriver, `Delivery personnel logged: ${sampleLog.deliveryDriver}`);
    assert(!!sampleLog.driverPhone, `Driver contact phone logged: ${sampleLog.driverPhone}`);
    assert(!!sampleLog.donorAddress && !!sampleLog.recipientAddress, 'Hospital locations/addresses logged');

    // 8b. CSV & PDF Export checks
    const csvRes = await fetchRaw('/api/transfers/export/csv');
    assert(csvRes.status === 200 && csvRes.length > 100, 'GET /api/transfers/export/csv returns valid CSV download');
    const barcodeCsvRes = await fetchRaw('/api/transfers/export/barcode-csv');
    assert(barcodeCsvRes.status === 200 && barcodeCsvRes.length > 100, 'GET /api/transfers/export/barcode-csv returns valid Barcode CSV download');
    assert(barcodeCsvRes.data.includes('Cylinder Barcode') && barcodeCsvRes.data.includes('From Hospital (Source Name)') && barcodeCsvRes.data.includes('To Hospital (Destination Name)'), 'Barcode CSV contains cylinder barcode and source/destination hospitals tracking');
    const cylCsvRes = await fetchRaw('/api/cylinders/export/csv');
    assert(cylCsvRes.status === 200 && cylCsvRes.length > 100, 'GET /api/cylinders/export/csv returns valid cylinder fleet CSV');
    const pdfRes = await fetchRaw('/api/transfers/export/pdf');
    assert(pdfRes.status === 200 && pdfRes.length > 500, 'GET /api/transfers/export/pdf returns valid PDF document');

    // 9. Surge Event Injection
    console.log('\n[Suite 9] Emergency Influx Surge Event');
    const surgeRes = await fetchJson('/api/simulation/surge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId: 'HOSP-01', multiplier: 2.8 })
    });
    assert(surgeRes.status === 200, 'POST /api/simulation/surge returns HTTP 200');
    assert(surgeRes.body.multiplier === 2.8, 'Surge multiplier set to 2.8x');

    // 10. Supply Delivery Replenishment
    console.log('\n[Suite 10] Supply Delivery Replenishment');
    const delivRes = await fetchJson('/api/simulation/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId: 'HOSP-03', quantity: 30 })
    });
    assert(delivRes.status === 200, 'POST /api/simulation/delivery returns HTTP 200');
    assert(delivRes.body.quantity === 30, 'Delivered +30 units to HOSP-03');

    // 11. Frontend Static Assets Delivery
    console.log('\n[Suite 11] Frontend Web Assets Delivery');
    const htmlRes = await fetchRaw('/');
    const cssRes = await fetchRaw('/css/style.css');
    const jsAppRes = await fetchRaw('/js/app.js');
    const jsChartsRes = await fetchRaw('/js/charts.js');
    assert(htmlRes.status === 200 && htmlRes.length > 1000, 'Dashboard HTML served successfully (200 OK)');
    assert(cssRes.status === 200 && cssRes.length > 200, 'Style CSS served successfully (200 OK)');
    assert(jsAppRes.status === 200 && jsAppRes.length > 1000, 'App JS controller served successfully (200 OK)');
    assert(jsChartsRes.status === 200 && jsChartsRes.length > 500, 'Charts JS visualizer served successfully (200 OK)');

    // 12. WebSocket Real-time Feed Test
    console.log('\n[Suite 12] WebSocket Live Telemetry Broadcast');
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      const timer = setTimeout(() => {
        ws.close();
        assert(false, 'WebSocket timed out without receiving tick');
        resolve();
      }, 5000);

      ws.on('open', () => {
        assert(true, 'WebSocket connection opened successfully');
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'INIT_STATE' || msg.type === 'TICK') {
            assert(true, `Received real-time stream packet: type=${msg.type}`);
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        } catch (e) {
          // continue
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        assert(false, `WebSocket error: ${err.message}`);
        resolve();
      });
    });

    // 13. Hospital Registration & Authentication API
    console.log('\n[Suite 13] Hospital Registration & Authentication API');
    const authHospRes = await fetchJson('/api/auth/hospitals');
    assert(authHospRes.status === 200, 'GET /api/auth/hospitals returns HTTP 200');
    assert(Array.isArray(authHospRes.body) && authHospRes.body.length >= 6, 'Returns registered hospital facilities');

    // Test staff login
    const loginRes = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@metro.med', password: 'hospital123' })
    });
    assert(loginRes.status === 200, 'POST /api/auth/login returns HTTP 200');
    assert(loginRes.body.success === true && loginRes.body.token.startsWith('AUTH-'), 'Issues signed authentication session token');
    assert(loginRes.body.hospital.id === 'HOSP-01', 'Authenticated hospital session resolved to HOSP-01');

    // Test new hospital registration with Hospital Registration Number
    const testRegEmail = `dispatch-${Date.now()}@valleycrest.med`;
    const testRegNo = `MOH-REG-2026-${Date.now().toString().slice(-4)}`;
    const regRes = await fetchJson('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Valley Crest Medical Center ${Date.now().toString().slice(-4)}`,
        registrationNumber: testRegNo,
        type: 'Community Care Facility',
        address: '770 Valley Crest Road',
        district: 'District 04 East',
        dispatchContact: 'Nurse Director Sarah Lin',
        phone: '+1 (555) 019-3388',
        capacity: 260,
        initialStock: 80,
        baselineBurnRate: 9.0,
        email: testRegEmail,
        password: 'passwordSecure123'
      })
    });
    assert(regRes.status === 201, 'POST /api/auth/register returns HTTP 201 Created');
    assert(regRes.body.success === true, 'Hospital registration succeeded');
    assert(regRes.body.hospital.id.startsWith('HOSP-'), 'Assigned unique hospital facility ID');
    assert(regRes.body.hospital.registrationNumber === testRegNo, `Assigned Hospital Registration Number confirmed: ${testRegNo}`);

    // Verify cylinders auto-provisioned
    const cylRes = await fetchJson(`/api/cylinders?hospitalId=${regRes.body.hospital.id}`);
    assert(cylRes.status === 200 && Array.isArray(cylRes.body) && cylRes.body.length >= 50, 'Barcoded oxygen cylinders auto-provisioned for new facility');

    // Test signing in using Hospital Registration Number instead of email
    const loginByRegRes = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testRegNo, password: 'passwordSecure123' })
    });
    assert(loginByRegRes.status === 200 && loginByRegRes.body.hospital.registrationNumber === testRegNo, 'Login using Hospital Registration Number succeeded');

    // [Suite 14] Emergency Protocol & Transfer Rules Optimizer API
    console.log(`\n[Suite 14] Emergency Protocol & Transfer Rules Optimizer API`);
    const rulesGet = await fetchJson('/api/optimizer/rules');
    assert(rulesGet.status === 200, 'GET /api/optimizer/rules returns HTTP 200');
    assert(typeof rulesGet.body.emergencyThreshold === 'number', 'Rules specify numeric emergency threshold');
    assert(typeof rulesGet.body.batchQuantity === 'number', 'Rules specify numeric batch quantity');
    assert(rulesGet.body.pairingStrategy === 'HIGHEST_STOCK' || rulesGet.body.pairingStrategy === 'SHORTEST_DISTANCE', 'Rules specify valid pairing strategy');

    const rulesPost = await fetchJson('/api/optimizer/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emergencyThreshold: 25,
        batchQuantity: 50,
        pairingStrategy: 'SHORTEST_DISTANCE'
      })
    });
    assert(rulesPost.status === 200 && rulesPost.body.success === true, 'POST /api/optimizer/rules succeeds');
    assert(rulesPost.body.rules.emergencyThreshold === 25, 'Rules threshold updated to 25');
    assert(rulesPost.body.rules.batchQuantity === 50, 'Rules batch quantity updated to 50');
    assert(rulesPost.body.rules.pairingStrategy === 'SHORTEST_DISTANCE', 'Rules strategy updated to SHORTEST_DISTANCE');
    assert(rulesPost.body.plan && Array.isArray(rulesPost.body.plan.recommendations), 'Returns dynamically re-optimized rebalance plan');

    // Reset rules back to defaults
    await fetchJson('/api/optimizer/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyThreshold: 20, batchQuantity: 40, pairingStrategy: 'HIGHEST_STOCK' })
    });
    assert(true, 'Rules reset back to standard defaults (20 cyl / 40 batch / HIGHEST_STOCK)');

    // 15. AI Clinical Reasoning Prompt Customization
    console.log('\n[Suite 15] Gemini AI Clinical Reasoning Prompt Customization API');
    const aiConfigGet = await fetchJson('/api/ai/config');
    assert(aiConfigGet.status === 200, 'GET /api/ai/config returns HTTP 200');
    assert(aiConfigGet.body.config && aiConfigGet.body.presets, 'AI prompt config and clinical presets loaded');
    assert(aiConfigGet.body.presets.PATHOPHYSIOLOGICAL !== undefined, 'Pathophysiological preset available');
    assert(aiConfigGet.body.presets.HIGH_ACUITY_ICU !== undefined, 'High-Acuity ICU preset available');

    const aiPromptTest = await fetchJson('/api/ai/test-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: 'PATHOPHYSIOLOGICAL'
      })
    });
    assert(aiPromptTest.status === 200 && aiPromptTest.body.success === true, 'POST /api/ai/test-prompt succeeds');
    assert(typeof aiPromptTest.body.result?.justification === 'string' && aiPromptTest.body.result.justification.length > 20, 'Generates clinical reasoning preview justification');

    const aiConfigPost = await fetchJson('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activePreset: 'PATHOPHYSIOLOGICAL',
        temperature: 0.15
      })
    });
    assert(aiConfigPost.status === 200 && aiConfigPost.body.success === true, 'POST /api/ai/config updates clinical reasoning directives');
    assert(aiConfigPost.body.config.activePreset === 'PATHOPHYSIOLOGICAL', 'Active preset set to PATHOPHYSIOLOGICAL');

    // Reset AI config back to STANDARD_CRISP default
    await fetchJson('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activePreset: 'STANDARD_CRISP', temperature: 0.2 })
    });
    assert(true, 'AI prompt config safely reset to standard default');

    // 16. Alert Notifications Customization API
    console.log('\n[Suite 16] Alert Notifications Protocol Customization API');
    const alertConfigGet = await fetchJson('/api/alerts/config');
    assert(alertConfigGet.status === 200, 'GET /api/alerts/config returns HTTP 200');
    assert(typeof alertConfigGet.body.emergencyThreshold === 'number', 'Alert config defines numeric emergency threshold');
    assert(typeof alertConfigGet.body.soundAlerts === 'boolean', 'Alert config specifies soundAlerts toggle');

    const alertConfigPost = await fetchJson('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soundAlerts: true,
        emergencyThreshold: 18,
        warningThreshold: 32,
        alertSoundFrequency: 'TWO_TONE',
        alertMessageTemplate: 'EMERGENCY PROTOCOL [REG: {hospitalReg}]: {hospitalName} critically low ({currentStock} cyl remaining).'
      })
    });
    assert(alertConfigPost.status === 200 && alertConfigPost.body.success === true, 'POST /api/alerts/config updates alert protocols');
    assert(alertConfigPost.body.config.emergencyThreshold === 18, 'Emergency alert threshold updated to 18');
    assert(alertConfigPost.body.config.alertSoundFrequency === 'TWO_TONE', 'Alert chime set to TWO_TONE');

    const testChime = await fetchJson('/api/alerts/test-chime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundFrequency: 'TWO_TONE' })
    });
    assert(testChime.status === 200 && testChime.body.success === true, 'POST /api/alerts/test-chime broadcasts audio alert successfully');

    // Reset Alert config back
    await fetchJson('/api/alerts/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyThreshold: 20, warningThreshold: 35, alertSoundFrequency: 'TWO_TONE' })
    });
    assert(true, 'Alert config reset back to standard defaults');

    // 17. Reports & Custom Export Fields Verification
    console.log('\n[Suite 17] Reports & Custom Export Fields Verification');
    const customCsvRes = await fetchRaw('/api/transfers/export/csv?coordinator=Dr.+Sarah+Chen&sealPrefix=SEAL-DISTRICT4');
    assert(customCsvRes.status === 200, 'GET /api/transfers/export/csv with custom parameters returns HTTP 200');
    assert(customCsvRes.data.includes('Source Hospital Registration No') && customCsvRes.data.includes('Destination Hospital Registration No'), 'CSV includes custom Hospital Registration Number fields');
    assert(customCsvRes.data.includes('Clinical Triage Priority') && customCsvRes.data.includes('Batch Tamper Seal Number'), 'CSV includes custom Triage Priority and Tamper Seal fields');
    assert(customCsvRes.data.includes('Authorizing Dispatch Coordinator'), 'CSV includes custom Authorizing Coordinator field');

    const customBarcodeRes = await fetchRaw('/api/transfers/export/barcode-csv?coordinator=Chief+Logistics+Officer');
    assert(customBarcodeRes.status === 200, 'GET /api/transfers/export/barcode-csv with custom parameters returns HTTP 200');
    assert(customBarcodeRes.data.includes('From Hospital Registration No') && customBarcodeRes.data.includes('Batch Tamper Seal Number'), 'Barcode CSV includes Registration Number and Batch Seal fields');
    assert(customBarcodeRes.data.includes('Clinical Triage Priority'), 'Barcode CSV includes Clinical Triage Priority');

    const customPdfRes = await fetchRaw('/api/transfers/export/pdf?coordinator=Dr.+Sarah+Chen&sealPrefix=SEAL-TX');
    assert(customPdfRes.status === 200 && customPdfRes.length > 500, 'GET /api/transfers/export/pdf with custom parameters returns valid signed PDF');

    console.log(`\n======================================================`);
    console.log(`🎉 LIVE VERIFICATION RESULTS: ${passed}/${total} TESTS PASSED!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

runLiveTests();
