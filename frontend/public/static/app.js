/* ══════════════════════════════════════════════════════════
   AI Financial Co-Pilot  —  Main App (app.js)
   Full integration with Supabase Auth + FastAPI Backend
   ══════════════════════════════════════════════════════════ */

// ─── App State ────────────────────────────────────────────────
const State = {
  transactions: [],
  processed: [],
  summary: null,
  health: null,
  insights: [],
  activeNav: 'upload',
  filter: { period: 'all' },
  chatHistory: [],
  corrections: {},
  goals: [],
  alerts: [],
  businessId: null,
  businessName: '',
  user: null,
  isLoading: false,
  dashboardData: null,
  aiInsights: [],
  executiveSummary: '',
  recurring: [],
  anomalies: [],
  duplicates: [],
  forecasts: [],
  excludedTxIds: new Set(),
  sidebarCollapsed: false,
};

const E = window.FinancialEngine;

// ─── Utility Helpers ──────────────────────────────────────────
const fmt = n => {
  const abs = Math.abs(n);
  if (abs >= 1000000) return 'PKR ' + (abs/1000000).toFixed(2) + 'M';
  if (abs >= 1000) return 'PKR ' + abs.toLocaleString('en-PK', { maximumFractionDigits: 0 });
  return 'PKR ' + abs.toFixed(0);
};

const fmtRaw = n => Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  t.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => { t.style.animation = 'none'; t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

function animateValue(el, start, end, duration = 800) {
  const range = end - start;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmtRaw(Math.floor(start + range * eased));
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = fmtRaw(end);
  }
  requestAnimationFrame(update);
}

function showPageLoading(show) {
  const el = document.getElementById('page-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ─── Auth & Business Setup ─────────────────────────────────────

function showLogin() {
  document.getElementById('login-overlay').style.display = 'block';
  document.getElementById('business-overlay').style.display = 'none';
  document.getElementById('app-root').style.display = 'none';
}

function showBusinessSetup() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('business-overlay').style.display = 'flex';
  document.getElementById('app-root').style.display = 'none';
}

function showApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('business-overlay').style.display = 'none';
  document.getElementById('app-root').style.display = '';
}

async function handleAuthStateChange(event, session) {
  if (event === 'SIGNED_IN' && session) {
    State.user = session.user;
    document.getElementById('login-loading').style.display = 'none';

    // Update user info display
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
      const name = session.user?.user_metadata?.full_name || session.user?.email || '';
      userInfo.textContent = name;
    }

    // Try to load businesses
    try {
      const result = await window.apiClient.listBusinesses();
      const businesses = result.businesses || [];

      if (businesses.length > 0) {
        if (businesses.length === 1) {
          selectBusiness(businesses[0]);
        } else {
          showBusinessSelector(businesses);
        }
      } else {
        showBusinessSetup();
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
      showBusinessSetup();
    }
  } else if (event === 'SIGNED_OUT') {
    State.user = null;
    State.businessId = null;
    showLogin();
  }
}

function showBusinessSelector(businesses) {
  showBusinessSetup();
  const section = document.getElementById('business-select-section');
  const list = document.getElementById('business-list');
  if (section && list) {
    section.style.display = 'block';
    list.innerHTML = businesses.map(b =>
      `<button class="btn btn-secondary" style="width:100%;margin-bottom:8px;text-align:left" onclick="selectBusinessById('${b.id}', '${b.name.replace(/'/g, "\\'")}')">
        🏢 ${b.name}
      </button>`
    ).join('');
  }
}

function selectBusinessById(id, name) {
  selectBusiness({ id, name });
}

async function selectBusiness(business) {
  State.businessId = business.id;
  State.businessName = business.name;
  window.apiClient.currentBusinessId = business.id;

  const nameDisplay = document.getElementById('business-name-display');
  if (nameDisplay) nameDisplay.textContent = business.name;

  showApp();
  await loadDashboardData();
  navigate(State.processed.length ? 'dashboard' : 'upload');
}

async function handleCreateBusiness() {
  const nameInput = document.getElementById('business-name-input');
  const name = nameInput?.value?.trim();
  if (!name) {
    showToast('Please enter a business name', 'error');
    return;
  }

  try {
    const btn = document.getElementById('create-business-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating...'; }

    const result = await window.apiClient.createBusiness(name);
    if (result.business) {
      showToast(`Business "${name}" created!`, 'success');
      selectBusiness(result.business);
    }
  } catch (err) {
    showToast('Failed to create business: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('create-business-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Create Business & Start'; }
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to sign out?')) return;
  await window.supabaseAuth.signOut();
}

// ─── Navigation ────────────────────────────────────────────────
function navigate(page) {
  State.activeNav = page;
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.nav === page);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.dataset.page === page);
  });
  const titles = {
    dashboard:   { title: '📊 Dashboard', sub: 'AI-powered financial overview' },
    transactions:{ title: '📋 Transactions', sub: 'All transactions with AI classification' },
    insights:    { title: '💡 AI Insights', sub: 'Smart analysis & recommendations' },
    upload:      { title: '📤 Add Data', sub: 'Upload CSV or add transactions manually' },
    chat:        { title: '🤖 AI CFO Chat', sub: 'Ask your financial co-pilot anything' },
    forecast:    { title: '🔮 Forecast & Health', sub: 'Cashflow projections & business health' },
    goals:       { title: '🎯 Goals & Scenarios', sub: 'Set targets and simulate changes' },
  };
  const t = titles[page] || { title: page, sub: '' };
  document.getElementById('topbar-title').textContent = t.title;
  document.getElementById('topbar-sub').textContent = t.sub;

  if (page === 'dashboard') renderDashboard();
  else if (page === 'transactions') renderTransactions();
  else if (page === 'insights') renderInsights();
  else if (page === 'forecast') renderForecast();
  else if (page === 'goals') renderGoals();
  else if (page === 'chat') renderChat();

  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');
}

// ─── Data Loading ──────────────────────────────────────────────

async function loadDashboardData() {
  if (!State.businessId) return;

  try {
    showPageLoading(true);
    const data = await window.apiClient.getDashboard(State.businessId);

    State.dashboardData = data;
    State.processed = data.transactions || [];
    State.recurring = data.recurring || [];
    State.anomalies = data.anomalies || [];
    State.duplicates = data.duplicates || [];
    State.forecasts = data.forecasts || [];

    if (data.summary && data.summary.transaction_count > 0) {
      State.summary = data.summary;
      State.health = data.health;
    } else {
      State.summary = null;
      State.health = null;
    }

    if (data.insights && data.insights.length > 0) {
      State.aiInsights = data.insights;
    }

    State.executiveSummary = data.executive_summary || '';
    updateSidebarHealth();

    const txEl = document.getElementById('upload-tx-count');
    const insEl = document.getElementById('upload-insight-count');
    const statEl = document.getElementById('tx-count-stat');
    if (txEl) txEl.textContent = State.processed.length;
    if (insEl) insEl.textContent = State.aiInsights.length;
    if (statEl) statEl.textContent = State.processed.length;

    const warnCount = State.aiInsights.filter(i =>
      i.insight_type === 'risk' || i.insight_type === 'warning' || i.severity === 'high'
    ).length;
    const badge = document.getElementById('insight-badge');
    if (badge) { badge.textContent = warnCount || ''; badge.style.display = warnCount ? '' : 'none'; }

    showPageLoading(false);
  } catch (err) {
    console.error('Failed to load dashboard:', err);
    showPageLoading(false);
    if (err.message && !err.message.includes('Not authenticated')) {
      showToast('Note: Backend offline — using local mode', 'warning');
    }
  }
}

async function refreshAfterDataChange() {
  await loadDashboardData();
  navigate(State.activeNav);
}

// ─── Active (non-excluded) Transactions Helpers ───────────────
function getActiveTransactions() {
  if (!State.excludedTxIds || State.excludedTxIds.size === 0) return State.processed;
  return State.processed.filter(tx => !State.excludedTxIds.has(tx.id));
}

// Normalize API transactions (lowercase type, string amounts) for engine compatibility
function normalizeForEngine(txs) {
  return txs.map(tx => ({
    ...tx,
    type: tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1).toLowerCase() : tx.type,
    amount: parseFloat(tx.amount) || 0
  }));
}

