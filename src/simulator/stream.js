const { getDb } = require('../db/mongo');
const { INITIAL_HOSPITALS } = require('../db/seed');
const config = require('../config');

class HospitalStreamSimulator {
  constructor() {
    this.intervalMs = config.simulation.defaultIntervalMs;
    this.timer = null;
    this.listeners = new Set();
    this.isRunning = false;
    this.surgeMultipliers = new Map(); // hospitalId -> multiplier
  }

  onTick(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(data) {
    for (const cb of this.listeners) {
      try {
        cb(data);
      } catch (err) {
        console.error('[Simulator] Error in listener callback:', err);
      }
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Simulator] Live resource feed started (Interval: ${this.intervalMs}ms)`);
    this.timer = setInterval(() => this.step(), this.intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Simulator] Live resource feed paused.');
  }

  setInterval(ms) {
    this.intervalMs = Math.max(500, Math.min(10000, ms));
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // Inject a sudden demand surge or leak event (for live presentations)
  injectSurge(hospitalId, multiplier = 2.5) {
    this.surgeMultipliers.set(hospitalId, multiplier);
    console.log(`[Simulator] Injected demand surge x${multiplier} for hospital ${hospitalId}`);

    // Auto-decay surge over 45 seconds
    setTimeout(() => {
      this.surgeMultipliers.delete(hospitalId);
      console.log(`[Simulator] Demand surge normalized for hospital ${hospitalId}`);
    }, 45000);
  }

  // Inject delivery / replenishment
  async injectDelivery(hospitalId, quantity = 50) {
    const db = getDb();
    const hosp = await db.collection('hospitals').findOne({ id: hospitalId });
    if (!hosp) return;

    const newStock = Math.min(hosp.capacity, hosp.currentStock + quantity);
    await db.collection('hospitals').updateOne(
      { id: hospitalId },
      { $set: { currentStock: newStock } }
    );
    console.log(`[Simulator] Delivery received at ${hosp.name}: +${quantity} cylinders (New stock: ${newStock})`);
  }

  // Force-set stock for emergency testing
  async setStock(hospitalId, stock) {
    const db = getDb();
    const stockVal = Math.max(1, Math.round(stock * 10) / 10);
    const hosp = await db.collection('hospitals').findOne({ id: hospitalId });
    if (!hosp) throw new Error('Hospital not found');
    const pressurePsi = Math.round(300 + (stockVal / hosp.capacity) * 1900);
    await db.collection('hospitals').updateOne(
      { id: hospitalId },
      { $set: { currentStock: stockVal, pressurePsi } }
    );
    console.log(`[Simulator] Stock manually set for ${hosp.name}: ${stockVal} cylinders`);
    await this.step();
  }

  // Execute a cross-hospital rebalance transfer
  async executeTransfer(donorId, recipientId, quantity, geminiJustification = '') {
    const db = getDb();
    const donor = await db.collection('hospitals').findOne({ id: donorId });
    const recipient = await db.collection('hospitals').findOne({ id: recipientId });

    if (!donor || !recipient) {
      throw new Error('Hospital not found');
    }

    const actualQty = Math.min(quantity, Math.max(0, donor.currentStock - 10));
    if (actualQty <= 0) {
      throw new Error(`Donor ${donor.name} has insufficient stock to transfer`);
    }

    const newDonorStock = donor.currentStock - actualQty;
    const newRecipientStock = Math.min(recipient.capacity, recipient.currentStock + actualQty);

    await db.collection('hospitals').updateOne(
      { id: donorId },
      { $set: { currentStock: newDonorStock } }
    );

    await db.collection('hospitals').updateOne(
      { id: recipientId },
      { $set: { currentStock: newRecipientStock } }
    );

    // Get transit and dispatch logistics info
    const { getRandomDispatchDetails, getTransitInfo } = require('../db/seed');
    const dispatch = getRandomDispatchDetails();
    const transit = getTransitInfo(donorId, recipientId);

    // Reallocate barcoded oxygen cylinders from donor to recipient in database
    const donorCylinders = await db.collection('cylinders')
      .find({ hospitalId: donorId })
      .limit(actualQty)
      .toArray();

    const manifestId = `MAN-${Date.now().toString().slice(-6)}`;
    let cylinderBarcodes = [];

    if (donorCylinders.length > 0) {
      const movedIds = donorCylinders.map(c => c._id);
      cylinderBarcodes = donorCylinders.map(c => c.serialNumber);

      // Reassign cylinders to recipient hospital
      if (typeof db.collection('cylinders').updateMany === 'function') {
        await db.collection('cylinders').updateMany(
          { _id: { $in: movedIds } },
          {
            $set: {
              hospitalId: recipientId,
              hospitalName: recipient.name,
              lastTransferredFrom: donor.name,
              lastTransferredTo: recipient.name,
              lastManifestId: manifestId,
              lastTransferredAt: Date.now()
            }
          }
        );
      } else {
        for (const cid of movedIds) {
          await db.collection('cylinders').updateOne(
            { _id: cid },
            {
              $set: {
                hospitalId: recipientId,
                hospitalName: recipient.name,
                lastTransferredFrom: donor.name,
                lastTransferredTo: recipient.name,
                lastManifestId: manifestId,
                lastTransferredAt: Date.now()
              }
            }
          );
        }
      }
    } else {
      // Generate realistic serials if donor docs hadn't been individually initialized
      const cleanPrefix = (donor.name || 'GEN').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'GEN';
      cylinderBarcodes = Array.from({ length: actualQty }, (_, i) => `O2-${cleanPrefix}-${String(i + 1).padStart(3, '0')}`);
    }

    // Record complete transfer manifest
    const transferDoc = {
      manifestId,
      donorId,
      donorName: donor.name,
      donorAddress: donor.location?.address || 'District Facility',
      donorContact: donor.location?.phone || '+1 (555) 000-0000',
      recipientId,
      recipientName: recipient.name,
      recipientAddress: recipient.location?.address || 'District Facility',
      recipientContact: recipient.location?.phone || '+1 (555) 000-0000',
      quantity: actualQty,
      cylinderBarcodes,
      resourceType: 'Oxygen Cylinders (Type-D 40L)',
      ambulanceNumber: dispatch.ambulanceNumber,
      deliveryDriver: dispatch.deliveryDriver,
      driverPhone: dispatch.driverPhone,
      driverBadge: dispatch.driverBadge,
      transitDistanceKm: transit.distanceKm,
      transitMinutes: transit.transitMinutes,
      geminiJustification,
      timestamp: Date.now(),
      status: 'DELIVERED'
    };

    await db.collection('transfer_logs').insertOne(transferDoc);

    // Also record detailed individual cylinder movement tracking records
    const movementRecords = cylinderBarcodes.map((serial, idx) => ({
      movementId: `MOV-${manifestId}-${String(idx + 1).padStart(3, '0')}`,
      manifestId,
      barcode: `*${serial}*`,
      serialNumber: serial,
      fromHospitalId: donorId,
      fromHospitalName: donor.name,
      toHospitalId: recipientId,
      toHospitalName: recipient.name,
      timestamp: transferDoc.timestamp,
      ambulanceNumber: dispatch.ambulanceNumber,
      deliveryDriver: dispatch.deliveryDriver,
      driverPhone: dispatch.driverPhone,
      transitDistanceKm: transit.distanceKm,
      transitMinutes: transit.transitMinutes,
      status: 'DELIVERED'
    }));

    if (movementRecords.length > 0) {
      await db.collection('cylinder_movements').insertMany(movementRecords);
    }

    console.log(`[Simulator] ✓ Rebalance transfer executed: ${actualQty} cylinders from ${donor.name} -> ${recipient.name} (Vehicle: ${dispatch.ambulanceNumber}, Driver: ${dispatch.deliveryDriver}, Barcodes: ${cylinderBarcodes.length})`);

    // Trigger immediate step so clients see the rebalance right away
    await this.step();
    return transferDoc;
  }

  async reset() {
    const db = getDb();
    await db.collection('resource_telemetry').deleteMany({});
    for (const h of INITIAL_HOSPITALS) {
      await db.collection('hospitals').updateOne(
        { id: h.id },
        {
          $set: {
            currentStock: h.currentStock,
            activePatientsOnO2: h.activePatientsOnO2,
            pressurePsi: h.pressurePsi,
            status: h.status
          }
        }
      );
    }
    const { seedDatabaseIfEmpty } = require('../db/seed');
    await seedDatabaseIfEmpty();
    this.simulatedTime = Date.now();
    this.surgeMultipliers.clear();
    console.log('[Simulator] Reset all hospital stocks and re-seeded fresh telemetry.');
    await this.step();
  }

  // Single simulation step
  async step() {
    const db = getDb();
    const hospitals = await db.collection('hospitals').find().toArray();
    if (!hospitals || hospitals.length === 0) return;

    if (!this.simulatedTime) {
      this.simulatedTime = Date.now();
    }
    // Each tick advances simulation by 3 operational minutes (0.05 hours)
    const simulatedHoursElapsed = 0.05;
    this.simulatedTime += Math.round(simulatedHoursElapsed * 3600 * 1000);
    const now = this.simulatedTime;

    const telemetryBatch = [];
    const updatedHospitals = []; 

    for (const hosp of hospitals) {
      const surge = this.surgeMultipliers.get(hosp.id) || 1.0;
      const effectiveBurnRate = +(hosp.baselineBurnRate * surge * (0.95 + Math.random() * 0.1)).toFixed(2);

      // Decrement stock based on simulated rate
      const consumptionDelta = effectiveBurnRate * simulatedHoursElapsed;
      let newStock = hosp.currentStock - consumptionDelta;

      // When a hospital hits empty, routine scheduled supply delivery arrives
      if (newStock <= 5) {
        newStock = Math.round(hosp.capacity * 0.40);
      }
      newStock = Math.round(newStock * 10) / 10;

      // Calculate pressure in PSI based on remaining capacity
      const pressurePsi = Math.round(300 + (newStock / hosp.capacity) * 1900);

      // Fluctuate active patients slightly
      const patientNoise = (Math.random() - 0.5) * 2;
      const activePatients = Math.max(2, Math.round(hosp.activePatientsOnO2 + (surge > 1 ? 4 : 0) + patientNoise));

      // Update hospital document in MongoDB
      await db.collection('hospitals').updateOne(
        { id: hosp.id },
        {
          $set: {
            currentStock: newStock,
            currentBurnRate: effectiveBurnRate,
            pressurePsi,
            activePatientsOnO2: activePatients,
            lastTelemetryAt: now
          }
        }
      );

      const telemetryDoc = {
        hospitalId: hosp.id,
        hospitalName: hosp.name,
        resourceType: 'Oxygen Cylinders (Type-D 40L)',
        timestamp: now,
        currentStock: newStock,
        capacity: hosp.capacity,
        hourlyConsumptionRate: effectiveBurnRate,
        pressurePsi,
        activePatientsOnO2: activePatients,
        surgeActive: surge > 1.0
      };

      telemetryBatch.push(telemetryDoc);

      updatedHospitals.push({
        ...hosp,
        currentStock: newStock,
        currentBurnRate: effectiveBurnRate,
        pressurePsi,
        activePatientsOnO2: activePatients,
        surgeActive: surge > 1.0,
        lastTelemetryAt: now
      });
    }

    // Write stream batch to MongoDB
    await db.collection('resource_telemetry').insertMany(telemetryBatch);

    // Notify listeners
    this.notifyListeners({
      timestamp: now,
      hospitals: updatedHospitals,
      latestTelemetry: telemetryBatch
    });
  }
}

// Singleton simulator instance
const simulatorInstance = new HospitalStreamSimulator();

module.exports = simulatorInstance;
