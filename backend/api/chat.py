"""AI Chat API endpoint."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from middleware import get_current_user
from db import get_authenticated_client
from services.analytics_service import compute_summary, compute_health_score
from services.ai_service import chat_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    business_id: str
    message: str
    history: list[dict] | None = None


@router.post("")
async def chat(body: ChatRequest, user: dict = Depends(get_current_user)):
    """Send a message to the AI CFO chat."""
    client = get_authenticated_client(user["access_token"])

    # Verify business
    biz = client.table("businesses").select("id").eq("id", body.business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    # Fetch transactions to build context
    result = (
        client.table("transactions")
        .select("*, categories(name), entities(name, entity_type)")
        .eq("business_id", body.business_id)
        .order("date", desc=False)
        .execute()
    )

    transactions = []
    for tx in result.data:
        transactions.append({
            "date": tx["date"],
            "description": tx["description"],
            "amount": float(tx["amount"]),
            "type": tx["type"],
            "category_name": tx.get("categories", {}).get("name", "") if tx.get("categories") else "",
            "entity_name": tx.get("entities", {}).get("name", "") if tx.get("entities") else "",
        })

    summary = compute_summary(transactions)
    health = compute_health_score(summary)

    # Build financial context for AI
    financial_context = {
        "total_income": summary["total_income"],
        "total_expenses": summary["total_expenses"],
        "net_profit": summary["net_profit"],
        "profit_margin": round(summary["profit_margin"], 1),
        "transaction_count": summary["transaction_count"],
        "top_categories": summary["category_breakdown"][:5],
        "top_customers": [{"name": c["name"], "total": c["total"]} for c in summary["customers"][:5]],
        "top_suppliers": [{"name": s["name"], "total": s["total"]} for s in summary["suppliers"][:5]],
        "health_score": health["score"],
        "health_status": health["status"],
        "avg_daily_income": round(summary["avg_daily_income"], 2),
        "avg_daily_expense": round(summary["avg_daily_expense"], 2),
        "monthly_trends": summary["monthly_trends"][-3:],
    }

    response = await chat_response(
        query=body.message,
        financial_context=financial_context,
        chat_history=body.history,
    )

    return {"response": response}
