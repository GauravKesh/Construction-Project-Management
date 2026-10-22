#!/usr/bin/env bash
# ==============================================================================
# BuildTrack — Development Multi-Role Runner
# Runs API, Stream Worker, MQTT Consumer, and Video Handler simultaneously
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

PYTHON="${ROOT_DIR}/.venv/bin/python"
if [ ! -f "${PYTHON}" ]; then
    PYTHON="python3"
fi

echo "=========================================================="
echo " Starting Construction Monitoring System (Separate Roles) "
echo "=========================================================="

echo ">> Running database migrations & initialization..."
"${PYTHON}" -m app.cli migrate

PIDS=()

cleanup() {
    echo ""
    echo ">> Stopping all running services..."
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

echo ">> Launching API Server (FastAPI + Socket.IO)..."
"${PYTHON}" -m app.cli api &
PIDS+=($!)

echo ">> Launching Processing Worker (Streams, Rules, Outbox, Scheduler)..."
"${PYTHON}" -m app.cli worker &
PIDS+=($!)

echo ">> Launching MQTT Ingestion Consumer..."
"${PYTHON}" -m app.cli mqtt-consumer &
PIDS+=($!)

echo ">> Launching Video Stream & CV Inference Handler..."
"${PYTHON}" -m app.cli video-handler &
PIDS+=($!)

if [ "$1" == "--with-sim" ]; then
    echo ">> Launching MQTT Sensor Simulator..."
    "${PYTHON}" scripts/mqtt_sensor_simulator.py &
    PIDS+=($!)
fi

echo "=========================================================="
echo " All services running. Press Ctrl+C to stop all processes. "
echo " API & Docs: http://localhost:8000/docs                    "
echo " Live Health: http://localhost:8000/health/live            "
echo " Ready Health: http://localhost:8000/health/ready          "
echo "=========================================================="

wait