function recomputeActiveSummary() {
  const active = getActiveTransactions();
  if (!active.length) return State.summary;
  const normalized = normalizeForEngine(active);
  const raw = E.computeSummary(normalized);
  return adaptLocalSummary(raw);
}

function recomputeActiveHealth() {
  const active = getActiveTransactions();
  if (!active.length) return State.health;
  const normalized = normalizeForEngine(active);
  const rawSummary = E.computeSummary(normalized);
  return E.computeHealthScore(rawSummary, normalized);
}

// ─── Process Data (local fallback) ────────────────────────────
function processData(rawTxs) {
  const corrected = rawTxs.map(tx => {
    const key = tx.description?.toLowerCase().trim();
    if (State.corrections[key]) return { ...tx, ...State.corrections[key] };
    return tx;
  });

  State.processed = E.processTransactions(corrected);
  State.summary = adaptLocalSummary(E.computeSummary(State.processed));
  State.health = E.computeHealthScore(State.summary, State.processed);

  const localInsights = E.generateInsights(State.processed, State.summary);
  if (!State.aiInsights.length) {
    State.aiInsights = localInsights.map(i => ({
      text: `${i.title}: ${i.text}`,
      insight_type: i.type,
      severity: i.severity === 'risk' ? 'high' : i.severity === 'warning' ? 'medium' : 'low',
      _local: true, _icon: i.icon, _title: i.title, _text: i.text, _severity: i.severity,
    }));
  }

  updateSidebarHealth();
  const badge = document.getElementById('insight-badge');
  const warnCount = State.aiInsights.filter(i => i.severity === 'high' || i.insight_type === 'risk').length;
  if (badge) { badge.textContent = warnCount || ''; badge.style.display = warnCount ? '' : 'none'; }

  showToast(`✅ Processed ${State.processed.length} transactions.`, 'success');
  navigate(State.activeNav === 'upload' ? 'dashboard' : State.activeNav);
}

function adaptLocalSummary(es) {
  return {
    total_income: es.totalIncome, total_expenses: es.totalExpenses, net_profit: es.netProfit,
    transaction_count: es.transactionCount, avg_daily_income: es.avgDailyIncome,
    avg_daily_expense: es.avgDailyExpense, net_daily_change: es.netDailyChange,
    profit_margin: es.profitMargin, expense_ratio: es.expenseRatio,
    date_range: {
      min: es.dateRange.min?.toISOString()?.split('T')[0] || null,
      max: es.dateRange.max?.toISOString()?.split('T')[0] || null,
      day_span: es.dateRange.daySpan,
    },
    monthly_trends: es.monthly.map(m => ({ month: m.label, income: m.income, expenses: m.expenses })),
    category_breakdown: Object.entries(es.categoryBreakdown).map(([name, total]) => ({
      name, total, percentage: es.totalExpenses > 0 ? (total / es.totalExpenses * 100) : 0,
    })).sort((a, b) => b.total - a.total),
    customers: es.customers.map(c => ({
      name: c.name, total: c.total, count: c.count,
      percentage: es.totalIncome > 0 ? (c.total / es.totalIncome * 100) : 0,
    })),
    suppliers: es.suppliers.map(s => ({
      name: s.name, total: s.total, count: s.count,
      percentage: es.totalExpenses > 0 ? (s.total / es.totalExpenses * 100) : 0,
    })),
  };
}

function updateSidebarHealth() {
  if (!State.health) return;
  const chip = document.getElementById('health-chip');
  const h = State.health;
  if (chip) {
    chip.innerHTML = `
      <div>
        <div class="score-num" style="color:${h.status_color || h.statusColor || '#3b82f6'}">${h.score}</div>
        <div style="font-size:10px;color:var(--text-muted)">${h.status}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary)">Business Health</div>
    `;
  }
}

// ─── DASHBOARD PAGE ────────────────────────────────────────────
function renderDashboard() {
  if (!State.summary || !State.summary.transaction_count) {
    document.getElementById('page-dashboard').innerHTML = renderEmptyState();
    return;
  }
  // Use active (non-excluded) transactions for stats
  const s = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveSummary() : State.summary;
  const h = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveHealth() : (State.health || { score: 0, status: 'Unknown', status_color: '#64748b', factors: [] });
  const exSummary = State.executiveSummary || generateLocalExecSummary(s, h);
  const topInsights = getFormattedInsights().slice(0, 4);

  document.getElementById('page-dashboard').innerHTML = `
    <div class="exec-summary mb-24" style="animation: slideInUp 0.4s ease both;">
      <div class="exec-summary-label">🤖 AI Co-Pilot Summary</div>
      <div class="exec-summary-text">${exSummary}</div>
    </div>

    <div class="stat-grid mb-24">
      ${statCard('💵', 'Money In', s.total_income, 'income', `${s.transaction_count} transactions total`)}
      ${statCard('💸', 'Money Out', s.total_expenses, 'expense', `${fmt(s.avg_daily_expense)}/day avg`)}
      ${statCard('📈', 'Profit', s.net_profit, 'profit', `${s.profit_margin.toFixed(1)}% profit margin`)}
      ${statCard('🔢', 'Transactions', s.transaction_count, 'txns', `${formatDate(s.date_range?.min)} – ${formatDate(s.date_range?.max)}`)}
    </div>

    <div class="grid-7-5 mb-24">
      <div class="chart-container">
        <div class="card-header">
          <div class="card-title">📊 Money In vs Money Out</div>
          <div class="tab-bar" id="chart-period-bar">
            <button class="tab-btn active" onclick="switchChartPeriod('monthly', this)">Monthly</button>
            <button class="tab-btn" onclick="switchChartPeriod('category', this)">By Category</button>
          </div>
        </div>
        <div id="main-chart-wrap" style="height:260px">
          <canvas id="main-chart" style="height:260px"></canvas>
        </div>
      </div>
      <div class="chart-container">
        <div class="card-header"><div class="card-title">🍩 Where Your Money Goes</div></div>
        <div style="height:260px;display:flex;align-items:center;justify-content:center">
          <canvas id="donut-chart" style="max-height:240px;max-width:240px"></canvas>
        </div>
      </div>
    </div>

    <div class="grid-3 mb-24">
      <div class="card">
        <div class="card-header"><div class="card-title">🏆 Top Customers</div></div>
        ${renderTopCustomers(s.customers?.slice(0, 5) || [], s.total_income)}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">💡 Top Insights</div>
          <button class="btn btn-sm btn-secondary" onclick="navigate('insights')">View All</button>
        </div>
        <div class="insight-list">
          ${topInsights.map((ins, i) => `
            <div class="insight-item ${ins.severity}" style="animation-delay:${i*0.07}s">
              <div class="insight-icon">${ins.icon}</div>
              <div>
                <div class="severity-badge ${ins.severity}">${ins.severity.toUpperCase()}</div>
                <div class="insight-title">${ins.title}</div>
                <div class="insight-text">${ins.text}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🏥 Business Health</div></div>
        ${renderHealthRing(h)}
        <div style="margin-top:16px">
          ${renderCategoryBars(s.category_breakdown || [], s.total_expenses)}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title">🔄 Recurring Expenses</div></div>
        ${renderRecurring(State.recurring || [])}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🏭 Top Suppliers</div></div>
        ${renderTopSuppliers(s.suppliers?.slice(0, 5) || [], s.total_expenses)}
      </div>
    </div>
  `;

  setTimeout(() => { initMainChart('monthly'); initDonutChart(); animateDashboardStats(); }, 50);
}

function generateLocalExecSummary(s, h) {
  const out = [];
  if (s.net_profit >= 0) out.push(`Your business is profitable with a ${s.profit_margin.toFixed(1)}% profit margin.`);
  else out.push('Your business is currently operating at a loss — immediate attention is needed.');
  if (s.customers?.[0]?.percentage > 40) out.push(`Revenue is concentrated in one customer (${s.customers[0].percentage.toFixed(1)}%), which poses a risk.`);
  else out.push('Revenue is well-distributed across multiple customers.');
  const topCat = s.category_breakdown?.[0];
  if (topCat) out.push(`${topCat.name} is your biggest cost driver at ${topCat.percentage?.toFixed(1) || 0}% of expenses.`);
  if (s.net_daily_change < 0) out.push('Cash outflow is exceeding inflow daily — cashflow management needs priority.');
  else out.push('Daily cashflow is positive, indicating good short-term health.');
  return out.join(' ');
}

function getFormattedInsights() {
  return State.aiInsights.map(ins => {
    if (ins._local) {
      return { icon: ins._icon||'💡', title: ins._title||'Insight', text: ins._text||ins.text, severity: ins._severity||'info', type: ins.insight_type||'info' };
    }
    const typeIcons = { health:'💰', risk:'⚠️', warning:'⚠️', opportunity:'✅', info:'ℹ️' };
    const sevMap = { high:'risk', medium:'warning', low:'info' };
    return {
      icon: typeIcons[ins.insight_type]||ins.icon||'💡',
      title: ins.title||ins.insight_type||'Insight',
      text: ins.text||'',
      severity: sevMap[ins.severity]||ins.severity||'info',
      type: ins.insight_type||ins.type||'info',
    };
  });
}

function statCard(icon, label, value, type, sub) {
  const isNeg = value < 0;
  return `
    <div class="stat-card ${type}" style="animation: slideInUp 0.4s ease both;">
      <div class="stat-card-bg-icon">${icon}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-value ${type} ${isNeg?'negative':'positive'}" data-value="${Math.abs(value)}">
        ${type==='txns' ? value : (isNeg?'− ':'')+fmt(value)}
      </div>
      <div class="stat-sub">${icon} ${sub}</div>
    </div>
  `;
}

function animateDashboardStats() {
  document.querySelectorAll('.stat-value[data-value]').forEach(el => {
    const val = parseFloat(el.dataset.value);
    if (!isNaN(val) && val > 0) animateValue(el, 0, val);
  });
}

function renderTopCustomers(customers, totalIncome) {
  if (!customers.length) return '<div class="text-muted" style="font-size:13px;padding:12px 0">No customer data available</div>';
  const colors = ['#6366f1','#a855f7','#06b6d4','#10b981','#f59e0b'];
  return customers.map((c, i) => {
    const pct = c.percentage || (totalIncome > 0 ? (c.total/totalIncome*100) : 0);
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label"><span style="color:${colors[i%5]}">● </span>${(c.name||'').substring(0,18)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${colors[i%5]}" data-width="${pct}"></div></div>
        <div class="cat-bar-val" style="color:${colors[i%5]}">${pct.toFixed(1)}%</div>
      </div>
    `;
  }).join('');
}

