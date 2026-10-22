from typing import List, Literal, Optional
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


_PLACEHOLDER_SECRET_KEY = "change-me-to-a-secure-random-secret-key-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Dashboard for Real-Time Monitoring of Construction Projects"
    APP_ENV: str = "development"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ROOT_PATH: str = ""
    FORWARDED_ALLOW_IPS: str = "*"
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            if v.startswith("["):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Security & Authentication
    SECRET_KEY: str = _PLACEHOLDER_SECRET_KEY
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # PostgreSQL Database
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "gaurav"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "construction_db"
    DATABASE_URL: Optional[str] = None
    DATABASE_SYNC_URL: Optional[str] = None
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    @property
    def async_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        pwd = f":{self.POSTGRES_PASSWORD}" if self.POSTGRES_PASSWORD else ""
        return f"postgresql+asyncpg://{self.POSTGRES_USER}{pwd}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_SYNC_URL:
            return self.DATABASE_SYNC_URL
        pwd = f":{self.POSTGRES_PASSWORD}" if self.POSTGRES_PASSWORD else ""
        return f"postgresql://{self.POSTGRES_USER}{pwd}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "construction_mongo"
    MONGO_MAX_POOL_SIZE: int = 50
    MONGO_MIN_POOL_SIZE: int = 10

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MQTT
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883
    MQTT_USERNAME: Optional[str] = None
    MQTT_PASSWORD: Optional[str] = None
    MQTT_TOPIC_SUB: str = "sites/+/sensors/#"
    MQTT_KEEPALIVE: int = 60

    # Storage Abstraction
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_PATH: str = "./data/storage"
    S3_ENDPOINT_URL: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_BUCKET_NAME: str = "construction-assets"
    S3_REGION: str = "us-east-1"
    STORAGE_SIGNED_URL_EXPIRE_SECONDS: int = 900  # 15 minutes

    # Feature Flags & Modes
    FEATURE_TIMESCALE: bool = False
    FEATURE_POSTGIS: bool = False
    CV_MODE: Literal["mock", "yolo"] = "mock"
    CV_MODEL_PATH: str = "./data/models/yolov8n.pt"
    CV_CONFIDENCE_THRESHOLD: float = 0.45
    CV_INFERENCE_FPS: int = 2

    # Shared secret for device ingestion over HTTP (X-API-Key on /telemetry/ingest).
    # Unset = only authenticated users may ingest over HTTP.
    INGEST_API_KEY: Optional[str] = None

    # Notifications
    NOTIFY_PROVIDER_EMAIL: str = "console"
    NOTIFY_PROVIDER_SMS: str = "console"
    NOTIFY_PROVIDER_PUSH: str = "console"

    # SMTP Settings
    SMTP_HOST: Optional[str] = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "alerts@buildtrack.com"

    # Twilio SMS
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

    # FCM
    FCM_SERVER_KEY: Optional[str] = None
    FCM_PROJECT_ID: Optional[str] = None

    # Workers & Logging
    RUN_EMBEDDED_WORKERS: bool = False
    LOG_LEVEL: str = "INFO"

    @model_validator(mode="after")
    def _require_real_secret_outside_dev(self):
        # SECRET_KEY signs JWTs and storage download URLs; a known value means forgeable tokens.
        if self.APP_ENV not in ("development", "test"):
            if self.SECRET_KEY == _PLACEHOLDER_SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a random value of at least 32 characters "
                    f"when APP_ENV={self.APP_ENV!r}"
                )
        return self


settings = Settings()
