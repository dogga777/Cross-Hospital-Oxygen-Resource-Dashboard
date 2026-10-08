// Main Dashboard Application Controller

let state = {
  hospitals: [],
  predictions: [],
  recommendations: [],
  validation: null,
  isPaused: false,
  selectedHospitalIdForValidation: 'HOSP-01',
  socket: null,
  recentTelemetry: []
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-slate-900 border-teal-500/50 text-teal-300',
    success: 'bg-slate-900 border-emerald-500/50 text-emerald-300',
    error: 'bg-slate-900 border-rose-500/50 text-rose-300',
    gemini: 'bg-slate-900 border-purple-500/50 text-purple-300'
  };

  toast.className = `p-3 rounded-xl border shadow-xl text-xs font-medium flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format hours nicely
function formatHours(hours) {
  if (hours === undefined || hours === null) return '--';
  if (hours <= 0) return 'DEPLETED';
  if (hours > 72) return '>72 hrs';
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins > 0 ? mins + 'm' : ''}`;
}

// Initialize Application
async function init() {
  window.Charts.initHeldOutChart();
  window.Charts.initDistrictTrendChart();

  setupEventListeners();
  await fetchSystemStatus();
  await loadInitialData();
  setupWebSocket();
}

// Fetch Initial Data via REST
async function loadInitialData() {
  try {
    const [recRes, valRes, telRes] = await Promise.all([
      fetch('/api/recommendations'),
      fetch('/api/validation'),
      fetch('/api/telemetry/recent?limit=40')
    ]);

    const recData = await recRes.json();
    const valData = await valRes.json();
    const telData = await telRes.json();

    state.recommendations = recData.recommendations || [];
    state.predictions = recData.predictions || [];
    state.validation = valData;
    state.recentTelemetry = telData;

    renderKPIs();
    renderHospitalFleet();
    renderRecommendations();
    renderValidationTab();
    populateHospitalSelects();

    if (window.Charts) {
      window.Charts.updateDistrictTrendChart(state.recentTelemetry, state.hospitals);
    }
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// Fetch System Status
async function fetchSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // MongoDB status pill
    const mongoStatusText = document.getElementById('mongoStatusText');
    if (mongoStatusText) {
      if (data.database.isRealMongo) {
        mongoStatusText.textContent = 'MongoDB Atlas';
        mongoStatusText.parentElement.classList.add('border-emerald-500/40', 'text-emerald-300');
      } else {
        mongoStatusText.textContent = 'MongoDB (Memory)';
      }
    }

    // Gemini status pill
    const geminiStatusText = document.getElementById('geminiStatusText');
    if (geminiStatusText) {
      geminiStatusText.textContent = data.gemini.configured ? 'Gemini 3.8 Flash' : 'Gemini (Heuristic)';
    }
  } catch (err) {
    console.warn('Status check failed:', err);
  }
}

// WebSocket Live Stream Connection
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.socket = new WebSocket(wsUrl);

  state.socket.onopen = () => {
    console.log('Connected to real-time telemetry WebSocket');
    const streamStatusText = document.getElementById('streamStatusText');
    if (streamStatusText) streamStatusText.textContent = 'Live Feed (Active)';
  };

  state.socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSocketMessage(data);
    } catch (err) {
      console.error('WebSocket parse error:', err);
    }
  };

  state.socket.onclose = () => {
    console.warn('WebSocket closed. Reconnecting in 3s...');
    const streamStatusText = document.getElementById('streamStatusText');
    if (streamStatusText) streamStatusText.textContent = 'Reconnecting...';
    setTimeout(setupWebSocket, 3000);
  };
}

function handleSocketMessage(data) {
  if (data.type === 'TICK') {
    if (data.hospitals) {
      state.hospitals = data.hospitals;
    }
    if (data.rebalancePlan) {
      state.recommendations = data.rebalancePlan.recommendations || [];
      state.predictions = data.rebalancePlan.predictions || [];
    }

    renderKPIs();
    renderHospitalFleet();
    renderRecommendations();
  } else if (data.type === 'VALIDATION_UPDATE') {
    state.validation = data.validation;
    renderKPIs();
    renderValidationTab();
  } else if (data.type === 'TRANSFER_EXECUTED') {
    showToast(`✓ Rebalance transfer of ${data.transfer.quantity} cylinders completed!`, 'success');
    loadAuditHistory();
  }
}