function renderTopSuppliers(suppliers, totalExpenses) {
  if (!suppliers.length) return '<div class="text-muted" style="font-size:13px;padding:12px 0">No supplier data</div>';
  const colors = ['#ef4444','#f97316','#eab308','#22d3ee','#8b5cf6'];
  return suppliers.map((s, i) => {
    const pct = s.percentage || (totalExpenses > 0 ? (s.total/totalExpenses*100) : 0);
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label"><span style="color:${colors[i%5]}">● </span>${(s.name||'').substring(0,18)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${colors[i%5]}" data-width="${pct}"></div></div>
        <div class="cat-bar-val" style="color:${colors[i%5]}">${fmt(s.total)}</div>
      </div>
    `;
  }).join('');
}

function renderCategoryBars(catBreakdown, totalExpenses) {
  const entries = (catBreakdown||[]).slice(0, 5);
  if (!entries.length) return '<div class="text-muted" style="font-size:13px">No expense data</div>';
  const colors = ['#f97316','#ef4444','#a855f7','#06b6d4','#f59e0b'];
  return entries.map((cat, i) => {
    const pct = cat.percentage || (totalExpenses > 0 ? (cat.total/totalExpenses*100) : 0);
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label" title="${cat.name}">${(cat.name||'').substring(0,13)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${colors[i%5]}" data-width="${pct}"></div></div>
        <div class="cat-bar-val">${pct.toFixed(1)}%</div>
      </div>
    `;
  }).join('');
}

function renderHealthRing(h) {
  const score = h?.score||0;
  const statusColor = h?.status_color||h?.statusColor||'#3b82f6';
  const status = h?.status||'Unknown';
  const factors = h?.factors||[];
  const R = 50, C = Math.PI*2*R;
  return `
    <div class="health-ring-wrap">
      <div class="health-ring">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle class="health-ring-bg" cx="60" cy="60" r="${R}"/>
          <circle class="health-ring-fill" cx="60" cy="60" r="${R}" stroke="${statusColor}" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="health-ring-anim"/>
        </svg>
        <div class="health-ring-center">
          <div class="health-score-num" style="color:${statusColor}">${score}</div>
          <div class="health-score-label">/ 100</div>
        </div>
      </div>
      <div class="health-factors">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:${statusColor}">${status}</div>
        ${factors.slice(0,4).map(f => `
          <div class="health-factor-item">
            <div class="health-factor-dot" style="background:${f.positive?'#10b981':'#ef4444'}"></div>
            <div>${f.label}</div>
            <div style="margin-left:auto;font-size:11px;font-weight:600;color:${f.positive?'#10b981':'#ef4444'}">${f.pts>0?'+':''}${f.pts}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderRecurring(recurring) {
  if (!recurring.length) return '<div class="text-muted" style="font-size:13px;padding:12px 0">No recurring patterns detected</div>';
  return recurring.slice(0,5).map(r => `
    <div class="recurring-item">
      <div>
        <div style="font-size:13px;font-weight:600">${(r.description||'').substring(0,32)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${r.category||''} · ${r.count}x</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--danger)">${fmt(r.avg_amount||r.avgAmount||0)}</div>
    </div>
  `).join('');
}

// ─── Charts ────────────────────────────────────────────────────
let mainChartInstance = null;
let donutChartInstance = null;
const CHART_COLORS = ['#6366f1','#a855f7','#06b6d4','#10b981','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6'];

function switchChartPeriod(type, btn) {
  document.querySelectorAll('#chart-period-bar .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  initMainChart(type);
}

function initMainChart(type = 'monthly') {
  const ctx = document.getElementById('main-chart');
  if (!ctx || !State.summary) return;
  if (mainChartInstance) { mainChartInstance.destroy(); mainChartInstance = null; }
  const activeSummary = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveSummary() : State.summary;

  if (type === 'monthly') {
    const months = activeSummary.monthly_trends || [];
    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.month),
        datasets: [
          { label:'Money In', data:months.map(m=>m.income), backgroundColor:'rgba(16,185,129,0.7)', borderColor:'#10b981', borderWidth:2, borderRadius:6 },
          { label:'Money Out', data:months.map(m=>m.expenses), backgroundColor:'rgba(239,68,68,0.7)', borderColor:'#ef4444', borderWidth:2, borderRadius:6 }
        ]
      },
      options: chartOptions({ prefix:'PKR ' })
    });
  } else {
    const catData = activeSummary.category_breakdown || [];
    mainChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: catData.map(c=>c.name),
        datasets: [{ label:'Expense', data:catData.map(c=>c.total), backgroundColor:CHART_COLORS.map(c=>c+'cc'), borderColor:CHART_COLORS, borderWidth:2, borderRadius:6 }]
      },
      options: {
        ...chartOptions({ prefix:'PKR ', indexAxis:'y' }),
        indexAxis: 'y',
        scales: {
          x: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', font:{size:11}, callback:v=>'PKR '+fmtRaw(v) } },
          y: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#94a3b8', font:{size:12, weight:'500'} } }
        }
      }
    });
  }
}

function initDonutChart() {
  const ctx = document.getElementById('donut-chart');
  if (!ctx || !State.summary) return;
  if (donutChartInstance) { donutChartInstance.destroy(); donutChartInstance = null; }
  const activeSummary = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveSummary() : State.summary;
  const catData = (activeSummary.category_breakdown||[]).slice(0,8);
  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catData.map(c=>c.name),
      datasets: [{ data:catData.map(c=>c.total), backgroundColor:CHART_COLORS, borderColor:'#1e293b', borderWidth:3, hoverOffset:10 }]
    },
    options: {
      responsive:true, maintainAspectRatio:true, cutout:'68%',
      plugins: {
        legend:{ position:'right', labels:{ color:'#94a3b8', font:{size:11}, boxWidth:12, padding:8 } },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
      },
      animation:{ animateScale:true, animateRotate:true }
    }
  });
}

