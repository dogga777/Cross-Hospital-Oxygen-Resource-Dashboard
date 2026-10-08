const { predictDistrictShortages } = require('../ml/predictor');
const { getTransitInfo } = require('../db/seed');

async function generateRebalancePlan() {
  const predictions = await predictDistrictShortages();

  // Separate into deficit (recipients) and surplus (donors)
  const deficitHospitals = predictions
    .filter(p => p.timeToShortageHours <= 4.0 || p.currentStock <= p.criticalThreshold)
    .sort((a, b) => a.timeToShortageHours - b.timeToShortageHours); // most urgent first

  const surplusDonors = predictions
    .filter(p => p.transferableUnits >= 15 && p.surplusRunwayHours >= 5.0)
    .sort((a, b) => b.transferableUnits - a.transferableUnits); // largest surplus first

  const recommendations = [];

  // Track remaining transferable units per donor in this rebalance cycle
  const donorAvailableUnits = new Map();
  surplusDonors.forEach(d => {
    donorAvailableUnits.set(d.hospitalId, d.transferableUnits);
  });

  for (const recipient of deficitHospitals) {
    // Determine required units to extend recipient to 5.5 hours of runway
    const targetRunwayHours = 5.5;
    const neededUnits = Math.max(
      20,
      Math.min(
        70,
        Math.round((recipient.depletionRatePerHour * targetRunwayHours) - (recipient.currentStock - recipient.criticalThreshold))
      )
    );

    // Score available donors based on proximity and surplus adequacy
    let bestDonor = null;
    let bestScore = -Infinity;
    let bestTransit = null;

    for (const donor of surplusDonors) {
      const available = donorAvailableUnits.get(donor.hospitalId) || 0;
      if (available < 15) continue; // skip if exhausted

      const transit = getTransitInfo(donor.hospitalId, recipient.hospitalId);
      // Proximity penalty + surplus reward score
      const score = (available * 1.5) - (transit.transitMinutes * 2);

      if (score > bestScore) {
        bestScore = score;
        bestDonor = donor;
        bestTransit = transit;
      }
    }

    if (bestDonor && bestTransit) {
      const available = donorAvailableUnits.get(bestDonor.hospitalId);
      const transferQty = Math.min(neededUnits, available);

      // Deduct from temporary pool
      donorAvailableUnits.set(bestDonor.hospitalId, available - transferQty);

      // Calculate post-transfer metrics
      const newRecipientStock = recipient.currentStock + transferQty;
      const recipientNewRunway = +( (newRecipientStock - recipient.criticalThreshold) / recipient.depletionRatePerHour ).toFixed(1);

      const donorRemainingStock = bestDonor.currentStock - transferQty;
      const donorRemainingSurplus = +( (donorRemainingStock - bestDonor.safetyReserve) / bestDonor.depletionRatePerHour ).toFixed(1);

      // Urgency and deadline calculation
      const safeDeadlineMinutes = Math.max(15, Math.round(recipient.timeToShortageHours * 60 * 0.7));
      const urgencyRank = recipient.timeToShortageHours <= 2.0 ? 'CRITICAL' : (recipient.timeToShortageHours <= 3.5 ? 'HIGH' : 'MEDIUM');

      const byWhenText = recipient.timeToShortageHours <= 1.0
        ? `IMMEDIATE (Within ${bestTransit.transitMinutes + 10} mins)`
        : `Within ${Math.min(safeDeadlineMinutes, 90)} mins (Transit ETA: ${bestTransit.transitMinutes} mins)`;

      recommendations.push({
        id: `REC-${Date.now()}-${recommendations.length + 1}`,
        rank: recommendations.length + 1,
        urgency: urgencyRank,
        donorId: bestDonor.hospitalId,
        donorName: bestDonor.hospitalName,
        donorCurrentStock: bestDonor.currentStock,
        donorBurnRate: bestDonor.depletionRatePerHour,
        donorSurplusHours: bestDonor.surplusRunwayHours,
        donorRemainingSurplusHours: donorRemainingSurplus,

        recipientId: recipient.hospitalId,
        recipientName: recipient.hospitalName,
        recipientCurrentStock: recipient.currentStock,
        recipientBurnRate: recipient.depletionRatePerHour,
        recipientDepletionHours: recipient.timeToShortageHours,
        recipientNewRunwayHours: recipientNewRunway,

        transferQuantity: transferQty,
        resourceType: 'Oxygen Cylinders',
        transitDistanceKm: bestTransit.distanceKm,
        transitMinutes: bestTransit.transitMinutes,
        byWhen: byWhenText,
        deadlineMinutes: safeDeadlineMinutes,

        // Will be enriched by Gemini
        geminiJustification: null
      });
    }
  }

  return {
    timestamp: Date.now(),
    generatedAt: new Date().toISOString(),
    totalRecommendations: recommendations.length,
    districtStatus: recommendations.length === 0 ? 'BALANCED' : 'REBALANCE_REQUIRED',
    recommendations,
    predictions
  };
}

module.exports = {
  generateRebalancePlan
};
