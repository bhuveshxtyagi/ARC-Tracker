// ARC Fit Health Tracker - Core Logic & Sync Engine
// Connects to Supabase database (ajwezyvnkbuxmkgqpcjs) or falls back to local sandbox

// Global Application State
const state = {
  logs: [],       // health_logs (steps, sleep, water, weight, calories, mood, notes)
  goals: [],      // health_goals (steps, sleep, water, weight, calories_in, calories_out)
  vitals: [],     // health_vitals (heart_rate, blood_pressure, blood_sugar, cholesterol, etc)
  filters: {
    search: '',
    category: 'all',
    sortBy: 'newest'
  },
  pagination: {
    currentPage: 1,
    itemsPerPage: 8
  },
  isSupabaseConnected: false
};

// SVG / FontAwesome Icons (strictly no emojis)
const SVG_ICONS = {
  steps: 'fa-solid fa-shoe-prints',
  calories_consumed: 'fa-solid fa-bowl-food',
  calories_burned: 'fa-solid fa-fire-flame-curved',
  water_intake: 'fa-solid fa-droplet',
  sleep_duration: 'fa-solid fa-bed',
  weight: 'fa-solid fa-weight-scale',
  heart_rate: 'fa-solid fa-heart-pulse',
  blood_pressure_sys: 'fa-solid fa-circle-arrow-up',
  blood_pressure_dia: 'fa-solid fa-circle-arrow-down',
  blood_sugar: 'fa-solid fa-vial',
  cholesterol: 'fa-solid fa-apple-whole',
  others: 'fa-solid fa-circle-info',
  edit: 'fa-solid fa-pen-to-square',
  trash: 'fa-solid fa-trash-can',
  check: 'fa-solid fa-check',
  alert: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-info-circle',
  trend: 'fa-solid fa-chart-column',
  search: 'fa-solid fa-magnifying-glass'
};

// Vital Metrics and UI Labels Config
const VITAL_CONFIG = {
  heart_rate: { name: 'Resting Heart Rate', unit: 'bpm', icon: 'heart_rate', color: '#f43f5e' },
  blood_pressure_sys: { name: 'Systolic BP', unit: 'mmHg', icon: 'blood_pressure_sys', color: '#8b5cf6' },
  blood_pressure_dia: { name: 'Diastolic BP', unit: 'mmHg', icon: 'blood_pressure_dia', color: '#6366f1' },
  blood_sugar: { name: 'Blood Sugar', unit: 'mg/dL', icon: 'blood_sugar', color: '#f59e0b' },
  cholesterol: { name: 'Cholesterol', unit: 'mg/dL', icon: 'cholesterol', color: '#20b8a6' },
  others: { name: 'Other Vitals', unit: '', icon: 'others', color: '#94a3b8' }
};

// Goals Helper Config
const GOAL_CONFIG = {
  steps: { name: 'Steps Count', icon: 'steps', unit: 'steps' },
  water_intake: { name: 'Water Intake', icon: 'water_intake', unit: 'ml' },
  sleep_duration: { name: 'Sleep Duration', icon: 'sleep_duration', unit: 'hrs' },
  calories_consumed: { name: 'Calories Intake', icon: 'calories_consumed', unit: 'kcal' },
  calories_burned: { name: 'Calories Burned', icon: 'calories_burned', unit: 'kcal' },
  weight: { name: 'Target Weight', icon: 'weight', unit: 'kg' }
};

// Global Chart.js Instances
let vitalsChartInstance = null;
let trendChartInstance = null;
let stepsChartInstance = null;

// Supabase Client Connection References
let supabaseClient = null;
const DEFAULT_URL = 'https://ajwezyvnkbuxmkgqpcjs.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_WnOcdyZp-2dgTz1O5pitzg_dLqK29mj';

// ----------------------------------------------------
// 1. Initialization and Theme Setup
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initModalListeners();
  initFilterListeners();

  // Onboarding Status Check
  const onboardingCompleted = localStorage.getItem('health_onboarding_completed') === 'true';

  if (!onboardingCompleted) {
    // Fill onboard form with defaults
    document.getElementById('onboard-url').value = DEFAULT_URL;
    document.getElementById('onboard-key').value = DEFAULT_PUBLISHABLE_KEY;
    document.getElementById('onboarding-dialog').showModal();
  } else {
    await initDatabaseConnection();
    await loadData();
  }
});

// Theme Switcher Sync with localStorage
function initTheme() {
  const savedTheme = localStorage.getItem('health_theme') || 'dark';
  const body = document.body;
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');

  if (savedTheme === 'light') {
    body.classList.add('light-theme');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = 'inline-block';
      moonIcon.style.display = 'none';
    }
  } else {
    body.classList.remove('light-theme');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'inline-block';
    }
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = body.classList.toggle('light-theme');
    localStorage.setItem('health_theme', isLight ? 'light' : 'dark');

    if (isLight) {
      if (sunIcon && moonIcon) {
        sunIcon.style.display = 'inline-block';
        moonIcon.style.display = 'none';
      }
      showToast('Switched to Light Theme', 'info');
    } else {
      if (sunIcon && moonIcon) {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'inline-block';
      }
      showToast('Switched to Dark Theme', 'info');
    }
    renderCharts();
  });
}

// Dialog listeners & click outside boundary dismissals (Safaris/Firefox fallbacks)
function initModalListeners() {
  const dialogs = document.querySelectorAll('dialog');

  dialogs.forEach(dialog => {
    if (dialog.id === 'onboarding-dialog') return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;

        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );

        if (isDialogContent) return;
        dialog.close();
      });
    }

    const closeBtn = dialog.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => dialog.close());
    }
  });

  // Attach submit listeners to forms
  document.getElementById('log-form').addEventListener('submit', handleLogSubmit);
  document.getElementById('vital-form').addEventListener('submit', handleVitalSubmit);
  document.getElementById('goals-form').addEventListener('submit', handleGoalsSubmit);
  document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
}

