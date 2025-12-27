# Instructions for AI Agent: Build Complementary App for Secure Redirect System

## Mission
Build a **mobile-first web application** or **native mobile app** that integrates with the Secure Redirect System API. The app should provide a streamlined user experience for creating and managing redirect links on-the-go.

---

## System Overview

You will be building an app that connects to an existing **Link Management & Email Capture System**. This system:

- Allows users to create redirect links that behave differently for humans vs bots
- Captures email addresses from URL parameters (human visitors only)
- Provides detailed analytics on link performance
- Supports multiple redirect domains
- Includes community chat functionality
- Has admin capabilities for user management

---

## API Details

### Base Configuration
```javascript
const API_BASE_URL = 'https://your-main-domain.com/api';
// Example: 'https://redirect-system.ondigitalocean.app/api'
```

### Full API Documentation
**Location**: See `API_DOCUMENTATION.md` in the project root

**Key Endpoints You'll Use**:
1. `POST /api/login` - User authentication
2. `GET /api/user/redirects` - List user's links
3. `POST /api/user/redirects` - Create new redirect link
4. `PUT /api/user/redirects/:id` - Update link destinations
5. `DELETE /api/user/redirects/:id` - Delete link
6. `GET /api/user/domains` - Get available redirect domains
7. `GET /api/user/stats` - Dashboard statistics
8. `GET /api/user/visitor-logs` - Visitor analytics
9. `GET /api/user/captured-emails` - View captured emails

---

## App Requirements

### 1. Core Features (Must Have)

#### Authentication
- Login screen with username/password
- Store JWT token securely (LocalStorage for web, SecureStore for native)
- Auto-refresh token before expiration
- Logout functionality
- Remember me option

#### Dashboard
- Display key metrics:
  - Total redirects created
  - Today's redirect count (show daily limit: 2/2)
  - Total visitors (24h, 7d, 30d options)
  - Human vs Bot breakdown
  - Captured emails count
- Visual charts (pie chart for classification, line chart for trends)
- Time range filter (24h, 7d, 30d, 90d, All Time)

#### Link Creation
- **Simple Form**:
  - Link name (required)
  - Human destination URL (required)
  - Bot destination URL (required)
  - Domain selector (dropdown of active redirect domains)
