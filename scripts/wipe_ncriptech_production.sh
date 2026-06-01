#!/usr/bin/env bash
# =========================================================================
# ⚠️ DESTRUCTIVE — Wipes ALL lead data for the "Ncriptech" tenant on PROD.
# Run this ONLY after you've deployed v64+ to production (https://leadtrak.in).
#
# Usage:
#   bash /app/scripts/wipe_ncriptech_production.sh "<SUPER_ADMIN_EMAIL>" "<SUPER_ADMIN_PASSWORD>"
#
# What gets deleted (for org named exactly "Ncriptech"):
#   - All leads
#   - All follow-ups, admissions, demos, lead events, call logs
#   - All WhatsApp messages + duplicate dismissals tied to those leads
#   - Lead-related notifications
#
# What is preserved:
#   - The organization itself, users, services, sources, billing/invoices,
#     integrations, custom lead-statuses settings.
# =========================================================================
set -euo pipefail

PROD_URL="https://leadtrak.in"
EMAIL="${1:-}"
PASSWORD="${2:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Usage: $0 <super_admin_email> <super_admin_password>"
  exit 1
fi

COOKIE=$(mktemp)
trap "rm -f $COOKIE" EXIT

echo "→ Logging in to production as $EMAIL..."
LOGIN=$(curl -sS -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c "$COOKIE" -w "%{http_code}" -o /tmp/_login_body.json)

if [[ "$LOGIN" != "200" ]]; then
  echo "✗ Login failed (HTTP $LOGIN):"
  cat /tmp/_login_body.json
  exit 1
fi

ROLE=$(python3 -c "import json;print(json.load(open('/tmp/_login_body.json')).get('role'))")
echo "  ✓ logged in as role: $ROLE"
if [[ "$ROLE" != "super_admin" ]]; then
  echo "✗ Only super_admin can run this. Aborting."
  exit 1
fi

echo ""
echo "→ DRY CHECK: requesting wipe with WRONG token (should be rejected)..."
DRY=$(curl -sS -X POST "$PROD_URL/api/platform/wipe-org-data?org_name=Ncriptech&confirm=DRY_CHECK" \
  -b "$COOKIE" -w "\nHTTP_%{http_code}")
echo "$DRY"

echo ""
read -p "About to WIPE all lead data for 'Ncriptech' on PRODUCTION. Type 'WIPE' to proceed: " ans
if [[ "$ans" != "WIPE" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "→ Executing wipe..."
RESULT=$(curl -sS -X POST "$PROD_URL/api/platform/wipe-org-data?org_name=Ncriptech&confirm=YES_DELETE_NCRIPTECH" \
  -b "$COOKIE")
echo "$RESULT" | python3 -m json.tool

echo ""
echo "✓ Wipe complete."
