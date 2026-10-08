const { getDb } = require('./mongo');

const INITIAL_HOSPITALS = [
  {
    id: 'HOSP-01',
    name: 'Metro General Hospital',
    type: 'Level 1 Trauma & Medical Center',
    capacity: 350,
    currentStock: 68,
    baselineBurnRate: 22.5, // units/hour
    location: { district: 'Central Metro', gridX: 45, gridY: 50, lat: 40.7128, lng: -74.0060 },
    activePatientsOnO2: 85,
    pressurePsi: 1450,
    status: 'SURGE_WARNING'
  },
  {
    id: 'HOSP-02',
    name: 'St. Jude Medical Center',
    type: 'Tertiary Teaching Hospital',
    capacity: 320,
    currentStock: 248,
    baselineBurnRate: 7.2,
    location: { district: 'Northside Hills', gridX: 52, gridY: 22, lat: 40.7484, lng: -73.9857 },
    activePatientsOnO2: 32,
    pressurePsi: 2150,
    status: 'SURPLUS_AVAILABLE'
  },
  {
    id: 'HOSP-03',
    name: 'Riverbank Emergency Annex',
    type: 'Critical Overflow Ward',
    capacity: 160,
    currentStock: 28,
    baselineBurnRate: 14.8,
    location: { district: 'River Basin South', gridX: 38, gridY: 72, lat: 40.6892, lng: -74.0445 },
    activePatientsOnO2: 44,
    pressurePsi: 980,
    status: 'ACUTE_SHORTAGE_IMMINENT'
  },
  {
    id: 'HOSP-04',
    name: 'Oak Valley Community Hospital',
    type: 'Suburban Community Care',
    capacity: 200,
    currentStock: 158,
    baselineBurnRate: 3.8,
    location: { district: 'East Valley', gridX: 78, gridY: 42, lat: 40.7282, lng: -73.7949 },
    activePatientsOnO2: 18,
    pressurePsi: 2080,
    status: 'STABLE_SURPLUS'
  },
  {
    id: 'HOSP-05',
    name: 'Mercy Urban Care',
    type: 'Urban Acute Clinic',
    capacity: 220,
    currentStock: 86,
    baselineBurnRate: 11.4,
    location: { district: 'Westside Heights', gridX: 20, gridY: 46, lat: 40.7580, lng: -73.9855 },
    activePatientsOnO2: 39,
    pressurePsi: 1520,
    status: 'MONITORING'
  },
  {
    id: 'HOSP-06',
    name: 'Highland Specialty Institute',
    type: 'Elective & Surgical Specialty',
    capacity: 180,
    currentStock: 152,
    baselineBurnRate: 2.1,
    location: { district: 'Highland Ridge', gridX: 70, gridY: 18, lat: 40.7831, lng: -73.9712 },
    activePatientsOnO2: 12,
    pressurePsi: 2200,
    status: 'HIGH_SURPLUS_AVAILABLE'
  }
];

// Calculate transport distance (km) and travel time (minutes) between hospitals
function getTransitInfo(hospAId, hospBId) {
  const hA = INITIAL_HOSPITALS.find(h => h.id === hospAId);
  const hB = INITIAL_HOSPITALS.find(h => h.id === hospBId);
  if (!hA || !hB) return { distanceKm: 5.0, transitMinutes: 15 };

  const dx = hA.location.gridX - hB.location.gridX;
  const dy = hA.location.gridY - hB.location.gridY;
  const gridDistance = Math.sqrt(dx * dx + dy * dy);
  const distanceKm = Math.max(1.8, +(gridDistance * 0.18).toFixed(1));
  // Average urban emergency logistics transit speed ~ 25 km/h + 5 min loading buffer
  const transitMinutes = Math.max(8, Math.round((distanceKm / 25) * 60 + 5));

  return { distanceKm, transitMinutes };
}

async function seedDatabaseIfEmpty() {
  const db = getDb();
  const hospitalsCol = db.collection('hospitals');
  const telemetryCol = db.collection('resource_telemetry');

  const count = await hospitalsCol.countDocuments();
  if (count === 0) {
    console.log('[Seed] Seeding 6 district hospitals...');
    await hospitalsCol.insertMany(INITIAL_HOSPITALS);
  }

  const telemetryCount = await telemetryCol.countDocuments();
  if (telemetryCount === 0) {
    console.log('[Seed] Generating initial 2-hour telemetry history for trend backtesting...');
    const now = Date.now();
    const historyDocs = [];

    for (const hosp of INITIAL_HOSPITALS) {
      // Generate 20 data points over the past 2 hours (every 6 minutes)
      const points = 20;
      const stepMs = 6 * 60 * 1000;
      const hourlyRate = hosp.baselineBurnRate;

      for (let i = points; i >= 0; i--) {
        const pointTime = now - (i * stepMs);
        const hoursAgo = (i * stepMs) / (3600 * 1000);
        // Stock at that time was currentStock + (hoursAgo * hourlyRate) + slight random noise
        const noise = (Math.sin(i * 1.5) * 1.2) + ((Math.random() - 0.5) * 1.0);
        const historicalStock = Math.min(
          hosp.capacity,
          Math.max(5, Math.round(hosp.currentStock + (hoursAgo * hourlyRate) + noise))
        );

        historyDocs.push({
          hospitalId: hosp.id,
          hospitalName: hosp.name,
          resourceType: 'Oxygen Cylinders (Type-D 40L)',
          timestamp: pointTime,
          currentStock: historicalStock,
          capacity: hosp.capacity,
          hourlyConsumptionRate: +(hourlyRate + (Math.sin(i) * 0.8)).toFixed(2),
          pressurePsi: Math.round(500 + (historicalStock / hosp.capacity) * 1700),
          activePatientsOnO2: Math.max(5, Math.round(hosp.activePatientsOnO2 + (Math.sin(i) * 3)))
        });
      }
    }

    await telemetryCol.insertMany(historyDocs);
    console.log(`[Seed] Seeded ${historyDocs.length} historical telemetry records.`);
  }
}

module.exports = {
  INITIAL_HOSPITALS,
  getTransitInfo,
  seedDatabaseIfEmpty
};