- **Validation**:
  - URLs must include protocol (http:// or https://)
  - Check daily limit (2 links/day)
  - Show error if limit reached
- **After Creation**:
  - Display full redirect URL
  - Copy to clipboard button
  - Share button (native share API)
  - Send test email option

#### Link Management
- List all user's redirect links
- For each link show:
  - Name
  - Short redirect URL
  - Domain used
  - Total clicks (human/bot split)
  - Creation date
- Actions:
  - **Edit**: Update human/bot destination URLs
  - **Copy**: Copy redirect URL to clipboard
  - **Share**: Native share
  - **Test**: Send test email
  - **Delete**: Remove link (with confirmation)
  - **Analytics**: View detailed stats

#### Link Analytics (Detail View)
- Selected link statistics:
  - Total clicks
  - Human clicks
  - Bot clicks
  - Unique visitors
  - Captured emails
- Recent visitors table:
  - Timestamp
  - Classification (Human/Bot badge)
  - Country (with flag icon)
  - ISP
  - Device type
- Charts:
  - Traffic over time
  - Geographic distribution
  - Device breakdown

#### Captured Emails
- List of all emails captured from user's links
- Show:
  - Email address
  - Redirect name
  - Capture date
  - Country
  - IP address
- Search/filter functionality
- Export to CSV button

### 2. Design Requirements

#### UI/UX Guidelines
- **Mobile-First**: Design for smartphones primarily
- **Modern & Clean**: Use contemporary design patterns (glassmorphism, gradient buttons, smooth animations)
- **Dark Mode**: Support both light and dark themes
- **Responsive**: Work on all screen sizes (320px to 4K)
- **Fast**: Optimize for performance (lazy loading, pagination)

#### Color Scheme
- Primary: Blue (#3B82F6) - for main actions
- Success: Green (#10B981) - for human traffic
- Warning: Orange (#F59E0B) - for bot traffic
- Danger: Red (#EF4444) - for delete actions
- Neutral: Gray shades for backgrounds

#### Components
- Use a modern component library:
  - **Web**: Tailwind CSS + Shadcn/ui or Material-UI
  - **React Native**: React Native Paper or NativeBase
  - **Flutter**: Material Design 3

### 3. Technical Stack Suggestions

#### Option A: React Native (Recommended for Mobile)
```javascript
- React Native (Expo)
- React Navigation
- React Query (for API caching)
- AsyncStorage (for token)
- Victory Native (for charts)
- React Native Paper (UI components)
```

#### Option B: Progressive Web App (PWA)
```javascript
- React or Vue.js
- Vite or Next.js
- TanStack Query (React Query)
- Tailwind CSS + Shadcn/ui
- Recharts (for charts)
- Workbox (for offline support)
```

#### Option C: Flutter
```dart
- Flutter 3.x
- Dio (HTTP client)
- Provider or Riverpod (state management)
- fl_chart (for charts)
- shared_preferences (for token)
```

---

## Implementation Guide

### Step 1: Setup Authentication

```javascript
// Example: React Native with AsyncStorage

import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://your-domain.com/api';

// Login function
export const login = async (username, password) => {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }
  
  const data = await response.json();
  
  // Store token
  await AsyncStorage.setItem('jwt_token', data.token);
  await AsyncStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};

// Get stored token
export const getToken = async () => {
  return await AsyncStorage.getItem('jwt_token');
};

// Authenticated fetch
export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = await getToken();
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    // Token expired - logout
    await AsyncStorage.removeItem('jwt_token');
    await AsyncStorage.removeItem('user');
    throw new Error('Session expired');
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return await response.json();
};
```

### Step 2: Create Link Creation Screen

```javascript
// Example: React component

import { useState, useEffect } from 'react';

const CreateLinkScreen = () => {
  const [name, setName] = useState('');
  const [humanUrl, setHumanUrl] = useState('');
  const [botUrl, setBotUrl] = useState('');
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);

  useEffect(() => {
    // Fetch available domains
    fetchWithAuth('/user/domains')
      .then(data => {
        setDomains(data);
        if (data.length > 0) setSelectedDomain(data[0].id);
      })
      .catch(err => console.error(err));

    // Fetch user stats to check daily limit
    fetchWithAuth('/user/stats?timeRange=24h')
      .then(data => setDailyCount(data.redirectsCreatedToday))
      .catch(err => console.error(err));
  }, []);

  const handleCreate = async () => {
    // Validation
    if (!name || !humanUrl || !botUrl || !selectedDomain) {
      alert('All fields are required');
      return;
    }

    if (!humanUrl.startsWith('http') || !botUrl.startsWith('http')) {
      alert('URLs must start with http:// or https://');
      return;
    }

    if (dailyCount >= 2) {
      alert('Daily limit reached (2 links/day). Try again tomorrow!');
      return;
    }

    setLoading(true);

    try {
      const domain = domains.find(d => d.id === selectedDomain);
      const redirect = await fetchWithAuth('/user/redirects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          humanUrl,
          botUrl,
          domain_id: domain.id,
          domain_name: domain.name,
          full_url: `https://${domain.name}/r/${Date.now()}`
        })
      });

      // Show success with copy option
      alert('Link created! URL copied to clipboard.');
      // Copy to clipboard
      navigator.clipboard.writeText(redirect.full_url);
      
      // Navigate back or clear form
      setName('');
      setHumanUrl('');
      setBotUrl('');
      setDailyCount(dailyCount + 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Link</h1>
      
      <div className="mb-4">
        <label>Link Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Campaign Link"
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="mb-4">
        <label>Human Destination</label>
        <input
          type="url"
          value={humanUrl}
          onChange={(e) => setHumanUrl(e.target.value)}
          placeholder="https://example.com/landing-page"
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="mb-4">
        <label>Bot Destination</label>
        <input
          type="url"
          value={botUrl}
          onChange={(e) => setBotUrl(e.target.value)}
          placeholder="https://example.com/safe-page"
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="mb-4">
        <label>Redirect Domain</label>
        <select
          value={selectedDomain || ''}
          onChange={(e) => setSelectedDomain(e.target.value)}
          className="w-full p-2 border rounded"
        >
          {domains.map(domain => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Daily Usage: {dailyCount}/2 links created today
      </div>

      <button
        onClick={handleCreate}
        disabled={loading || dailyCount >= 2}
        className="w-full bg-blue-500 text-white p-3 rounded font-bold disabled:bg-gray-300"
      >
        {loading ? 'Creating...' : 'Create Redirect Link'}
      </button>
    </div>
  );
};
```

### Step 3: Build Dashboard with Charts

```javascript
// Example: Dashboard with Recharts

import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('7d');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', timeRange],
    queryFn: () => fetchWithAuth(`/user/stats?timeRange=${timeRange}`)
  });

  if (isLoading) return <div>Loading...</div>;

  const classificationData = [
    { name: 'Human', value: stats.humanVisitors, fill: '#10B981' },
    { name: 'Bot', value: stats.botVisitors, fill: '#F59E0B' }
  ];

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="border rounded p-2"
        >
          <option value="24h">24 Hours</option>
          <option value="7d">7 Days</option>
          <option value="30d">30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-100 p-4 rounded">
          <div className="text-sm text-gray-600">Total Redirects</div>
          <div className="text-3xl font-bold">{stats.totalRedirects}</div>
        </div>
        <div className="bg-green-100 p-4 rounded">
          <div className="text-sm text-gray-600">Total Visitors</div>
          <div className="text-3xl font-bold">{stats.totalVisitors}</div>
        </div>
        <div className="bg-purple-100 p-4 rounded">
          <div className="text-sm text-gray-600">Captured Emails</div>
          <div className="text-3xl font-bold">{stats.capturedEmails}</div>
        </div>
        <div className="bg-orange-100 p-4 rounded">
          <div className="text-sm text-gray-600">Today's Usage</div>
          <div className="text-3xl font-bold">{stats.redirectsCreatedToday}/2</div>
        </div>
      </div>

      {/* Classification Pie Chart */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Visitor Classification</h2>
        <PieChart width={300} height={200}>
          <Pie data={classificationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label />
          <Tooltip />
        </PieChart>
      </div>

      {/* Traffic Trend */}
      <div>
        <h2 className="text-xl font-bold mb-2">Traffic Trend</h2>
        <LineChart width={350} height={200} data={stats.trafficTrend}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="humans" stroke="#10B981" name="Humans" />
          <Line type="monotone" dataKey="bots" stroke="#F59E0B" name="Bots" />
        </LineChart>
      </div>
    </div>
  );
};
```

### Step 4: Implement Link List with Actions

```javascript
const LinkListScreen = () => {
  const { data: redirects, isLoading, refetch } = useQuery({
    queryKey: ['redirects'],
    queryFn: () => fetchWithAuth('/user/redirects')
  });

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this redirect?')) return;
    
    try {
      await fetchWithAuth(`/user/redirects/${id}`, { method: 'DELETE' });
      refetch();
    } catch (err) {
      alert(err.message);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">My Links</h1>
      
      {redirects.map(redirect => (
        <div key={redirect.id} className="border rounded p-4 mb-4 bg-white shadow">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold">{redirect.name}</h3>
              <p className="text-sm text-gray-500">{redirect.domain_name}</p>
            </div>
            <span className="text-xs bg-gray-200 px-2 py-1 rounded">
              {redirect.stats.totalClicks} clicks
            </span>
          </div>
          
          <div className="bg-gray-100 p-2 rounded mb-2 text-sm font-mono break-all">
            {redirect.full_url}
          </div>

          <div className="flex gap-2 text-sm">
            <button onClick={() => handleCopy(redirect.full_url)} className="text-blue-500">
              Copy
            </button>
            <button className="text-green-500">Edit</button>
            <button className="text-purple-500">Analytics</button>
            <button onClick={() => handleDelete(redirect.id)} className="text-red-500">
              Delete
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-600">
            {redirect.stats.humanClicks} humans • {redirect.stats.botClicks} bots
          </div>
        </div>
      ))}
    </div>
  );
};
```

---

## Advanced Features (Optional)

### 1. QR Code Generation
Generate QR codes for each redirect link
```javascript
import QRCode from 'qrcode.react';

