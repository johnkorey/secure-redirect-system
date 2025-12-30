# Secure Redirect System

A traffic classification and smart redirect system with intelligent bot detection.

## Features

- 🔒 Two-stage traffic validation (User-Agent + IP2Location)
- 🤖 Bot detection and filtering
- 📊 Real-time visitor analytics
- 🔗 Smart redirect management
- 👥 Multi-user support with admin panel

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Installation

```bash
# Install dependencies
npm install
cd backend && npm install

# Configure environment
cp backend/env.example backend/.env
# Edit .env with your database credentials

# Start development
npm run dev          # Frontend (port 5173)
cd backend && npm start  # Backend (port 3001)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/r/:id` | Redirect handler |
| POST | `/api/auth/login` | User login |
| GET | `/api/redirects` | List redirects |
| POST | `/api/redirects` | Create redirect |

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@host:port/db
DB_SSL=false
JWT_SECRET=your-secret-key
```

## License

MIT
