const PDFDocument = require('pdfkit');

// Helper: Resolve barcode serial numbers for a transfer manifest
function getBarcodesForLog(log) {
  if (Array.isArray(log.cylinderBarcodes) && log.cylinderBarcodes.length > 0) {
    return log.cylinderBarcodes;
  }
  // Generate realistic hospital-prefixed barcodes for the transfer batch if not explicitly stored
  const cleanLetters = (log.donorName || 'GEN').replace(/[^A-Za-z]/g, '').toUpperCase();
  const prefix = (cleanLetters.slice(0, 4) || 'GEN').padEnd(3, 'X');
  const count = Math.max(1, parseInt(log.quantity, 10) || 1);
  return Array.from({ length: count }, (_, i) => `O2-${prefix}-${String(i + 1).padStart(3, '0')}`);
}

// Generate CSV string from transfer logs (with Cylinder Barcodes column)
function generateCsv(transferLogs = []) {
  const headers = [
    'Manifest ID',
    'Date & Time',
    'Cylinders Transferred',
    'Cylinder Barcodes (Moved)',
    'Resource Type',
    'Source Hospital',
    'Source Address',
    'Source Emergency Contact',
    'Destination Hospital',
    'Destination Address',
    'Destination Emergency Contact',
    'Ambulance / Vehicle No',
    'Delivery Driver / Personnel',
    'Driver Contact Phone',
    'Distance (km)',
    'Transit Time (mins)',
    'Status',
    'Gemini AI Justification'
  ];

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = transferLogs.map(log => {
    const barcodes = getBarcodesForLog(log);
    const barcodeStr = barcodes.join('; ');

    return [
      escapeCsvCell(log.manifestId || 'MAN-N/A'),
      escapeCsvCell(new Date(log.timestamp).toLocaleString()),
      escapeCsvCell(log.quantity),
      escapeCsvCell(barcodeStr),
      escapeCsvCell(log.resourceType || 'Oxygen Cylinders (Type-D 40L)'),
      escapeCsvCell(log.donorName),
      escapeCsvCell(log.donorAddress || 'N/A'),
      escapeCsvCell(log.donorContact || 'N/A'),
      escapeCsvCell(log.recipientName),
      escapeCsvCell(log.recipientAddress || 'N/A'),
      escapeCsvCell(log.recipientContact || 'N/A'),
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

// Dedicated Barcode-Level Movement CSV:
// Every single oxygen cylinder barcode has its own row showing exact movement from which hospital to which hospital
function generateBarcodeMovementsCsv(transferLogs = []) {
  const headers = [
    'Cylinder Barcode',
    'Cylinder Serial Number',
    'From Hospital (Source Name)',
    'From Hospital ID',
    'From Hospital Address',
    'From Emergency Phone',
    'To Hospital (Destination Name)',
    'To Hospital ID',
    'To Hospital Address',
    'To Emergency Phone',
    'Movement Status',
    'Manifest ID',
    'Transfer Date & Time',
    'Ambulance / Vehicle Plate',
    'Delivery Personnel / Driver',
    'Driver Contact Phone',
    'Transit Distance (km)',
    'Transit Time (mins)',
    'Gas Specification',
    'Cylinder Capacity',
    'Operating Pressure (PSI)',
    'Gemini Clinical AI Justification'
  ];

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = [];

  for (const log of transferLogs) {
    const barcodes = getBarcodesForLog(log);

    for (const serial of barcodes) {
      const cleanSerial = String(serial).trim().toUpperCase().replace(/\*/g, '');
      const barcodeDisplay = `*${cleanSerial}*`;

      rows.push([
        escapeCsvCell(barcodeDisplay),
        escapeCsvCell(cleanSerial),
        escapeCsvCell(log.donorName),
        escapeCsvCell(log.donorId || 'N/A'),
        escapeCsvCell(log.donorAddress || 'N/A'),
        escapeCsvCell(log.donorContact || 'N/A'),
        escapeCsvCell(log.recipientName),
        escapeCsvCell(log.recipientId || 'N/A'),
        escapeCsvCell(log.recipientAddress || 'N/A'),
        escapeCsvCell(log.recipientContact || 'N/A'),
        escapeCsvCell(log.status || 'DELIVERED'),
        escapeCsvCell(log.manifestId || 'MAN-N/A'),
        escapeCsvCell(new Date(log.timestamp).toLocaleString()),
        escapeCsvCell(log.ambulanceNumber || 'N/A'),
        escapeCsvCell(log.deliveryDriver || 'N/A'),
        escapeCsvCell(log.driverPhone || 'N/A'),
        escapeCsvCell(log.transitDistanceKm || 0),
        escapeCsvCell(log.transitMinutes || 0),
        escapeCsvCell('Medical Oxygen (O2 99.5% USP)'),
        escapeCsvCell('40 Litres (Type-D High Pressure)'),
        escapeCsvCell(log.pressurePsi || 2050),
        escapeCsvCell(log.geminiJustification || '')
      ]);
    }
  }

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

// Generate PDF stream to HTTP response
function generatePdf(transferLogs = [], res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="oxygen_transfer_manifest_history.pdf"');

  doc.pipe(res);

  // Document Title Header
  doc
    .fontSize(18)
    .fillColor('#0f172a')
    .text('DISTRICT 04 MEDICAL LOGISTICS COMMAND', { align: 'center' })
    .fontSize(12)
    .fillColor('#0d9488')
    .text('Cross-Hospital Oxygen Rebalance Manifest Audit Report', { align: 'center' })
    .moveDown(0.3);

  doc
    .fontSize(8)
    .fillColor('#64748b')
    .text(`Generated: ${new Date().toLocaleString()} | Track: Gemini · MongoDB · Render | System: HN-AI-05`, { align: 'center' })
    .moveDown(0.8);

  // Horizontal Divider Line
  doc
    .strokeColor('#cbd5e1')
    .lineWidth(1)
    .moveTo(40, doc.y)
    .lineTo(555, doc.y)
    .stroke()
    .moveDown(0.8);

  // Summary Metrics Banner
  const totalCylinders = transferLogs.reduce((sum, l) => sum + (l.quantity || 0), 0);
  doc
    .rect(40, doc.y, 515, 30)
    .fill('#f1f5f9');

  const bannerY = doc.y + 8;
  doc
    .fontSize(9)
    .fillColor('#334155')
    .text(`Total Dispatches: ${transferLogs.length}`, 55, bannerY)
    .text(`Total Oxygen Cylinders Rebalanced: ${totalCylinders} units`, 200, bannerY)
    .text(`Logistics Status: ACTIVE`, 420, bannerY)
    .moveDown(2.5);

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
    if (doc.y > 680) {
      doc.addPage();
    }

    const startY = doc.y;

    // Card background
    doc
      .rect(40, startY, 515, 115)
      .strokeColor('#e2e8f0')
      .lineWidth(0.8)
      .fillAndStroke('#ffffff', '#e2e8f0');

    const contentY = startY + 8;

    // Top Header: Manifest ID & Date & Status
    doc
      .fontSize(10)
      .fillColor('#0f172a')
      .text(`Manifest #${log.manifestId || `MAN-00${index + 1}`}`, 50, contentY, { continued: true })
      .fillColor('#64748b')
      .text(`  |  ${new Date(log.timestamp).toLocaleString()}`, { continued: true })
      .fillColor('#059669')
      .text(`  |  STATUS: ${log.status || 'DELIVERED'}`, { align: 'left' });

    // Transfer Route
    doc
      .fontSize(9)
      .fillColor('#0284c7')
      .text(`SOURCE (Donor): `, 50, contentY + 18, { continued: true })
      .fillColor('#1e293b')
      .text(`${log.donorName} (${log.donorAddress || 'District Northside'})`);

    doc
      .fontSize(9)
      .fillColor('#e11d48')
      .text(`DESTINATION (Recipient): `, 50, contentY + 32, { continued: true })
      .fillColor('#1e293b')
      .text(`${log.recipientName} (${log.recipientAddress || 'District Southside'})`);

    // Logistics Details Row: Ambulance, Driver, Phone, Quantity
    doc
      .fontSize(8.5)
      .fillColor('#475569')
      .text(`Transferred: `, 50, contentY + 48, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.quantity} Cylinders (Type-D 40L)    `, { continued: true })
      .fillColor('#475569')
      .text(`Ambulance / Vehicle: `, { continued: true })
      .fillColor('#0284c7')
      .text(`${log.ambulanceNumber || 'AMB-O2-408'}    `, { continued: true })
      .fillColor('#475569')
      .text(`Transit ETA: `, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.transitMinutes || 15} mins (${log.transitDistanceKm || 4.2} km)`);

    doc
      .fontSize(8.5)
      .fillColor('#475569')
      .text(`Delivery Personnel: `, 50, contentY + 62, { continued: true })
      .fillColor('#0f172a')
      .text(`${log.deliveryDriver || 'Officer Rajesh Kumar'}    `, { continued: true })
      .fillColor('#475569')
      .text(`Driver Phone: `, { continued: true })
      .fillColor('#059669')
      .text(`${log.driverPhone || '+1 (555) 839-2041'}    `, { continued: true })
      .fillColor('#475569')
      .text(`Donor Phone: `, { continued: true })
      .fillColor('#334155')
      .text(`${log.donorContact || '+1 (555) 018-7740'}`);

    // Gemini Justification Box
    doc
      .rect(50, contentY + 78, 495, 26)
      .fill('#f8fafc');

    doc
      .fontSize(8)
      .fillColor('#7c3aed')
      .text(`✨ Gemini AI Justification: `, 55, contentY + 84, { continued: true })
      .fillColor('#334155')
      .text(`"${log.geminiJustification || 'Routine balanced rebalance'}"`, { width: 420 });

    doc.y = startY + 125;
  });

  // Footer
  doc
    .fontSize(8)
    .fillColor('#94a3b8')
    .text('End of Manifest Report — Medical Oxygen Logistics Dispatch Audit — Confidential Medical Supply Record', 40, 780, { align: 'center' });

  doc.end();
}

// Generate CSV for current hospital stock inventory
function generateHospitalsCsv(hospitals = []) {
  const headers = [
    'Hospital ID',
    'Hospital Name',
    'Role / Type',
    'Cylinders Left',
    'Capacity',
    'Percentage Remaining',
    'Status',
    'Hourly Burn Rate (cyl/hr)',
    'District Address / Location',
    'Contact Phone',
    'Dispatch Officer'
  ];

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = hospitals.map(h => {
    const pct = Math.round((h.currentStock / h.capacity) * 100);
    const isEmergency = h.currentStock <= 20;
    let status = isEmergency ? 'CRITICAL (≤ 20 CYLINDERS LEFT)' : (h.status || 'NORMAL');
    return [
      escapeCsvCell(h.id),
      escapeCsvCell(h.name),
      escapeCsvCell(h.type),
      escapeCsvCell(Math.round(h.currentStock)),
      escapeCsvCell(h.capacity),
      escapeCsvCell(`${pct}%`),
      escapeCsvCell(status),
      escapeCsvCell(h.currentBurnRate || h.baselineBurnRate || 0),
      escapeCsvCell(h.location?.address || 'District 04'),
      escapeCsvCell(h.location?.phone || 'N/A'),
      escapeCsvCell(h.location?.dispatchContact || 'N/A')
    ];
  });

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

// Generate CSV for complete hospital cylinder fleet
function generateCylindersCsv(cylinders = []) {
  const headers = [
    'Barcode',
    'Serial Number',
    'Current Hospital Name',
    'Hospital ID',
    'Status',
    'Ward Assignment',
    'Gas Specification',
    'Capacity (Litres)',
    'Pressure (PSI)',
    'Purity',
    'Tare Weight (kg)',
    'Batch Number',
    'Last Transferred From',
    'Last Transferred To',
    'Last Manifest ID',
    'Last Inspected Date'
  ];

  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = cylinders.map(c => [
    escapeCsvCell(c.barcode || `*${c.serialNumber}*`),
    escapeCsvCell(c.serialNumber),
    escapeCsvCell(c.hospitalName || 'N/A'),
    escapeCsvCell(c.hospitalId || 'N/A'),
    escapeCsvCell(c.status || 'IN_STOCK'),
    escapeCsvCell(c.wardAssignment || 'General Depot'),
    escapeCsvCell(c.gasType || 'Medical Oxygen (O2 99.5% USP)'),
    escapeCsvCell(c.capacityLitres || 40),
    escapeCsvCell(c.pressurePsi || 2000),
    escapeCsvCell(c.purity || '99.5%'),
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
