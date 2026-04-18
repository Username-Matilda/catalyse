.PHONY: dev install test test-headed test-debug test-smoke

# Start the development server on http://localhost:8001
dev:
	python api.py

# Install Python dependencies and download the Playwright Chromium browser
install:
	pip install -r requirements.txt && playwright install chromium

# Run all e2e tests headlessly (fast, no browser window)
test:
	pytest tests/e2e/

# Run all e2e tests with a visible browser, slowed down so you can follow along
test-headed:
	pytest tests/e2e/ --headed --slowmo=500

# Run tests with Playwright Inspector — step through each action with a GUI debugger
test-debug:
	PWDEBUG=1 pytest tests/e2e/ --headed

# Run smoke tests against production (read-only, no data created)
# Usage: make test-smoke EMAIL=you@example.com PASSWORD=yourpassword
test-smoke:
	BASE_URL=https://catalyse.pauseai.uk \
	TEST_USER_EMAIL=$(EMAIL) \
	TEST_USER_PASSWORD=$(PASSWORD) \
	pytest tests/e2e/ -m "not local_only"
