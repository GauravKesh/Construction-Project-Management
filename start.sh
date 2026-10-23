#!/usr/bin/env bash
# ==============================================================================
# BuildTrack — Unified Server Startup Script
# Starts all required backend services and background workers in 1 command.
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

cd "${BACKEND_DIR}"

echo "=========================================================="
echo "    🏗️  BUILDTRACK REAL-TIME MONITORING SERVER"
echo "=========================================================="

# 1. Check Python Virtualenv
PYTHON="${BACKEND_DIR}/.venv/bin/python"
if [ ! -f "${PYTHON}" ]; then
    echo ">> Virtual environment not found. Creating .venv..."
    python3 -m venv "${BACKEND_DIR}/.venv"
    echo ">> Installing dependencies..."
    "${BACKEND_DIR}/.venv/bin/pip" install --upgrade pip
    "${BACKEND_DIR}/.venv/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"
fi

# 2. Check .env configuration
if [ ! -f "${BACKEND_DIR}/.env" ]; then
    echo ">> .env not found. Creating from .env.example..."
    cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
fi

# 3. Pre-flight backing service verification
check_port() {
    local host=$1
    local port=$2
    if command -v nc >/dev/null 2>&1; then
        nc -z "${host}" "${port}" >/dev/null 2>&1
        return $?
    else
        "${PYTHON}" -c "import socket; s = socket.socket(); s.settimeout(1); s.connect(('${host}', ${port})); s.close()" >/dev/null 2>&1
        return $?
    fi
}

echo ">> Checking infrastructure dependencies..."
MISSING_SERVICES=0

if ! check_port "127.0.0.1" 5432; then
    echo "   ⚠️  PostgreSQL is not responding on 127.0.0.1:5432"
    if command -v brew >/dev/null 2>&1; then
        echo "   -> Attempting 'brew services start postgresql@16'..."
        brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
    fi
    sleep 2
    if ! check_port "127.0.0.1" 5432; then
        echo "   ❌ Please start PostgreSQL: brew services start postgresql@16"
        MISSING_SERVICES=1
    fi
else
    echo "   ✅ PostgreSQL (port 5432): ACTIVE"
fi

if ! check_port "127.0.0.1" 27017; then
    echo "   ⚠️  MongoDB is not responding on 127.0.0.1:27017"
    if command -v brew >/dev/null 2>&1; then
        echo "   -> Attempting 'brew services start mongodb-community'..."
        brew services start mongodb-community 2>/dev/null || true
    fi
    sleep 2
    if ! check_port "127.0.0.1" 27017; then
        echo "   ❌ Please start MongoDB: brew services start mongodb-community"
        MISSING_SERVICES=1
    fi
else
    echo "   ✅ MongoDB (port 27017): ACTIVE"
fi

if ! check_port "127.0.0.1" 6379; then
    echo "   ⚠️  Redis is not responding on 127.0.0.1:6379"
    if command -v brew >/dev/null 2>&1; then
        echo "   -> Attempting 'brew services start redis'..."
        brew services start redis 2>/dev/null || true
    fi
    sleep 2
    if ! check_port "127.0.0.1" 6379; then
        echo "   ❌ Please start Redis: brew services start redis"
        MISSING_SERVICES=1
    fi
else
    echo "   ✅ Redis (port 6379): ACTIVE"
fi

if ! check_port "127.0.0.1" 1883; then
    echo "   ⚠️  Mosquitto MQTT is not responding on 127.0.0.1:1883"
    if command -v brew >/dev/null 2>&1; then
        echo "   -> Attempting 'brew services start mosquitto'..."
        brew services start mosquitto 2>/dev/null || true
    fi
    sleep 2
    if ! check_port "127.0.0.1" 1883; then
        echo "   ❌ Please start Mosquitto: brew services start mosquitto"
        MISSING_SERVICES=1
    fi
else
    echo "   ✅ Mosquitto MQTT (port 1883): ACTIVE"
fi

if [ "${MISSING_SERVICES}" -eq 1 ]; then
    echo ""
    echo "❌ One or more backing services could not be reached. Aborting startup."
    exit 1
fi

# 4. Run database migrations
echo ">> Running database migrations..."
"${PYTHON}" -m app.cli migrate

# 5. Process tracking & Graceful shutdown
PIDS=()

cleanup() {
    echo ""
    echo ">> Received shutdown signal. Gracefully stopping all processes..."
    trap - SIGINT SIGTERM EXIT
    for pid in "${PIDS[@]}"; do
        if kill -0 "${pid}" 2>/dev/null; then
            kill -TERM "${pid}" 2>/dev/null || true
        fi
    done
    wait 2>/dev/null || true
    echo ">> All processes terminated cleanly."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Check if port 8000 is already occupied by a previous BuildTrack instance
if check_port "127.0.0.1" 8000; then
    echo ">> Port 8000 is occupied. Terminating previous instance for clean restart..."
    EXISTING_PIDS=$(lsof -ti :8000 2>/dev/null || true)
    if [ -n "${EXISTING_PIDS}" ]; then
        kill -9 ${EXISTING_PIDS} 2>/dev/null || true
        sleep 1
    fi
fi

# 6. Launch All Server Roles
echo ">> [1/4] Starting REST API Gateway & Socket.IO Server (/live)..."
"${PYTHON}" -m app.cli api &
PIDS+=($!)

echo ">> [2/4] Starting Stream Processing & KPI Rollup Worker..."
"${PYTHON}" -m app.cli worker &
PIDS+=($!)

echo ">> [3/4] Starting MQTT Ingestion Consumer..."
"${PYTHON}" -m app.cli mqtt-consumer &
PIDS+=($!)

echo ">> [4/4] Starting Video Stream & CV PPE Safety Handler..."
"${PYTHON}" -m app.cli video-handler &
PIDS+=($!)

# Optional: IoT Sensor Simulator
if [ "$1" == "--with-sim" ] || [ "$ENABLE_SIMULATOR" == "true" ]; then
    echo ">> [OPTIONAL] Starting Live IoT Sensor Simulator..."
    "${PYTHON}" scripts/mqtt_sensor_simulator.py &
    PIDS+=($!)
fi

echo "=========================================================="
echo " 🚀 BUILDTRACK SYSTEM IS FULLY OPERATIONAL"
echo "=========================================================="
echo " • API & Swagger Docs: http://localhost:8000/docs"
echo " • ReDoc:             http://localhost:8000/redoc"
echo " • WebSocket Server:   ws://localhost:8000/socket.io"
echo " • Liveness Health:    http://localhost:8000/health/live"
echo " • Readiness Health:   http://localhost:8000/health/ready"
echo " • Prometheus Metrics: http://localhost:8000/metrics"
echo "=========================================================="
echo " Tip: Run './start.sh --with-sim' to also launch the IoT simulator."
echo " Press Ctrl+C at any time to cleanly stop all services."
echo "=========================================================="

wait
