// Cross-Hospital Oxygen Resource Dashboard
// Hospital Login + Shortage Detection + Cross-Hospital Notifications + Barcode Cylinder Scanner

let state = {
  hospitals: [],
  predictions: [],
  recommendations: [],
  hospitalWithMostCylinders: null,
  socket: null,
  transferLogs: [],
  searchTerm: '',
  riskFilter: 'all',
  map: null,
  mapMarkers: {},
  routePolyline: null,
  selectedHospitalId: 'HOSP-01',
  loggedInHospitalId: 'HOSP-01', // Default logged-in hospital: Hospital A
  currentUser: null,
  authToken: null,
  notifications: [],
  optimizerRules: {
    emergencyThreshold: 20,
    batchQuantity: 40,
    pairingStrategy: 'HIGHEST_STOCK'
  },
  simulation: {
    isRunning: true,
    intervalMs: 3000
  },
  predictorFilter: 'urgent' // 'urgent' (top 2 by risk) or 'all' (all 6 facilities)
};

// District 04 Hospital Mapping
const HOSPITALS_DATA = {
  'HOSP-01': {
    letter: 'A',
    area: 'Downtown',
    shortName: 'Hospital A',
    fullName: 'Metro General Hospital',
    prefix: 'METRO',
    lat: 40.7128,
    lng: -74.0060,
    address: '740 Metro Parkway, Downtown Corridor, District 04',
    phone: '+1 (555) 012-4921',
    dotColor: 'bg-amber-500'
  },
  'HOSP-02': {
    letter: 'B',
    area: 'Uptown',
    shortName: 'Hospital B',
    fullName: 'St. Jude Medical Center',
    prefix: 'JUDE',
    lat: 40.7484,
    lng: -73.9857,
    address: '350 Northwood Blvd, Northside Medical Park, District 04',
    phone: '+1 (555) 018-7740',
    dotColor: 'bg-amber-500'
  },
  'HOSP-03': {
    letter: 'C',
    area: 'Westside',
    shortName: 'Hospital C',
    fullName: 'Riverbank Emergency Annex',
    prefix: 'RVR',
    lat: 40.6892,
    lng: -74.0445,
    address: '112 Riverbank Way, River Basin Waterfront, District 04',
    phone: '+1 (555) 014-3882',
    dotColor: 'bg-emerald-500'
  },
  'HOSP-04': {
    letter: 'D',
    area: 'Harbor',
    shortName: 'Hospital D',
    fullName: 'Oak Valley Community Hospital',
    prefix: 'OAK',
    lat: 40.7306,
    lng: -73.9352,
    address: '880 Harbor Ridge Ave, District 04',
    phone: '+1 (555) 016-9214',
    dotColor: 'bg-emerald-500'
  },
  'HOSP-05': {
    letter: 'E',
    area: 'Heights',
    shortName: 'Hospital E',
    fullName: 'Mercy Urban Care',
    prefix: 'MRCY',
    lat: 40.7831,
    lng: -73.9712,
    address: '502 Sunset Heights, District 04 West',
    phone: '+1 (555) 019-3301',
    dotColor: 'bg-emerald-500'
  },
  'HOSP-06': {
    letter: 'F',
    area: 'Foothills',
    shortName: 'Hospital F',
    fullName: 'Highland Specialty Institute',
    prefix: 'HGH',
    lat: 40.6782,
    lng: -73.9442,
    address: '220 Crestview Rd, East Foothills',
    phone: '+1 (555) 011-8452',
    dotColor: 'bg-emerald-500'
  }
};

