const { getDb } = require('../db/mongo');
const config = require('../config');

// Ordinary Least Squares Linear Regression
function calculateLinearRegression(points) {
  // points: [{ x: timestampInMs, y: stockValue }]
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y || 0, rSquared: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  // Use normalized X (hours from first point) to avoid floating point precision issues
  const x0 = points[0].x;
  for (let i = 0; i < n; i++) {
    const x = (points[i].x - x0) / (3600 * 1000); // in hours
    const y = points[i].y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator; // units per hour
  const intercept = (sumY - slope * sumX) / n;

  // Compute R²
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const x = (points[i].x - x0) / (3600 * 1000);
    const yActual = points[i].y;
    const yPred = intercept + slope * x;
    ssTot += (yActual - meanY) ** 2;
    ssRes += (yActual - yPred) ** 2;
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - (ssRes / ssTot)));

  return {
    slope, // rate in units/hour (negative for depletion)
    intercept,
    rSquared,
    x0
  };
}

async function predictHospitalShortage(hospitalId) {
  const db = getDb();
  const hospital = await db.collection('hospitals').findOne({ id: hospitalId });
  if (!hospital) return null;

  // Fetch last 30 telemetry points for this hospital from MongoDB
  const telemetry = await db.collection('resource_telemetry')
    .find({ hospitalId })
    .sort({ timestamp: -1 })
    .limit(30)
    .toArray();

  telemetry.reverse(); // chronological order

  const currentStock = hospital.currentStock;
  const capacity = hospital.capacity;
  const criticalStockThreshold = Math.max(15, Math.round(capacity * 0.12));
  const safetyReserveStock = Math.max(25, Math.round(capacity * 0.22));

  let depletionRatePerHour = hospital.baselineBurnRate;
  let rSquared = 0.95;

  if (telemetry.length >= 3) {
    const points = telemetry.map(t => ({ x: t.timestamp, y: t.currentStock }));
    const regression = calculateLinearRegression(points);

    // If regression slope is negative, it represents depletion
    if (regression.slope < 0) {
      depletionRatePerHour = Math.abs(regression.slope);
    } else {
      // Use baseline or recent hourlyConsumptionRate
      const recentRate = telemetry[telemetry.length - 1].hourlyConsumptionRate;
      depletionRatePerHour = recentRate > 0 ? recentRate : hospital.baselineBurnRate;
    }
    rSquared = regression.rSquared;
  }

  // Calculate Time to Critical Shortage
  let timeToShortageHours = 0;
  if (currentStock <= criticalStockThreshold) {
    timeToShortageHours = 0;
  } else if (depletionRatePerHour <= 0.1) {
    timeToShortageHours = 999; // negligible depletion
  } else {
    timeToShortageHours = Math.max(0, (currentStock - criticalStockThreshold) / depletionRatePerHour);
  }

  // Calculate Surplus Runway (time until reaching safety reserve)
  let surplusRunwayHours = 0;
  if (currentStock > safetyReserveStock && depletionRatePerHour > 0.1) {
    surplusRunwayHours = Math.max(0, (currentStock - safetyReserveStock) / depletionRatePerHour);
  }

  // Calculate available transferable surplus (keeping minimum 6 hours of runway)
  const minRequiredStockFor6Hours = safetyReserveStock + (depletionRatePerHour * config.simulation.surplusThresholdHours);
  const transferableUnits = Math.max(0, Math.floor(currentStock - minRequiredStockFor6Hours));

  // Determine status classification
  let urgencyLevel = 'STABLE';
  if (timeToShortageHours <= 2.0 || currentStock <= criticalStockThreshold) {
    urgencyLevel = 'CRITICAL';
  } else if (timeToShortageHours <= config.simulation.criticalThresholdHours) {
    urgencyLevel = 'WARNING';
  } else if (surplusRunwayHours >= 8.0 && transferableUnits >= 20) {
    urgencyLevel = 'SURPLUS';
  }

  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    hospitalType: hospital.type,
    currentStock,
    capacity,
    pressurePsi: hospital.pressurePsi,
    criticalThreshold: criticalStockThreshold,
    safetyReserve: safetyReserveStock,
    depletionRatePerHour: +depletionRatePerHour.toFixed(2),
    timeToShortageHours: +timeToShortageHours.toFixed(2),
    surplusRunwayHours: +surplusRunwayHours.toFixed(2),
    transferableUnits,
    urgencyLevel,
    modelRSquared: +(rSquared * 100).toFixed(1)
  };
}

async function predictDistrictShortages() {
  const db = getDb();
  const hospitals = await db.collection('hospitals').find().toArray();
  const predictions = [];

  for (const hosp of hospitals) {
    const pred = await predictHospitalShortage(hosp.id);
    if (pred) predictions.push(pred);
  }

  return predictions;
}

module.exports = {
  calculateLinearRegression,
  predictHospitalShortage,
  predictDistrictShortages
};
