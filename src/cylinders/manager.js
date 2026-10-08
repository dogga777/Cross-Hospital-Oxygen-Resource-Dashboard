const { getDb } = require('../db/mongo');

// Generate realistic barcoded cylinders for a hospital
function generateCylinderBatch(hospitalId, hospitalName, prefix, count, initialPressure = 2000) {
  const wards = ['ICU Ward A', 'Emergency Trauma Bay', 'Surgical Theater 2', 'Pediatric Acute Care', 'Central Cryo Depot'];
  const cylinders = [];
  
  for (let i = 1; i <= count; i++) {
    const numStr = String(i).padStart(3, '0');
    const serial = `O2-${prefix}-${numStr}`;
    const ward = wards[(i - 1) % wards.length];
    const isUnderPressure = i % 15 === 0;

    cylinders.push({
      serialNumber: serial,
      barcode: `*${serial}*`,
      hospitalId,
      hospitalName,
      status: 'IN_STOCK',
      wardAssignment: ward,
      gasType: 'Medical Oxygen (O2 99.5% USP)',
      capacityLitres: 40,
      pressurePsi: isUnderPressure ? 1150 : Math.round(initialPressure + (Math.sin(i) * 120)),
      purity: '99.5%',
      tareWeightKg: 14.2,
      lastInspected: new Date(Date.now() - (i * 86400000 * 2)).toISOString().split('T')[0],
      batchNumber: `BAT-2026-${prefix}`,
      createdAt: Date.now()
    });
  }
  return cylinders;
}

// Seed Cylinders collection if empty
async function seedCylindersIfEmpty() {
  const db = getDb();
  const col = db.collection('cylinders');
  const count = await col.countDocuments();

  if (count === 0) {
    console.log('[Cylinders] Seeding barcoded oxygen cylinders across all hospitals...');
    const allCylinders = [
      ...generateCylinderBatch('HOSP-01', 'Metro General Hospital', 'METRO', 70, 2050),
      ...generateCylinderBatch('HOSP-02', 'St. Jude Medical Center', 'JUDE', 248, 2200),
      ...generateCylinderBatch('HOSP-03', 'Riverbank Emergency Annex', 'RVR', 28, 1950),
      ...generateCylinderBatch('HOSP-04', 'Oak Valley Community Hospital', 'OAK', 158, 2080),
      ...generateCylinderBatch('HOSP-05', 'Mercy Urban Care', 'MRCY', 86, 2000),
      ...generateCylinderBatch('HOSP-06', 'Highland Specialty Institute', 'HGH', 190, 2150)
    ];

    await col.insertMany(allCylinders);
    console.log(`[Cylinders] ✓ Seeded ${allCylinders.length} barcoded cylinders with unique serial numbers.`);
  }
}

// Get cylinders for a hospital
async function getCylinders(hospitalId, status = null) {
  const db = getDb();
  const query = { hospitalId };
  if (status) query.status = status;
  return await db.collection('cylinders').find(query).toArray();
}

