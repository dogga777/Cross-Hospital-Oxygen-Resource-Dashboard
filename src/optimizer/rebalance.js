const { predictDistrictShortages } = require('../ml/predictor');
const { getTransitInfo, getRandomDispatchDetails } = require('../db/seed');

const DEFAULT_RULES = {
  emergencyThreshold: 20,
  batchQuantity: 40,
  pairingStrategy: 'HIGHEST_STOCK', // 'HIGHEST_STOCK' or 'SHORTEST_DISTANCE'
  autoDispatch: false
};

let currentRules = { ...DEFAULT_RULES };

function getOptimizerRules() {
  return { ...currentRules };
}

function setOptimizerRules(newRules = {}) {
  currentRules = {
    ...currentRules,
    ...newRules,
    emergencyThreshold: Number(newRules.emergencyThreshold ?? currentRules.emergencyThreshold),
    batchQuantity: Number(newRules.batchQuantity ?? currentRules.batchQuantity)
  };
  return { ...currentRules };
}

async function generateRebalancePlan(customRules = null) {
  const rules = customRules || currentRules;
  const emergencyThreshold = Number(rules.emergencyThreshold) || 20;
  const batchQuantity = Number(rules.batchQuantity) || 40;
  const pairingStrategy = rules.pairingStrategy || 'HIGHEST_STOCK';

  const predictions = await predictDistrictShortages();

  // Deficit Hospitals: strictly prioritize any hospital with emergencyThreshold or fewer cylinders, or running out in < 3.5h
  const deficitHospitals = predictions
    .filter(p => p.currentStock <= emergencyThreshold || p.timeToShortageHours <= 3.5)
    .sort((a, b) => {
      const aIsEmergency = a.currentStock <= emergencyThreshold;
      const bIsEmergency = b.currentStock <= emergencyThreshold;
      if (aIsEmergency && !bIsEmergency) return -1;
      if (!aIsEmergency && bIsEmergency) return 1;
      return a.currentStock - b.currentStock; // lowest stock first
    });

  // Potential Donors:
  const allDonors = [...predictions]
    .filter(p => p.currentStock > emergencyThreshold * 2 && p.surplusRunwayHours >= 3.0);

  if (pairingStrategy === 'HIGHEST_STOCK') {
    allDonors.sort((a, b) => b.currentStock - a.currentStock); // HIGHEST stock first
  }

  const recommendations = [];
  const donorAvailableUnits = new Map();
  allDonors.forEach(d => {
    donorAvailableUnits.set(d.hospitalId, Math.max(15, d.transferableUnits || Math.floor(d.currentStock * 0.4)));
  });

  for (const recipient of deficitHospitals) {
    let bestDonor = null;
    let bestScore = -Infinity;

    for (const donor of allDonors) {
      if (donor.hospitalId === recipient.hospitalId) continue;
      const available = donorAvailableUnits.get(donor.hospitalId) || 0;
      if (available < 15) continue;

      if (pairingStrategy === 'SHORTEST_DISTANCE') {
        const transit = getTransitInfo(donor.hospitalId, recipient.hospitalId);
        const score = -transit.distanceKm; // shorter distance has higher score
        if (score > bestScore) {
          bestScore = score;
          bestDonor = donor;
        }
      } else {
        // HIGHEST_STOCK
        if (donor.currentStock > bestScore) {
          bestScore = donor.currentStock;
          bestDonor = donor;
        }
      }
    }

    if (bestDonor) {
      const transit = getTransitInfo(bestDonor.hospitalId, recipient.hospitalId);
      const dispatch = getRandomDispatchDetails();

      let transferQty = batchQuantity;
      if (recipient.currentStock <= emergencyThreshold) {
        transferQty = Math.min(batchQuantity + 15, Math.max(30, Math.round(recipient.capacity * 0.25)));
      } else {
        transferQty = Math.min(batchQuantity, Math.max(20, Math.round(recipient.depletionRatePerHour * 4)));
      }

      const available = donorAvailableUnits.get(bestDonor.hospitalId);
      transferQty = Math.min(transferQty, available);
      donorAvailableUnits.set(bestDonor.hospitalId, available - transferQty);

      const newRecipientStock = Math.round(recipient.currentStock + transferQty);
      const donorRemainingStock = Math.round(bestDonor.currentStock - transferQty);

      const isUnderEmergency = recipient.currentStock <= emergencyThreshold;
      const urgencyRank = isUnderEmergency ? `EMERGENCY (≤ ${emergencyThreshold} CYLINDERS)` : (recipient.timeToShortageHours <= 2.0 ? 'CRITICAL' : 'HIGH');

      recommendations.push({
        id: `REC-${Date.now()}-${recommendations.length + 1}`,
        rank: recommendations.length + 1,
        urgency: urgencyRank,
        isUnder20Emergency: isUnderEmergency,
        emergencyThreshold,

        // Donor details (The hospital that has MORE cylinders)
        donorId: bestDonor.hospitalId,
        donorName: bestDonor.hospitalName,
        donorCurrentStock: bestDonor.currentStock,
        donorBurnRate: bestDonor.depletionRatePerHour,
        donorSurplusHours: bestDonor.surplusRunwayHours,
        donorRemainingStock,

        // Recipient details (The hospital in need)
        recipientId: recipient.hospitalId,
        recipientName: recipient.hospitalName,
        recipientCurrentStock: recipient.currentStock,
        recipientBurnRate: recipient.depletionRatePerHour,
        recipientDepletionHours: recipient.timeToShortageHours,
        newRecipientStock,

        // Logistics & Dispatch details
        transferQuantity: transferQty,
        resourceType: 'Oxygen Cylinders (Type-D 40L)',
        ambulanceNumber: dispatch.ambulanceNumber,
        deliveryDriver: dispatch.deliveryDriver,
        driverPhone: dispatch.driverPhone,
        driverBadge: dispatch.driverBadge,

        transitDistanceKm: transit.distanceKm,
        transitMinutes: transit.transitMinutes,
        byWhen: isUnderEmergency ? `IMMEDIATE DISPATCH (ETA: ${transit.transitMinutes} mins)` : `Within 45 mins`,
        pairingStrategy,
        geminiJustification: null
      });
    }
  }

  // Find which hospital currently has the ABSOLUTE MOST cylinders in the entire district
  const sortedByStock = [...predictions].sort((a, b) => b.currentStock - a.currentStock);
  const hospitalWithMostCylinders = sortedByStock[0] || null;

  return {
    timestamp: Date.now(),
    generatedAt: new Date().toISOString(),
    rules: { ...currentRules },
    totalRecommendations: recommendations.length,
    districtStatus: recommendations.length === 0 ? 'BALANCED' : 'REBALANCE_REQUIRED',
    hospitalWithMostCylinders,
    hasEmergencyUnder20: recommendations.some(r => r.isUnder20Emergency),
    recommendations,
    predictions
  };
}

module.exports = {
  generateRebalancePlan,
  getOptimizerRules,
  setOptimizerRules,
  DEFAULT_RULES
};
