# Code Classifier – Full Build Guide

This document explains how to build a full Code Classifier system similar to the app in this repository.

- Full‑stack TypeScript monorepo.
- Backend: Node.js + Express + Drizzle ORM + PostgreSQL.
- Frontend: React + Vite + React Query + Tailwind + Radix UI.
- Features:
  - Visitor classification (Human/Bot) with IP, ISP, usage type, user agent, and behavior.
  - User dashboard and admin panel.
  - Hosted redirect links (`/r/:slug`) for human vs bot routing.
  - Crypto subscription payments.
  - Email (Mailgun) and Telegram notifications.

---

## 1. Prerequisites

Before writing code, prepare:

- Node.js 20+ and npm or pnpm.
- A PostgreSQL database (local or managed).
- Accounts/keys for:
  - IP intelligence provider (for IP → geo/ISP/usage type).
  - Mailgun (or similar transactional email).
  - Telegram bot (via BotFather).
  - Crypto wallets for supported coins (BTC, ETH, USDT, etc.).

Environment variables (examples):

- Core:
  - `DATABASE_URL`
  - `NODE_ENV`
- Rate limiting:
  - `GLOBAL_RATE_LIMIT_WINDOW_MS`
  - `GLOBAL_RATE_LIMIT_PER_MINUTE`
- IP intelligence:
  - `IP2LOCATION_API_KEY` (or similar)
- Mail:
  - `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`
- Telegram:
  - `TELEGRAM_BOT_TOKEN`
- Crypto wallets:
  - Addresses for each supported coin.

---

## 2. Project Structure

Create a monorepo-style structure:

```text
code-classifier/
  package.json
  tsconfig.json
  drizzle.config.ts
  vercel.json            (optional, for Vercel deployment)

  server/                Express backend
  client/                React + Vite frontend
  shared/                Shared DB schema and types
  migrations/            Drizzle migrations
  data/                  Optional JSON storage (e.g. memstorage.json)
```

Initialize the Node project:

```bash
mkdir code-classifier
cd code-classifier
npm init -y
```

---

## 3. Dependencies and Tooling

Install dev tooling:

```bash
npm install --save-dev \
  typescript tsx \
  vite @vitejs/plugin-react \
  tailwindcss postcss autoprefixer \
  drizzle-kit \
  @types/node @types/express @types/ws \
  @types/react @types/react-dom
```

Install runtime dependencies (high‑level list):

```bash
npm install \
  express express-session ws serverless-http \
  drizzle-orm pg zod drizzle-zod dotenv \
  node-cron node-telegram-bot-api \
  multer ipaddr.js memoizee lru-cache \
  react react-dom @tanstack/react-query wouter \
  @radix-ui/react-accordion \
  @radix-ui/react-alert-dialog \
  @radix-ui/react-aspect-ratio \
  @radix-ui/react-avatar \
  @radix-ui/react-checkbox \
  @radix-ui/react-collapsible \
  @radix-ui/react-context-menu \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-hover-card \
  @radix-ui/react-label \
  @radix-ui/react-menubar \
  @radix-ui/react-navigation-menu \
  @radix-ui/react-popover \
  @radix-ui/react-progress \
  @radix-ui/react-radio-group \
  @radix-ui/react-scroll-area \
  @radix-ui/react-select \
  @radix-ui/react-separator \
  @radix-ui/react-slider \
  @radix-ui/react-slot \
  @radix-ui/react-switch \
  @radix-ui/react-toast \
  @radix-ui/react-toggle \
  @radix-ui/react-toggle-group \
  @radix-ui/react-tooltip \
  lucide-react clsx class-variance-authority \
  tailwindcss-animate
```

Adjust the exact list to your needs; the existing `package.json` in this repo is the reference.

---

## 4. TypeScript Configuration

Use a `tsconfig.json` similar to:

```json
{
  "include": ["client/src/**/*", "shared/**/*", "server/**/*"],
  "exclude": ["node_modules", "build", "dist", "**/*.test.ts"],
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["esnext", "dom", "dom.iterable"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "types": ["node", "vite/client"],
    "paths": {
      "@/*": ["./client/src/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
```

---

## 5. Shared Schema and Database (Drizzle + Postgres)

### 5.1 Drizzle Config

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

### 5.2 Shared Schema

Create `shared/schema.ts` with Drizzle tables and Zod schemas. At a minimum:

