#!/usr/bin/env bash
# supabase/functions/send-partner-broadcast/test-paths.sh
# Manual path-coverage harness for the send-partner-broadcast Edge Function.
# Walks each error code in spec §5.1 and the 200 happy path.
#
# Usage:
#   export SUPABASE_FN_URL='https://mzqtrpdiqhopjmxjccwy.supabase.co/functions/v1/send-partner-broadcast'
#   export SUPER_ADMIN_JWT='<paste session access_token from a super-admin login>'
#   export NORMAL_USER_JWT='<paste session access_token from a non-admin login>'
#   export VALID_PARTNER_ID='<uuid of partner with perk_text + is_active=true + ≥1 aligned active pool>'
#   export NO_PERK_PARTNER_ID='<uuid of partner with NULL perk_text>'
#   ./test-paths.sh
#
# Exit code: 0 if every path returned its expected status; nonzero otherwise.

set -u

URL="${SUPABASE_FN_URL:?Set SUPABASE_FN_URL}"
SUPER="${SUPER_ADMIN_JWT:?Set SUPER_ADMIN_JWT}"
NORMAL="${NORMAL_USER_JWT:-}"
PARTNER="${VALID_PARTNER_ID:?Set VALID_PARTNER_ID}"
NO_PERK="${NO_PERK_PARTNER_ID:-}"

pass=0
fail=0

check() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '  ✓ %-30s  %s\n' "$name" "$actual"
    pass=$((pass + 1))
  else
    printf '  ✗ %-30s  got %s expected %s — %s\n' "$name" "$actual" "$expected" "$body"
    fail=$((fail + 1))
  fi
}

call() {
  local jwt="$1" body="$2"
  curl -sS -o /tmp/spb-body.txt -w '%{http_code}' \
    -X POST "$URL" \
    -H "Authorization: Bearer $jwt" \
    -H 'content-type: application/json' \
    -d "$body"
}

echo '== 403 paths =='
status=$(call '' "{\"partner_id\":\"$PARTNER\",\"message\":\"hi\"}")
check 'no auth header'      403 "$status" "$(cat /tmp/spb-body.txt)"

status=$(call 'not-a-real-token' "{\"partner_id\":\"$PARTNER\",\"message\":\"hi\"}")
check 'bad auth token'      403 "$status" "$(cat /tmp/spb-body.txt)"

if [[ -n "$NORMAL" ]]; then
  status=$(call "$NORMAL" "{\"partner_id\":\"$PARTNER\",\"message\":\"hi\"}")
  check 'non-super-admin'   403 "$status" "$(cat /tmp/spb-body.txt)"
fi

echo
echo '== 400 paths =='
status=$(call "$SUPER" '{"partner_id":"","message":"hi"}')
check 'missing partner_id'  400 "$status" "$(cat /tmp/spb-body.txt)"

status=$(call "$SUPER" "{\"partner_id\":\"$PARTNER\",\"message\":\"\"}")
check 'empty message'       400 "$status" "$(cat /tmp/spb-body.txt)"

long_msg=$(printf 'x%.0s' {1..281})
status=$(call "$SUPER" "{\"partner_id\":\"$PARTNER\",\"message\":\"$long_msg\"}")
check 'message > 280 chars' 400 "$status" "$(cat /tmp/spb-body.txt)"

echo
echo '== 404 paths =='
status=$(call "$SUPER" '{"partner_id":"00000000-0000-0000-0000-000000000000","message":"hi"}')
check 'nonexistent partner' 404 "$status" "$(cat /tmp/spb-body.txt)"

echo
echo '== 409 paths =='
if [[ -n "$NO_PERK" ]]; then
  status=$(call "$SUPER" "{\"partner_id\":\"$NO_PERK\",\"message\":\"hi\"}")
  check 'partner has no perk' 409 "$status" "$(cat /tmp/spb-body.txt)"
fi

echo
echo '== 200 happy path =='
status=$(call "$SUPER" "{\"partner_id\":\"$PARTNER\",\"message\":\"Path-coverage test broadcast — please ignore.\"}")
check 'valid broadcast'     200 "$status" "$(cat /tmp/spb-body.txt)"

echo
echo '== 429 rate limit =='
echo '  (fire 3 more times to push count above the 3-per-24h ceiling)'
for i in 2 3 4; do
  status=$(call "$SUPER" "{\"partner_id\":\"$PARTNER\",\"message\":\"rate-limit probe $i\"}")
  if [[ "$i" == "4" ]]; then
    check '4th call hits 429' 429 "$status" "$(cat /tmp/spb-body.txt)"
  else
    echo "  · call $i: $status"
  fi
done

echo
echo "== summary =="
echo "  pass: $pass"
echo "  fail: $fail"

[[ $fail -eq 0 ]]
