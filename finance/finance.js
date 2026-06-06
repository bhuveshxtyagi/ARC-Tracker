// FinSight Financial Tracker - Core Logic & Sync Engine v3

// Application State
const state = {
  transactions: [],
  budgets: [],
  assets: [],
  filters: {
    search: '',
    category: 'all',
    type: 'all',
    sortBy: 'newest'
  },
  pagination: {
    currentPage: 1,
    itemsPerPage: 8
  },
  isSupabaseConnected: false
};

// Available Categories with FontAwesome Classes
const CATEGORIES = {
  income: [
    { id: 'payment', name: 'Payment', icon: 'payment' },
    { id: 'investment', name: 'Investment', icon: 'investment' },
    { id: 'others', name: 'Others', icon: 'others' }
  ],
  expense: [
    { id: 'food', name: 'Food & Dining', icon: 'food' },
    { id: 'utilities', name: 'Utilities', icon: 'utilities' },
    { id: 'rent', name: 'Rent & Housing', icon: 'rent' },
    { id: 'transport', name: 'Transport', icon: 'transport' },
    { id: 'shopping', name: 'Shopping', icon: 'shopping' },
    { id: 'entertainment', name: 'Entertainment', icon: 'entertainment' },
    { id: 'others', name: 'Others', icon: 'others' }
  ]
};

// Asset Categories configuration
const ASSET_CATEGORIES = {
  cash: { name: 'Cash', icon: 'cash', color: '#22c55e' },
  bank: { name: 'Bank Account', icon: 'bank', color: '#3b82f6' },
  stocks: { name: 'Equities & Stocks', icon: 'stocks', color: '#8b5cf6' },
  crypto: { name: 'Cryptocurrency', icon: 'crypto', color: '#f59e0b' },
  real_estate: { name: 'Real Estate', icon: 'real_estate', color: '#ec4899' },
  mutual_funds: { name: 'Mutual Funds & Bonds', icon: 'mutual_funds', color: '#20b8a6' },
  others: { name: 'Others', icon: 'others', color: '#94a3b8' }
};

// Global Chart References
let expenseChartInstance = null;
let trendChartInstance = null;
let assetChartInstance = null;

// Supabase Client Reference
let supabaseClient = null;
const DEFAULT_URL = 'https://ajwezyvnkbuxmkgqpcjs.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_WnOcdyZp-2dgTz1O5pitzg_dLqK29mj';

// ----------------------------------------------------
// 1. Initialization & DB Connection
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  initTheme();

  // Set up modal listeners
  initModalListeners();

  // Set up filter change listeners
  initFilterListeners();

  // Check onboarding status
  const onboardingCompleted = localStorage.getItem('onboarding_completed') === 'true';

  if (!onboardingCompleted) {
    // Show onboarding modal
    document.getElementById('onboard-url').value = DEFAULT_URL;
    document.getElementById('onboard-key').value = DEFAULT_PUBLISHABLE_KEY;
    document.getElementById('onboarding-dialog').showModal();
  } else {
    // Initialize Database connection
    await initDatabaseConnection();
    // Load initially
    await loadData();
  }

  // Populate category select options inside modals
  populateCategoryDropdowns();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
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
    localStorage.setItem('theme', isLight ? 'light' : 'dark');

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

// Setup Modals and Fallbacks for Safari/Firefox
function initModalListeners() {
  const dialogs = document.querySelectorAll('dialog');

  dialogs.forEach(dialog => {
    if (dialog.id === 'onboarding-dialog') return; // Do not dismiss onboarding on backdrop click

    // Fallback for browsers without closedby support
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

  // Setup form submission
  document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
  document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
  document.getElementById('asset-form').addEventListener('submit', handleAssetSubmit);
  document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
}

// Database Connection initialization
async function initDatabaseConnection() {
  let url = localStorage.getItem('supabase_url');
  // Default fallback if url is empty
  if (url === null) {
    url = DEFAULT_URL;
    localStorage.setItem('supabase_url', DEFAULT_URL);
  }

  const key = localStorage.getItem('supabase_key') || DEFAULT_PUBLISHABLE_KEY;
  if (localStorage.getItem('supabase_key') === null) {
    localStorage.setItem('supabase_key', DEFAULT_PUBLISHABLE_KEY);
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

    // Schema availability check
    const { error } = await supabaseClient.from('transactions').select('*', { count: 'exact', head: true }).limit(1);
    if (error) throw error;

    updateSyncUI('connected', 'Synced');
    state.isSupabaseConnected = true;
  } catch (err) {
    console.error('Supabase connection error:', err);
    updateSyncUI('error', 'Sync Connection Error');
    state.isSupabaseConnected = false;
    showToast('Could not connect to Supabase. Running in Local Sandbox.', 'error');
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

// Populate Category dropdowns based on transaction type selector
function populateCategoryDropdowns() {
  const typeExpense = document.getElementById('type-expense');
  const typeIncome = document.getElementById('type-income');
  const categorySelect = document.getElementById('t-category');

  const updateCategories = () => {
    const type = typeIncome.checked ? 'income' : 'expense';
    categorySelect.innerHTML = '';

    CATEGORIES[type].forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });
  };

  if (typeExpense && typeIncome) {
    typeExpense.addEventListener('change', updateCategories);
    typeIncome.addEventListener('change', updateCategories);
    updateCategories(); // Trigger initially
  }
}

// ----------------------------------------------------
// 2. Data Retrieval (Supabase / LocalStorage)
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
    // Fetch transactions
    const { data: trans, error: transErr } = await supabaseClient
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (transErr) throw transErr;
    state.transactions = trans || [];

    // Fetch budgets
    const { data: buds, error: budsErr } = await supabaseClient
      .from('budgets')
      .select('*');
    if (budsErr) throw budsErr;
    state.budgets = buds || [];

    // Fetch assets
    const { data: asts, error: astsErr } = await supabaseClient
      .from('assets')
      .select('*')
      .order('name', { ascending: true });
    if (astsErr) throw astsErr;
    state.assets = asts || [];
  } catch (err) {
    console.error('Error fetching data from Supabase:', err);
    showToast('Database error. Falling back to local storage copy.', 'error');
    fetchFromLocalStorage();
  }
}

