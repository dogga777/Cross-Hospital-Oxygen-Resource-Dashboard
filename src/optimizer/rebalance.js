const { predictDistrictShortages } = require('../ml/predictor');
const { getTransitInfo, getRandomDispatchDetails } = require('../db/seed');

async function generateRebalancePlan() {
  const predictions = await predictDistrictShortages();

  // Deficit Hospitals: strictly prioritize any hospital with 20 or fewer cylinders, or running out in < 3.5h
  const deficitHospitals = predictions
    .filter(p => p.currentStock <= 20 || p.timeToShortageHours <= 3.5)
    .sort((a, b) => {
      // Emergency priority: any hospital <= 20 cylinders comes FIRST
      const aIsEmergency = a.currentStock <= 20;
      const bIsEmergency = b.currentStock <= 20;
      if (aIsEmergency && !bIsEmergency) return -1;
      if (!aIsEmergency && bIsEmergency) return 1;
      return a.currentStock - b.currentStock; // lowest stock first
    });

  // Potential Donors: sorted by who has the MOST cylinders
  const allDonors = [...predictions]
    .filter(p => p.currentStock > 40 && p.surplusRunwayHours >= 4.0)
    .sort((a, b) => b.currentStock - a.currentStock); // HIGHEST stock first

  const recommendations = [];
  const donorAvailableUnits = new Map();
  allDonors.forEach(d => {
    donorAvailableUnits.set(d.hospitalId, Math.max(15, d.transferableUnits || Math.floor(d.currentStock * 0.4)));
  });

  for (const recipient of deficitHospitals) {
    // Find the donor hospital that has the MOST cylinders available
    let bestDonor = null;
    let highestStock = -1;

    for (const donor of allDonors) {
      if (donor.hospitalId === recipient.hospitalId) continue;
      const available = donorAvailableUnits.get(donor.hospitalId) || 0;
      if (available < 15) continue;

      if (donor.currentStock > highestStock) {
        highestStock = donor.currentStock;
        bestDonor = donor;
      }
    }

    if (bestDonor) {
      const transit = getTransitInfo(bestDonor.hospitalId, recipient.hospitalId);
      const dispatch = getRandomDispatchDetails();

      // Transfer quantity: if recipient has <= 20 cyl, transfer 40-60 cylinders immediately
      let transferQty = 40;
      if (recipient.currentStock <= 20) {
        transferQty = Math.min(60, Math.max(30, Math.round(recipient.capacity * 0.25)));
      } else {
        transferQty = Math.min(50, Math.max(20, Math.round(recipient.depletionRatePerHour * 4)));
      }

      const available = donorAvailableUnits.get(bestDonor.hospitalId);
      transferQty = Math.min(transferQty, available);
      donorAvailableUnits.set(bestDonor.hospitalId, available - transferQty);

      const newRecipientStock = Math.round(recipient.currentStock + transferQty);
      const donorRemainingStock = Math.round(bestDonor.currentStock - transferQty);

      const isUnder20Emergency = recipient.currentStock <= 20;
      const urgencyRank = isUnder20Emergency ? 'EMERGENCY (≤ 20 CYLINDERS)' : (recipient.timeToShortageHours <= 2.0 ? 'CRITICAL' : 'HIGH');

      recommendations.push({
        id: `REC-${Date.now()}-${recommendations.length + 1}`,
        rank: recommendations.length + 1,
        urgency: urgencyRank,
        isUnder20Emergency,

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
        byWhen: isUnder20Emergency ? `IMMEDIATE DISPATCH (ETA: ${transit.transitMinutes} mins)` : `Within 45 mins`,

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
    totalRecommendations: recommendations.length,
    districtStatus: recommendations.length === 0 ? 'BALANCED' : 'REBALANCE_REQUIRED',
    hospitalWithMostCylinders,
    hasEmergencyUnder20: recommendations.some(r => r.isUnder20Emergency),
    recommendations,
    predictions
  };
}

module.exports = {
  generateRebalancePlan
};
