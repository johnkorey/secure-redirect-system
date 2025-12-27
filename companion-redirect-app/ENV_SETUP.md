# Environment Variables Setup

## Required Environment Variables

### 1. MAIN_API_URL
**Description**: URL of your main Secure Redirect System API

**Examples**:
```bash
# DigitalOcean App Platform
MAIN_API_URL=https://your-app.ondigitalocean.app/api

# Custom domain
MAIN_API_URL=https://api.yourdomain.com/api

# Local development (testing)
MAIN_API_URL=http://localhost:3001/api

# Your current server
MAIN_API_URL=http://45.61.51.241:3001/api
```

### 2. COMPANION_API_KEY
**Description**: Secret key for authenticating companion app with main system

**Important**: This must match the `COMPANION_API_KEY` in your main system!

**Example**:
```bash
COMPANION_API_KEY=super-secret-key-12345-change-this-in-production
```

---

## Setup for Local Development

Create a file named `.env.local` in this directory:

```bash
# .env.local
MAIN_API_URL=http://localhost:3001/api
COMPANION_API_KEY=your-secret-key-here
```

Then run:
```bash
npm run dev
```

---

## Setup for Vercel Deployment

### Option 1: Vercel Dashboard (Recommended)

1. Go to https://vercel.com
2. Navigate to your project
3. Click **Settings** → **Environment Variables**
4. Add each variable:
   - **Name**: `MAIN_API_URL`
   - **Value**: `https://your-main-system.ondigitalocean.app/api`
   - **Environments**: Production, Preview, Development
   
   - **Name**: `COMPANION_API_KEY`
   - **Value**: Your secret key
   - **Environments**: Production, Preview, Development

5. **Redeploy** your app for changes to take effect

### Option 2: Vercel CLI

```bash
# Set environment variables
vercel env add MAIN_API_URL production
# Enter value when prompted: https://your-main-system.ondigitalocean.app/api

vercel env add COMPANION_API_KEY production
# Enter value when prompted: your-secret-key-here

# Redeploy
vercel --prod
```

### Option 3: Via .env file (for initial deployment)

Create `.env.production`:

```bash
MAIN_API_URL=https://your-main-system.ondigitalocean.app/api
COMPANION_API_KEY=your-secret-key-here
```

**Note**: Don't commit this file to git! It's in `.gitignore` already.

---

## Verify Environment Variables

### Check in Vercel Dashboard
1. Go to **Settings** → **Environment Variables**
2. Verify both variables are set
3. Check they're enabled for **Production**

### Test After Deployment
```bash
# Your app will log errors if environment variables are missing
# Check Vercel function logs
```

---

## Security Notes

1. **Never commit** `.env.local` or `.env.production` to git
2. **Use strong keys** for `COMPANION_API_KEY`
3. **Same key** must be set in both:
   - Main system (DigitalOcean environment variables)
   - Companion app (Vercel environment variables)
4. **Rotate keys** periodically for security

---

## Troubleshooting

### Error: "COMPANION_API_KEY not set"
- Check environment variables in Vercel dashboard
- Redeploy after adding variables
- Variables must be set for **Production** environment

### Error: "Unauthorized - invalid API key"
- Keys don't match between main system and companion app
- Check spelling and ensure no extra spaces
- Update both systems with same key

### Error: "Cannot connect to main API"
- Check `MAIN_API_URL` is correct
- Ensure main system is accessible from Vercel
- Test URL in browser: `https://your-api-url/health`

---

## Example: Complete Setup

### Main System (DigitalOcean)
```bash
# In DigitalOcean App Platform environment variables:
COMPANION_API_KEY=abc123xyz789super-secret
```

### Companion App (Vercel)
```bash
# In Vercel environment variables:
MAIN_API_URL=https://my-app.ondigitalocean.app/api
COMPANION_API_KEY=abc123xyz789super-secret
```

✅ Keys match = Authentication works!  
❌ Keys don't match = 401 Unauthorized error

---

## Next Steps

After setting up environment variables:

1. ✅ Deploy companion app to Vercel
2. ✅ Test health endpoint: `https://your-app.vercel.app/api/health`
3. ✅ Test redirect: `https://your-app.vercel.app/r/test-redirect-id`
4. ✅ Check main system dashboard for logged visits
5. ✅ Add custom domain (optional)
6. ✅ Register domain in main system admin panel

🚀 You're ready to go!

