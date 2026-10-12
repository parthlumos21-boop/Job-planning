import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Job Planning & Tracking Register API"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:root@localhost:5432/job_planning_db"
    JWT_SECRET: str = "job-planning-super-secure-production-jwt-key-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
