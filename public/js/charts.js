// Charts controller using Chart.js

let heldOutChartInstance = null;
let districtTrendChartInstance = null;

const HOSPITAL_COLORS = {
  'HOSP-01': '#f43f5e', // Metro General (Red/Rose)
  'HOSP-02': '#10b981', // St. Jude (Emerald)
  'HOSP-03': '#f97316', // Riverbank (Orange)
  'HOSP-04': '#3b82f6', // Oak Valley (Blue)
  'HOSP-05': '#eab308', // Mercy Urban (Yellow)
  'HOSP-06': '#a855f7'  // Highland (Purple)
};

function initHeldOutChart() {
  const ctx = document.getElementById('heldOutChart');
  if (!ctx) return;

  heldOutChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Actual Held-Out Telemetry',
          data: [],
          borderColor: '#22d3ee',
          backgroundColor: '#22d3ee',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.1
        },
        {
          label: 'Predicted Depletion Trend (Model)',
          data: [],
          borderColor: '#818cf8',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${context.parsed.y} cyl`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#64748b', maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function updateHeldOutChart(series) {
  if (!heldOutChartInstance || !series || series.length === 0) return;

  const labels = series.map(p => p.timeLabel);
  const actuals = series.map(p => p.actualStock);
  const predicteds = series.map(p => p.predictedStock);

  heldOutChartInstance.data.labels = labels;
  heldOutChartInstance.data.datasets[0].data = actuals;
  heldOutChartInstance.data.datasets[1].data = predicteds;
  heldOutChartInstance.update();
}

function initDistrictTrendChart() {
  const ctx = document.getElementById('districtTrendChart');
  if (!ctx) return;

  districtTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#64748b', maxTicksLimit: 10 }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#64748b' },
          title: { display: true, text: 'Oxygen Stock (Cylinders)', color: '#64748b' }
        }
      }
    }
  });
}

function updateDistrictTrendChart(telemetryPoints, hospitals) {
  if (!districtTrendChartInstance || !telemetryPoints || telemetryPoints.length === 0) return;

  // Group by timestamp label
  const timestamps = Array.from(new Set(telemetryPoints.map(p => p.timestamp))).sort((a, b) => a - b);
  const labels = timestamps.map(t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  // Build a dataset per hospital
  const datasets = hospitals.map(hosp => {
    const hospPoints = telemetryPoints.filter(p => p.hospitalId === hosp.id);
    const pointMap = new Map(hospPoints.map(p => [p.timestamp, p.currentStock]));
    const data = timestamps.map(t => pointMap.get(t) ?? null);

    return {
      label: hosp.name,
      data,
      borderColor: HOSPITAL_COLORS[hosp.id] || '#94a3b8',
      backgroundColor: HOSPITAL_COLORS[hosp.id] || '#94a3b8',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.2
    };
  });

  districtTrendChartInstance.data.labels = labels;
  districtTrendChartInstance.data.datasets = datasets;
  districtTrendChartInstance.update();
}

window.Charts = {
  initHeldOutChart,
  updateHeldOutChart,
  initDistrictTrendChart,
  updateDistrictTrendChart
};
