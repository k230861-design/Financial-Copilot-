"""Analytics service - computes financial metrics from transaction data."""

from datetime import datetime, timedelta
from collections import defaultdict


def compute_summary(transactions: list[dict]) -> dict:
    """Compute comprehensive financial summary from transactions."""
    if not transactions:
        return _empty_summary()

    income_txs = [t for t in transactions if t.get("type") == "income"]
    expense_txs = [t for t in transactions if t.get("type") == "expense"]

    total_income = sum(float(t["amount"]) for t in income_txs)
    total_expenses = sum(abs(float(t["amount"])) for t in expense_txs)
    net_profit = total_income - total_expenses

    # Date range
    dates = []
    for t in transactions:
        try:
            dates.append(datetime.strptime(str(t["date"]), "%Y-%m-%d"))
        except (ValueError, KeyError):
            pass

    min_date = min(dates) if dates else None
    max_date = max(dates) if dates else None
    day_span = max(1, (max_date - min_date).days + 1) if min_date and max_date else 1

    avg_daily_income = total_income / day_span
    avg_daily_expense = total_expenses / day_span
    net_daily_change = avg_daily_income - avg_daily_expense

    # Monthly breakdown
    monthly = defaultdict(lambda: {"income": 0, "expenses": 0})
    for tx in transactions:
        try:
            d = datetime.strptime(str(tx["date"]), "%Y-%m-%d")
            key = d.strftime("%Y-%m")
            if tx["type"] == "income":
                monthly[key]["income"] += float(tx["amount"])
            else:
                monthly[key]["expenses"] += abs(float(tx["amount"]))
        except (ValueError, KeyError):
            pass

    monthly_sorted = [
        {"month": k, "income": v["income"], "expenses": v["expenses"]}
        for k, v in sorted(monthly.items())
    ]

    # Category breakdown
    category_breakdown = defaultdict(float)
    for tx in expense_txs:
        cat = tx.get("category_name") or tx.get("category", "Miscellaneous")
        category_breakdown[cat] += abs(float(tx["amount"]))

    cat_list = [
        {"name": k, "total": v, "percentage": (v / total_expenses * 100) if total_expenses > 0 else 0}
        for k, v in sorted(category_breakdown.items(), key=lambda x: -x[1])
    ]

    # Customer analysis
    customers = defaultdict(lambda: {"total": 0, "count": 0})
    for tx in income_txs:
        entity = tx.get("entity_name", "")
        if entity:
            customers[entity]["total"] += float(tx["amount"])
            customers[entity]["count"] += 1

    customer_list = [
        {"name": k, "total": v["total"], "count": v["count"],
         "percentage": (v["total"] / total_income * 100) if total_income > 0 else 0}
        for k, v in sorted(customers.items(), key=lambda x: -x[1]["total"])
    ]

    # Supplier analysis
    suppliers = defaultdict(lambda: {"total": 0, "count": 0})
    for tx in expense_txs:
        entity = tx.get("entity_name", "")
        if entity:
            suppliers[entity]["total"] += abs(float(tx["amount"]))
            suppliers[entity]["count"] += 1

    supplier_list = [
        {"name": k, "total": v["total"], "count": v["count"],
         "percentage": (v["total"] / total_expenses * 100) if total_expenses > 0 else 0}
        for k, v in sorted(suppliers.items(), key=lambda x: -x[1]["total"])
    ]

    profit_margin = (net_profit / total_income * 100) if total_income > 0 else 0
    expense_ratio = (total_expenses / total_income * 100) if total_income > 0 else 0

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "transaction_count": len(transactions),
        "income_count": len(income_txs),
        "expense_count": len(expense_txs),
        "avg_daily_income": avg_daily_income,
        "avg_daily_expense": avg_daily_expense,
        "net_daily_change": net_daily_change,
        "profit_margin": profit_margin,
        "expense_ratio": expense_ratio,
        "date_range": {
            "min": min_date.isoformat() if min_date else None,
            "max": max_date.isoformat() if max_date else None,
            "day_span": day_span,
        },
        "monthly_trends": monthly_sorted,
        "category_breakdown": cat_list,
        "customers": customer_list,
        "suppliers": supplier_list,
    }


