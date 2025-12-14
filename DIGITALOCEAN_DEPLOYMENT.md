# DigitalOcean App Platform Deployment Guide

Complete guide to deploying your Secure Redirect System on DigitalOcean App Platform.

---

## 📋 Prerequisites

- DigitalOcean account
- GitHub repository (or GitLab/Bitbucket)
- Credit card for billing (free trial available)

---

## 💰 Estimated Monthly Cost

| Component | Plan | Cost |
|-----------|------|------|
| **App (Basic XXS)** | 512 MB RAM, 1 vCPU | $5/month |
| **PostgreSQL (Dev)** | 1 GB RAM, 10 GB storage | $7/month |
| **Total** | | **$12/month** |

*For production traffic, upgrade to Basic XS ($12/mo) + Basic DB ($15/mo) = $27/month*

---

## 🚀 Deployment Steps

### **Step 1: Push Code to GitHub**

1. **Create a new GitHub repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

2. **Verify your repository includes:**
   - ✅ All code files
   - ✅ `package.json` with `"start"` script
   - ✅ `.digitalocean/app.yaml` (optional, for automatic config)

---

### **Step 2: Create PostgreSQL Database**

1. **Go to DigitalOcean Dashboard:**
   - Navigate to: **Databases** → **Create Database**

2. **Configure Database:**
   ```
   Database Engine: PostgreSQL 16
   Plan: Development ($7/month) or Basic ($15/month)
   Datacenter Region: New York (or closest to you)
   Database Name: secure-redirect-db
   ```

3. **Click "Create Database"**
   - Wait 3-5 minutes for provisioning
   - ✅ Keep this tab open, you'll need it later

---

### **Step 3: Create App Platform App**

1. **Go to:** **App Platform** → **Create App**

2. **Connect Repository:**
   - Select **GitHub**
   - Authorize DigitalOcean
   - Choose your repository
   - Branch: `main`
   - Auto-deploy: ✅ **Enabled**

3. **Configure Resources:**
   - Click **Edit** next to your app
   - **Type:** Web Service
   - **Build Command:** `npm install && npm run build`
   - **Run Command:** `npm start`
   - **HTTP Port:** `3001`
   - **Instance Size:** Basic XXS ($5/month)

4. **Click "Next"**

---

### **Step 4: Attach Database**

1. **In App Platform setup, go to "Resources"**

2. **Click "Add Resource" → "Database"**

3. **Select your PostgreSQL database:**
   - Choose: `secure-redirect-db`
   - Database name: `secure_redirect` (or default)

4. **Database connection will be auto-injected as:**
   ```
   ${secure-redirect-db.DATABASE_URL}
   ```

---

### **Step 5: Configure Environment Variables**

1. **Still in App Platform setup, go to "Environment Variables"**

2. **Add these variables:**

   ```env
   # Application
   NODE_ENV = production
   PORT = 3001
   
   # Security (Click "Encrypt" ✅)
   JWT_SECRET = <generate-random-string-here>
   
   # Database (Auto-injected, just verify it's there)
   DATABASE_URL = ${secure-redirect-db.DATABASE_URL}
   DB_SSL = true
   ```

3. **Generate JWT_SECRET:**
   - Use: https://www.uuidgenerator.net/
   - Or run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. **Optional API Keys (add later):**
   ```env
   IP2LOCATION_API_KEY = your-key-here
   MAILGUN_API_KEY = your-key-here
   TELEGRAM_BOT_TOKEN = your-bot-token
   ```

---

### **Step 6: Configure Health Check**

1. **In "Settings" → "Health Checks":**
   ```
   Health Check Path: /health
   Initial Delay: 60 seconds
   Period: 10 seconds
   Timeout: 5 seconds
   Success Threshold: 1
   Failure Threshold: 3
   ```

2. **Save settings**

---

### **Step 7: Deploy!**

1. **Click "Create Resources"**

2. **Wait for deployment (5-10 minutes):**
   - ✅ Building (2-3 min)
   - ✅ Deploying (1-2 min)
   - ✅ Running database migration (1 min)
   - ✅ Health check passing

3. **Watch the logs:**
   - Click on your app → **Runtime Logs**
   - Look for: `✅ Initialization complete`

---

### **Step 8: Access Your App**

1. **Get your app URL:**
   - Format: `https://your-app-name-xxxxx.ondigitalocean.app`

2. **Test the health check:**
   ```bash
   curl https://your-app-name-xxxxx.ondigitalocean.app/health
   ```
   
   Should return:
   ```json
   {
     "status": "healthy",
     "database": "postgresql",
     "environment": "production"
   }
   ```

3. **Login to admin panel:**
   - URL: `https://your-app-name-xxxxx.ondigitalocean.app`
   - Email: `admin@example.com`
   - Password: `admin123`

---

## 🌐 Add Custom Domain (Optional)

1. **Go to:** Your App → **Settings** → **Domains**

2. **Click "Add Domain":**
   - Enter: `yourdomain.com`
   - Click "Add Domain"

3. **Update DNS:**
   - Add CNAME record:
     ```
     Type: CNAME
     Name: @  (or www)
     Value: your-app-name-xxxxx.ondigitalocean.app
     ```

4. **SSL Certificate:**
   - Auto-generated (free)
   - Takes 5-10 minutes

---

## 🔧 Configuration After Deployment

