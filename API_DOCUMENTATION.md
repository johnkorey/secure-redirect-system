# API Documentation - Secure Redirect System

## Base URL
```
https://your-domain.com/api
```

## Authentication

### JWT Token Authentication
All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Login Endpoints

#### 1. User Login
```http
POST /api/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response:
{
  "token": "jwt_token_string",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "user",
    "daily_limit": 2,
    "subscription": "free",
    "created_at": "ISO8601"
  }
}
```

#### 2. Admin Login
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response:
{
  "token": "jwt_token_string",
  "user": {
    "id": "string",
    "username": "string",
    "role": "admin",
    "created_at": "ISO8601"
  }
}
```

---

## Redirect Management

### 1. Create Redirect Link
```http
POST /api/user/redirects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",           // Required
  "humanUrl": "string",       // Required - Full URL with protocol
  "botUrl": "string",         // Required - Full URL with protocol
  "domain_id": "string",      // Optional - ID of redirect domain
  "domain_name": "string",    // Optional - Name of redirect domain
  "full_url": "string"        // Optional - Complete redirect URL
}

Response:
{
  "success": true,
  "redirect": {
    "id": "string",
    "publicId": "string",      // Use this for redirect: /r/{publicId}
    "name": "string",
    "humanUrl": "string",
    "botUrl": "string",
    "domain_id": "string",
    "domain_name": "string",
    "full_url": "string",
    "userId": "string",
    "created": "ISO8601",
    "stats": {
      "totalClicks": 0,
      "humanClicks": 0,
      "botClicks": 0
    }
  }
}

Notes:
- Users are limited to 2 redirects per day (across all domains)
- Only active redirect domains can be used
- Main domain cannot be used for redirects
```

### 2. Get User's Redirects
```http
GET /api/user/redirects
Authorization: Bearer <token>

Response:
[
  {
    "id": "string",
    "publicId": "string",
    "name": "string",
    "humanUrl": "string",
    "botUrl": "string",
    "domain_id": "string",
    "domain_name": "string",
    "full_url": "string",
    "userId": "string",
    "created": "ISO8601",
    "stats": {
      "totalClicks": 0,
      "humanClicks": 0,
      "botClicks": 0
    }
  }
]
```

### 3. Update Redirect URLs
```http
PUT /api/user/redirects/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "humanUrl": "string",      // Optional - New human destination
  "botUrl": "string"         // Optional - New bot destination
}

Response:
{
  "success": true,
  "redirect": { /* updated redirect object */ }
}
```

### 4. Delete Redirect
```http
DELETE /api/user/redirects/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Redirect deleted successfully"
}
```

### 5. Get Redirect Stats
```http
GET /api/user/redirects/:id/stats
Authorization: Bearer <token>

Response:
{
  "redirect": {
    "id": "string",
    "name": "string",
    "publicId": "string"
  },
  "stats": {
    "totalClicks": 100,
    "humanClicks": 60,
    "botClicks": 40,
    "uniqueVisitors": 45,
    "capturedEmails": 12
  },
  "recentVisitors": [
    {
      "id": "string",
      "redirectId": "string",
      "ip": "string",
      "userAgent": "string",
      "classification": "human",  // "human" or "bot"
      "timestamp": "ISO8601",
      "country": "string",
      "isp": "string"
    }
  ]
}
```

---

## Domain Management

### 1. Get Available Redirect Domains
```http
GET /api/user/domains
Authorization: Bearer <token>

Response:
[
  {
    "id": "string",
    "name": "string",           // e.g., "redirect1.com"
    "type": "redirect",         // "main" or "redirect"
    "is_main": false,
    "mailgun_domain_id": "string",
    "status": "active",         // "active" or "inactive"
    "created_at": "ISO8601"
  }
]

Notes:
- Only returns active redirect domains
- Main domain is excluded from this list
```

### 2. Send Test Email (Domain-Specific)
```http
POST /api/user/send-test-email
Authorization: Bearer <token>
Content-Type: application/json

{
  "domain_id": "string",     // Required - Domain to send from
  "email": "string"          // Required - Recipient email
}

