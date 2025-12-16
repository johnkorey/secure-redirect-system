# Visitor Tracking Improvements

## Overview
The visitor tracking system has been upgraded to store up to 7 days of records and allow users to view data for either **24 hours** or **7 days** based on a dropdown selection.

---

## Changes Made

### 1. Database Layer (`backend/lib/postgresDatabase.js`)

Added three new methods to the `visitorLogs` object:

#### `getByTimePeriod(hours)`
- Retrieves all visitor logs within a specified time period
- **Parameters**: `hours` (default: 24)
- **Returns**: Array of visitor logs sorted by created_date DESC

#### `getByUserAndTimePeriod(userId, hours)`
- Retrieves visitor logs for a specific user within a time period
- **Parameters**: 
  - `userId`: The user's ID
  - `hours`: Time period in hours (default: 24)
- **Returns**: Array of user's visitor logs sorted by created_date DESC

#### `cleanupOldRecords(daysToKeep)`
- Deletes visitor logs older than specified days
- **Parameters**: `daysToKeep` (default: 7)
- **Returns**: Number of deleted records
- **Purpose**: Automatically removes old data to keep database lean

---

### 2. API Endpoints (`backend/server.js`)

#### Updated: `GET /api/visitors`
**New Query Parameter**: `timeRange`
- `24h` - Shows last 24 hours (default)
- `7d` - Shows last 7 days

**Example Usage**:
```bash
GET /api/visitors?timeRange=24h&limit=100
GET /api/visitors?timeRange=7d&limit=500
```

#### Updated: `GET /api/user/metrics`
**New Query Parameter**: `timeRange`
- `24h` - Metrics for last 24 hours (default)
- `7d` - Metrics for last 7 days

**Example Usage**:
```bash
GET /api/user/metrics?timeRange=24h
GET /api/user/metrics?timeRange=7d
```

**Response**:
```json
{
  "total": 1250,
  "humans": 980,
  "bots": 270,
  "accuracy": 78
}
```

#### Updated: `GET /api/user/trends`
**New Query Parameter**: `timeRange`
- `24h` - Hourly data for last 24 hours (default)
- `7d` - Daily data for last 7 days

**Example Usage**:
```bash
GET /api/user/trends?timeRange=24h
GET /api/user/trends?timeRange=7d
```

**Response for 24h**:
```json
[
  {
    "hour": 14,
    "timestamp": "2025-12-16T14:00:00.000Z",
    "humans": 45,
    "bots": 12,
    "total": 57
  },
  ...
]
```

**Response for 7d**:
```json
[
  {
    "day": "Mon, Dec 10",
    "timestamp": "2025-12-10T00:00:00.000Z",
    "humans": 320,
    "bots": 85,
    "total": 405
  },
  ...
]
```

#### Updated: `GET /api/user/recent-activity`
**New Query Parameter**: `timeRange`
- `24h` - Activity from last 24 hours (default)
- `7d` - Activity from last 7 days

**Example Usage**:
```bash
GET /api/user/recent-activity?timeRange=24h&limit=50&visitorType=HUMAN
GET /api/user/recent-activity?timeRange=7d&limit=100
```

---

### 3. Automatic Cleanup System

#### Daily Cleanup Cron Job
- **Runs**: Every day at 3:00 AM
- **Action**: Deletes visitor logs older than 7 days
- **Purpose**: Keeps database size manageable and maintains performance
- **Logging**: Outputs number of records deleted

**Console Output**:
```
[CLEANUP] Next automatic cleanup scheduled for: 12/17/2025, 3:00:00 AM
[CLEANUP] Starting automatic visitor logs cleanup...
[CLEANUP] Removed 1,234 visitor logs older than 7 days
```

---

## Frontend Integration Guide

### Dropdown Implementation

To integrate the time range selector in your frontend:

```javascript
// Example React component
const [timeRange, setTimeRange] = useState('24h');

// Dropdown
<select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
  <option value="24h">Last 24 Hours</option>
  <option value="7d">Last 7 Days</option>
</select>

// API calls with timeRange
const fetchVisitors = async () => {
  const response = await fetch(
    `/api/visitors?timeRange=${timeRange}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  return data;
};

const fetchMetrics = async () => {
  const response = await fetch(
    `/api/user/metrics?timeRange=${timeRange}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  return data;
};

const fetchTrends = async () => {
  const response = await fetch(
    `/api/user/trends?timeRange=${timeRange}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  return data;
};
```

---

## Benefits

### 1. **Data Retention**
- Stores up to 7 days of visitor data
- Automatic cleanup prevents database bloat
- Maintains optimal performance

### 2. **Flexible Viewing**
- Users can switch between 24-hour and 7-day views
- Better insights into traffic patterns
- Hourly granularity for 24h, daily granularity for 7d

### 3. **Performance**
- Database queries are optimized with time-based filtering
- Reduced data transfer with targeted queries
- Automatic cleanup keeps database lean

### 4. **User Control**
- Simple dropdown to switch between views
- No complex date pickers needed
- Consistent across all analytics endpoints

---

## Testing

### Test the API endpoints:

```bash
# Test 24-hour view
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3001/api/visitors?timeRange=24h"

# Test 7-day view
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3001/api/visitors?timeRange=7d"

# Test metrics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3001/api/user/metrics?timeRange=7d"

# Test trends
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3001/api/user/trends?timeRange=7d"
```

---

## Migration Notes

### Backward Compatibility
- All endpoints maintain backward compatibility
- If `timeRange` is not specified, defaults to `24h`
- Existing frontend code will continue to work without changes

### Database
- No database schema changes required
- Uses existing `created_date` column for filtering
- Cleanup job runs automatically on server start

---

## Monitoring

The cleanup job logs its activity:
- Scheduled time is logged on server start
- Execution logs show number of records deleted
- Errors are caught and logged without crashing the server

Check server logs for:
```
[CLEANUP] Next automatic cleanup scheduled for: ...
[CLEANUP] Starting automatic visitor logs cleanup...
[CLEANUP] Removed X visitor logs older than 7 days
```

---

## Summary

✅ **7-day data retention** with automatic cleanup  
✅ **24h or 7d views** controlled by dropdown  
✅ **Optimized database queries** for better performance  
✅ **Backward compatible** with existing code  
✅ **Daily automatic cleanup** at 3 AM  
✅ **All analytics endpoints updated** (visitors, metrics, trends, recent-activity)

