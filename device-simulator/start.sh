#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${DIR}"

PYTHON="${DIR}/../backend/.venv/bin/python"
if [ ! -f "${PYTHON}" ]; then
    PYTHON="python3"
fi

if [ ! -f "${DIR}/config.json" ]; then
    echo ">> config.json not found. Copying config.example.json..."
    cp "${DIR}/config.example.json" "${DIR}/config.json"
fi

echo "=========================================================="
echo "    🎥  BUILDTRACK DEVICE & CAMERA SIMULATOR (:8090)"
echo "=========================================================="
echo " Starting camera feeds and sensor streams on http://localhost:8090..."
exec "${PYTHON}" -m simulator run --config "${DIR}/config.json"