// ----------------------------------------------------
// 2. Supabase / Sandbox Connection Managers
// ----------------------------------------------------
async function initDatabaseConnection() {
  let url = localStorage.getItem('health_supabase_url');
  if (url === null) {
    url = DEFAULT_URL;
    localStorage.setItem('health_supabase_url', DEFAULT_URL);
  }

  let key = localStorage.getItem('health_supabase_key');
  if (key === null) {
    key = DEFAULT_PUBLISHABLE_KEY;
    localStorage.setItem('health_supabase_key', DEFAULT_PUBLISHABLE_KEY);
  }

  if (!url) {
    updateSyncUI('disconnected', 'Sandbox Mode');
    state.isSupabaseConnected = false;
    return;
  }

  updateSyncUI('syncing', 'Connecting...');

  try {
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase client library not loaded.');
    }

    supabaseClient = supabase.createClient(url, key);

    // Run connection probe on health_logs
    const { error } = await supabaseClient.from('health_logs').select('*', { count: 'exact', head: true }).limit(1);
    if (error) throw error;

    updateSyncUI('connected', 'Synced');
    state.isSupabaseConnected = true;
  } catch (err) {
    console.error('Supabase connection failure:', err);
    updateSyncUI('error', 'Connection Error');
    state.isSupabaseConnected = false;
    showToast('Failed to sync. Running in Local Sandbox mode.', 'error');
  }
}

function updateSyncUI(status, label) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('sync-text');
  if (dot && text) {
    dot.className = 'status-dot';
    dot.classList.add(status);
    text.textContent = label;
  }
}

// ----------------------------------------------------
// 3. Data Sync Engine (Fetch & Save)
// ----------------------------------------------------
async function loadData() {
  if (state.isSupabaseConnected) {
    await fetchFromSupabase();
  } else {
    fetchFromLocalStorage();
  }

  state.pagination.currentPage = 1;
  updateUI();
}

async function fetchFromSupabase() {
  try {
    // Fetch logs (newest first)
    const { data: logData, error: logErr } = await supabaseClient
      .from('health_logs')
      .select('*')
      .order('date', { ascending: false });
    if (logErr) throw logErr;
    state.logs = logData || [];

    // Fetch goals
    const { data: goalData, error: goalErr } = await supabaseClient
      .from('health_goals')
      .select('*');
    if (goalErr) throw goalErr;
    state.goals = goalData || [];

    // Fetch vitals (newest first)
    const { data: vitData, error: vitErr } = await supabaseClient
      .from('health_vitals')
      .select('*')
      .order('created_at', { ascending: false });
    if (vitErr) throw vitErr;
    state.vitals = vitData || [];
  } catch (err) {
    console.error('Error fetching Supabase rows:', err);
    showToast('Sync error. Falling back to local storage cache.', 'error');
    fetchFromLocalStorage();
  }
}

function fetchFromLocalStorage() {
  const logsStr = localStorage.getItem('local_health_logs');
  const goalsStr = localStorage.getItem('local_health_goals');
  const vitalsStr = localStorage.getItem('local_health_vitals');

  state.logs = logsStr ? JSON.parse(logsStr) : [];
  state.goals = goalsStr ? JSON.parse(goalsStr) : [];
  state.vitals = vitalsStr ? JSON.parse(vitalsStr) : [];
}

function saveToLocalStorageOnly() {
  localStorage.setItem('local_health_logs', JSON.stringify(state.logs));
  localStorage.setItem('local_health_goals', JSON.stringify(state.goals));
  localStorage.setItem('local_health_vitals', JSON.stringify(state.vitals));
}

// ----------------------------------------------------
// 4. UI Dashboard Render Engine
// ----------------------------------------------------
function updateUI() {
  renderKPIs();
  renderVitalsSection();
  renderGoalsSection();
  renderIntelligenceSection();
  renderLogsTable();
  renderCharts();
}

// 4.1 KPIs Rendering
function renderKPIs() {
  // Get today's local log entry
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayLog = state.logs.find(l => l.date === todayStr) || {
    steps: 0,
    water_intake: 0,
    sleep_duration: 0,
    calories_consumed: 0,
    calories_burned: 0,
    weight: null
  };

  // Find latest weight reading
  let currentWeight = 0;
  if (todayLog.weight) {
    currentWeight = parseFloat(todayLog.weight);
  } else {
    // Find latest log entry with weight
    const logWithWeight = state.logs.find(l => l.weight > 0);
    if (logWithWeight) {
      currentWeight = parseFloat(logWithWeight.weight);
    } else {
      // Find latest weight in vitals or fallback
      const initialWeightGoal = state.goals.find(g => g.metric === 'weight');
      currentWeight = initialWeightGoal ? parseFloat(initialWeightGoal.target_value) : 0;
    }
  }

  // Get active goals targets
  const stepGoal = state.goals.find(g => g.metric === 'steps');
  const sleepGoal = state.goals.find(g => g.metric === 'sleep_duration');
  const waterGoal = state.goals.find(g => g.metric === 'water_intake');
  const weightGoal = state.goals.find(g => g.metric === 'weight');

  const stepTarget = stepGoal ? parseInt(stepGoal.target_value) : 10000;
  const sleepTarget = sleepGoal ? parseFloat(sleepGoal.target_value) : 8.0;
  const waterTarget = waterGoal ? parseInt(waterGoal.target_value) : 3000;
  const weightTarget = weightGoal ? parseFloat(weightGoal.target_value) : 70.0;

  // Calculate Calorie Delta (Balance)
  const consumed = todayLog.calories_consumed || 0;
  const burned = todayLog.calories_burned || 0;
  const netCalories = consumed - burned;
  const netCaloriesSign = netCalories >= 0 ? '+' : '';

  // Update elements
  document.getElementById('kpi-steps').textContent = `${formatNumber(todayLog.steps || 0)} steps`;
  document.getElementById('kpi-steps-meta').textContent = `Goal: ${formatNumber(stepTarget)} steps (${calculateProgressPercent(todayLog.steps, stepTarget)}%)`;

  document.getElementById('kpi-weight').textContent = `${currentWeight > 0 ? currentWeight.toFixed(1) : '0.0'} kg`;
  document.getElementById('kpi-weight-meta').textContent = `Goal: ${weightTarget.toFixed(1)} kg`;

  document.getElementById('kpi-sleep').textContent = `${(todayLog.sleep_duration || 0).toFixed(1)} hrs`;
  document.getElementById('kpi-sleep-meta').textContent = `Goal: ${sleepTarget.toFixed(1)} hrs (${calculateProgressPercent(todayLog.sleep_duration, sleepTarget)}%)`;

  document.getElementById('kpi-hydration').textContent = `${formatNumber(todayLog.water_intake || 0)} ml`;
  document.getElementById('kpi-hydration-meta').textContent = `Goal: ${formatNumber(waterTarget)} ml (${calculateProgressPercent(todayLog.water_intake, waterTarget)}%)`;

  document.getElementById('kpi-calories').textContent = `${netCaloriesSign}${formatNumber(netCalories)} kcal`;
  document.getElementById('kpi-calories-meta').textContent = `In: ${formatNumber(consumed)} | Out: ${formatNumber(burned)}`;
}