function getHosp(id) {
  if (HOSPITALS_DATA[id]) return HOSPITALS_DATA[id];

  // Dynamically resolve newly registered hospitals from backend fleet
  const found = (state.hospitals || []).find(h => h.id === id);
  if (found) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const num = parseInt((id || '').replace('HOSP-', ''), 10) || 7;
    const letter = letters[num - 1] || 'X';
    const cleanLetters = (found.name || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    const prefix = (cleanLetters.slice(0, 4) || 'GEN').padEnd(3, 'X');

    return {
      letter,
      area: found.location?.district || 'District 04',
      shortName: `Hospital ${letter}`,
      fullName: found.name,
      prefix,
      lat: found.location?.lat || 40.7300,
      lng: found.location?.lng || -73.9850,
      address: found.location?.address || `${found.name}, District 04`,
      phone: found.location?.phone || '+1 (555) 019-0000',
      dotColor: 'bg-indigo-500'
    };
  }

  return {
    letter: '?',
    area: 'District',
    shortName: 'Hospital ?',
    fullName: 'District Hospital',
    prefix: 'GEN',
    lat: 40.7128,
    lng: -74.0060,
    address: 'District 04',
    phone: '+1 (555) 000-0000',
    dotColor: 'bg-slate-400'
  };
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgStyles = {
    info: 'bg-slate-900 border-teal-500 text-teal-300',
    success: 'bg-slate-900 border-emerald-500 text-emerald-300',
    error: 'bg-rose-950 border-rose-500 text-rose-200',
    alert: 'bg-amber-950 border-amber-500 text-amber-200'
  };

  toast.className = `p-3.5 rounded-xl border shadow-xl text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto backdrop-blur-md ${bgStyles[type] || bgStyles.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Play subtle scanner beep sound
function playScannerBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // High pitch beep
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    // Audio not permitted or supported
  }
}

// Initialize Application
async function init() {
  startLiveClock();
  initMap();
  setupEventListeners();
  setupAuthEventListeners();
  setupOptimizerRulesEventListeners();
  updateQuickScanChips();
  await loadOptimizerRules();
  await loadSimulationStatus();
  await loadInitialData();
  await loadNotifications();
  setupWebSocket();
  await loadAuditHistory();
  initAuth();
}

// 1. Live Clock display matching screenshot
function startLiveClock() {
  const clockEl = document.getElementById('liveClockDisplay');
  function update() {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  update();
  setInterval(update, 1000);
}

// 2. Load Data from Backend
async function loadInitialData() {
  try {
    const [recRes, hospRes] = await Promise.all([
      fetch('/api/recommendations'),
      fetch('/api/hospitals')
    ]);

    const data = await recRes.json();
    if (hospRes.ok) {
      state.hospitals = await hospRes.json();
      populateHospitalDropdowns();
      syncMapMarkers();
    }

    state.recommendations = data.recommendations || [];
    state.predictions = data.predictions || [];
    state.hospitalWithMostCylinders = data.hospitalWithMostCylinders || null;

    renderAll();
    updateMapData();
    updateScannerDisplayStock();
    updateQuickScanChips();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// 3. WebSocket Real-Time Telemetry & Notification Stream
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.socket = new WebSocket(wsUrl);

  state.socket.onopen = () => {
    const el = document.getElementById('networkStatusText');
    if (el) el.textContent = 'Network connected';
  };

  state.socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'TICK' && data.rebalancePlan) {
        state.recommendations = data.rebalancePlan.recommendations || [];
        state.predictions = data.rebalancePlan.predictions || [];
        state.hospitalWithMostCylinders = data.rebalancePlan.hospitalWithMostCylinders || null;
        renderAll();
        updateMapData();
      } else if (data.type === 'RULES_UPDATED') {
        if (data.rules) {
          state.optimizerRules = data.rules;
          syncRulesUI(data.rules);
        }
        if (data.rebalancePlan) {
          state.recommendations = data.rebalancePlan.recommendations || [];
          state.predictions = data.rebalancePlan.predictions || [];
          state.hospitalWithMostCylinders = data.rebalancePlan.hospitalWithMostCylinders || null;
        }
        renderAll();
        updateMapData();
        showToast(`⚙️ Optimizer rules updated across network (Threshold: ${data.rules?.emergencyThreshold || 20} cyl)`, 'info');
      } else if (data.type === 'SIMULATION_STATUS') {
        state.simulation = { isRunning: data.isRunning, intervalMs: data.intervalMs };
        syncSimulationUI();
      } else if (data.type === 'NOTIFICATION_RECEIVED') {
        loadNotifications();
        showToast(`🚨 URGENT NOTIFICATION: Shortage detected at ${data.notification.fromHospitalName}!`, 'error');
      } else if (data.type === 'NOTIFICATION_RESOLVED') {
        loadNotifications();
        showToast(`✓ Notification resolved: Oxygen cylinders dispatched!`, 'success');
        loadAuditHistory();
      } else if (data.type === 'CYLINDER_SCANNED') {
        loadInitialData();
      } else if (data.type === 'TRANSFER_EXECUTED') {
        showToast(`✓ Ambulance dispatched! ${data.transfer.quantity} cylinders transferred.`, 'success');
        loadAuditHistory();
      } else if (data.type === 'HOSPITAL_REGISTERED') {
        showToast(`🏥 New facility registered: ${data.hospital.name}!`, 'info');
        loadInitialData();
      }
    } catch (err) {
      console.error('WebSocket parse error:', err);
    }
  };

  state.socket.onclose = () => {
    const el = document.getElementById('networkStatusText');
    if (el) el.textContent = 'Reconnecting...';
    setTimeout(setupWebSocket, 3000);
  };
}

// Master Render
function renderAll() {
  renderTopKPIs();
  renderEmergencyDispatchAlert();
  renderStockLevelsTable();
  renderShortagePredictors();
  renderTransferRecommendations();
}

// 4. Render Top 4 Clinical Metric KPI Cards
function renderTopKPIs() {
  if (!state.predictions) return;

  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;

  // Card 1: Total District Oxygen Reserves
  const totalCyl = Math.round(state.predictions.reduce((acc, h) => acc + (h.currentStock || 0), 0));
  const totalEl = document.getElementById('topTotalCylinders');
  if (totalEl) totalEl.textContent = totalCyl.toLocaleString();

  const totalCap = (state.hospitals && state.hospitals.length > 0)
    ? state.hospitals.reduce((acc, h) => acc + (h.capacity || 250), 0)
    : Math.max(1200, totalCyl * 1.5);
  const pct = Math.min(100, Math.max(0, Math.round((totalCyl / totalCap) * 100)));

  const barEl = document.getElementById('topReservesBar');
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.className = `h-full rounded-full transition-all duration-500 ${
      pct < 30 ? 'bg-rose-500' : pct < 55 ? 'bg-amber-500' : 'bg-emerald-500'
    }`;
  }
  const pctEl = document.getElementById('topReservesPercent');
  if (pctEl) pctEl.textContent = `${pct}% of total capacity (${totalCyl}/${totalCap} cyl)`;

  // Card 2: Shortage Risk Horizon
  const atRiskCount = state.predictions.filter(h => h.currentStock <= threshold || (h.timeToShortageHours !== null && h.timeToShortageHours <= 6)).length;
  const atRiskEl = document.getElementById('topAtRiskCount');
  if (atRiskEl) atRiskEl.textContent = atRiskCount;
  const badgeThresh = document.getElementById('topRuleThresholdBadge');
  if (badgeThresh) badgeThresh.textContent = threshold;

  // Card 3: Active Clinical Demand
  const totalPatients = (state.hospitals && state.hospitals.length > 0)
    ? state.hospitals.reduce((acc, h) => acc + (h.activePatientsOnO2 || Math.round((h.currentStock || 50) * 0.35)), 0)
    : state.predictions.reduce((acc, h) => acc + Math.round((h.currentStock || 50) * 0.35), 0);
  const patientsEl = document.getElementById('topTotalPatients');
  if (patientsEl) patientsEl.textContent = totalPatients.toLocaleString();

  const totalBurn = Math.abs(state.predictions.reduce((acc, h) => acc + (h.depletionRatePerHour || 0), 0));
  const burnEl = document.getElementById('topTotalBurnRate');
  if (burnEl) burnEl.textContent = totalBurn.toFixed(1);

  // Card 4: Logistics Corridors
  const activeMoves = (state.transferLogs && state.transferLogs.length > 0)
    ? state.transferLogs.length
    : (state.recommendations ? state.recommendations.length : 0);
  const movesEl = document.getElementById('topActiveTransfersCount');
  if (movesEl) movesEl.textContent = activeMoves;
}

// 5. Emergency Protocol Alert (Triggered when any hospital has <= emergencyThreshold)
function renderEmergencyDispatchAlert() {
  const container = document.getElementById('emergencyDispatchSection');
  if (!container || !state.predictions) return;

  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;
  const urgentHosp = state.predictions.find(h => h.currentStock <= threshold);
  const topRec = state.recommendations && state.recommendations.length > 0 ? state.recommendations[0] : null;

  if (urgentHosp && topRec) {
    const urgentInfo = getHosp(urgentHosp.hospitalId);
    const donorInfo = getHosp(topRec.donorId);

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="bg-rose-50 border-2 border-rose-500 rounded-xl p-4 shadow-sm critical-pulse space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200 pb-2.5">
          <div class="flex items-center space-x-2.5">
            <span class="p-2 bg-rose-600 rounded-lg text-white font-bold">!</span>
            <div>
              <h2 class="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                CRITICAL EMERGENCY: ${urgentInfo.shortName} (${urgentInfo.fullName}) has only ${Math.round(urgentHosp.currentStock)} Cylinders Left (&le; ${threshold} Threshold)!
              </h2>
              <p class="text-xs text-rose-700 mt-0.5">
                Automatic Emergency Protocol Activated: Directly routing from <strong>${donorInfo.shortName} (${donorInfo.fullName})</strong> &mdash; holds the most cylinders (${Math.round(topRec.donorCurrentStock)} cyl).
              </p>
            </div>
          </div>
          <span class="text-xs font-bold px-2.5 py-1 bg-rose-600 text-white rounded-md uppercase tracking-wider shrink-0">
            Immediate Dispatch
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-rose-200 text-xs">
          <div>
            <span class="text-[10px] font-bold text-rose-600 uppercase">Hospital In Need</span>
            <div class="font-bold text-slate-800">${urgentInfo.shortName} (${urgentInfo.area})</div>
            <div class="text-rose-600 font-extrabold">${Math.round(urgentHosp.currentStock)} Cylinders Remaining</div>
            <div class="text-[11px] text-slate-500">📍 ${urgentInfo.address}</div>
          </div>
          <div>
            <span class="text-[10px] font-bold text-emerald-600 uppercase">Primary Donor (Most Stock)</span>
            <div class="font-bold text-slate-800">${donorInfo.shortName} (${donorInfo.area})</div>
            <div class="text-emerald-700 font-extrabold">${Math.round(topRec.donorCurrentStock)} Cylinders in Stock</div>
            <div class="text-[11px] text-slate-500">📍 ${donorInfo.address}</div>
          </div>
          <div class="bg-slate-50 p-2 rounded border border-slate-200">
            <span class="text-[10px] font-bold text-indigo-700 uppercase">Assigned Ambulance</span>
            <div class="font-bold text-slate-800">🚑 Plate: <span class="font-mono text-indigo-700">${topRec.ambulanceNumber}</span></div>
            <div class="text-slate-700">👤 Driver: <strong>${topRec.deliveryDriver}</strong></div>
            <div class="text-emerald-700 font-mono font-bold">📱 ${topRec.driverPhone}</div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
          <p class="italic text-slate-600">
            "${topRec.geminiJustification || `Move ${topRec.transferQuantity} units from ${donorInfo.shortName} to ${urgentInfo.shortName}`}"
          </p>
          <button onclick="executeTransferAction('${topRec.donorId}', '${topRec.recipientId}', ${topRec.transferQuantity}, '${escapeQuotes(topRec.geminiJustification)}')" class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer shrink-0">
            <i data-lucide="send" class="h-3.5 w-3.5"></i>
            Send Ambulance Now (${topRec.transferQuantity} Cylinders)
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
  } else {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
}

// 6. Render Current Stock Levels Table
function renderStockLevelsTable() {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody || !state.predictions) return;

  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;
  const sorted = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock);
  const highestId = sorted[0]?.hospitalId;

  const term = state.searchTerm.toLowerCase().trim();
  const filter = state.riskFilter;

  const filteredHospitals = state.predictions.filter(h => {
    const info = getHosp(h.hospitalId);
    const matchesSearch = !term || 
      info.shortName.toLowerCase().includes(term) ||
      info.fullName.toLowerCase().includes(term) ||
      info.area.toLowerCase().includes(term);

    let matchesFilter = true;
    if (filter === 'critical') matchesFilter = h.currentStock <= threshold;
    else if (filter === 'at_risk') matchesFilter = h.timeToShortageHours !== null && h.timeToShortageHours <= 6.0;
    else if (filter === 'stable') matchesFilter = h.currentStock > threshold && (h.timeToShortageHours === null || h.timeToShortageHours > 6.0);

    return matchesSearch && matchesFilter;
  });

  const countBadge = document.getElementById('hospitalCountBadge');
  if (countBadge) countBadge.textContent = `${filteredHospitals.length} hospitals`;

  if (filteredHospitals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">No hospitals match your search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredHospitals.map(h => {
    const info = getHosp(h.hospitalId);
    const isHighest = h.hospitalId === highestId;
    const isUnderThreshold = h.currentStock <= threshold;
    const isCurrentLoggedIn = h.hospitalId === state.loggedInHospitalId;

    let dotHtml = '';
    if (isUnderThreshold) {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-rose-600 animate-pulse shrink-0"></span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 12.0) {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-amber-500 shrink-0"></span>`;
    } else {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>`;
    }

    const burnRateHtml = `<span class="text-rose-600 font-semibold">-${Math.abs(h.depletionRatePerHour)}/hr</span>`;

    let timeHtml = '';
    if (isUnderThreshold) {
      timeHtml = `<span class="text-rose-600 font-extrabold animate-pulse">&le; ${threshold} cyl (CRITICAL)</span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 4.0) {
      timeHtml = `<span class="text-rose-600 font-bold">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else if (h.timeToShortageHours !== null) {
      timeHtml = `<span class="text-slate-800 font-medium">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else {
      timeHtml = `<span class="text-slate-500">Surplus (>24h)</span>`;
    }

    const rowHighlight = isCurrentLoggedIn ? 'bg-indigo-50/40 border-l-4 border-indigo-600' : 'hover:bg-slate-50';

    const testDropQty = Math.max(5, threshold - 5);

    return `
      <tr class="${rowHighlight} transition cursor-pointer" onclick="selectHospitalOnMap('${h.hospitalId}')">
        
        <td class="py-3.5 px-5">
          <div class="flex items-center space-x-2">
            ${dotHtml}
            <span class="font-bold text-slate-800">${info.shortName}</span>
            <span class="text-slate-400 text-xs font-normal">${info.area}</span>
            ${isCurrentLoggedIn ? '<span class="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full ml-1">👤 Active Session</span>' : ''}
            ${isHighest ? '<span class="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded-full ml-1">🟢 Most Cylinders</span>' : ''}
          </div>
          <span class="text-[11px] text-slate-400 block pl-4 mt-0.5">${info.fullName}</span>
        </td>

        <td class="py-3.5 px-5 font-bold text-slate-800 text-sm font-mono">
          ${Math.round(h.currentStock)}
        </td>

        <td class="py-3.5 px-5">
          ${burnRateHtml}
        </td>

        <td class="py-3.5 px-5">
          ${timeHtml}
        </td>

        <td class="py-3.5 px-5 text-right space-x-1.5 whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="setHospitalStock('${h.hospitalId}', ${testDropQty})" class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition" title="Simulate dropping to ${testDropQty} cylinders">
            Set ${testDropQty} cyl (&le;${threshold})
          </button>
          <button onclick="deliverStock('${h.hospitalId}', 40)" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition" title="Add 40 cylinders">
            +40 cyl
          </button>
        </td>

      </tr>
    `;
  }).join('');
}

