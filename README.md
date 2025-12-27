# Secure Redirect System

A traffic classification and redirect system with intelligent bot detection using a two-stage validation process.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  • Dashboard for managing redirects                          │
│  • Visitor logs and analytics                                │
│  • Real-time monitoring                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express.js)                      │
│  • Traffic classification engine                             │
│  • Stage 1: User-Agent validation                           │
│  • Stage 2: IP2Location integration                          │
│  • Redirect handling                                         │
└─────────────────────────────────────────────────────────────┘
```

## 🔒 Redirect Decision Logic

### Stage 1 — Local Validation (No API Call)

Block immediately if:
- No User-Agent
- Unknown browser  
- Unknown device
- Headless or generic agent

**If failed → BOT**

### Stage 2 — IP2Location Rules

#### Usage Type
| BOT Types | VALID Types |
|-----------|-------------|
| RSV, SES, DCH, CDN | MOB, ISP, LIB, EDU, MIL, GOV, ORG, COM |

#### Ads Category
- `ads_category_name == "Data Centers"` → **BOT**

#### Proxy / Threat Rules
If ANY is true → **BOT**:
- `is_proxy`
- `proxy_type == DCH`
- `is_vpn`
- `is_data_center`
- `is_public_proxy`
- `is_web_proxy`
- `is_web_crawler`
- `is_scanner`

#### Special Override
- If `is_consumer_privacy_network == true`: Treat as **HUMAN** (overrides all proxy findings)

#### Fraud Score
- `fraud_score ≥ 3` + proxy signal → **BOT**
- `fraud_score ≥ 3` alone → **HUMAN** (low trust)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install
```

### Configuration

1. **Frontend**: Copy `env.local.example` to `.env.local`:
```bash
cp env.local.example .env.local
```

2. **Backend**: Copy `backend/env.example` to `backend/.env`:
```bash
cp backend/env.example backend/.env
```

3. Update the `.env` file with your IP2Location API key:
```env
IP2LOCATION_API_KEY=your_api_key_here
```

Get your API key from [IP2Location.io](https://www.ip2location.io/)

### Running the Application

**Development (both frontend and backend):**
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd backend && npm run dev
```

**Or run both together:**
```bash
npm run dev:all
```

The frontend will be available at `http://localhost:5173`
The backend API will be available at `http://localhost:3001`

## 📁 Project Structure

```
secure-redirect/
├── src/                          # Frontend React application
│   ├── api/                      # API client configuration
│   ├── components/               # React components
│   │   ├── configuration/        # System configuration components
│   │   ├── dashboard/            # Dashboard components
│   │   ├── redirects/            # Redirect management components
│   │   ├── ui/                   # UI component library
│   │   ├── user/                 # User-facing components
│   │   └── visitors/             # Visitor log components
│   ├── pages/                    # Page components
│   │   ├── AdminDashboard.jsx    # Admin dashboard
│   │   ├── RedirectHandler.jsx   # Client-side redirect handler
│   │   ├── Redirects.jsx         # Redirect management
│   │   └── VisitorLogs.jsx       # Visitor logs
│   └── utils/                    # Utility functions
│
├── backend/                      # Backend Express server
│   ├── lib/                      # Core libraries
│   │   ├── userAgentValidator.js # Stage 1 validation
│   │   ├── ip2locationValidator.js # Stage 2 validation
│   │   └── redirectDecisionEngine.js # Decision engine
│   ├── server.js                 # Main server file
│   └── package.json
│
├── package.json                  # Frontend dependencies
└── README.md
```

## 📡 API Endpoints

### Redirect Handler
- `GET /r/:publicId` - Main redirect handler

### REST API
- `GET /api/health` - Health check
- `GET /api/redirects` - List redirects
- `POST /api/redirects` - Create redirect
- `GET /api/redirects/:id` - Get redirect
- `PUT /api/redirects/:id` - Update redirect
- `DELETE /api/redirects/:id` - Delete redirect
- `POST /api/decision` - Get traffic classification
- `GET /api/visitors` - List visitor logs
- `GET /api/stats` - Get statistics

## 🧪 Testing Redirects

1. Create a redirect in the dashboard
2. Copy the redirect URL (e.g., `http://localhost:3001/r/your-public-id`)
3. Visit the URL in a browser to test human detection
4. Use curl to test bot detection:
```bash
curl -L "http://localhost:3001/r/your-public-id"
```

## 📄 License

MIT
