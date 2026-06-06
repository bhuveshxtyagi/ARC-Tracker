// Trackers Unified Portal - Core Logic & Summary Dashboard

// Default Supabase Connection Details
const DEFAULT_URL = 'https://ajwezyvnkbuxmkgqpcjs.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_WnOcdyZp-2dgTz1O5pitzg_dLqK29mj';

// Application State
const state = {
  // Finance Data
  transactions: [],
  assets: [],
  // Health Data
  healthLogs: [],
  healthGoals: [],
  // Skills Data
  skills: [],
  skillsLogs: [],
  skillsMilestones: [],
  // Connection state
  isSupabaseConnected: false
};

// Chart.js references
let assetsChartInstance = null;
let skillsChartInstance = null;

// DOM Load Handler
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupAuth();
  
  // Setup theme toggle listener
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Setup logout listener
  document.getElementById('btn-logout').addEventListener('click', logout);
  
  // If already authenticated, load dashboard
  if (sessionStorage.getItem('tracker_auth_session') === 'true') {
    revealDashboard();
  }
});

// ----------------------------------------------------
// 1. Password Protection & Authentication
// ----------------------------------------------------
function setupAuth() {
  const lockScreen = document.getElementById('lock-screen');
  const passwordInput = document.getElementById('passcode-input');
  const unlockBtn = document.getElementById('unlock-btn');
  const authError = document.getElementById('auth-error');

  const attemptUnlock = () => {
    const entered = passwordInput.value.trim();
    // Default passcodes: Database passcode or standard admin fallback
    if (entered === 'doit@me2A!dreamBIG' || entered === 'admin') {
      sessionStorage.setItem('tracker_auth_session', 'true');
      authError.style.display = 'none';
      passwordInput.value = '';
      revealDashboard();
    } else {
      authError.textContent = 'Incorrect passcode. Please try again.';
      authError.style.display = 'block';
      passwordInput.classList.add('shake');
      setTimeout(() => passwordInput.classList.remove('shake'), 400);
    }
  };

  // Click handler
  unlockBtn.addEventListener('click', attemptUnlock);

  // Keypress handler
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      attemptUnlock();
    }
  });
}

function revealDashboard() {
  const lockScreen = document.getElementById('lock-screen');
  const appContainer = document.getElementById('app-container');

  lockScreen.classList.add('hidden');
  appContainer.classList.add('revealed');

  // Load portal data and initialize graphs
  loadPortalData();
}

function logout() {
  sessionStorage.removeItem('tracker_auth_session');
  window.location.reload();
}

// ----------------------------------------------------
// 2. Cohesive Theme Management
// ----------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const body = document.body;

  if (savedTheme === 'light') {
    body.classList.add('light-theme');
  } else {
    body.classList.remove('light-theme');
  }
}

function toggleTheme() {
  const body = document.body;
  const isLight = body.classList.toggle('light-theme');
  const newTheme = isLight ? 'light' : 'dark';

  // Keep all trackers in sync with the selected theme
  localStorage.setItem('theme', newTheme);
  localStorage.setItem('health_theme', newTheme);
  localStorage.setItem('skills_theme', newTheme);
}

