"""Analytics API endpoints - computes financial summaries and metrics."""

from fastapi import APIRouter, Depends, HTTPException
from middleware import get_current_user
from db import get_authenticated_client
from services.analytics_service import (
    compute_summary,
    compute_health_score,
    compute_forecast,
    detect_recurring,
    detect_anomalies,
    detect_duplicates,
)
from services.ai_service import generate_insights_ai, generate_executive_summary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def _fetch_transactions(client, business_id: str) -> list[dict]:
    """Fetch all transactions for a business with joined category/entity data."""
    result = (
        client.table("transactions")
        .select("*, categories(name), entities(name, entity_type)")
        .eq("business_id", business_id)
        .order("date", desc=False)
        .execute()
    )

    transactions = []
    for tx in result.data:
        transactions.append({
            "id": tx["id"],
            "date": tx["date"],
            "description": tx["description"],
            "amount": float(tx["amount"]),
            "type": tx["type"],
            "category_name": tx.get("categories", {}).get("name", "") if tx.get("categories") else "",
            "entity_name": tx.get("entities", {}).get("name", "") if tx.get("entities") else "",
            "entity_type": tx.get("entities", {}).get("entity_type", "") if tx.get("entities") else "",
            "category_id": tx.get("category_id"),
            "entity_id": tx.get("entity_id"),
            "payment_method": tx.get("payment_method", ""),
            "created_at": tx.get("created_at"),
        })
    return transactions


@router.get("/summary/{business_id}")
async def get_summary(business_id: str, user: dict = Depends(get_current_user)):
    """Get complete financial summary for a business."""
    client = get_authenticated_client(user["access_token"])

    # Verify business ownership
    biz = client.table("businesses").select("id").eq("id", business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    transactions = await _fetch_transactions(client, business_id)
    summary = compute_summary(transactions)
    health = compute_health_score(summary)
    forecasts = compute_forecast(summary)
    recurring = detect_recurring([t for t in transactions if t["type"] == "expense"])
    anomalies = detect_anomalies(transactions)
    duplicates = detect_duplicates(transactions)

    return {
        "summary": summary,
        "health": health,
        "forecasts": forecasts,
        "recurring": recurring,
        "anomalies": anomalies,
        "duplicates": duplicates,
        "transactions": transactions,
    }


@router.get("/insights/{business_id}")
async def get_insights(business_id: str, user: dict = Depends(get_current_user)):
    """Generate AI-powered insights for a business."""
    client = get_authenticated_client(user["access_token"])

    biz = client.table("businesses").select("id").eq("id", business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    transactions = await _fetch_transactions(client, business_id)
    summary = compute_summary(transactions)
    recurring = detect_recurring([t for t in transactions if t["type"] == "expense"])

    # Prepare data for AI
    financial_data = {
        "total_income": summary["total_income"],
        "total_expenses": summary["total_expenses"],
        "net_profit": summary["net_profit"],
        "profit_margin": summary["profit_margin"],
        "expense_ratio": summary["expense_ratio"],
        "top_categories": summary["category_breakdown"][:5],
        "top_customers": summary["customers"][:5],
        "monthly_trends": summary["monthly_trends"][-3:],
        "recurring": [{"desc": r["description"], "amount": r["avg_amount"]} for r in recurring[:5]],
    }

    insights = await generate_insights_ai(financial_data)
    exec_summary = await generate_executive_summary(financial_data)

    # Also save insights to DB
    if insights:
        insight_records = []
        for ins in insights:
            severity_map = {"low": "low", "medium": "medium", "high": "high"}
            type_map = {"health": "health", "risk": "risk", "warning": "warning", 
                       "opportunity": "opportunity", "info": "info"}
            insight_records.append({
                "business_id": business_id,
                "text": f"{ins.get('title', '')}: {ins.get('text', '')}",
                "insight_type": type_map.get(ins.get("type", "info"), "info"),
                "severity": severity_map.get(ins.get("severity", "low"), "low"),
            })

        # Clear old insights and insert new
        client.table("insights").delete().eq("business_id", business_id).execute()
        if insight_records:
            client.table("insights").insert(insight_records).execute()

    return {
        "insights": insights,
        "executive_summary": exec_summary,
    }


@router.get("/dashboard/{business_id}")
async def get_dashboard(business_id: str, user: dict = Depends(get_current_user)):
    """Get all dashboard data in a single request for efficiency."""
    client = get_authenticated_client(user["access_token"])

    biz = client.table("businesses").select("id").eq("id", business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    transactions = await _fetch_transactions(client, business_id)
    
    if not transactions:
        return {
            "summary": compute_summary([]),
            "health": {"score": 0, "status": "No Data", "status_color": "#64748b", "factors": []},
            "forecasts": [],
            "recurring": [],
            "anomalies": [],
            "duplicates": [],
            "insights": [],
            "executive_summary": "Upload transactions to see your AI-generated business summary.",
            "transactions": [],
        }

    summary = compute_summary(transactions)
    health = compute_health_score(summary)
    forecasts = compute_forecast(summary)
    recurring = detect_recurring([t for t in transactions if t["type"] == "expense"])
    anomalies = detect_anomalies(transactions)
    duplicates = detect_duplicates(transactions)

    # Load cached insights from DB
    cached_insights = client.table("insights").select("*").eq("business_id", business_id).execute()

    return {
        "summary": summary,
        "health": health,
        "forecasts": forecasts,
        "recurring": recurring,
        "anomalies": anomalies,
        "duplicates": duplicates,
        "insights": cached_insights.data if cached_insights.data else [],
        "executive_summary": "",
        "transactions": transactions,
    }