- `api_users`
  - `id`, `username`, `email`, `apiKey`
  - `accessType` (daily, weekly, monthly, unlimited variants)
  - `subscriptionStart`, `subscriptionExpiry`
  - `dailyLimit`
  - `isActive`, `isPaused`
  - `telegramChatId`, `chatDisplayName`
  - `botUrl`, `humanUrl`
  - `referralCode`, `referralCredits`
- `visitor_classifications`
  - `id`, `userId`, `ip`, `location`, `browser`, `deviceType`
  - `visitorType` (Human/Bot)
  - `detectionMethod`, `userAgent`
  - `requestUrl`, `referrer`, `originHost`
  - `countryCode`, `countryName`, `region`, `city`
  - `isp`, `usageType`
  - `responseTime`, `dataSource`, `timestamp`
- Config tables:
  - `blocked_ip_ranges`, `blocked_isps`, `bot_signatures`, `mailgun_domains`, `hosted_links`
- Payments / usage:
  - `payments`, `api_usage`, `referrals`, etc.

Also export Zod insert schemas used by the backend, such as:

- `insertVisitorClassificationSchema`
- `insertBlockedIpRangeSchema`
- `insertBlockedIspSchema`
- `insertBotSignatureSchema`
- `insertApiSettingsSchema`
- `insertApiUserSchema`
- `insertApiUsageSchema`
- `insertHostedLinkSchema`

### 5.3 Migrations

Generate and push migrations:

```bash
npx drizzle-kit generate
npm run db:push
```

Implement `server/db.ts` to create a Drizzle client using `pg` and `DATABASE_URL`.

---

## 6. Storage Layer Abstraction

Create `server/storage-interface.ts` with an interface that represents all data operations:

- User management:
  - `createApiUser`, `getApiUserById`, `getApiUserByApiKey`, `updateApiUser`, `getAllApiUsers`
- Classification and metrics:
  - `createVisitorClassification`
  - `getRecentClassificationsByUser`
  - `getMetrics`, `getTrends`
  - `getTopLocations`, `getTopISPs`
  - `getDeviceStats`, `getBrowserStats`
- Configuration:
  - CRUD for IP ranges, ISPs, bot signatures, hosted links, Mailgun domains, API settings
- Payments and usage:
  - `createPayment`, `updatePayment`, `getPaymentBySession`
  - `logApiUsage`, `getUsageByUser`

Implement `server/storage-fixed.ts` using Drizzle queries and export a singleton:

```ts
import { storage } from "./storage-fixed";
```

Optionally, add `server/storage-mem.ts` for an in‑memory implementation.

---

## 7. Backend Core (Express App)

Create `server/index.ts`:

1. Load environment and create app:

   - `import "dotenv/config";`
   - `import express from "express";`
   - `const app = express();`