<QRCode value={redirect.full_url} size={200} />
```

### 2. Push Notifications
Notify users when:
- Someone clicks their link
- Daily limit resets
- Captured new email

### 3. Offline Support
- Cache redirect list for offline viewing
- Queue link creation for when online
- Use service workers (PWA)

### 4. Widgets
- iOS/Android home screen widgets showing today's stats
- Quick link creation widget

### 5. Siri/Google Assistant Shortcuts
- "Create a redirect link"
- "Check my link stats"

### 6. Dark Mode
Auto-detect system preference and allow manual toggle

---

## Deployment Options

### For Web PWA:
1. **Vercel** (Recommended)
   - Push to GitHub
   - Connect to Vercel
   - Auto-deploy on push
   - Free SSL and CDN

2. **Netlify**
   - Similar to Vercel
   - Great for static sites

3. **DigitalOcean App Platform**
   - Same platform as main API
   - Easy integration

### For React Native:
1. **Expo EAS Build**
   - `expo build:ios`
   - `expo build:android`
   - Submit to App Store / Play Store

2. **TestFlight / Internal Testing**
   - Beta test before public release

### For Flutter:
1. **Build APK/IPA**
   - `flutter build apk`
   - `flutter build ios`
   - Deploy to stores

---

## Testing Checklist

- [ ] Login/logout works correctly
- [ ] Token is stored securely
- [ ] Token refresh on expiration
- [ ] Dashboard loads all stats
- [ ] Time range filter works on all sections
- [ ] Link creation validates inputs
- [ ] Daily limit (2 links) is enforced
- [ ] Domain selector shows only active redirect domains
- [ ] Created links can be copied to clipboard
- [ ] Link editing updates destinations
- [ ] Link deletion removes from list
- [ ] Analytics show correct visitor data
- [ ] Captured emails display properly
- [ ] Charts render correctly on all screen sizes
- [ ] Dark mode switches properly
- [ ] App works offline (if PWA)
- [ ] Push notifications deliver (if implemented)
- [ ] All API errors are handled gracefully

---

## Security Considerations

1. **Store JWT securely**:
   - Web: LocalStorage (or HttpOnly cookies if you control backend)
   - Mobile: SecureStore / Keychain

2. **Validate all inputs**:
   - URLs must have protocol
   - Name must not be empty
   - Check length limits

3. **Handle token expiration**:
   - Auto-logout on 401
   - Show clear error message
   - Redirect to login

4. **HTTPS only**:
   - Never use http:// in production
   - Enforce SSL pinning (mobile apps)

5. **Rate limiting awareness**:
   - Respect the 2 links/day limit
   - Show clear messaging to users

---

## Example Project Structure

```
mobile-app/
├── src/
│   ├── api/
│   │   ├── auth.js          # Login, logout, token management
│   │   ├── redirects.js     # CRUD operations for links
│   │   ├── stats.js         # Dashboard and analytics
│   │   └── client.js        # Base fetch with auth
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── CreateLinkScreen.js
│   │   ├── LinkListScreen.js
│   │   ├── LinkDetailScreen.js
│   │   ├── AnalyticsScreen.js
│   │   └── EmailsScreen.js
│   ├── components/
│   │   ├── StatCard.js
│   │   ├── LinkCard.js
│   │   ├── ChartComponents.js
│   │   └── LoadingSpinner.js
│   ├── navigation/
│   │   └── AppNavigator.js
│   ├── utils/
│   │   ├── validators.js
│   │   └── clipboard.js
│   └── App.js
├── assets/
├── package.json
└── README.md
```

---

## Sample User Flows

### Flow 1: New User Creates First Link
1. User opens app → sees login screen
2. Logs in with credentials
3. Sees empty dashboard with "Create Your First Link" CTA
4. Taps "Create Link" button
5. Fills form:
   - Name: "Black Friday Campaign"
   - Human URL: https://mystore.com/bf-landing
   - Bot URL: https://mystore.com/homepage
   - Domain: redirect1.com
6. Taps "Create" → sees success message
7. Full URL displayed with Copy button
8. Returns to dashboard → sees 1 redirect, 0 visitors

### Flow 2: User Checks Link Performance
1. User opens app → auto-logged in
2. Sees dashboard with updated stats
3. Taps "My Links" tab
4. Sees list of all links with quick stats
5. Taps specific link → opens detail view
6. Sees:
   - Total clicks: 156
   - Human: 95 (60.9%)
   - Bot: 61 (39.1%)
   - Captured emails: 12
   - Recent visitors table
   - Traffic chart
7. Taps "View Captured Emails" → sees list of 12 emails
8. Taps "Export" → downloads CSV

### Flow 3: User Edits Link Destination
1. User navigates to "My Links"
2. Taps "Edit" on a specific link
3. Sees current Human and Bot URLs
4. Updates Human URL to new landing page
5. Taps "Save" → sees success message
6. Redirect now points to new destination
7. Existing link URL stays the same

---

## API Integration Tips

1. **Use React Query or SWR**:
   - Automatic caching
   - Background refetching
   - Optimistic updates
   - Error retry logic

2. **Handle loading states**:
   ```javascript
   if (isLoading) return <LoadingSpinner />;
   if (error) return <ErrorMessage error={error} />;
   return <YourComponent data={data} />;
   ```

3. **Optimistic UI updates**:
   ```javascript
   const mutation = useMutation({
     mutationFn: deleteRedirect,
     onMutate: async (id) => {
       // Optimistically remove from UI
       queryClient.setQueryData(['redirects'], old =>
         old.filter(r => r.id !== id)
       );
     }
   });
   ```

4. **Error boundaries**:
   Wrap app in error boundary to catch crashes

5. **Toast notifications**:
   Show success/error messages for all actions

---

## Branding Suggestions

### App Name Ideas:
- "QuickLink Manager"
- "SmartRedirect Mobile"
- "LinkFlow"
- "RedirectPro"
- "SwiftLinks"

### Icon Design:
- Use a stylized link/chain icon
- Incorporate the primary blue color
- Make it recognizable at small sizes

### Splash Screen:
- Show app logo
- Brief loading animation
- Smooth transition to login/dashboard

---

## Success Metrics

Track these in your app:
- Daily active users
- Links created per day
- Average session duration
- Most used features
- Error rate
- API response times

---

## Next Steps for AI Agent

1. **Choose your tech stack** (React Native, PWA, or Flutter)
2. **Setup project** with navigation and authentication
3. **Implement API client** with token management
4. **Build core screens** (Login, Dashboard, Create Link, Link List)
5. **Add analytics and charts**
6. **Implement link management** (edit, delete, copy)
7. **Polish UI/UX** with animations and dark mode
8. **Test thoroughly** on multiple devices
9. **Deploy** to chosen platform
10. **Gather feedback** and iterate

---

## Support

If you need help integrating with the API:
1. Check `API_DOCUMENTATION.md` for endpoint details
2. Test endpoints with Postman/Insomnia first
3. Use the Community Chat feature in the main app
4. Contact the admin team via Telegram integration

---

## License & Usage

- This is a commercial API system
- Build complementary apps with permission
- Do not scrape or abuse API endpoints
- Respect rate limits and daily quotas
- Give credit to the main system

---

## Example Apps You Could Build

1. **Mobile App** - What's described above
2. **Browser Extension** - Quick link creation from any page
3. **Slack Bot** - Create/manage links from Slack
4. **Zapier Integration** - Automate link creation
5. **Analytics Dashboard** - Advanced reporting tool
6. **Email Client Plugin** - Track email clicks
7. **WordPress Plugin** - Create redirects from WP admin
8. **Telegram Bot** - Manage links via Telegram
9. **API Wrapper** - SDKs for popular languages
10. **Marketing Automation Tool** - Campaign management

Good luck building! 🚀