// Helper: Sort predictions dynamically by clinical urgency & shortage horizon
function getSortedPredictions() {
  if (!state.predictions || state.predictions.length === 0) return [];
  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;

  return [...state.predictions].sort((a, b) => {
    const aStock = a.currentStock || 0;
    const bStock = b.currentStock || 0;
    const aEmerg = aStock <= threshold;
    const bEmerg = bStock <= threshold;

    // 1. Critical facilities at or below threshold first
    if (aEmerg && !bEmerg) return -1;
    if (!aEmerg && bEmerg) return 1;

    // 2. Next compare time to shortage (shortest runway first)
    const aTime = a.timeToShortageHours != null ? a.timeToShortageHours : 999;
    const bTime = b.timeToShortageHours != null ? b.timeToShortageHours : 999;
    if (aTime !== bTime) return aTime - bTime;

    // 3. Lowest stock first
    return aStock - bStock;
  });
}

// Filter toggle between Priority (Top 2) and All Fleet (6)
function setPredictorFilter(filter) {
  state.predictorFilter = filter;
  const urgentBtn = document.getElementById('predictorFilterUrgentBtn');
  const allBtn = document.getElementById('predictorFilterAllBtn');
  if (urgentBtn && allBtn) {
    if (filter === 'urgent') {
      urgentBtn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-white shadow-sm transition';
      allBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition';
    } else {
      urgentBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition';
      allBtn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-white shadow-sm transition';
    }
  }
  renderShortagePredictors();
}
window.setPredictorFilter = setPredictorFilter;

// Generate High-Precision Statistical Forecast SVG Chart (Live Parametric)
function generateStatisticalForecastSvg(pred, threshold) {
  const width = 360;
  const height = 116;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 22;
  const plotW = width - padLeft - padRight; // 300
  const plotH = height - padTop - padBottom; // 78

  const stock = Math.max(0, pred.currentStock || 0);
  const burn = Math.max(0, pred.depletionRatePerHour || 0);
  const r2 = Math.min(100, Math.max(50, pred.modelRSquared || 96.5)) / 100;

  // Time Horizon: Past 1 hour (-1.0h) to Future 8 hours (+8.0h)
  const tMin = -1.0;
  const tMax = 8.0;
  const tRange = tMax - tMin; // 9.0

  const timeToX = (t) => padLeft + ((t - tMin) / tRange) * plotW;

  // Dynamic Y scale bounded to nice round numbers
  const rawMax = Math.max(threshold * 2.2, stock * 1.35, 60, stock + burn * 2);
  const yMax = Math.ceil(rawMax / 10) * 10;
  const stockToY = (s) => padTop + plotH - (Math.max(0, Math.min(yMax, s)) / yMax) * plotH;

  const xNow = timeToX(0);
  const yNow = stockToY(stock);
  const yThresh = stockToY(threshold);

  // Status-based theme styling
  const isEmergency = stock <= threshold;
  const isWarning = !isEmergency && (pred.timeToShortageHours != null && pred.timeToShortageHours <= 6);
  const primaryStroke = isEmergency ? '#e11d48' : isWarning ? '#d97706' : '#059669';
  const bandFill = isEmergency ? '#fda4af' : isWarning ? '#fde68a' : '#a7f3d0';

  // 1. Solid Historical Telemetry Line (-1h to Now)
  const stockHist1h = Math.min(yMax, stock + (burn * 1.0));
  const xHist = timeToX(-1.0);
  const yHist = stockToY(stockHist1h);
  const histPath = `M ${xHist.toFixed(1)},${yHist.toFixed(1)} L ${xNow.toFixed(1)},${yNow.toFixed(1)}`;

  // 2. Linear Regression Depletion Trajectory + 95% Confidence Interval Ribbon (t = 0 to 8)
  const forecastPoints = [];
  const upperBandPoints = [];
  const lowerBandPoints = [];

  for (let t = 0; t <= 8.01; t += 0.5) {
    const projectedStock = Math.max(0, stock - (burn * t));
    const x = timeToX(t);
    const y = stockToY(projectedStock);
    forecastPoints.push({ x, y, t, stock: projectedStock });

    // Standard error envelope expands with forecast horizon sqrt(t) and inverse R²
    const se = Math.max(1.2, (burn * 0.12 * Math.sqrt(Math.max(0.1, t))) * (1.25 - r2 * 0.25));
    const upperStock = Math.min(yMax, projectedStock + 1.96 * se);
    const lowerStock = Math.max(0, projectedStock - 1.96 * se);
    upperBandPoints.push({ x, y: stockToY(upperStock) });
    lowerBandPoints.push({ x, y: stockToY(lowerStock) });
  }

  const forecastPath = forecastPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x.toFixed(1)},${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, '');

  const ribbonPath = [
    ...upperBandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    ...lowerBandPoints.slice().reverse().map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    'Z'
  ].join(' ');

  // 3. Emergency Threshold Intercept Marker
  let interceptSvg = '';
  if (burn > 0.05 && stock > threshold) {
    const tCross = (stock - threshold) / burn;
    if (tCross <= 8.0) {
      const xCross = timeToX(tCross);
      const yCross = yThresh;
      const labelY = Math.max(padTop + 12, yCross - 10);
      interceptSvg = `
        <circle cx="${xCross.toFixed(1)}" cy="${yCross.toFixed(1)}" r="4.5" fill="#e11d48" stroke="#ffffff" stroke-width="1.5" />
        <rect x="${(xCross - 25).toFixed(1)}" y="${(labelY - 11).toFixed(1)}" width="50" height="13" rx="3" fill="#9f1239" opacity="0.95" />
        <text x="${xCross.toFixed(1)}" y="${(labelY - 1.5).toFixed(1)}" font-size="8.5" font-weight="bold" fill="#ffffff" text-anchor="middle">&le;${threshold} @ ${tCross.toFixed(1)}h</text>
      `;
    }
  } else if (stock <= threshold) {
    interceptSvg = `
      <rect x="${(xNow + 8).toFixed(1)}" y="${Math.max(padTop + 4, yNow - 16).toFixed(1)}" width="64" height="13" rx="3" fill="#be123c" opacity="0.95" />
      <text x="${(xNow + 40).toFixed(1)}" y="${Math.max(padTop + 13, yNow - 7).toFixed(1)}" font-size="8.5" font-weight="bold" fill="#ffffff" text-anchor="middle">&le;${threshold} DEFICIT</text>
    `;
  }

  // 4. X Ticks
  const xTicks = [
    { t: -1, label: '-1h' },
    { t: 0, label: 'Now', bold: true },
    { t: 2, label: '+2h' },
    { t: 4, label: '+4h' },
    { t: 6, label: '+6h' },
    { t: 8, label: '+8h' }
  ];

  const xTicksSvg = xTicks.map(tick => {
    const x = timeToX(tick.t);
    const isNow = tick.t === 0;
    return `
      <text x="${x.toFixed(1)}" y="${(height - 5).toFixed(1)}" font-size="${isNow ? '9' : '8'}" font-weight="${isNow ? 'bold' : 'normal'}" fill="${isNow ? '#0284c7' : '#94a3b8'}" text-anchor="middle">
        ${tick.label}
      </text>
    `;
  }).join('');

  return `
    <svg class="w-full h-auto select-none" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <!-- Statistical Gridlines -->
      <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2,2" />
      <line x1="${padLeft}" y1="${(padTop + plotH/2).toFixed(1)}" x2="${width - padRight}" y2="${(padTop + plotH/2).toFixed(1)}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2,2" />
      <line x1="${padLeft}" y1="${(padTop + plotH).toFixed(1)}" x2="${width - padRight}" y2="${(padTop + plotH).toFixed(1)}" stroke="#cbd5e1" stroke-width="1" />

      <!-- Vertical "Now" baseline (t = 0) -->
      <line x1="${xNow.toFixed(1)}" y1="${padTop}" x2="${xNow.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="#0284c7" stroke-width="1.2" stroke-dasharray="2,2" opacity="0.6" />

      <!-- Y-Axis Labels -->
      <text x="${padLeft - 6}" y="${(padTop + 4).toFixed(1)}" font-size="8" fill="#94a3b8" text-anchor="end">${yMax}</text>
      <text x="${padLeft - 6}" y="${(yThresh + 3).toFixed(1)}" font-size="8" font-weight="bold" fill="#e11d48" text-anchor="end">${threshold}</text>
      <text x="${padLeft - 6}" y="${(padTop + plotH).toFixed(1)}" font-size="8" fill="#94a3b8" text-anchor="end">0</text>
      <text x="${padLeft - 6}" y="${(padTop + plotH/2 + 2).toFixed(1)}" font-size="6.5" fill="#cbd5e1" text-anchor="end" transform="rotate(-90 ${padLeft - 14} ${padTop + plotH/2})">CYL</text>

      <!-- Emergency Threshold Baseline (Red dashed line) -->
      <line x1="${padLeft}" y1="${yThresh.toFixed(1)}" x2="${width - padRight}" y2="${yThresh.toFixed(1)}" stroke="#e11d48" stroke-width="1.2" stroke-dasharray="3,3" />

      <!-- 95% Confidence Interval Ribbon (OLS Error Envelope) -->
      <path d="${ribbonPath}" fill="${bandFill}" opacity="0.25" />

      <!-- Historical Telemetry Trend (Solid line into Now) -->
      <path d="${histPath}" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" />

      <!-- Projected OLS Depletion Trajectory (Dashed) -->
      <path d="${forecastPath}" fill="none" stroke="${primaryStroke}" stroke-width="2.5" stroke-dasharray="4,3" stroke-linecap="round" />

      <!-- Live Pulsing Dot at "Now" Current Stock Level -->
      <circle cx="${xNow.toFixed(1)}" cy="${yNow.toFixed(1)}" r="6" fill="${primaryStroke}" opacity="0.3">
        <animate attributeName="r" values="3.5;7.5;3.5" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${xNow.toFixed(1)}" cy="${yNow.toFixed(1)}" r="3.5" fill="${primaryStroke}" stroke="#ffffff" stroke-width="1.5" />
      <text x="${(xNow + 6).toFixed(1)}" y="${(yNow - 4).toFixed(1)}" font-size="8.5" font-weight="bold" fill="${primaryStroke}">${stock} cyl</text>

      <!-- Critical Intercept Marker -->
      ${interceptSvg}

      <!-- X-axis Ticks -->
      ${xTicksSvg}
    </svg>
  `;
}

