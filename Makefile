COMPOSE := docker compose

.PHONY: help init build up down restart logs ps

help:
	@echo "Available targets:"
	@echo "  make init     Create data dirs and .env with JWT_SECRET if missing"
	@echo "  make build    Build the Docker image"
	@echo "  make up       Start the stack in detached mode"
	@echo "  make down     Stop the stack"
	@echo "  make restart  Restart the stack"
	@echo "  make logs     Follow container logs"
	@echo "  make ps       Show container status"

init:
	@mkdir -p data uploads
	@if [ ! -f .env ]; then \
		echo "JWT_SECRET=$$(openssl rand -hex 32)" > .env; \
		echo "Created .env"; \
	else \
		echo ".env already exists"; \
	fi

build:
	@$(COMPOSE) build

up: init
	@$(COMPOSE) up -d --build

down:
	@$(COMPOSE) down

restart:
	@$(COMPOSE) restart

logs:
	@$(COMPOSE) logs -f app

ps:
	@$(COMPOSE) ps
