// Cross-Hospital Oxygen Rebalance - Clean & Intuitive Operations Controller

let state = {
  hospitals: [],
  predictions: [],
  recommendations: [],
  hospitalWithMostCylinders: null,
  socket: null
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-slate-900 border-teal-500/50 text-teal-300 shadow-teal-500/10',
    success: 'bg-slate-900 border-emerald-500/50 text-emerald-300 shadow-emerald-500/10',
    error: 'bg-slate-900 border-rose-500/50 text-rose-300 shadow-rose-500/10',
    gemini: 'bg-slate-900 border-purple-500/50 text-purple-300 shadow-purple-500/10'
  };

  toast.className = `p-3.5 rounded-xl border shadow-2xl text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto backdrop-blur-md ${bgColors[type] || bgColors.info}`;
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
  renderLeaderboard();
  renderEmergencyDispatchAlert();
  renderHospitalCards();
}

// 1. Render Leaderboard & Stats
function renderLeaderboard() {
  if (!state.predictions || state.predictions.length === 0) return;

  // Find the hospital with the MOST cylinders
  const sorted = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock);
  const highest = sorted[0];

  if (highest) {
    const nameEl = document.getElementById('leaderDonorName');
    const stockEl = document.getElementById('leaderDonorStock');
    const addrEl = document.getElementById('leaderDonorAddress');
    const phoneEl = document.getElementById('leaderDonorPhone');
    const surplusEl = document.getElementById('leaderDonorSurplus');

    if (nameEl) nameEl.textContent = highest.hospitalName;
    if (stockEl) stockEl.textContent = Math.round(highest.currentStock);
    if (surplusEl) surplusEl.textContent = `+${Math.max(15, Math.floor(highest.currentStock * 0.4))} Safe to Donate`;

    // Fetch hospital address from full data
    const hospMeta = getHospitalMeta(highest.hospitalId);
    if (addrEl && hospMeta) addrEl.textContent = hospMeta.address;
    if (phoneEl && hospMeta) phoneEl.textContent = `📞 ${hospMeta.phone}`;
  }

  // Total district stock
  const totalStock = state.predictions.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  const totalEl = document.getElementById('statTotalDistrictStock');
  if (totalEl) totalEl.textContent = `${Math.round(totalStock)} Cylinders`;
}

