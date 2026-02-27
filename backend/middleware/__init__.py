"""Auth middleware for FastAPI - verifies Supabase JWT tokens."""

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from config import SUPABASE_URL, SUPABASE_ANON_KEY

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Verify the Supabase JWT and return user info.
    
    Uses Supabase's own /auth/v1/user endpoint to verify the token,
    which is the most reliable approach (no need for JWT secret).
    """
    token = credentials.credentials

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_ANON_KEY,
                },
            )

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        user_data = response.json()
        return {
            "id": user_data["id"],
            "email": user_data.get("email", ""),
            "full_name": user_data.get("user_metadata", {}).get("full_name", ""),
            "avatar_url": user_data.get("user_metadata", {}).get("avatar_url", ""),
            "access_token": token,
        }

    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    except KeyError:
        raise HTTPException(status_code=401, detail="Invalid token payload")
