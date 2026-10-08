// Main Dashboard Application Controller - Clean & Intuitive Operations UI

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
    info: 'bg-slate-900/95 border-teal-500/50 text-teal-300 shadow-teal-500/10',
    success: 'bg-slate-900/95 border-emerald-500/50 text-emerald-300 shadow-emerald-500/10',
    error: 'bg-slate-900/95 border-rose-500/50 text-rose-300 shadow-rose-500/10',
    gemini: 'bg-slate-900/95 border-purple-500/50 text-purple-300 shadow-purple-500/10'
  };

  toast.className = `p-3.5 rounded-xl border shadow-2xl text-xs font-medium flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto backdrop-blur-md ${bgColors[type] || bgColors.info}`;
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

// Format hours nicely into human-readable text
function formatHours(hours) {
  if (hours === undefined || hours === null) return '--';
  if (hours <= 0) return 'EMPTY NOW';
  if (hours > 72) return '>72 hours';
  const hrs = Math.floor(hours);
  const mins = Math.round((hours - hrs) * 60);
  if (hrs === 0) return `${mins} mins`;
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
        mongoStatusText.textContent = 'MongoDB Store';
      }
    }

    // Gemini status pill
    const geminiStatusText = document.getElementById('geminiStatusText');
    if (geminiStatusText) {
      geminiStatusText.textContent = data.gemini.configured ? 'Gemini 3.8 Flash' : 'Gemini AI Ready';
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
    if (streamStatusText) streamStatusText.textContent = 'Live Feed (3s)';
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

  // Banner status text
  const bannerText = document.getElementById('districtBannerText');
  if (bannerText) {
    if (criticals.length > 0) {
      bannerText.textContent = `${criticals.length} Facilities Need Immediate Stock (${minRunway.toFixed(1)}h runway)`;
      bannerText.previousElementSibling.className = 'h-2 w-2 rounded-full bg-rose-400 animate-pulse';
    } else {
      bannerText.textContent = 'All 6 Facilities in Resource Equilibrium';
      bannerText.previousElementSibling.className = 'h-2 w-2 rounded-full bg-emerald-400';
    }
  }
}