// 7. Render Shortage Predictor (Real-Time Live-Updating Statistical Graphs)
function renderShortagePredictors() {
  const container = document.getElementById('shortagePredictorContainer');
  if (!container || !state.predictions || state.predictions.length === 0) return;

  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;
  const sorted = getSortedPredictions();
  const filter = state.predictorFilter || 'urgent';
  const displayList = filter === 'urgent' ? sorted.slice(0, 2) : sorted;

  container.innerHTML = displayList.map(pred => {
    const info = getHosp(pred.hospitalId);
    const stock = Math.round(pred.currentStock || 0);
    const burn = (pred.depletionRatePerHour || 0).toFixed(1);
    const isCritical = stock <= threshold;
    const hoursRemaining = pred.timeToShortageHours != null ? pred.timeToShortageHours.toFixed(1) : '—';
    const rSquared = pred.modelRSquared ? (+pred.modelRSquared).toFixed(1) : '96.5';

    // Urgency status badges
    let borderClass = 'border-slate-200';
    let badgeClass = 'bg-slate-100 text-slate-700';
    let badgeText = 'Stable';
    let dotClass = 'bg-emerald-500';
    let timeText = `${hoursRemaining}h remaining`;
    let timeColor = 'text-slate-700 font-semibold';
    let interceptDetail = `Burn rate: ${burn} cyl/hr`;

    if (isCritical) {
      borderClass = 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/20';
      badgeClass = 'bg-rose-100 text-rose-800 border border-rose-200';
      badgeText = 'CRITICAL DEFICIT';
      dotClass = 'bg-rose-600 animate-ping';
      timeText = `🚨 ACTIVE DEFICIT (&le;${threshold} cyl)`;
      timeColor = 'text-rose-600 font-extrabold';
      interceptDetail = `Immediate Transfer Needed (&le;${threshold} cyl reached)`;
    } else if (pred.timeToShortageHours != null && pred.timeToShortageHours <= 6) {
      borderClass = 'border-amber-300 bg-amber-50/15';
      badgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
      badgeText = 'DEPLETION WARNING';
      dotClass = 'bg-amber-500';
      timeText = `⚠️ ${hoursRemaining}h to &le;${threshold} threshold`;
      timeColor = 'text-amber-700 font-bold';
      interceptDetail = `Depleting to &le;${threshold} threshold at ~${hoursRemaining}h`;
    } else {
      borderClass = 'border-slate-200';
      badgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      badgeText = 'OPTIMAL RUNWAY';
      dotClass = 'bg-emerald-500';
      timeText = `✓ ${hoursRemaining}h runway`;
      timeColor = 'text-emerald-700 font-semibold';
      interceptDetail = `Sustained safety reserve (>6h)`;
    }

    const svgChart = generateStatisticalForecastSvg(pred, threshold);

    return `
      <div class="bg-white rounded-xl border ${borderClass} p-4 shadow-sm hover:shadow-md transition-all duration-300 space-y-3">
        <!-- Card Top Bar: Hospital Title, Risk Badge, Stock Stats -->
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full ${dotClass} shrink-0"></span>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-900 text-sm truncate">${info.shortName} (${info.fullName})</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${badgeText}</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>Stock: <strong class="text-slate-800 font-semibold">${stock} cyl</strong></span>
                <span>&bull;</span>
                <span>Burn: <strong class="text-slate-800 font-semibold">${burn} cyl/hr</strong></span>
                <span>&bull;</span>
                <span>Threshold: <strong class="text-rose-600 font-semibold">&le;${threshold} cyl</strong></span>
              </div>
            </div>
          </div>

          <div class="text-right shrink-0">
            <div class="text-xs ${timeColor}">
              ${timeText}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              R&sup2; = ${rSquared}% &middot; 95% CI OLS
            </div>
          </div>
        </div>

        <!-- Real-Time Statistical Graph -->
        <div class="w-full bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 overflow-hidden">
          ${svgChart}
        </div>

        <!-- Live Legend & Clinical Prediction Detail -->
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
          <div class="flex items-center gap-3 flex-wrap">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-0.5 bg-sky-600 inline-block rounded-xs"></span> History</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-0.5 bg-amber-500 border-b border-dashed inline-block"></span> OLS Forecast</span>
            <span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-amber-200/70 inline-block rounded-xs border border-amber-300"></span> 95% Conf Ribbon</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-0.5 bg-rose-500 border-b border-dashed inline-block"></span> &le;${threshold} Emergency</span>
          </div>
          <div class="text-slate-600 font-medium text-[11px]">
            ${interceptDetail}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 8. Render Transfer Recommendations
function renderTransferRecommendations() {
  const container = document.getElementById('transferRecommendationsContainer');
  const countBadge = document.getElementById('recCountBadge');
  if (!container) return;

  if (!state.recommendations || state.recommendations.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500 shadow-sm">
        District in optimal reserve. No active transfers required.
      </div>
    `;
    if (countBadge) countBadge.textContent = '0';
    return;
  }

  if (countBadge) countBadge.textContent = state.recommendations.length;

  container.innerHTML = state.recommendations.slice(0, 2).map((rec) => {
    const donorInfo = getHosp(rec.donorId);
    const recipInfo = getHosp(rec.recipientId);

    return `
      <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm space-y-2.5">
        
        <div class="flex items-center justify-between">
          <div class="font-bold text-slate-800 text-sm">
            ${donorInfo.shortName} &rarr; ${recipInfo.shortName}
          </div>
          <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Simulated transfer complete
          </span>
        </div>

        <div class="text-xs text-slate-500">
          ${rec.transferQuantity} cylinders moved &middot; ${rec.transitDistanceKm || '11'} km &middot; ETA ${((rec.transitMinutes || 48) / 60).toFixed(1)} hrs
        </div>

        <div class="bg-[#2e7d32] text-white text-xs font-medium rounded-md p-3 shadow-sm leading-relaxed">
          ${recipInfo.shortName} has about ${Math.max(1, Math.round(rec.recipientDepletionHours || 5.8))} hours of oxygen remaining; ${donorInfo.shortName} can spare ${rec.transferQuantity} cylinders while keeping a 4.0-hour reserve.
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          <div class="flex items-center space-x-2 text-slate-700">
            <span>🚑 <span class="font-mono font-bold text-indigo-700">${rec.ambulanceNumber}</span></span>
            <span>&middot;</span>
            <span>👤 <strong>${rec.deliveryDriver}</strong></span>
            <span>&middot;</span>
            <span class="font-mono text-emerald-700">📱 ${rec.driverPhone}</span>
          </div>

          <button onclick="executeTransferAction('${rec.donorId}', '${rec.recipientId}', ${rec.transferQuantity}, '${escapeQuotes(rec.geminiJustification)}')" class="px-3 py-1 rounded bg-[#2e7d32] hover:bg-[#1b5e20] text-white font-bold text-xs transition shadow-sm cursor-pointer shrink-0">
            Send Ambulance Now
          </button>
        </div>

      </div>
    `;
  }).join('');
}

// 9. Cylinder Barcode Scanning Logic
function updateQuickScanChips() {
  const container = document.getElementById('quickScanChips');
  if (!container) return;

  const currentHosp = getHosp(state.loggedInHospitalId);
  const p = currentHosp.prefix || 'METRO';

  const samples = [
    `O2-${p}-001`,
    `O2-${p}-002`,
    `O2-${p}-003`,
    `O2-${p}-015`,
    `O2-${p}-020`
  ];

  container.innerHTML = samples.map(s => `
    <button onclick="setBarcodeAndScan('${s}')" class="px-2 py-0.5 rounded bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-400 font-mono text-[11px] text-slate-700 transition cursor-pointer">
      ${s}
    </button>
  `).join('');

  const input = document.getElementById('barcodeInput');
  if (input) input.value = `O2-${p}-001`;

  const activeSerial = document.getElementById('barcodeActiveSerial');
  if (activeSerial) activeSerial.textContent = `O2-${p}-001`;
}

window.setBarcodeAndScan = function(serial) {
  const input = document.getElementById('barcodeInput');
  if (input) input.value = serial;
  const activeSerial = document.getElementById('barcodeActiveSerial');
  if (activeSerial) activeSerial.textContent = serial;
};

// Handle Barcode Scan Action (Consume or Receive)
async function triggerBarcodeScan(action = 'CONSUME') {
  const input = document.getElementById('barcodeInput');
  const serial = input ? input.value.trim() : 'O2-METRO-001';
  if (!serial) {
    showToast('Please enter a barcode serial number to scan', 'alert');
    return;
  }

  playScannerBeep();

  try {
    const res = await fetch('/api/cylinders/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serialNumber: serial,
        action,
        hospitalId: state.loggedInHospitalId
      })
    });
    const result = await res.json();

    if (result.success) {
      // Update Dossier Box
      const titleEl = document.getElementById('scanResultTitle');
      const subEl = document.getElementById('scanResultSub');
      const stockEl = document.getElementById('scanResultStockLeft');
      const statusEl = document.getElementById('scanResultStatus');
      const wardEl = document.getElementById('scanResultWard');
      const purityEl = document.getElementById('scanResultPurity');
      const badgeEl = document.getElementById('scanNotificationBadge');

      if (titleEl) titleEl.textContent = `Scanned ${result.cylinder.serialNumber}`;
      if (subEl) subEl.textContent = `Action: ${action === 'CONSUME' ? 'Dispensed to Ward' : 'Received into Depot'}`;
      if (stockEl) stockEl.textContent = `${result.cylindersLeft} Cylinders Left`;
      if (statusEl) statusEl.textContent = result.cylinder.status;
      if (wardEl) wardEl.textContent = result.cylinder.wardAssignment || 'Emergency Bay';
      if (purityEl) purityEl.textContent = `${result.cylinder.purity} · ${result.cylinder.pressurePsi} PSI`;

      if (result.emergencyTriggered) {
        if (badgeEl) badgeEl.classList.remove('hidden');
        showToast(`🚨 CRITICAL SHORTAGE: ${result.hospital.name} has only ${result.cylindersLeft} cylinders left! Emergency alert sent to Hospital B!`, 'error');
      } else {
        if (badgeEl) badgeEl.classList.add('hidden');
        showToast(`✓ Scanned ${result.cylinder.serialNumber}! Remaining: ${result.cylindersLeft} cylinders.`, 'success');
      }

      await loadInitialData();
      await loadNotifications();
    } else {
      showToast(result.error || 'Failed to scan cylinder', 'error');
    }
  } catch (err) {
    showToast('Scan error: ' + err.message, 'error');
  }
}