function fetchFromLocalStorage() {
  const transStr = localStorage.getItem('local_transactions');
  const budsStr = localStorage.getItem('local_budgets');
  const astsStr = localStorage.getItem('local_assets');

  state.transactions = transStr ? JSON.parse(transStr) : getDemoTransactions();
  state.budgets = budsStr ? JSON.parse(budsStr) : getDemoBudgets();
  state.assets = astsStr ? JSON.parse(astsStr) : getDemoAssets();
}

function saveToLocalStorageOnly() {
  localStorage.setItem('local_transactions', JSON.stringify(state.transactions));
  localStorage.setItem('local_budgets', JSON.stringify(state.budgets));
  localStorage.setItem('local_assets', JSON.stringify(state.assets));
}

// ----------------------------------------------------
// 3. UI Update Engine & Rendering
// ----------------------------------------------------
function updateUI() {
  renderDashboardKPIs();
  renderBudgetsSection();
  renderAssetHoldingsSection();
  renderExpenseAnalyticsSection();
  renderTransactionsTable();
  renderCharts();
}

function renderDashboardKPIs() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Filter current month transactions
  const monthlyTrans = state.transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
  });

  // Monthly stats
  let totalIncome = 0;
  let totalExpense = 0;
  monthlyTrans.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += val;
    } else {
      totalExpense += val;
    }
  });

  // Calculate Net Balance (all time)
  let allTimeBalance = 0;
  state.transactions.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      allTimeBalance += val;
    } else {
      allTimeBalance -= val;
    }
  });

  // Calculate Asset worth (all holdings)
  let totalAssets = 0;
  state.assets.forEach(a => {
    totalAssets += parseFloat(a.value) || 0;
  });

  // Net worth is Assets + Ledger Balance
  const netWorth = totalAssets + allTimeBalance;

  // Monthly Savings rate = (Income - Expense) / Income
  let savingsRate = 0;
  if (totalIncome > 0) {
    savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
  }

  // Update dashboard elements
  document.getElementById('kpi-networth').textContent = formatCurrency(netWorth);
  document.getElementById('kpi-balance').textContent = formatCurrency(allTimeBalance);
  document.getElementById('kpi-income').textContent = formatCurrency(totalIncome);
  document.getElementById('kpi-expense').textContent = formatCurrency(totalExpense);
  document.getElementById('kpi-savings').textContent = savingsRate > 0 ? `${savingsRate.toFixed(1)}%` : '0.0%';

  // Set savings rate indicator style
  const savingsMeta = document.getElementById('kpi-savings-meta');
  if (savingsMeta) {
    if (savingsRate >= 20) {
      savingsMeta.className = 'card-meta meta-positive';
      savingsMeta.innerHTML = 'Healthy rate (&ge; 20% target)';
    } else if (savingsRate > 0) {
      savingsMeta.className = 'card-meta';
      savingsMeta.innerHTML = 'Low savings rate (&ge; 20% target)';
    } else {
      savingsMeta.className = 'card-meta meta-negative';
      savingsMeta.innerHTML = 'Deficit this month!';
    }
  }
}

