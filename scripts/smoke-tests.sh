#!/bin/bash
set -e

# Smoke Test Runner for Production
# Validates deployment health after production deployment

PROD_URL="${PROD_URL:-https://api.t3ck.io}"
TIMEOUT="${TIMEOUT:-300}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-10}"

echo "🧪 Starting production smoke tests..."
echo "Target: $PROD_URL"
echo "Timeout: ${TIMEOUT}s"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for tests
PASSED=0
FAILED=0

# Test 1: Health Check
echo ""
echo -n "📋 Test 1: Health Endpoints... "
if curl -f -s -m 10 "$PROD_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 2: Auth Service Health
echo -n "📋 Test 2: Auth Service... "
if curl -f -s -m 10 "$PROD_URL/auth/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 3: Webhook Service Health
echo -n "📋 Test 3: Webhook Service... "
if curl -s -m 10 -X OPTIONS "$PROD_URL/api/webhooks" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 4: Tenant Service Health
echo -n "📋 Test 4: Tenant Service... "
if curl -s -m 10 -X OPTIONS "$PROD_URL/provisioning/submit" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 5: Authentication Flow
echo -n "📋 Test 5: Authentication Flow... "
AUTH_RESPONSE=$(curl -s -X POST "$PROD_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"provider":"firebase","token":"test-token"}' 2>/dev/null || echo '{}')

if echo "$AUTH_RESPONSE" | grep -q "token\|error"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

# Test 6: Service Stability (3 checks)
echo -n "📋 Test 6: Service Stability (3 checks)... "
STABILITY_PASSES=0
for i in {1..3}; do
    if curl -f -s -m 10 "$PROD_URL/health" > /dev/null 2>&1; then
        ((STABILITY_PASSES++))
    fi
    if [ $i -lt 3 ]; then
        sleep $HEALTH_CHECK_INTERVAL
    fi
done

if [ $STABILITY_PASSES -eq 3 ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (${STABILITY_PASSES}/3)${NC}"
    ((FAILED++))
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   SMOKE TEST SUMMARY                           ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║ Total Tests: $((PASSED + FAILED))                                              ║"
echo "║ Passed:      $PASSED                                               ║"
echo "║ Failed:      $FAILED                                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some smoke tests failed!${NC}"
    exit 1
fi
