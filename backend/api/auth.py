"""Auth API endpoints."""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_supabase
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthResponse(BaseModel):
    message: str
    user: dict | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


@router.get("/me")
async def get_me(user: dict = None):
    """Get current user info - handled by middleware dependency."""
    return {"message": "Use the /api/auth/verify endpoint with Bearer token"}


@router.post("/verify")
async def verify_token(user: dict = None):
    """Verify a token is valid and return user info."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user}


@router.post("/register")
async def register_user(req: RegisterRequest):
    """Register a new user via Supabase Admin API (no email confirmation needed)."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Service role key not configured")

    # Create user via Supabase Admin API with auto-confirm
    async with httpx.AsyncClient() as client:
        payload = {
            "email": req.email,
            "password": req.password,
            "email_confirm": True,  # Auto-confirm, no email sent
        }
        if req.full_name:
            payload["user_metadata"] = {"full_name": req.full_name}

        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            json=payload,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code == 422:
        raise HTTPException(status_code=400, detail="User already exists")
    if resp.status_code not in (200, 201):
        error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        detail = error_data.get("msg") or error_data.get("message") or "Registration failed"
        raise HTTPException(status_code=resp.status_code, detail=detail)

    user_data = resp.json()

    # Now sign the user in to get a session token
    async with httpx.AsyncClient() as client:
        login_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": req.email, "password": req.password},
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
        )

    if login_resp.status_code != 200:
        # User created but auto-login failed; they can log in manually
        return {
            "message": "Account created successfully! Please sign in.",
            "user": user_data,
            "session": None,
        }

    session_data = login_resp.json()
    return {
        "message": "Account created and signed in!",
        "user": session_data.get("user"),
        "session": {
            "access_token": session_data.get("access_token"),
            "refresh_token": session_data.get("refresh_token"),
            "expires_in": session_data.get("expires_in", 3600),
        },
    }