// Render Top Operational KPIs
function renderKPIs() {
  if (!state.predictions || state.predictions.length === 0) return;

  // 1. Total District Stock & Burn Rate
  const totalStock = state.predictions.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  const netBurnRate = state.predictions.reduce((sum, p) => sum + (p.depletionRatePerHour || 0), 0);
  const totalCapacity = state.predictions.reduce((sum, p) => sum + (p.capacity || 0), 0);

  document.getElementById('kpiTotalStock').textContent = Math.round(totalStock);
  document.getElementById('kpiNetBurnRate').textContent = `-${netBurnRate.toFixed(1)} cyl/hr`;

  const stockBar = document.getElementById('kpiTotalStockBar');
  if (stockBar && totalCapacity > 0) {
    stockBar.style.width = `${Math.min(100, Math.round((totalStock / totalCapacity) * 100))}%`;
  }

  // 2. Critical Hospitals (< 3.5h)
  const criticals = state.predictions.filter(p => p.timeToShortageHours <= 3.5);
  document.getElementById('kpiCriticalCount').textContent = criticals.length;

  const minRunway = Math.min(...state.predictions.map(p => p.timeToShortageHours));
  document.getElementById('kpiShortestRunway').textContent = `${minRunway.toFixed(1)} hrs`;

  // 3. Available Surplus Units
  const surplusUnits = state.predictions.reduce((sum, p) => sum + (p.transferableUnits || 0), 0);
  document.getElementById('kpiSurplusUnits').textContent = surplusUnits;

  // 4. Held-Out Validation Accuracy
  if (state.validation && state.validation.overallConfidenceScore) {
    document.getElementById('kpiValidationScore').textContent = state.validation.overallConfidenceScore;
    document.getElementById('kpiMapeScore').textContent = `${state.validation.districtAverageMape}%`;
  }
}