2. Middlewares:

   - Logging for certain paths (e.g. `/r/`).
   - `express.json()` and `express.urlencoded({ extended: false })`.
   - Security headers and CSP:
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `X-XSS-Protection: 1; mode=block`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Content-Security-Policy` with strict `script-src`, `style-src`, `connect-src`, etc.
   - Global rate limiting:
     - In‑memory map keyed by IP.
     - Configurable `windowMs` and `maxRequests` via environment variables.

3. Health check:

   - `GET /api/health` → `{ status: "ok" }`

4. Session setup:

   - Use `express-session` + `connect-pg-simple` in `server/routes.ts` so sessions go into Postgres.

5. Route registration:

   - Implement `registerRoutes(app, chatRoutes)` in `server/routes.ts` for:
     - Auth (`/api/user/*`, `/api/admin/*`)
     - Classification (`/api/classify`)
     - Metrics and analytics (`/api/user/metrics`, etc.)
     - Hosted links (`/api/user/hosted-links`, `/r/:slug`)
     - Configuration and admin operations.

6. Background jobs:

   - Initialize Telegram bot.
   - Start ephemeral chat cleanup via `startEphemeralCleanup()`.

In development, use a Vite helper (`server/vite.ts`) to run the React app via dev middleware; in production, serve static files from `dist/public`.

---

## 8. Authentication and Sessions

### 8.1 Sessions

Use `express-session` and `connect-pg-simple`:

- Configure session store to use the same Postgres database.
- Set cookie name, secret, and reasonable expiry.

### 8.2 User Login and 2FA

Implement endpoints:

- `POST /api/user/login`
  - Input: `username`, `apiKey`.
  - Validate user and decide if 2FA is required.
  - If 2FA required:
    - Generate 6‑digit code.
    - Send via Telegram bot to `telegramChatId`.
    - Return `{ requires2FA: true }`.
  - If 2FA not required:
    - Store user ID in session and return success.

- `POST /api/user/verify-2fa`
  - Input: `code` or `{ sessionId, verificationCode }` depending on flow.
  - Validate against stored code and/or session.
  - Store user ID in session on success.

- `POST /api/user/logout`
  - Destroy session.

- `GET /api/user/auth`
  - Return current user profile (email, apiKey, subscription, Telegram ID, etc.) based on session.

Admin auth can be separate (`/api/admin/login`) or based on a role column on the user.

---

## 9. Classification Engine and Metrics

### 9.1 IP Intelligence Service

Implement `server/ip2location-service.ts`:

- Expose `lookupIp(ip: string)` that:
  - Calls an external IP intelligence API.
  - Returns geo and ISP information: `countryCode`, `countryName`, `region`, `city`, `isp`, `usageType`.
  - Uses caching (LRU or memoization) to avoid repeated external calls.

### 9.2 Classification Endpoint

In `server/routes.ts`, implement `/api/classify`:

1. Determine client IP:
   - Use `x-forwarded-for` if behind a proxy, else `req.socket.remoteAddress`.

2. Fetch IP intelligence:
   - Call `ip2locationService.lookupIp(ip)`.

3. Analyze user-agent:
   - Compare with stored bot signatures (`bot_signatures`).
   - Look for patterns like `curl`, `node`, headless browsers, scrapers.

4. Check blocking configuration:
   - IP ranges in `blocked_ip_ranges` using `ipaddr.js` for CIDR checks.
   - Blocked ISPs or disallowed `usageType` (e.g. data centers).

5. Rate-limiting heuristics:
   - Track per‑IP and per‑user request counts in a map.
   - Flag suspicious behavior as bots.

6. Decide classification:
   - `visitorType` = `Human` or `Bot`.
   - `detectionMethod` = descriptive label:
     - `"Data Center Detection"`, `"Usage Type: ISP"`, `"Bot Pattern: curl"`, `"No Bot Indicators Detected"`, etc.

7. Persist classification:
   - Validate with `insertVisitorClassificationSchema`.
   - Store via `storage.createVisitorClassification`.

8. Respond to client:
   - Return JSON matching `ClassificationResult` used in the frontend.

### 9.3 Metrics Endpoints

For each user:

- `GET /api/user/metrics?hours=...`
  - Returns summary: total visitors, humans, bots, accuracy, changes.
- `GET /api/user/trends`
  - Time‑series of human vs bot counts.
- `GET /api/user/recent-activity?hours=&visitorType=&limit=`
  - Returns a list of recent classifications.
- `GET /api/user/top-locations?limit=`
  - Top countries/cities.
- `GET /api/user/device-stats`
  - Devices breakdown (desktop/mobile/tablet).
- `GET /api/user/browser-stats`
  - Browser breakdown.
- `GET /api/user/top-isps?limit=`
  - ISPs with most traffic.

Use storage aggregation methods to implement each.

---

## 10. Hosted Links and Redirects

### 10.1 Hosted Links API

Under `/api/user/hosted-links`:

- `GET /api/user/hosted-links`
  - List all links for the current user.
- `POST /api/user/hosted-links`
  - Create a new link with provided `humanUrl`, `botUrl`, optional domain reference.
- `DELETE /api/user/hosted-links/:id`
  - Delete a link.

Also:

- `GET /api/user/redirect-config`
- `POST /api/user/redirect-config`
  - Manage default `humanUrl` and `botUrl` for that user.

### 10.2 Public Redirect Route

Implement `GET /r/:slug`:

- Look up `hosted_links` by slug.
- Run the classification pipeline (similar to `/api/classify`).
- Increment `clickCount`.
- Redirect:
  - Humans → `humanUrl`
  - Bots → `botUrl`

---

## 11. Crypto Payments and Subscription Flow

### 11.1 Crypto Wallets

Implement:

- `GET /api/crypto-wallets`
  - Returns coin symbol → wallet address map, e.g. `BTC`, `USDT_TRC20`, `USDT_ERC20`, `LTC`, `ETH`, `TRX`.

### 11.2 Signup and Verification

1. Signup:

   - `POST /api/user/signup`
     - Input: `username`, `email`, `referralCode?`, `telegramChatId?`, `accessType`, `disclaimerAccepted`.
     - Create a signup session row in DB.
     - Send Telegram 2FA code.
     - Return:
       - `sessionId`
       - `requiresVerification: true`

2. Verify 2FA:

   - `POST /api/user/verify-2fa` (signup context)
     - Input: `sessionId`, `verificationCode`.
     - Validate code and mark session verified.
     - Frontend redirects to `/user/payment?session=...`.

### 11.3 Payment and Account Creation

- `GET /api/user/pending-signup/:sessionId`
  - Returns signup details, pricing, and any instructions for payment.

- `POST /api/user/complete-signup`
  - Input: `sessionId`, `transactionHash`, `cryptoType`.
  - Use `server/crypto-verification.ts` to:
    - Verify the transaction to the correct wallet and amount.
  - On success:
    - Create user via a shared function that:
      - Generates API key.
      - Computes subscription expiry and daily limits based on `accessType`.
      - Generates `chatDisplayName` (city‑name alias) and referral code.
    - Return:
      - `apiKey`
      - `referralCode`
      - `overpaymentCredit?`

For renewals, implement equivalent endpoints:

- `GET /api/user/renewal-session/:sessionId`
- `POST /api/user/complete-renewal`

Support partial payments by returning 402 with fields:

- `isPartial`
- `amountExpected`, `amountReceived`, `shortfall`
- `cryptoType`

---

## 12. User Dashboard API

Implement endpoints under `/api/user/*` for logged‑in users:

- Profile:
  - `GET /api/user/auth`
  - `PUT /api/user/profile` (update email, `telegramChatId`)
- Subscription:
  - `POST /api/user/pause-subscription`
  - `POST /api/user/resume-subscription`
  - `POST /api/user/reset-device`
  - `POST /api/user/regenerate-api-key`
- Redirects:
  - `GET /api/user/redirect-config`
  - `POST /api/user/redirect-config`
- Hosted links:
  - `GET /api/user/hosted-links`
  - `POST /api/user/hosted-links`
  - `DELETE /api/user/hosted-links/:id`
- Announcements:
  - `GET /api/user/announcements`
  - `POST /api/user/announcements/:id/dismiss`
- Email sending:
  - `POST /api/user/send-email`
    - Input: link ID, recipient email, optional domain or custom URL.
    - Uses Mailgun and enforces per‑day quota.
- Metrics and analytics:
  - Endpoints described in the Classification section (`/api/user/metrics`, `/api/user/trends`, etc.).

These endpoints power `client/src/pages/user-dashboard.tsx`, `user-login.tsx`, `user-signup.tsx`, and `user-payment.tsx`.

---

## 13. Admin API

Implement admin‑only endpoints for management and configuration:

- Auth:
  - `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/auth`
- Configuration management:
  - CRUD for:
    - IP ranges (`blocked_ip_ranges`)
    - ISPs (`blocked_isps`)
    - Bot signatures (`bot_signatures`)
    - Mailgun domains and API settings
    - Crypto wallets and pricing
    - Global API settings (default access types, quotas)
- User management:
  - List users, view details.
  - Create new users manually.
  - Update subscription status, pause/resume, access types, limits.
  - View usage and payment history.
- Announcements:
  - CRUD for announcements.
- System status:
  - Health of services (DB, IP provider, Mailgun, Telegram, crypto verifiers).

These endpoints power the admin pages in `client/src/pages` and the configuration components in `client/src/components/configuration`.

---

## 14. Integrations

### 14.1 Mailgun

Create `server/mailgun-service.ts`:

- Wrap calls to Mailgun API using your domain and API key.
- Provide helpers:
  - `sendWelcomeEmail(user, apiKey)`
  - `sendHostedLinkEmail(user, link, recipient)`
  - `sendAlertEmail(user, subject, message)`

Use these in signup, payment completion, and alert flows.

### 14.2 Telegram Bot

Create `server/telegram-bot.ts`:

- Initialize bot using `node-telegram-bot-api` with `TELEGRAM_BOT_TOKEN`.
- Provide functions:
  - `initializeTelegramBot()`
  - `stopTelegramBot()`
  - `sendTelegramMessage(chatId, text)`
- Use for:
  - Signup and login 2FA codes.
  - Alerts for suspicious traffic or payment events (via a notifications module).

### 14.3 Crypto Verification

Create:

- `server/crypto-pricing.ts`:
  - Fetch and cache current prices from blockchain APIs (Etherscan, TronGrid, etc.).
  - Convert subscription USD prices to crypto amounts.

- `server/crypto-verification.ts`:
  - Verify transaction hash, amount, and destination address.
  - Return structured results for `complete-signup` and `complete-renewal`.

### 14.4 IP Intelligence

Already described in `ip2location-service.ts`. Ensure:

- Robust error handling and timeouts.
- Local caching to reduce latency and API cost.

---

## 15. Frontend: Vite + React Setup

### 15.1 Initialize Vite React App

In `client/`:

```bash
cd client
npm create vite@latest . -- --template react-ts
```

Configure Tailwind:

```bash
npx tailwindcss init -p
```

Update Tailwind `content` to:

```js
content: [
  "./index.html",
  "./src/**/*.{ts,tsx}",
],
```

### 15.2 Entry and Routing

In `client/src/main.tsx`:

- Create React root.
- Wrap the app in `QueryClientProvider` from React Query.
- Use `wouter` for routing.

In `client/src/App.tsx`:

- Define routes:
  - Public:
    - `/` (landing)
    - `/user/login`
    - `/user/signup`
    - `/user/payment`
  - User:
    - `/user/dashboard`
  - Admin:
    - `/dashboard`
    - `/configuration`
    - `/realtime-monitor`
    - `/usage-analytics`
    - `/user-management`
    - `/forum-management`
    - `/announcements`
    - `/api-status`

### 15.3 Shared Utilities and Hooks

Implement:

- `client/src/lib/queryClient.ts`
  - Create `QueryClient`.
  - Provide `apiRequest(url, method, body)` helper for JSON requests.
- `client/src/hooks/useAuth.ts`
  - Fetch `/api/user/auth`, manage auth state, handle redirects.
- `client/src/hooks/use-toast.ts`
  - Toast notification logic used throughout the UI.

### 15.4 UI Components

Create UI primitives under `client/src/components/ui/`:

- Buttons, cards, inputs, alerts, dialogs, tabs, selects, tables, etc.
- Use Radix UI components as low‑level primitives and Tailwind for styling.

Create layout components:

- `client/src/components/layout/sidebar.tsx`
- `client/src/components/layout/topbar.tsx`

Use these across user and admin dashboards.

---

## 16. User Dashboard UI

Implement `client/src/pages/user-dashboard.tsx` with:

- Overview tab:
  - Summary metrics (requests, humans, bots, accuracy).
  - Trend charts using `recharts`.
  - Recent activity list with filters:
    - Time range (24h / 7d)
    - Visitor type (all / bot / human)
- Links tab:
  - Default `humanUrl` and `botUrl` configuration.
  - Hosted links list:
    - Generated URL per link (stable subdomain pattern).
    - Click count.
    - Copy, delete.
  - Email sending dialog:
    - Choose link.
    - Pre‑fill recipient email from profile.
    - Select Mailgun domain, send email, show remaining quota.
- Analytics tab:
  - Top locations, devices, browsers, ISPs.
- Profile tab:
  - Edit email and `telegramChatId`.
  - Show alert if Telegram not configured.
  - Regenerate API key flow:
    - Confirmation dialog.
    - Display new key once with copy support.
- Subscription tab:
  - Pause / resume subscription buttons.
  - Device reset button.
- Community tab:
  - Embed `ForumChat` component.
  - Optionally embed `EphemeralChat`.

Use React Query for data fetching and mutations, and show clear success/error toasts.

---

## 17. Admin Panel UI

Key pages under `client/src/pages`:

- `dashboard.tsx`
  - Global metrics and system health.
- `configuration.tsx`
  - Uses components from `client/src/components/configuration/`:
    - `allowed-domains-config.tsx`
    - `ip-ranges-config.tsx`
    - `isp-config.tsx`
    - `user-agent-config.tsx`
    - `crypto-wallets-config.tsx`
    - `mailgun-config.tsx`
    - `telegram-config.tsx`
    - `api-settings.tsx`
  - Each component:
    - Fetches current config.
    - Provides forms and tables to edit/add/remove entries.
- `realtime-monitor.tsx`
  - Live stream of classifications from `/api/admin/realtime` or user‑scoped feed.
- `usage-analytics.tsx`
  - Advanced charts for usage across all users.
- `user-management.tsx`
  - Table of users with edit actions.
- `forum-management.tsx`
  - Moderation tools for chat/forum.
- `announcements.tsx`
  - Create, edit, delete announcements.
- `api-status.tsx`
  - Display health of DB, IP API, Mailgun, Telegram, crypto verifiers.

---

## 18. Forum and Ephemeral Chat

### 18.1 Backend

- `server/chat-routes.ts`:
  - Attach WebSocket server to the HTTP server.
  - Handle:
    - User connection based on session (`chatDisplayName`).
    - Broadcast messages and presence.
- `server/ephemeral-cleanup.ts`:
  - Background job (via `node-cron` or setInterval) that deletes old ephemeral messages.

### 18.2 Frontend

- `client/src/components/forum/forum-chat.tsx`:
  - WebSocket client for chat.
  - Message list, input, user list.
- `client/src/components/ephemeral-chat.tsx`:
  - UI focused on time‑limited chat sessions.

---

## 19. Security and Hardening

Implement and verify:

- Security headers and CSP:
  - X‑Frame‑Options, X‑Content-Type-Options, X‑XSS-Protection, Referrer-Policy, Content-Security-Policy.
- Global rate limiting:
  - IP‑based, with environment‑controlled window and limit.
- Per‑user/API key quotas:
  - Daily limits, subscription enforcement.
- Input validation:
  - Use Zod schemas for all external inputs (body, query params).
- Logging:
  - Log classification requests and errors with truncated payloads.
- Secrets management:
  - Do not commit secrets.
  - Use environment variables or secret managers.

---

## 20. Running and Deploying

### 20.1 NPM Scripts

In `package.json`, define:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development npx tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "check": "tsc",
    "db:push": "drizzle-kit push"
  }
}
```