// ----------------------------------------------------
// 3. Consolidated Data Sync (Supabase + local storage Fallback)
// ----------------------------------------------------
async function loadPortalData() {
  // 1. Get database credentials
  const dbUrl = localStorage.getItem('supabase_url') || localStorage.getItem('health_supabase_url') || localStorage.getItem('skills_supabase_url') || DEFAULT_URL;
  const dbKey = localStorage.getItem('supabase_key') || localStorage.getItem('health_supabase_key') || localStorage.getItem('skills_supabase_key') || DEFAULT_PUBLISHABLE_KEY;

  let supabaseClient = null;
  if (typeof supabase !== 'undefined' && dbUrl && dbKey) {
    try {
      supabaseClient = supabase.createClient(dbUrl, dbKey);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  }

  // 2. Fetch Finance Data
  if (supabaseClient) {
    try {
      const { data: txs, error: txError } = await supabaseClient.from('transactions').select('*');
      if (txError) throw txError;
      state.transactions = txs || [];
      
      const { data: asts, error: astError } = await supabaseClient.from('assets').select('*');
      if (astError) throw astError;
      state.assets = asts || [];
      
      state.isSupabaseConnected = true;
    } catch (e) {
      console.warn('Supabase Finance fetch failed, using local storage:', e);
      loadFinanceLocal();
    }
  } else {
    loadFinanceLocal();
  }

  // 3. Fetch Health Data
  if (supabaseClient) {
    try {
      const { data: hLogs, error: hlError } = await supabaseClient.from('health_logs').select('*');
      if (hlError) throw hlError;
      state.healthLogs = hLogs || [];

      const { data: hGoals, error: hgError } = await supabaseClient.from('health_goals').select('*');
      if (hgError) throw hgError;
      state.healthGoals = hGoals || [];
    } catch (e) {
      console.warn('Supabase Health fetch failed, using local storage:', e);
      loadHealthLocal();
    }
  } else {
    loadHealthLocal();
  }

  // 4. Fetch Skills Data
  if (supabaseClient) {
    try {
      const { data: sks, error: skError } = await supabaseClient.from('skills').select('*');
      if (skError) throw skError;
      state.skills = sks || [];

      const { data: sLogs, error: slError } = await supabaseClient.from('skill_logs').select('*');
      if (slError) throw slError;
      state.skillsLogs = sLogs || [];

      const { data: sMs, error: smError } = await supabaseClient.from('skill_milestones').select('*');
      if (smError) throw smError;
      state.skillsMilestones = sMs || [];
    } catch (e) {
      console.warn('Supabase Skills fetch failed, using local storage:', e);
      loadSkillsLocal();
    }
  } else {
    loadSkillsLocal();
  }

  // Update DOM components with consolidated summary data
  updateDashboardKPIs();
  
  // Render charts
  renderAggregateCharts();
}

function loadFinanceLocal() {
  const txs = localStorage.getItem('local_transactions');
  state.transactions = txs ? JSON.parse(txs) : [];

  const asts = localStorage.getItem('local_assets');
  state.assets = asts ? JSON.parse(asts) : [];
}

function loadHealthLocal() {
  const hLogs = localStorage.getItem('local_health_logs');
  state.healthLogs = hLogs ? JSON.parse(hLogs) : [];

  const hGoals = localStorage.getItem('local_health_goals');
  state.healthGoals = hGoals ? JSON.parse(hGoals) : [];
}

function loadSkillsLocal() {
  const sks = localStorage.getItem('local_skills');
  state.skills = sks ? JSON.parse(sks) : getDemoSkills();

  const sLogs = localStorage.getItem('local_skill_logs');
  state.skillsLogs = sLogs ? JSON.parse(sLogs) : [];

  const sMs = localStorage.getItem('local_skill_milestones');
  state.skillsMilestones = sMs ? JSON.parse(sMs) : [];
}

function getDemoSkills() {
  return [
    { name: 'Chess', level: 1, hours_spent: 0, target_hours: 20 },
    { name: 'Coding', level: 1, hours_spent: 0, target_hours: 20 },
    { name: 'Communication', level: 1, hours_spent: 0, target_hours: 20 },
    { name: 'Reading', level: 1, hours_spent: 0, target_hours: 20 },
    { name: 'Video Editing', level: 1, hours_spent: 0, target_hours: 20 },
    { name: 'Singing', level: 1, hours_spent: 0, target_hours: 20 }
  ];
}

// ----------------------------------------------------
// 4. Calculations & KPI Updates
// ----------------------------------------------------
function updateDashboardKPIs() {
  // --- 4.1 Finance Calculations ---
  let allTimeBalance = 0;
  state.transactions.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      allTimeBalance += val;
    } else {
      allTimeBalance -= val;
    }
  });

  let totalAssets = 0;
  state.assets.forEach(a => {
    totalAssets += parseFloat(a.value) || 0;
  });

  const netWorth = totalAssets + allTimeBalance;

  // Format currency helper (Rupees)
  const formatRupees = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  document.getElementById('fin-networth').textContent = formatRupees(netWorth);
  document.getElementById('fin-assets').textContent = formatRupees(totalAssets);
  document.getElementById('fin-balance').textContent = formatRupees(allTimeBalance);

  // --- 4.2 Health Calculations ---
  // Find latest log (usually today's) or use default zero values
  const todayStr = getYYYYMMDD();
  let todayLog = state.healthLogs.find(l => l.date === todayStr);
  
  if (!todayLog && state.healthLogs.length > 0) {
    // Fall back to the most recent log in sorted date order
    const sorted = [...state.healthLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    todayLog = sorted[0];
  }

  const stepsVal = todayLog ? (parseInt(todayLog.steps) || 0) : 0;
  const waterVal = todayLog ? (parseInt(todayLog.water_intake) || 0) : 0;
  const calVal = todayLog ? (parseInt(todayLog.calories_consumed) || 0) : 0;

  // Find active goals
  const stepGoal = state.healthGoals.find(g => g.metric === 'steps')?.target_value || 10000;
  const waterGoal = state.healthGoals.find(g => g.metric === 'water_intake')?.target_value || 3000;
  const calGoal = state.healthGoals.find(g => g.metric === 'calories_consumed')?.target_value || 2500;

  document.getElementById('health-steps').textContent = `${stepsVal.toLocaleString()} / ${parseInt(stepGoal).toLocaleString()}`;
  document.getElementById('health-water').textContent = `${waterVal} ml / ${waterGoal} ml`;
  document.getElementById('health-calories').textContent = `${calVal} kcal / ${calGoal} kcal`;

  // --- 4.3 Skills Calculations ---
  let totalSkillsHours = 0;
  let highestSkill = 'None';
  let maxLevel = 0;

  state.skills.forEach(s => {
    const hrs = parseFloat(s.hours_spent) || 0;
    totalSkillsHours += hrs;
    const lvl = parseInt(s.level) || 1;
    if (lvl > maxLevel) {
      maxLevel = lvl;
      highestSkill = s.name;
    }
  });

  const pendingMilestones = state.skillsMilestones.filter(m => !m.completed).length;

  document.getElementById('skills-hours').textContent = `${totalSkillsHours.toFixed(1)} hrs`;
  document.getElementById('skills-highest').textContent = highestSkill === 'None' ? '0' : `${highestSkill} (Lvl ${maxLevel})`;
  document.getElementById('skills-milestones').textContent = `${pendingMilestones} active`;

  // --- 4.4 Render Skills list inside list container ---
  const skillsListEl = document.getElementById('skills-mini-list');
  skillsListEl.innerHTML = '';
  
  const skillIcons = {
    'Chess': 'fa-chess-knight',
    'Coding': 'fa-code',
    'Communication': 'fa-comments',
    'Reading': 'fa-book-open',
    'Video Editing': 'fa-film',
    'Singing': 'fa-music'
  };

  state.skills.forEach(s => {
    const hours = parseFloat(s.hours_spent) || 0;
    const progressPercent = Math.min(((hours % s.target_hours) / s.target_hours) * 100, 100);
    const icon = skillIcons[s.name] || 'fa-graduation-cap';
    
    const div = document.createElement('div');
    div.className = 'mini-list-item';
    div.innerHTML = `
      <div class="item-left">
        <div class="item-icon active-skill">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <div class="item-title">${s.name}</div>
          <div class="item-meta">Lvl ${s.level} • Next level progress</div>
        </div>
      </div>
      <div class="item-right">
        <div class="item-value">${hours.toFixed(1)} hrs</div>
        <div class="item-meta">${Math.round(progressPercent)}%</div>
      </div>
    `;
    skillsListEl.appendChild(div);
  });

  // Database Connection Sync status indicator
  const syncStatusDot = document.getElementById('sync-status-dot');
  const syncStatusText = document.getElementById('sync-status-text');
  
  if (state.isSupabaseConnected) {
    syncStatusDot.className = 'status-dot connected';
    syncStatusText.textContent = 'Cloud Connected';
  } else {
    syncStatusDot.className = 'status-dot';
    syncStatusText.textContent = 'Sandbox Mode (Local)';
  }
}

