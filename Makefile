# Groundwork checks. `make check-fast` runs at every session start and is what
# the Stop hook enforces for changed files. `make check` adds the slow suites.

SHELL := /bin/bash
SH_FILES := $(shell git ls-files '*.sh' 2>/dev/null)
PY_FILES := $(shell git ls-files '*.py' 2>/dev/null)

.PHONY: check-fast check plan-lint shell-check py-check ts-check slow

check-fast: plan-lint shell-check py-check ts-check
	@echo "check-fast: ok"

check: check-fast slow
	@echo "check: ok"

plan-lint:
	@python3 scripts/agent/plan.py lint

shell-check:
	@for f in $(SH_FILES); do bash -n "$$f" || exit 1; done
	@if command -v shellcheck >/dev/null 2>&1; then \
	  shellcheck -S warning $(SH_FILES); \
	else \
	  echo "shell-check: shellcheck not installed, syntax only"; \
	fi

py-check:
	@for f in $(PY_FILES); do python3 -m py_compile "$$f" || exit 1; done

ts-check:
	@if [[ -f pnpm-workspace.yaml ]]; then pnpm -s typecheck && pnpm -s test; \
	else echo "ts-check: no workspace yet (R0-03)"; fi

slow:
	@if [[ -f pnpm-workspace.yaml ]] && grep -q '"test:slow"' package.json; then pnpm -s test:slow; \
	else echo "slow: no slow suites yet"; fi