### **1. Add IP2Location API Key**

```bash
# Go to: App → Settings → Environment Variables
# Add:
IP2LOCATION_API_KEY = your-key-here (Encrypt ✅)
```

### **2. Add Mailgun Settings**

```bash
MAILGUN_API_KEY = your-key-here
MAILGUN_DOMAIN = mg.yourdomain.com
MAILGUN_REGION = us
```

### **3. Add Telegram Bot**

```bash
TELEGRAM_BOT_TOKEN = 123456:ABC-DEF...
TELEGRAM_ADMIN_CHAT_ID = 123456789
```

**After adding any environment variable, click "Save" → App will auto-redeploy**

---

## 📊 Monitoring & Logs

### **View Logs**
```
App → Runtime Logs → Live tail
```

### **View Metrics**
```
App → Insights → Performance, Requests, Errors
```

### **Database Metrics**
```
Databases → Your DB → Insights
```

---

## 🔄 Continuous Deployment

Every time you push to GitHub:
1. ✅ App Platform auto-detects changes
2. ✅ Builds new version
3. ✅ Runs zero-downtime deployment
4. ✅ New version goes live

**To disable auto-deploy:**
```
App → Settings → Source → Disable "Auto-deploy"
```

---

## 🛠️ Database Management

### **Connect to Database**

1. **Get connection string:**
   ```
   Databases → Your DB → Connection Details
   ```

2. **Connect with psql:**
   ```bash
   psql "postgresql://user:pass@host:25060/database?sslmode=require"
   ```

3. **View tables:**
   ```sql
   \dt
   ```

### **Backup Database**

```
Databases → Your DB → Backups
- Daily automatic backups (free)
- Manual backups (click "Backup Now")
```

### **Scale Database**

```
Databases → Your DB → Settings → Resize
- Dev → Basic ($15/mo) = 2x performance
- Basic → Pro ($60/mo) = 10x performance
```

---

## 🐛 Troubleshooting

### **App won't start**

1. **Check runtime logs:**
   ```
   App → Runtime Logs
   ```

2. **Common issues:**
   - ❌ Database not attached → Go to Resources → Add Database
   - ❌ Missing DATABASE_URL → Check Environment Variables
   - ❌ Build failed → Check Build Logs
   - ❌ Port mismatch → Ensure PORT=3001

### **Health check failing**

1. **Check logs for database errors:**
   ```
   Look for: "Database connection failed"
   ```

2. **Verify database is running:**
   ```
   Databases → Your DB → Status should be "online"
   ```

3. **Test health endpoint manually:**
   ```bash
   curl https://your-app.ondigitalocean.app/health
   ```

### **Database connection errors**

1. **Check if database is in same region as app**
2. **Verify DATABASE_URL is set correctly**
3. **Check database firewall:** (should be auto-configured)
   ```
   Databases → Your DB → Settings → Trusted Sources
   - Should include "App Platform apps"
   ```

### **App is slow**

1. **Upgrade app instance:**
   ```
   App → Settings → Basic XXS → Basic XS ($12/mo)
   ```

2. **Upgrade database:**
   ```
   Databases → Your DB → Settings → Resize to Basic ($15/mo)
   ```

3. **Enable connection pooling:** (Already configured ✅)

---

## 💡 Best Practices

### **Security**
- ✅ **Never commit `.env` file** (already in `.gitignore`)
- ✅ **Use "Encrypt" for all API keys** in environment variables
- ✅ **Change default admin password** after first login
- ✅ **Enable 2FA** on DigitalOcean account

### **Performance**
- ✅ **Use connection pooling** (already configured)
- ✅ **Enable database indexes** (already in schema)
- ✅ **Monitor slow queries** in database insights

### **Cost Optimization**
- Start with Dev database ($7) → Upgrade when needed
- Use Basic XXS app ($5) → Scale up for traffic
- Set up billing alerts in DigitalOcean

### **Monitoring**
- Check logs daily for errors
- Set up Uptime monitors (built-in)
- Review database size monthly

---

## 📈 Scaling Guide

### **For 1K-10K daily visitors:**
- App: Basic XXS ($5)
- Database: Dev ($7)
- **Total: $12/month** ✅

### **For 10K-50K daily visitors:**
- App: Basic XS ($12)
- Database: Basic ($15)
- **Total: $27/month**

### **For 50K+ daily visitors:**
- App: Basic S ($24) or Professional
- Database: Pro ($60)
- Consider adding Redis caching
- **Total: $84+/month**

---

## 🎯 Next Steps

After deployment:

1. ✅ **Change admin password**
2. ✅ **Add your domain**
3. ✅ **Configure IP2Location API**
4. ✅ **Set up Mailgun**
5. ✅ **Add Telegram bot**
6. ✅ **Create your first redirect**
7. ✅ **Test with real traffic**

---

## 📚 Useful Links

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [PostgreSQL Docs](https://docs.digitalocean.com/products/databases/postgresql/)
- [App Platform Pricing](https://www.digitalocean.com/pricing/app-platform)
- [Community Tutorials](https://www.digitalocean.com/community/tags/app-platform)

---

## 💬 Need Help?

- **App not working?** Check Runtime Logs first
- **Database issues?** Verify connection in Environment Variables
- **Still stuck?** Check DigitalOcean Community or Support

---

**🎉 Congratulations! Your app is now live on DigitalOcean!** 🚀

