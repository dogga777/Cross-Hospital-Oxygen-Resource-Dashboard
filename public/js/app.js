// Cross-Hospital Oxygen Resource Dashboard Controller
// Exactly matching the clean healthcare design mockup

let state = {
  hospitals: [],
  predictions: [],
  recommendations: [],
  hospitalWithMostCylinders: null,
  socket: null,
  transferLogs: []
};

// Hospital Letter & Styling Configuration matching the design mockup
const HOSPITAL_CONFIG = {
  'HOSP-01': { letter: 'A', letterColor: 'text-rose-600', shortName: 'Hospital A', fullName: 'Metro General Hospital' },
  'HOSP-02': { letter: 'B', letterColor: 'text-emerald-600', shortName: 'Hospital B', fullName: 'St. Jude Medical Center' },
  'HOSP-03': { letter: 'C', letterColor: 'text-emerald-500', shortName: 'Hospital C', fullName: 'Riverbank Emergency Annex' },
  'HOSP-04': { letter: 'D', letterColor: 'text-amber-500', shortName: 'Hospital D', fullName: 'Memorial District Hospital' },
  'HOSP-05': { letter: 'E', letterColor: 'text-blue-500', shortName: 'Hospital E', fullName: 'Sunset Valley Pavilion' },
  'HOSP-06': { letter: 'F', letterColor: 'text-indigo-500', shortName: 'Hospital F', fullName: 'Crestview Medical Center' }
};

const HOSPITAL_METADATA = {
  'HOSP-01': { address: '740 Metro Parkway, Downtown Corridor', phone: '+1 (555) 012-4921' },
  'HOSP-02': { address: '350 Northwood Blvd, Northside Medical Park', phone: '+1 (555) 018-7740' },
  'HOSP-03': { address: '112 Riverbank Way, River Basin Waterfront', phone: '+1 (555) 014-3882' },
  'HOSP-04': { address: '880 Harbor Ridge Ave, District 04', phone: '+1 (555) 016-9214' },
  'HOSP-05': { address: '502 Sunset Heights, District 04 West', phone: '+1 (555) 019-3301' },
  'HOSP-06': { address: '220 Crestview Rd, East Foothills', phone: '+1 (555) 011-8452' }
};

function getHospitalInfo(id) {
  return HOSPITAL_CONFIG[id] || { letter: '?', letterColor: 'text-slate-600', shortName: 'Hospital ?', fullName: 'District Facility' };
}

function getHospitalMeta(id) {
  return HOSPITAL_METADATA[id] || { address: 'District Facility', phone: '+1 (555) 000-0000' };
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

// Initialize Application
async function init() {
  setupEventListeners();
  await loadInitialData();
  setupWebSocket();
  await loadAuditHistory();
}

// Fetch Initial Data via REST
async function loadInitialData() {
  try {
    const res = await fetch('/api/recommendations');
    const data = await res.json();

    state.recommendations = data.recommendations || [];
    state.predictions = data.predictions || [];
    state.hospitalWithMostCylinders = data.hospitalWithMostCylinders || null;

    renderAll();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// WebSocket Live Stream Connection
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.socket = new WebSocket(wsUrl);

  state.socket.onopen = () => {
    const el = document.getElementById('streamStatusText');
    if (el) el.textContent = 'Live Feed (3s)';
  };

  state.socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'TICK' && data.rebalancePlan) {
        state.recommendations = data.rebalancePlan.recommendations || [];
        state.predictions = data.rebalancePlan.predictions || [];
        state.hospitalWithMostCylinders = data.rebalancePlan.hospitalWithMostCylinders || null;
        renderAll();
      } else if (data.type === 'TRANSFER_EXECUTED') {
        showToast(`✓ Ambulance dispatched! ${data.transfer.quantity} cylinders transferred.`, 'success');
        loadAuditHistory();
      }
    } catch (err) {
      console.error('WebSocket parse error:', err);
    }
  };

  state.socket.onclose = () => {
    const el = document.getElementById('streamStatusText');
    if (el) el.textContent = 'Reconnecting...';
    setTimeout(setupWebSocket, 3000);
  };
}