// 4.2 Recent Vital Readings List Rendering
function renderVitalsSection() {
  const vitalsList = document.getElementById('vitals-list');
  if (!vitalsList) return;
  vitalsList.innerHTML = '';

  if (state.vitals.length === 0) {
    vitalsList.innerHTML = `
      <div class="budget-empty">
        <i class="fa-solid fa-vial"></i>
        <p>No biometric readings logged yet. Keep track of vitals here.</p>
        <button class="btn btn-secondary btn-sm" onclick="openAddVitalModal()" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.85rem;">Log Vital</button>
      </div>
    `;
    return;
  }

  // Get most recent reading per vital category
  const categories = ['heart_rate', 'blood_pressure_sys', 'blood_pressure_dia', 'blood_sugar', 'cholesterol', 'others'];
  const latestVitals = {};

  categories.forEach(cat => {
    const readings = state.vitals.filter(v => v.category === cat);
    if (readings.length > 0) {
      // Readings are pre-sorted by created_at (newest first)
      latestVitals[cat] = readings[0];
    }
  });

  const renderCount = Object.keys(latestVitals).length;

  if (renderCount === 0) {
    vitalsList.innerHTML = `
      <div class="budget-empty">
        <i class="fa-solid fa-vial"></i>
        <p>No vital categories mapped. Log a vital reading below.</p>
      </div>
    `;
    return;
  }

  // Render recent rows
  Object.entries(latestVitals).forEach(([catId, vital]) => {
    const config = VITAL_CONFIG[catId] || { name: vital.name, unit: '', icon: 'others' };
    const dateStr = new Date(vital.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    const itemHtml = `
      <div class="asset-item-row ${catId}">
        <div class="asset-item-info">
          <div class="asset-item-icon">
            ${getIconHTML(config.icon)}
          </div>
          <div class="asset-item-text">
            <span class="asset-item-name">${escapeHtml(vital.name)}</span>
            <span class="asset-item-category">Logged on ${dateStr}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="asset-item-value">${vital.value} ${config.unit}</span>
          <button class="action-btn delete" onclick="deleteVitalItem('${vital.id}')" title="Delete Vital Reading" style="width: 24px; height: 24px; font-size: 0.75rem;">
            ${getIconHTML('trash')}
          </button>
        </div>
      </div>
    `;
    vitalsList.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// 4.3 Goals List Rendering
function renderGoalsSection() {
  const goalsList = document.getElementById('goals-list');
  if (!goalsList) return;
  goalsList.innerHTML = '';

  if (state.goals.length === 0) {
    goalsList.innerHTML = `
      <div class="budget-empty">
        <i class="fa-solid fa-bullseye"></i>
        <p>No health goals configured. Set targets to build wellness habits.</p>
        <button class="btn btn-secondary btn-sm" onclick="openGoalsModal()" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.85rem;">Configure Goals</button>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayLog = state.logs.find(l => l.date === todayStr) || {
    steps: 0,
    water_intake: 0,
    sleep_duration: 0,
    calories_consumed: 0,
    calories_burned: 0,
    weight: 0
  };

  state.goals.forEach(goal => {
    const metric = goal.metric;
    const config = GOAL_CONFIG[metric] || { name: metric, icon: 'others', unit: '' };
    const target = parseFloat(goal.target_value) || 0;
    if (target <= 0) return;

    let progress = 0;
    if (metric === 'steps') progress = todayLog.steps || 0;
    else if (metric === 'water_intake') progress = todayLog.water_intake || 0;
    else if (metric === 'sleep_duration') progress = todayLog.sleep_duration || 0;
    else if (metric === 'calories_consumed') progress = todayLog.calories_consumed || 0;
    else if (metric === 'calories_burned') progress = todayLog.calories_burned || 0;
    else if (metric === 'weight') {
      // Find latest weight logged
      const latestWeightLog = state.logs.find(l => l.weight > 0);
      progress = latestWeightLog ? latestWeightLog.weight : 0;
    }

    let percentage = 0;
    let barClass = 'normal';

    if (metric === 'weight') {
      // For weight, progress is goal matching
      percentage = progress > 0 ? Math.min((target / progress) * 100, 100) : 0;
      if (Math.abs(progress - target) < 1.0) barClass = 'normal';
      else if (Math.abs(progress - target) < 3.0) barClass = 'warning';
      else barClass = 'danger';
    } else if (metric === 'calories_consumed') {
      // For calorie intake, exceeding limit is warning/danger
      percentage = Math.min((progress / target) * 100, 120);
      if (progress > target) barClass = 'danger';
      else if (progress >= target * 0.9) barClass = 'warning';
    } else {
      // Standard target achievement goals (steps, sleep, water, calorie burn)
      percentage = Math.min((progress / target) * 100, 100);
      if (percentage >= 100) barClass = 'normal'; // Completed target
      else if (percentage >= 70) barClass = 'warning';
      else barClass = 'danger';
    }

    const itemHtml = `
      <div class="budget-item">
        <div class="budget-item-info">
          <span class="budget-category">
            ${getIconHTML(config.icon)}
            ${config.name}
          </span>
          <span class="budget-amount">
            ${formatMetricValue(progress, metric)} <span>/ ${formatMetricValue(target, metric)}</span>
          </span>
        </div>
        <div class="budget-bar-bg">
          <div class="budget-bar-fill ${barClass}" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
    goalsList.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// 4.4 Health Intelligence Panel
function renderIntelligenceSection() {
  const topActivityList = document.getElementById('top-activity-list');
  const peakContainer = document.getElementById('peak-activity-container');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Monthly filtered logs
  const monthlyLogs = state.logs.filter(l => {
    const logDate = new Date(l.date);
    return logDate.getFullYear() === currentYear && logDate.getMonth() === currentMonth;
  });

  // Top steps achievement this month
  if (topActivityList) {
    topActivityList.innerHTML = '';
    
    // Sort logs by steps
    const stepLogs = [...monthlyLogs].filter(l => l.steps > 0).sort((a, b) => b.steps - a.steps);
    const avgSteps = monthlyLogs.length > 0
      ? Math.round(monthlyLogs.reduce((acc, l) => acc + (l.steps || 0), 0) / monthlyLogs.length)
      : 0;
    
    if (stepLogs.length === 0) {
      topActivityList.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-muted); padding: 0.5rem 0;">No active logs recorded this month.</div>`;
    } else {
      const topLog = stepLogs[0];
      topActivityList.innerHTML = `
        <div class="top-spent-item">
          <span class="top-spent-cat">
            ${getIconHTML('steps')} Month's Record
          </span>
          <div class="top-spent-bar-wrapper">
            <div class="top-spent-bar-fill" style="width: 100%"></div>
          </div>
          <span class="top-spent-val">
            ${formatNumber(topLog.steps)} <span>steps</span>
          </span>
        </div>
        <div class="top-spent-item" style="margin-top: 0.5rem;">
          <span class="top-spent-cat">
            ${getIconHTML('steps')} Daily Average
          </span>
          <div class="top-spent-bar-wrapper">
            <div class="top-spent-bar-fill" style="width: ${Math.min((avgSteps / topLog.steps) * 100, 100)}%; background: var(--color-warning);"></div>
          </div>
          <span class="top-spent-val">
            ${formatNumber(avgSteps)} <span>steps</span>
          </span>
        </div>
      `;
    }
  }

  // Peak Calorie Burn Day of current month
  if (peakContainer) {
    peakContainer.innerHTML = '';
    
    let peakBurnLog = null;
    monthlyLogs.forEach(l => {
      if (l.calories_burned > 0) {
        if (!peakBurnLog || l.calories_burned > peakBurnLog.calories_burned) {
          peakBurnLog = l;
        }
      }
    });

    if (!peakBurnLog) {
      peakContainer.innerHTML = `
        <div class="peak-transaction-box" style="justify-content: center; border-style: solid; padding: 0.75rem;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">No calorie burn data logged yet.</span>
        </div>
      `;
    } else {
      const dateStr = formatDateStr(peakBurnLog.date);
      const moodLabel = peakBurnLog.mood ? peakBurnLog.mood.toUpperCase() : 'HEALTHY';
      
      peakContainer.innerHTML = `
        <div class="peak-transaction-box">
          <div class="peak-icon-wrapper" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
            ${getIconHTML('calories_burned')}
          </div>
          <div class="peak-details">
            <span class="peak-title">Burned ${formatNumber(peakBurnLog.calories_burned)} kcal</span>
            <span class="peak-meta">${dateStr} &bull; Mood: ${moodLabel}</span>
          </div>
          <span class="peak-amount" style="color: var(--color-expense); font-size: 0.95rem;">
            ${formatNumber(peakBurnLog.steps || 0)} Steps
          </span>
        </div>
      `;
    }
  }
}

// 4.5 Logs Table Ledger Rendering
function renderLogsTable() {
  const tbody = document.getElementById('logs-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Filter logs
  let filtered = state.logs.filter(log => {
    // Search filter
    const searchVal = state.filters.search.toLowerCase();
    const matchSearch = log.date.includes(searchVal) ||
      (log.mood && log.mood.toLowerCase().includes(searchVal)) ||
      (log.notes && log.notes.toLowerCase().includes(searchVal));

    // Category filter
    let matchCategory = true;
    if (state.filters.category !== 'all') {
      const metric = state.filters.category;
      matchCategory = log[metric] !== undefined && log[metric] !== null && log[metric] > 0;
    }

    return matchSearch && matchCategory;
  });

  // Sort logs
  filtered.sort((a, b) => {
    if (state.filters.sortBy === 'newest') return new Date(b.date) - new Date(a.date);
    if (state.filters.sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
    if (state.filters.sortBy === 'highest_steps') return (b.steps || 0) - (a.steps || 0);
    if (state.filters.sortBy === 'lowest_steps') return (a.steps || 0) - (b.steps || 0);
    return 0;
  });

  // Pagination
  const totalItems = filtered.length;
  const itemsPerPage = state.pagination.itemsPerPage;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  if (state.pagination.currentPage > totalPages) {
    state.pagination.currentPage = totalPages;
  }

  const startIndex = (state.pagination.currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginated = filtered.slice(startIndex, endIndex);

  // Update Page details
  document.getElementById('page-info').textContent = totalItems > 0
    ? `Showing ${startIndex + 1}–${endIndex} of ${totalItems} logged days`
    : 'No logs recorded';

  document.getElementById('prev-btn').disabled = state.pagination.currentPage === 1;
  document.getElementById('next-btn').disabled = state.pagination.currentPage === totalPages;

  if (paginated.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            ${getIconHTML('search')}
            <p>No matching health logs found. Log daily stats to begin tracking.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Render rows
  paginated.forEach(log => {
    // Generate inline metric summaries
    let metricsHtml = '<div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.25rem;">';
    if (log.steps > 0) {
      metricsHtml += `<span class="badge-category steps" title="Steps logged">${getIconHTML('steps')} ${formatNumber(log.steps)}</span>`;
    }
    if (log.water_intake > 0) {
      metricsHtml += `<span class="badge-category water_intake" title="Hydration level">${getIconHTML('water_intake')} ${(log.water_intake / 1000).toFixed(1)}L</span>`;
    }
    if (log.sleep_duration > 0) {
      metricsHtml += `<span class="badge-category sleep_duration" title="Sleep hours">${getIconHTML('sleep_duration')} ${log.sleep_duration}h</span>`;
    }
    if (log.calories_consumed > 0 || log.calories_burned > 0) {
      metricsHtml += `<span class="badge-category calories_consumed" title="Calories Consumed vs Burned">${getIconHTML('calories_consumed')} ${formatNumber(log.calories_consumed || 0)} / ${formatNumber(log.calories_burned || 0)}</span>`;
    }
    if (log.weight > 0) {
      metricsHtml += `<span class="badge-category weight" title="Body weight">${getIconHTML('weight')} ${log.weight}kg</span>`;
    }
    metricsHtml += '</div>';

    const moodBadge = log.mood
      ? `<span class="badge-category others" style="text-transform: capitalize;">${log.mood}</span>`
      : `<span style="color: var(--text-muted); font-size: 0.85rem;">--</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-date">${formatDateStr(log.date)}</td>
      <td>
        <div style="font-weight: 500; font-size: 0.9rem; color: var(--text-secondary);">Daily Metrics Summary:</div>
        ${metricsHtml}
      </td>
      <td>${moodBadge}</td>
      <td style="font-size: 0.85rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.notes || '')}">
        ${log.notes ? escapeHtml(log.notes) : '<span style="color: var(--text-muted); font-style: italic;">No notes</span>'}
      </td>
      <td class="td-actions">
        <button class="action-btn" onclick="openEditLogModal('${log.id}')" title="Edit Daily Log">
          ${getIconHTML('edit')}
        </button>
        <button class="action-btn delete" onclick="deleteLogItem('${log.id}')" title="Delete Daily Log">
          ${getIconHTML('trash')}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// 5. Data Visualizations (Chart.js)
// ----------------------------------------------------
function renderCharts() {
  const canvasVitals = document.getElementById('vitalsChart');
  const canvasTrend = document.getElementById('trendChart');
  const canvasSteps = document.getElementById('stepsChart');

  if (!canvasVitals || !canvasTrend || !canvasSteps) return;

  const isLightTheme = document.body.classList.contains('light-theme');
  const textColor = isLightTheme ? '#475569' : '#94a3b8';
  const gridColor = isLightTheme ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.03)';

  // Destroy previous charts
  if (vitalsChartInstance) vitalsChartInstance.destroy();
  if (trendChartInstance) trendChartInstance.destroy();
  if (stepsChartInstance) stepsChartInstance.destroy();

  // 1. Vitals Breakdown (Pie/Doughnut)
  // Shows today's completion rates of goals!
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayLog = state.logs.find(l => l.date === todayStr) || {
    steps: 0,
    water_intake: 0,
    sleep_duration: 0,
    calories_consumed: 0,
    calories_burned: 0,
    weight: 0
  };

  const stepGoal = state.goals.find(g => g.metric === 'steps');
  const sleepGoal = state.goals.find(g => g.metric === 'sleep_duration');
  const waterGoal = state.goals.find(g => g.metric === 'water_intake');

  const stepTarget = stepGoal ? parseInt(stepGoal.target_value) : 10000;
  const sleepTarget = sleepGoal ? parseFloat(sleepGoal.target_value) : 8.0;
  const waterTarget = waterGoal ? parseInt(waterGoal.target_value) : 3000;

  const vitalsLabels = ['Steps Met (%)', 'Sleep Met (%)', 'Hydration Met (%)'];
  const stepsPercentage = stepTarget > 0 ? Math.min((todayLog.steps / stepTarget) * 100, 100) : 0;
  const sleepPercentage = sleepTarget > 0 ? Math.min((todayLog.sleep_duration / sleepTarget) * 100, 100) : 0;
  const waterPercentage = waterTarget > 0 ? Math.min((todayLog.water_intake / waterTarget) * 100, 100) : 0;

  const vitalsData = [stepsPercentage, sleepPercentage, waterPercentage];
  const vitalsColors = ['#06b6d4', '#6366f1', '#3b82f6'];

  // Fill in placeholders if all elements are 0
  const isZero = vitalsData.every(v => v === 0);
  const pieData = isZero ? [33.3, 33.3, 33.3] : vitalsData;
  const pieColors = isZero ? (isLightTheme ? ['#e2e8f0', '#cbd5e1', '#94a3b8'] : ['#1e293b', '#334155', '#475569']) : vitalsColors;
  const pieLabels = isZero ? ['Steps Target', 'Sleep Target', 'Water Target'] : vitalsLabels;

  vitalsChartInstance = new Chart(canvasVitals, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieData,
        backgroundColor: pieColors,
        borderWidth: 1,
        borderColor: isLightTheme ? '#ffffff' : 'rgba(255, 255, 255, 0.05)',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: textColor,
            font: { family: 'Outfit', size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              if (isZero) return ` ${context.label}: No progress logged today`;
              return ` ${context.label}: ${context.raw.toFixed(1)}% achieved`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });

  // 2. Calorie Trends - Last 6 Logged Days (Grouped Bar Chart)
  // Retrieve last 6 days of logged entries in chronological order
  const last6Logs = [...state.logs]
    .slice(0, 6)
    .reverse();

  const labels6Days = last6Logs.map(l => formatDateStrShort(l.date));
  const consumed6Data = last6Logs.map(l => l.calories_consumed || 0);
  const burned6Data = last6Logs.map(l => l.calories_burned || 0);

  // Fill default values if logs list is empty
  const defaultLabels = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'];
  const trendLabels = last6Logs.length > 0 ? labels6Days : defaultLabels;
  const trendConsumed = last6Logs.length > 0 ? consumed6Data : [0, 0, 0, 0, 0, 0];
  const trendBurned = last6Logs.length > 0 ? burned6Data : [0, 0, 0, 0, 0, 0];

  trendChartInstance = new Chart(canvasTrend, {
    type: 'bar',
    data: {
      labels: trendLabels,
      datasets: [
        {
          label: 'Consumed',
          data: trendConsumed,
          backgroundColor: isLightTheme ? 'rgba(13, 148, 136, 0.85)' : 'rgba(13, 148, 136, 0.75)',
          borderColor: '#0d9488',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Burned',
          data: trendBurned,
          backgroundColor: isLightTheme ? 'rgba(244, 63, 94, 0.85)' : 'rgba(244, 63, 94, 0.75)',
          borderColor: '#f43f5e',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: textColor, font: { family: 'Outfit', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${formatNumber(context.raw)} kcal`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Outfit' },
            callback: function (value) { return value + ' kcal'; }
          }
        }
      }
    }
  });

  // 3. Steps Target Completion Trend - Line Chart
  const steps6Data = last6Logs.map(l => l.steps || 0);
  const stepsData = last6Logs.length > 0 ? steps6Data : [0, 0, 0, 0, 0, 0];
  const activeStepGoal = state.goals.find(g => g.metric === 'steps');
  const targetStepVal = activeStepGoal ? parseInt(activeStepGoal.target_value) : 10000;

  // Horizontal threshold reference lines in chart is drawn using an additional line dataset
  const stepGoalsDataset = new Array(trendLabels.length).fill(targetStepVal);

  stepsChartInstance = new Chart(canvasSteps, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [
        {
          label: 'Steps Walked',
          data: stepsData,
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          borderColor: '#06b6d4',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#06b6d4'
        },
        {
          label: 'Daily Goal',
          data: stepGoalsDataset,
          borderColor: 'rgba(244, 63, 94, 0.65)',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: textColor, font: { family: 'Outfit', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${formatNumber(context.raw)} steps`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Outfit' },
            callback: function (value) { return formatNumber(value); }
          }
        }
      }
    }
  });
}

// ----------------------------------------------------
// 6. Form Submit & CRUD Modals Handler
// ----------------------------------------------------

// 6.1 Daily Logs CRUD
window.openAddLogModal = function () {
  document.getElementById('log-dialog-title-text').textContent = 'Log Daily Health Stats';
  document.getElementById('log-id').value = '';
  document.getElementById('log-date').value = new Date().toLocaleDateString('en-CA');
  document.getElementById('log-steps').value = '';
  document.getElementById('log-water').value = '';
  document.getElementById('log-sleep').value = '';
  document.getElementById('log-mood').value = '';
  document.getElementById('log-consumed').value = '';
  document.getElementById('log-burned').value = '';
  document.getElementById('log-weight').value = '';
  document.getElementById('log-notes').value = '';

  document.getElementById('log-dialog').showModal();
};

window.openEditLogModal = function (id) {
  const log = state.logs.find(l => l.id === id);
  if (!log) return;

  document.getElementById('log-dialog-title-text').textContent = 'Edit Daily Health Stats';
  document.getElementById('log-id').value = log.id;
  document.getElementById('log-date').value = log.date;
  document.getElementById('log-steps').value = log.steps || '';
  document.getElementById('log-water').value = log.water_intake || '';
  document.getElementById('log-sleep').value = log.sleep_duration || '';
  document.getElementById('log-mood').value = log.mood || '';
  document.getElementById('log-consumed').value = log.calories_consumed || '';
  document.getElementById('log-burned').value = log.calories_burned || '';
  document.getElementById('log-weight').value = log.weight || '';
  document.getElementById('log-notes').value = log.notes || '';

  document.getElementById('log-dialog').showModal();
};

async function handleLogSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('log-id').value;
  const date = document.getElementById('log-date').value;
  const steps = parseInt(document.getElementById('log-steps').value) || 0;
  const water_intake = parseInt(document.getElementById('log-water').value) || 0;
  const sleep_duration = parseFloat(document.getElementById('log-sleep').value) || 0;
  const mood = document.getElementById('log-mood').value;
  const calories_consumed = parseInt(document.getElementById('log-consumed').value) || 0;
  const calories_burned = parseInt(document.getElementById('log-burned').value) || 0;
  const weight = parseFloat(document.getElementById('log-weight').value) || null;
  const notes = document.getElementById('log-notes').value.trim();

  if (!date) {
    showToast('Date field is required.', 'error');
    return;
  }

  // Pre-emption check: daily logs table has a UNIQUE constraint on date field!
  // If user changes date to one that already exists, we must block or merge!
  const duplicateLog = state.logs.find(l => l.date === date && l.id !== id);
  if (duplicateLog) {
    showToast(`A health log already exists for date ${formatDateStr(date)}. Please edit the existing entry.`, 'error');
    return;
  }

  const logData = {
    date,
    steps,
    water_intake,
    sleep_duration,
    mood,
    calories_consumed,
    calories_burned,
    weight,
    notes
  };

  updateSyncUI('syncing', 'Saving Log...');

  try {
    if (state.isSupabaseConnected) {
      if (id) {
        const { error } = await supabaseClient
          .from('health_logs')
          .update(logData)
          .eq('id', id);
        if (error) throw error;
        showToast('Daily stats updated successfully.', 'success');
      } else {
        const { error } = await supabaseClient
          .from('health_logs')
          .insert([logData]);
        if (error) throw error;
        showToast('Daily stats logged successfully.', 'success');
      }
    } else {
      // Local Sandbox execution
      if (id) {
        const idx = state.logs.findIndex(l => l.id === id);
        if (idx !== -1) {
          state.logs[idx] = { ...state.logs[idx], ...logData };
          showToast('Daily stats updated locally.', 'success');
        }
      } else {
        const localLog = {
          id: 'local_log_' + Date.now(),
          created_at: new Date().toISOString(),
          ...logData
        };
        state.logs.unshift(localLog);
        showToast('Daily stats logged locally.', 'success');
      }
      saveToLocalStorageOnly();
    }

    document.getElementById('log-dialog').close();
    await loadData();
  } catch (err) {
    console.error('Error saving daily log:', err);
    showToast('Failed to save log: ' + err.message, 'error');
  }
}

window.deleteLogItem = async function(id) {
  if (!confirm('Are you sure you want to delete this daily health log?')) return;
  updateSyncUI('syncing', 'Deleting Log...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('health_logs')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Daily log deleted successfully.', 'success');
    } else {
      state.logs = state.logs.filter(l => l.id !== id);
      saveToLocalStorageOnly();
      showToast('Daily log deleted locally.', 'success');
    }
    await loadData();
  } catch (err) {
    console.error('Error deleting daily log:', err);
    showToast('Failed to delete daily log: ' + err.message, 'error');
  }
};

// 6.2 Vital Readings CRUD
window.openAddVitalModal = function() {
  document.getElementById('vital-id').value = '';
  document.getElementById('v-name').value = '';
  document.getElementById('v-category').value = 'heart_rate';
  document.getElementById('v-value').value = '';
  document.getElementById('btn-save-vital').textContent = 'Save Reading';

  document.getElementById('vital-dialog').showModal();
};

async function handleVitalSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('v-name').value.trim();
  const category = document.getElementById('v-category').value;
  const value = parseFloat(document.getElementById('v-value').value);

  if (!name || !category || isNaN(value) || value < 0) {
    showToast('Please enter reading details correctly.', 'error');
    return;
  }

  const vitalData = {
    name,
    category,
    value
  };

  updateSyncUI('syncing', 'Saving Vital Reading...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('health_vitals')
        .insert([vitalData]);
      if (error) throw error;
      showToast('Biometric vital reading logged successfully.', 'success');
    } else {
      const newVital = {
        id: 'local_vit_' + Date.now(),
        created_at: new Date().toISOString(),
        ...vitalData
      };
      state.vitals.unshift(newVital);
      saveToLocalStorageOnly();
      showToast('Biometric reading logged locally.', 'success');
    }

    document.getElementById('vital-dialog').close();
    await loadData();
  } catch (err) {
    console.error('Error saving vital reading:', err);
    showToast('Failed to save vital reading: ' + err.message, 'error');
  }
}

window.deleteVitalItem = async function(id) {
  if (!confirm('Are you sure you want to delete this vital reading?')) return;
  updateSyncUI('syncing', 'Deleting Vital...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('health_vitals')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Vital reading deleted from database.', 'success');
    } else {
      state.vitals = state.vitals.filter(v => v.id !== id);
      saveToLocalStorageOnly();
      showToast('Vital reading deleted locally.', 'success');
    }
    await loadData();
  } catch (err) {
    console.error('Error deleting vital:', err);
    showToast('Failed to delete vital reading: ' + err.message, 'error');
  }
};

// 6.3 Target Goals configuration Modal
window.openGoalsModal = function() {
  const container = document.getElementById('goals-inputs-container');
  container.innerHTML = '';

  Object.entries(GOAL_CONFIG).forEach(([metricId, config]) => {
    const existing = state.goals.find(g => g.metric === metricId);
    const value = existing ? parseFloat(existing.target_value) : '';

    const row = document.createElement('div');
    row.className = 'form-group form-row';
    row.style.alignItems = 'center';
    row.style.marginBottom = '0.75rem';

    row.innerHTML = `
      <label style="margin-bottom: 0; display: flex; align-items: center; gap: 0.5rem;">
        ${getIconHTML(config.icon)} ${config.name} (${config.unit})
      </label>
      <input type="number" step="any" min="0" 
             name="goal-${metricId}" 
             placeholder="e.g. ${metricId === 'steps' ? '10000' : '0'}" 
             value="${value}" 
             class="form-control">
    `;
    container.appendChild(row);
  });

  document.getElementById('goals-dialog').showModal();
};

async function handleGoalsSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const updatedGoals = [];

  Object.keys(GOAL_CONFIG).forEach(metricId => {
    const val = formData.get(`goal-${metricId}`);
    if (val !== null && val !== '') {
      const target = parseFloat(val);
      if (!isNaN(target) && target >= 0) {
        updatedGoals.push({
          metric: metricId,
          target_value: target
        });
      }
    }
  });

  updateSyncUI('syncing', 'Saving Goals...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('health_goals')
        .upsert(updatedGoals, { onConflict: 'metric' });
      if (error) throw error;
      showToast('Daily health targets saved to database.', 'success');
    } else {
      state.goals = updatedGoals;
      saveToLocalStorageOnly();
      showToast('Daily health targets saved locally.', 'success');
    }

    document.getElementById('goals-dialog').close();
    await loadData();
  } catch (err) {
    console.error('Error saving goals:', err);
    showToast('Failed to save goals: ' + err.message, 'error');
  }
}

// 6.4 Sync Settings configuration
window.openSetupModal = function() {
  document.getElementById('setup-url').value = localStorage.getItem('health_supabase_url') || '';
  document.getElementById('setup-key').value = localStorage.getItem('health_supabase_key') || '';
  document.getElementById('setup-dialog').showModal();
};

async function handleSetupSubmit(e) {
  e.preventDefault();

  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();

  if (!url) {
    localStorage.removeItem('health_supabase_url');
    localStorage.removeItem('health_supabase_key');
    supabaseClient = null;
    state.isSupabaseConnected = false;
    showToast('Disconnected from Supabase. Sandbox mode activated.', 'info');
  } else {
    localStorage.setItem('health_supabase_url', url);
    if (key) {
      localStorage.setItem('health_supabase_key', key);
    } else {
      localStorage.removeItem('health_supabase_key');
    }
    showToast('Credentials updated. Connecting...', 'info');
  }

  document.getElementById('setup-dialog').close();
  await initDatabaseConnection();
  await loadData();
}

// ----------------------------------------------------
// 7. Filtering & Sorting Handlers
// ----------------------------------------------------
function initFilterListeners() {
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.search = e.target.value;
      state.pagination.currentPage = 1;
      updateUI();
    }, 250);
  });

  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    state.pagination.currentPage = 1;
    updateUI();
  });

  document.getElementById('filter-sort').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    state.pagination.currentPage = 1;
    updateUI();
  });

  document.getElementById('prev-btn').addEventListener('click', () => {
    if (state.pagination.currentPage > 1) {
      state.pagination.currentPage--;
      renderLogsTable();
    }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    const totalItems = state.logs.length;
    const totalPages = Math.ceil(totalItems / state.pagination.itemsPerPage);
    if (state.pagination.currentPage < totalPages) {
      state.pagination.currentPage++;
      renderLogsTable();
    }
  });
}

// ----------------------------------------------------
// 8. Onboarding Wizard Controls
// ----------------------------------------------------
window.nextOnboardingStep = async function (stepNum) {
  if (stepNum === 2) {
    const url = document.getElementById('onboard-url').value.trim();
    const key = document.getElementById('onboard-key').value.trim();

    if (url) {
      localStorage.setItem('health_supabase_url', url);
      if (key) {
        localStorage.setItem('health_supabase_key', key);
      }
      showToast('Supabase settings pre-configured. Attempting connection...', 'info');
      await initDatabaseConnection();
    } else {
      localStorage.removeItem('health_supabase_url');
      localStorage.removeItem('health_supabase_key');
      state.isSupabaseConnected = false;
      updateSyncUI('disconnected', 'Sandbox Mode');
    }
  }

  // Toggle wizard contents
  for (let i = 1; i <= 3; i++) {
    const content = document.getElementById(`onboard-step-${i}-content`);
    const dot = document.getElementById(`dot-step-${i}`);
    
    if (i === stepNum) {
      content.classList.add('active');
      dot.classList.add('active');
    } else {
      content.classList.remove('active');
      dot.classList.remove('active');
    }

    if (i < stepNum) {
      dot.classList.add('completed');
    } else {
      dot.classList.remove('completed');
    }
  }
};

window.skipOnboardingDatabase = function () {
  localStorage.removeItem('health_supabase_url');
  localStorage.removeItem('health_supabase_key');
  state.isSupabaseConnected = false;
  updateSyncUI('disconnected', 'Sandbox Mode');
  nextOnboardingStep(2);
};

window.submitOnboarding = async function () {
  // Collect Step 2: Biometrics measurements
  const weightVal = parseFloat(document.getElementById('onboard-weight').value) || 70.0;
  const hrVal = parseFloat(document.getElementById('onboard-hr').value) || 72.0;
  const sysVal = parseFloat(document.getElementById('onboard-sys').value) || 120.0;
  const diaVal = parseFloat(document.getElementById('onboard-dia').value) || 80.0;
  const sugarVal = parseFloat(document.getElementById('onboard-sugar').value) || 90.0;
  const cholesterolVal = parseFloat(document.getElementById('onboard-cholesterol').value) || 0.0;

  const initialVitals = [];
  initialVitals.push({ name: 'Fasting Blood Sugar', category: 'blood_sugar', value: sugarVal });
  initialVitals.push({ name: 'Systolic Blood Pressure', category: 'blood_pressure_sys', value: sysVal });
  initialVitals.push({ name: 'Diastolic Blood Pressure', category: 'blood_pressure_dia', value: diaVal });
  initialVitals.push({ name: 'Resting Heart Rate', category: 'heart_rate', value: hrVal });
  if (cholesterolVal > 0) {
    initialVitals.push({ name: 'Total Cholesterol', category: 'cholesterol', value: cholesterolVal });
  }

  // Collect Step 3: Target Goals
  const targetSteps = parseInt(document.getElementById('onboard-goal-steps').value) || 10000;
  const targetWater = parseInt(document.getElementById('onboard-goal-water').value) || 3000;
  const targetSleep = parseFloat(document.getElementById('onboard-goal-sleep').value) || 8.0;
  const targetWeight = parseFloat(document.getElementById('onboard-goal-weight').value) || 70.0;
  const targetConsumed = parseInt(document.getElementById('onboard-goal-consumed').value) || 2000;
  const targetBurned = parseInt(document.getElementById('onboard-goal-burned').value) || 500;

  const initialGoals = [
    { metric: 'steps', target_value: targetSteps },
    { metric: 'water_intake', target_value: targetWater },
    { metric: 'sleep_duration', target_value: targetSleep },
    { metric: 'weight', target_value: targetWeight },
    { metric: 'calories_consumed', target_value: targetConsumed },
    { metric: 'calories_burned', target_value: targetBurned }
  ];

  // Log today's initial metrics row
  const todayStr = new Date().toLocaleDateString('en-CA');
  const initialLog = {
    date: todayStr,
    steps: 0,
    water_intake: 0,
    sleep_duration: 0,
    calories_consumed: 0,
    calories_burned: 0,
    weight: weightVal,
    mood: 'normal',
    notes: 'Baseline stats setup completed during onboarding.'
  };

  updateSyncUI('syncing', 'Saving biometrics baseline...');

  try {
    if (state.isSupabaseConnected) {
      // 1. Save goals to database
      const { error: goalErr } = await supabaseClient.from('health_goals').upsert(initialGoals, { onConflict: 'metric' });
      if (goalErr) throw goalErr;

      // 2. Save baseline vitals to database
      const { error: vitalsErr } = await supabaseClient.from('health_vitals').insert(initialVitals);
      if (vitalsErr) throw vitalsErr;

      // 3. Save initial today's log to database
      const { error: logErr } = await supabaseClient.from('health_logs').insert([initialLog]);
      if (logErr) throw logErr;

      showToast('Onboarding metrics saved to Supabase.', 'success');
    } else {
      // Local Sandbox Save
      state.goals = initialGoals;
      state.vitals = initialVitals;
      state.logs = [initialLog];
      saveToLocalStorageOnly();
      showToast('Baseline stats stored locally (Sandbox).', 'success');
    }

    // Mark completed
    localStorage.setItem('health_onboarding_completed', 'true');
    document.getElementById('onboarding-dialog').close();

    await loadData();
  } catch (err) {
    console.error('Error during onboarding setup:', err);
    showToast('Failed to complete onboarding: ' + err.message, 'error');
  }
};

// ----------------------------------------------------
// 9. Helpers & Text Formatters
// ----------------------------------------------------

function getIconHTML(iconName, extraClasses = '') {
  const iconClass = SVG_ICONS[iconName] || 'fa-solid fa-circle-question';
  return `<i class="${iconClass} ${extraClasses}"></i>`;
}

function calculateProgressPercent(val, target) {
  if (!target || target <= 0) return 0;
  return Math.round(Math.min(((val || 0) / target) * 100, 100));
}

function formatNumber(num) {
  return parseInt(num).toLocaleString('en-IN');
}

function formatMetricValue(val, metric) {
  const numericVal = parseFloat(val) || 0;
  if (metric === 'steps') return `${formatNumber(numericVal)} steps`;
  if (metric === 'water_intake') return `${formatNumber(numericVal)} ml`;
  if (metric === 'sleep_duration') return `${numericVal.toFixed(1)} hrs`;
  if (metric === 'calories_consumed') return `${formatNumber(numericVal)} kcal`;
  if (metric === 'calories_burned') return `${formatNumber(numericVal)} kcal`;
  if (metric === 'weight') return `${numericVal.toFixed(1)} kg`;
  return numericVal;
}

function formatDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
  return new Date(dateStr).toLocaleDateString();
}

function formatDateStrShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });
  }
  return new Date(dateStr).toLocaleDateString();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check';
  if (type === 'error') iconName = 'alert';

  toast.innerHTML = `${getIconHTML(iconName)} <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Auto-remove animation trigger
  setTimeout(() => {
    toast.style.animation = 'slide-in-toast 0.3s reverse forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
