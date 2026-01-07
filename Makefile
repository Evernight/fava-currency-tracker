default: dev

deps-js:
	cd frontend; npm install

deps-py:
	uv pip install -e ".[dev]"

deps: deps-js deps-py

build-js:
	cd frontend; npm run build

build: build-js

lint:
	cd frontend; npm run type-check
	cd frontend; npm run lint
	uv run mypy src/fava_currency_tracker tests
	uv run pylint src/fava_currency_tracker tests

format:
	-cd frontend; npm run lint:fix
	-uv run ruff check --fix
	uv run ruff format .

# Run Python unit tests
test:
	uv run pytest -v

# Development with live reload (parametrizable beancount file path)
# Usage: make dev LEDGER_FILE=path/to/file.beancount
LEDGER_FILE ?= example/example.beancount
dev:
	npx concurrently --names fava,esbuild \
	  "cd $$(dirname $(LEDGER_FILE)) && PYTHONUNBUFFERED=1 uv run fava --debug $$(basename $(LEDGER_FILE))" \
	  "cd frontend; npm install && npm run watch"