Response:
{
  "success": true,
  "message": "Test email sent successfully to email@example.com"
}
```

---

## Visitor Analytics

### 1. Get Visitor Logs (with Time Range)
```http
GET /api/user/visitor-logs?timeRange=24h
Authorization: Bearer <token>

Query Parameters:
- timeRange: "24h" | "7d" | "30d" | "90d" | "all" (default: "all")

Response:
[
  {
    "id": "string",
    "redirectId": "string",
    "redirectName": "string",
    "ip": "string",
    "userAgent": "string",
    "classification": "human",
    "timestamp": "ISO8601",
    "country": "string",
    "city": "string",
    "isp": "string",
    "device": "desktop",
    "browser": "Chrome"
  }
]
```

### 2. Get User Dashboard Stats
```http
GET /api/user/stats?timeRange=7d
Authorization: Bearer <token>

Query Parameters:
- timeRange: "24h" | "7d" | "30d" | "90d" | "all" (default: "all")

Response:
{
  "totalRedirects": 10,
  "totalVisitors": 450,
  "humanVisitors": 280,
  "botVisitors": 170,
  "dailyLimit": 2,
  "redirectsCreatedToday": 1,
  "capturedEmails": 45,
  "topCountries": [
    { "country": "United States", "count": 120 },
    { "country": "United Kingdom", "count": 80 }
  ],
  "trafficTrend": [
    { "date": "2025-12-14", "humans": 25, "bots": 15 },
    { "date": "2025-12-13", "humans": 30, "bots": 20 }
  ]
}
```

---

## Captured Emails

### 1. Get Captured Emails (User)
```http
GET /api/user/captured-emails
Authorization: Bearer <token>

Response:
[
  {
    "id": "string",
    "email": "user@example.com",
    "redirectId": "string",
    "redirectName": "string",
    "source_url": "string",
    "captured_at": "ISO8601",
    "ip": "string",
    "userAgent": "string",
    "country": "string"
  }
]

Notes:
- Returns only emails captured from user's redirects
- Emails are case-insensitive unique
- Duplicates are not stored
```

---

## Community Chat

### 1. Get Chat Messages
```http
GET /api/forum/messages
Authorization: Bearer <token>

Response:
[
  {
    "id": "string",
    "userId": "string",
    "username": "string",
    "message": "string",
    "timestamp": "ISO8601",
    "isAdmin": false
  }
]
```

### 2. Send Chat Message
```http
POST /api/forum/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "string"        // Required - Max 2000 characters
}

Response:
{
  "success": true,
  "message": {
    "id": "string",
    "userId": "string",
    "username": "string",
    "message": "string",
    "timestamp": "ISO8601",
    "isAdmin": false
  }
}

Notes:
- Messages are broadcasted to all connected users
- Admin messages trigger Telegram notifications (if configured)
- Supports real-time WebSocket updates
```

---

## Admin Endpoints (Requires Admin Role)

### 1. Get All Users
```http
GET /api/admin/users
Authorization: Bearer <admin_token>

Response:
[
  {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "user",
    "subscription": "free",
    "daily_limit": 2,
    "created_at": "ISO8601",
    "redirectCount": 5,
    "totalVisitors": 150
  }
]
```

### 2. Delete User
```http
DELETE /api/admin/users/:id
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "message": "User deleted successfully"
}

Notes:
- Deletes user and all associated redirects
- Visitor logs are preserved for analytics
```

### 3. Get All Captured Emails (Admin)
```http
GET /api/admin/captured-emails?search=example.com
Authorization: Bearer <admin_token>

Query Parameters:
- search: string (optional) - Filter by email, redirect name, or ID

Response:
{
  "total": 150,
  "emails": [
    {
      "id": "string",
      "email": "user@example.com",
      "redirectId": "string",
      "redirectName": "string",
      "userId": "string",
      "username": "string",
      "source_url": "string",
      "captured_at": "ISO8601",
      "ip": "string",
      "userAgent": "string",
      "country": "string"
    }
  ]
}
```

### 4. Export Captured Emails
```http
GET /api/admin/captured-emails/export
Authorization: Bearer <admin_token>

