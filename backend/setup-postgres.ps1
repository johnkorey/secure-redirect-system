# PostgreSQL Setup Script using Docker

param(
    [switch]$Recreate
)

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  PostgreSQL Setup (Docker)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "[1/6] Checking Docker..." -ForegroundColor Yellow
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host "  ERROR: Docker not found!" -ForegroundColor Red
    exit 1
}
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Docker is not running!" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Docker is ready" -ForegroundColor Green

# Check existing container
Write-Host ""
Write-Host "[2/6] Checking PostgreSQL container..." -ForegroundColor Yellow
$exists = docker ps -a --filter "name=secure_redirect_postgres" --format "{{.Names}}"

if ($exists -and -not $Recreate) {
    Write-Host "  OK: Container already exists" -ForegroundColor Green
    $running = docker ps --filter "name=secure_redirect_postgres" --format "{{.Status}}"
    if (-not $running) {
        Write-Host "  Starting container..." -ForegroundColor Yellow
        docker start secure_redirect_postgres | Out-Null
        Start-Sleep -Seconds 3
    }
} else {
    if ($exists) {
        Write-Host "  Removing old container..." -ForegroundColor Yellow
        docker stop secure_redirect_postgres 2>&1 | Out-Null
        docker rm secure_redirect_postgres 2>&1 | Out-Null
    }
    
    Write-Host "  Creating new PostgreSQL container..." -ForegroundColor Yellow
    docker run -d --name secure_redirect_postgres -e POSTGRES_DB=secure_redirect -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Failed to create container" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: Container created" -ForegroundColor Green
    Start-Sleep -Seconds 5
}

# Create .env file
Write-Host ""
Write-Host "[3/6] Creating .env file..." -ForegroundColor Yellow
$envContent = @"
DB_HOST=localhost
DB_PORT=5432
DB_NAME=secure_redirect
DB_USER=postgres
DB_PASSWORD=postgres
PORT=3001
JWT_SECRET=$([System.Guid]::NewGuid().ToString())
"@
Set-Content -Path ".env" -Value $envContent -Force
Write-Host "  OK: .env file created" -ForegroundColor Green

# Wait for PostgreSQL
Write-Host ""
Write-Host "[4/6] Waiting for PostgreSQL..." -ForegroundColor Yellow
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    $result = docker exec secure_redirect_postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host "  ERROR: PostgreSQL not ready" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: PostgreSQL is ready" -ForegroundColor Green

# Run migration
Write-Host ""
Write-Host "[5/6] Running migration..." -ForegroundColor Yellow
node migrate-to-postgres.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: Migration failed" -ForegroundColor Red
    exit 1
}

# Success
Write-Host ""
Write-Host "[6/6] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  SUCCESS! PostgreSQL is ready" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database:" -ForegroundColor Yellow
Write-Host "  Host: localhost:5432" -ForegroundColor White
Write-Host "  Name: secure_redirect" -ForegroundColor White
Write-Host "  User: postgres / Pass: postgres" -ForegroundColor White
Write-Host ""
Write-Host "Start server:" -ForegroundColor Yellow
Write-Host "  node server.js" -ForegroundColor White
Write-Host ""
Write-Host "Login:" -ForegroundColor Yellow
Write-Host "  admin@example.com / admin123" -ForegroundColor White
Write-Host ""
