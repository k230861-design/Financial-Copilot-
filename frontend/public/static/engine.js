// ============================================================
// AI Financial Co-Pilot – Core Engine
// All processing runs client-side (no external API calls)
// ============================================================

// ─── Transaction ID Generator ────────────────────────────────
let txCounter = 0;
function generateId() {
  return 'TX-' + Date.now() + '-' + (++txCounter).toString().padStart(4, '0');
}

// ─── Category Classification Rules ───────────────────────────
const EXPENSE_CATEGORIES = [
  { name: 'Fuel',         keywords: ['fuel', 'petrol', 'diesel', 'gas station', 'shell', 'pso', 'caltex', 'total', 'hpcl', 'bpcl', 'enoc', 'adnoc', 'pump'] },
  { name: 'Rent',         keywords: ['rent', 'lease', 'office rent', 'shop rent', 'warehouse rent', 'tenancy'] },
  { name: 'Utilities',    keywords: ['electric', 'electricity', 'water bill', 'gas bill', 'utility', 'wapda', 'sui gas', 'kesc', 'internet bill', 'broadband', 'wifi bill', 'telephone', 'phone bill'] },
  { name: 'Salary',       keywords: ['salary', 'salaries', 'wages', 'payroll', 'staff payment', 'employee payment', 'worker pay', 'advance salary'] },
  { name: 'Tools',        keywords: ['tools', 'equipment', 'machinery', 'hardware', 'drill', 'wrench', 'spare parts', 'parts', 'workshop'] },
  { name: 'Supplies',     keywords: ['supplies', 'stationery', 'office supplies', 'packaging', 'raw material', 'material', 'stock purchase', 'inventory'] },
  { name: 'Subscription', keywords: ['subscription', 'netflix', 'spotify', 'adobe', 'microsoft', 'google workspace', 'zoom', 'saas', 'software', 'license', 'annual fee', 'monthly fee'] },
  { name: 'Marketing',    keywords: ['marketing', 'advertising', 'ads', 'facebook ads', 'google ads', 'promotion', 'brochure', 'banner', 'social media', 'campaign'] },
  { name: 'Transport',    keywords: ['transport', 'delivery', 'courier', 'freight', 'logistics', 'shipping', 'bike', 'vehicle', 'uber', 'careem', 'taxi'] },
  { name: 'Repair',       keywords: ['repair', 'maintenance', 'service charge', 'fix', 'overhaul', 'servicing'] },
  { name: 'Food',         keywords: ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'meal', 'canteen', 'snacks', 'tea', 'coffee'] },
];

const INCOME_CATEGORIES = [
  { name: 'Customer Payment', keywords: ['payment from', 'received from', 'paid by', 'cheque from', 'transfer from', 'amount from'] },
  { name: 'Service Revenue',  keywords: ['service', 'consulting', 'repair service', 'installation', 'maintenance service', 'labor', 'work order', 'job'] },
  { name: 'Product Sales',    keywords: ['sale', 'sold', 'sales', 'invoice', 'order', 'supply', 'delivery'] },
  { name: 'Refund',           keywords: ['refund', 'return', 'cashback', 'reversal', 'credit note'] },
];

function classifyCategory(description, isExpense) {
  const desc = description.toLowerCase();
  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      if (desc.includes(kw)) return cat.name;
    }
  }
  return isExpense ? 'Miscellaneous' : 'Other Income';
}