function updateScannerDisplayStock() {
  const pred = state.predictions.find(h => h.hospitalId === state.loggedInHospitalId);
  const stockEl = document.getElementById('scanResultStockLeft');
  if (stockEl && pred) {
    stockEl.textContent = `${Math.round(pred.currentStock)} Cylinders`;
  }
}

// 10. Cross-Hospital Notification Drawer
async function loadNotifications() {
  try {
    const res = await fetch(`/api/notifications?hospitalId=${state.loggedInHospitalId}`);
    state.notifications = await res.json();
    renderNotificationDrawer();
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function renderNotificationDrawer() {
  const drawer = document.getElementById('notificationDrawer');
  const badge = document.getElementById('notifBadge');
  const msgEl = document.getElementById('drawerNotifMessage');
  const actionsEl = document.getElementById('drawerNotifActions');
  if (!drawer || !badge) return;

  const pending = state.notifications.filter(n => n.status === 'PENDING_APPROVAL');
  badge.textContent = pending.length;

  if (pending.length > 0) {
    badge.classList.remove('hidden');
    drawer.classList.remove('hidden');

    const notif = pending[0];
    const isDonor = notif.toHospitalId === state.loggedInHospitalId;

    if (msgEl) {
      msgEl.innerHTML = `
        <strong>${notif.fromHospitalName}</strong> has only <strong class="text-rose-700">${notif.currentStockLeft} cylinders left</strong> (&le; 20 threshold)! 
        Urgent request for <strong>${notif.requestedQuantity} cylinders</strong>.
      `;
    }

    if (actionsEl) {
      if (isDonor) {
        actionsEl.innerHTML = `
          <button onclick="respondToNotif('${notif.id}', 'APPROVE')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition cursor-pointer">
            Approve & Dispatch Ambulance (${notif.requestedQuantity} Cylinders)
          </button>
          <button onclick="respondToNotif('${notif.id}', 'DISMISS')" class="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer">
            Dismiss
          </button>
        `;
      } else {
        actionsEl.innerHTML = `
          <span class="text-amber-800 font-semibold">Awaiting transfer approval from ${notif.toHospitalName}...</span>
        `;
      }
    }
  } else {
    badge.classList.add('hidden');
    drawer.classList.add('hidden');
  }
}

window.respondToNotif = async function(notificationId, action) {
  try {
    const res = await fetch('/api/notifications/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        action,
        hospitalId: state.loggedInHospitalId
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('✓ Transfer approved! Ambulance dispatched with oxygen cylinders.', 'success');
      await loadInitialData();
      await loadNotifications();
      await loadAuditHistory();
    }
  } catch (err) {
    showToast('Error responding to notification: ' + err.message, 'error');
  }
};

// 11. Interactive Google Maps Setup
function initMap() {
  const mapContainer = document.getElementById('hospitalMap');
  if (!mapContainer || state.map) return;

  state.map = L.map('hospitalMap', {
    center: [40.725, -73.985],
    zoom: 12,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(state.map);

  Object.keys(HOSPITALS_DATA).forEach(hospId => {
    const h = HOSPITALS_DATA[hospId];
    
    const marker = L.circleMarker([h.lat, h.lng], {
      radius: 10,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(state.map);

    marker.bindPopup(`
      <div class="p-3 text-xs space-y-1">
        <h4 class="font-bold text-slate-800 text-sm">${h.shortName} (${h.area})</h4>
        <p class="text-slate-600">${h.fullName}</p>
        <p class="text-slate-500">📍 ${h.address}</p>
        <p class="font-mono text-emerald-700 font-bold">📞 ${h.phone}</p>
        <div class="pt-2">
          <a href="https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}" target="_blank" class="px-2 py-1 rounded bg-blue-600 text-white font-bold text-[11px] inline-block">
            Open in Google Maps &rarr;
          </a>
        </div>
      </div>
    `);

    marker.on('click', () => {
      selectHospitalOnMap(hospId);
    });

    state.mapMarkers[hospId] = marker;
  });

  selectHospitalOnMap('HOSP-01');
}

function updateMapData() {
  if (!state.map || !state.predictions) return;

  const threshold = state.optimizerRules?.emergencyThreshold ?? 20;
  const highest = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock)[0]?.hospitalId;

  state.predictions.forEach(p => {
    const marker = state.mapMarkers[p.hospitalId];
    if (marker) {
      let color = '#10b981';
      if (p.currentStock <= threshold) color = '#dc2626';
      else if (p.timeToShortageHours !== null && p.timeToShortageHours <= 6) color = '#f59e0b';
      else if (p.hospitalId === highest) color = '#059669';

      marker.setStyle({ fillColor: color });
    }
  });

  if (state.recommendations && state.recommendations.length > 0) {
    const topRec = state.recommendations[0];
    const donor = getHosp(topRec.donorId);
    const recip = getHosp(topRec.recipientId);

    if (donor && recip && donor.lat && recip.lat) {
      if (state.routePolyline) {
        state.map.removeLayer(state.routePolyline);
      }

      state.routePolyline = L.polyline(
        [[donor.lat, donor.lng], [recip.lat, recip.lng]],
        { color: '#4f46e5', weight: 4, dashArray: '6, 8', opacity: 0.85 }
      ).addTo(state.map);
    }
  }
}

window.selectHospitalOnMap = function(hospitalId) {
  state.selectedHospitalId = hospitalId;
  const h = getHosp(hospitalId);
  if (!h) return;

  if (state.map && h.lat && h.lng) {
    state.map.flyTo([h.lat, h.lng], 14, { duration: 0.8 });
    const marker = state.mapMarkers[hospitalId];
    if (marker) marker.openPopup();
  }

  const nameEl = document.getElementById('mapCardHospitalName');
  const areaEl = document.getElementById('mapCardArea');
  const addrEl = document.getElementById('mapCardAddress');
  const coordsEl = document.getElementById('mapCardCoords');
  const phoneEl = document.getElementById('mapCardPhone');
  const stockEl = document.getElementById('mapCardStock');
  const pairingEl = document.getElementById('mapCardPairingText');
  const gmapsBtn = document.getElementById('btnOpenInGoogleMaps');
  const gmapsDirBtn = document.getElementById('btnGoogleMapsDirections');
  const selector = document.getElementById('mapHospitalSelector');

  if (selector) selector.value = hospitalId;
  if (nameEl) nameEl.textContent = `${h.shortName} (${h.fullName})`;
  if (areaEl) areaEl.textContent = `${h.area} Corridor`;
  if (addrEl) addrEl.textContent = h.address;
  if (coordsEl && h.lat && h.lng) coordsEl.textContent = `${h.lat.toFixed(4)}° N, ${Math.abs(h.lng).toFixed(4)}° W`;
  if (phoneEl) phoneEl.textContent = h.phone;

  const pred = state.predictions.find(p => p.hospitalId === hospitalId);
  if (stockEl) stockEl.textContent = `${pred ? Math.round(pred.currentStock) : 100} Cylinders`;

  if (gmapsBtn && h.lat && h.lng) {
    gmapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`;
  }
  if (gmapsDirBtn && h.lat && h.lng) {
    const donor = getHosp('HOSP-02');
    gmapsDirBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${donor.lat},${donor.lng}&destination=${h.lat},${h.lng}`;
  }

  if (pairingEl) {
    pairingEl.innerHTML = `Connected to <strong>Hospital B (St. Jude Medical Center)</strong> &mdash; Direct emergency cryo-logistics corridor via Google Maps.`;
  }
};

// 12. Audit History Table
async function loadAuditHistory() {
  try {
    const res = await fetch('/api/transfers/history');
    state.transferLogs = await res.json();
    renderHistoryTable();
    renderTopKPIs();
  } catch (err) {
    console.error('Failed to load audit history:', err);
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (!state.transferLogs || state.transferLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">No transfer dispatches logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.transferLogs.slice(0, 15).map(log => {
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const donorInfo = getHosp(log.donorId);
    const recipInfo = getHosp(log.recipientId);

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="font-mono font-bold text-slate-700">${timeStr}</span>
          <span class="text-[10px] text-slate-400 block">${log.manifestId || 'MAN-LOG'}</span>
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">
          +${log.quantity} cyl
        </td>
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-800">${donorInfo.shortName}</span>
          <span class="text-[11px] text-slate-500 block truncate max-w-[140px]">${log.donorName}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-800">${recipInfo.shortName}</span>
          <span class="text-[11px] text-slate-500 block truncate max-w-[140px]">${log.recipientName}</span>
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">
          ${log.ambulanceNumber || 'AMB-DISPATCH'}
        </td>
        <td class="py-2.5 px-3 text-xs">
          <span class="font-semibold text-slate-800 block">${log.deliveryDriver || 'Logistics Driver'}</span>
          <span class="font-mono text-emerald-700 text-[11px]">${log.driverPhone || '+1 (555) 000-0000'}</span>
        </td>
        <td class="py-2.5 px-3 text-xs text-slate-600 italic max-w-xs truncate" title="${log.geminiJustification || ''}">
          "${log.geminiJustification || 'Clinical shortage replenishment.'}"
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            DELIVERED
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// Action Handlers
window.executeTransferAction = async function(donorId, recipientId, quantity, geminiJustification) {
  try {
    const res = await fetch('/api/transfers/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ donorId, recipientId, quantity, geminiJustification })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Transfer of ${quantity} cylinders executed! Ambulance dispatched.`, 'success');
      await loadInitialData();
      await loadAuditHistory();
    } else {
      showToast(data.error || 'Transfer failed', 'error');
    }
  } catch (err) {
    showToast('Transfer failed: ' + err.message, 'error');
  }
};

window.setHospitalStock = async function(hospitalId, newStock) {
  try {
    const stockToSet = newStock !== undefined ? newStock : 12;
    await fetch('/api/simulation/set-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, stock: stockToSet })
    });
    showToast(`⚠️ Hospital stock set to ${stockToSet} cyl (<= 20)! Emergency protocol activated.`, 'error');
    await loadInitialData();
  } catch (err) {
    showToast('Error setting stock: ' + err.message, 'error');
  }
};

window.deliverStock = async function(hospitalId, quantity) {
  try {
    await fetch('/api/simulation/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, quantity: quantity || 40 })
    });
    showToast(`📦 Replenished +${quantity} cylinders!`, 'success');
    await loadInitialData();
  } catch (err) {
    showToast('Error delivering stock', 'error');
  }
};

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function setupEventListeners() {
  // Hospital Login Switcher handler
  const loginSelect = document.getElementById('userHospitalLoginSelect');
  if (loginSelect) {
    loginSelect.addEventListener('change', async (e) => {
      await quickLoginHospital(e.target.value);
    });
  }

  // Barcode Scanner Buttons
  const btnConsume = document.getElementById('btnScanConsume');
  if (btnConsume) {
    btnConsume.addEventListener('click', () => triggerBarcodeScan('CONSUME'));
  }

  const btnReceive = document.getElementById('btnScanReceive');
  if (btnReceive) {
    btnReceive.addEventListener('click', () => triggerBarcodeScan('RECEIVE'));
  }

  const barcodeInput = document.getElementById('barcodeInput');
  if (barcodeInput) {
    barcodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') triggerBarcodeScan('CONSUME');
    });
  }

  // Notification Bell toggle
  const btnBell = document.getElementById('btnToggleNotifications');
  if (btnBell) {
    btnBell.addEventListener('click', () => {
      const drawer = document.getElementById('notificationDrawer');
      if (drawer) drawer.classList.toggle('hidden');
    });
  }

  // Search input handler
  const searchInput = document.getElementById('searchHospitalsInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value;
      renderStockLevelsTable();
    });
  }

  // Risk filter dropdown handler
  const riskSelect = document.getElementById('riskFilterSelect');
  if (riskSelect) {
    riskSelect.addEventListener('change', (e) => {
      state.riskFilter = e.target.value;
      renderStockLevelsTable();
    });
  }

  // Map selector dropdown handler
  const mapSelect = document.getElementById('mapHospitalSelector');
  if (mapSelect) {
    mapSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        selectHospitalOnMap(e.target.value);
      }
    });
  }

  // Button: Simulate demand
  const btnSimDemand = document.getElementById('btnSimulateDemand');
  if (btnSimDemand) {
    btnSimDemand.addEventListener('click', async () => {
      const thresh = state.optimizerRules?.emergencyThreshold ?? 20;
      const targetStock = Math.max(5, thresh - 5);
      await fetch('/api/simulation/set-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'HOSP-01', stock: targetStock })
      });
      showToast(`🚨 Demand simulated! Hospital A dropped to ${targetStock} cylinders (<= ${thresh}). Emergency rule triggered!`, 'error');
      await loadInitialData();
    });
  }

  // Button: Detect & transfer
  const btnDetectTransfer = document.getElementById('btnDetectTransfer');
  if (btnDetectTransfer) {
    btnDetectTransfer.addEventListener('click', async () => {
      if (state.recommendations && state.recommendations.length > 0) {
        const topRec = state.recommendations[0];
        await executeTransferAction(
          topRec.donorId,
          topRec.recipientId,
          topRec.transferQuantity,
          topRec.geminiJustification
        );
      } else {
        showToast('All district facilities are currently balanced.', 'info');
      }
    });
  }
}

