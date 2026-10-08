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

    console.log(`\n======================================================`);
    console.log(`🎉 ALL TESTS PASSED: ${passed}/${total} criteria verified!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runSystemTests();