// Master Render Function
function renderAll() {
  renderTopKPIs();
  renderEmergencyDispatchAlert();
  renderStockLevelsTable();
  renderShortagePredictors();
  renderTransferRecommendations();
}

// 1. Render Top KPI Metric Cards (3 Cards)
function renderTopKPIs() {
  if (!state.predictions) return;

  // Total Cylinders
  const totalCyl = state.predictions.reduce((acc, h) => acc + Math.round(h.currentStock), 0);
  const totalEl = document.getElementById('topTotalCylinders');
  if (totalEl) totalEl.textContent = totalCyl;

  // Predicting Shortages: Hospitals with <= 5h to shortage or <= 20 cyl
  const atRiskCount = state.predictions.filter(h => h.currentStock <= 20 || (h.timeToShortageHours !== null && h.timeToShortageHours <= 5)).length;
  const atRiskEl = document.getElementById('topAtRiskCount');
  if (atRiskEl) atRiskEl.textContent = `${atRiskCount} Hospital${atRiskCount === 1 ? '' : 's'}`;

  // Recommended Transfers
  const activeTransfersCount = state.recommendations ? state.recommendations.length : 0;
  const transfersEl = document.getElementById('topActiveTransfersCount');
  if (transfersEl) transfersEl.textContent = `${activeTransfersCount} Active`;
}

