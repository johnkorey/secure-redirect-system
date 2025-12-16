# Link Counter Display Fix

## Problem Identified

After creating redirects, the link counter displayed on the dashboard was not updating:
- ❌ Created 1st link → Shows "1/2" ✅
- ❌ Created 2nd link → Still shows "1/2" (should show "2/2")

The counter was being incremented correctly in the database, but the **frontend was not receiving or displaying the updated count**.

---

## Root Cause

1. **Counter incremented in database** ✅ - The atomic transaction worked correctly
2. **API response missing counter data** ❌ - The redirect creation endpoint only returned the redirect object
3. **Frontend showing cached data** ❌ - The UI displayed the counter from initial page load and never refreshed

---

## Solution Implemented

### 1. Updated Redirect Creation Response (`POST /api/redirects`)

Now includes updated counter information in the response:

**Before:**
```json
{
  "id": "r-1765882346886-10d4r9r3k",
  "name": "My Link",
  "human_url": "https://example.com",
  "bot_url": "https://google.com",
  ...
}
```

**After:**
```json
{
  "id": "r-1765882346886-10d4r9r3k",
  "name": "My Link",
  "human_url": "https://example.com",
  "bot_url": "https://google.com",
  ...,
  "linkCounter": {
    "linksCreatedToday": 2,
    "dailyLinkLimit": 2,
    "remainingLinks": 0
  }
}
```

### 2. Enhanced User Info Endpoint (`GET /api/auth/me`)

Added normalized counter information to the apiUser object:

```json
{
  "id": "user-123",
  "email": "user@example.com",
  "role": "user",
  "apiUser": {
    "id": "apiuser-123",
    "email": "user@example.com",
    "links_created_today": 2,
    "daily_link_limit": 2,
    ...,
    "linkCounter": {
      "linksCreatedToday": 2,
      "dailyLinkLimit": 2,
      "remainingLinks": 0,
      "date": "2025-12-16"
    }
  }
}
```

### 3. New Dedicated Counter Endpoint (`GET /api/user/link-counter`)

Created a lightweight endpoint specifically for fetching counter status:

**Request:**
```bash
GET /api/user/link-counter
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "linksCreatedToday": 2,
  "dailyLinkLimit": 2,
  "remainingLinks": 0,
  "date": "2025-12-16",
  "canCreateMore": false
}
```

---

## Frontend Integration

### Option 1: Use Counter from Redirect Creation Response (Recommended)

Update your redirect creation handler to extract and display the counter:

```javascript
async function createRedirect(data) {
  try {
    const response = await fetch('/api/redirects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    // Extract and update counter display
    if (result.linkCounter) {
      updateCounterDisplay(result.linkCounter);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to create redirect:', error);
  }
}

function updateCounterDisplay(counter) {
  const { linksCreatedToday, dailyLinkLimit, remainingLinks } = counter;
  
  // Update UI
  document.getElementById('counter-text').textContent = 
    `${linksCreatedToday} of ${dailyLinkLimit} links created today`;
  
  document.getElementById('remaining-text').textContent = 
    `${remainingLinks} remaining`;
}
```

### Option 2: Refetch User Data After Creating Link

```javascript
async function createRedirect(data) {
  const result = await fetch('/api/redirects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  // Refetch user data to get updated counter
  await refreshUserData();
  
  return result.json();
}

async function refreshUserData() {
  const response = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const userData = await response.json();
  
  // Update counter from apiUser.linkCounter
  if (userData.apiUser?.linkCounter) {
    updateCounterDisplay(userData.apiUser.linkCounter);
  }
}
```

### Option 3: Use Dedicated Counter Endpoint

For real-time counter updates without full user data:

```javascript
async function fetchLinkCounter() {
  try {
    const response = await fetch('/api/user/link-counter', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const counter = await response.json();
    
    updateCounterDisplay(counter);
    
    // Optionally disable create button if limit reached
    if (!counter.canCreateMore) {
      document.getElementById('create-btn').disabled = true;
      document.getElementById('create-btn').textContent = 'Daily Limit Reached';
    }
    
    return counter;
  } catch (error) {
    console.error('Failed to fetch counter:', error);
  }
}

// Call after creating a redirect
async function createRedirect(data) {
  await fetch('/api/redirects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  // Refresh counter display
  await fetchLinkCounter();
}
```

---

## React/Vue Example

### React with useState

