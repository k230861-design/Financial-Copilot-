"""Business management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from middleware import get_current_user
from db import get_authenticated_client

router = APIRouter(prefix="/api/businesses", tags=["businesses"])


class BusinessCreate(BaseModel):
    name: str


class BusinessResponse(BaseModel):
    id: str
    name: str
    user_id: str
    created_at: str | None = None


@router.get("")
async def list_businesses(user: dict = Depends(get_current_user)):
    """List all businesses for the current user."""
    client = get_authenticated_client(user["access_token"])
    result = client.table("businesses").select("*").eq("user_id", user["id"]).execute()
    return {"businesses": result.data}


@router.post("")
async def create_business(body: BusinessCreate, user: dict = Depends(get_current_user)):
    """Create a new business."""
    client = get_authenticated_client(user["access_token"])
    result = client.table("businesses").insert({
        "user_id": user["id"],
        "name": body.name,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create business")

    return {"business": result.data[0]}


@router.get("/{business_id}")
async def get_business(business_id: str, user: dict = Depends(get_current_user)):
    """Get a specific business."""
    client = get_authenticated_client(user["access_token"])
    result = client.table("businesses").select("*").eq("id", business_id).eq("user_id", user["id"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Business not found")

    return {"business": result.data[0]}
