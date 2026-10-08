const { getDb } = require('./mongo');

const INITIAL_HOSPITALS = [
  {
    id: 'HOSP-01',
    name: 'Metro General Hospital',
    type: 'Level 1 Trauma & Medical Center',
    capacity: 350,
    currentStock: 68,
    baselineBurnRate: 22.5, // units/hour
    location: {
      district: 'Central Metro',
      address: '740 Metro Parkway, Downtown Medical Corridor, District 04',
      gridX: 45,
      gridY: 50,
      lat: 40.7128,
      lng: -74.0060,
      phone: '+1 (555) 012-4921',
      dispatchContact: 'Dr. Sarah Chen (Trauma Logistics Coordinator)'
    },
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
    location: {
      district: 'Northside Hills',
      address: '350 Northwood Blvd, Northside Medical Park, District 04',
      gridX: 52,
      gridY: 22,
      lat: 40.7484,
      lng: -73.9857,
      phone: '+1 (555) 018-7740',
      dispatchContact: 'Officer Marcus Brody (Regional Cryo Logistics)'
    },
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
    location: {
      district: 'River Basin South',
      address: '112 Riverbank Way, River Basin Waterfront, District 04',
      gridX: 38,
      gridY: 72,
      lat: 40.6892,
      lng: -74.0445,
      phone: '+1 (555) 014-3882',
      dispatchContact: 'Nurse Supervisor Elena Gomez (Emergency Intake)'
    },
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
    location: {
      district: 'East Valley',
      address: '880 East Valley Road, Suburban Healthcare Complex, District 04',
      gridX: 78,
      gridY: 42,
      lat: 40.7282,
      lng: -73.7949,
      phone: '+1 (555) 019-9214',
      dispatchContact: 'Dispatch Chief Alan Wright (District Suburb Unit)'
    },
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
    location: {
      district: 'Westside Heights',
      address: '215 Westside Plaza, Westside Urban Corridor, District 04',
      gridX: 20,
      gridY: 46,
      lat: 40.7580,
      lng: -73.9855,
      phone: '+1 (555) 016-5531',
      dispatchContact: 'Coordinator Denise Vance (Acute Supply Ops)'
    },
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
    location: {
      district: 'Highland Ridge',
      address: '500 Highland Ridge Road, Highland Surgical Park, District 04',
      gridX: 70,
      gridY: 18,
      lat: 40.7831,
      lng: -73.9712,
      phone: '+1 (555) 017-8109',
      dispatchContact: 'Officer Kevin Thorne (Surgical Resource Reserves)'
    },
    activePatientsOnO2: 12,
    pressurePsi: 2200,
    status: 'HIGH_SURPLUS_AVAILABLE'
  }
];

// Logistics Vehicle Fleet and Driver Profiles
const DISPATCH_AMBULANCES = [
  'MED-AMB-408',
  'CRYO-VAN-215',
  'RAPID-O2-104',
  'MED-LOG-512',
  'EMERG-VAN-309',
  'DISTRICT-AMB-77'
];

const DISPATCH_DRIVERS = [
  { name: 'Officer Rajesh Kumar', phone: '+1 (555) 839-2041', badge: 'LOG-772' },
  { name: 'Driver Michael Vance', phone: '+1 (555) 942-1852', badge: 'LOG-419' },
  { name: 'Specialist Priya Patel', phone: '+1 (555) 761-3904', badge: 'LOG-603' },
  { name: 'Paramedic Carlos Mendez', phone: '+1 (555) 628-4417', badge: 'LOG-315' },
  { name: 'Driver David Ross', phone: '+1 (555) 519-8830', badge: 'LOG-551' }
];

function getRandomDispatchDetails() {
  const ambulance = DISPATCH_AMBULANCES[Math.floor(Math.random() * DISPATCH_AMBULANCES.length)];
  const driver = DISPATCH_DRIVERS[Math.floor(Math.random() * DISPATCH_DRIVERS.length)];
  return {
    ambulanceNumber: ambulance,
    deliveryDriver: driver.name,
    driverPhone: driver.phone,
    driverBadge: driver.badge
  };
}

// Calculate transport distance (km) and travel time (minutes) between hospitals
function getTransitInfo(hospAId, hospBId) {
  const hA = INITIAL_HOSPITALS.find(h => h.id === hospAId);
  const hB = INITIAL_HOSPITALS.find(h => h.id === hospBId);
  if (!hA || !hB) return { distanceKm: 5.0, transitMinutes: 15 };

  const dx = hA.location.gridX - hB.location.gridX;
  const dy = hA.location.gridY - hB.location.gridY;
  const gridDistance = Math.sqrt(dx * dx + dy * dy);
  const distanceKm = Math.max(1.8, +(gridDistance * 0.18).toFixed(1));
  const transitMinutes = Math.max(8, Math.round((distanceKm / 25) * 60 + 5));

  return { distanceKm, transitMinutes };
}

