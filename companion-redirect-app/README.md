# Companion Redirect App

A lightweight Next.js companion app that works with the **Secure Redirect System**. This app handles redirects on custom domains while logging all data back to the main system.

## 🎯 What It Does

- Handles redirect URLs: `https://yourdomain.com/r/abc123`
- Supports email autograb: `https://yourdomain.com/r/abc123$email@test.com`
- Classifies visitors as human or bot (via main API)
- Logs all visits to main system
- Captures emails for human visitors only
- Caches redirect configs for 5 minutes
- Runs on Vercel Edge Network (globally distributed)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` file:

```bash
# Your main system API URL
MAIN_API_URL=https://your-main-system.ondigitalocean.app/api

# API key (must match the one in your main system)
COMPANION_API_KEY=your-super-secret-key-here
```

### 3. Run Locally

```bash
npm run dev
```

Visit: `http://localhost:3000`

### 4. Test a Redirect

First, create a redirect in your main system with ID `abc123`, then:

```bash
# Test basic redirect
curl -I http://localhost:3000/r/abc123

# Test with email autograb
curl -I http://localhost:3000/r/abc123?email=test@example.com
```

## 📦 Project Structure

```
companion-redirect-app/
├── app/
│   ├── r/
│   │   └── [id]/
│   │       └── route.js         # Main redirect handler
│   ├── api/
│   │   └── health/
│   │       └── route.js         # Health check
│   ├── layout.js                 # Root layout
│   └── page.js                   # Homepage
├── lib/
│   ├── mainApi.js               # API client for main system
│   ├── emailAutograb.js         # Email extraction utilities
│   └── cache.js                 # In-memory caching
├── package.json
├── next.config.js
└── README.md
```

## 🌐 Deploy to Vercel

### Option 1: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Option 2: Via Vercel Dashboard

1. Go to https://vercel.com
2. Click "New Project"
3. Import this Git repository
4. Configure:
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`
5. Add Environment Variables:
   - `MAIN_API_URL` = Your main system API URL
   - `COMPANION_API_KEY` = Your companion API key
6. Click "Deploy"

## 🎨 Custom Domains

### Add Custom Domain in Vercel

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `go.yourdomain.com`)
4. Configure DNS:

**For subdomains**:
```
Type: CNAME
Name: go
Value: cname.vercel-dns.com
```

**For root domains**:
```
Type: A
Name: @
Value: 76.76.21.21
```

5. Wait for DNS propagation (5-60 minutes)
6. Vercel auto-provisions SSL certificate

### Multiple Domains

You can add multiple domains to the same Vercel app:
- `go.example.com`
- `track.link`
- `redirect.mybrand.com`

All domains will use the same redirect logic!

## 🧪 Testing

### Test Health Endpoint

```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "companion-redirect-app",
  "timestamp": "2025-12-14T10:30:00Z",
  "version": "1.0.0"
}
```

### Test Redirect

```bash
# Basic redirect
curl -I https://your-app.vercel.app/r/abc123

# With email autograb
curl -I https://your-app.vercel.app/r/abc123\$test@email.com
```

### Test in Browser

1. Create a redirect in your main system
2. Visit: `https://your-app.vercel.app/r/{your-redirect-id}`
3. Should redirect to destination
4. Check main system dashboard - visit should be logged
5. Check captured emails - email should appear (for human visits)

## 📊 Features

### Email Autograb

Supports multiple email formats:
- `?email=user@example.com` - Query parameter
- `$user@example.com` - Dollar sign separator
- `*user@example.com` - Asterisk separator  
- `#email=user@example.com` - Hash parameter

**Human visitors**: Email captured and forwarded to destination  
**Bot visitors**: Email NOT captured, stripped from URL

### Caching

- Redirect configs cached for **5 minutes**
- Reduces API calls to main system by ~80%
- Automatic cache expiration
- Improves redirect speed

### Error Handling

- **404**: Redirect not found
- **410**: Redirect inactive (domain deactivated)
- **500**: Falls back to main system URL

## 🔧 Configuration

### Cache TTL

Edit `lib/cache.js` to change cache duration:

```javascript
// Default: 300 seconds (5 minutes)
cacheSet(`redirect:${actualId}`, redirectConfig, 300);

// Change to 10 minutes:
cacheSet(`redirect:${actualId}`, redirectConfig, 600);
```

### Logging

The app logs to Vercel's function logs. View them in:
- Vercel Dashboard → Your Project → Functions → Logs

## 🆘 Troubleshooting

### Issue: Redirects not working

**Check**:
- Environment variables set correctly in Vercel
- `COMPANION_API_KEY` matches main system
- Main system is accessible from Vercel
- Redirect exists in main system database

### Issue: Emails not captured

**Check**:
- Visitor classified as "human" (bots don't capture emails)
- Email format is valid
- No duplicate (system prevents duplicate emails)
- Check main system logs for errors

### Issue: API errors

**Check**:
- Main system is running and accessible
- API endpoints return 200 status
- COMPANION_API_KEY is correct
- Check Vercel function logs for details

## 📈 Performance

- **Redirect time**: < 100ms (Vercel Edge)
- **Cache hit rate**: ~80%
- **API calls per redirect**: 2-3
  - 1x GET config (cached 80% of time)
  - 1x POST classify
  - 1x POST log visit
- **Bandwidth**: Minimal (no large files)

## 💰 Cost

### Vercel Pricing
- **Free tier**: 100 GB bandwidth
- **Pro**: $20/month for 1 TB
- **Cost per 1M redirects**: ~$5-10

### Main System
- **API calls**: Free (self-hosted)
- **Database**: PostgreSQL storage only

## 📚 Related Documentation

- **Main System Documentation**: See project root
- **API Documentation**: `API_DOCUMENTATION.md`
- **Build Guide**: `COMPANION_APP_BUILD_GUIDE.md`
- **Setup Instructions**: `COMPANION_APP_SETUP.md`

## 🔒 Security

- All API calls use HTTPS
- API key authentication required
- No data stored locally (stateless)
- Visitor data encrypted in transit
- CORS headers properly configured

## ✅ Production Checklist

Before going live:

- [ ] Environment variables set in Vercel
- [ ] Custom domain configured with SSL
- [ ] Tested redirects working correctly
- [ ] Visits logging to main system
- [ ] Emails capturing for humans only
- [ ] Health endpoint returns 200
- [ ] Main system API accessible from Vercel
- [ ] Monitoring set up (Vercel Analytics)

## 🤝 Support

For issues or questions:
- Check main system logs
- Check Vercel function logs
- Review API Documentation
- Contact main system admin

## 📝 License

Same as main Secure Redirect System

---

**Built with Next.js 14 and deployed on Vercel Edge Network** 🚀