// 2. Render Emergency Dispatch Alert (Triggered especially when <= 20 cylinders)
function renderEmergencyDispatchAlert() {
  const container = document.getElementById('emergencyDispatchSection');
  if (!container) return;

  // Check if any hospital has <= 20 cylinders
  const emergencyHospitals = state.predictions.filter(p => p.currentStock <= 20);
  const topRec = state.recommendations && state.recommendations.length > 0 ? state.recommendations[0] : null;

  if (emergencyHospitals.length > 0 && topRec) {
    const urgentHosp = emergencyHospitals[0];
    const urgentMeta = getHospitalMeta(urgentHosp.hospitalId);
    const donorMeta = getHospitalMeta(topRec.donorId);

    container.innerHTML = `
      <div class="bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 border-2 border-rose-500 rounded-2xl p-5 shadow-2xl space-y-4 animate-pulse">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-900/60 pb-3">
          <div class="flex items-center space-x-2.5">
            <span class="p-2 bg-rose-600 rounded-xl text-white">
              <i data-lucide="alert-octagon" class="h-6 w-6"></i>
            </span>
            <div>
              <h2 class="text-base font-extrabold text-white flex items-center gap-2">
                CRITICAL SHORTAGE: ${urgentHosp.hospitalName} has only ${Math.round(urgentHosp.currentStock)} Cylinders Left!
                <span class="text-xs bg-rose-600 px-2.5 py-0.5 rounded-full text-white font-mono">&le; 20 Threshold Met</span>
              </h2>
              <p class="text-xs text-rose-300 mt-0.5">
                Automatic Emergency Protocol Activated: Directly contacting <strong>${topRec.donorName}</strong> (Holds the most cylinders: ${Math.round(topRec.donorCurrentStock)} cyl).
              </p>
            </div>
          </div>

          <span class="text-xs font-mono font-bold px-3 py-1 bg-rose-950 text-rose-300 rounded-lg border border-rose-500/40 shrink-0">
            🚨 IMMEDIATE ACTION REQUIRED
          </span>
        </div>

        <!-- Transfer & Logistics Box -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/90 rounded-xl p-4 border border-rose-900/50">
          
          <!-- Recipient in Need -->
          <div class="space-y-1">
            <span class="text-[11px] font-bold uppercase text-rose-400">Hospital In Need (&le; 20 Cyl)</span>
            <h3 class="text-sm font-bold text-white">${urgentHosp.hospitalName}</h3>
            <p class="text-xs text-rose-300 font-bold">Only ${Math.round(urgentHosp.currentStock)} Cylinders Remaining</p>
            <p class="text-[11px] text-slate-400">📍 ${urgentMeta?.address || 'District Facility'}</p>
            <p class="text-[11px] text-slate-400">📞 ${urgentMeta?.phone || 'Emergency Desk'}</p>
          </div>

          <!-- Donor with Most Stock -->
          <div class="space-y-1">
            <span class="text-[11px] font-bold uppercase text-emerald-400">Supplying Hospital (Most Cylinders)</span>
            <h3 class="text-sm font-bold text-white">${topRec.donorName}</h3>
            <p class="text-xs text-emerald-400 font-bold">${Math.round(topRec.donorCurrentStock)} Cylinders in Stock</p>
            <p class="text-[11px] text-slate-400">📍 ${donorMeta?.address || 'District Facility'}</p>
            <p class="text-[11px] text-slate-400">📞 ${donorMeta?.phone || 'Logistics Coordinator'}</p>
          </div>

          <!-- Logistics & Driver -->
          <div class="space-y-1 bg-slate-900 p-3 rounded-lg border border-slate-800">
            <span class="text-[11px] font-bold uppercase text-amber-400">Assigned Logistics Vehicle</span>
            <div class="flex items-center justify-between text-xs font-bold text-white">
              <span>🚑 Vehicle: <span class="font-mono text-amber-300">${topRec.ambulanceNumber}</span></span>
              <span>📦 <span class="text-cyan-400">+${topRec.transferQuantity} Cylinders</span></span>
            </div>
            <p class="text-xs text-slate-200 mt-1">👤 <strong>${topRec.deliveryDriver}</strong></p>
            <p class="text-xs text-emerald-400 font-mono">📱 ${topRec.driverPhone}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">ETA: ${topRec.transitMinutes} mins (${topRec.transitDistanceKm} km)</p>
          </div>

        </div>

        <!-- Gemini AI Justification -->
        <div class="bg-purple-950/40 rounded-xl p-3.5 border border-purple-500/30 text-xs">
          <div class="flex items-center gap-1.5 text-purple-300 font-bold mb-1 text-[11px]">
            <i data-lucide="sparkles" class="h-3.5 w-3.5 text-purple-400"></i>
            <span>Gemini AI Dispatch Justification:</span>
          </div>
          <p class="text-slate-100 italic font-medium">
            "${topRec.geminiJustification || `Move ${topRec.transferQuantity} units from ${topRec.donorName} to ${urgentHosp.hospitalName} — ${topRec.donorName} has ${Math.round(topRec.donorCurrentStock)} cylinders, ${urgentHosp.hospitalName} is in emergency with only ${Math.round(urgentHosp.currentStock)} cylinders left`}"
          </p>
        </div>

        <!-- Dispatch Button -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p class="text-xs text-slate-400">
            After transfer, ${urgentHosp.hospitalName} will have <strong class="text-emerald-400 font-bold">${Math.round(urgentHosp.currentStock + topRec.transferQuantity)} cylinders</strong>.
          </p>
          <button onclick="executeTransferAction('${topRec.donorId}', '${topRec.recipientId}', ${topRec.transferQuantity}, '${escapeQuotes(topRec.geminiJustification)}')" class="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/40 transition active:scale-95 cursor-pointer">
            <i data-lucide="send" class="h-4 w-4"></i>
            Send Ambulance Now (Transfer ${topRec.transferQuantity} Cylinders)
          </button>
        </div>

      </div>
    `;
    lucide.createIcons();
    return;
  }

  // If no hospital is <= 20, but we have recommendations, show clean dispatch box
  if (topRec) {
    const donorMeta = getHospitalMeta(topRec.donorId);
    const recipMeta = getHospitalMeta(topRec.recipientId);

    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div class="flex items-center space-x-2">
            <span class="h-2.5 w-2.5 rounded-full bg-teal-400 animate-pulse"></span>
            <h3 class="text-sm font-bold text-white">Recommended Resource Redistribution</h3>
          </div>
          <span class="text-xs text-slate-400">All facilities currently above 20 cylinders</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
          <div>
            <span class="text-[10px] text-emerald-400 font-bold uppercase block">Source (More Cylinders)</span>
            <strong class="text-white text-sm block">${topRec.donorName}</strong>
            <span class="text-emerald-400 font-bold block">${Math.round(topRec.donorCurrentStock)} Cylinders</span>
            <span class="text-slate-400 text-[11px] block mt-0.5">📞 ${donorMeta?.phone || ''}</span>
          </div>
          <div>
            <span class="text-[10px] text-amber-400 font-bold uppercase block">Destination (Needs Stock)</span>
            <strong class="text-white text-sm block">${topRec.recipientName}</strong>
            <span class="text-amber-400 font-bold block">${Math.round(topRec.recipientCurrentStock)} Cylinders Remaining</span>
            <span class="text-slate-400 text-[11px] block mt-0.5">📞 ${recipMeta?.phone || ''}</span>
          </div>
          <div class="bg-slate-900 p-2.5 rounded border border-slate-800">
            <span class="text-[10px] text-amber-300 font-bold uppercase block">Vehicle & Driver</span>
            <span class="font-mono text-white block">🚑 ${topRec.ambulanceNumber} &bull; <strong class="text-cyan-400">+${topRec.transferQuantity} cyl</strong></span>
            <span class="text-slate-200 block mt-0.5">👤 ${topRec.deliveryDriver}</span>
            <span class="text-emerald-400 font-mono block">📱 ${topRec.driverPhone}</span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <p class="text-xs text-slate-400 italic">
            "${topRec.geminiJustification}"
          </p>
          <button onclick="executeTransferAction('${topRec.donorId}', '${topRec.recipientId}', ${topRec.transferQuantity}, '${escapeQuotes(topRec.geminiJustification)}')" class="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
            <i data-lucide="check" class="h-3.5 w-3.5"></i> Dispatch Transfer
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // All balanced
  container.innerHTML = `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
      <i data-lucide="check-circle-2" class="h-4 w-4 text-emerald-400"></i>
      <span>District in Safe Balance &mdash; all hospitals have adequate oxygen reserve (&gt;20 cylinders).</span>
    </div>
  `;
  lucide.createIcons();
}

// 3. Render 6 Hospital Cards Grid
function renderHospitalCards() {
  const container = document.getElementById('hospitalsGrid');
  if (!container || !state.predictions) return;

  const sorted = [...state.predictions].sort((a, b) => b.currentStock - a.currentStock);
  const highestId = sorted[0]?.hospitalId;

  const html = state.predictions.map(h => {
    const isUnder20 = h.currentStock <= 20;
    const isHighest = h.hospitalId === highestId;
    const pct = Math.round((h.currentStock / h.capacity) * 100);
    const meta = getHospitalMeta(h.hospitalId);

    // Card styling
    let cardBorder = 'border-slate-800 bg-slate-900/90';
    let badgeHtml = '';

    if (isUnder20) {
      cardBorder = 'border-2 border-rose-500 bg-rose-950/20 critical-pulse';
      badgeHtml = `<span class="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-black uppercase tracking-wider animate-pulse">⚠️ &le; 20 CRITICAL</span>`;
    } else if (isHighest) {
      cardBorder = 'border-emerald-500/40 bg-emerald-950/10';
      badgeHtml = `<span class="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">🟢 MOST CYLINDERS</span>`;
    } else {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold">STABLE</span>`;
    }

    // Bar color
    let barColor = 'bg-emerald-500';
    if (h.currentStock <= 20) barColor = 'bg-rose-500';
    else if (pct < 35) barColor = 'bg-amber-500';

    return `
      <div class="rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:border-slate-700 flex flex-col justify-between ${cardBorder}">
        
        <div>
          <!-- Top Row: Name and Status Badge -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-extrabold text-white">${h.hospitalName}</h3>
              <p class="text-[11px] text-slate-400 mt-0.5">${h.hospitalType}</p>
            </div>
            ${badgeHtml}
          </div>

          <!-- Cylinders Left Highlight (BIG & CLEAR) -->
          <div class="mt-3 bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Cylinders Left</span>
              <div class="flex items-baseline space-x-1">
                <span class="text-2xl font-black font-mono ${isUnder20 ? 'text-rose-400' : 'text-white'}">${Math.round(h.currentStock)}</span>
                <span class="text-xs text-slate-400">/ ${h.capacity} cyl</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-slate-300 block">${pct}%</span>
              <span class="text-[10px] text-amber-400 font-mono block mt-0.5">-${h.depletionRatePerHour} cyl/hr</span>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-500" style="width: ${pct}%"></div>
          </div>

          <!-- Address & Contact -->
          <div class="mt-3 space-y-1 text-xs text-slate-300">
            <p class="text-[11px] text-slate-400 flex items-start gap-1.5">
              <span class="text-slate-500 shrink-0">📍</span>
              <span class="truncate">${meta?.address || 'District 04'}</span>
            </p>
            <p class="text-[11px] text-slate-300 flex items-center gap-1.5 font-mono">
              <span class="text-slate-500">📞</span>
              <span>${meta?.phone || '+1 (555) 000-0000'}</span>
            </p>
          </div>
        </div>

        <!-- Quick Controls -->
        <div class="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <button onclick="setHospitalStock('${h.hospitalId}', 12)" class="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition cursor-pointer" title="Simulate dropping this hospital to 12 cylinders">
            Set to 12 Cyl (&le;20)
          </button>
          <button onclick="deliverStock('${h.hospitalId}', 40)" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition cursor-pointer" title="Add 40 cylinders to this hospital">
            +40 Cylinders
          </button>
        </div>

      </div>
    `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

// 4. Render Transfer History
async function loadAuditHistory() {
  try {
    const res = await fetch('/api/transfers/history');
    const logs = await res.json();
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-500">No transfers executed yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-800/40 transition border-b border-slate-800/40 text-[11px]">
        <td class="py-2.5 px-3">
          <span class="font-bold font-mono text-teal-400 block">${l.manifestId || 'MAN-SYNC'}</span>
          <span class="text-slate-500 text-[10px] block">${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="font-bold font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
            +${l.quantity} cyl
          </span>
        </td>
        <td class="py-2.5 px-3">
          <strong class="text-white block">${l.donorName}</strong>
          <span class="text-slate-400 text-[10px] block truncate max-w-xs">${l.donorAddress || ''}</span>
          <span class="text-slate-500 text-[10px] block">📞 ${l.donorContact || ''}</span>
        </td>
        <td class="py-2.5 px-3">
          <strong class="text-white block">${l.recipientName}</strong>
          <span class="text-slate-400 text-[10px] block truncate max-w-xs">${l.recipientAddress || ''}</span>
          <span class="text-slate-500 text-[10px] block">📞 ${l.recipientContact || ''}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="font-mono font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30 text-[10px]">
            🚑 ${l.ambulanceNumber || 'MED-AMB-408'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <strong class="text-slate-200 block">👤 ${l.deliveryDriver || 'Officer Rajesh Kumar'}</strong>
          <span class="text-emerald-400 font-mono text-[10px] block">📱 ${l.driverPhone || '+1 (555) 839-2041'}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="italic text-slate-300 block max-w-xs truncate" title="${l.geminiJustification || ''}">
            "${l.geminiJustification || ''}"
          </span>
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
            ${l.status || 'DELIVERED'}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// Hospital Metadata Helper (Addresses & Contacts)
const HOSPITAL_METAS = {
  'HOSP-01': { address: '740 Metro Parkway, Downtown Medical Corridor, District 04', phone: '+1 (555) 012-4921' },
  'HOSP-02': { address: '350 Northwood Blvd, Northside Medical Park, District 04', phone: '+1 (555) 018-7740' },
  'HOSP-03': { address: '112 Riverbank Way, River Basin Waterfront, District 04', phone: '+1 (555) 014-3882' },
  'HOSP-04': { address: '880 East Valley Road, Suburban Healthcare Complex, District 04', phone: '+1 (555) 019-9214' },
  'HOSP-05': { address: '215 Westside Plaza, Westside Urban Corridor, District 04', phone: '+1 (555) 016-5531' },
  'HOSP-06': { address: '500 Highland Ridge Road, Highland Surgical Park, District 04', phone: '+1 (555) 017-8109' }
};

function getHospitalMeta(id) {
  return HOSPITAL_METAS[id] || { address: 'District 04', phone: '+1 (555) 000-0000' };
}

// User Actions
window.executeTransferAction = async function(donorId, recipientId, quantity, justification) {
  try {
    const res = await fetch('/api/transfers/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donorId,
        recipientId,
        quantity,
        geminiJustification: justification
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Transfer of ${quantity} cylinders executed! Stock replenished.`, 'success');
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
  // 1-Click Crisis Simulation: Drops Riverbank (HOSP-03) to 12 cylinders
  const btnTrigger = document.getElementById('btnTriggerLowStockCrisis');
  if (btnTrigger) {
    btnTrigger.addEventListener('click', async () => {
      await fetch('/api/simulation/set-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'HOSP-03', stock: 12 })
      });
      showToast('🚨 Critical Emergency Triggered! Riverbank Emergency Annex dropped to 12 cylinders (<= 20).', 'error');
      await loadInitialData();
    });
  }

  // 1-Click Reset
  const btnReset = document.getElementById('btnQuickReset');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      showToast('🔄 District stocks reset to normal baseline.', 'info');
      await loadInitialData();
      await loadAuditHistory();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
