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
      res.on('end', () => resolve({ status: res.statusCode, length: data.length }));
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

    // Test new hospital registration
    const testRegEmail = `dispatch-${Date.now()}@valleycrest.med`;
    const regRes = await fetchJson('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Valley Crest Medical Center ${Date.now().toString().slice(-4)}`,
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

    // Verify cylinders auto-provisioned
    const cylRes = await fetchJson(`/api/cylinders?hospitalId=${regRes.body.hospital.id}`);
    assert(cylRes.status === 200 && Array.isArray(cylRes.body) && cylRes.body.length >= 50, 'Barcoded oxygen cylinders auto-provisioned for new facility');

    console.log(`\n======================================================`);
    console.log(`🎉 LIVE VERIFICATION RESULTS: ${passed}/${total} TESTS PASSED!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

runLiveTests();