function renderBudgetsSection() {
  const budgetList = document.getElementById('budget-list');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  budgetList.innerHTML = '';

  if (state.budgets.length === 0) {
    budgetList.innerHTML = `
      <div class="budget-empty">
        ${getIconHTML('trend')}
        <p>No budgets configured. Set limits to monitor spending.</p>
        <button class="btn btn-secondary btn-sm" onclick="openBudgetModal()" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.85rem;">Set Budgets</button>
      </div>
    `;
    return;
  }

  // Calculate current month category spending
  const categoryExpenses = {};
  state.transactions
    .filter(t => {
      const tDate = new Date(t.date);
      return t.type === 'expense' && tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
    })
    .forEach(t => {
      categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + parseFloat(t.amount);
    });

  state.budgets.forEach(b => {
    const limit = parseFloat(b.limit_amount) || 0;
    if (limit <= 0) return;

    const spent = categoryExpenses[b.category] || 0;
    const percentage = Math.min((spent / limit) * 100, 120);
    const catConfig = CATEGORIES.expense.find(c => c.id === b.category) || { name: b.category, icon: 'others' };

    let barClass = 'normal';
    if (spent >= limit) {
      barClass = 'danger';
    } else if (spent >= limit * 0.8) {
      barClass = 'warning';
    }

    const itemHtml = `
      <div class="budget-item">
        <div class="budget-item-info">
          <span class="budget-category">
            ${getIconHTML(catConfig.icon)}
            ${catConfig.name}
          </span>
          <span class="budget-amount">
            ${formatCurrency(spent)} <span>/ ${formatCurrency(limit)}</span>
          </span>
        </div>
        <div class="budget-bar-bg">
          <div class="budget-bar-fill ${barClass}" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
    budgetList.insertAdjacentHTML('beforeend', itemHtml);
  });
}

function renderAssetHoldingsSection() {
  const assetList = document.getElementById('assets-list');
  assetList.innerHTML = '';

  if (state.assets.length === 0) {
    assetList.innerHTML = `
      <div class="budget-empty">
        ${getIconHTML('bank')}
        <p>No holdings added. Add diversified assets (Cash, Bank, Stocks) to track Net Worth allocations.</p>
        <button class="btn btn-secondary btn-sm" onclick="openAssetModal()" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.85rem;">Add Assets</button>
      </div>
    `;
    return;
  }

  // Aggregate assets by category
  const aggregated = {};
  state.assets.forEach(a => {
    aggregated[a.category] = (aggregated[a.category] || 0) + parseFloat(a.value);
  });

  Object.entries(aggregated).forEach(([catId, value]) => {
    const config = ASSET_CATEGORIES[catId] || { name: catId, icon: 'others' };

    const itemHtml = `
      <div class="asset-item-row ${catId}">
        <div class="asset-item-info">
          <div class="asset-item-icon">
            ${getIconHTML(config.icon)}
          </div>
          <div class="asset-item-text">
            <span class="asset-item-name">${config.name}</span>
            <span class="asset-item-category">Holdings diversification</span>
          </div>
        </div>
        <span class="asset-item-value">${formatCurrency(value)}</span>
      </div>
    `;
    assetList.insertAdjacentHTML('beforeend', itemHtml);
  });
}

function renderExpenseAnalyticsSection() {
  const topSpentList = document.getElementById('top-spent-list');
  const peakContainer = document.getElementById('peak-transaction-container');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // 1. Calculate Monthly Expense category totals
  const monthlyExpenses = state.transactions.filter(t => {
    const tDate = new Date(t.date);
    return t.type === 'expense' && tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
  });

  const categorySpent = {};
  let totalSpent = 0;

  monthlyExpenses.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    categorySpent[t.category] = (categorySpent[t.category] || 0) + val;
    totalSpent += val;
  });

  // Sort categories by spending
  const sortedCategories = Object.entries(categorySpent)
    .sort((a, b) => b[1] - a[1]);

  if (topSpentList) {
    topSpentList.innerHTML = '';
    if (sortedCategories.length === 0) {
      topSpentList.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-muted); padding: 0.5rem 0;">No expenses logged this month.</div>`;
    } else {
      // Show Top 3 categories
      sortedCategories.slice(0, 3).forEach(([catId, amount]) => {
        const catConfig = CATEGORIES.expense.find(c => c.id === catId) || { name: catId, icon: 'others' };
        const percent = totalSpent > 0 ? ((amount / totalSpent) * 100) : 0;

        const itemHtml = `
          <div class="top-spent-item">
            <span class="top-spent-cat">
              ${getIconHTML(catConfig.icon)}
              ${catConfig.name}
            </span>
            <div class="top-spent-bar-wrapper">
              <div class="top-spent-bar-fill" style="width: ${percent}%"></div>
            </div>
            <span class="top-spent-val">
              ${formatCurrency(amount)} <span>(${percent.toFixed(0)}%)</span>
            </span>
          </div>
        `;
        topSpentList.insertAdjacentHTML('beforeend', itemHtml);
      });
    }
  }

  // 2. Find Largest Transaction (peak) of the month
  let peakTransaction = null;
  monthlyExpenses.forEach(t => {
    if (!peakTransaction || parseFloat(t.amount) > parseFloat(peakTransaction.amount)) {
      peakTransaction = t;
    }
  });

  if (peakContainer) {
    peakContainer.innerHTML = '';
    if (!peakTransaction) {
      peakContainer.innerHTML = `
        <div class="peak-transaction-box" style="justify-content: center; border-style: solid; padding: 0.75rem;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">No transactions logged yet.</span>
        </div>
      `;
    } else {
      const catConfig = CATEGORIES.expense.find(c => c.id === peakTransaction.category) || { name: peakTransaction.category, icon: 'others' };
      peakContainer.innerHTML = `
        <div class="peak-transaction-box">
          <div class="peak-icon-wrapper">
            ${getIconHTML(catConfig.icon)}
          </div>
          <div class="peak-details">
            <span class="peak-title">${escapeHtml(peakTransaction.description)}</span>
            <span class="peak-meta">${catConfig.name} &bull; ${formatDate(peakTransaction.date)}</span>
          </div>
          <span class="peak-amount">${formatCurrency(peakTransaction.amount)}</span>
        </div>
      `;
    }
  }
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transactions-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // 1. Search Filtering
  let filtered = state.transactions.filter(t => {
    const matchSearch = t.description.toLowerCase().includes(state.filters.search.toLowerCase()) ||
      t.category.toLowerCase().includes(state.filters.search.toLowerCase());
    const matchCategory = state.filters.category === 'all' || t.category === state.filters.category;
    const matchType = state.filters.type === 'all' || t.type === state.filters.type;
    return matchSearch && matchCategory && matchType;
  });

  // 2. Sorting
  filtered.sort((a, b) => {
    if (state.filters.sortBy === 'newest') return new Date(b.date) - new Date(a.date);
    if (state.filters.sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
    if (state.filters.sortBy === 'highest') return parseFloat(b.amount) - parseFloat(a.amount);
    if (state.filters.sortBy === 'lowest') return parseFloat(a.amount) - parseFloat(b.amount);
    return 0;
  });

  // 3. Pagination Setup
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
    ? `Showing ${startIndex + 1}–${endIndex} of ${totalItems} transactions`
    : 'No transactions';

  document.getElementById('prev-btn').disabled = state.pagination.currentPage === 1;
  document.getElementById('next-btn').disabled = state.pagination.currentPage === totalPages;

  if (paginated.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            ${getIconHTML('search')}
            <p>No matching transactions found. Try updating search term or adding a transaction.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Render Rows
  paginated.forEach(t => {
    const catList = t.type === 'income' ? CATEGORIES.income : CATEGORIES.expense;
    const catConfig = catList.find(c => c.id === t.category) || { name: t.category, icon: 'others' };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-date">${formatDate(t.date)}</td>
      <td class="td-desc">${escapeHtml(t.description)}</td>
      <td>
        <span class="badge-category ${t.category}">
          ${getIconHTML(catConfig.icon)}
          ${catConfig.name}
        </span>
      </td>
      <td class="td-amount ${t.type === 'income' ? 'amount-income' : 'amount-expense'}">
        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
      </td>
      <td class="td-actions">
        <button class="action-btn" onclick="openEditTransactionModal('${t.id}')" title="Edit">
          ${getIconHTML('edit')}
        </button>
        <button class="action-btn delete" onclick="deleteTransactionItem('${t.id}')" title="Delete">
          ${getIconHTML('trash')}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// 4. Data Visualization (Chart.js)
// ----------------------------------------------------
function renderCharts() {
  const canvasExpense = document.getElementById('expenseChart');
  const canvasTrend = document.getElementById('trendChart');
  const canvasAsset = document.getElementById('assetChart');

  if (!canvasExpense || !canvasTrend || !canvasAsset) return;

  const isLightTheme = document.body.classList.contains('light-theme');
  const textColor = isLightTheme ? '#475569' : '#94a3b8';
  const gridColor = isLightTheme ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.03)';

  if (expenseChartInstance) expenseChartInstance.destroy();
  if (trendChartInstance) trendChartInstance.destroy();
  if (assetChartInstance) assetChartInstance.destroy();

  const themeColors = {
    food: '#f59e0b',
    entertainment: '#8b5cf6',
    utilities: '#3b82f6',
    rent: '#ec4899',
    transport: '#06b6d4',
    shopping: '#f43f5e',
    others: '#94a3b8',
    payment: '#10b981',
    investment: '#10b981'
  };

  // 1. Expenses Breakdown (Doughnut)
  const expenseSummary = {};
  let totalEx = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let targetTransactions = state.transactions.filter(t => {
    const tDate = new Date(t.date);
    return t.type === 'expense' && tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
  });

  if (targetTransactions.length === 0) {
    targetTransactions = state.transactions.filter(t => t.type === 'expense');
  }

  targetTransactions.forEach(t => {
    const amount = parseFloat(t.amount) || 0;
    expenseSummary[t.category] = (expenseSummary[t.category] || 0) + amount;
    totalEx += amount;
  });

  const doughnutLabels = [];
  const doughnutData = [];
  const doughnutColors = [];

  Object.entries(expenseSummary).forEach(([catId, amount]) => {
    const catConfig = CATEGORIES.expense.find(c => c.id === catId) || { name: catId };
    doughnutLabels.push(catConfig.name);
    doughnutData.push(amount);
    doughnutColors.push(themeColors[catId] || '#64748b');
  });

  if (doughnutData.length === 0) {
    doughnutLabels.push('No Expenses');
    doughnutData.push(1);
    doughnutColors.push(isLightTheme ? '#e2e8f0' : '#1e293b');
  }

  expenseChartInstance = new Chart(canvasExpense, {
    type: 'doughnut',
    data: {
      labels: doughnutLabels,
      datasets: [{
        data: doughnutData,
        backgroundColor: doughnutColors,
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
              if (totalEx === 0) return 'No expenses logged';
              const value = context.raw;
              const percent = ((value / totalEx) * 100).toFixed(1);
              return ` ${context.label}: ₹${parseFloat(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${percent}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });

  // 2. Income vs Expense Trend (Bar)
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    last6Months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleString('default', { month: 'short' }),
      income: 0,
      expense: 0
    });
  }

  state.transactions.forEach(t => {
    const tDate = new Date(t.date);
    const tYear = tDate.getFullYear();
    const tMonth = tDate.getMonth();
    const tAmount = parseFloat(t.amount) || 0;

    const monthObj = last6Months.find(m => m.year === tYear && m.month === tMonth);
    if (monthObj) {
      if (t.type === 'income') {
        monthObj.income += tAmount;
      } else {
        monthObj.expense += tAmount;
      }
    }
  });

  const barLabels = last6Months.map(m => m.label);
  const incomeData = last6Months.map(m => m.income);
  const expenseData = last6Months.map(m => m.expense);

  trendChartInstance = new Chart(canvasTrend, {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: isLightTheme ? 'rgba(16, 185, 129, 0.85)' : 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Expense',
          data: expenseData,
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
          labels: {
            color: textColor,
            font: { family: 'Outfit', size: 12 }
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
            callback: function (value) {
              return '₹' + value.toLocaleString('en-IN');
            }
          }
        }
      }
    }
  });

  // 3. Asset Allocation Breakdown (Pie)
  const assetSummary = {};
  let totalAssetWorth = 0;

  state.assets.forEach(a => {
    const val = parseFloat(a.value) || 0;
    assetSummary[a.category] = (assetSummary[a.category] || 0) + val;
    totalAssetWorth += val;
  });

  const pieLabels = [];
  const pieData = [];
  const pieColors = [];

  Object.entries(assetSummary).forEach(([catId, val]) => {
    const config = ASSET_CATEGORIES[catId] || { name: catId, color: '#94a3b8' };
    pieLabels.push(config.name);
    pieData.push(val);
    pieColors.push(config.color);
  });

  if (pieData.length === 0) {
    pieLabels.push('No Assets');
    pieData.push(1);
    pieColors.push(isLightTheme ? '#e2e8f0' : '#1e293b');
  }

  assetChartInstance = new Chart(canvasAsset, {
    type: 'pie',
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
              if (totalAssetWorth === 0) return 'No assets registered';
              const value = context.raw;
              const percent = ((value / totalAssetWorth) * 100).toFixed(1);
              return ` ${context.label}: ₹${parseFloat(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${percent}%)`;
            }
          }
        }
      }
    }
  });
}

// ----------------------------------------------------
// 5. CRUD Operations (Add, Edit, Delete)
// ----------------------------------------------------

// Modals Trigger Handlers
window.openAddTransactionModal = function () {
  document.getElementById('modal-t-title').textContent = 'Add Transaction';
  document.getElementById('t-id').value = '';
  document.getElementById('t-desc').value = '';
  document.getElementById('t-amount').value = '';
  document.getElementById('type-expense').checked = true;

  populateCategoryDropdowns();

  document.getElementById('t-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('transaction-dialog').showModal();
};

window.openEditTransactionModal = function (id) {
  const transaction = state.transactions.find(t => t.id === id);
  if (!transaction) return;

  document.getElementById('modal-t-title').textContent = 'Edit Transaction';
  document.getElementById('t-id').value = transaction.id;
  document.getElementById('t-desc').value = transaction.description;
  document.getElementById('t-amount').value = transaction.amount;

  if (transaction.type === 'income') {
    document.getElementById('type-income').checked = true;
  } else {
    document.getElementById('type-expense').checked = true;
  }

  populateCategoryDropdowns();
  document.getElementById('t-category').value = transaction.category;

  const dateObj = new Date(transaction.date);
  const formattedDate = dateObj.toISOString().substring(0, 10);
  document.getElementById('t-date').value = formattedDate;

  document.getElementById('transaction-dialog').showModal();
};

window.openBudgetModal = function () {
  const budgetInputsContainer = document.getElementById('budget-inputs-container');
  budgetInputsContainer.innerHTML = '';

  CATEGORIES.expense.forEach(cat => {
    const existing = state.budgets.find(b => b.category === cat.id);
    const limit = existing ? parseFloat(existing.limit_amount) : '';

    const row = document.createElement('div');
    row.className = 'form-group form-row';
    row.style.alignItems = 'center';
    row.style.marginBottom = '0.75rem';

    row.innerHTML = `
      <label style="margin-bottom: 0; display: flex; align-items: center; gap: 0.5rem;">
        ${getIconHTML(cat.icon)} ${cat.name}
      </label>
      <input type="number" step="0.01" min="0" 
             name="budget-${cat.id}" 
             placeholder="No limit" 
             value="${limit}" 
             class="form-control">
    `;
    budgetInputsContainer.appendChild(row);
  });

  document.getElementById('budget-dialog').showModal();
};

// Asset Modal & CRUD managers
window.openAssetModal = function () {
  document.getElementById('a-name').value = '';
  document.getElementById('a-value').value = '';
  document.getElementById('a-category').value = 'cash';
  document.getElementById('btn-save-asset').textContent = 'Add Holding';

  renderAssetManagementList();
  document.getElementById('asset-dialog').showModal();
};

function renderAssetManagementList() {
  const mgrList = document.getElementById('assets-mgr-list');
  mgrList.innerHTML = '';

  if (state.assets.length === 0) {
    mgrList.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-muted); padding: 0.75rem; text-align: center;">No assets listed. Add one below.</div>
    `;
    return;
  }

  state.assets.forEach(a => {
    const config = ASSET_CATEGORIES[a.category] || { name: a.category, icon: 'others' };
    const row = document.createElement('div');
    row.className = 'assets-management-row';
    row.innerHTML = `
      <div class="asset-details">
        <span class="asset-name">${escapeHtml(a.name)}</span>
        <span class="asset-meta">${config.name} &bull; ${formatCurrency(a.value)}</span>
      </div>
      <div class="asset-actions">
        <button class="action-btn" type="button" onclick="loadAssetForEditing('${a.id}')" title="Edit">
          ${getIconHTML('edit')}
        </button>
        <button class="action-btn delete" type="button" onclick="deleteAssetItem('${a.id}')" title="Delete">
          ${getIconHTML('trash')}
        </button>
      </div>
    `;
    mgrList.appendChild(row);
  });
}

window.loadAssetForEditing = function (id) {
  const asset = state.assets.find(a => a.id === id);
  if (!asset) return;

  document.getElementById('a-name').value = asset.name;
  document.getElementById('a-value').value = asset.value;
  document.getElementById('a-category').value = asset.category;

  document.getElementById('btn-save-asset').textContent = 'Update Holding';
  document.getElementById('asset-form').dataset.editingId = id;
};

window.deleteAssetItem = async function (id) {
  if (!confirm('Are you sure you want to delete this asset?')) return;
  updateSyncUI('syncing', 'Deleting...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('assets')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Asset deleted from database.', 'success');
    } else {
      state.assets = state.assets.filter(a => a.id !== id);
      saveToLocalStorageOnly();
      showToast('Asset deleted locally.', 'success');
    }

    renderAssetManagementList();
    await loadData();
  } catch (err) {
    console.error('Error deleting asset:', err);
    showToast('Failed to delete asset: ' + err.message, 'error');
  }
};

window.openSetupModal = function () {
  document.getElementById('setup-url').value = localStorage.getItem('supabase_url') || '';
  document.getElementById('setup-key').value = localStorage.getItem('supabase_key') || '';
  document.getElementById('setup-dialog').showModal();
};

// Form submissions handlers
async function handleTransactionSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('t-id').value;
  const description = document.getElementById('t-desc').value.trim();
  const amount = parseFloat(document.getElementById('t-amount').value);
  const type = document.querySelector('input[name="type"]:checked').value;
  const category = document.getElementById('t-category').value;
  const date = document.getElementById('t-date').value;

  if (!description || isNaN(amount) || amount <= 0 || !category || !date) {
    showToast('Please enter all fields correctly.', 'error');
    return;
  }

  const transactionData = {
    description,
    amount,
    type,
    category,
    date
  };

  updateSyncUI('syncing', 'Saving...');

  try {
    if (state.isSupabaseConnected) {
      if (id) {
        const { error } = await supabaseClient
          .from('transactions')
          .update(transactionData)
          .eq('id', id);
        if (error) throw error;
        showToast('Transaction updated successfully.', 'success');
      } else {
        const { error } = await supabaseClient
          .from('transactions')
          .insert([transactionData]);
        if (error) throw error;
        showToast('Transaction added successfully.', 'success');
      }
    } else {
      if (id) {
        const idx = state.transactions.findIndex(t => t.id === id);
        if (idx !== -1) {
          state.transactions[idx] = { ...state.transactions[idx], ...transactionData };
          showToast('Transaction updated locally.', 'success');
        }
      } else {
        const newLocalTx = {
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          created_at: new Date().toISOString(),
          ...transactionData
        };
        state.transactions.unshift(newLocalTx);
        showToast('Transaction added locally (Sandbox).', 'success');
      }
      saveToLocalStorageOnly();
    }

    document.getElementById('transaction-dialog').close();
    await loadData();
  } catch (err) {
    console.error('Error saving transaction:', err);
    showToast('Failed to save transaction: ' + err.message, 'error');
  }
}

async function handleBudgetSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const updatedBudgets = [];

  CATEGORIES.expense.forEach(cat => {
    const val = formData.get(`budget-${cat.id}`);
    if (val !== null && val !== '') {
      const limit = parseFloat(val);
      if (!isNaN(limit) && limit >= 0) {
        updatedBudgets.push({
          category: cat.id,
          limit_amount: limit
        });
      }
    }
  });

  updateSyncUI('syncing', 'Saving budgets...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('budgets')
        .upsert(updatedBudgets, { onConflict: 'category' });
      if (error) throw error;

      const activeCats = updatedBudgets.map(b => b.category);
      const deleteCats = CATEGORIES.expense.map(c => c.id).filter(c => !activeCats.includes(c));

      if (deleteCats.length > 0) {
        await supabaseClient
          .from('budgets')
          .delete()
          .in('category', deleteCats);
      }

      showToast('Monthly budgets saved to database.', 'success');
    } else {
      state.budgets = updatedBudgets;
      saveToLocalStorageOnly();
      showToast('Monthly budgets saved locally.', 'success');
    }

    document.getElementById('budget-dialog').close();
    await loadData();
  } catch (err) {
    console.error('Error saving budgets:', err);
    showToast('Failed to save budgets: ' + err.message, 'error');
  }
}

async function handleAssetSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const editingId = form.dataset.editingId;
  const name = document.getElementById('a-name').value.trim();
  const value = parseFloat(document.getElementById('a-value').value);
  const category = document.getElementById('a-category').value;

  if (!name || isNaN(value) || value < 0) {
    showToast('Please enter holding details correctly.', 'error');
    return;
  }

  const assetData = { name, value, category };
  updateSyncUI('syncing', 'Saving Asset...');

  try {
    if (state.isSupabaseConnected) {
      if (editingId) {
        const { error } = await supabaseClient
          .from('assets')
          .update(assetData)
          .eq('id', editingId);
        if (error) throw error;
        showToast('Asset holding updated in database.', 'success');
      } else {
        const { error } = await supabaseClient
          .from('assets')
          .insert([assetData]);
        if (error) throw error;
        showToast('Asset holding saved to database.', 'success');
      }
    } else {
      if (editingId) {
        const idx = state.assets.findIndex(a => a.id === editingId);
        if (idx !== -1) {
          state.assets[idx] = { ...state.assets[idx], ...assetData };
          showToast('Asset holding updated locally.', 'success');
        }
      } else {
        const newAsset = {
          id: 'local_ast_' + Date.now(),
          created_at: new Date().toISOString(),
          ...assetData
        };
        state.assets.push(newAsset);
        showToast('Asset holding added locally.', 'success');
      }
      saveToLocalStorageOnly();
    }

    delete form.dataset.editingId;
    document.getElementById('btn-save-asset').textContent = 'Add Holding';
    document.getElementById('a-name').value = '';
    document.getElementById('a-value').value = '';

    renderAssetManagementList();
    await loadData();
  } catch (err) {
    console.error('Error saving asset:', err);
    showToast('Failed to save asset: ' + err.message, 'error');
  }
}

async function handleSetupSubmit(e) {
  e.preventDefault();

  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();

  if (!url) {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_key');
    supabaseClient = null;
    state.isSupabaseConnected = false;
    showToast('Disconnected from Supabase. Reverting to Sandbox Mode.', 'info');
  } else {
    localStorage.setItem('supabase_url', url);
    if (key) {
      localStorage.setItem('supabase_key', key);
    } else {
      localStorage.removeItem('supabase_key');
    }
    showToast('Credentials updated. Connecting...', 'info');
  }

  document.getElementById('setup-dialog').close();

  await initDatabaseConnection();
  await loadData();
}

window.deleteTransactionItem = async function (id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;
  updateSyncUI('syncing', 'Deleting...');

  try {
    if (state.isSupabaseConnected) {
      const { error } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Transaction deleted successfully.', 'success');
    } else {
      state.transactions = state.transactions.filter(t => t.id !== id);
      saveToLocalStorageOnly();
      showToast('Transaction deleted locally.', 'success');
    }
    await loadData();
  } catch (err) {
    console.error('Error deleting transaction:', err);
    showToast('Failed to delete transaction: ' + err.message, 'error');
  }
};

// ----------------------------------------------------
// 6. Filtering & Pagination Handlers
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

  document.getElementById('filter-type').addEventListener('change', (e) => {
    state.filters.type = e.target.value;
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
      renderTransactionsTable();
    }
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    const totalItems = state.transactions.length;
    const totalPages = Math.ceil(totalItems / state.pagination.itemsPerPage);
    if (state.pagination.currentPage < totalPages) {
      state.pagination.currentPage++;
      renderTransactionsTable();
    }
  });
}

// ----------------------------------------------------
// 7. Onboarding Setup Wizard Controls
// ----------------------------------------------------
window.nextOnboardingStep = async function (stepNum) {
  // Simple validation for transition bounds
  if (stepNum === 2) {
    // Collect credentials in Step 1
    const url = document.getElementById('onboard-url').value.trim();
    const key = document.getElementById('onboard-key').value.trim();

    if (url) {
      localStorage.setItem('supabase_url', url);
      if (key) {
        localStorage.setItem('supabase_key', key);
      } else {
        localStorage.setItem('supabase_key', DEFAULT_PUBLISHABLE_KEY);
      }

      // Attempt db validation
      updateSyncUI('syncing', 'Connecting to database...');
      try {
        supabaseClient = supabase.createClient(url, key || DEFAULT_PUBLISHABLE_KEY);
        const { error } = await supabaseClient.from('transactions').select('*', { count: 'exact', head: true }).limit(1);
        if (error) throw error;

        state.isSupabaseConnected = true;
        updateSyncUI('connected', 'Synced');
        showToast('Connected to Supabase successfully!', 'success');
      } catch (err) {
        console.error(err);
        state.isSupabaseConnected = false;
        updateSyncUI('error', 'Connection Error');
        const proceed = confirm('Database check failed. If you have not created your tables yet, click OK to proceed anyway and run setup.sql later, or Cancel to correct credentials.');
        if (!proceed) return;
      }
    } else {
      // Run in local sandbox mode
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
      state.isSupabaseConnected = false;
      updateSyncUI('disconnected', 'Sandbox Mode');
    }
  }

  // Update step indicators styling
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot-step-${i}`);
    const content = document.getElementById(`onboard-step-${i}-content`);

    if (dot && content) {
      dot.classList.remove('active', 'completed');
      content.classList.remove('active');

      if (i === stepNum) {
        dot.classList.add('active');
        content.classList.add('active');
      } else if (i < stepNum) {
        dot.classList.add('completed');
      }
    }
  }
};

window.skipOnboardingDatabase = function () {
  // Explicitly clear settings & bypass connection step
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  state.isSupabaseConnected = false;
  updateSyncUI('disconnected', 'Sandbox Mode');

  nextOnboardingStep(2);
};

window.submitOnboarding = async function () {
  // 1. Step 2 Assets collection
  const cashVal = parseFloat(document.getElementById('onboard-cash').value) || 0;
  const bankVal = parseFloat(document.getElementById('onboard-bank').value) || 0;
  const stockVal = parseFloat(document.getElementById('onboard-stocks').value) || 0;
  const cryptoVal = parseFloat(document.getElementById('onboard-crypto').value) || 0;

  const initialAssets = [];
  if (cashVal > 0) initialAssets.push({ name: 'Cash Holdings', value: cashVal, category: 'cash' });
  if (bankVal > 0) initialAssets.push({ name: 'Bank Account Balance', value: bankVal, category: 'bank' });
  if (stockVal > 0) initialAssets.push({ name: 'Equities & Stocks Portfolio', value: stockVal, category: 'stocks' });
  if (cryptoVal > 0) initialAssets.push({ name: 'Cryptocurrency Wallet', value: cryptoVal, category: 'crypto' });

  // 2. Step 3 Budgets collection
  const foodBudget = parseFloat(document.getElementById('onboard-budget-food').value) || 0;
  const rentBudget = parseFloat(document.getElementById('onboard-budget-rent').value) || 0;
  const utilitiesBudget = parseFloat(document.getElementById('onboard-budget-utilities').value) || 0;

  const initialBudgets = [];
  if (foodBudget > 0) initialBudgets.push({ category: 'food', limit_amount: foodBudget });
  if (rentBudget > 0) initialBudgets.push({ category: 'rent', limit_amount: rentBudget });
  if (utilitiesBudget > 0) initialBudgets.push({ category: 'utilities', limit_amount: utilitiesBudget });

  // 3. Save to database / localstorage
  updateSyncUI('syncing', 'Saving initial assets...');

  try {
    if (state.isSupabaseConnected) {
      // Save initial Assets to Supabase
      if (initialAssets.length > 0) {
        const { error } = await supabaseClient.from('assets').insert(initialAssets);
        if (error) throw error;
      }

      // Save initial Budgets to Supabase
      if (initialBudgets.length > 0) {
        const { error } = await supabaseClient.from('budgets').insert(initialBudgets);
        if (error) throw error;
      }
    } else {
      // Local Sandbox Save
      state.assets = initialAssets;
      state.budgets = initialBudgets;
      saveToLocalStorageOnly();
    }

    // Set Onboarding status complete
    localStorage.setItem('onboarding_completed', 'true');
    showToast('Onboarding complete! Welcome to FinSight.', 'success');

    // Close modal
    document.getElementById('onboarding-dialog').close();

    // Initialize & refresh load
    await initDatabaseConnection();
    await loadData();
  } catch (err) {
    console.error('Error saving onboarding assets:', err);
    showToast('Failed to complete onboarding: ' + err.message, 'error');
  }
};

// ----------------------------------------------------
// 8. Formatters & Icon helpers (Strictly no emojis)
// ----------------------------------------------------

// Formatter for Rupees (₹ / INR)
function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  return new Date(dateStr).toLocaleDateString();
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check';
  if (type === 'error') iconName = 'alert';

  toast.innerHTML = `${getIconHTML(iconName)} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slide-in-toast 0.3s reverse forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, 3200);
}

