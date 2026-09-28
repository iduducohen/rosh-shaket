#!/usr/bin/env pwsh
<#
.SYNOPSIS
Run tests for RoshShaket project (client and server)

.DESCRIPTION
This script provides easy commands to run all test suites for the RoshShaket application.

.PARAMETER All
Run all tests (client, server, and e2e)

.PARAMETER Client
Run client unit tests with Karma/Jasmine

.PARAMETER ClientWatch
Run client tests in watch mode

.PARAMETER Server
Run server unit tests with xUnit

.PARAMETER E2E
Run end-to-end tests with Cypress

.PARAMETER E2EOpen
Open Cypress UI for interactive testing

.EXAMPLE
./run-tests.ps1 -All
./run-tests.ps1 -Client
./run-tests.ps1 -Server
./run-tests.ps1 -E2E
#>

param(
    [switch]$All,
    [switch]$Client,
    [switch]$ClientWatch,
    [switch]$Server,
    [switch]$E2E,
    [switch]$E2EOpen,
    [switch]$Help
)

function Show-Help {
    Write-Host @"
RoshShaket Test Runner

Usage: ./run-tests.ps1 [OPTIONS]

Options:
  -All          Run all tests (client, server, e2e)
  -Client       Run client unit tests
  -ClientWatch  Run client tests in watch mode
  -Server       Run server unit tests
  -E2E          Run end-to-end tests
  -E2EOpen      Open Cypress UI
  -Help         Show this help message

Examples:
  ./run-tests.ps1 -All
  ./run-tests.ps1 -Client
  ./run-tests.ps1 -Server
  ./run-tests.ps1 -E2E
"@
}

function Run-ClientTests {
    Write-Host "🧪 Running client unit tests..." -ForegroundColor Cyan
    Push-Location client
    npm run test
    Pop-Location
}

function Run-ClientTestsWatch {
    Write-Host "👀 Running client tests in watch mode..." -ForegroundColor Cyan
    Push-Location client
    npm run test:watch
    Pop-Location
}

function Run-ServerTests {
    Write-Host "🧪 Running server unit tests..." -ForegroundColor Cyan
    Push-Location server
    dotnet test
    Pop-Location
}

function Run-E2ETests {
    Write-Host "🌐 Running end-to-end tests..." -ForegroundColor Cyan

    # Check if services are running
    $apiRunning = Test-NetConnection -ComputerName localhost -Port 5080 -ErrorAction SilentlyContinue
    if (-not $apiRunning.TcpTestSucceeded) {
        Write-Host "⚠️  API is not running. Starting services..." -ForegroundColor Yellow
        docker-compose up -d
        Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
    }

    Push-Location client
    npm run e2e
    Pop-Location
}

function Run-E2ETestsOpen {
    Write-Host "🌐 Opening Cypress UI..." -ForegroundColor Cyan

    # Check if services are running
    $apiRunning = Test-NetConnection -ComputerName localhost -Port 5080 -ErrorAction SilentlyContinue
    if (-not $apiRunning.TcpTestSucceeded) {
        Write-Host "⚠️  API is not running. Starting services..." -ForegroundColor Yellow
        docker-compose up -d
        Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
    }

    Push-Location client
    npm run e2e:open
    Pop-Location
}

# Main logic
if ($Help -or (-not $All -and -not $Client -and -not $ClientWatch -and -not $Server -and -not $E2E -and -not $E2EOpen)) {
    Show-Help
    exit 0
}

$startTime = Get-Date

try {
    if ($All) {
        Run-ServerTests
        if ($LASTEXITCODE -ne 0) { throw "Server tests failed" }

        Run-ClientTests
        if ($LASTEXITCODE -ne 0) { throw "Client tests failed" }

        Run-E2ETests
        if ($LASTEXITCODE -ne 0) { throw "E2E tests failed" }

        Write-Host "✅ All tests passed!" -ForegroundColor Green
    }
    else {
        if ($Client) { Run-ClientTests }
        if ($ClientWatch) { Run-ClientTestsWatch }
        if ($Server) { Run-ServerTests }
        if ($E2E) { Run-E2ETests }
        if ($E2EOpen) { Run-E2ETestsOpen }
    }
}
catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
}

$duration = (Get-Date) - $startTime
Write-Host "⏱️  Duration: $($duration.TotalSeconds)s" -ForegroundColor Gray