// ─── Entity Extraction ────────────────────────────────────────
const INCOME_ENTITY_PATTERNS = [
  /payment from ([a-zA-Z0-9 &.'-]+)/i,
  /received from ([a-zA-Z0-9 &.'-]+)/i,
  /paid by ([a-zA-Z0-9 &.'-]+)/i,
  /from ([a-zA-Z0-9 &.'-]+)/i,
  /([a-zA-Z0-9 &.'-]+) payment/i,
];

const EXPENSE_ENTITY_PATTERNS = [
  /purchase from ([a-zA-Z0-9 &.'-]+)/i,
  /paid to ([a-zA-Z0-9 &.'-]+)/i,
  /payment to ([a-zA-Z0-9 &.'-]+)/i,
  /to ([a-zA-Z0-9 &.'-]+)/i,
  /at ([a-zA-Z0-9 &.'-]+)/i,
  /([a-zA-Z0-9 &.'-]+) purchase/i,
  /([a-zA-Z0-9 &.'-]+) bill/i,
  /([a-zA-Z0-9 &.'-]+) invoice/i,
];

// Brand names often used as entity names
const KNOWN_ENTITIES = ['shell', 'pso', 'metro', 'kfc', 'mcdonalds', 'carrefour', 'daewoo', 'google', 'amazon', 'facebook', 'microsoft'];

function extractEntity(description, isExpense) {
  const patterns = isExpense ? EXPENSE_ENTITY_PATTERNS : INCOME_ENTITY_PATTERNS;
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      let entity = match[1].trim();
      // Clean trailing common words
      entity = entity.replace(/\b(for|the|a|an|on|in|at|from|to|of)\b$/i, '').trim();
      if (entity.length > 1 && entity.length < 40) return titleCase(entity);
    }
  }
  // Check for known brand names
  const desc = description.toLowerCase();
  for (const brand of KNOWN_ENTITIES) {
    if (desc.includes(brand)) return titleCase(brand);
  }
  return '';
}

function titleCase(str) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// ─── Auto Tagging ─────────────────────────────────────────────
function autoTag(tx, allTxs) {
  const tags = [];
  const absMean = allTxs.filter(t => t.type === tx.type).reduce((s, t) => s + Math.abs(t.amount), 0) /
    (allTxs.filter(t => t.type === tx.type).length || 1);

  if (Math.abs(tx.amount) > absMean * 2) tags.push('Large');
  if (tx.category === 'Salary' || tx.category === 'Rent' || tx.category === 'Subscription') tags.push('Recurring');
  if (tx.type === 'Expense' && Math.abs(tx.amount) > absMean * 3) tags.push('High Priority');
  if (['Fuel', 'Supplies', 'Tools', 'Utilities'].includes(tx.category)) tags.push('Operational');

  return tags;
}

// ─── Recurring Detection ──────────────────────────────────────
function detectRecurring(transactions) {
  const groups = {};
  transactions.forEach(tx => {
    const key = tx.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const recurring = [];
  Object.values(groups).forEach(group => {
    if (group.length >= 2) {
      // Check if amounts are similar (within 10%)
      const amounts = group.map(t => Math.abs(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const allSimilar = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);
      if (allSimilar) {
        recurring.push({
          description: group[0].description,
          count: group.length,
          avgAmount,
          category: group[0].category,
          type: group[0].type
        });
      }
    }
  });
  return recurring;
}

// ─── Duplicate Detection ──────────────────────────────────────
function detectDuplicates(transactions) {
  const duplicates = [];
  const seen = {};
  transactions.forEach(tx => {
    const key = `${tx.date}|${tx.amount}|${tx.description.toLowerCase().trim()}`;
    if (seen[key]) {
      duplicates.push(tx);
    } else {
      seen[key] = true;
    }
  });
  return duplicates;
}

// ─── Main Processing Function ─────────────────────────────────
function processTransactions(rawTxs) {
  return rawTxs.map(raw => {
    const amount = parseFloat(raw.amount);
    const isExpense = amount < 0;
    const type = isExpense ? 'Expense' : 'Income';
    const category = classifyCategory(raw.description, isExpense);
    const entity_name = extractEntity(raw.description, isExpense);

    return {
      id: raw.id || generateId(),
      date: raw.date,
      description: raw.description,
      amount: amount,
      type,
      category,
      entity_name,
      tags: [],
      paymentMethod: raw.paymentMethod || '',
      balance: raw.balance || null
    };
  }).map((tx, _, arr) => {
    tx.tags = autoTag(tx, arr);
    return tx;
  });
}

// ─── Financial Summary ────────────────────────────────────────
function computeSummary(transactions) {
  const income = transactions.filter(t => t.type === 'Income');
  const expenses = transactions.filter(t => t.type === 'Expense');

  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = Math.abs(expenses.reduce((s, t) => s + t.amount, 0));
  const netProfit = totalIncome - totalExpenses;

  // Date range
  const dates = transactions.map(t => new Date(t.date)).filter(d => !isNaN(d));
  const minDate = dates.length ? new Date(Math.min(...dates)) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
  const daySpan = minDate && maxDate ? Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1) : 1;

  const avgDailyIncome = totalIncome / daySpan;
  const avgDailyExpense = totalExpenses / daySpan;
  const netDailyChange = avgDailyIncome - avgDailyExpense;

  // Monthly breakdown
  const monthly = {};
  transactions.forEach(tx => {
    const d = new Date(tx.date);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) monthly[key] = { income: 0, expenses: 0, label: key };
    if (tx.type === 'Income') monthly[key].income += tx.amount;
    else monthly[key].expenses += Math.abs(tx.amount);
  });

  // Category breakdown
  const categoryBreakdown = {};
  expenses.forEach(tx => {
    if (!categoryBreakdown[tx.category]) categoryBreakdown[tx.category] = 0;
    categoryBreakdown[tx.category] += Math.abs(tx.amount);
  });

  // Customer analysis
  const customers = {};
  income.forEach(tx => {
    if (!tx.entity_name) return;
    if (!customers[tx.entity_name]) customers[tx.entity_name] = { name: tx.entity_name, total: 0, count: 0 };
    customers[tx.entity_name].total += tx.amount;
    customers[tx.entity_name].count++;
  });

  // Supplier analysis
  const suppliers = {};
  expenses.forEach(tx => {
    if (!tx.entity_name) return;
    if (!suppliers[tx.entity_name]) suppliers[tx.entity_name] = { name: tx.entity_name, total: 0, count: 0 };
    suppliers[tx.entity_name].total += Math.abs(tx.amount);
    suppliers[tx.entity_name].count++;
  });

  return {
    totalIncome,
    totalExpenses,
    netProfit,
    transactionCount: transactions.length,
    avgDailyIncome,
    avgDailyExpense,
    netDailyChange,
    monthly: Object.values(monthly).sort((a, b) => a.label.localeCompare(b.label)),
    categoryBreakdown,
    customers: Object.values(customers).sort((a, b) => b.total - a.total),
    suppliers: Object.values(suppliers).sort((a, b) => b.total - a.total),
    dateRange: { min: minDate, max: maxDate, daySpan },
    profitMargin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
    expenseRatio: totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0,
  };
}

// ─── Health Score ─────────────────────────────────────────────
function computeHealthScore(summary, transactions) {
  let score = 50;
  const factors = [];

  // Profitability (max 25 pts)
  if (summary.netProfit > 0) {
    const margin = summary.profitMargin;
    if (margin > 30) { score += 25; factors.push({ label: 'Strong profit margin', pts: 25, positive: true }); }
    else if (margin > 15) { score += 15; factors.push({ label: 'Healthy profit margin', pts: 15, positive: true }); }
    else if (margin > 5)  { score += 8;  factors.push({ label: 'Thin profit margin', pts: 8, positive: true }); }
    else                   { score += 2;  factors.push({ label: 'Very thin margin', pts: 2, positive: false }); }
  } else {
    score -= 20;
    factors.push({ label: 'Operating at a loss', pts: -20, positive: false });
  }

  // Expense ratio (max 15 pts)
  if (summary.expenseRatio < 50) { score += 15; factors.push({ label: 'Low expense ratio', pts: 15, positive: true }); }
  else if (summary.expenseRatio < 70) { score += 8; factors.push({ label: 'Moderate expense ratio', pts: 8, positive: true }); }
  else if (summary.expenseRatio < 85) { score -= 5; factors.push({ label: 'High expense ratio', pts: -5, positive: false }); }
  else { score -= 15; factors.push({ label: 'Very high expense ratio', pts: -15, positive: false }); }

  // Customer concentration
  if (summary.customers.length > 0) {
    const topShare = (summary.customers[0].total / summary.totalIncome) * 100;
    if (topShare > 60) { score -= 10; factors.push({ label: 'High customer concentration risk', pts: -10, positive: false }); }
    else if (topShare > 40) { score -= 5; factors.push({ label: 'Moderate concentration risk', pts: -5, positive: false }); }
    else { score += 5; factors.push({ label: 'Diversified customer base', pts: 5, positive: true }); }
  }

  // Cashflow
  if (summary.netDailyChange > 0) { score += 5; factors.push({ label: 'Positive daily cash flow', pts: 5, positive: true }); }
  else { score -= 5; factors.push({ label: 'Negative daily cash flow', pts: -5, positive: false }); }

  const finalScore = Math.max(0, Math.min(100, score));
  let status = '', statusColor = '';
  if (finalScore >= 80) { status = 'Healthy'; statusColor = '#10b981'; }
  else if (finalScore >= 60) { status = 'Stable'; statusColor = '#3b82f6'; }
  else if (finalScore >= 40) { status = 'Needs Attention'; statusColor = '#f59e0b'; }
  else { status = 'At Risk'; statusColor = '#ef4444'; }

  return { score: finalScore, status, statusColor, factors };
}

// ─── Insight Generation ───────────────────────────────────────
function generateInsights(transactions, summary) {
  const insights = [];
  const fmt = n => 'PKR ' + Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });

  // ── Business Health ──
  if (summary.netProfit >= 0) {
    insights.push({
      type: 'health', severity: 'info',
      icon: '💰',
      title: 'Business is Profitable',
      text: `Your total profit is ${fmt(summary.netProfit)} (${summary.profitMargin.toFixed(1)}% margin). Expenses are ${summary.expenseRatio.toFixed(1)}% of revenue.`
    });
  } else {
    insights.push({
      type: 'health', severity: 'risk',
      icon: '⚠️',
      title: 'Operating at a Loss',
      text: `Your total loss is ${fmt(summary.netProfit)}. Expenses exceed income by ${fmt(Math.abs(summary.netProfit))}.`
    });
  }

  // ── Expense Distribution ──
  const catEntries = Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  if (catEntries.length > 0) {
    const [topCat, topAmt] = catEntries[0];
    const pct = summary.totalExpenses > 0 ? (topAmt / summary.totalExpenses * 100).toFixed(1) : 0;
    insights.push({
      type: 'expense', severity: pct > 30 ? 'warning' : 'info',
      icon: '📊',
      title: 'Top Expense Category',
      text: `${topCat} is your largest expense at ${fmt(topAmt)} (${pct}% of total expenses).`
    });
  }

  // ── Monthly Trend ──
  const months = summary.monthly;
  if (months.length >= 2) {
    const prev = months[months.length - 2];
    const curr = months[months.length - 1];
    const incomeChange = prev.income > 0 ? ((curr.income - prev.income) / prev.income * 100) : 0;
    const expenseChange = prev.expenses > 0 ? ((curr.expenses - prev.expenses) / prev.expenses * 100) : 0;

    if (incomeChange !== 0) {
      insights.push({
        type: 'trend', severity: incomeChange > 0 ? 'opportunity' : 'warning',
        icon: incomeChange > 0 ? '📈' : '📉',
        title: `Revenue ${incomeChange > 0 ? 'Increased' : 'Decreased'}`,
        text: `Money In ${incomeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(incomeChange).toFixed(1)}% compared to last month.`
      });
    }

    if (expenseChange > 0 && incomeChange < expenseChange) {
      insights.push({
        type: 'trend', severity: 'risk',
        icon: '🔴',
        title: 'Expenses Growing Faster Than Revenue',
        text: `Expenses grew ${expenseChange.toFixed(1)}% while revenue grew ${incomeChange.toFixed(1)}%. This trend is unsustainable.`
      });
    }

    // Category trend
    catEntries.slice(0, 2).forEach(([cat]) => {
      const prevAmt = transactions.filter(t => t.category === cat && t.type === 'Expense' && t.date.startsWith(prev.label)).reduce((s, t) => s + Math.abs(t.amount), 0);
      const currAmt = transactions.filter(t => t.category === cat && t.type === 'Expense' && t.date.startsWith(curr.label)).reduce((s, t) => s + Math.abs(t.amount), 0);
      if (prevAmt > 0 && currAmt > 0) {
        const change = ((currAmt - prevAmt) / prevAmt * 100);
        if (Math.abs(change) > 15) {
          insights.push({
            type: 'category', severity: change > 0 ? 'warning' : 'opportunity',
            icon: change > 0 ? '⬆️' : '⬇️',
            title: `${cat} Costs ${change > 0 ? 'Increased' : 'Decreased'}`,
            text: `${cat} expenses ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to last month.`
          });
        }
      }
    });
  }

  // ── Customer Concentration ──
  if (summary.customers.length > 0) {
    const top = summary.customers[0];
    const pct = (top.total / summary.totalIncome * 100).toFixed(1);
    insights.push({
      type: 'customer', severity: pct > 40 ? 'warning' : 'info',
      icon: '👥',
      title: 'Top Customer',
      text: `${top.name} contributes ${pct}% of total revenue (${fmt(top.total)}).${pct > 40 ? ' High dependency risk!' : ''}`
    });
  }

  // ── Cashflow Risk ──
  if (summary.netDailyChange < 0) {
    const monthly30 = summary.netDailyChange * 30;
    insights.push({
      type: 'cashflow', severity: 'risk',
      icon: '🔻',
      title: 'Cashflow Risk Detected',
      text: `At the current rate, your cash balance may decrease by ${fmt(monthly30)} over the next 30 days.`
    });
  } else {
    insights.push({
      type: 'cashflow', severity: 'info',
      icon: '✅',
      title: 'Positive Cashflow',
      text: `Your daily net cash flow is +${fmt(summary.netDailyChange)}. Projected 30-day gain: ${fmt(summary.netDailyChange * 30)}.`
    });
  }

  // ── Recurring expenses ──
  const recurring = detectRecurring(transactions.filter(t => t.type === 'Expense'));
  if (recurring.length > 0) {
    const totalRecurring = recurring.reduce((s, r) => s + r.avgAmount, 0);
    insights.push({
      type: 'recurring', severity: 'info',
      icon: '🔄',
      title: 'Recurring Expenses Detected',
      text: `You have ${recurring.length} recurring expenses totaling ${fmt(totalRecurring)} per cycle.`
    });
  }

  // ── Anomaly detection ──
  const anomalies = detectAnomalies(transactions);
  anomalies.forEach(a => {
    insights.push({
      type: 'anomaly', severity: 'warning',
      icon: '🔍',
      title: 'Unusual Transaction',
      text: `Unusual ${a.type.toLowerCase()} detected: ${fmt(a.amount)} for ${a.category}. This is ${a.multiplier.toFixed(1)}x higher than average.`
    });
  });

  // ── Duplicates ──
  const dups = detectDuplicates(transactions);
  if (dups.length > 0) {
    insights.push({
      type: 'duplicate', severity: 'warning',
      icon: '⚠️',
      title: 'Possible Duplicate Transactions',
      text: `${dups.length} possible duplicate transaction(s) detected. Please review.`
    });
  }

  // Sort by severity: risk > warning > opportunity > info
  const order = { risk: 0, warning: 1, opportunity: 2, info: 3 };
  insights.sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));

  return insights;
}

// ─── Anomaly Detection ────────────────────────────────────────
function detectAnomalies(transactions) {
  const anomalies = [];
  ['Income', 'Expense'].forEach(type => {
    const txs = transactions.filter(t => t.type === type);
    if (txs.length < 3) return;
    const amounts = txs.map(t => Math.abs(t.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    txs.forEach(tx => {
      const mult = Math.abs(tx.amount) / avg;
      if (mult > 2.5) {
        anomalies.push({ ...tx, multiplier: mult });
      }
    });
  });
  return anomalies.sort((a, b) => b.multiplier - a.multiplier).slice(0, 3);
}

// ─── Cashflow Forecast ────────────────────────────────────────
function computeForecast(summary) {
  const days = [7, 30, 90];
  return days.map(d => ({
    days: d,
    projectedIncome: summary.avgDailyIncome * d,
    projectedExpenses: summary.avgDailyExpense * d,
    netChange: summary.netDailyChange * d
  }));
}

// ─── Executive Summary ────────────────────────────────────────
function generateExecutiveSummary(summary, health) {
  const sentences = [];
  if (summary.netProfit >= 0) {
    sentences.push(`Your business is profitable with a ${summary.profitMargin.toFixed(1)}% profit margin.`);
  } else {
    sentences.push('Your business is currently operating at a loss — immediate attention is needed.');
  }
  if (summary.customers.length > 0) {
    const topShare = (summary.customers[0].total / summary.totalIncome * 100).toFixed(1);
    if (topShare > 40) {
      sentences.push(`Revenue is heavily concentrated in one customer (${topShare}%), which poses a risk.`);
    } else {
      sentences.push('Revenue is well-distributed across multiple customers.');
    }
  }
  const topCat = Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const pct = (topCat[1] / summary.totalExpenses * 100).toFixed(1);
    sentences.push(`${topCat[0]} is your biggest cost driver at ${pct}% of expenses.`);
  }
  if (summary.netDailyChange < 0) {
    sentences.push('Cash outflow is exceeding inflow daily — cashflow management needs priority.');
  } else {
    sentences.push('Daily cashflow is positive, which indicates good short-term financial health.');
  }
  return sentences.join(' ');
}

// ─── AI Chat Engine ───────────────────────────────────────────
function processChat(query, transactions, summary, health) {
  const q = query.toLowerCase();
  const fmt = n => 'PKR ' + Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  const insights = generateInsights(transactions, summary);

  // Fuel / category spend
  const catMatch = q.match(/(fuel|rent|salary|tools|supplies|utilities|food|transport|marketing|subscription)/i);
  if (catMatch) {
    const cat = catMatch[1];
    const total = transactions.filter(t => t.type === 'Expense' && t.category.toLowerCase().includes(cat.toLowerCase())).reduce((s, t) => s + Math.abs(t.amount), 0);
    if (total > 0) {
      const pct = (total / summary.totalExpenses * 100).toFixed(1);
      return `💡 You spent **${fmt(total)}** on ${titleCase(cat)}, which is **${pct}%** of your total expenses.`;
    }
    return `🤔 I couldn't find any ${cat} expenses in your data. Try uploading more transactions.`;
  }

  // Best customer
  if (q.includes('best customer') || q.includes('top customer') || q.includes('biggest customer')) {
    if (summary.customers.length > 0) {
      const top = summary.customers[0];
      return `🏆 Your best customer is **${top.name}** who contributed **${fmt(top.total)}** across **${top.count}** transactions.`;
    }
    return '🤔 No customer data found. Make sure your income transactions include customer names.';
  }

  // Profit / why low profit
  if (q.includes('profit') || q.includes('why low') || q.includes('earning')) {
    if (summary.netProfit >= 0) {
      return `💰 Your net profit is **${fmt(summary.netProfit)}** — that's a **${summary.profitMargin.toFixed(1)}%** profit margin. ${summary.profitMargin < 15 ? 'This is relatively thin. Consider reducing ' + (Object.entries(summary.categoryBreakdown).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'expenses') + ' costs.' : 'Keep it up!'}`;
    }
    return `⚠️ You are operating at a **loss of ${fmt(summary.netProfit)}**. Your expenses exceed income by ${fmt(Math.abs(summary.netProfit))}. Focus on cutting ${Object.entries(summary.categoryBreakdown).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'major'} expenses.`;
  }

  // Biggest expense
  if (q.includes('biggest expense') || q.includes('largest expense') || q.includes('most money')) {
    const catEntries = Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1]);
    if (catEntries.length) {
      return `📊 Your biggest expense is **${catEntries[0][0]}** at **${fmt(catEntries[0][1])}** (${(catEntries[0][1]/summary.totalExpenses*100).toFixed(1)}% of total expenses).`;
    }
    return '🤔 No expense data found yet.';
  }

  // Business health
  if (q.includes('health') || q.includes('how is my business') || q.includes('doing') || q.includes('status')) {
    return `🏥 Your Business Health Score is **${health.score}/100 — ${health.status}**. ${generateExecutiveSummary(summary, health)}`;
  }

  // Revenue / income
  if (q.includes('revenue') || q.includes('income') || q.includes('money in') || q.includes('earn')) {
    return `📈 Your total revenue is **${fmt(summary.totalIncome)}** from **${transactions.filter(t=>t.type==='Income').length}** income transactions.`;
  }

  // Total expenses
  if (q.includes('expense') || q.includes('spend') || q.includes('cost') || q.includes('money out')) {
    return `💸 Your total expenses are **${fmt(summary.totalExpenses)}** from **${transactions.filter(t=>t.type==='Expense').length}** expense transactions.`;
  }

  // Cashflow
  if (q.includes('cash') || q.includes('cashflow') || q.includes('next month') || q.includes('forecast')) {
    const forecast = computeForecast(summary);
    const f30 = forecast[1];
    return `🔮 Based on current trends: In the next 30 days, expected income is **${fmt(f30.projectedIncome)}**, expenses **${fmt(f30.projectedExpenses)}**, giving a net ${f30.netChange >= 0 ? 'gain' : 'loss'} of **${fmt(f30.netChange)}**.`;
  }

  // Supplier
  if (q.includes('supplier') || q.includes('vendor') || q.includes('who do i pay')) {
    if (summary.suppliers.length > 0) {
      const top3 = summary.suppliers.slice(0, 3).map(s => `${s.name} (${fmt(s.total)})`).join(', ');
      return `🏭 Your top suppliers are: ${top3}.`;
    }
    return '🤔 No supplier data found. Make sure your expense transactions include supplier names.';
  }

  // Default
  const tipIdx = Math.floor(Math.random() * insights.length);
  return `💡 **Insight:** ${insights[tipIdx]?.text || 'Upload transactions to get personalized insights!'}\n\nYou can ask me: *"How much did I spend on fuel?"*, *"Who is my best customer?"*, *"Why is my profit low?"*, *"What's my cashflow forecast?"*`;
}

// ─── CSV Parser ───────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const findCol = (...names) => names.reduce((found, n) => found !== -1 ? found : headers.indexOf(n), -1);
  const dateIdx = findCol('date', 'transaction date', 'tx date');
  const descIdx = findCol('description', 'desc', 'narration', 'details', 'particulars');
  const amtIdx = findCol('amount', 'amt', 'value', 'debit/credit');
  const methodIdx = findCol('payment method', 'method', 'mode');
  const balIdx = findCol('balance', 'bal', 'running balance');

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) {
    throw new Error('CSV must have Date, Description, and Amount columns.');
  }

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 3) continue;
    const date = cols[dateIdx]?.replace(/['"]/g, '').trim();
    const description = cols[descIdx]?.replace(/['"]/g, '').trim();
    const amount = parseFloat(cols[amtIdx]?.replace(/['"',]/g, '').trim());
    if (!date || !description || isNaN(amount)) continue;
    results.push({
      id: generateId(),
      date: normalizeDate(date),
      description,
      amount,
      paymentMethod: methodIdx !== -1 ? cols[methodIdx]?.replace(/['"]/g, '').trim() : '',
      balance: balIdx !== -1 ? parseFloat(cols[balIdx]?.replace(/['"',]/g, '')) : null
    });
  }
  return results;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function normalizeDate(str) {
  // Try to normalize various date formats to YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().substring(0, 10);
  return str;
}

// ─── Export public API ────────────────────────────────────────
window.FinancialEngine = {
  processTransactions,
  computeSummary,
  computeHealthScore,
  generateInsights,
  detectAnomalies,
  detectRecurring,
  detectDuplicates,
  computeForecast,
  generateExecutiveSummary,
  processChat,
  parseCSV,
};
