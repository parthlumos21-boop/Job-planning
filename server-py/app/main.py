from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.auth import router as auth_router
from app.api.v1.departments import router as departments_router
from app.api.v1.users import router as users_router
from app.api.v1.clients import router as clients_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.export import router as export_router
from app.api.v1.job_execution import router as execution_router
from app.api.v1.job_monitoring import router as monitoring_router
from app.api.v1.job_analytics import router as analytics_router

app = FastAPI(
    title="Job Planning & Tracking Register API",
    description="Python FastAPI + PostgreSQL backend for Job Planning & Tracking Register",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers under /api
app.include_router(auth_router, prefix="/api")
app.include_router(departments_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(clients_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(execution_router, prefix="/api")
app.include_router(monitoring_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")

@app.get("/api/health")
async def health_check():
    return {
        "ok": True,
        "name": "Job Planning & Tracking Register API (FastAPI)",
        "db": "connected"
    }

@app.get("/")
async def root():
    return {
        "message": "Job Planning & Tracking Register API is running",
        "docs": "/docs"
    }