```jsx
import { useState, useEffect } from 'react';

function Dashboard() {
  const [linkCounter, setLinkCounter] = useState({
    linksCreatedToday: 0,
    dailyLinkLimit: 2,
    remainingLinks: 2
  });

  const createRedirect = async (data) => {
    try {
      const response = await fetch('/api/redirects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      
      // Update counter from response
      if (result.linkCounter) {
        setLinkCounter(result.linkCounter);
      }
      
      return result;
    } catch (error) {
      console.error('Create redirect failed:', error);
    }
  };

  return (
    <div>
      <div className="counter-display">
        <h3>Daily Link Limit</h3>
        <p>{linkCounter.linksCreatedToday} of {linkCounter.dailyLinkLimit} links created today</p>
        <p>{linkCounter.remainingLinks} remaining</p>
      </div>
      
      <button 
        onClick={() => createRedirect(formData)}
        disabled={linkCounter.remainingLinks === 0}
      >
        {linkCounter.remainingLinks > 0 ? 'Create Link' : 'Daily Limit Reached'}
      </button>
    </div>
  );
}
```

---

## Testing

### Test Counter Updates

1. **Check initial counter:**
```bash
curl http://localhost:3001/api/user/link-counter \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `{"linksCreatedToday":0,"dailyLinkLimit":2,...}`

2. **Create first redirect:**
```bash
curl -X POST http://localhost:3001/api/redirects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test1","human_url":"https://example.com","bot_url":"https://google.com"}'
```

Expected response includes: `"linkCounter":{"linksCreatedToday":1,"dailyLinkLimit":2,"remainingLinks":1}`

3. **Verify counter updated:**
```bash
curl http://localhost:3001/api/user/link-counter \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `{"linksCreatedToday":1,"dailyLinkLimit":2,"remainingLinks":1,"canCreateMore":true}`

4. **Create second redirect:**
```bash
curl -X POST http://localhost:3001/api/redirects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test2","human_url":"https://example.com","bot_url":"https://google.com"}'
```

Expected response includes: `"linkCounter":{"linksCreatedToday":2,"dailyLinkLimit":2,"remainingLinks":0}`

5. **Verify final counter:**
```bash
curl http://localhost:3001/api/user/link-counter \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `{"linksCreatedToday":2,"dailyLinkLimit":2,"remainingLinks":0,"canCreateMore":false}`

---

## API Endpoints Summary

| Endpoint | Method | Purpose | Returns Counter |
|----------|--------|---------|-----------------|
| `POST /api/redirects` | POST | Create redirect | ✅ Yes (in response) |
| `GET /api/auth/me` | GET | Get user info | ✅ Yes (in apiUser.linkCounter) |
| `GET /api/user/link-counter` | GET | Get counter only | ✅ Yes (full object) |

---

## Benefits

✅ **Real-time updates** - Counter updates immediately after creating links  
✅ **Multiple data sources** - Counter available in 3 different endpoints  
✅ **Date normalization** - Handles day changes correctly  
✅ **Remaining links** - Shows how many links user can still create  
✅ **Can create flag** - Boolean flag for easy UI control  
✅ **Backward compatible** - Existing fields still present  

---

## Important Notes

1. **Counter resets daily** - At midnight, `linksCreatedToday` resets to 0
2. **Date validation** - System compares `links_created_date` with today's date
3. **Admin bypass** - Admin users have limit of 999,999 (effectively unlimited)
4. **Atomic updates** - Counter uses database transactions to prevent race conditions

---

## Troubleshooting

### Counter still shows old value
- Ensure frontend is reading from `linkCounter` object, not raw `links_created_today`
- Check that frontend updates state/UI after creating redirect
- Verify API response includes `linkCounter` object

### Counter shows 0/2 when it should show 1/2
- Check server timezone vs database timezone
- Verify `links_created_date` matches today's date format (YYYY-MM-DD)
- Use `/api/debug/link-counter` to see raw database values

### Counter doesn't reset at midnight
- Counter resets when next request is made after midnight
- Not based on cron job, but on date comparison
- First request of new day will show reset counter

---

## Summary

The link counter display issue has been fixed by:
1. ✅ Including counter in redirect creation response
2. ✅ Adding counter to `/api/auth/me` endpoint
3. ✅ Creating dedicated `/api/user/link-counter` endpoint
4. ✅ Proper date normalization and validation

**Frontend must now use the returned counter data to update the display after creating redirects!**

