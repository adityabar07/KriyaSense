/* ==========================================================================
   visualization.js
   Non-vision rendering: module status lists, the AI pipeline diagram, the
   frontend/backend architecture diagram, and the System Monitor's
   performance chart. The AI detection canvas overlay itself lives in
   overlay.js — this file only draws data handed to it (mock today,
   backend JSON tomorrow), same as overlay.js, just for the other panels.
   ========================================================================== */

const ASTRA_VIZ = (() => {

  function renderModuleStatusList(container, modules) {
    container.innerHTML = modules.map(m => `
      <div class="module-status-item">
        <div>
          <div class="m-name">${m.name}</div>
          <div class="m-desc">${m.desc}</div>
        </div>
        <div class="m-state"><span class="dot dot-green pulse"></span> ONLINE</div>
      </div>`).join('');
  }

  const PIPELINE_STAGES = [
    { name: 'CAMERA / OpenCV', desc: 'Frame capture & preprocessing', icon: 'camera' },
    { name: 'YOLO', desc: 'Person & object detection', icon: 'box-select' },
    { name: 'POSE', desc: 'MediaPipe / YOLO-Pose keypoints', icon: 'person-standing' },
    { name: 'TRACKING', desc: 'Multi-object tracking across frames', icon: 'move-3d' },
    { name: 'HAND DETECTION', desc: 'Hand position localization', icon: 'hand' },
    { name: 'HAND-OBJECT INTERACTION', desc: 'What is being manipulated', icon: 'grab' },
    { name: 'FEATURE EXTRACTION', desc: 'Spatio-temporal feature vectors', icon: 'layers' },
    { name: 'HAR MODEL', desc: 'Activity classification', icon: 'brain' },
    { name: 'LSTM / GRU / TRANSFORMER', desc: 'Temporal sequence understanding', icon: 'waypoints' },
    { name: 'ACTIVITY PREDICTION', desc: 'Final activity + confidence', icon: 'target' },
    { name: 'FINITE STATE MACHINE', desc: 'Experiment step state tracking', icon: 'git-compare' },
    { name: 'SEQUENCE VALIDATION', desc: 'Expected vs detected comparison', icon: 'shield-check' },
    { name: 'GUIDANCE / ALERT', desc: 'Next-step instructions & warnings', icon: 'megaphone' },
    { name: 'TTS', desc: 'Voice synthesis of guidance/alerts', icon: 'volume-2' },
    { name: 'LOGGING', desc: 'Structured experiment event log', icon: 'scroll-text' },
    { name: 'VIDEO RECORDING / STREAMING', desc: 'FFmpeg / GStreamer output', icon: 'film' },
  ];

  function renderPipelineFlow(container) {
    let html = '';
    PIPELINE_STAGES.forEach((s, i) => {
      html += `
        <div class="pipeline-node">
          <div class="p-icon"><i data-lucide="${s.icon}"></i></div>
          <div class="p-text">
            <div class="p-name">${s.name}</div>
            <div class="p-desc">${s.desc}</div>
          </div>
          <div class="p-state"><span class="dot dot-green pulse"></span> ONLINE</div>
        </div>`;
      if (i < PIPELINE_STAGES.length - 1) html += `<div class="pipeline-arrow">↓</div>`;
    });
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderArchDiagram(container) {
    container.innerHTML = `
      <div class="arch-box frontend">
        <div class="arch-box-title">FRONTEND</div>
        <div class="arch-list">
          <span class="arch-chip">HTML / CSS / JS</span>
          <span class="arch-chip">Dashboard</span>
          <span class="arch-chip">Video UI</span>
          <span class="arch-chip">Experiment UI</span>
          <span class="arch-chip">Visualization</span>
          <span class="arch-chip">Chart.js</span>
        </div>
      </div>
      <div class="arch-connector">
        <div class="line"></div>
        REST API / WebSocket
        <div class="line"></div>
      </div>
      <div class="arch-box backend">
        <div class="arch-box-title">BACKEND</div>
        <div class="arch-list">
          <span class="arch-chip">Python / FastAPI</span>
          <span class="arch-chip">OpenCV</span>
          <span class="arch-chip">YOLO</span>
          <span class="arch-chip">Pose Estimation</span>
          <span class="arch-chip">Tracking</span>
          <span class="arch-chip">Hand Interaction</span>
          <span class="arch-chip">HAR</span>
          <span class="arch-chip">LSTM / Transformer</span>
          <span class="arch-chip">FSM</span>
          <span class="arch-chip">TTS</span>
          <span class="arch-chip">FFmpeg / GStreamer</span>
        </div>
      </div>`;
  }

  /* ---------------------------- Charts ---------------------------- */

  let perfChart = null;

  function initPerfChart(canvas) {
    if (!window.Chart) return;
    if (perfChart) perfChart.destroy();
    perfChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'FPS', data: [], borderColor: '#3ee6ff', backgroundColor: 'rgba(62,230,255,0.1)', tension: 0.35, yAxisID: 'y', pointRadius: 0, borderWidth: 2 },
          { label: 'Latency (ms)', data: [], borderColor: '#ffb547', backgroundColor: 'rgba(255,181,71,0.1)', tension: 0.35, yAxisID: 'y1', pointRadius: 0, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#a9b8d4', font: { family: 'JetBrains Mono', size: 10 } } } },
        scales: {
          x: { ticks: { color: '#6c7ea3', font: { size: 9 } }, grid: { display: false } },
          y: { position: 'left', min: 0, max: 60, ticks: { color: '#3ee6ff', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y1: { position: 'right', min: 0, max: 100, ticks: { color: '#ffb547', font: { size: 9 } }, grid: { display: false } },
        },
      },
    });
    return perfChart;
  }

  function pushPerfSample(fps, latency) {
    if (!perfChart) return;
    const label = new Date().toLocaleTimeString('en-GB', { hour12: false });
    perfChart.data.labels.push(label);
    perfChart.data.datasets[0].data.push(fps);
    perfChart.data.datasets[1].data.push(latency);
    if (perfChart.data.labels.length > 24) {
      perfChart.data.labels.shift();
      perfChart.data.datasets.forEach(d => d.data.shift());
    }
    perfChart.update('none');
  }

  return {
    renderModuleStatusList,
    renderPipelineFlow,
    renderArchDiagram,
    initPerfChart,
    pushPerfSample,
    PIPELINE_STAGES,
  };
})();
