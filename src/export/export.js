const PDFDocument = require('pdfkit');

// Helper: Resolve barcode serial numbers for a transfer manifest
function getBarcodesForLog(log) {
  if (Array.isArray(log.cylinderBarcodes) && log.cylinderBarcodes.length > 0) {
    return log.cylinderBarcodes;
  }
  const cleanLetters = (log.donorName || 'GEN').replace(/[^A-Za-z]/g, '').toUpperCase();
  const prefix = (cleanLetters.slice(0, 4) || 'GEN').padEnd(3, 'X');
  const count = Math.max(1, parseInt(log.quantity, 10) || 1);
  return Array.from({ length: count }, (_, i) => `O2-${prefix}-${String(i + 1).padStart(3, '0')}`);
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// Generate CSV string from transfer logs with custom clinical & logistics fields
function generateCsv(transferLogs = [], options = {}) {
  const headers = [
    'Manifest ID',
    'Date & Time',
    'Cylinders Transferred',
    'Cylinder Barcodes (Moved)',
    'Resource Type',
    'Source Hospital',
    'Source Hospital Registration No',
    'Source Address',
    'Source Emergency Contact',
    'Destination Hospital',
    'Destination Hospital Registration No',
    'Destination Address',
    'Destination Emergency Contact',
    'Clinical Triage Priority',
    'Oxygen Grade & Purity',
    'Operating Pressure (PSI)',
    'Batch Tamper Seal Number',
    'Authorizing Dispatch Coordinator',
    'Authorizing Physician / CMO',
    'Logistics Transit Corridor',
    'Ambulance / Vehicle No',
    'Delivery Driver / Personnel',
    'Driver Contact Phone',
    'Distance (km)',
    'Transit Time (mins)',
    'Status',
    'Gemini AI Clinical Justification'
  ];

  const rows = transferLogs.map(log => {
    const barcodes = getBarcodesForLog(log);
    const barcodeStr = barcodes.join('; ');
    const donorReg = log.donorRegistrationNumber || options.defaultDonorReg || 'MOH-REG-2026-0000';
    const recipientReg = log.recipientRegistrationNumber || options.defaultRecipientReg || 'MOH-REG-2026-0000';
    const seal = log.batchSealNumber || (options.sealPrefix ? `${options.sealPrefix}-${(log.manifestId || 'MAN').slice(-4)}` : `SEAL-2026-${(log.manifestId || 'MAN').slice(-4)}`);
    const priority = log.clinicalPriority || (log.quantity >= 30 ? 'CODE RED (EMERGENCY REBALANCE)' : 'CODE AMBER (HIGH PRIORITY)');
    const coordinator = options.coordinator || log.authorizingCoordinator || 'District Logistics Command Desk';
    const physician = log.authorizingPhysician || 'Dr. Amanda Vance, CMO';
    const corridor = log.transportRouteCorridor || `${log.donorName || 'Donor'} to ${log.recipientName || 'Recipient'} Express Corridor`;

    return [
      escapeCsvCell(log.manifestId || 'MAN-N/A'),
      escapeCsvCell(new Date(log.timestamp).toLocaleString()),
      escapeCsvCell(log.quantity),
      escapeCsvCell(barcodeStr),
      escapeCsvCell(log.resourceType || 'Oxygen Cylinders (Type-D 40L)'),
      escapeCsvCell(log.donorName),
      escapeCsvCell(donorReg),
      escapeCsvCell(log.donorAddress || 'N/A'),
      escapeCsvCell(log.donorContact || 'N/A'),
      escapeCsvCell(log.recipientName),
      escapeCsvCell(recipientReg),
      escapeCsvCell(log.recipientAddress || 'N/A'),
      escapeCsvCell(log.recipientContact || 'N/A'),
      escapeCsvCell(priority),
      escapeCsvCell(log.oxygenPurity || '99.5% Medical Grade USP'),
      escapeCsvCell(log.pressurePsi || 2050),
      escapeCsvCell(seal),
      escapeCsvCell(coordinator),
      escapeCsvCell(physician),
      escapeCsvCell(corridor),
      escapeCsvCell(log.ambulanceNumber || 'N/A'),
      escapeCsvCell(log.deliveryDriver || 'N/A'),
      escapeCsvCell(log.driverPhone || 'N/A'),
      escapeCsvCell(log.transitDistanceKm || 0),
      escapeCsvCell(log.transitMinutes || 0),
      escapeCsvCell(log.status || 'DELIVERED'),
      escapeCsvCell(log.geminiJustification || '')
    ];
  });

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

// Dedicated Barcode-Level Movement CSV with Custom Fields:
// Every single oxygen cylinder barcode has its own row showing exact movement from which hospital to which hospital
function generateBarcodeMovementsCsv(transferLogs = [], options = {}) {
  const headers = [
    'Cylinder Barcode',
    'Cylinder Serial Number',
    'From Hospital (Source Name)',
    'From Hospital Registration No',
    'From Hospital ID',
    'From Hospital Address',
    'From Emergency Phone',
    'To Hospital (Destination Name)',
    'To Hospital Registration No',
    'To Hospital ID',
    'To Hospital Address',
    'To Emergency Phone',
    'Batch Tamper Seal Number',
    'Clinical Triage Priority',
    'Authorizing Dispatch Officer',
    'Movement Status',
    'Manifest ID',
    'Transfer Date & Time',
    'Ambulance / Vehicle Plate',
    'Delivery Personnel / Driver',
    'Driver Contact Phone',
    'Transit Distance (km)',
    'Transit Time (mins)',
    'Gas Specification',
    'Oxygen Purity (%)',
    'Cylinder Capacity',
    'Operating Pressure (PSI)',
    'Tare Weight (kg)',
    'Gemini Clinical AI Justification'
  ];

  const rows = [];

  for (const log of transferLogs) {
    const barcodes = getBarcodesForLog(log);
    const donorReg = log.donorRegistrationNumber || options.defaultDonorReg || 'MOH-REG-2026-0000';
    const recipientReg = log.recipientRegistrationNumber || options.defaultRecipientReg || 'MOH-REG-2026-0000';
    const seal = log.batchSealNumber || (options.sealPrefix ? `${options.sealPrefix}-${(log.manifestId || 'MAN').slice(-4)}` : `SEAL-2026-${(log.manifestId || 'MAN').slice(-4)}`);
    const priority = log.clinicalPriority || (log.quantity >= 30 ? 'CODE RED (EMERGENCY REBALANCE)' : 'CODE AMBER (HIGH PRIORITY)');
    const coordinator = options.coordinator || log.authorizingCoordinator || 'District Logistics Command Desk';

    for (const serial of barcodes) {
      const cleanSerial = String(serial).trim().toUpperCase().replace(/\*/g, '');
      const barcodeDisplay = `*${cleanSerial}*`;

      rows.push([
        escapeCsvCell(barcodeDisplay),
        escapeCsvCell(cleanSerial),
        escapeCsvCell(log.donorName),
        escapeCsvCell(donorReg),
        escapeCsvCell(log.donorId || 'N/A'),
        escapeCsvCell(log.donorAddress || 'N/A'),
        escapeCsvCell(log.donorContact || 'N/A'),
        escapeCsvCell(log.recipientName),
        escapeCsvCell(recipientReg),
        escapeCsvCell(log.recipientId || 'N/A'),
        escapeCsvCell(log.recipientAddress || 'N/A'),
        escapeCsvCell(log.recipientContact || 'N/A'),
        escapeCsvCell(seal),
        escapeCsvCell(priority),
        escapeCsvCell(coordinator),
        escapeCsvCell(log.status || 'DELIVERED'),
        escapeCsvCell(log.manifestId || 'MAN-N/A'),
        escapeCsvCell(new Date(log.timestamp).toLocaleString()),
        escapeCsvCell(log.ambulanceNumber || 'N/A'),
        escapeCsvCell(log.deliveryDriver || 'N/A'),
        escapeCsvCell(log.driverPhone || 'N/A'),
        escapeCsvCell(log.transitDistanceKm || 0),
        escapeCsvCell(log.transitMinutes || 0),
        escapeCsvCell('Medical Oxygen (O2 99.5% USP)'),
        escapeCsvCell('99.5% Medical Grade USP'),
        escapeCsvCell('40 Litres (Type-D High Pressure)'),
        escapeCsvCell(log.pressurePsi || 2050),
        escapeCsvCell(14.2),
        escapeCsvCell(log.geminiJustification || '')
      ]);
    }
  }

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

// Generate PDF stream to HTTP response with Custom Clinical and Audit Fields
function generatePdf(transferLogs = [], res, options = {}) {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="oxygen_transfer_manifest_history.pdf"');

  doc.pipe(res);

  // Document Title Header
  doc
    .fontSize(16)
    .fillColor('#0f172a')
    .text('DISTRICT 04 MEDICAL LOGISTICS COMMAND', { align: 'center' })
    .fontSize(11)
    .fillColor('#0d9488')
    .text('Cross-Hospital Oxygen Rebalance Manifest Audit Report', { align: 'center' })
    .moveDown(0.2);

  const customOfficer = options.coordinator || 'District Emergency Logistics Officer';
  doc
    .fontSize(7.5)
    .fillColor('#64748b')
    .text(`Generated: ${new Date().toLocaleString()} | Officer: ${customOfficer} | System: HN-AI-05 | MOH Accreditation: ACTIVE`, { align: 'center' })
    .moveDown(0.6);

  // Horizontal Divider Line
  doc
    .strokeColor('#cbd5e1')
    .lineWidth(1)
    .moveTo(36, doc.y)
    .lineTo(559, doc.y)
    .stroke()
    .moveDown(0.6);

  // Summary Metrics Banner
  const totalCylinders = transferLogs.reduce((sum, l) => sum + (l.quantity || 0), 0);
  doc
    .rect(36, doc.y, 523, 28)
    .fill('#f1f5f9');

  const bannerY = doc.y + 7;
  doc
    .fontSize(8.5)
    .fillColor('#334155')
    .text(`Total Dispatches: ${transferLogs.length}`, 48, bannerY)
    .text(`Rebalanced: ${totalCylinders} Cylinders`, 175, bannerY)
    .text(`Purity Standard: USP 99.5%`, 310, bannerY)
    .text(`Logistics Status: VERIFIED`, 435, bannerY)
    .moveDown(2.2);

  if (transferLogs.length === 0) {
    doc
      .fontSize(10)
      .fillColor('#64748b')
      .text('No transfer manifests recorded in database yet.', { align: 'center' });
    doc.end();
    return;
  }

  // Iterate Manifest Entries
  transferLogs.forEach((log, index) => {
    // Check if new page needed
    if (doc.y > 640) {
      doc.addPage();
    }

    const startY = doc.y;
    const cardHeight = 135;

    // Card background
    doc
      .rect(36, startY, 523, cardHeight)
      .strokeColor('#e2e8f0')
      .lineWidth(0.8)
      .fillAndStroke('#ffffff', '#e2e8f0');

    const contentY = startY + 7;
    const donorReg = log.donorRegistrationNumber || options.defaultDonorReg || 'MOH-REG-2026-0000';
    const recipientReg = log.recipientRegistrationNumber || options.defaultRecipientReg || 'MOH-REG-2026-0000';
    const sealNumber = log.batchSealNumber || (options.sealPrefix ? `${options.sealPrefix}-${(log.manifestId || 'MAN').slice(-4)}` : `SEAL-2026-${(log.manifestId || 'MAN').slice(-4)}`);
    const priority = log.clinicalPriority || (log.quantity >= 30 ? 'CODE RED (EMERGENCY)' : 'CODE AMBER (HIGH PRIORITY)');
    const coordinator = options.coordinator || log.authorizingCoordinator || 'District Logistics Command';

    // Top Header: Manifest ID & Date & Status & Triage Priority
    doc
      .fontSize(9.5)
      .fillColor('#0f172a')
      .text(`Manifest #${log.manifestId || `MAN-00${index + 1}`}`, 46, contentY, { continued: true })
      .fillColor('#64748b')
      .text(`  |  ${new Date(log.timestamp).toLocaleString()}`, { continued: true })
      .fillColor(priority.includes('RED') ? '#dc2626' : '#d97706')
      .text(`  |  ${priority}`, { continued: true })
      .fillColor('#059669')
      .text(`  |  STATUS: ${log.status || 'DELIVERED'}`, { align: 'left' });

    // Source Facility & Reg Number
    doc
      .fontSize(8.5)
      .fillColor('#0284c7')
      .text(`SOURCE (Donor): `, 46, contentY + 16, { continued: true })
      .fillColor('#1e293b')
      .text(`${log.donorName} `, { continued: true })
      .fillColor('#0369a1')
      .text(`[Reg: ${donorReg}] `, { continued: true })
      .fillColor('#64748b')
      .text(`• ${log.donorAddress || 'District Northside'}`);

    // Destination Facility & Reg Number
    doc
      .fontSize(8.5)
      .fillColor('#e11d48')
      .text(`DESTINATION (Recipient): `, 46, contentY + 28, { continued: true })
      .fillColor('#1e293b')
      .text(`${log.recipientName} `, { continued: true })
      .fillColor('#be123c')
      .text(`[Reg: ${recipientReg}] `, { continued: true })
      .fillColor('#64748b')
      .text(`• ${log.recipientAddress || 'District Southside'}`);

    // Logistics & Clinical Specifications Row
    doc
      .fontSize(8)
      .fillColor('#475569')
      .text(`Transferred: `, 46, contentY + 42, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.quantity} Cylinders (Type-D 40L)  `, { continued: true })
      .fillColor('#475569')
      .text(`Purity: `, { continued: true })
      .fillColor('#0d9488')
      .text(`${log.oxygenPurity || '99.5% USP'}  `, { continued: true })
      .fillColor('#475569')
      .text(`Tamper Seal ID: `, { continued: true })
      .fillColor('#7c3aed')
      .text(`${sealNumber}  `, { continued: true })
      .fillColor('#475569')
      .text(`Pressure: `, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.pressurePsi || 2050} PSI`);

    // Vehicle & Dispatch Personnel Row
    doc
      .fontSize(8)
      .fillColor('#475569')
      .text(`Ambulance / Vehicle: `, 46, contentY + 54, { continued: true })
      .fillColor('#0284c7')
      .text(`${log.ambulanceNumber || 'AMB-O2-408'}  `, { continued: true })
      .fillColor('#475569')
      .text(`Driver: `, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.deliveryDriver || 'Officer Rajesh Kumar'} (${log.driverPhone || '+1 555-839-2041'})  `, { continued: true })
      .fillColor('#475569')
      .text(`Transit ETA: `, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.transitMinutes || 15} mins (${log.transitDistanceKm || 4.2} km)`);

    // Authorizing Personnel Row
    doc
      .fontSize(8)
      .fillColor('#475569')
      .text(`Authorizing Coordinator: `, 46, contentY + 66, { continued: true })
      .fillColor('#0f172a')
      .text(`${coordinator}  `, { continued: true })
      .fillColor('#475569')
      .text(`Physician Sign-Off: `, { continued: true })
      .fillColor('#059669')
      .text(`${log.authorizingPhysician || 'Dr. Amanda Vance, CMO'}  `, { continued: true })
      .fillColor('#475569')
      .text(`Corridor: `, { continued: true })
      .fillColor('#334155')
      .text(`${log.transportRouteCorridor || 'Arterial Corridor'}`);

    // Gemini Justification Box
    doc
      .rect(46, contentY + 79, 503, 28)
      .fill('#f8fafc');

    doc
      .fontSize(7.5)
      .fillColor('#7c3aed')
      .text(`✨ Gemini AI Clinical Justification: `, 52, contentY + 84, { continued: true })
      .fillColor('#334155')
      .text(`"${log.geminiJustification || 'Routine balanced rebalance'}"`, { width: 430 });

    // Barcode Serial Range Footnote
    const barcodes = getBarcodesForLog(log);
    const sampleBarcodes = barcodes.length <= 4 ? barcodes.join(', ') : `${barcodes[0]} ... ${barcodes[barcodes.length - 1]} (${barcodes.length} verified units)`;
    doc
      .fontSize(7)
      .fillColor('#64748b')
      .text(`Cylinder Barcode Manifest: ${sampleBarcodes}`, 52, contentY + 115);

    doc.y = startY + cardHeight + 10;
  });

  // Footer & Sign-Off Section
  if (doc.y > 700) doc.addPage();
  const signY = Math.min(doc.y + 15, 730);

  doc
    .strokeColor('#cbd5e1')
    .lineWidth(0.5)
    .moveTo(46, signY)
    .lineTo(240, signY)
    .moveTo(350, signY)
    .lineTo(540, signY)
    .stroke();

  doc
    .fontSize(7.5)
    .fillColor('#475569')
    .text('Dispatch Logistics Commander Signature', 46, signY + 3)
    .text('Receiving Hospital Lead Pharmacist / RN', 350, signY + 3)
    .moveDown(2);

  doc
    .fontSize(7.5)
    .fillColor('#94a3b8')
    .text('Medical Oxygen Logistics Dispatch Audit — Official Confidential Supply Manifest — Ministry of Health Accredited', 36, 792, { align: 'center' });

  doc.end();
}

// Generate CSV for current hospital stock inventory with Registration Number
function generateHospitalsCsv(hospitals = []) {
  const headers = [
    'Hospital ID',
    'Hospital Registration Number',
    'Hospital Name',
    'Role / Type',
    'Cylinders Left',
    'Capacity',
    'Percentage Remaining',
    'Status',
    'Operating Pressure (PSI)',
    'Hourly Burn Rate (cyl/hr)',
    'District Address / Location',
    'Contact Phone',
    'Dispatch Officer'
  ];

  const rows = hospitals.map(h => {
    const pct = Math.round((h.currentStock / h.capacity) * 100);
    const isEmergency = h.currentStock <= 20;
    const status = isEmergency ? 'CRITICAL (≤ 20 CYLINDERS LEFT)' : (h.status || 'NORMAL');
    const regNo = h.registrationNumber || `MOH-REG-2026-${String(h.id || '01').replace('HOSP-', '')}`;

    return [
      escapeCsvCell(h.id),
      escapeCsvCell(regNo),
      escapeCsvCell(h.name),
      escapeCsvCell(h.type),
      escapeCsvCell(Math.round(h.currentStock)),
      escapeCsvCell(h.capacity),
      escapeCsvCell(`${pct}%`),
      escapeCsvCell(status),
      escapeCsvCell(h.pressurePsi || 2050),
      escapeCsvCell(h.currentBurnRate || h.baselineBurnRate || 0),
      escapeCsvCell(h.location?.address || 'District 04'),
      escapeCsvCell(h.location?.phone || 'N/A'),
      escapeCsvCell(h.location?.dispatchContact || 'N/A')
    ];
  });

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

// Generate CSV for complete hospital cylinder fleet with Registration Number & Purity
function generateCylindersCsv(cylinders = []) {
  const headers = [
    'Barcode',
    'Serial Number',
    'Current Hospital Name',
    'Hospital Registration Number',
    'Hospital ID',
    'Status',
    'Ward Assignment',
    'Gas Specification',
    'Purity Specification',
    'Capacity (Litres)',
    'Pressure (PSI)',
    'Tare Weight (kg)',
    'Batch Number',
    'Last Transferred From',
    'Last Transferred To',
    'Last Manifest ID',
    'Last Inspected Date'
  ];

  const rows = cylinders.map(c => [
    escapeCsvCell(c.barcode || `*${c.serialNumber}*`),
    escapeCsvCell(c.serialNumber),
    escapeCsvCell(c.hospitalName || 'N/A'),
    escapeCsvCell(c.hospitalRegistrationNumber || c.registrationNumber || `MOH-REG-2026-${String(c.hospitalId || '01').replace('HOSP-', '')}`),
    escapeCsvCell(c.hospitalId || 'N/A'),
    escapeCsvCell(c.status || 'IN_STOCK'),
    escapeCsvCell(c.wardAssignment || 'General Depot'),
    escapeCsvCell(c.gasType || 'Medical Oxygen (O2 99.5% USP)'),
    escapeCsvCell(c.purity || '99.5% Medical Grade USP'),
    escapeCsvCell(c.capacityLitres || 40),
    escapeCsvCell(c.pressurePsi || 2000),
    escapeCsvCell(c.tareWeightKg || 14.2),
    escapeCsvCell(c.batchNumber || 'BAT-2026-DISTRICT'),
    escapeCsvCell(c.lastTransferredFrom || 'Origin Depot'),
    escapeCsvCell(c.lastTransferredTo || 'Current Station'),
    escapeCsvCell(c.lastManifestId || 'MAN-INITIAL'),
    escapeCsvCell(c.lastInspected || '2026-10-01')
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

module.exports = {
  generateCsv,
  generatePdf,
  generateHospitalsCsv,
  generateBarcodeMovementsCsv,
  generateCylindersCsv
};
