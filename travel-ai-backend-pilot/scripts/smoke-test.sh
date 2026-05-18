#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <base_url> [tenant_id] [site_id]"
  echo "required env: WIDGET_ADMIN_KEY"
  exit 1
fi

BASE_URL="${1%/}"
TENANT_ID="${2:-tenant_luxe_demo}"
SITE_ID="${3:-luxevoyages.example}"
WIDGET_ADMIN_KEY="${WIDGET_ADMIN_KEY:-}"
SUMMARY_PATH="${SMOKE_SUMMARY_PATH:-/tmp/smoke_summary.json}"

if [[ -z "$WIDGET_ADMIN_KEY" ]]; then
  echo "FAILED missing WIDGET_ADMIN_KEY"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "FAILED jq is required for smoke tests"
  exit 1
fi

check() {
  local url="$1"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url")
  if [[ "$code" -lt 200 || "$code" -ge 400 ]]; then
    echo "FAILED $url -> $code"
    exit 1
  fi
  echo "OK $url -> $code"
}

check "$BASE_URL/health"
check "$BASE_URL/widget/v1.js"

TOKEN_PAYLOAD=$(jq -nc --arg tenant "$TENANT_ID" --arg site "$SITE_ID" '{"tenantId":$tenant,"siteId":$site,"ttlSeconds":1800}')
TOKEN_CODE=$(curl -sS -o /tmp/smoke_token.json -w "%{http_code}" -X POST "$BASE_URL/v1/widget/token" -H "content-type: application/json" -H "x-widget-admin-key: $WIDGET_ADMIN_KEY" -d "$TOKEN_PAYLOAD")

if [[ "$TOKEN_CODE" -ge 400 ]]; then
  echo "FAILED /v1/widget/token -> $TOKEN_CODE"
  cat /tmp/smoke_token.json
  exit 1
fi

WIDGET_TOKEN=$(jq -r '.token // empty' /tmp/smoke_token.json)
if [[ -z "$WIDGET_TOKEN" ]]; then
  echo "FAILED /v1/widget/token did not return a token"
  cat /tmp/smoke_token.json
  exit 1
fi

echo "OK /v1/widget/token -> $TOKEN_CODE"

SESSION_PAYLOAD=$(jq -nc --arg tenant "$TENANT_ID" --arg site "$SITE_ID" --arg token "$WIDGET_TOKEN" '{"tenantId":$tenant,"siteId":$site,"visitorId":"smoke","consentGiven":true,"widgetToken":$token}')
SESSION_CODE=$(curl -sS -o /tmp/smoke_session.json -w "%{http_code}" -X POST "$BASE_URL/v1/chat/session" -H "content-type: application/json" -d "$SESSION_PAYLOAD")

if [[ "$SESSION_CODE" -ge 400 ]]; then
  echo "FAILED /v1/chat/session -> $SESSION_CODE"
  cat /tmp/smoke_session.json
  exit 1
fi

echo "OK /v1/chat/session -> $SESSION_CODE"

SESSION_ID=$(jq -r '.sessionId // empty' /tmp/smoke_session.json)
if [[ -z "$SESSION_ID" ]]; then
  echo "FAILED /v1/chat/session did not return sessionId"
  cat /tmp/smoke_session.json
  exit 1
fi

MESSAGE_PAYLOAD=$(jq -nc --arg tenant "$TENANT_ID" --arg session "$SESSION_ID" '{"tenantId":$tenant,"sessionId":$session,"message":"We are planning a luxury honeymoon in Japan next year with a 25k budget and can move quickly."}')
MESSAGE_CODE=$(curl -sS -o /tmp/smoke_message.json -w "%{http_code}" -X POST "$BASE_URL/v1/chat/message" -H "content-type: application/json" -d "$MESSAGE_PAYLOAD")

if [[ "$MESSAGE_CODE" -ge 400 ]]; then
  echo "FAILED /v1/chat/message -> $MESSAGE_CODE"
  cat /tmp/smoke_message.json
  exit 1
fi

echo "OK /v1/chat/message -> $MESSAGE_CODE"

CONTACT_PAYLOAD=$(jq -nc --arg tenant "$TENANT_ID" --arg session "$SESSION_ID" '{"tenantId":$tenant,"sessionId":$session,"contactEmail":"smoke.lead@example.com"}')
CONTACT_CODE=$(curl -sS -o /tmp/smoke_contact.json -w "%{http_code}" -X POST "$BASE_URL/v1/lead/contact" -H "content-type: application/json" -d "$CONTACT_PAYLOAD")

if [[ "$CONTACT_CODE" -ge 400 ]]; then
  echo "FAILED /v1/lead/contact -> $CONTACT_CODE"
  cat /tmp/smoke_contact.json
  exit 1
fi

echo "OK /v1/lead/contact -> $CONTACT_CODE"

ESCALATE_PAYLOAD=$(jq -nc --arg tenant "$TENANT_ID" --arg session "$SESSION_ID" '{"tenantId":$tenant,"sessionId":$session,"reason":"smoke-test escalation path validation"}')
ESCALATE_CODE=$(curl -sS -o /tmp/smoke_escalate.json -w "%{http_code}" -X POST "$BASE_URL/v1/handoff/escalate" -H "content-type: application/json" -d "$ESCALATE_PAYLOAD")

if [[ "$ESCALATE_CODE" -ge 400 ]]; then
  echo "FAILED /v1/handoff/escalate -> $ESCALATE_CODE"
  cat /tmp/smoke_escalate.json
  exit 1
fi

CRM_TASK_ID=$(jq -r '.crmExternalId // empty' /tmp/smoke_escalate.json)
if [[ -z "$CRM_TASK_ID" ]]; then
  echo "FAILED /v1/handoff/escalate missing crmExternalId"
  cat /tmp/smoke_escalate.json
  exit 1
fi

echo "OK /v1/handoff/escalate -> $ESCALATE_CODE"
jq -nc \
  --arg health "ok" \
  --arg widget "ok" \
  --arg token "ok" \
  --arg session "ok" \
  --arg message "ok" \
  --arg contact "ok" \
  --arg handoff "ok" \
  --arg tenant "$TENANT_ID" \
  --arg site "$SITE_ID" \
  --arg sessionId "$SESSION_ID" \
  --arg crmTask "$CRM_TASK_ID" \
  '{health:$health,widget:$widget,token:$token,session:$session,message:$message,contact:$contact,handoff:$handoff,tenant:$tenant,site:$site,sessionId:$sessionId,crmTask:$crmTask}' > "$SUMMARY_PATH"

echo "SUMMARY health=ok widget=ok token=ok session=ok message=ok contact=ok handoff=ok tenant=$TENANT_ID site=$SITE_ID session=$SESSION_ID crmTask=$CRM_TASK_ID"