def compute_health_score(summary: dict) -> dict:
    """Compute a business health score (0-100) based on financial metrics."""
    score = 50
    factors = []

    # Profitability (max 25 pts)
    net_profit = summary.get("net_profit", 0)
    profit_margin = summary.get("profit_margin", 0)
    if net_profit > 0:
        if profit_margin > 30:
            score += 25
            factors.append({"label": "Strong profit margin", "pts": 25, "positive": True})
        elif profit_margin > 15:
            score += 15
            factors.append({"label": "Healthy profit margin", "pts": 15, "positive": True})
        elif profit_margin > 5:
            score += 8
            factors.append({"label": "Thin profit margin", "pts": 8, "positive": True})
        else:
            score += 2
            factors.append({"label": "Very thin margin", "pts": 2, "positive": False})
    else:
        score -= 20
        factors.append({"label": "Operating at a loss", "pts": -20, "positive": False})

    # Expense ratio (max 15 pts)
    expense_ratio = summary.get("expense_ratio", 0)
    if expense_ratio < 50:
        score += 15
        factors.append({"label": "Low expense ratio", "pts": 15, "positive": True})
    elif expense_ratio < 70:
        score += 8
        factors.append({"label": "Moderate expense ratio", "pts": 8, "positive": True})
    elif expense_ratio < 85:
        score -= 5
        factors.append({"label": "High expense ratio", "pts": -5, "positive": False})
    else:
        score -= 15
        factors.append({"label": "Very high expense ratio", "pts": -15, "positive": False})

    # Customer concentration
    customers = summary.get("customers", [])
    total_income = summary.get("total_income", 0)
    if customers and total_income > 0:
        top_share = customers[0]["total"] / total_income * 100
        if top_share > 60:
            score -= 10
            factors.append({"label": "High customer concentration risk", "pts": -10, "positive": False})
        elif top_share > 40:
            score -= 5
            factors.append({"label": "Moderate concentration risk", "pts": -5, "positive": False})
        else:
            score += 5
            factors.append({"label": "Diversified customer base", "pts": 5, "positive": True})

    # Cashflow direction
    net_daily = summary.get("net_daily_change", 0)
    if net_daily > 0:
        score += 5
        factors.append({"label": "Positive daily cash flow", "pts": 5, "positive": True})
    else:
        score -= 5
        factors.append({"label": "Negative daily cash flow", "pts": -5, "positive": False})

    final_score = max(0, min(100, score))
    if final_score >= 80:
        status, status_color = "Healthy", "#10b981"
    elif final_score >= 60:
        status, status_color = "Stable", "#3b82f6"
    elif final_score >= 40:
        status, status_color = "Needs Attention", "#f59e0b"
    else:
        status, status_color = "At Risk", "#ef4444"

    return {
        "score": final_score,
        "status": status,
        "status_color": status_color,
        "factors": factors,
    }


def compute_forecast(summary: dict) -> list[dict]:
    """Compute cashflow forecasts for 7, 30, and 90 days."""
    avg_income = summary.get("avg_daily_income", 0)
    avg_expense = summary.get("avg_daily_expense", 0)
    net_daily = summary.get("net_daily_change", 0)

    return [
        {
            "days": d,
            "projected_income": round(avg_income * d, 2),
            "projected_expenses": round(avg_expense * d, 2),
            "net_change": round(net_daily * d, 2),
        }
        for d in [7, 30, 90]
    ]


def detect_recurring(transactions: list[dict]) -> list[dict]:
    """Detect recurring transaction patterns."""
    groups = defaultdict(list)
    for tx in transactions:
        key = tx.get("description", "").lower().strip()
        if key:
            groups[key].append(tx)

    recurring = []
    for desc, group in groups.items():
        if len(group) >= 2:
            amounts = [abs(float(t["amount"])) for t in group]
            avg_amount = sum(amounts) / len(amounts)
            all_similar = all(abs(a - avg_amount) / max(avg_amount, 0.01) < 0.1 for a in amounts)
            if all_similar:
                recurring.append({
                    "description": group[0].get("description", ""),
                    "count": len(group),
                    "avg_amount": round(avg_amount, 2),
                    "category": group[0].get("category_name", group[0].get("category", "")),
                    "type": group[0].get("type", ""),
                })

    return recurring


def detect_anomalies(transactions: list[dict]) -> list[dict]:
    """Detect unusual transactions (>2.5x average)."""
    anomalies = []
    for tx_type in ["income", "expense"]:
        txs = [t for t in transactions if t.get("type") == tx_type]
        if len(txs) < 3:
            continue
        amounts = [abs(float(t["amount"])) for t in txs]
        avg = sum(amounts) / len(amounts)
        for tx in txs:
            mult = abs(float(tx["amount"])) / max(avg, 0.01)
            if mult > 2.5:
                anomalies.append({
                    **tx,
                    "multiplier": round(mult, 1),
                })

    return sorted(anomalies, key=lambda x: -x.get("multiplier", 0))[:5]


def detect_duplicates(transactions: list[dict]) -> list[dict]:
    """Detect potential duplicate transactions."""
    seen = {}
    duplicates = []
    for tx in transactions:
        key = f"{tx.get('date')}|{tx.get('amount')}|{tx.get('description', '').lower().strip()}"
        if key in seen:
            duplicates.append(tx)
        else:
            seen[key] = True
    return duplicates


def _empty_summary() -> dict:
    return {
        "total_income": 0,
        "total_expenses": 0,
        "net_profit": 0,
        "transaction_count": 0,
        "income_count": 0,
        "expense_count": 0,
        "avg_daily_income": 0,
        "avg_daily_expense": 0,
        "net_daily_change": 0,
        "profit_margin": 0,
        "expense_ratio": 0,
        "date_range": {"min": None, "max": None, "day_span": 0},
        "monthly_trends": [],
        "category_breakdown": [],
        "customers": [],
        "suppliers": [],
    }
