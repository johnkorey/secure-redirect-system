# Secure Redirect Backend Server

A Node.js/Express backend server for intelligent traffic classification and redirect handling. The system uses a two-stage validation process to distinguish between human visitors and bots.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env and add your IP2Location API key
# Get one from: https://www.ip2location.io/

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

## Configuration

Create a `.env` file with:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
IP2LOCATION_API_KEY=your_api_key_here
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/r/:publicId` | GET | Main redirect handler |
| `/api/health` | GET | Health check |
| `/api/redirects` | GET | List all redirects |
| `/api/redirects` | POST | Create a new redirect |
| `/api/redirects/:publicId` | GET | Get a specific redirect |
| `/api/redirects/:publicId` | PUT | Update a redirect |
| `/api/redirects/:publicId` | DELETE | Delete a redirect |
| `/api/decision` | POST | Traffic classification check |
| `/api/visitors` | GET | Get visitor logs |
| `/api/visitors` | POST | Log a visitor manually |
| `/api/stats` | GET | Get statistics |

---

## Redirect Decision Logic

### Stage 1 — Local Validation (No API Call)

Block immediately if:
- No User-Agent
- Unknown browser
- Unknown device
- Headless or generic agent

**If failed → BOT**

### Stage 2 — IP2Location Rules

#### Usage Type
| Classification | Codes |
|----------------|-------|
| BOT | RSV, SES, DCH, CDN |
| VALID | MOB, ISP, LIB, EDU, MIL, GOV, ORG, COM |

If usage_type is BOT → **BOT**

#### Ads Category
`ads_category_name == "Data Centers"` → **BOT**

#### Proxy / Threat Rules
If **ANY** is true → **BOT**:
- `is_proxy`
- `proxy_type == DCH`
- `is_vpn`
- `is_data_center`
- `is_public_proxy`
- `is_web_proxy`
- `is_web_crawler`
- `is_scanner`

#### Special Override
If `is_consumer_privacy_network == true`:
- Treat as **HUMAN**
- Override all other proxy findings

#### Fraud Score
- `fraud_score ≥ 3` + proxy signal → **BOT**
- `fraud_score ≥ 3` alone → **HUMAN** (low trust)

---

## Decision Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCOMING REQUEST                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 STAGE 1: LOCAL VALIDATION                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Check User-Agent:                                        │    │
│  │ • No User-Agent?                    → BOT                │    │
│  │ • Headless browser signature?       → BOT                │    │
│  │ • Generic bot/crawler signature?    → BOT                │    │
│  │ • Unknown browser?                  → BOT                │    │
│  │ • Unknown device type?              → BOT                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
            Stage 1 FAIL            Stage 1 PASS
                  │                       │
                  ▼                       ▼
           ┌──────────┐    ┌─────────────────────────────────────┐
           │   BOT    │    │       STAGE 2: IP2LOCATION          │
           │ REDIRECT │    │  ┌─────────────────────────────┐    │
           └──────────┘    │  │ 1. Consumer Privacy Network │    │
                           │  │    override → HUMAN (high)  │    │
                           │  ├─────────────────────────────┤    │
                           │  │ 2. Bot Usage Type?          │    │
                           │  │    (RSV/SES/DCH/CDN) → BOT  │    │
                           │  ├─────────────────────────────┤    │
                           │  │ 3. Data Center Category?    │    │
                           │  │    → BOT                    │    │
                           │  ├─────────────────────────────┤    │
                           │  │ 4. Fraud Score ≥ 3 +        │    │
                           │  │    Proxy Signal? → BOT      │    │
                           │  ├─────────────────────────────┤    │
                           │  │ 5. Fraud Score ≥ 3 alone?   │    │
                           │  │    → HUMAN (low trust)      │    │
                           │  ├─────────────────────────────┤    │
                           │  │ 6. Any Proxy Signal?        │    │
                           │  │    → BOT                    │    │
                           │  └─────────────────────────────┘    │
                           └─────────────────────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │                       │
                         Stage 2 FAIL            Stage 2 PASS
                              │                       │
                              ▼                       ▼
                       ┌──────────┐           ┌─────────────┐
                       │   BOT    │           │    HUMAN    │
                       │ REDIRECT │           │  REDIRECT   │
                       └──────────┘           └─────────────┘
```

## Trust Levels

| Level | Description |
|-------|-------------|
| `high` | All checks passed, legitimate traffic |
| `low` | Passed but with concerns (e.g., high fraud score without proxy signals, IP lookup failed) |
| `none` | Failed validation, classified as BOT |

## Example Usage

### Create a redirect

```bash
curl -X POST http://localhost:3001/api/redirects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Campaign",
    "human_url": "https://mysite.com/landing",
    "bot_url": "https://google.com",
    "is_enabled": true
  }'
```

### Test the redirect

```bash
# As a regular browser (will go to human_url)
curl -L "http://localhost:3001/r/your-public-id" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"

# As a bot (will go to bot_url)
curl -L "http://localhost:3001/r/your-public-id" \
  -H "User-Agent: Googlebot/2.1"
```

### Check traffic classification

```bash
curl -X POST http://localhost:3001/api/decision \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
```

## License

MIT
