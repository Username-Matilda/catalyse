.PHONY: dev install test test-headed test-debug test-smoke scenario scenarios scenario-clean

# Start the development server on http://localhost:8001
dev:
	. venv/bin/activate && python api.py

# Install Python dependencies and download the Playwright Chromium browser
install:
	. venv/bin/activate && pip install -r requirements.txt && playwright install chromium

# Run all e2e tests headlessly (fast, no browser window)
test:
	. venv/bin/activate && pytest tests/e2e/

# Run all e2e tests with a visible browser, slowed down so you can follow along
test-headed:
	. venv/bin/activate && pytest tests/e2e/ --headed --slowmo=500

# Run tests with Playwright Inspector — step through each action with a GUI debugger
test-debug:
	. venv/bin/activate && PWDEBUG=1 pytest tests/e2e/ --headed

# Run smoke tests against production (read-only, no data created)
# Usage: make test-smoke EMAIL=you@example.com PASSWORD=yourpassword
test-smoke:
	. venv/bin/activate && \
	BASE_URL=https://catalyse.pauseai.uk \
	TEST_USER_EMAIL=$(EMAIL) \
	TEST_USER_PASSWORD=$(PASSWORD) \
	pytest tests/e2e/ -m "not local_only"

# Run a single Claude scenario walkthrough against the local dev server
# Requires the dev server to be running first: make dev
# Usage: make scenario NAME=01-volunteer-propose-project
scenario:
	@curl -sf http://localhost:8001/api/skills > /dev/null || (echo "Error: dev server is not running. Start it with 'make dev' in another terminal." && exit 1)
	@echo "Available scenarios:"; \
	ls tests/scenarios/*.md | grep -v README | xargs -I{} basename {} .md | nl -w2 -s') '; \
	printf "Enter scenario name or number: "; \
	read INPUT; \
	if echo "$$INPUT" | grep -qE '^[0-9]+$$'; then \
		NAME=$$(ls tests/scenarios/*.md | grep -v README | sed -n "$${INPUT}p" | xargs basename | sed 's/\.md$$//'); \
	else \
		NAME=$$INPUT; \
	fi; \
	DATETIME=$$(date +%Y-%m-%dT%H-%M-%S); \
	BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	COMMIT=$$(git rev-parse --short HEAD); \
	mkdir -p tests/scenarios/results; \
	OUTFILE="tests/scenarios/results/$${DATETIME}_$${NAME}_$${BRANCH}_$${COMMIT}.md"; \
	printf -- '---\ndate: %s\nscenario: %s\nbranch: %s\ncommit: %s\n---\n' \
		"$${DATETIME}" "$${NAME}" "$${BRANCH}" "$${COMMIT}" > "$${OUTFILE}"; \
	echo "Running scenario: $$NAME"; \
	echo "Results will be written to: $$OUTFILE"; \
	claude "Please run the scenario in tests/scenarios/$${NAME}.md against http://localhost:8001. Write the results to $${OUTFILE}, which already exists with YAML frontmatter. Append to the file: a '## Results' section with a markdown table (columns: Step, Result, Notes), then an '## Observations' section listing any UX issues or unexpected behaviour noticed during the run. Do not rewrite the frontmatter."

# Remove test accounts and projects left over from scenario walkthroughs
scenario-clean:
	. venv/bin/activate && python tests/scenarios/cleanup.py

# Run all Claude scenario walkthroughs in order
# Requires the dev server to be running first: make dev
scenarios:
	@curl -sf http://localhost:8001/api/skills > /dev/null || (echo "Error: dev server is not running. Start it with 'make dev' in another terminal." && exit 1)
	@DATETIME=$$(date +%Y-%m-%dT%H-%M-%S); \
	BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	COMMIT=$$(git rev-parse --short HEAD); \
	mkdir -p tests/scenarios/results; \
	OUTFILE="tests/scenarios/results/$${DATETIME}_all-scenarios_$${BRANCH}_$${COMMIT}.md"; \
	printf -- '---\ndate: %s\nscenario: all\nbranch: %s\ncommit: %s\n---\n' \
		"$${DATETIME}" "$${BRANCH}" "$${COMMIT}" > "$${OUTFILE}"; \
	echo "Results will be written to: $$OUTFILE"; \
	claude "Please run each scenario in tests/scenarios/ in order (skip README and triage files) against http://localhost:8001. Write the results to $${OUTFILE}, which already exists with YAML frontmatter. For each scenario append an H2 heading with the scenario name, a results table (columns: Step, Result, Notes), and an Observations subsection. Do not rewrite the frontmatter."
