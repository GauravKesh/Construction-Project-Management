from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST

# Metrics definitions
INGEST_MESSAGES_TOTAL = Counter(
    "ingest_messages_total",
    "Total count of sensor messages ingested",
    ["sensor_type", "site_id"],
)

VALIDATION_ERRORS_TOTAL = Counter(
    "validation_errors_total",
    "Total count of rejected sensor readings",
    ["reason"],
)

ALERT_CREATION_LATENCY_SECONDS = Histogram(
    "alert_creation_latency_seconds",
    "Latency from sensor reading timestamp to alert generation in seconds",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

CV_INFERENCE_FPS = Gauge(
    "cv_inference_fps",
    "Current frames per second processed by computer vision service",
    ["camera_id"],
)

STREAM_LAG_RECORDS = Gauge(
    "stream_lag_records",
    "Number of pending messages in the ingest stream consumer group",
    ["consumer_group"],
)

DLQ_SIZE_RECORDS = Gauge(
    "dlq_size_records",
    "Total messages currently sitting in Dead Letter Queue",
)

DB_POOL_ACTIVE_CONNECTIONS = Gauge(
    "db_pool_active_connections",
    "Active connections currently checked out of PostgreSQL pool",
)

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests received",
    ["method", "endpoint", "status"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.3, 0.5, 1.0, 2.0, 5.0],
)


def get_metrics_payload() -> bytes:
    return generate_latest()
