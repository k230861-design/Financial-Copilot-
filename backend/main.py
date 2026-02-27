"""AI Financial Co-Pilot – FastAPI Backend."""

import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from config import FRONTEND_URL
from api.auth import router as auth_router
from api.businesses import router as business_router
from api.transactions import router as transaction_router
from api.analytics import router as analytics_router
from api.chat import router as chat_router

app = FastAPI(
    title="AI Financial Co-Pilot API",
    description="Backend API for AI-powered financial intelligence",
    version="1.0.0",
)

# CORS - allow frontend (local dev + production)
_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
if FRONTEND_URL and FRONTEND_URL not in _origins:
    _origins.insert(0, FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler – ensures CORS headers are present even on 500s
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
    )


# Register routers
app.include_router(auth_router)
app.include_router(business_router)
app.include_router(transaction_router)
app.include_router(analytics_router)
app.include_router(chat_router)


@app.get("/")
async def root():
    return {"message": "AI Financial Co-Pilot API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