// Helper: Formats dates consistently as YYYY-MM-DD
function getYYYYMMDD() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ----------------------------------------------------
// 5. Visual Summary Charts (Chart.js)
// ----------------------------------------------------
function renderAggregateCharts() {
  if (typeof Chart === 'undefined') return;

  // --- 5.1 Asset Allocation Chart ---
  const assetCtx = document.getElementById('assetsAllocationChart');
  if (assetCtx) {
    // Aggregate asset values by category
    const categoriesSum = {};
    state.assets.forEach(a => {
      const cat = a.category || 'others';
      categoriesSum[cat] = (categoriesSum[cat] || 0) + (parseFloat(a.value) || 0);
    });

    const assetLabels = Object.keys(categoriesSum).map(c => c.toUpperCase().replace('_', ' '));
    const assetData = Object.values(categoriesSum);

    const assetColors = {
      'CASH': '#22c55e',
      'BANK': '#3b82f6',
      'STOCKS': '#8b5cf6',
      'CRYPTO': '#f59e0b',
      'REAL ESTATE': '#ec4899',
      'MUTUAL FUNDS': '#20b8a6',
      'OTHERS': '#94a3b8'
    };
    const backgroundColors = assetLabels.map(l => assetColors[l] || '#6366f1');

    if (assetsChartInstance) assetsChartInstance.destroy();

    if (assetData.length === 0) {
      // Show empty state inside canvas container
      const container = assetCtx.parentElement;
      container.innerHTML = `
        <div class="empty-placeholder">
          <i class="fa-solid fa-chart-pie"></i>
          <div>No asset data configured yet</div>
        </div>
        <canvas id="assetsAllocationChart" style="display:none;"></canvas>
      `;
    } else {
      // Re-create canvas if replaced by placeholder
      if (assetCtx.style.display === 'none') {
        const parent = assetCtx.parentElement;
        parent.innerHTML = '<canvas id="assetsAllocationChart"></canvas>';
        renderAggregateCharts();
        return;
      }
      
      const isDark = !document.body.classList.contains('light-theme');
      
      assetsChartInstance = new Chart(assetCtx, {
        type: 'doughnut',
        data: {
          labels: assetLabels,
          datasets: [{
            data: assetData,
            backgroundColor: backgroundColors,
            borderColor: isDark ? '#1e293b' : '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: isDark ? '#94a3b8' : '#475569',
                font: { family: 'Outfit', size: 11 }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }

  // --- 5.2 Skills Distribution Horizontal Bar Chart ---
  const skillsCtx = document.getElementById('skillsBarChart');
  if (skillsCtx) {
    const labels = state.skills.map(s => s.name);
    const hours = state.skills.map(s => parseFloat(s.hours_spent) || 0);

    if (skillsChartInstance) skillsChartInstance.destroy();

    const isDark = !document.body.classList.contains('light-theme');

    skillsChartInstance = new Chart(skillsCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours Spent',
          data: hours,
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
          maxBarThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)' },
            ticks: {
              color: isDark ? '#94a3b8' : '#475569',
              font: { family: 'Outfit' }
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: isDark ? '#f8fafc' : '#0f172a',
              font: { family: 'Outfit', weight: 500 }
            }
          }
        }
      }
    });
  }
}
