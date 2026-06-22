#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-unknown}"

missing=()

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
}

require_one_of() {
  local name="$1"
  local value="${!name:-}"
  shift
  local allowed=("$@")
  local ok="false"
  for item in "${allowed[@]}"; do
    if [[ "$value" == "$item" ]]; then
      ok="true"
      break
    fi
  done

  if [[ "$ok" != "true" ]]; then
    echo "FAILED $name must be one of: ${allowed[*]} (got '$value')"
    exit 1
  fi
}

require_var AWS_REGION
require_var ECR_REPOSITORY
require_var TASK_FAMILY
require_var EXECUTION_ROLE_ARN
require_var TASK_ROLE_ARN
require_var CORS_ALLOW_ORIGINS
require_var MODEL_PRIMARY_PROVIDER
require_var MODEL_FALLBACK_PROVIDER
require_var DATABASE_URL_SECRET_ARN
require_var WIDGET_SIGNING_SECRET_ARN
require_var WIDGET_ADMIN_SECRET_ARN
require_var LOG_GROUP
require_var ECS_CLUSTER
require_var ECS_SERVICE
require_var PRIVATE_SUBNETS
require_var ECS_SECURITY_GROUP
require_var BASE_URL

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "FAILED missing required variables: ${missing[*]}"
  exit 1
fi

require_one_of MODEL_PRIMARY_PROVIDER openai anthropic mock
require_one_of MODEL_FALLBACK_PROVIDER openai anthropic mock

rate_limit_enabled="${RATE_LIMIT_ENABLED:-}"
if [[ -n "$rate_limit_enabled" ]]; then
  case "${rate_limit_enabled,,}" in
    true|false|1|0|yes|no|on|off) ;;
    *)
      echo "FAILED RATE_LIMIT_ENABLED must be boolean-like when provided"
      exit 1
      ;;
  esac
fi

need_openai="false"
need_anthropic="false"

if [[ "$MODEL_PRIMARY_PROVIDER" == "openai" || "$MODEL_FALLBACK_PROVIDER" == "openai" ]]; then
  need_openai="true"
fi

if [[ "$MODEL_PRIMARY_PROVIDER" == "anthropic" || "$MODEL_FALLBACK_PROVIDER" == "anthropic" ]]; then
  need_anthropic="true"
fi

if [[ "$MODEL_PRIMARY_PROVIDER" == "openai" && -z "${MODEL_PRIMARY_MODEL:-}" ]]; then
  echo "FAILED MODEL_PRIMARY_MODEL must be set when MODEL_PRIMARY_PROVIDER=openai"
  exit 1
fi

if [[ "$MODEL_FALLBACK_PROVIDER" == "openai" && -z "${MODEL_FALLBACK_MODEL:-}" ]]; then
  echo "FAILED MODEL_FALLBACK_MODEL must be set when MODEL_FALLBACK_PROVIDER=openai"
  exit 1
fi

if [[ "$MODEL_PRIMARY_PROVIDER" == "anthropic" && -z "${MODEL_PRIMARY_MODEL:-}" ]]; then
  echo "FAILED MODEL_PRIMARY_MODEL must be set when MODEL_PRIMARY_PROVIDER=anthropic"
  exit 1
fi

if [[ "$MODEL_FALLBACK_PROVIDER" == "anthropic" && -z "${MODEL_FALLBACK_MODEL:-}" ]]; then
  echo "FAILED MODEL_FALLBACK_MODEL must be set when MODEL_FALLBACK_PROVIDER=anthropic"
  exit 1
fi

if [[ "$need_openai" == "true" ]]; then
  require_var OPENAI_API_KEY_SECRET_ARN
fi

if [[ "$need_anthropic" == "true" ]]; then
  require_var ANTHROPIC_API_KEY_SECRET_ARN
fi

classifier_enabled="${GATE_ROUTER_CLASSIFIER_ENABLED:-}"
if [[ -n "$classifier_enabled" ]]; then
  case "${classifier_enabled,,}" in
    true|false|1|0|yes|no|on|off) ;;
    *)
      echo "FAILED GATE_ROUTER_CLASSIFIER_ENABLED must be boolean-like when provided"
      exit 1
      ;;
  esac
fi

classifier_enabled_norm="${classifier_enabled,,}"
if [[ "$classifier_enabled_norm" == "true" || "$classifier_enabled_norm" == "1" || "$classifier_enabled_norm" == "yes" || "$classifier_enabled_norm" == "on" ]]; then
  if [[ -n "${GATE_ROUTER_CLASSIFIER_PROVIDER:-}" ]]; then
    require_one_of GATE_ROUTER_CLASSIFIER_PROVIDER openai anthropic
  fi

  provider="${GATE_ROUTER_CLASSIFIER_PROVIDER:-openai}"
  if [[ "$provider" == "openai" ]]; then
    require_var OPENAI_API_KEY_SECRET_ARN
  fi
  if [[ "$provider" == "anthropic" ]]; then
    require_var ANTHROPIC_API_KEY_SECRET_ARN
  fi
  require_var GATE_ROUTER_CLASSIFIER_MODEL
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "FAILED missing required variables: ${missing[*]}"
  exit 1
fi

if [[ "$ENV_NAME" == "prod" && "$CORS_ALLOW_ORIGINS" == *"*"* ]]; then
  echo "FAILED CORS_ALLOW_ORIGINS cannot contain '*' in prod"
  exit 1
fi

echo "OK config validation passed for $ENV_NAME"