// ==========================================
// Emergency Protocol & Transfer Rules Tuning
// ==========================================

async function loadOptimizerRules() {
  try {
    const res = await fetch('/api/optimizer/rules');
    if (res.ok) {
      const rules = await res.json();
      state.optimizerRules = rules;
      syncRulesUI(rules);
    }
  } catch (err) {
    console.error('Failed to load optimizer rules:', err);
  }
}

function syncRulesUI(rules) {
  if (!rules) return;
  const slider = document.getElementById('ruleThresholdSlider');
  const threshDisplay = document.getElementById('ruleThresholdDisplay');
  const badgeThresh = document.getElementById('topRuleThresholdBadge');
  const batchSelect = document.getElementById('ruleBatchSelect');
  const batchDisplay = document.getElementById('ruleBatchDisplay');
  const stratSelect = document.getElementById('ruleStrategySelect');
  const stratDisplay = document.getElementById('ruleStrategyDisplay');

  if (slider && rules.emergencyThreshold !== undefined) {
    slider.value = rules.emergencyThreshold;
  }
  if (threshDisplay && rules.emergencyThreshold !== undefined) {
    threshDisplay.textContent = `≤ ${rules.emergencyThreshold} Cylinders`;
  }
  if (badgeThresh && rules.emergencyThreshold !== undefined) {
    badgeThresh.textContent = rules.emergencyThreshold;
  }
  if (batchSelect && rules.batchQuantity !== undefined) {
    batchSelect.value = rules.batchQuantity;
  }
  if (batchDisplay && rules.batchQuantity !== undefined) {
    batchDisplay.textContent = `${rules.batchQuantity} Units`;
  }
  if (stratSelect && rules.pairingStrategy) {
    stratSelect.value = rules.pairingStrategy;
  }
  if (stratDisplay && rules.pairingStrategy) {
    stratDisplay.textContent = rules.pairingStrategy === 'HIGHEST_STOCK' ? 'MAX SURPLUS' : 'MIN DISTANCE';
  }

  // Update preset pills active state
  document.querySelectorAll('.btn-thresh-preset').forEach(b => {
    const isAct = Number(b.getAttribute('data-thresh')) === Number(rules.emergencyThreshold);
    b.className = `btn-thresh-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
      isAct ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800'
    }`;
  });

  document.querySelectorAll('.btn-batch-preset').forEach(b => {
    const isAct = Number(b.getAttribute('data-batch')) === Number(rules.batchQuantity);
    b.className = `btn-batch-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
      isAct ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800'
    }`;
  });

  document.querySelectorAll('.btn-strat-preset').forEach(b => {
    const isAct = b.getAttribute('data-strat') === rules.pairingStrategy;
    b.className = `btn-strat-preset px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
      isAct ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800'
    }`;
  });
}

function syncSimulationUI() {
  const speedSlider = document.getElementById('simSpeedSlider');
  const speedLabel = document.getElementById('simSpeedLabel');
  const btnToggleSim = document.getElementById('btnToggleSimFeed');
  const speedPulse = document.getElementById('simSpeedPulse');

  if (!state.simulation) return;

  const ms = state.simulation.intervalMs || 3000;
  if (speedSlider) speedSlider.value = ms;
  if (speedLabel) {
    speedLabel.textContent = state.simulation.isRunning ? `${(ms / 1000).toFixed(1)}s / Tick` : 'PAUSED';
  }
  if (speedPulse) {
    speedPulse.className = state.simulation.isRunning ? 'h-1.5 w-1.5 rounded-full bg-cyan-500 animate-ping' : 'h-1.5 w-1.5 rounded-full bg-slate-400';
  }
  if (btnToggleSim) {
    btnToggleSim.textContent = state.simulation.isRunning ? '⏸ Pause' : '▶ Resume';
    btnToggleSim.className = `px-2 py-0.5 rounded text-[10px] font-bold text-white transition cursor-pointer shrink-0 ${
      state.simulation.isRunning ? 'bg-slate-800 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700'
    }`;
  }

  // Update speed preset buttons active state
  document.querySelectorAll('.btn-speed-preset').forEach(b => {
    const isAct = Number(b.getAttribute('data-speed')) === ms;
    b.className = `btn-speed-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
      isAct ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 hover:bg-cyan-100 text-slate-700 hover:text-cyan-800'
    }`;
  });
}

async function loadSimulationStatus() {
  try {
    const res = await fetch('/api/simulation/status');
    if (res.ok) {
      state.simulation = await res.json();
      syncSimulationUI();
    }
  } catch (err) {
    console.error('Failed to load simulation status:', err);
  }
}