// Render 6 Hospital Cards Fleet (Clean & Easy to Read)
function renderHospitalFleet() {
  const container = document.getElementById('hospitalFleetGrid');
  if (!container || !state.predictions) return;

  const html = state.predictions.map(p => {
    const stockPct = Math.round((p.currentStock / p.capacity) * 100);

    let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    let statusText = 'STABLE';
    let cardPulse = '';

    if (p.urgencyLevel === 'CRITICAL' || p.timeToShortageHours <= 2.0) {
      badgeClass = 'bg-rose-950 text-rose-300 border-rose-500/60 font-bold';
      statusText = 'CRITICAL DEFICIT';
      cardPulse = 'critical-pulse border-rose-500/50';
    } else if (p.urgencyLevel === 'WARNING' || p.timeToShortageHours <= 3.5) {
      badgeClass = 'bg-amber-950 text-amber-300 border-amber-500/50';
      statusText = 'SHORTAGE RISK';
    } else if (p.urgencyLevel === 'SURPLUS') {
      badgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-500/50';
      statusText = 'SURPLUS DONOR';
    }

    // Bar color
    let barColor = 'bg-emerald-500';
    if (stockPct < 25) barColor = 'bg-rose-500';
    else if (stockPct < 45) barColor = 'bg-amber-500';

    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 transition-all duration-300 hover:border-slate-700 ${cardPulse}">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="text-sm font-bold text-white">${p.hospitalName}</h3>
              <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}">${statusText}</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">${p.hospitalType}</p>
          </div>

          <!-- Time to shortage badge -->
          <div class="text-right">
            <span class="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Depletes In</span>
            <span class="text-sm font-bold font-mono ${p.timeToShortageHours <= 3.5 ? 'text-rose-400 font-extrabold' : 'text-emerald-400'}">
              ${p.timeToShortageHours <= 0 ? 'CRITICAL NOW' : formatHours(p.timeToShortageHours)}
            </span>
          </div>
        </div>

        <!-- Stock level bar -->
        <div class="mt-3 space-y-1.5">
          <div class="flex justify-between text-xs text-slate-400">
            <span>Stock: <strong class="text-white font-mono">${Math.round(p.currentStock)}</strong> / ${p.capacity} cyl</span>
            <span class="font-semibold text-slate-300">${stockPct}%</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-500" style="width: ${stockPct}%"></div>
          </div>
        </div>

        <!-- Metrics Row & Fast Actions -->
        <div class="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div class="flex items-center space-x-4">
            <div>
              <span class="text-[10px] text-slate-400 block">Burn Rate:</span>
              <span class="font-semibold text-amber-400">-${p.depletionRatePerHour} cyl/h</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">Trend Fit:</span>
              <span class="font-semibold text-indigo-300">R² ${p.modelRSquared}%</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 block">Transferable:</span>
              <span class="font-semibold text-emerald-400">${p.transferableUnits} cyl</span>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center space-x-1.5">
            <button onclick="injectSurgeOnHospital('${p.hospitalId}')" class="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 rounded-lg text-rose-300 text-[11px] font-semibold transition" title="Trigger Emergency Intake Surge">
              + Surge
            </button>
            <button onclick="injectDeliveryOnHospital('${p.hospitalId}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-[11px] font-medium transition" title="Deliver +40 Supply">
              + Stock
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

// Render Ranked Rebalance Recommendations & Gemini Justifications (Clean, Prominent & Understandable)
function renderRecommendations() {
  const container = document.getElementById('recommendationsList');
  const countLabel = document.getElementById('recCountLabel');

  if (!container) return;

  const recs = state.recommendations || [];
  if (countLabel) countLabel.textContent = `${recs.length} Actionable Plan${recs.length === 1 ? '' : 's'}`;

  if (recs.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
        <i data-lucide="check-circle-2" class="h-8 w-8 mx-auto text-emerald-400"></i>
        <h4 class="text-sm font-semibold text-slate-200">District in Resource Equilibrium</h4>
        <p class="text-xs text-slate-400">All facilities currently have safe oxygen levels (&gt;3.5h runway). No emergency transfers required.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const html = recs.map(rec => {
    const isCritical = rec.urgency === 'CRITICAL';
    const urgencyBadge = isCritical
      ? 'bg-rose-950 text-rose-300 border-rose-500/50'
      : 'bg-amber-950 text-amber-300 border-amber-500/40';

    return `
      <div class="bg-slate-900 border border-purple-500/30 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden transition-all duration-300 hover:border-purple-500/50">
        
        <!-- Top badge & ETA -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-950 text-purple-300 border border-purple-500/40">
              Rank #${rec.rank} Recommended Transfer
            </span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${urgencyBadge}">
              ${rec.urgency}
            </span>
          </div>

          <span class="text-xs text-amber-300 font-mono flex items-center gap-1.5 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-500/30">
            <i data-lucide="clock" class="h-3.5 w-3.5"></i>
            ${rec.byWhen}
          </span>
        </div>

        <!-- Visual Transfer Route Matrix -->
        <div class="bg-slate-950/90 rounded-xl p-4 border border-slate-800 grid grid-cols-1 sm:grid-cols-7 items-center gap-3">
          
          <!-- Donor -->
          <div class="sm:col-span-3 space-y-1">
            <span class="text-[11px] font-semibold uppercase text-emerald-400 flex items-center gap-1">
              <i data-lucide="upload" class="h-3.5 w-3.5"></i> Donor Facility (Surplus)
            </span>
            <h4 class="text-sm font-bold text-white">${rec.donorName}</h4>
            <p class="text-xs text-slate-400">Stock: <strong class="text-white">${Math.round(rec.donorCurrentStock)}</strong> cyl &bull; <span class="text-emerald-400 font-medium">${rec.donorSurplusHours}h surplus</span></p>
          </div>

          <!-- Transfer Arrow & Quantity -->
          <div class="sm:col-span-1 text-center flex flex-col items-center justify-center py-1">
            <span class="text-xs font-bold font-mono px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 shadow-sm">
              +${rec.transferQuantity}
            </span>
            <span class="text-[10px] text-slate-400 mt-1">${rec.transitMinutes}m ETA</span>
          </div>

          <!-- Recipient -->
          <div class="sm:col-span-3 space-y-1 sm:text-right">
            <span class="text-[11px] font-semibold uppercase text-rose-400 flex items-center sm:justify-end gap-1">
              Deficit Facility (Urgent) <i data-lucide="download" class="h-3.5 w-3.5"></i>
            </span>
            <h4 class="text-sm font-bold text-white">${rec.recipientName}</h4>
            <p class="text-xs text-slate-400">Stock: <strong class="text-white">${Math.round(rec.recipientCurrentStock)}</strong> cyl &bull; <span class="text-rose-400 font-semibold">${rec.recipientDepletionHours}h to empty</span></p>
          </div>

        </div>

        <!-- Gemini AI Clinical Justification -->
        <div class="bg-gradient-to-r from-purple-950/50 via-indigo-950/40 to-slate-950 rounded-xl p-4 border border-purple-500/30 space-y-1.5 gemini-box">
          <div class="flex items-center justify-between text-[11px] text-purple-300 font-semibold">
            <span class="flex items-center gap-1.5">
              <i data-lucide="sparkles" class="h-3.5 w-3.5 text-purple-400"></i>
              Gemini AI Clinical Justification
            </span>
            <span class="text-[10px] bg-purple-900/50 px-2 py-0.5 rounded text-purple-300 border border-purple-500/30">
              ${rec.aiMetadata?.poweredByGemini ? 'Gemini 3.8 Flash' : 'Clinical Heuristic'}
            </span>
          </div>
          <blockquote class="text-xs text-slate-100 font-medium italic leading-relaxed pt-0.5">
            "${rec.geminiJustification}"
          </blockquote>
        </div>

        <!-- Action & Impact Button -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2 text-xs">
          <div class="text-slate-400 text-xs">
            Outcome: Extends <strong class="text-white">${rec.recipientName}</strong> runway to <span class="text-emerald-400 font-semibold">${rec.recipientNewRunwayHours}h</span>
          </div>
          <button onclick="executeTransferAction('${rec.donorId}', '${rec.recipientId}', ${rec.transferQuantity}, '${escapeQuotes(rec.geminiJustification)}')" class="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 active:scale-95 cursor-pointer">
            <i data-lucide="check-circle" class="h-4 w-4"></i>
            Approve & Dispatch Transfer
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
  if (!valSelect || !state.predictions) return;

  valSelect.innerHTML = state.predictions.map(p =>
    `<option value="${p.hospitalId}" ${p.hospitalId === state.selectedHospitalIdForValidation ? 'selected' : ''}>${p.hospitalName}</option>`
  ).join('');
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
  // 1-Click Quick Crisis Simulation Button
  const btnQuickSurge = document.getElementById('btnQuickSurge');
  if (btnQuickSurge) {
    btnQuickSurge.addEventListener('click', async () => {
      const target = state.predictions?.find(p => p.hospitalId === 'HOSP-01') || state.predictions?.[0];
      if (target) {
        await window.injectSurgeOnHospital(target.hospitalId);
        showToast(`⚡ Emergency surge triggered at ${target.hospitalName}! Consumption jumped 2.8x.`, 'error');
      }
    });
  }

  // 1-Click Quick Reset Button
  const btnQuickReset = document.getElementById('btnQuickReset');
  if (btnQuickReset) {
    btnQuickReset.addEventListener('click', async () => {
      await fetch('/api/simulation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      showToast('🔄 District stocks reset to normal baseline.', 'info');
      await loadInitialData();
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
      await loadInitialData();
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
      btn.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer';
    });
    [tabContentHeldOut, tabContentTrends, tabContentAudit].forEach(content => {
      content.classList.add('hidden');
    });

    if (activeTab === 'heldOut') {
      tabBtnHeldOut.className = 'px-3.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold transition cursor-pointer';
      tabContentHeldOut.classList.remove('hidden');
      renderValidationTab();
    } else if (activeTab === 'trends') {
      tabBtnTrends.className = 'px-3.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold transition cursor-pointer';
      tabContentTrends.classList.remove('hidden');
      loadTrendsHistory();
    } else if (activeTab === 'audit') {
      tabBtnAudit.className = 'px-3.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold transition cursor-pointer';
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
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-500 font-sans">No transfer manifests recorded yet. Click "Approve & Dispatch Transfer" to create one.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr class="hover:bg-slate-800/40 transition border-b border-slate-800/40 text-[11px]">
        <!-- Manifest & Time -->
        <td class="py-3 px-3">
          <span class="font-bold font-mono text-teal-400 block">${l.manifestId || 'MAN-SYNC'}</span>
          <span class="text-slate-400 text-[10px] block mt-0.5">${new Date(l.timestamp).toLocaleString()}</span>
        </td>

        <!-- Quantity -->
        <td class="py-3 px-3">
          <span class="font-bold font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30 inline-block">
            +${l.quantity} cyl
          </span>
        </td>

        <!-- Source Hospital & Location -->
        <td class="py-3 px-3">
          <strong class="text-white block">${l.donorName}</strong>
          <span class="text-slate-400 text-[10px] block truncate max-w-xs" title="${l.donorAddress || 'District Facility'}">
            📍 ${l.donorAddress || 'District Northside Facility'}
          </span>
          <span class="text-slate-500 text-[10px] block">📞 ${l.donorContact || '+1 (555) 018-7740'}</span>
        </td>

        <!-- Destination Hospital & Location -->
        <td class="py-3 px-3">
          <strong class="text-white block">${l.recipientName}</strong>
          <span class="text-slate-400 text-[10px] block truncate max-w-xs" title="${l.recipientAddress || 'District Facility'}">
            📍 ${l.recipientAddress || 'District Southside Facility'}
          </span>
          <span class="text-slate-500 text-[10px] block">📞 ${l.recipientContact || '+1 (555) 012-4921'}</span>
        </td>

        <!-- Ambulance / Vehicle Plate -->
        <td class="py-3 px-3">
          <span class="font-mono font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30 text-[10px] inline-block">
            🚑 ${l.ambulanceNumber || 'MED-AMB-408'}
          </span>
          <span class="text-slate-500 text-[10px] block mt-0.5">${l.transitMinutes || 15}m transit</span>
        </td>

        <!-- Delivery Personnel & Contact -->
        <td class="py-3 px-3">
          <strong class="text-slate-200 block">👤 ${l.deliveryDriver || 'Officer Rajesh Kumar'}</strong>
          <span class="text-emerald-400 text-[10px] font-mono block mt-0.5">📱 ${l.driverPhone || '+1 (555) 839-2041'}</span>
        </td>

        <!-- Gemini Clinical Justification -->
        <td class="py-3 px-3">
          <span class="italic text-slate-300 block max-w-xs line-clamp-2" title="${l.geminiJustification || ''}">
            "${l.geminiJustification || 'Clinical cross-hospital rebalance'}"
          </span>
        </td>

        <!-- Status -->
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
            ${l.status || 'DELIVERED'}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load audit history:', err);
  }
}

// Start application when DOM loaded
document.addEventListener('DOMContentLoaded', init);
