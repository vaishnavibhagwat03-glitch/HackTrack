#!/usr/bin/env bash
# Checks a running HackTrack deployment end to end, through the public address.
#
#   ./scripts/smoke-test.sh                       # http://localhost, password from .env
#   ./scripts/smoke-test.sh http://203.0.113.7
#   ./scripts/smoke-test.sh https://hacktrack.example.com
#
# Needs curl. Reads HACKTRACK_ADMIN_PASSWORD and HACKTRACK_DEMO_LOGINS from the
# environment or from .env.
set -u

BASE="${1:-http://localhost}"
BASE="${BASE%/}"
if [ -z "${HACKTRACK_ADMIN_PASSWORD:-}" ] && [ -f .env ]; then
  HACKTRACK_ADMIN_PASSWORD="$(grep -E '^HACKTRACK_ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2-)"
fi
ADMIN_PW="${HACKTRACK_ADMIN_PASSWORD:-}"
if [ -z "${HACKTRACK_DEMO_LOGINS:-}" ] && [ -f .env ]; then
  HACKTRACK_DEMO_LOGINS="$(grep -E '^HACKTRACK_DEMO_LOGINS=' .env | head -1 | cut -d= -f2-)"
fi
DEMO_LOGINS="${HACKTRACK_DEMO_LOGINS:-on}"

failures=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; failures=$((failures + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

login() {  # login EMAIL PASSWORD -> prints the JSON response
  curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

echo "Smoke test: $BASE"

echo "Website (Next.js, via the proxy)"
for page in / /signin /gallery /dashboard; do
  code="$(curl -s -o /tmp/hacktrack-page.html -w '%{http_code}' "$BASE$page")"
  check "page $page loads" '[[ "$code" == 200 ]] && grep -q HackTrack /tmp/hacktrack-page.html'
done
rm -f /tmp/hacktrack-page.html

echo "C++ client (bridge, via /api)"
health="$(curl -s "$BASE/api/health")"
check "C++ client answers /api/health" '[[ "$health" == *"HackTrack C++17 client"* ]]'
check "C++ client reaches the Node server" '[[ "$health" == *"\"server\":{"*"\"ok\":true"* ]]'
check "response comes from the C++ client" 'curl -sI "$BASE/api/health" | grep -qi "x-served-by: HackTrack-Cpp-Client"'

echo "Accounts (Node server + SQLite, via the C++ client)"
check "published demo admin password is rejected" '[[ "$(login admin@hacktrack.dev admin123)" =~ (InvalidCredentials|DemoLoginsOff) ]]'
if [ -n "$ADMIN_PW" ]; then
  admin="$(login admin@hacktrack.dev "$ADMIN_PW")"
  check "admin signs in with the private password" '[[ "$admin" == *"\"token\""* ]]'
  token="$(printf '%s' "$admin" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  projects="$(curl -s "$BASE/api/projects" -H "Authorization: Bearer $token")"
  check "projects come back from the database" '[[ "$projects" == *"\"projects\":[{"* ]]'
else
  fail "HACKTRACK_ADMIN_PASSWORD not set (export it or run from the folder with .env)"
fi
if [ "$DEMO_LOGINS" = off ]; then
  check "demo judge password is refused (demo logins off)" '[[ "$(login judge@hacktrack.dev judge123)" == *DemoLoginsOff* ]]'
else
  check "demo judge account signs in" '[[ "$(login judge@hacktrack.dev judge123)" == *"\"token\""* ]]'
fi

echo
if [ "$failures" -eq 0 ]; then echo "All checks passed."; else echo "$failures check(s) failed."; fi
exit "$failures"
