PYTHON ?= .venv/bin/python

.PHONY: help run-all api worker mqtt video migrate seed test sim-mqtt sim-video clean

help:
	@echo "Available commands:"
	@echo "  make run-all    - Launch all services locally in separate processes"
	@echo "  make api        - Run FastAPI + Socket.IO server"
	@echo "  make worker     - Run background stream worker, rules, outbox, scheduler"
	@echo "  make mqtt       - Run MQTT ingestion consumer"
	@echo "  make video      - Run Video stream & CV inference handler"
	@echo "  make migrate    - Run Alembic migrations and init Mongo/Redis/Storage"
	@echo "  make seed       - Seed demo projects, sites, sensors, cameras, rules, users"
	@echo "  make test       - Run test suite"
	@echo "  make sim-mqtt   - Run IoT sensor MQTT simulator with threshold spikes"
	@echo "  make sim-video  - Run video loop simulator for CV inference"
	@echo "  make clean      - Remove bytecode and cache directories"

run-all:
	./scripts/dev_run_all.sh

api:
	$(PYTHON) -m app.cli api

worker:
	$(PYTHON) -m app.cli worker

mqtt:
	$(PYTHON) -m app.cli mqtt-consumer

video:
	$(PYTHON) -m app.cli video-handler

migrate:
	$(PYTHON) -m app.cli migrate

seed:
	$(PYTHON) -m app.cli seed

test:
	$(PYTHON) -m pytest -v tests/

sim-mqtt:
	$(PYTHON) scripts/mqtt_sensor_simulator.py

sim-video:
	$(PYTHON) scripts/video_loop_simulator.py

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