function setupOptimizerRulesEventListeners() {
  const slider = document.getElementById('ruleThresholdSlider');
  const threshDisplay = document.getElementById('ruleThresholdDisplay');
  const badgeThresh = document.getElementById('topRuleThresholdBadge');
  const batchSelect = document.getElementById('ruleBatchSelect');
  const batchDisplay = document.getElementById('ruleBatchDisplay');
  const stratSelect = document.getElementById('ruleStrategySelect');
  const stratDisplay = document.getElementById('ruleStrategyDisplay');
  const btnToggle = document.getElementById('btnToggleRulesPanel');
  const rulesBody = document.getElementById('rulesPanelBody');
  const toggleText = document.getElementById('rulesToggleText');
  const btnApply = document.getElementById('btnApplyRules');
  const btnReset = document.getElementById('btnResetRules');

  // Collapse / Expand toggle
  if (btnToggle && rulesBody) {
    btnToggle.addEventListener('click', () => {
      const isHidden = rulesBody.classList.toggle('hidden');
      if (toggleText) {
        toggleText.textContent = isHidden ? 'Expand Rules' : 'Collapse Rules';
      }
    });
  }

  // Threshold slider change
  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = e.target.value;
      if (threshDisplay) threshDisplay.textContent = `≤ ${val} Cylinders`;
      if (badgeThresh) badgeThresh.textContent = val;
      document.querySelectorAll('.btn-thresh-preset').forEach(b => {
        const isAct = Number(b.getAttribute('data-thresh')) === Number(val);
        b.className = `btn-thresh-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
          isAct ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800'
        }`;
      });
    });
  }

  // Threshold presets click
  document.querySelectorAll('.btn-thresh-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-thresh');
      if (slider) {
        slider.value = val;
        slider.dispatchEvent(new Event('input'));
      }
    });
  });

  // Batch select change
  if (batchSelect) {
    batchSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (batchDisplay) batchDisplay.textContent = `${val} Units`;
      document.querySelectorAll('.btn-batch-preset').forEach(b => {
        const isAct = Number(b.getAttribute('data-batch')) === Number(val);
        b.className = `btn-batch-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
          isAct ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800'
        }`;
      });
    });
  }

  // Batch presets click
  document.querySelectorAll('.btn-batch-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-batch');
      if (batchSelect) {
        batchSelect.value = val;
        batchSelect.dispatchEvent(new Event('change'));
      }
    });
  });

  // Strategy select change
  if (stratSelect) {
    stratSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (stratDisplay) {
        stratDisplay.textContent = val === 'HIGHEST_STOCK' ? 'MAX SURPLUS' : 'MIN DISTANCE';
      }
      document.querySelectorAll('.btn-strat-preset').forEach(b => {
        const isAct = b.getAttribute('data-strat') === val;
        b.className = `btn-strat-preset px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
          isAct ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800'
        }`;
      });
    });
  }

  // Strategy presets click
  document.querySelectorAll('.btn-strat-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-strat');
      if (stratSelect) {
        stratSelect.value = val;
        stratSelect.dispatchEvent(new Event('change'));
      }
    });
  });

  // Simulator Speed Slider & Presets
  const speedSlider = document.getElementById('simSpeedSlider');
  const speedLabel = document.getElementById('simSpeedLabel');
  const btnToggleSim = document.getElementById('btnToggleSimFeed');

  async function setSimulatorInterval(ms) {
    if (speedSlider) speedSlider.value = ms;
    if (speedLabel && (!state.simulation || state.simulation.isRunning)) {
      speedLabel.textContent = `${(ms / 1000).toFixed(1)}s / Tick`;
    }
    document.querySelectorAll('.btn-speed-preset').forEach(b => {
      const isAct = Number(b.getAttribute('data-speed')) === ms;
      b.className = `btn-speed-preset px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
        isAct ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 hover:bg-cyan-100 text-slate-700 hover:text-cyan-800'
      }`;
    });

    try {
      const res = await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: ms })
      });
      const data = await res.json();
      state.simulation = data;
      showToast(`⚡ Simulator cadence set to ${(ms / 1000).toFixed(1)}s per tick!`, 'info');
    } catch (err) {
      showToast('Failed to adjust simulator speed: ' + err.message, 'error');
    }
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const ms = Number(e.target.value);
      if (speedLabel) speedLabel.textContent = `${(ms / 1000).toFixed(1)}s / Tick`;
    });
    speedSlider.addEventListener('change', (e) => {
      setSimulatorInterval(Number(e.target.value));
    });
  }

  document.querySelectorAll('.btn-speed-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ms = Number(e.currentTarget.getAttribute('data-speed'));
      setSimulatorInterval(ms);
    });
  });

  if (btnToggleSim) {
    btnToggleSim.addEventListener('click', async () => {
      const isCurrentlyRunning = state.simulation ? state.simulation.isRunning : true;
      const action = isCurrentlyRunning ? 'pause' : 'start';
      try {
        const res = await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        const data = await res.json();
        state.simulation = data;
        syncSimulationUI();
        showToast(data.isRunning ? '▶ Simulator live stream resumed' : '⏸ Simulator feed paused', 'info');
      } catch (err) {
        showToast('Error toggling simulation feed: ' + err.message, 'error');
      }
    });
  }

  // Apply button
  if (btnApply) {
    btnApply.addEventListener('click', async () => {
      const threshold = Number(slider?.value || 20);
      const batch = Number(batchSelect?.value || 40);
      const strategy = stratSelect?.value || 'HIGHEST_STOCK';

      btnApply.disabled = true;
      btnApply.innerHTML = '<span class="animate-spin inline-block mr-1">⌛</span> Applying...';

      try {
        const res = await fetch('/api/optimizer/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emergencyThreshold: threshold,
            batchQuantity: batch,
            pairingStrategy: strategy
          })
        });
        const data = await res.json();
        if (data.success) {
          state.optimizerRules = data.rules;
          syncRulesUI(data.rules);
          if (data.plan) {
            state.recommendations = data.plan.recommendations || [];
            state.predictions = data.plan.predictions || [];
            state.hospitalWithMostCylinders = data.plan.hospitalWithMostCylinders || null;
          }
          renderAll();
          updateMapData();
          showToast(`✓ Emergency Rules applied! Threshold: &le;${threshold} cyl | Batch: ${batch} | Strategy: ${strategy}`, 'success');
        } else {
          showToast(data.error || 'Failed to update rules', 'error');
        }
      } catch (err) {
        showToast('Error applying rules: ' + err.message, 'error');
      } finally {
        btnApply.disabled = false;
        btnApply.innerHTML = '<i data-lucide="check-circle" class="h-3.5 w-3.5"></i><span>Apply & Re-Optimize</span>';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Reset button
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/optimizer/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emergencyThreshold: 20,
            batchQuantity: 40,
            pairingStrategy: 'HIGHEST_STOCK'
          })
        });
        const data = await res.json();
        if (data.success) {
          state.optimizerRules = data.rules;
          syncRulesUI(data.rules);
          if (data.plan) {
            state.recommendations = data.plan.recommendations || [];
            state.predictions = data.plan.predictions || [];
            state.hospitalWithMostCylinders = data.plan.hospitalWithMostCylinders || null;
          }
          renderAll();
          updateMapData();
          showToast('✓ Optimizer rules reset to standard clinical defaults (20 cyl / 40 batch).', 'info');
        }
      } catch (err) {
        showToast('Error resetting rules: ' + err.message, 'error');
      }
    });
  }

  // Stress tests
  const btnSurge = document.getElementById('btnQuickSurge');
  if (btnSurge) {
    btnSurge.addEventListener('click', async () => {
      const targetId = state.selectedHospitalId || state.loggedInHospitalId || 'HOSP-01';
      try {
        await fetch('/api/simulation/surge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hospitalId: targetId, multiplier: 2.5 })
        });
        showToast(`⚡ Surge 2.5x applied to ${getHosp(targetId).shortName}! Demand accelerating.`, 'alert');
        await loadInitialData();
      } catch (err) {
        showToast('Surge simulation failed: ' + err.message, 'error');
      }
    });
  }

  const btnEmergency = document.getElementById('btnQuickEmergency');
  if (btnEmergency) {
    btnEmergency.addEventListener('click', async () => {
      const targetId = state.selectedHospitalId || state.loggedInHospitalId || 'HOSP-01';
      const thresh = state.optimizerRules?.emergencyThreshold ?? 20;
      const targetStock = Math.max(5, thresh - 5);
      try {
        await fetch('/api/simulation/set-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hospitalId: targetId, stock: targetStock })
        });
        showToast(`🚨 Simulated acute shortage at ${getHosp(targetId).shortName} (${targetStock} cyl &le; ${thresh})! Emergency protocol active.`, 'error');
        await loadInitialData();
      } catch (err) {
        showToast('Emergency simulation failed: ' + err.message, 'error');
      }
    });
  }

  const btnDelivery = document.getElementById('btnQuickDelivery');
  if (btnDelivery) {
    btnDelivery.addEventListener('click', async () => {
      const targetId = state.selectedHospitalId || state.loggedInHospitalId || 'HOSP-01';
      try {
        await fetch('/api/simulation/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hospitalId: targetId, quantity: 50 })
        });
        showToast(`🚛 Tanker delivered +50 cylinders to ${getHosp(targetId).shortName}! Reserves replenished.`, 'success');
        await loadInitialData();
      } catch (err) {
        showToast('Delivery simulation failed: ' + err.message, 'error');
      }
    });
  }
}

// ==========================================
// Dynamic Dropdowns & Map Marker Synchronizer
// ==========================================
function populateHospitalDropdowns() {
  const loginSelect = document.getElementById('userHospitalLoginSelect');
  const mapSelect = document.getElementById('mapHospitalSelector');

  if (loginSelect && state.hospitals.length > 0) {
    const currentVal = state.loggedInHospitalId;
    loginSelect.innerHTML = state.hospitals.map(h => {
      const info = getHosp(h.id);
      return `<option value="${h.id}" class="bg-slate-900 text-white" ${h.id === currentVal ? 'selected' : ''}>Switch: ${info.shortName} (${h.name})</option>`;
    }).join('');
  }

  if (mapSelect && state.hospitals.length > 0) {
    const currentVal = state.selectedHospitalId;
    mapSelect.innerHTML = `<option value="">Select hospital to zoom...</option>` + state.hospitals.map(h => {
      const info = getHosp(h.id);
      return `<option value="${h.id}" ${h.id === currentVal ? 'selected' : ''}>${info.shortName}: ${h.name}</option>`;
    }).join('');
  }
}

