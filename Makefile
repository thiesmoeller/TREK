COMPOSE := docker compose

.PHONY: help init build up down restart logs ps

help:
	@echo "Available targets:"
	@echo "  make init     Create data dirs and .env with ENCRYPTION_KEY, UID, and GID if missing"
	@echo "  make build    Build the Docker image"
	@echo "  make up       Start the stack in detached mode"
	@echo "  make down     Stop the stack"
	@echo "  make restart  Restart the stack"
	@echo "  make logs     Follow container logs"
	@echo "  make ps       Show container status"

init:
	@mkdir -p data uploads uploads/photos uploads/files uploads/covers uploads/avatars
	@if [ ! -f .env ]; then \
		echo "ENCRYPTION_KEY=$$(openssl rand -hex 32)" > .env; \
		echo "UID=$$(id -u)" >> .env; \
		echo "GID=$$(id -g)" >> .env; \
		echo "Created .env"; \
	else \
		grep -q '^ENCRYPTION_KEY=' .env || echo "ENCRYPTION_KEY=$$(openssl rand -hex 32)" >> .env; \
		grep -q '^UID=' .env || echo "UID=$$(id -u)" >> .env; \
		grep -q '^GID=' .env || echo "GID=$$(id -g)" >> .env; \
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
