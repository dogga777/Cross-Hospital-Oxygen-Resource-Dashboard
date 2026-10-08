// Cross-Hospital Oxygen Resource Dashboard
// Matching uploaded UI layout + Google Maps Location Finder

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
  selectedHospitalId: 'HOSP-01'
};

// District 04 Hospital Mapping with coordinates, areas, and letters
const HOSPITALS_DATA = {
  'HOSP-01': {
    letter: 'A',
    area: 'Downtown',
    shortName: 'Hospital A',
    fullName: 'Metro General Hospital',
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
    fullName: 'Memorial District Hospital',
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
    fullName: 'Sunset Valley Pavilion',
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
    fullName: 'Crestview Medical Center',
    lat: 40.6782,
    lng: -73.9442,
    address: '220 Crestview Rd, East Foothills',
    phone: '+1 (555) 011-8452',
    dotColor: 'bg-emerald-500'
  }
};

function getHosp(id) {
  return HOSPITALS_DATA[id] || {
    letter: '?',
    area: 'District',
    shortName: 'Hospital ?',
    fullName: 'District Hospital',
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
    error: 'bg-rose-950 border-rose-500 text-rose-200'
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

// Initialize application
async function init() {
  startLiveClock();
  initMap();
  setupEventListeners();
  await loadInitialData();
  setupWebSocket();
  await loadAuditHistory();
}

// 1. Live Clock display matching screenshot (e.g. 10:53:51 AM)
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
    const res = await fetch('/api/recommendations');
    const data = await res.json();

    state.recommendations = data.recommendations || [];
    state.predictions = data.predictions || [];
    state.hospitalWithMostCylinders = data.hospitalWithMostCylinders || null;

    renderAll();
    updateMapData();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// 3. WebSocket Real-Time Telemetry Stream
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
      } else if (data.type === 'TRANSFER_EXECUTED') {
        showToast(`✓ Ambulance dispatched! ${data.transfer.quantity} cylinders transferred.`, 'success');
        loadAuditHistory();
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

// 4. Render Top 3 Metric KPI Cards (Matching image)
function renderTopKPIs() {
  if (!state.predictions) return;

  // 1. Current oxygen levels
  const totalCyl = state.predictions.reduce((acc, h) => acc + Math.round(h.currentStock), 0);
  const totalEl = document.getElementById('topTotalCylinders');
  if (totalEl) totalEl.textContent = totalCyl;

  // 2. Predicting shortages
  const atRiskCount = state.predictions.filter(h => h.currentStock <= 20 || (h.timeToShortageHours !== null && h.timeToShortageHours <= 6)).length;
  const atRiskEl = document.getElementById('topAtRiskCount');
  if (atRiskEl) atRiskEl.textContent = atRiskCount;

  // 3. Transfer activity
  const activeMoves = state.recommendations ? state.recommendations.length : 0;
  const movesEl = document.getElementById('topActiveTransfersCount');
  if (movesEl) movesEl.textContent = activeMoves;
}

// 5. Emergency Protocol Alert (Triggered when any hospital has <= 20 cylinders)
function renderEmergencyDispatchAlert() {
  const container = document.getElementById('emergencyDispatchSection');
  if (!container || !state.predictions) return;

  const urgentHosp = state.predictions.find(h => h.currentStock <= 20);
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
                CRITICAL EMERGENCY: ${urgentInfo.shortName} (${urgentInfo.fullName}) has only ${Math.round(urgentHosp.currentStock)} Cylinders Left (&le; 20 Threshold)!
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

// 6. Render Current Stock Levels Table (Matching screenshot layout)
function renderStockLevelsTable() {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody || !state.predictions) return;

  const sorted = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock);
  const highestId = sorted[0]?.hospitalId;

  // Filter based on search term & risk filter
  const term = state.searchTerm.toLowerCase().trim();
  const filter = state.riskFilter;

  const filteredHospitals = state.predictions.filter(h => {
    const info = getHosp(h.hospitalId);
    const matchesSearch = !term || 
      info.shortName.toLowerCase().includes(term) ||
      info.fullName.toLowerCase().includes(term) ||
      info.area.toLowerCase().includes(term);

    let matchesFilter = true;
    if (filter === 'critical') matchesFilter = h.currentStock <= 20;
    else if (filter === 'at_risk') matchesFilter = h.timeToShortageHours !== null && h.timeToShortageHours <= 6.0;
    else if (filter === 'stable') matchesFilter = h.currentStock > 20 && (h.timeToShortageHours === null || h.timeToShortageHours > 6.0);

    return matchesSearch && matchesFilter;
  });

  // Update hospital count badge in footer
  const countBadge = document.getElementById('hospitalCountBadge');
  if (countBadge) countBadge.textContent = `${filteredHospitals.length} hospitals`;

  if (filteredHospitals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">No hospitals match your search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredHospitals.map(h => {
    const info = getHosp(h.hospitalId);
    const isHighest = h.hospitalId === highestId;
    const isUnder20 = h.currentStock <= 20;

    // Dot color: amber, green, or blinking red
    let dotHtml = '';
    if (isUnder20) {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-rose-600 animate-pulse shrink-0"></span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 12.0) {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-amber-500 shrink-0"></span>`;
    } else {
      dotHtml = `<span class="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>`;
    }

    // Depletion rate in red font
    const burnRateHtml = `<span class="text-rose-600 font-semibold">-${Math.abs(h.depletionRatePerHour)}/hr</span>`;

    // Time to shortage
    let timeHtml = '';
    if (isUnder20) {
      timeHtml = `<span class="text-rose-600 font-extrabold animate-pulse">&le; 20 cyl (CRITICAL)</span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 4.0) {
      timeHtml = `<span class="text-rose-600 font-bold">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else if (h.timeToShortageHours !== null) {
      timeHtml = `<span class="text-slate-800 font-medium">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else {
      timeHtml = `<span class="text-slate-500">Surplus (>24h)</span>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="selectHospitalOnMap('${h.hospitalId}')">
        
        <!-- Hospital Name + Area (Matching screenshot) -->
        <td class="py-3.5 px-5">
          <div class="flex items-center space-x-2">
            ${dotHtml}
            <span class="font-bold text-slate-800">${info.shortName}</span>
            <span class="text-slate-400 text-xs font-normal">${info.area}</span>
            ${isHighest ? '<span class="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded-full ml-1">🟢 Most Cylinders</span>' : ''}
          </div>
          <span class="text-[11px] text-slate-400 block pl-4 mt-0.5">${info.fullName}</span>
        </td>

        <!-- Oxygen Cylinders -->
        <td class="py-3.5 px-5 font-bold text-slate-800 text-sm font-mono">
          ${Math.round(h.currentStock)}
        </td>

        <!-- Depletion Rate -->
        <td class="py-3.5 px-5">
          ${burnRateHtml}
        </td>

        <!-- Time to Shortage -->
        <td class="py-3.5 px-5">
          ${timeHtml}
        </td>

        <!-- Test controls -->
        <td class="py-3.5 px-5 text-right space-x-1.5 whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="setHospitalStock('${h.hospitalId}', 12)" class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition" title="Simulate dropping to 12 cylinders">
            Set 12 cyl (&le;20)
          </button>
          <button onclick="deliverStock('${h.hospitalId}', 40)" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition" title="Add 40 cylinders">
            +40 cyl
          </button>
        </td>

      </tr>
    `;
  }).join('');
}

// 7. Render Shortage Predictor (Matching screenshot: clean cards with curve graph)
function renderShortagePredictors() {
  const container = document.getElementById('shortagePredictorContainer');
  if (!container || !state.predictions) return;

  const hA = state.predictions.find(h => h.hospitalId === 'HOSP-01') || state.predictions[0];
  const hB = state.predictions.find(h => h.hospitalId === 'HOSP-02') || state.predictions[1];

  const infoA = getHosp(hA.hospitalId);
  const infoB = getHosp(hB.hospitalId);

  const hoursA = hA.timeToShortageHours ? hA.timeToShortageHours.toFixed(1) : '6.0';
  const hoursB = hB.timeToShortageHours ? hB.timeToShortageHours.toFixed(1) : '10.1';

  container.innerHTML = `
    <!-- Card 1: Hospital A (Matching screenshot) -->
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <span class="h-2 w-2 rounded-full bg-amber-500"></span>
          <span class="font-bold text-slate-800 text-sm">${infoA.shortName} &middot; Medium Risk</span>
        </div>
        <div class="font-bold text-slate-700 text-sm pl-4">Moderate decline</div>
        <div class="text-[11px] text-slate-400 pl-4">${hoursA} hrs remaining &middot; 97% model confidence</div>
      </div>

      <!-- Downward Curve Graph (Matching screenshot) -->
      <div class="w-36 h-12 shrink-0">
        <svg class="w-full h-full" viewBox="0 0 140 40">
          <path d="M 5,5 Q 40,25 70,30 L 135,30" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </div>
    </div>

    <!-- Card 2: Hospital B (Matching screenshot) -->
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <span class="h-2 w-2 rounded-full bg-amber-500"></span>
          <span class="font-bold text-slate-800 text-sm">${infoB.shortName} &middot; Medium Risk</span>
        </div>
        <div class="font-bold text-slate-700 text-sm pl-4">Moderate decline</div>
        <div class="text-[11px] text-slate-400 pl-4">${hoursB} hrs remaining &middot; 85% model confidence</div>
      </div>

      <!-- Downward Curve Graph (Matching screenshot) -->
      <div class="w-36 h-12 shrink-0">
        <svg class="w-full h-full" viewBox="0 0 140 40">
          <path d="M 5,5 Q 45,28 75,32 L 135,32" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </div>
    </div>
  `;
}

// 8. Render Transfer Recommendations (Matching screenshot: green banner boxes)
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

  container.innerHTML = state.recommendations.slice(0, 2).map((rec, idx) => {
    const donorInfo = getHosp(rec.donorId);
    const recipInfo = getHosp(rec.recipientId);

    return `
      <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm space-y-2.5">
        
        <!-- Header Row (Matching screenshot) -->
        <div class="flex items-center justify-between">
          <div class="font-bold text-slate-800 text-sm">
            ${donorInfo.shortName} &rarr; ${recipInfo.shortName}
          </div>
          <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Simulated transfer complete
          </span>
        </div>

        <!-- Transit & Logistics subtext -->
        <div class="text-xs text-slate-500">
          ${rec.transferQuantity} cylinders moved &middot; ${rec.transitDistanceKm || '11'} km &middot; ETA ${((rec.transitMinutes || 48) / 60).toFixed(1)} hrs
        </div>

        <!-- Solid Green Box (Exact look from screenshot) -->
        <div class="bg-[#2e7d32] text-white text-xs font-medium rounded-md p-3 shadow-sm leading-relaxed">
          ${recipInfo.shortName} has about ${Math.max(1, Math.round(rec.recipientDepletionHours || 5.8))} hours of oxygen remaining; ${donorInfo.shortName} can spare ${rec.transferQuantity} cylinders while keeping a 4.0-hour reserve.
        </div>

        <!-- Ambulance Plate, Driver & Direct Dispatch Button -->
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

// 9. Interactive Leaflet / Google Maps Location Finder Setup
function initMap() {
  const mapContainer = document.getElementById('hospitalMap');
  if (!mapContainer || state.map) return;

  // Initialize map centered on District 04 (NYC / Metro coordinates)
  state.map = L.map('hospitalMap', {
    center: [40.725, -73.985],
    zoom: 12,
    zoomControl: true
  });

  // OpenStreetMap Tile Layer (Clean, crisp, free, zero API key needed)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(state.map);

  // Add all hospital pins
  Object.keys(HOSPITALS_DATA).forEach(hospId => {
    const h = HOSPITALS_DATA[hospId];
    
    // Custom SVG circle marker
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

  // Select initial hospital
  selectHospitalOnMap('HOSP-01');
}

// Update Map markers based on live hospital oxygen stock levels
function updateMapData() {
  if (!state.map || !state.predictions) return;

  const highest = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock)[0]?.hospitalId;

  state.predictions.forEach(p => {
    const marker = state.mapMarkers[p.hospitalId];
    if (marker) {
      let color = '#10b981'; // green surplus
      if (p.currentStock <= 20) color = '#dc2626'; // red critical
      else if (p.timeToShortageHours !== null && p.timeToShortageHours <= 6) color = '#f59e0b'; // amber
      else if (p.hospitalId === highest) color = '#059669'; // dark green leader

      marker.setStyle({ fillColor: color });
    }
  });

  // Draw active ambulance transfer route line if recommendations exist
  if (state.recommendations && state.recommendations.length > 0) {
    const topRec = state.recommendations[0];
    const donor = HOSPITALS_DATA[topRec.donorId];
    const recip = HOSPITALS_DATA[topRec.recipientId];

    if (donor && recip) {
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

// Select a hospital and center map
window.selectHospitalOnMap = function(hospitalId) {
  state.selectedHospitalId = hospitalId;
  const h = HOSPITALS_DATA[hospitalId];
  if (!h) return;

  if (state.map) {
    state.map.flyTo([h.lat, h.lng], 14, { duration: 0.8 });
    const marker = state.mapMarkers[hospitalId];
    if (marker) marker.openPopup();
  }

  // Update Map Selected Card
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
  if (coordsEl) coordsEl.textContent = `${h.lat.toFixed(4)}° N, ${Math.abs(h.lng).toFixed(4)}° W`;
  if (phoneEl) phoneEl.textContent = h.phone;

  const pred = state.predictions.find(p => p.hospitalId === hospitalId);
  if (stockEl) stockEl.textContent = `${pred ? Math.round(pred.currentStock) : 100} Cylinders`;

  // Update Google Maps External Links
  if (gmapsBtn) {
    gmapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`;
  }
  if (gmapsDirBtn) {
    // Navigate from Primary Donor (Hospital B) to this hospital
    const donor = HOSPITALS_DATA['HOSP-02'];
    gmapsDirBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${donor.lat},${donor.lng}&destination=${h.lat},${h.lng}`;
  }

  if (pairingEl) {
    pairingEl.innerHTML = `Connected to <strong>Hospital B (St. Jude Medical Center)</strong> &mdash; Direct emergency cryo-logistics corridor via Google Maps.`;
  }
};

// 10. Audit History Table
async function loadAuditHistory() {
  try {
    const res = await fetch('/api/transfers/history');
    state.transferLogs = await res.json();
    renderHistoryTable();
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

  // Button: Load demo data (resets to default demo baseline)
  const btnDemo = document.getElementById('btnLoadDemoData');
  if (btnDemo) {
    btnDemo.addEventListener('click', async () => {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      showToast('🔄 Demo baseline loaded successfully.', 'info');
      await loadInitialData();
      await loadAuditHistory();
    });
  }

  // Button: Simulate demand (triggers surge to create realistic deficit)
  const btnSimDemand = document.getElementById('btnSimulateDemand');
  if (btnSimDemand) {
    btnSimDemand.addEventListener('click', async () => {
      await fetch('/api/simulation/set-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'HOSP-01', stock: 15 })
      });
      showToast('🚨 Demand simulated! Hospital A dropped to 15 cylinders (<= 20). Emergency rule triggered!', 'error');
      await loadInitialData();
    });
  }

  // Button: Detect & transfer (executes the top transfer recommendation immediately)
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

document.addEventListener('DOMContentLoaded', init);