// Render 6 Hospital Cards Fleet
function renderHospitalFleet() {
  const container = document.getElementById('hospitalFleetGrid');
  if (!container || !state.predictions) return;

  const html = state.predictions.map(p => {
    const stockPct = Math.round((p.currentStock / p.capacity) * 100);

    let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    let statusText = 'STABLE';
    let cardPulse = '';

    if (p.urgencyLevel === 'CRITICAL' || p.timeToShortageHours <= 2.0) {
      badgeClass = 'bg-rose-950/80 text-rose-300 border-rose-500/50';
      statusText = 'CRITICAL DEFICIT';
      cardPulse = 'critical-pulse border-rose-500/60';
    } else if (p.urgencyLevel === 'WARNING' || p.timeToShortageHours <= 3.5) {
      badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-500/40';
      statusText = 'SHORTAGE RISK';
    } else if (p.urgencyLevel === 'SURPLUS') {
      badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
      statusText = 'SURPLUS DONOR';
    }

    // Bar color
    let barColor = 'bg-emerald-500';
    if (stockPct < 25) barColor = 'bg-rose-500';
    else if (stockPct < 45) barColor = 'bg-amber-500';

    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 transition-all duration-300 hover:border-slate-700 ${cardPulse}">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-sm font-bold text-white">${p.hospitalName}</h3>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeClass}">${statusText}</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">${p.hospitalType}</p>
          </div>

          <!-- Time to shortage badge -->
          <div class="text-right">
            <span class="text-[11px] uppercase tracking-wider text-slate-400 block">Shortage In</span>
            <span class="text-sm font-bold font-mono ${p.timeToShortageHours <= 3.5 ? 'text-rose-400' : 'text-emerald-400'}">
              ${p.timeToShortageHours <= 0 ? 'CRITICAL NOW' : formatHours(p.timeToShortageHours)}
            </span>
          </div>
        </div>

        <!-- Stock level bar -->
        <div class="mt-3 space-y-1.5">
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">Current Stock: <strong class="text-white font-mono">${Math.round(p.currentStock)}</strong> / ${p.capacity} cyl</span>
            <span class="font-mono text-slate-300">${stockPct}%</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-500" style="width: ${stockPct}%"></div>
          </div>
        </div>

        <!-- Metrics Row & Fast Actions -->
        <div class="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div class="flex items-center space-x-4">
            <div>
              <span class="text-slate-500 text-[11px] block">Burn Rate:</span>
              <span class="font-mono text-amber-400 font-medium">-${p.depletionRatePerHour} cyl/h</span>
            </div>
            <div>
              <span class="text-slate-500 text-[11px] block">Model Fit:</span>
              <span class="font-mono text-indigo-300 font-medium">R² ${p.modelRSquared}%</span>
            </div>
            <div>
              <span class="text-slate-500 text-[11px] block">Transferable:</span>
              <span class="font-mono text-emerald-400 font-medium">${p.transferableUnits} cyl</span>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center space-x-1.5">
            <button onclick="injectSurgeOnHospital('${p.hospitalId}')" class="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 rounded text-rose-300 text-[11px] font-medium transition" title="Trigger Emergency Intake Surge">
              Surge +
            </button>
            <button onclick="injectDeliveryOnHospital('${p.hospitalId}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 text-[11px] font-medium transition" title="Deliver +40 Supply">
              +40 Stock
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

// Render Ranked Rebalance Recommendations & Gemini Justifications
function renderRecommendations() {
  const container = document.getElementById('recommendationsList');
  const countLabel = document.getElementById('recCountLabel');
  const statusBadge = document.getElementById('rebalanceStatusBadge');

  if (!container) return;

  const recs = state.recommendations || [];
  if (countLabel) countLabel.textContent = `${recs.length} Actionable Plan${recs.length === 1 ? '' : 's'}`;

  if (recs.length === 0) {
    if (statusBadge) {
      statusBadge.textContent = 'Balanced';
      statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30';
    }
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 space-y-2">
        <i data-lucide="check-circle-2" class="h-8 w-8 mx-auto text-emerald-400"></i>
        <h4 class="text-sm font-semibold text-slate-200">District in Resource Equilibrium</h4>
        <p class="text-xs text-slate-500">All monitored facilities have sufficient oxygen runway (>3.5 hours). No urgent transfers currently required.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  if (statusBadge) {
    statusBadge.textContent = `${recs.length} Rebalances Required`;
    statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 animate-pulse';
  }

  const html = recs.map(rec => {
    const isCritical = rec.urgency === 'CRITICAL';
    const urgencyBadge = isCritical
      ? 'bg-rose-950 text-rose-300 border-rose-500/50'
      : 'bg-amber-950 text-amber-300 border-amber-500/40';

    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 transition hover:border-slate-700">
        <!-- Header & Urgency -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-teal-400">
              Rank #${rec.rank}
            </span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${urgencyBadge}">
              ${rec.urgency} DISPATCH
            </span>
          </div>
          <span class="text-xs text-slate-400 font-mono flex items-center gap-1">
            <i data-lucide="clock" class="h-3.5 w-3.5 text-amber-400"></i>
            ${rec.byWhen}
          </span>
        </div>

        <!-- Transfer Route Matrix -->
        <div class="bg-slate-900/90 rounded-lg p-3 border border-slate-800 flex items-center justify-between">
          <!-- Donor -->
          <div class="space-y-0.5">
            <span class="text-[10px] uppercase font-semibold text-emerald-400 flex items-center gap-1">
              <i data-lucide="arrow-up-right" class="h-3 w-3"></i> Donor (Surplus)
            </span>
            <h4 class="text-xs font-bold text-white">${rec.donorName}</h4>
            <span class="text-[11px] text-slate-400 font-mono">${Math.round(rec.donorCurrentStock)} cyl &bull; ${rec.donorSurplusHours}h surplus</span>
          </div>

          <!-- Transfer Arrow & Quantity -->
          <div class="text-center px-3">
            <span class="text-xs font-bold font-mono text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-500/40 block">
              +${rec.transferQuantity} Units
            </span>
            <span class="text-[10px] text-slate-500 mt-1 block">${rec.transitDistanceKm} km &bull; ${rec.transitMinutes}m transit</span>
          </div>

          <!-- Recipient -->
          <div class="text-right space-y-0.5">
            <span class="text-[10px] uppercase font-semibold text-rose-400 flex items-center justify-end gap-1">
              Recipient (Deficit) <i data-lucide="arrow-down-left" class="h-3 w-3"></i>
            </span>
            <h4 class="text-xs font-bold text-white">${rec.recipientName}</h4>
            <span class="text-[11px] text-slate-400 font-mono">${Math.round(rec.recipientCurrentStock)} cyl &bull; ${rec.recipientDepletionHours}h to empty</span>
          </div>
        </div>

        <!-- Gemini-Generated One-Line Justification Box -->
        <div class="rounded-xl p-3 bg-gradient-to-r from-indigo-950/50 via-purple-950/50 to-slate-900/50 border border-purple-500/40 gemini-box">
          <div class="flex items-center justify-between text-[11px] font-semibold text-purple-300 mb-1">
            <span class="flex items-center gap-1.5">
              <i data-lucide="sparkles" class="h-3.5 w-3.5 text-purple-400"></i>
              Gemini One-Line Justification
            </span>
            <span class="text-[10px] font-mono text-purple-400 bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-500/30">
              ${rec.aiMetadata?.poweredByGemini ? 'Gemini 3.8 Flash' : 'Clinical Heuristic'}
            </span>
          </div>
          <p class="text-xs text-slate-100 font-medium italic leading-relaxed">
            "${rec.geminiJustification}"
          </p>
        </div>

        <!-- Execute Action -->
        <div class="flex items-center justify-between pt-1 text-xs">
          <span class="text-slate-400 text-[11px]">
            Post-transfer runway: <strong class="text-emerald-400 font-mono">${rec.recipientNewRunwayHours}h</strong> (Donor retains ${rec.donorRemainingSurplusHours}h)
          </span>
          <button onclick="executeTransferAction('${rec.donorId}', '${rec.recipientId}', ${rec.transferQuantity}, '${escapeQuotes(rec.geminiJustification)}')" class="px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-md shadow-teal-500/20">
            <i data-lucide="check" class="h-3.5 w-3.5"></i>
            Execute Transfer
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Render Held-Out Validation Tab
function renderValidationTab() {
  if (!state.validation) return;

  const { districtAverageMape, districtAverageRmse, overallConfidenceScore } = state.validation;

  document.getElementById('valDistrictMape').textContent = `${districtAverageMape}%`;
  document.getElementById('valDistrictRmse').textContent = `${districtAverageRmse} units`;

  const confRatingEl = document.getElementById('valConfidenceRating');
  if (confRatingEl) {
    confRatingEl.textContent = districtAverageMape < 5 ? 'HIGH CONFIDENCE' : 'MODERATE CONFIDENCE';
    confRatingEl.className = `text-xl font-bold ${districtAverageMape < 5 ? 'text-emerald-400' : 'text-amber-400'} mt-0.5`;
  }

  // Update chart for selected hospital
  const selectedHospVal = state.validation.hospitals?.find(h => h.hospitalId === state.selectedHospitalIdForValidation);
  if (selectedHospVal && selectedHospVal.heldOutSeries) {
    window.Charts.updateHeldOutChart(selectedHospVal.heldOutSeries);
  }
}

// Populate Hospital Select Options
function populateHospitalSelects() {
  const valSelect = document.getElementById('valHospitalSelect');
  const surgeSelect = document.getElementById('surgeHospitalSelect');
  if (!valSelect || !state.predictions) return;

  valSelect.innerHTML = state.predictions.map(p =>
    `<option value="${p.hospitalId}" ${p.hospitalId === state.selectedHospitalIdForValidation ? 'selected' : ''}>${p.hospitalName}</option>`
  ).join('');

  if (surgeSelect) {
    surgeSelect.innerHTML = state.predictions.map(p =>
      `<option value="${p.hospitalId}">${p.hospitalName} (${Math.round(p.currentStock)} cyl)</option>`
    ).join('');
  }
}

// Quick Actions
window.injectSurgeOnHospital = async function(hospitalId) {
  try {
    const res = await fetch('/api/simulation/surge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, multiplier: 2.8 })
    });
    const data = await res.json();
    showToast(`⚠️ Mass casualty intake surge injected for ${hospitalId}!`, 'error');
  } catch (err) {
    showToast('Failed to trigger surge', 'error');
  }
};

window.injectDeliveryOnHospital = async function(hospitalId) {
  try {
    await fetch('/api/simulation/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, quantity: 40 })
    });
    showToast(`📦 Emergency replenishment of +40 cylinders delivered to ${hospitalId}!`, 'success');
  } catch (err) {
    showToast('Failed to deliver stock', 'error');
  }
};

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
      showToast(`✓ Rebalance transfer of ${quantity} cylinders executed!`, 'success');
    } else {
      showToast(data.error || 'Transfer failed', 'error');
    }
  } catch (err) {
    showToast('Transfer execution failed: ' + err.message, 'error');
  }
};

// Event Listeners Setup
function setupEventListeners() {
  // Pause / Resume
  const btnPauseResume = document.getElementById('btnPauseResume');
  if (btnPauseResume) {
    btnPauseResume.addEventListener('click', async () => {
      state.isPaused = !state.isPaused;
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: state.isPaused ? 'pause' : 'start' })
      });
      btnPauseResume.innerHTML = state.isPaused
        ? '<i data-lucide="play" class="h-4 w-4 text-emerald-400"></i>'
        : '<i data-lucide="pause" class="h-4 w-4"></i>';
      lucide.createIcons();
      showToast(state.isPaused ? 'Simulation paused' : 'Simulation resumed', 'info');
    });
  }

  // Surge Modal
  const btnSurgeModal = document.getElementById('btnSurgeModal');
  const surgeModal = document.getElementById('surgeModal');
  const btnCloseSurgeModal = document.getElementById('btnCloseSurgeModal');
  const btnCancelSurge = document.getElementById('btnCancelSurge');
  const btnExecuteSurge = document.getElementById('btnExecuteSurge');

  if (btnSurgeModal && surgeModal) {
    btnSurgeModal.addEventListener('click', () => surgeModal.classList.remove('hidden'));
    btnCloseSurgeModal.addEventListener('click', () => surgeModal.classList.add('hidden'));
    btnCancelSurge.addEventListener('click', () => surgeModal.classList.add('hidden'));
    btnExecuteSurge.addEventListener('click', async () => {
      const hospId = document.getElementById('surgeHospitalSelect').value;
      const mult = parseFloat(document.getElementById('surgeMultiplierSelect').value);
      await fetch('/api/simulation/surge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: hospId, multiplier: mult })
      });
      surgeModal.classList.add('hidden');
      showToast(`🔥 Influx surge triggered (${mult}x burn rate)!`, 'error');
    });
  }

  // Settings Modal
  const btnSettings = document.getElementById('btnSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnResetSimulation = document.getElementById('btnResetSimulation');

  if (btnSettings && settingsModal) {
    btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    btnCloseSettingsModal.addEventListener('click', () => settingsModal.classList.add('hidden'));

    btnSaveSettings.addEventListener('click', async () => {
      const geminiKey = document.getElementById('inputGeminiApiKey').value;
      const mongoUri = document.getElementById('inputMongoUri').value;

      await fetch('/api/config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: geminiKey, mongoUri })
      });

      settingsModal.classList.add('hidden');
      showToast('Settings saved successfully', 'success');
      await fetchSystemStatus();
    });

    btnResetSimulation.addEventListener('click', async () => {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      settingsModal.classList.add('hidden');
      showToast('All hospital stocks reset to baseline', 'info');
    });

    // Speed buttons
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ms = btn.getAttribute('data-speed');
        await fetch('/api/simulation/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalMs: ms })
        });
        document.querySelectorAll('.btn-speed').forEach(b => {
          b.className = 'btn-speed py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:border-teal-500 font-mono';
        });
        btn.className = 'btn-speed py-1.5 rounded-lg bg-teal-600 text-white font-mono';
        showToast(`Simulation interval set to ${ms}ms`, 'info');
      });
    });
  }

  // Held-Out Hospital Dropdown Change
  const valSelect = document.getElementById('valHospitalSelect');
  if (valSelect) {
    valSelect.addEventListener('change', (e) => {
      state.selectedHospitalIdForValidation = e.target.value;
      renderValidationTab();
    });
  }

  // Tabs Switching
  const tabBtnHeldOut = document.getElementById('tabBtnHeldOut');
  const tabBtnTrends = document.getElementById('tabBtnTrends');
  const tabBtnAudit = document.getElementById('tabBtnAudit');

  const tabContentHeldOut = document.getElementById('tabContentHeldOut');
  const tabContentTrends = document.getElementById('tabContentTrends');
  const tabContentAudit = document.getElementById('tabContentAudit');

  function setTab(activeTab) {
    [tabBtnHeldOut, tabBtnTrends, tabBtnAudit].forEach(btn => {
      btn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    });
    [tabContentHeldOut, tabContentTrends, tabContentAudit].forEach(content => {
      content.classList.add('hidden');
    });

    if (activeTab === 'heldOut') {
      tabBtnHeldOut.className = 'px-3 py-1.5 rounded-lg bg-teal-500 text-white font-medium transition';
      tabContentHeldOut.classList.remove('hidden');
      renderValidationTab();
    } else if (activeTab === 'trends') {
      tabBtnTrends.className = 'px-3 py-1.5 rounded-lg bg-teal-500 text-white font-medium transition';
      tabContentTrends.classList.remove('hidden');
      loadTrendsHistory();
    } else if (activeTab === 'audit') {
      tabBtnAudit.className = 'px-3 py-1.5 rounded-lg bg-teal-500 text-white font-medium transition';
      tabContentAudit.classList.remove('hidden');
      loadAuditHistory();
    }
  }

  if (tabBtnHeldOut) tabBtnHeldOut.addEventListener('click', () => setTab('heldOut'));
  if (tabBtnTrends) tabBtnTrends.addEventListener('click', () => setTab('trends'));
  if (tabBtnAudit) tabBtnAudit.addEventListener('click', () => setTab('audit'));
}

async function loadTrendsHistory() {
  try {
    const res = await fetch('/api/telemetry/recent?limit=50');
    const data = await res.json();
    state.recentTelemetry = data;
    if (window.Charts) {
      window.Charts.updateDistrictTrendChart(data, state.hospitals);
    }
  } catch (err) {
    console.error('Failed to load trends history:', err);
  }
}

async function loadAuditHistory() {
  try {
    const res = await fetch('/api/transfers/history');
    const logs = await res.json();
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-500 font-sans">No transfer executions recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3 text-slate-400">${new Date(l.timestamp).toLocaleTimeString()}</td>
        <td class="py-2.5 px-3 text-emerald-400 font-semibold">${l.donorName}</td>
        <td class="py-2.5 px-3 text-rose-400 font-semibold">${l.recipientName}</td>
        <td class="py-2.5 px-3 text-cyan-300 font-bold">+${l.quantity} cyl</td>
        <td class="py-2.5 px-3 text-slate-300 italic max-w-xs truncate">${l.geminiJustification || 'Manual Dispatch'}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">${l.status}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load audit history:', err);
  }
}

// Start application when DOM loaded
document.addEventListener('DOMContentLoaded', init);