function chartOptions({ prefix='', indexAxis } = {}) {
  return {
    responsive:true, maintainAspectRatio:false,
    ...(indexAxis ? {indexAxis} : {}),
    plugins: {
      legend:{ labels:{ color:'#94a3b8', font:{size:11}, boxWidth:12 } },
      tooltip:{ backgroundColor:'#0f172a', borderColor:'rgba(148,163,184,0.2)', borderWidth:1, titleColor:'#f1f5f9', bodyColor:'#94a3b8',
        callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${prefix}${fmtRaw(ctx.raw)}` } }
    },
    scales: {
      x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', font:{size:11} } },
      y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', font:{size:11}, callback:v=>prefix+fmtRaw(v) } }
    },
    animation:{ duration:600, easing:'easeOutQuart' }
  };
}

// ─── TRANSACTIONS PAGE ─────────────────────────────────────────
function renderTransactions() {
  const container = document.getElementById('page-transactions');
  if (!State.processed.length) { container.innerHTML = renderEmptyState(); return; }

  const allCategories = [...new Set(State.processed.map(t => t.category_name||t.category||'').filter(Boolean))].sort();
  // Compute min/max date for date filter defaults
  const dates = State.processed.map(t => t.date).filter(Boolean).sort();
  const minDate = dates[0] || '';
  const maxDate = dates[dates.length - 1] || '';
  container.innerHTML = `
    <div class="card mb-16">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <input class="form-input" id="tx-search" placeholder="🔍 Search transactions..." style="max-width:220px" oninput="filterTransactions()">
        <select class="form-select" id="tx-type-filter" style="max-width:140px" onchange="filterTransactions()">
          <option value="all">All Types</option><option value="income">Money In</option><option value="expense">Money Out</option>
        </select>
        <select class="form-select" id="tx-cat-filter" style="max-width:160px" onchange="filterTransactions()">
          <option value="all">All Categories</option>
          ${allCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:11px;color:var(--text-muted);white-space:nowrap">From</label>
          <input class="form-input" type="date" id="tx-date-from" value="${minDate}" style="max-width:140px;font-size:12px" onchange="filterTransactions()">
          <label style="font-size:11px;color:var(--text-muted);white-space:nowrap">To</label>
          <input class="form-input" type="date" id="tx-date-to" value="${maxDate}" style="max-width:140px;font-size:12px" onchange="filterTransactions()">
        </div>
        <div style="margin-left:auto;font-size:13px;color:var(--text-muted)" id="tx-count-label">${State.processed.length} transactions</div>
      </div>
    </div>
    <div class="chart-container"><div class="table-wrap" id="tx-table-wrap">${renderTxTable(State.processed)}</div></div>
  `;
}

function filterTransactions() {
  const search = document.getElementById('tx-search')?.value.toLowerCase()||'';
  const type = document.getElementById('tx-type-filter')?.value||'all';
  const cat = document.getElementById('tx-cat-filter')?.value||'all';
  const dateFrom = document.getElementById('tx-date-from')?.value||'';
  const dateTo = document.getElementById('tx-date-to')?.value||'';
  let filtered = State.processed.filter(tx => {
    const desc = (tx.description||'').toLowerCase();
    const entity = (tx.entity_name||'').toLowerCase();
    const category = (tx.category_name||tx.category||'').toLowerCase();
    const txDate = tx.date || '';
    return (!search || desc.includes(search) || entity.includes(search) || category.includes(search))
      && (type==='all' || tx.type===type)
      && (cat==='all' || category===cat.toLowerCase())
      && (!dateFrom || txDate >= dateFrom)
      && (!dateTo || txDate <= dateTo);
  });
  document.getElementById('tx-table-wrap').innerHTML = renderTxTable(filtered);
  const lbl = document.getElementById('tx-count-label');
  if (lbl) lbl.textContent = `${filtered.length} transactions`;
}

function renderTxTable(txs) {
  if (!txs.length) return '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>No matching transactions</h3></div>';
  return `<table><thead><tr><th>Date</th><th>Description</th><th>Entity</th><th>Category</th><th>Method</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:center">Actions</th></tr></thead><tbody>
    ${txs.map(tx => {
      const cat = tx.category_name||tx.category||'—';
      const entity = tx.entity_name||'—';
      const method = tx.payment_method||'—';
      const isInc = tx.type==='income';
      const excluded = State.excludedTxIds && State.excludedTxIds.has(tx.id);
      return `<tr style="${excluded?'opacity:0.4;text-decoration:line-through':''}">
        <td style="color:var(--text-muted);white-space:nowrap">${formatDate(tx.date)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tx.description||''}">${tx.description||''}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${entity}</td>
        <td><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,0.07);white-space:nowrap">${cat}</span></td>
        <td style="font-size:11px;color:var(--text-muted)">${method}</td>
        <td><span class="type-badge ${tx.type}">${isInc?'↑ In':'↓ Out'}</span></td>
        <td style="text-align:right;font-weight:700;color:${isInc?'#10b981':'#ef4444'};white-space:nowrap">${isInc?'+':'−'} ${fmt(tx.amount)}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn-icon" onclick="toggleExcludeTransaction('${tx.id}')" title="${excluded?'Include in stats':'Exclude from stats'}">${excluded?'🔄':'🚫'}</button>
          <button class="btn-icon btn-icon-danger" onclick="deleteTransactionById('${tx.id}')" title="Delete transaction">🗑️</button>
        </td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

// ─── INSIGHTS PAGE ─────────────────────────────────────────────
function renderInsights() {
  const container = document.getElementById('page-insights');
  if (!State.aiInsights.length && !State.summary) { container.innerHTML = renderEmptyState(); return; }

  const formatted = getFormattedInsights();
  const bySeverity = { risk:[], warning:[], opportunity:[], info:[] };
  formatted.forEach(i => { (bySeverity[i.severity]||bySeverity.info).push(i); });

  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;gap:12px;align-items:center">
      <button class="btn btn-primary btn-sm" onclick="generateAIInsights()" id="gen-insights-btn">🤖 Generate Fresh AI Insights</button>
      <span id="insight-gen-status" style="font-size:12px;color:var(--text-muted)"></span>
    </div>
    ${Object.entries(bySeverity).filter(([,arr])=>arr.length).map(([sev, items]) => `
      <div class="mb-24">
        <div class="section-title">${{risk:'🔴 Risks',warning:'⚠️ Warnings',opportunity:'✅ Opportunities',info:'ℹ️ Information'}[sev]}</div>
        <div class="insight-list">
          ${items.map((ins,i)=>`
            <div class="insight-item ${ins.severity}" style="animation-delay:${i*0.05}s">
              <div class="insight-icon">${ins.icon}</div>
              <div>
                <div class="severity-badge ${ins.severity}">${ins.severity.toUpperCase()}</div>
                <div class="insight-title">${ins.title}</div>
                <div class="insight-text">${ins.text}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
    <div class="mb-24">
      <div class="section-title">🔍 Anomaly Detection</div>
      ${renderAnomalies()}
    </div>
  `;
}

async function generateAIInsights() {
  if (!State.businessId) { showToast('No business selected','error'); return; }
  const btn = document.getElementById('gen-insights-btn');
  const status = document.getElementById('insight-gen-status');
  if (btn) { btn.disabled=true; btn.textContent='⏳ Generating...'; }
  if (status) status.textContent = 'AI is analyzing your data...';

  try {
    const result = await window.apiClient.getInsights(State.businessId);
    if (result.insights) {
      State.aiInsights = result.insights.map(i => ({
        text:i.text, title:i.title, insight_type:i.type,
        severity: i.severity==='high'?'risk':i.severity==='medium'?'warning':'info',
        _local:true, _icon:{health:'💰',risk:'⚠️',warning:'⚠️',opportunity:'✅',info:'ℹ️'}[i.type]||'💡',
        _title:i.title, _text:i.text,
        _severity: i.severity==='high'?'risk':i.severity==='medium'?'warning':i.severity==='low'?'info':(i.type||'info'),
      }));
    }
    if (result.executive_summary) State.executiveSummary = result.executive_summary;
    showToast(`✅ Generated ${State.aiInsights.length} AI insights`, 'success');
    renderInsights();
  } catch (err) {
    showToast('Failed: '+err.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='🤖 Generate Fresh AI Insights'; }
    if (status) status.textContent = '';
  }
}

function renderAnomalies() {
  const anomalies = State.anomalies||[];
  if (!anomalies.length) return '<div class="text-muted" style="font-size:13px">No anomalies detected.</div>';
  return `<div class="insight-list">${anomalies.map(a=>`
    <div class="insight-item warning">
      <div class="insight-icon">🔍</div>
      <div>
        <div class="insight-title">Unusual ${a.type||'Transaction'}</div>
        <div class="insight-text"><strong>${fmt(a.amount)}</strong> for <em>${a.description||''}</em> on ${formatDate(a.date)}. ${(a.multiplier||0).toFixed(1)}x higher than average.</div>
      </div>
    </div>
  `).join('')}</div>`;
}

// ─── FORECAST & HEALTH PAGE ────────────────────────────────────
function renderForecast() {
  const container = document.getElementById('page-forecast');
  if (!State.summary || !State.summary.transaction_count) { container.innerHTML = renderEmptyState(); return; }
  const s = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveSummary() : State.summary;
  const h = (State.excludedTxIds && State.excludedTxIds.size > 0) ? recomputeActiveHealth() : (State.health || { score:0, status:'Unknown', status_color:'#3b82f6', factors:[] });
  const forecasts = State.forecasts || [];

  container.innerHTML = `
    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header"><div class="card-title">🏥 Business Health Score</div></div>
        ${renderHealthRing(h)}
        <div style="margin-top:20px">
          <div class="section-title" style="font-size:13px">Score Breakdown</div>
          ${(h.factors||[]).map(f=>`
            <div class="health-factor-item" style="padding:8px 0;border-bottom:1px solid var(--border)">
              <div class="health-factor-dot" style="background:${f.positive?'#10b981':'#ef4444'}"></div>
              <div style="flex:1">${f.label}</div>
              <div class="progress-bar" style="width:80px;margin:0 12px">
                <div class="progress-fill" style="width:${Math.abs(f.pts/0.25)}%;background:${f.positive?'var(--gradient-3)':'var(--gradient-4)'}"></div>
              </div>
              <div style="font-size:12px;font-weight:600;color:${f.positive?'#10b981':'#ef4444'};width:30px;text-align:right">${f.pts>0?'+':''}${f.pts}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">💧 Cashflow Metrics</div></div>
        <div class="grid-2" style="margin-bottom:16px">
          ${metricChip('Daily Income', fmt(s.avg_daily_income), '#10b981')}
          ${metricChip('Daily Expense', fmt(s.avg_daily_expense), '#ef4444')}
          ${metricChip('Net Daily', (s.net_daily_change>=0?'+':'−')+fmt(s.net_daily_change), s.net_daily_change>=0?'#6366f1':'#ef4444')}
          ${metricChip('Profit Margin', s.profit_margin.toFixed(1)+'%', s.profit_margin>20?'#10b981':s.profit_margin>10?'#f59e0b':'#ef4444')}
        </div>
        <div class="card-header" style="margin-top:8px"><div class="card-title">🔮 7/30/90 Day Forecast</div></div>
        <div class="forecast-grid">
          ${forecasts.map(f=>`
            <div class="forecast-card">
              <div class="forecast-days">${f.days} Days</div>
              <div class="forecast-row"><span style="color:var(--text-muted)">Expected In</span><span style="color:#10b981;font-weight:600">${fmt(f.projected_income||0)}</span></div>
              <div class="forecast-row"><span style="color:var(--text-muted)">Expected Out</span><span style="color:#ef4444;font-weight:600">${fmt(f.projected_expenses||0)}</span></div>
              <div class="forecast-net" style="color:${(f.net_change||0)>=0?'#6366f1':'#ef4444'}">${(f.net_change||0)>=0?'▲':'▼'} ${fmt(f.net_change||0)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="chart-container mb-24">
      <div class="card-header"><div class="card-title">📈 Monthly Income vs Expense Trend</div></div>
      <div style="height:280px"><canvas id="trend-chart"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">🔄 Recurring Expense Analysis</div></div>
      <div class="grid-2">
        <div>${renderRecurring(State.recurring||[])}</div>
        <div>
          <div class="scenario-result" style="height:100%">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px">📌 Summary</div>
            ${(()=>{
              const rec = State.recurring||[];
              const total = rec.reduce((s,r)=>s+(r.avg_amount||r.avgAmount||0),0);
              return `
                <div class="forecast-row" style="padding:8px 0"><span>Recurring patterns</span><strong>${rec.length}</strong></div>
                <div class="forecast-row" style="padding:8px 0"><span>Total recurring cost</span><strong style="color:#ef4444">${fmt(total)}</strong></div>
                <div class="forecast-row" style="padding:8px 0"><span>% of total expenses</span><strong>${s.total_expenses>0?(total/s.total_expenses*100).toFixed(1):0}%</strong></div>
              `;
            })()}
          </div>
        </div>
      </div>
    </div>
  `;
  setTimeout(()=>initTrendChart(),50);
}

function metricChip(label, value, color) {
  return `<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;text-align:center">
    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${label}</div>
    <div style="font-size:17px;font-weight:700;color:${color}">${value}</div></div>`;
}

function initTrendChart() {
  const ctx = document.getElementById('trend-chart');
  if (!ctx || !State.summary) return;
  const months = State.summary.monthly_trends || [];
  new Chart(ctx, {
    type:'line',
    data: {
      labels: months.map(m=>m.month),
      datasets: [
        { label:'Money In', data:months.map(m=>m.income), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', tension:0.4, fill:true, pointRadius:5, pointHoverRadius:8 },
        { label:'Money Out', data:months.map(m=>m.expenses), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.1)', tension:0.4, fill:true, pointRadius:5, pointHoverRadius:8 }
      ]
    },
    options: chartOptions({prefix:'PKR '})
  });
}

// ─── GOALS & SCENARIOS ─────────────────────────────────────────
function renderGoals() {
  const container = document.getElementById('page-goals');
  if (!State.summary || !State.summary.transaction_count) { container.innerHTML = renderEmptyState(); return; }
  const s = State.summary;
  container.innerHTML = `
    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-header"><div class="card-title">🔬 What-If Scenario Simulator</div></div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Simulate changes to see how they impact your business</p>
        <div class="form-group">
          <label class="form-label">Largest Expense Change (%)</label>
          <div class="scenario-input-row"><input type="range" id="sc-fuel" min="-50" max="100" value="0" oninput="updateScenario()"><span id="sc-fuel-val" style="min-width:50px;color:var(--accent-light);font-weight:700">0%</span></div>
        </div>
        <div class="form-group">
          <label class="form-label">Salary Change (%)</label>
          <div class="scenario-input-row"><input type="range" id="sc-salary" min="-50" max="100" value="0" oninput="updateScenario()"><span id="sc-salary-val" style="min-width:50px;color:var(--accent-light);font-weight:700">0%</span></div>
        </div>
        <div class="form-group">
          <label class="form-label">Revenue Change (%)</label>
          <div class="scenario-input-row"><input type="range" id="sc-revenue" min="-50" max="100" value="0" oninput="updateScenario()"><span id="sc-revenue-val" style="min-width:50px;color:var(--accent-light);font-weight:700">0%</span></div>
        </div>
        <div class="scenario-result" id="scenario-result"><div style="font-size:13px;color:var(--text-muted)">Adjust sliders to see projected impact</div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🎯 Financial Goals</div><button class="btn btn-sm btn-primary" onclick="showAddGoalForm()">+ Add Goal</button></div>
        <div id="goal-form" style="display:none;margin-bottom:16px;padding:14px;background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid var(--border)">
          <div class="form-group"><label class="form-label">Goal Name</label><input class="form-input" id="goal-name" placeholder="e.g. Reduce Fuel Expenses"></div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Target (PKR)</label><input class="form-input" id="goal-target" type="number" placeholder="50000"></div>
            <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="goal-type"><option value="reduce_expense">Reduce Expense</option><option value="increase_revenue">Increase Revenue</option><option value="save_profit">Save/Profit Target</option></select></div>
          </div>
          <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="saveGoal()">Save Goal</button><button class="btn btn-secondary btn-sm" onclick="document.getElementById('goal-form').style.display='none'">Cancel</button></div>
        </div>
        <div id="goals-list">${renderGoalsList()}</div>
      </div>
    </div>
    <div class="exec-summary">
      <div class="exec-summary-label">💡 Daily Tip from Your AI CFO</div>
      <div class="exec-summary-text">${getDailyTip()}</div>
    </div>
  `;
}

function updateScenario() {
  const topCatPct = parseInt(document.getElementById('sc-fuel')?.value||0);
  const salaryPct = parseInt(document.getElementById('sc-salary')?.value||0);
  const revPct    = parseInt(document.getElementById('sc-revenue')?.value||0);
  document.getElementById('sc-fuel-val').textContent   = (topCatPct>=0?'+':'')+topCatPct+'%';
  document.getElementById('sc-salary-val').textContent = (salaryPct>=0?'+':'')+salaryPct+'%';
  document.getElementById('sc-revenue-val').textContent = (revPct>=0?'+':'')+revPct+'%';
  const s = State.summary;
  if (!s) return;
  const cats = s.category_breakdown||[];
  const topCatTotal = cats[0]?.total||0;
  const salaryTotal = cats.find(c=>c.name?.toLowerCase()==='salary')?.total||0;
  const topCatDelta = topCatTotal*(topCatPct/100);
  const salaryDelta = salaryTotal*(salaryPct/100);
  const newExpenses = s.total_expenses+topCatDelta+salaryDelta;
  const newRevenue  = s.total_income*(1+revPct/100);
  const newProfit   = newRevenue-newExpenses;
  const change      = newProfit-s.net_profit;
  document.getElementById('scenario-result').innerHTML = `
    <div style="font-size:13px;font-weight:700;margin-bottom:10px">📊 Projected Impact</div>
    <div class="forecast-row" style="padding:6px 0"><span>New Revenue</span><span style="color:#10b981;font-weight:600">${fmt(newRevenue)}</span></div>
    <div class="forecast-row" style="padding:6px 0"><span>New Expenses</span><span style="color:#ef4444;font-weight:600">${fmt(newExpenses)}</span></div>
    <div class="forecast-row" style="padding:6px 0"><span>Projected Profit</span><span style="color:${newProfit>=0?'#6366f1':'#ef4444'};font-weight:700;font-size:16px">${newProfit>=0?'':'-'}${fmt(newProfit)}</span></div>
    <div style="margin-top:8px;padding:8px;border-radius:var(--radius-sm);background:rgba(${change>=0?'16,185,129':'239,68,68'},0.1)">
      <span style="font-size:12px;color:${change>=0?'#10b981':'#ef4444'}">${change>=0?'📈':'📉'} Profit would ${change>=0?'increase':'decrease'} by ${fmt(Math.abs(change))}</span>
    </div>
  `;
}

function showAddGoalForm() { document.getElementById('goal-form').style.display='block'; }

function saveGoal() {
  const name = document.getElementById('goal-name')?.value.trim();
  const target = parseFloat(document.getElementById('goal-target')?.value);
  const type = document.getElementById('goal-type')?.value;
  if (!name || isNaN(target)) { showToast('Please fill in all fields','error'); return; }
  State.goals.push({ id:Date.now(), name, target, type, progress:computeGoalProgress(type,target) });
  document.getElementById('goal-form').style.display='none';
  document.getElementById('goals-list').innerHTML = renderGoalsList();
  showToast('Goal saved!','success');
}

function computeGoalProgress(type, target) {
  if (!State.summary) return 0;
  const s = State.summary;
  if (type==='increase_revenue') return Math.min(100,(s.total_income/target)*100);
  if (type==='save_profit')      return Math.min(100,(s.net_profit/target)*100);
  if (type==='reduce_expense')   return Math.min(100,Math.max(0,((target-s.total_expenses)/target+1)*100));
  return 0;
}

function renderGoalsList() {
  if (!State.goals.length) return '<div class="text-muted" style="font-size:13px;padding:12px 0">No goals set yet.</div>';
  return State.goals.map(g => {
    const prog = computeGoalProgress(g.type,g.target);
    const color = prog>=100?'#10b981':prog>50?'#6366f1':'#f59e0b';
    return `<div style="padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:10px;background:rgba(255,255,255,0.02)">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><div style="font-weight:600;font-size:13px">${g.name}</div><div style="font-size:12px;color:${color};font-weight:700">${prog.toFixed(1)}%</div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Target: ${fmt(g.target)}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${prog}%;background:linear-gradient(90deg,${color},${color}aa)"></div></div>
    </div>`;
  }).join('');
}

function getDailyTip() {
  const tips = [
    "Review your recurring expenses monthly — they often grow unnoticed.",
    "A 10% cut in your largest expense category can significantly boost monthly profit.",
    "Diversifying your customer base reduces dependency risk.",
    "Track cash flow daily — a profitable business can still fail from poor timing.",
    "Compare supplier costs quarterly. Competitive quotes often save 10-20%.",
    "Set a monthly savings target of at least 5% of revenue for reserves.",
    "Your best customers deserve extra attention — losing one impacts cash flow immediately.",
  ];
  return tips[new Date().getDate()%tips.length];
}

// ─── CHAT PAGE (AI-Powered) ───────────────────────────────────
function renderChat() {
  const container = document.getElementById('page-chat');
  container.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-header">
        <div class="chat-avatar">🤖</div>
        <div><div style="font-weight:700;font-size:15px">AI Financial Co-Pilot</div><div style="font-size:12px;color:var(--text-muted)">Powered by AI — your 24/7 business advisor</div></div>
        <div style="margin-left:auto"><span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;margin-right:6px;box-shadow:0 0 6px #10b981"></span><span style="font-size:12px;color:#10b981">Online</span></div>
      </div>
      <div class="chat-suggestions">
        ${['How much did I spend on fuel?','Who is my best customer?','Why is my profit low?','What is my cashflow forecast?','What are my biggest expenses?','How is my business doing?']
          .map(s=>`<button class="chat-suggestion-chip" onclick="sendSuggestion('${s}')">${s}</button>`).join('')}
      </div>
      <div class="chat-messages" id="chat-messages">
        ${renderChatHistory()}
        ${!State.chatHistory.length ? `<div class="chat-msg ai"><div class="msg-avatar">🤖</div><div class="chat-bubble">
          👋 Hello! I'm your <strong>AI Financial Co-Pilot</strong>.<br><br>
          ${State.processed.length ? `I've analyzed your <strong>${State.processed.length}</strong> transactions. Ask me anything!` : 'Upload your transactions first via <strong>Add Data</strong> in the sidebar.'}
        </div></div>` : ''}
      </div>
      <div class="chat-input-wrap">
        <input class="chat-input" id="chat-input" placeholder="Ask your financial co-pilot anything..." onkeydown="if(event.key==='Enter')sendChat()">
        <button class="btn btn-primary" onclick="sendChat()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Send
        </button>
      </div>
    </div>
  `;
  setTimeout(()=>{ const m=document.getElementById('chat-messages'); if(m)m.scrollTop=m.scrollHeight; },100);
}

function renderChatHistory() {
  return State.chatHistory.map(msg=>`
    <div class="chat-msg ${msg.role}"><div class="msg-avatar">${msg.role==='ai'?'🤖':'👤'}</div><div class="chat-bubble">${renderMarkdown(msg.text)}</div></div>
  `).join('');
}

function renderMarkdown(text) {
  return text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
}

function sendSuggestion(text) { document.getElementById('chat-input').value=text; sendChat(); }

async function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  if (!State.processed.length) {
    State.chatHistory.push({role:'user',text});
    State.chatHistory.push({role:'ai',text:'⚠️ No transaction data loaded yet. Please upload a CSV from the **Add Data** section.'});
    renderChat(); return;
  }

  State.chatHistory.push({role:'user',text});
  input.value = '';
  renderChat();

  const msgs = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className='chat-msg ai'; typing.id='typing-indicator';
  typing.innerHTML=`<div class="msg-avatar">🤖</div><div class="chat-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(typing); msgs.scrollTop=msgs.scrollHeight;

  try {
    if (State.businessId) {
      const result = await window.apiClient.sendChat(State.businessId, text, State.chatHistory.slice(-6));
      typing.remove();
      State.chatHistory.push({role:'ai',text:result.response});
    } else {
      const response = E.processChat(text, State.processed, State.summary, State.health);
      typing.remove();
      State.chatHistory.push({role:'ai',text:response});
    }
  } catch(err) {
    typing.remove();
    const response = E.processChat(text, State.processed, State.summary ? {
      totalIncome:State.summary.total_income, totalExpenses:State.summary.total_expenses,
      netProfit:State.summary.net_profit, profitMargin:State.summary.profit_margin,
      avgDailyIncome:State.summary.avg_daily_income, avgDailyExpense:State.summary.avg_daily_expense,
      netDailyChange:State.summary.net_daily_change, transactionCount:State.summary.transaction_count,
      categoryBreakdown:Object.fromEntries((State.summary.category_breakdown||[]).map(c=>[c.name,c.total])),
      customers:(State.summary.customers||[]).map(c=>({name:c.name,total:c.total,count:c.count})),
      suppliers:(State.summary.suppliers||[]).map(s=>({name:s.name,total:s.total,count:s.count})),
      monthly:(State.summary.monthly_trends||[]).map(m=>({label:m.month,income:m.income,expenses:m.expenses})),
    }:null, State.health);
    State.chatHistory.push({role:'ai',text:response});
  }
  renderChat();
}

// ─── UPLOAD HANDLERS ──────────────────────────────────────────

function renderUploadPage() {
  document.getElementById('csv-file-input')?.addEventListener('change', handleFileUpload);
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) { showToast('Please upload a CSV file','error'); return; }

  const reader = new FileReader();
  reader.onload = async(ev) => {
    const csvText = ev.target.result;
    const progressEl = document.getElementById('upload-progress');
    const statusEl = document.getElementById('upload-status');
    const barEl = document.getElementById('upload-progress-bar');
    if (progressEl) progressEl.style.display='block';
    if (statusEl) statusEl.textContent='📤 Uploading to server...';
    if (barEl) barEl.style.width='20%';

    try {
      if (State.businessId) {
        if (statusEl) statusEl.textContent='🤖 AI is classifying your transactions...';
        if (barEl) barEl.style.width='50%';
        const result = await window.apiClient.uploadCSVText(State.businessId, csvText);
        if (barEl) barEl.style.width='90%';
        if (statusEl) statusEl.textContent='✅ Processing complete!';
        showToast(`✅ ${result.count} transactions processed with AI!`,'success');
        await refreshAfterDataChange();
        if (barEl) barEl.style.width='100%';
        setTimeout(()=>{ if(progressEl) progressEl.style.display='none'; navigate('dashboard'); },1000);
      } else {
        const rows = E.parseCSV(csvText);
        if (!rows.length) { showToast('CSV is empty or invalid','error'); return; }
        State.transactions=[...State.transactions,...rows];
        processData(State.transactions);
        if (progressEl) progressEl.style.display='none';
      }
    } catch(err) {
      showToast('Error: '+err.message,'error');
      if (progressEl) progressEl.style.display='none';
      try { const rows=E.parseCSV(csvText); if(rows.length){State.transactions=[...State.transactions,...rows]; processData(State.transactions); showToast('Processed locally','warning');} }
      catch(e2) { showToast('CSV parse failed','error'); }
    }
  };
  reader.readAsText(file);
}

function handleDragOver(e) { e.preventDefault(); document.getElementById('upload-zone')?.classList.add('drag-over'); }
function handleDragLeave() { document.getElementById('upload-zone')?.classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault(); document.getElementById('upload-zone')?.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) { const inp=document.getElementById('csv-file-input'); const dt=new DataTransfer(); dt.items.add(file); if(inp){inp.files=dt.files;handleFileUpload({target:inp});} }
}

async function addManualTransaction(e) {
  e.preventDefault();
  const date=document.getElementById('mt-date')?.value;
  const desc=document.getElementById('mt-desc')?.value?.trim();
  const amt=parseFloat(document.getElementById('mt-amount')?.value);
  const method=document.getElementById('mt-method')?.value||'';
  if (!date||!desc||isNaN(amt)) { showToast('Fill in all fields','error'); return; }

  // Show processing indicator
  const progressEl=document.getElementById('manual-processing');
  const btn=e.target.querySelector('button[type="submit"]');
  if(btn){btn.disabled=true;btn.textContent='⏳ Processing...';}
  if(progressEl)progressEl.style.display='flex';

  try {
    if (State.businessId) {
      await window.apiClient.createTransaction({business_id:State.businessId,date,description:desc,amount:amt,payment_method:method||undefined});
      showToast('✅ Transaction added with AI classification!','success');
      document.getElementById('manual-form').reset();
      document.getElementById('mt-date').value=new Date().toISOString().split('T')[0];
      await refreshAfterDataChange();
    } else {
      State.transactions.push({id:'TX-M-'+Date.now(),date,description:desc,amount:amt,payment_method:method});
      processData(State.transactions);
      document.getElementById('manual-form').reset();
      document.getElementById('mt-date').value=new Date().toISOString().split('T')[0];
    }
  } catch(err) { showToast('Failed: '+err.message,'error');
  } finally {
    if(btn){btn.disabled=false;btn.textContent='➕ Add Transaction';}
    if(progressEl)progressEl.style.display='none';
  }
}

async function clearAllData() {
  if (!confirm('Clear all local transaction data?')) return;
  State.transactions=[]; State.processed=[]; State.summary=null; State.health=null;
  State.insights=[]; State.aiInsights=[]; State.chatHistory=[];
  State.recurring=[]; State.anomalies=[]; State.forecasts=[];
  State.executiveSummary='';
  updateSidebarHealth();
  const badge=document.getElementById('insight-badge'); if(badge)badge.style.display='none';
  ['upload-tx-count','upload-insight-count','tx-count-stat'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='0';});
  showToast('Local data cleared','info'); navigate('upload');
}

async function loadSampleData() {
  if (State._loadingSample) return;
  State._loadingSample = true;
  const sample = `Date,Description,PaymentMethod,Amount
2026-01-05,Payment from Ali Electric,Bank Transfer,12000
2026-01-06,Shell Petrol,Cash,-3500
2026-01-08,Payment from Khan Traders,Bank Transfer,8500
2026-01-10,Purchase from Metro Tools,Cash,-4200
2026-01-12,Office Rent Payment,Bank Transfer,-15000
2026-01-14,Payment from City Builders,Bank Transfer,22000
2026-01-15,Sui Gas Bill,Bank Transfer,-2800
2026-01-16,Employee Salary,Bank Transfer,-18000
2026-01-18,WAPDA Electricity Bill,Bank Transfer,-3200
2026-01-20,Payment from Star Industries,Bank Transfer,9500
2026-01-22,Fuel for Vehicle,Cash,-2900
2026-01-25,Payment from Rehman Store,Cash,6000
2026-01-28,Supplies from ABC Traders,Cash,-3800
2026-02-02,Payment from Ali Electric,Bank Transfer,13000
2026-02-04,Shell Petrol,Cash,-4100
2026-02-05,Payment from Khan Traders,Bank Transfer,7800
2026-02-07,Office Rent Payment,Bank Transfer,-15000
2026-02-10,Employee Salary,Bank Transfer,-18000
2026-02-12,Payment from New Horizons Ltd,Bank Transfer,28000
2026-02-14,Purchase from Metro Tools,Credit Card,-5800
2026-02-15,Google Ads Campaign,Credit Card,-3500
2026-02-18,Sui Gas Bill,Bank Transfer,-2900
2026-02-20,Payment from City Builders,Bank Transfer,18000
2026-02-22,WAPDA Electricity Bill,Bank Transfer,-3400
2026-02-24,Internet Bill Cybernet,Bank Transfer,-2200
2026-02-25,Payment from Malik Store,Cash,4500
2026-02-26,Marketing Brochures,Cash,-1800
2026-02-27,Payment from Ali Electric,Bank Transfer,11000`;

  const progressEl=document.getElementById('upload-progress');
  const statusEl=document.getElementById('upload-status');
  const barEl=document.getElementById('upload-progress-bar');
  if(progressEl)progressEl.style.display='block';
  if(statusEl)statusEl.textContent='🎲 Loading sample data...';
  if(barEl)barEl.style.width='30%';

  try {
    if (State.businessId) {
      if(statusEl)statusEl.textContent='🤖 AI is classifying sample transactions...';
      if(barEl)barEl.style.width='50%';
      const result = await window.apiClient.uploadCSVText(State.businessId, sample);
      if(barEl)barEl.style.width='90%';
      showToast(`✅ ${result.count} sample transactions loaded!`,'success');
      await refreshAfterDataChange();
      if(barEl)barEl.style.width='100%';
      setTimeout(()=>{ if(progressEl)progressEl.style.display='none'; navigate('dashboard'); },1000);
    } else {
      const rows=E.parseCSV(sample); State.transactions=rows; processData(State.transactions);
      if(progressEl)progressEl.style.display='none';
    }
  } catch(err) {
    showToast('Backend error, loading locally','warning');
    if(progressEl)progressEl.style.display='none';
    try { const rows=E.parseCSV(sample); State.transactions=rows; processData(State.transactions); } catch(e2) { showToast('Error: '+e2.message,'error'); }
  } finally {
    State._loadingSample = false;
  }
}

// ─── Health ring animation ────────────────────────────────────
function animateHealthRing() {
  const el = document.getElementById('health-ring-anim');
  if (!el || !State.health) return;
  const R=50, C=Math.PI*2*R;
  const offset = C-(State.health.score/100)*C;
  setTimeout(()=>{ el.style.strokeDashoffset=offset; },100);
}

function renderEmptyState() {
  return `<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No Data Yet</h3>
    <p style="margin-bottom:24px">Upload your transactions to see insights</p>
    <button class="btn btn-primary btn-lg" onclick="navigate('upload')">📤 Upload Transactions</button></div>`;
}

const ringObserver = new MutationObserver(()=>animateHealthRing());

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const mtDate=document.getElementById('mt-date');
  if(mtDate) mtDate.value=new Date().toISOString().split('T')[0];

  renderUploadPage();

  document.getElementById('hamburger-btn')?.addEventListener('click',()=>{
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 1024) {
      sidebar.classList.toggle('open');
    } else {
      toggleSidebar();
    }
  });

  document.getElementById('google-login-btn')?.addEventListener('click',()=>{
    document.getElementById('login-loading').style.display='flex';
    window.supabaseAuth.signInWithOAuth('google');
  });

  document.getElementById('create-business-btn')?.addEventListener('click', handleCreateBusiness);
  document.getElementById('business-name-input')?.addEventListener('keydown',(e)=>{
    if(e.key==='Enter') handleCreateBusiness();
  });

  window.supabaseAuth.onAuthStateChange(handleAuthStateChange);
  ringObserver.observe(document.body, { childList:true, subtree:true });

  await window.supabaseAuth.initialize();
});

// ─── Global exports ───────────────────────────────────────────
// ─── Exclude / Delete Transaction ──────────────────────────────
function toggleExcludeTransaction(txId) {
  if (State.excludedTxIds.has(txId)) {
    State.excludedTxIds.delete(txId);
    showToast('Transaction included in stats','info');
  } else {
    State.excludedTxIds.add(txId);
    showToast('Transaction excluded from stats','info');
  }
  // Re-render current view
  if (State.activeNav === 'transactions') renderTransactions();
  // Also refresh dashboard stats since excluded tx affect totals
  if (State.activeNav === 'dashboard') renderDashboard();
  // Update sidebar health chip with filtered data
  const activeHealth = recomputeActiveHealth();
  if (activeHealth) {
    const chip = document.getElementById('health-chip');
    if (chip) {
      chip.innerHTML = `
        <div>
          <div class="score-num" style="color:${activeHealth.status_color || activeHealth.statusColor || '#3b82f6'}">${activeHealth.score}</div>
          <div style="font-size:10px;color:var(--text-muted)">${activeHealth.status}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary)">Business Health</div>
      `;
    }
  }
}

async function deleteTransactionById(txId) {
  if (!confirm('Delete this transaction permanently?')) return;
  try {
    if (State.businessId) {
      await window.apiClient.deleteTransaction(txId);
      showToast('Transaction deleted','success');
      await refreshAfterDataChange();
    } else {
      State.transactions = State.transactions.filter(t => t.id !== txId);
      State.processed = State.processed.filter(t => t.id !== txId);
      showToast('Transaction deleted','success');
      renderTransactions();
    }
  } catch(err) { showToast('Delete failed: '+err.message,'error'); }
}

// ─── Sidebar Toggle ────────────────────────────────────────────
function toggleSidebar() {
  State.sidebarCollapsed = !State.sidebarCollapsed;
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main-content');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  if (State.sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    main.classList.add('sidebar-collapsed');
    if (toggleBtn) toggleBtn.textContent = '☰';
  } else {
    sidebar.classList.remove('collapsed');
    main.classList.remove('sidebar-collapsed');
    if (toggleBtn) toggleBtn.textContent = '✕';
  }
}

// ─── Email/Password Auth ───────────────────────────────────────
async function handleEmailRegister() {
  const email = document.getElementById('register-email')?.value?.trim();
  const password = document.getElementById('register-password')?.value;
  const confirm = document.getElementById('register-confirm')?.value;
  const errEl = document.getElementById('register-error');
  if (!email || !password) { if(errEl){errEl.textContent='Email and password are required';errEl.style.display='block';} return; }
  if (password.length < 6) { if(errEl){errEl.textContent='Password must be at least 6 characters';errEl.style.display='block';} return; }
  if (password !== confirm) { if(errEl){errEl.textContent='Passwords do not match';errEl.style.display='block';} return; }
  if(errEl)errEl.style.display='none';
  const btn = document.getElementById('register-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Creating account...';}
  try {
    const resp = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Registration failed');
    if (data.session && data.session.access_token) {
      window.supabaseAuth.session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: Math.floor(Date.now()/1000)+(data.session.expires_in||3600), user: data.user };
      window.supabaseAuth.user = data.user;
      localStorage.setItem('sb-session', JSON.stringify(window.supabaseAuth.session));
      window.supabaseAuth._notify('SIGNED_IN');
      showToast('✅ Account created & signed in!','success');
    } else {
      showToast('✅ Account created! Please sign in.','success');
      switchToLogin();
    }
  } catch(err) { if(errEl){errEl.textContent=err.message;errEl.style.display='block';} }
  finally { if(btn){btn.disabled=false;btn.textContent='Create Free Account';} }
}

async function handleEmailLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  const errEl = document.getElementById('email-login-error');
  if (!email || !password) { if(errEl){errEl.textContent='Email and password are required';errEl.style.display='block';} return; }
  if(errEl)errEl.style.display='none';
  const btn = document.getElementById('email-login-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Signing in...';}
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error_description || data.msg || 'Login failed');
    window.supabaseAuth.session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now()/1000)+(data.expires_in||3600), user: data.user };
    window.supabaseAuth.user = data.user;
    localStorage.setItem('sb-session', JSON.stringify(window.supabaseAuth.session));
    window.supabaseAuth._notify('SIGNED_IN');
  } catch(err) { if(errEl){errEl.textContent=err.message;errEl.style.display='block';} }
  finally { if(btn){btn.disabled=false;btn.textContent='Sign In';} }
}

function switchToRegister() {
  document.getElementById('login-form-section').style.display='none';
  document.getElementById('register-form-section').style.display='block';
  const t=document.getElementById('auth-card-title'); if(t) t.textContent='Create your account';
  const s=document.getElementById('auth-card-sub'); if(s) s.textContent='Start tracking your finances in seconds';
}
function switchToLogin() {
  document.getElementById('register-form-section').style.display='none';
  document.getElementById('login-form-section').style.display='block';
  const t=document.getElementById('auth-card-title'); if(t) t.textContent='Welcome back';
  const s=document.getElementById('auth-card-sub'); if(s) s.textContent='Sign in to your account to continue';
}

window.navigate = navigate;
window.filterTransactions = filterTransactions;
window.switchChartPeriod = switchChartPeriod;
window.sendChat = sendChat;
window.sendSuggestion = sendSuggestion;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.addManualTransaction = addManualTransaction;
window.clearAllData = clearAllData;
window.loadSampleData = loadSampleData;
window.showAddGoalForm = showAddGoalForm;
window.saveGoal = saveGoal;
window.updateScenario = updateScenario;
window.animateHealthRing = animateHealthRing;
window.handleLogout = handleLogout;
window.selectBusinessById = selectBusinessById;
window.generateAIInsights = generateAIInsights;
window.toggleExcludeTransaction = toggleExcludeTransaction;
window.deleteTransactionById = deleteTransactionById;
window.toggleSidebar = toggleSidebar;
window.handleEmailRegister = handleEmailRegister;
window.handleEmailLogin = handleEmailLogin;
window.switchToRegister = switchToRegister;
window.switchToLogin = switchToLogin;
window.State = State;
window.processData = processData;