function syncMapMarkers() {
  if (!state.map) return;
  const list = state.hospitals.length > 0 ? state.hospitals : Object.keys(HOSPITALS_DATA).map(id => ({
    id,
    ...HOSPITALS_DATA[id],
    location: {
      lat: HOSPITALS_DATA[id].lat,
      lng: HOSPITALS_DATA[id].lng,
      address: HOSPITALS_DATA[id].address,
      phone: HOSPITALS_DATA[id].phone
    }
  }));

  list.forEach(hosp => {
    const hospId = hosp.id;
    const h = getHosp(hospId);
    const lat = hosp.location?.lat || h.lat;
    const lng = hosp.location?.lng || h.lng;

    if (!state.mapMarkers[hospId] && lat && lng) {
      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: '#10b981',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(state.map);

      marker.bindPopup(`
        <div class="p-3 text-xs space-y-1">
          <h4 class="font-bold text-slate-800 text-sm">${h.shortName} (${h.area})</h4>
          <p class="text-slate-600 font-semibold">${h.fullName}</p>
          <p class="text-slate-500">📍 ${hosp.location?.address || h.address}</p>
          <p class="font-mono text-emerald-700 font-bold">📞 ${hosp.location?.phone || h.phone}</p>
          <div class="pt-2">
            <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" class="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] inline-block shadow-xs">
              Open in Google Maps &rarr;
            </a>
          </div>
        </div>
      `);

      marker.on('click', () => {
        selectHospitalOnMap(hospId);
      });

      state.mapMarkers[hospId] = marker;
    }
  });
}

// ==========================================
// Hospital Authentication & Registration Logic
// ==========================================

function initAuth() {
  try {
    const raw = localStorage.getItem('oxygen_hospital_session');
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.hospital && session.hospital.id) {
        state.loggedInHospitalId = session.hospital.id;
        state.currentUser = session.user || null;
        state.authToken = session.token || null;
        updateHeaderAuthUI(session.hospital, session.user);
        closeAuthModal();
        return;
      }
    }
  } catch (e) {
    console.warn('Error reading saved session:', e);
  }

  // Not logged in: Show modal
  openAuthModal('login', false);
}

function updateHeaderAuthUI(hospital, user) {
  const nameEl = document.getElementById('headerHospitalName');
  const staffEl = document.getElementById('headerHospitalStaff');
  const loginSelect = document.getElementById('userHospitalLoginSelect');
  const label = document.getElementById('scannerActiveHospitalLabel');

  const hInfo = getHosp(hospital.id);
  const displayName = hospital.name || hInfo.fullName;
  const staffName = user?.contactPerson || 'Staff Coordinator';

  if (nameEl) nameEl.textContent = `${hInfo.shortName} (${displayName})`;
  if (staffEl) staffEl.textContent = `${staffName} • Connected`;
  if (loginSelect) loginSelect.value = hospital.id;
  if (label) label.textContent = `${hInfo.shortName} (${displayName})`;
}

function openAuthModal(initialTab = 'login', allowClose = true) {
  const modal = document.getElementById('authModal');
  const closeBtn = document.getElementById('btnCloseAuthModal');
  if (!modal) return;

  if (closeBtn) {
    if (allowClose) closeBtn.classList.remove('hidden');
    else closeBtn.classList.add('hidden');
  }

  switchAuthTab(initialTab);
  modal.classList.remove('hidden');
  hideAuthAlert();
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
  hideAuthAlert();
}

function switchAuthTab(tab) {
  const loginView = document.getElementById('loginView');
  const registerView = document.getElementById('registerView');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');

  hideAuthAlert();

  if (tab === 'login') {
    if (loginView) loginView.classList.remove('hidden');
    if (registerView) registerView.classList.add('hidden');
    if (tabLoginBtn) {
      tabLoginBtn.className = 'flex-1 py-2 rounded-md text-white bg-indigo-600 shadow-sm transition text-center cursor-pointer';
    }
    if (tabRegisterBtn) {
      tabRegisterBtn.className = 'flex-1 py-2 rounded-md text-slate-300 hover:text-white transition text-center cursor-pointer';
    }
  } else {
    if (loginView) loginView.classList.add('hidden');
    if (registerView) registerView.classList.remove('hidden');
    if (tabLoginBtn) {
      tabLoginBtn.className = 'flex-1 py-2 rounded-md text-slate-300 hover:text-white transition text-center cursor-pointer';
    }
    if (tabRegisterBtn) {
      tabRegisterBtn.className = 'flex-1 py-2 rounded-md text-white bg-emerald-600 shadow-sm transition text-center cursor-pointer';
    }
  }
}

function showAuthAlert(message, isError = true) {
  const alertEl = document.getElementById('authAlert');
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.className = isError
    ? 'mx-6 mt-4 p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block'
    : 'mx-6 mt-4 p-3 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block';
}

function hideAuthAlert() {
  const alertEl = document.getElementById('authAlert');
  if (alertEl) alertEl.className = 'hidden';
}

async function quickLoginHospital(hospitalId) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthAlert(data.error || 'Failed to sign in', true);
      return;
    }

    localStorage.setItem('oxygen_hospital_session', JSON.stringify({
      hospital: data.hospital,
      user: data.user,
      token: data.token
    }));

    state.loggedInHospitalId = data.hospital.id;
    state.currentUser = data.user;
    state.authToken = data.token;

    updateHeaderAuthUI(data.hospital, data.user);
    closeAuthModal();
    showToast(`✓ Logged in as ${data.hospital.name}`, 'info');

    updateQuickScanChips();
    updateScannerDisplayStock();
    await loadNotifications();
    renderStockLevelsTable();
  } catch (err) {
    showAuthAlert('Network error: ' + err.message, true);
  }
}
window.quickLoginHospital = quickLoginHospital;

async function handleLoginSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email) {
    showAuthAlert('Please enter your account email or select a facility.', true);
    return;
  }

  const submitBtn = document.getElementById('btnSubmitLogin');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⌛</span> Signing In...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthAlert(data.error || 'Login failed. Please check your credentials.', true);
      return;
    }

    localStorage.setItem('oxygen_hospital_session', JSON.stringify({
      hospital: data.hospital,
      user: data.user,
      token: data.token
    }));

    state.loggedInHospitalId = data.hospital.id;
    state.currentUser = data.user;
    state.authToken = data.token;

    updateHeaderAuthUI(data.hospital, data.user);
    closeAuthModal();
    showToast(`✓ Welcome, ${data.user?.contactPerson || 'Staff'}! Signed in to ${data.hospital.name}.`, 'success');

    updateQuickScanChips();
    updateScannerDisplayStock();
    await loadNotifications();
    renderStockLevelsTable();
  } catch (err) {
    showAuthAlert('Sign in error: ' + err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="log-in" class="h-4 w-4"></i><span>Sign In to Hospital Portal</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('regHospitalName').value.trim();
  const type = document.getElementById('regHospitalType').value;
  const address = document.getElementById('regAddress').value.trim();
  const district = document.getElementById('regDistrict').value.trim();
  const dispatchContact = document.getElementById('regContactPerson').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const capacity = document.getElementById('regCapacity').value;
  const initialStock = document.getElementById('regInitialStock').value;
  const baselineBurnRate = document.getElementById('regBurnRate').value;
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!name || !email || !password || !address) {
    showAuthAlert('Please fill in all required fields (*).', true);
    return;
  }

  const submitBtn = document.getElementById('btnSubmitRegister');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⌛</span> Registering Facility...';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type,
        address,
        district,
        dispatchContact,
        phone,
        capacity: Number(capacity),
        initialStock: Number(initialStock),
        baselineBurnRate: Number(baselineBurnRate),
        email,
        password
      })
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthAlert(data.error || 'Registration failed.', true);
      return;
    }

    localStorage.setItem('oxygen_hospital_session', JSON.stringify({
      hospital: data.hospital,
      user: data.user,
      token: data.token
    }));

    state.loggedInHospitalId = data.hospital.id;
    state.currentUser = data.user;
    state.authToken = data.token;

    // Reset form
    document.getElementById('formRegister').reset();

    await loadInitialData();
    updateHeaderAuthUI(data.hospital, data.user);
    closeAuthModal();

    showToast(`✓ Hospital ${data.hospital.name} registered and connected to District 04 Network!`, 'success');
    selectHospitalOnMap(data.hospital.id);
  } catch (err) {
    showAuthAlert('Registration error: ' + err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="building-2" class="h-4 w-4"></i><span>Register Hospital & Connect to Network</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function handleLogout() {
  localStorage.removeItem('oxygen_hospital_session');
  state.currentUser = null;
  state.authToken = null;
  showToast('Logged out of facility. Please sign in or select a facility.', 'info');
  openAuthModal('login', false);
}

function setupAuthEventListeners() {
  const formLogin = document.getElementById('formLogin');
  if (formLogin) formLogin.addEventListener('submit', handleLoginSubmit);

  const formRegister = document.getElementById('formRegister');
  if (formRegister) formRegister.addEventListener('submit', handleRegisterSubmit);

  const btnOpenRegister = document.getElementById('btnOpenRegisterModal');
  if (btnOpenRegister) {
    btnOpenRegister.addEventListener('click', () => openAuthModal('register', true));
  }

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }

  const btnClose = document.getElementById('btnCloseAuthModal');
  if (btnClose) {
    btnClose.addEventListener('click', closeAuthModal);
  }

  const tabLoginBtn = document.getElementById('tabLoginBtn');
  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));

  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => switchAuthTab('register'));

  const linkGoToRegister = document.getElementById('linkGoToRegister');
  if (linkGoToRegister) linkGoToRegister.addEventListener('click', () => switchAuthTab('register'));

  const linkGoToLogin = document.getElementById('linkGoToLogin');
  if (linkGoToLogin) linkGoToLogin.addEventListener('click', () => switchAuthTab('login'));
}

document.addEventListener('DOMContentLoaded', init);