Response:
Content-Type: text/csv

email,redirect_name,username,captured_at,country,ip
user@example.com,My Campaign,john_doe,2025-12-14T10:30:00Z,United States,1.2.3.4
```

### 5. Get Admin Dashboard Stats
```http
GET /api/admin/stats?timeRange=30d
Authorization: Bearer <admin_token>

Query Parameters:
- timeRange: "24h" | "7d" | "30d" | "90d" | "all" (default: "all")

Response:
{
  "totalUsers": 50,
  "totalRedirects": 245,
  "totalVisitors": 12500,
  "humanVisitors": 7800,
  "botVisitors": 4700,
  "capturedEmails": 890,
  "activeUsers": 35,
  "topRedirects": [
    {
      "id": "string",
      "name": "string",
      "username": "string",
      "clicks": 450
    }
  ],
  "topCountries": [
    { "country": "United States", "count": 5000 },
    { "country": "United Kingdom", "count": 2500 }
  ],
  "classificationBreakdown": {
    "human": 62.4,
    "bot": 37.6
  }
}
```

### 6. Get Realtime Events
```http
GET /api/admin/realtime-events
Authorization: Bearer <admin_token>

Response:
[
  {
    "id": "string",
    "type": "redirect",
    "redirectId": "string",
    "redirectName": "string",
    "username": "string",
    "classification": "human",
    "country": "string",
    "ip": "string",
    "timestamp": "ISO8601"
  }
]

Notes:
- Returns last 100 events
- Auto-updates every 5 seconds
- Used for real-time monitoring dashboard
```

---

## Special Features

### Email Autograb
When visitors access a redirect URL with email parameters, the system automatically:
- **For Humans**: Captures email, stores in database, forwards ALL parameters to destination
- **For Bots**: Does NOT capture email, strips email parameters, forwards only non-email parameters

Supported email parameter formats:
```
?email=user@example.com
$user@example.com
*user@example.com
#email=user@example.com
```

Example redirect URLs:
```
https://yourdomain.com/r/abc123?email=user@example.com
https://yourdomain.com/r/abc123$user@example.com
https://yourdomain.com/r/abc123*user@example.com
```

### Bot/Human Classification
The system uses sophisticated detection to classify visitors:
- IP reputation databases
- ISP analysis (datacenter vs residential)
- User-Agent pattern matching
- Behavior analysis
- Results are cached for bots to improve performance

---

## Rate Limits

- **Users**: 2 redirect links per day (across all domains)
- **API Requests**: No explicit rate limit (use responsibly)
- **Chat Messages**: No limit

---

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message description"
}
```

Common HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (daily limit exceeded)
- `500` - Internal Server Error

Example Error:
```json
{
  "error": "Daily redirect creation limit (2) has been reached. Please try again tomorrow."
}
```

---

## WebSocket Support (Optional)

For real-time chat updates, connect to:
```
ws://your-domain.com
```

Currently, WebSocket support is implicit through polling. A dedicated WebSocket implementation can be added for real-time features.

---

## Security Notes

1. **All passwords are bcrypt hashed** (10 rounds)
2. **JWT tokens expire** after configured time
3. **CORS is enabled** - configure allowed origins in production
4. **SQL injection protection** - All queries use parameterized statements
5. **XSS protection** - Input validation on all endpoints
6. **Rate limiting** - Daily limits enforced per user

---

## Database Schema (PostgreSQL)

Key tables:
- `users` - User accounts
- `api_users` - Admin accounts
- `redirects` - Redirect links
- `visitor_logs` - All visitor tracking
- `captured_emails` - Email autograb results
- `domains` - Multi-domain management
- `forum_messages` - Community chat
- `ip_cache` - Bot IP caching
- `realtime_events` - Live monitoring

---

## Production Deployment

This system is designed for **DigitalOcean App Platform**:
- Managed PostgreSQL database
- Automatic SSL certificates
- Environment variable management
- Auto-scaling capabilities
- Built-in monitoring

---

## Support

For API issues or questions:
- Use the Community Chat feature in the app
- Messages to admins trigger Telegram notifications (if configured)
- Admin responses sync between web and Telegram