async function seedDatabaseIfEmpty() {
  const db = getDb();
  const hospitalsCol = db.collection('hospitals');
  const telemetryCol = db.collection('resource_telemetry');
  const transfersCol = db.collection('transfer_logs');

  const count = await hospitalsCol.countDocuments();
  if (count === 0) {
    console.log('[Seed] Seeding 6 district hospitals with addresses & contacts...');
    await hospitalsCol.insertMany(INITIAL_HOSPITALS);
  }

  const telemetryCount = await telemetryCol.countDocuments();
  if (telemetryCount === 0) {
    console.log('[Seed] Generating initial 2-hour telemetry history for trend backtesting...');
    const now = Date.now();
    const historyDocs = [];

    for (const hosp of INITIAL_HOSPITALS) {
      const points = 20;
      const stepMs = 6 * 60 * 1000;
      const hourlyRate = hosp.baselineBurnRate;

      for (let i = points; i >= 0; i--) {
        const pointTime = now - (i * stepMs);
        const hoursAgo = (i * stepMs) / (3600 * 1000);
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

  // Pre-seed realistic past transfer manifests if empty
  const transferCount = await transfersCol.countDocuments();
  if (transferCount === 0) {
    console.log('[Seed] Seeding sample transfer manifests with ambulance, driver & contact details...');
    const now = Date.now();
    const sampleTransfers = [
      {
        manifestId: 'MAN-2026-0418',
        timestamp: now - (90 * 60 * 1000), // 1.5 hours ago
        quantity: 35,
        resourceType: 'Oxygen Cylinders (Type-D 40L)',
        donorId: 'HOSP-02',
        donorName: 'St. Jude Medical Center',
        donorAddress: '350 Northwood Blvd, Northside Medical Park, District 04',
        donorContact: '+1 (555) 018-7740',
        recipientId: 'HOSP-01',
        recipientName: 'Metro General Hospital',
        recipientAddress: '740 Metro Parkway, Downtown Medical Corridor, District 04',
        recipientContact: '+1 (555) 012-4921',
        ambulanceNumber: 'MED-AMB-408',
        deliveryDriver: 'Officer Rajesh Kumar',
        driverPhone: '+1 (555) 839-2041',
        driverBadge: 'LOG-772',
        transitDistanceKm: 4.2,
        transitMinutes: 14,
        geminiJustification: 'Move 35 units from St. Jude Medical Center to Metro General Hospital — St. Jude has 28hrs surplus, Metro General depletes in 1.9hrs',
        status: 'DELIVERED'
      },
      {
        manifestId: 'MAN-2026-0419',
        timestamp: now - (45 * 60 * 1000), // 45 mins ago
        quantity: 50,
        resourceType: 'Oxygen Cylinders (Type-D 40L)',
        donorId: 'HOSP-06',
        donorName: 'Highland Specialty Institute',
        donorAddress: '500 Highland Ridge Road, Highland Surgical Park, District 04',
        donorContact: '+1 (555) 017-8109',
        recipientId: 'HOSP-03',
        recipientName: 'Riverbank Emergency Annex',
        recipientAddress: '112 Riverbank Way, River Basin Waterfront, District 04',
        recipientContact: '+1 (555) 014-3882',
        ambulanceNumber: 'CRYO-VAN-215',
        deliveryDriver: 'Specialist Priya Patel',
        driverPhone: '+1 (555) 761-3904',
        driverBadge: 'LOG-603',
        transitDistanceKm: 7.8,
        transitMinutes: 22,
        geminiJustification: 'Move 50 units from Highland Specialty Institute to Riverbank Emergency Annex — Highland has 55hrs surplus, Riverbank depletes in 0.8hrs',
        status: 'DELIVERED'
      }
    ];

    await transfersCol.insertMany(sampleTransfers);
    console.log(`[Seed] Seeded ${sampleTransfers.length} completed transfer manifests.`);
  }
}

module.exports = {
  INITIAL_HOSPITALS,
  DISPATCH_AMBULANCES,
  DISPATCH_DRIVERS,
  getRandomDispatchDetails,
  getTransitInfo,
  seedDatabaseIfEmpty
};