// SVG/FontAwesome icons class configurations (Strictly no emojis)
const SVG_ICONS = {
  payment: 'fa-solid fa-money-bills',
  investment: 'fa-solid fa-arrow-trend-up',
  food: 'fa-solid fa-bowl-food',
  utilities: 'fa-solid fa-bolt',
  rent: 'fa-solid fa-house',
  transport: 'fa-solid fa-car',
  shopping: 'fa-solid fa-basket-shopping',
  entertainment: 'fa-solid fa-clapperboard',
  others: 'fa-solid fa-tag',
  cash: 'fa-solid fa-money-bill-wave',
  bank: 'fa-solid fa-building-columns',
  stocks: 'fa-solid fa-chart-line',
  crypto: 'fa-solid fa-coins',
  real_estate: 'fa-solid fa-house-chimney',
  mutual_funds: 'fa-solid fa-chart-pie',
  edit: 'fa-solid fa-pen-to-square',
  trash: 'fa-solid fa-trash-can',
  check: 'fa-solid fa-check',
  alert: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-info-circle',
  trend: 'fa-solid fa-chart-column',
  search: 'fa-solid fa-magnifying-glass'
};

function getIconHTML(iconName, extraClasses = '') {
  const iconClass = SVG_ICONS[iconName] || 'fa-solid fa-tag';
  return `<i class="${iconClass} ${extraClasses}"></i>`;
}

// ----------------------------------------------------
// 9. Zero-State Default Data (Defaults to 0)
// ----------------------------------------------------
function getDemoTransactions() {
  return []; // Defaults to 0/empty
}

function getDemoBudgets() {
  return []; // Defaults to 0/empty
}

function getDemoAssets() {
  return []; // Defaults to 0/empty
}
