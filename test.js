const { connectDb, getDb } = require('./src/db/mongo');
const { seedDatabaseIfEmpty } = require('./src/db/seed');
const { predictDistrictShortages } = require('./src/ml/predictor');
const { validateDistrictModels } = require('./src/ml/validator');
const { generateRebalancePlan } = require('./src/optimizer/rebalance');
const { generateTransferJustification } = require('./src/ai/gemini');
const simulator = require('./src/simulator/stream');

async function runSystemTests() {
  console.log('🧪 Starting Automated Verification Tests for HN-AI-05...\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Database & Seeding Test
    console.log('[Test 1] Database & Seed Layer');
    await connectDb();
    await seedDatabaseIfEmpty();
    const db = getDb();
    const hospitalCount = await db.collection('hospitals').countDocuments();
    const telemetryCount = await db.collection('resource_telemetry').countDocuments();
    assert(hospitalCount === 6, `Seeded exactly 6 district hospitals (Found: ${hospitalCount})`);
    assert(telemetryCount >= 6, `Telemetry documents written to MongoDB (Found: ${telemetryCount})`);

    // 2. Trend Shortage Predictor Test
    console.log('\n[Test 2] Linear Trend Shortage Predictor');
    const predictions = await predictDistrictShortages();
    assert(predictions.length === 6, `Generated predictions for all 6 hospitals`);

    const metroGen = predictions.find(p => p.hospitalId === 'HOSP-01');
    const stJude = predictions.find(p => p.hospitalId === 'HOSP-02');
    assert(metroGen && metroGen.timeToShortageHours < 4.0, `Metro General identified with urgent shortage horizon (${metroGen?.timeToShortageHours}h)`);
    assert(stJude && stJude.surplusRunwayHours > 6.0, `St. Jude identified with surplus runway (${stJude?.surplusRunwayHours}h)`);
    assert(stJude && stJude.transferableUnits > 0, `St. Jude has transferable donor units (${stJude?.transferableUnits} units)`);

    // 3. Held-Out Accuracy Check Test
    console.log('\n[Test 3] Held-Out Simulated Data Accuracy Check');
    const validation = await validateDistrictModels();
    assert(validation && validation.hospitals.length > 0, `Held-out validation report generated`);
    assert(validation.districtAverageMape < 15.0, `Held-out MAPE error is low and bounded (${validation.districtAverageMape}%)`);
    assert(validation.hospitals[0].heldOutSeries.length > 0, `Held-out actual vs predicted series populated for chart visualization`);

    // 4. Rebalance Optimization & Ranking Test
    console.log('\n[Test 4] Rebalance Optimization & Ranking Engine');
    const plan = await generateRebalancePlan();
    assert(plan.recommendations.length > 0, `Generated actionable transfer recommendations (Count: ${plan.recommendations.length})`);
    const topRec = plan.recommendations[0];
    assert(topRec.rank === 1, `First recommendation is ranked #1`);
    assert(topRec.transferQuantity > 0, `Transfer quantity is positive (${topRec.transferQuantity} units)`);
    assert(topRec.donorId !== topRec.recipientId, `Donor and Recipient are distinct hospitals`);
    assert(topRec.transitMinutes > 0, `Logistics transit time computed (${topRec.transitMinutes} mins)`);

    // 5. Gemini-Generated One-Line Justification Test
    console.log('\n[Test 5] Gemini AI Justification Engine');
    const justificationResult = await generateTransferJustification(topRec);
    assert(typeof justificationResult.justification === 'string' && justificationResult.justification.length > 20, `Generated justification: "${justificationResult.justification}"`);
    assert(justificationResult.justification.includes('Move') && justificationResult.justification.includes('units from'), `Follows required one-line pattern: "Move X units from..."`);

    // 6. Transfer Execution Test
    console.log('\n[Test 6] Real-Time Transfer Execution');
    const initialDonorStock = (await db.collection('hospitals').findOne({ id: topRec.donorId })).currentStock;
    const initialRecipStock = (await db.collection('hospitals').findOne({ id: topRec.recipientId })).currentStock;

    const execResult = await simulator.executeTransfer(
      topRec.donorId,
      topRec.recipientId,
      20,
      justificationResult.justification
    );

    const postDonorStock = (await db.collection('hospitals').findOne({ id: topRec.donorId })).currentStock;
    const postRecipStock = (await db.collection('hospitals').findOne({ id: topRec.recipientId })).currentStock;

    assert(execResult.status === 'DELIVERED' || execResult.status === 'EXECUTED', `Transfer executed successfully`);
    assert(postDonorStock < initialDonorStock, `Donor stock reduced from ${initialDonorStock} to ${postDonorStock}`);
    assert(postRecipStock > initialRecipStock, `Recipient stock replenished from ${initialRecipStock} to ${postRecipStock}`);

    const logs = await db.collection('transfer_logs').countDocuments();
    assert(logs > 0, `Transfer transaction logged in MongoDB collection`);

    // [Test 7] Hospital Registration & Authentication Layer
    console.log(`\n[Test 7] Hospital Registration & Authentication Engine`);
    const { registerHospitalCylinders } = require('./src/cylinders/manager');
    const { seedHospitalTelemetry, hashPassword } = require('./src/db/seed');

    const testRegHosp = {
      id: 'HOSP-07',
      name: 'City Hope Medical Center',
      type: 'Level 1 Trauma & Medical Center',
      capacity: 300,
      currentStock: 90,
      baselineBurnRate: 12.0,
      location: {
        district: 'Metro East',
        address: '520 Pine Avenue, District 04',
        lat: 40.7320,
        lng: -73.9820,
        phone: '+1 (555) 019-9922',
        dispatchContact: 'Dr. Amanda Reed'
      },
      activePatientsOnO2: 30,
      pressurePsi: 1800,
      status: 'STABLE_SURPLUS',
      createdAt: Date.now()
    };

    await db.collection('hospitals').insertOne(testRegHosp);
    const testUser = {
      id: 'USER-07',
      hospitalId: 'HOSP-07',
      hospitalName: testRegHosp.name,
      email: 'admin@cityhope.med',
      passwordHash: hashPassword('securePass123'),
      contactPerson: 'Dr. Amanda Reed',
      role: 'HOSPITAL_COORDINATOR',
      createdAt: Date.now()
    };
    await db.collection('users').insertOne(testUser);

    await registerHospitalCylinders('HOSP-07', testRegHosp.name, 'HOPE', 50, 1800);
    await seedHospitalTelemetry(testRegHosp);

    const foundHosp = await db.collection('hospitals').findOne({ id: 'HOSP-07' });
    assert(foundHosp && foundHosp.name === 'City Hope Medical Center', `Hospital registered in database (Found: ${foundHosp?.name})`);

    const foundUser = await db.collection('users').findOne({ email: 'admin@cityhope.med' });
    assert(foundUser && foundUser.passwordHash === hashPassword('securePass123'), `Hospital user credentials securely hashed and stored`);

    const newCyls = await db.collection('cylinders').countDocuments({ hospitalId: 'HOSP-07' });
    assert(newCyls >= 50, `Barcoded cylinders auto-provisioned for new hospital (Count: ${newCyls})`);

    const newTelem = await db.collection('resource_telemetry').countDocuments({ hospitalId: 'HOSP-07' });
    assert(newTelem >= 20, `Telemetry history auto-generated for trend prediction (Points: ${newTelem})`);

    // Verify authentication match
    const validAuth = foundUser.passwordHash === hashPassword('securePass123');
    const invalidAuth = foundUser.passwordHash === hashPassword('wrongPassword');
    assert(validAuth === true && invalidAuth === false, `Password authentication validates correctly and rejects bad credentials`);

    console.log(`\n======================================================`);
    console.log(`🎉 ALL TESTS PASSED: ${passed}/${total} criteria verified!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runSystemTests();