### 20.2 Local Development

```bash
npm run dev
```

- Express backend runs in development mode.
- Vite dev server serves the React app (integrated via `server/vite.ts` or separately).

### 20.3 Production Build

```bash
npm run build
npm start
```

- `vite build` outputs static assets to `dist/public`.
- `esbuild` bundles the server into `dist/index.js`.

Serve:

- `dist/index.js` with Node.
- `dist/public` as static assets (via Express or CDN).

### 20.4 Vercel Deployment (Optional)

Use a `vercel.json` similar to:

```json
{
  "builds": [
    { "src": "api/index.ts", "use": "@vercel/node" },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist/public", "buildCommand": "npm run build" }
    }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.ts" },
    { "src": "/(.*)", "dest": "/dist/public/index.html" }
  ]
}
```

Adapt this by wrapping the Express app with `serverless-http` and exporting a handler.

---

## 21. Suggested Implementation Phases

To build this system incrementally:

1. Skeleton
   - Create repo structure, `package.json`, `tsconfig.json`, `drizzle.config.ts`.
   - Implement minimal Express server with `/api/health`.
   - Create Vite + React client with a simple landing page.
2. Database and Storage
   - Implement `shared/schema.ts` and run migrations.
   - Implement `server/db.ts` and `server/storage-fixed.ts`.
3. Classification MVP
   - Implement `ip2location-service.ts`, `/api/classify`, and basic `visitor_classifications`.
   - Implement user dashboard showing recent activity and simple metrics.
4. Auth and User Dashboard
   - Implement session login, 2FA, and `/api/user/*` endpoints.
   - Flesh out `user-dashboard.tsx`, `user-login.tsx`, `user-signup.tsx`, `user-payment.tsx`.
5. Admin Panel and Config
   - Implement admin endpoints and UI for configuration, user management, announcements.
6. Crypto, Notifications, and Chat
   - Add crypto payment flows, Mailgun emails, Telegram alerts.
   - Add forum and ephemeral chat.
7. Hardening and Deployment
   - Add full security headers, stricter CSP, improved logging.
   - Set up CI/CD and deployment to your target platform.

Following these steps will let you rebuild a system equivalent in functionality to the Code Classifier app in this repository.