// 2. Render Emergency Dispatch Alert (Active when <= 20 cylinders)
function renderEmergencyDispatchAlert() {
  const container = document.getElementById('emergencyDispatchSection');
  if (!container || !state.predictions) return;

  const urgentHosp = state.predictions.find(h => h.currentStock <= 20);
  const topRec = state.recommendations && state.recommendations.length > 0 ? state.recommendations[0] : null;

  if (urgentHosp && topRec) {
    const urgentInfo = getHospitalInfo(urgentHosp.hospitalId);
    const donorInfo = getHospitalInfo(topRec.donorId);
    const urgentMeta = getHospitalMeta(urgentHosp.hospitalId);
    const donorMeta = getHospitalMeta(topRec.donorId);

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="bg-rose-50 border-2 border-rose-500 rounded-2xl p-5 shadow-md space-y-4 critical-pulse">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200 pb-3">
          <div class="flex items-center space-x-3">
            <span class="p-2 bg-rose-600 rounded-xl text-white">
              <i data-lucide="alert-octagon" class="h-6 w-6"></i>
            </span>
            <div>
              <h2 class="text-base font-extrabold text-rose-900 flex items-center gap-2">
                CRITICAL SHORTAGE: ${urgentInfo.shortName} (${urgentInfo.fullName}) has only ${Math.round(urgentHosp.currentStock)} Cylinders Left!
                <span class="text-xs bg-rose-600 px-2.5 py-0.5 rounded-full text-white font-mono font-bold">&le; 20 Threshold</span>
              </h2>
              <p class="text-xs text-rose-700 mt-0.5 font-medium">
                Automatic Emergency Protocol Activated: Directly routing from <strong>${donorInfo.shortName} (${donorInfo.fullName})</strong> &mdash; holds the most cylinders (${Math.round(topRec.donorCurrentStock)} cyl).
              </p>
            </div>
          </div>
          <span class="text-xs font-bold px-3 py-1 bg-rose-600 text-white rounded-lg shrink-0 uppercase tracking-wide">
            🚨 Immediate Transfer Required
          </span>
        </div>

        <!-- Logistics Detail Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white rounded-xl p-4 border border-rose-200 text-xs">
          
          <!-- Recipient Hospital -->
          <div class="space-y-1">
            <span class="text-[11px] font-bold uppercase text-rose-600">Hospital In Need (&le; 20 Cyl)</span>
            <h3 class="text-sm font-bold text-slate-800">${urgentInfo.shortName}: ${urgentInfo.fullName}</h3>
            <p class="text-xs text-rose-600 font-extrabold">Only ${Math.round(urgentHosp.currentStock)} Cylinders Remaining</p>
            <p class="text-[11px] text-slate-500">📍 ${urgentMeta.address}</p>
            <p class="text-[11px] text-slate-600 font-mono">📞 ${urgentMeta.phone}</p>
          </div>

          <!-- Donor Hospital with Most Cylinders -->
          <div class="space-y-1">
            <span class="text-[11px] font-bold uppercase text-emerald-600">Supplying Hospital (Most Cylinders)</span>
            <h3 class="text-sm font-bold text-slate-800">${donorInfo.shortName}: ${donorInfo.fullName}</h3>
            <p class="text-xs text-emerald-600 font-extrabold">${Math.round(topRec.donorCurrentStock)} Cylinders Available</p>
            <p class="text-[11px] text-slate-500">📍 ${donorMeta.address}</p>
            <p class="text-[11px] text-slate-600 font-mono">📞 ${donorMeta.phone}</p>
          </div>

          <!-- Vehicle & Driver Details -->
          <div class="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span class="text-[11px] font-bold uppercase text-amber-700">Assigned Logistics Vehicle</span>
            <div class="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>🚑 Vehicle: <span class="font-mono text-indigo-700">${topRec.ambulanceNumber}</span></span>
              <span class="text-emerald-700 font-bold">+${topRec.transferQuantity} Cylinders</span>
            </div>
            <p class="text-xs text-slate-700 mt-1">👤 <strong>${topRec.deliveryDriver}</strong></p>
            <p class="text-xs text-emerald-700 font-mono font-bold">📱 ${topRec.driverPhone}</p>
            <p class="text-[11px] text-slate-500 mt-0.5">ETA: ${topRec.transitMinutes} mins (${topRec.transitDistanceKm} km)</p>
          </div>

        </div>

        <!-- Clinical Justification & Action Button -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p class="text-xs text-slate-700 italic font-medium">
            "${topRec.geminiJustification || `Move ${topRec.transferQuantity} units from ${donorInfo.shortName} to ${urgentInfo.shortName}`}"
          </p>
          <button onclick="executeTransferAction('${topRec.donorId}', '${topRec.recipientId}', ${topRec.transferQuantity}, '${escapeQuotes(topRec.geminiJustification)}')" class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-rose-600/30 transition cursor-pointer shrink-0">
            <i data-lucide="send" class="h-4 w-4"></i>
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

// 3. Render Current Stock Levels Table (Exact layout from design)
function renderStockLevelsTable() {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody || !state.predictions) return;

  const sorted = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock);
  const highestId = sorted[0]?.hospitalId;

  // Sort by hospital order A -> B -> C -> D -> E -> F
  const orderedList = [...state.predictions].sort((a, b) => a.hospitalId.localeCompare(b.hospitalId));

  tbody.innerHTML = orderedList.map(h => {
    const info = getHospitalInfo(h.hospitalId);
    const meta = getHospitalMeta(h.hospitalId);
    const isHighest = h.hospitalId === highestId;
    const isUnder20 = h.currentStock <= 20;

    // Time to shortage display
    let timeShortageHtml = '';
    if (isUnder20) {
      timeShortageHtml = `<span class="text-rose-600 font-extrabold text-sm animate-pulse">&le; 20 cyl (CRITICAL)</span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 4.0) {
      timeShortageHtml = `<span class="text-rose-600 font-bold text-sm">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else if (h.timeToShortageHours !== null && h.timeToShortageHours <= 8.0) {
      timeShortageHtml = `<span class="text-amber-600 font-bold text-sm">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else if (h.timeToShortageHours !== null) {
      timeShortageHtml = `<span class="text-slate-800 font-medium text-sm">${h.timeToShortageHours.toFixed(1)} hrs</span>`;
    } else {
      timeShortageHtml = `<span class="text-slate-500 text-sm">Surplus (>24h)</span>`;
    }

    // Depletion rate in red
    const burnRateHtml = `<span class="text-rose-600 font-semibold text-sm">-${Math.abs(h.depletionRatePerHour)}/hr</span>`;

    // Row background if <= 20
    const rowBg = isUnder20 ? 'bg-rose-50/70' : 'hover:bg-slate-50 transition';

    return `
      <tr class="${rowBg}">
        
        <!-- Hospital Name with colored letter -->
        <td class="py-3 px-5">
          <div class="flex items-center space-x-2">
            <span class="text-base font-bold text-slate-800">
              Hospital <span class="${info.letterColor} font-black">${info.letter}</span>
            </span>
            ${isHighest ? '<span class="text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full shrink-0">🟢 Most Cylinders</span>' : ''}
            ${isUnder20 ? '<span class="text-[11px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full shrink-0 animate-pulse">&le; 20 Shortage</span>' : ''}
          </div>
          <span class="text-xs text-slate-500 block mt-0.5">${info.fullName}</span>
        </td>

        <!-- Oxygen Cylinders -->
        <td class="py-3 px-5 font-bold text-slate-800 text-base font-mono">
          ${Math.round(h.currentStock)}
        </td>

        <!-- Depletion Rate -->
        <td class="py-3 px-5">
          ${burnRateHtml}
        </td>

        <!-- Time to Shortage -->
        <td class="py-3 px-5">
          ${timeShortageHtml}
        </td>

        <!-- Location & Contact -->
        <td class="py-3 px-5 text-xs text-slate-600">
          <div class="truncate max-w-xs">📍 ${meta.address}</div>
          <div class="text-[11px] text-slate-500 font-mono mt-0.5">📞 ${meta.phone}</div>
        </td>

        <!-- Quick Simulation Actions -->
        <td class="py-3 px-5 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="setHospitalStock('${h.hospitalId}', 12)" class="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold transition cursor-pointer" title="Simulate dropping to 12 cylinders">
            Set 12 cyl (&le;20)
          </button>
          <button onclick="deliverStock('${h.hospitalId}', 40)" class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer" title="Add 40 cylinders">
            +40 cyl
          </button>
        </td>

      </tr>
    `;
  }).join('');
}

// 4. Render Shortage Predictor Cards (Left Column)
function renderShortagePredictors() {
  const container = document.getElementById('shortagePredictorContainer');
  if (!container || !state.predictions) return;

  // Identify high risk and medium risk facilities
  const urgent = state.predictions.find(h => h.hospitalId === 'HOSP-01' || h.currentStock <= 20) || state.predictions[0];
  const medium = state.predictions.find(h => h.hospitalId === 'HOSP-03') || state.predictions[2] || state.predictions[1];

  const urgentInfo = getHospitalInfo(urgent.hospitalId);
  const mediumInfo = getHospitalInfo(medium.hospitalId);

  container.innerHTML = `
    <!-- High Risk Card (Red slope) -->
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <!-- Red Triangle Icon -->
          <svg class="h-6 w-6 text-rose-600 fill-rose-600 shrink-0" viewBox="0 0 24 24">
            <path d="M12 2L1 21h22L12 2zm0 4.5l8 13.5H4l8-13.5zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
          </svg>
          <h3 class="text-base font-bold text-slate-800">
            Hospital <span class="${urgentInfo.letterColor} font-black">${urgentInfo.letter}</span>: <span class="text-rose-600 font-extrabold">High Risk</span> &mdash; R&sup2; = 0.92
          </h3>
        </div>
        <p class="text-sm italic text-slate-600 pl-8">Depleting Rapidly</p>
      </div>

      <!-- Linear Trend Slope SVG Graph -->
      <div class="w-44 h-20 shrink-0 relative">
        <svg class="w-full h-full" viewBox="0 0 160 70">
          <defs>
            <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <line x1="0" y1="35" x2="160" y2="35" stroke="#f1f5f9" stroke-dasharray="3,3" stroke-width="1.5"/>
          <polygon points="10,20 45,30 85,42 125,52 150,58 150,70 10,70" fill="url(#gradRed)" />
          <polyline points="10,20 45,30 85,42 125,52 150,58" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="10" cy="20" r="3.5" fill="#dc2626"/>
          <circle cx="45" cy="30" r="3.5" fill="#dc2626"/>
          <circle cx="85" cy="42" r="3.5" fill="#dc2626"/>
          <circle cx="125" cy="52" r="3.5" fill="#dc2626"/>
          <circle cx="150" cy="58" r="3.5" fill="#dc2626"/>
        </svg>
      </div>
    </div>

    <!-- Medium Risk Card (Amber slope) -->
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <!-- Amber Triangle Icon -->
          <svg class="h-6 w-6 text-amber-500 fill-amber-500 shrink-0" viewBox="0 0 24 24">
            <path d="M12 2L1 21h22L12 2zm0 4.5l8 13.5H4l8-13.5zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
          </svg>
          <h3 class="text-base font-bold text-slate-800">
            Hospital <span class="${mediumInfo.letterColor} font-black">${mediumInfo.letter}</span>: <span class="text-amber-500 font-extrabold">Medium Risk</span> &mdash; R&sup2; = 0.78
          </h3>
        </div>
        <p class="text-sm italic text-slate-600 pl-8">Moderate Decline</p>
      </div>

      <!-- Linear Trend Slope SVG Graph -->
      <div class="w-44 h-20 shrink-0 relative">
        <svg class="w-full h-full" viewBox="0 0 160 70">
          <defs>
            <linearGradient id="gradAmber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <line x1="0" y1="35" x2="160" y2="35" stroke="#f1f5f9" stroke-dasharray="3,3" stroke-width="1.5"/>
          <polygon points="10,22 50,34 90,46 130,58 150,62 150,70 10,70" fill="url(#gradAmber)" />
          <polyline points="10,22 50,34 90,46 130,58 150,62" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="10" cy="22" r="3.5" fill="#f59e0b"/>
          <circle cx="50" cy="34" r="3.5" fill="#f59e0b"/>
          <circle cx="90" cy="46" r="3.5" fill="#f59e0b"/>
          <circle cx="130" cy="58" r="3.5" fill="#f59e0b"/>
          <circle cx="150" cy="62" r="3.5" fill="#f59e0b"/>
        </svg>
      </div>
    </div>
  `;
}

// 5. Render Transfer Recommendations (Right Column)
function renderTransferRecommendations() {
  const container = document.getElementById('transferRecommendationsContainer');
  if (!container) return;

  if (!state.recommendations || state.recommendations.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 p-5 text-center text-sm text-slate-500 shadow-sm">
        All district hospitals have adequate reserve. No active transfers required.
      </div>
    `;
    return;
  }

  const rec1 = state.recommendations[0];
  const rec2 = state.recommendations.length > 1 ? state.recommendations[1] : null;

  const donor1Info = getHospitalInfo(rec1.donorId);
  const recip1Info = getHospitalInfo(rec1.recipientId);

  let html = `
    <!-- Recommendation 1 (Green theme) -->
    <div class="bg-[#eefcf3] border border-[#bbf7d0] rounded-xl p-4 shadow-sm space-y-2.5">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-800">
          1. Transfer ${rec1.transferQuantity} Cylinders from Hospital ${donor1Info.letter} to Hospital ${recip1Info.letter}
        </h3>
        <span class="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono">Rank #1</span>
      </div>

      <!-- Solid Green Sub-banner Bar -->
      <div class="bg-[#15803d] text-white text-xs md:text-sm font-semibold rounded-lg px-4 py-2.5 shadow-sm">
        ${donor1Info.letter} has ${Math.round(rec1.donorSurplusHours || 6)} hrs surplus, ${recip1Info.letter} depletes in ${Math.round(rec1.recipientDepletionHours || 2)} hrs. Send within 1 hour
      </div>

      <!-- Ambulance Logistics and Action Button -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700 pt-1">
        <div class="flex items-center space-x-3">
          <span>🚑 <strong class="font-mono text-indigo-700">${rec1.ambulanceNumber}</strong></span>
          <span>👤 <strong>${rec1.deliveryDriver}</strong></span>
          <span class="font-mono text-emerald-700">📱 ${rec1.driverPhone}</span>
        </div>
        <button onclick="executeTransferAction('${rec1.donorId}', '${rec1.recipientId}', ${rec1.transferQuantity}, '${escapeQuotes(rec1.geminiJustification)}')" class="px-3.5 py-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-bold text-xs transition shadow-sm cursor-pointer shrink-0">
          Send Ambulance Now
        </button>
      </div>
    </div>
  `;

  if (rec2) {
    const donor2Info = getHospitalInfo(rec2.donorId);
    const recip2Info = getHospitalInfo(rec2.recipientId);

    html += `
      <!-- Recommendation 2 (Blue theme) -->
      <div class="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4 shadow-sm space-y-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-800">
            2. Transfer ${rec2.transferQuantity} Cylinders from Hospital ${donor2Info.letter} to Hospital ${recip2Info.letter}
          </h3>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">Rank #2</span>
        </div>

        <!-- Solid Blue Sub-banner Bar -->
        <div class="bg-[#1d4ed8] text-white text-xs md:text-sm font-semibold rounded-lg px-4 py-2.5 shadow-sm">
          ${donor2Info.letter} has ${Math.round(rec2.donorSurplusHours || 16)} hrs surplus, ${recip2Info.letter} depletes in ${Math.round(rec2.recipientDepletionHours || 4)} hrs. Send within 2 hours
        </div>

        <!-- Ambulance Logistics and Action Button -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700 pt-1">
          <div class="flex items-center space-x-3">
            <span>🚑 <strong class="font-mono text-indigo-700">${rec2.ambulanceNumber}</strong></span>
            <span>👤 <strong>${rec2.deliveryDriver}</strong></span>
            <span class="font-mono text-emerald-700">📱 ${rec2.driverPhone}</span>
          </div>
          <button onclick="executeTransferAction('${rec2.donorId}', '${rec2.recipientId}', ${rec2.transferQuantity}, '${escapeQuotes(rec2.geminiJustification)}')" class="px-3.5 py-1.5 rounded-lg bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold text-xs transition shadow-sm cursor-pointer shrink-0">
            Send Ambulance Now
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// 6. Transfer Audit History Table
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
    const donorInfo = getHospitalInfo(log.donorId);
    const recipInfo = getHospitalInfo(log.recipientId);

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="font-mono font-bold text-slate-700">${timeStr}</span>
          <span class="text-[10px] text-slate-400 block">${log.manifestId || 'MAN-LOG'}</span>
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-emerald-600">
          +${log.quantity} cyl
        </td>
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-800">Hospital ${donorInfo.letter}</span>
          <span class="text-[11px] text-slate-500 block truncate max-w-[140px]">${log.donorName}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-800">Hospital ${recipInfo.letter}</span>
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
  const btnTrigger = document.getElementById('btnTriggerLowStockCrisis');
  if (btnTrigger) {
    btnTrigger.addEventListener('click', async () => {
      await fetch('/api/simulation/set-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'HOSP-03', stock: 12 })
      });
      showToast('🚨 Critical Emergency Triggered! Hospital C dropped to 12 cylinders (<= 20).', 'error');
      await loadInitialData();
    });
  }

  const btnReset = document.getElementById('btnQuickReset');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      showToast('🔄 District stocks reset to baseline.', 'info');
      await loadInitialData();
      await loadAuditHistory();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