// Barcode Scan Handler: Consumes, Receives, or Inspects a cylinder
async function processBarcodeScan(serialNumber, action = 'CONSUME', currentHospitalId = null) {
  const db = getDb();
  const col = db.collection('cylinders');
  const hospCol = db.collection('hospitals');

  // Find cylinder by serial or barcode text
  const cleanSerial = serialNumber.trim().toUpperCase().replace(/\*/g, '');
  let cylinder = await col.findOne({ serialNumber: cleanSerial });

  if (!cylinder) {
    // If not found, create a dynamic ad-hoc cylinder record
    const targetHospId = currentHospitalId || 'HOSP-01';
    const hosp = await hospCol.findOne({ id: targetHospId });
    cylinder = {
      serialNumber: cleanSerial,
      barcode: `*${cleanSerial}*`,
      hospitalId: targetHospId,
      hospitalName: hosp?.name || 'District Facility',
      status: 'IN_STOCK',
      wardAssignment: 'Emergency Intake Depot',
      gasType: 'Medical Oxygen (O2 99.5% USP)',
      capacityLitres: 40,
      pressurePsi: 2000,
      purity: '99.5%',
      tareWeightKg: 14.2,
      lastInspected: new Date().toISOString().split('T')[0],
      batchNumber: 'BAT-2026-INBOUND',
      createdAt: Date.now()
    };
    await col.insertOne(cylinder);
  }

  const hospId = cylinder.hospitalId;
  const hospital = await hospCol.findOne({ id: hospId });
  let stockChange = 0;
  let newStatus = cylinder.status;

  if (action === 'CONSUME') {
    newStatus = 'IN_USE';
    stockChange = -1;
  } else if (action === 'RECEIVE') {
    newStatus = 'IN_STOCK';
    stockChange = +1;
  }

  // Update cylinder status
  await col.updateOne(
    { serialNumber: cleanSerial },
    {
      $set: {
        status: newStatus,
        lastScannedAt: Date.now()
      }
    }
  );

  // Update hospital current stock in MongoDB
  let updatedStock = hospital.currentStock;
  if (stockChange !== 0) {
    updatedStock = Math.max(0, Math.round((hospital.currentStock + stockChange) * 10) / 10);
    await hospCol.updateOne(
      { id: hospId },
      { $set: { currentStock: updatedStock } }
    );
  }

  // Emergency Shortage Detection Check: If stock drops to <= 20 cylinders!
  let emergencyTriggered = false;
  let notificationCreated = null;

  if (updatedStock <= 20 && stockChange < 0) {
    emergencyTriggered = true;

    // Find the hospital with the MOST cylinders to be the recipient of this alert
    const allHospitals = await hospCol.find().sort({ currentStock: -1 }).toArray();
    const donorHosp = allHospitals.find(h => h.id !== hospId) || allHospitals[0];

    // Create an automatic cross-hospital shortage emergency notification
    const notifDoc = {
      id: `NOTIF-${Date.now()}`,
      fromHospitalId: hospId,
      fromHospitalName: hospital.name,
      toHospitalId: donorHosp.id,
      toHospitalName: donorHosp.name,
      type: 'CRITICAL_SHORTAGE_DETECTED',
      urgency: 'EMERGENCY (≤ 20 CYLINDERS)',
      currentStockLeft: updatedStock,
      requestedQuantity: 40,
      message: `🚨 CRITICAL ALERT: ${hospital.name} scanned a cylinder and oxygen reserve has dropped to ${updatedStock} cylinders (≤ 20 threshold)! Urgent dispatch requested from ${donorHosp.name}.`,
      status: 'PENDING_APPROVAL',
      timestamp: Date.now()
    };

    await db.collection('notifications').insertOne(notifDoc);
    notificationCreated = notifDoc;
    console.log(`[Notification] 🚨 Shortage detected for ${hospital.name}! Alert sent to ${donorHosp.name}`);
  }

  return {
    success: true,
    action,
    cylinder: {
      ...cylinder,
      status: newStatus
    },
    hospital: {
      id: hospId,
      name: hospital.name,
      previousStock: hospital.currentStock,
      currentStock: updatedStock
    },
    cylindersLeft: updatedStock,
    emergencyTriggered,
    notification: notificationCreated
  };
}

// Get notifications for a hospital
async function getNotifications(hospitalId = null) {
  const db = getDb();
  const query = {};
  if (hospitalId) {
    // Return notifications either sent to this hospital or sent by this hospital
    query.$or = [{ toHospitalId: hospitalId }, { fromHospitalId: hospitalId }];
  }
  return await db.collection('notifications')
    .find(query)
    .sort({ timestamp: -1 })
    .toArray();
}

// Respond to cross-hospital notification (Approve & Dispatch or Dismiss)
async function respondToNotification(notificationId, action, responderHospitalId) {
  const db = getDb();
  const notif = await db.collection('notifications').findOne({ id: notificationId });
  if (!notif) throw new Error('Notification not found');

  if (action === 'APPROVE') {
    // Update notification status
    await db.collection('notifications').updateOne(
      { id: notificationId },
      { $set: { status: 'DISPATCHED', resolvedAt: Date.now() } }
    );

    // Automatically execute the rebalance transfer in the simulator
    const simulator = require('../simulator/stream');
    const transferResult = await simulator.executeTransfer(
      notif.toHospitalId, // Donor
      notif.fromHospitalId, // Recipient in need
      notif.requestedQuantity || 40,
      `Emergency dispatch approved by ${notif.toHospitalName} in response to notification ${notificationId}`
    );

    return {
      success: true,
      action: 'APPROVED_AND_DISPATCHED',
      notification: notif,
      transfer: transferResult
    };
  } else {
    await db.collection('notifications').updateOne(
      { id: notificationId },
      { $set: { status: 'DISMISSED', resolvedAt: Date.now() } }
    );
    return { success: true, action: 'DISMISSED', notification: notif };
  }
}

module.exports = {
  seedCylindersIfEmpty,
  getCylinders,
  processBarcodeScan,
  getNotifications,
  respondToNotification
};
