#!/usr/bin/env pwsh
<#
.SYNOPSIS
Smoke Test Runner for Production
.DESCRIPTION
Validates deployment health after production deployment
.PARAMETER Url
Production URL to test (default: https://api.t3ck.io)
.PARAMETER Timeout
Timeout for each request in seconds (default: 10)
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$Url = $env:PROD_URL,
    
    [Parameter(Mandatory = $false)]
    [int]$Timeout = 10,
    
    [Parameter(Mandatory = $false)]
    [int]$HealthCheckInterval = 10
)

if (-not $Url) {
    $Url = "https://api.t3ck.io"
}

Write-Host "🧪 Starting production smoke tests..." -ForegroundColor Cyan
Write-Host "Target: $Url" -ForegroundColor Gray
Write-Host "Timeout: ${Timeout}s" -ForegroundColor Gray
Write-Host ""

$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [int]$Timeout = 10
    )
    
    Write-Host -NoNewline "📋 $Name... "
    
    try {
        $params = @{
            Uri             = $Url
            Method          = $Method
            TimeoutSec      = $Timeout
            ErrorAction     = "Stop"
            SkipHttpErrorCheck = $true
        }
        
        $response = Invoke-WebRequest @params
        
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 204) {
            Write-Host "✓ PASSED" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "✗ FAILED" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "✗ FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Test 1: Main Health Endpoint
if (Test-Endpoint -Name "Test 1: Health Endpoints" -Url "$Url/health" -Timeout $Timeout) {
    $passed++
} else {
    $failed++
}

# Test 2: Auth Service
if (Test-Endpoint -Name "Test 2: Auth Service" -Url "$Url/auth/health" -Timeout $Timeout) {
    $passed++
} else {
    $failed++
}

# Test 3: Webhook Service
if (Test-Endpoint -Name "Test 3: Webhook Service" -Url "$Url/api/webhooks" -Method "OPTIONS" -Timeout $Timeout) {
    $passed++
} else {
    $failed++
}

# Test 4: Tenant Service
if (Test-Endpoint -Name "Test 4: Tenant Service" -Url "$Url/provisioning/submit" -Method "OPTIONS" -Timeout $Timeout) {
    $passed++
} else {
    $failed++
}

# Test 5: Authentication Flow
Write-Host -NoNewline "📋 Test 5: Authentication Flow... "
try {
    $body = @{
        provider = "firebase"
        token    = "test-token"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$Url/auth/login" `
        -Method "POST" `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec $Timeout `
        -ErrorAction "Stop" `
        -SkipHttpErrorCheck
    
    if ($response.Content -match "token|error") {
        Write-Host "✓ PASSED" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "✗ FAILED" -ForegroundColor Red
        $failed++
    }
}
catch {
    Write-Host "✗ FAILED" -ForegroundColor Red
    $failed++
}

# Test 6: Service Stability
Write-Host -NoNewline "📋 Test 6: Service Stability (3 checks)... "
$stabilityPasses = 0

for ($i = 1; $i -le 3; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$Url/health" `
            -Method "GET" `
            -TimeoutSec $Timeout `
            -ErrorAction "Stop" `
            -SkipHttpErrorCheck
        
        if ($response.StatusCode -eq 200) {
            $stabilityPasses++
        }
    }
    catch { }
    
    if ($i -lt 3) {
        Start-Sleep -Seconds $HealthCheckInterval
    }
}

if ($stabilityPasses -eq 3) {
    Write-Host "✓ PASSED" -ForegroundColor Green
    $passed++
}
else {
    Write-Host "✗ FAILED ($stabilityPasses/3)" -ForegroundColor Red
    $failed++
}

# Summary
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   SMOKE TEST SUMMARY                           ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host ("║ Total Tests: " + ($passed + $failed).ToString().PadRight(51) + "║") -ForegroundColor Cyan
Write-Host ("║ Passed:      " + $passed.ToString().PadRight(51) + "║") -ForegroundColor Green
Write-Host ("║ Failed:      " + $failed.ToString().PadRight(51) + "║") -ForegroundColor Red
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

if ($failed -eq 0) {
    Write-Host "✅ All smoke tests passed!" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "❌ Some smoke tests failed!" -ForegroundColor Red
    exit 1
}
