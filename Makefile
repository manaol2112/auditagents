# SOX ITGC planning engine: Docker-based development.
#   make go     free this project's ports, (re)build and start db + migrate + api, seed the demo if empty, open the workspace
#   make stop   stop the stack (keeps the database volume);  make reset  also wipes the database
#   make test   run the test suite against the compose database server
#   make logs   follow the api/db logs;  make ports  show what listens on the project's ports

-include .env
PG_PORT  ?= 5432
API_PORT ?= 8765
PORTS     = $(PG_PORT) $(API_PORT)
COMPOSE   = docker compose
URL       = http://localhost:$(API_PORT)
# TIMEOUT seconds cmd...: run cmd, end it if it hangs (Docker's CLI can block forever when the daemon is wedged).
TIMEOUT   = perl -e '$$t=shift; $$p=fork; if(!$$p){exec @ARGV} $$SIG{ALRM}=sub{kill 9,$$p; exit 124}; alarm $$t; waitpid $$p,0; exit $$?>>8'

.PHONY: go free-ports check-docker up seed open stop reset test logs ports demo cli

go: check-docker free-ports up seed open
	@echo "ready: $(URL)"

check-docker:
	@$(TIMEOUT) 15 docker info >/dev/null 2>&1 || { \
		echo "Docker is not responding. Start Docker Desktop (and free disk space if it is full), then run 'make go' again."; exit 1; }

# Free the ports this project needs: stop a previous stack, then end anything still listening on them.
free-ports:
	@$(TIMEOUT) 60 $(COMPOSE) down --remove-orphans >/dev/null 2>&1 || true
	@for p in $(PORTS); do \
		pids=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then echo "port $$p: stopping process(es) $$pids"; kill $$pids 2>/dev/null || true; sleep 1; kill -9 $$pids 2>/dev/null || true; fi; \
	done

up:
	$(COMPOSE) --profile tools build cli
	$(COMPOSE) up -d --build --wait db migrate api

# Demo data for the workspace (idempotent): Northwind (deterministic plan + approval) and Lumen (agent review loop, replayed, no API calls).
seed:
	@$(COMPOSE) run --rm cli seed

open:
	@command -v open >/dev/null && open "$(URL)" || echo "open $(URL)"

stop:
	$(COMPOSE) down --remove-orphans

reset:
	$(COMPOSE) down --remove-orphans -v

test:
	$(COMPOSE) run --rm --build test

logs:
	$(COMPOSE) logs -f api db

ports:
	@for p in $(PORTS); do echo "port $$p:"; lsof -nP -iTCP:$$p -sTCP:LISTEN 2>/dev/null || echo "  free"; done

demo:
	$(COMPOSE) run --rm cli demo

# Any engine command: make cli ARGS="show NW-FY2026-ITGC"
cli:
	$(COMPOSE) run --rm cli $(ARGS)
