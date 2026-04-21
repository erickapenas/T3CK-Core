#!/bin/bash
# Health check script for Redis Sentinel
# Used by Docker HEALTHCHECK and Kubernetes probes

set -e

SENTINEL_PORT=${SENTINEL_PORT:-26379}
SENTINEL_HOST=${SENTINEL_HOST:-localhost}
SENTINEL_TIMEOUT=${SENTINEL_TIMEOUT:-5}

# Check if Sentinel is responding
if redis-cli -h "$SENTINEL_HOST" -p "$SENTINEL_PORT" --no-auth-warning PING > /dev/null 2>&1; then
  # Additional check: verify we can get master info
  if redis-cli -h "$SENTINEL_HOST" -p "$SENTINEL_PORT" --no-auth-warning SENTINEL masters > /dev/null 2>&1; then
    exit 0  # Healthy
  else
    echo "ERROR: Cannot get Sentinel master info"
    exit 1  # Unhealthy
  fi
else
  echo "ERROR: Sentinel not responding to PING"
  exit 1  # Unhealthy
fi
