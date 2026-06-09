# TSS Store Dashboard

Store management dashboard for The Souled Store — bulk upload stores and find all pincodes within a radius of any store.

## Quick Start (Local)

### 1. Backend

```bash
cd backend
cp .env.example .env   # already done
npm install
npm run dev            # runs on http://localhost:5001
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Add your Google Maps API key in frontend/.env:
# VITE_GOOGLE_MAPS_KEY=AIza...your_key_here
npm install
npm run dev            # opens http://localhost:5173
```

### 3. Login (Slack OTP + access control)

1. Enter your `@thesouledstore.com` email on the login page
2. **Onboarded users** receive a 6-digit OTP in their Slack DM (from MrSoul)
3. **New users** see an unauthorised message — MrSoul notifies `devansh.saxena@thesouledstore.com` with the OTP to share for first-time onboarding
4. After first successful login, the user is auto-approved and gets OTPs directly on Slack next time

Configure `SLACK_BOT_TOKEN` in `backend/.env` (see `.env.example`). The Slack app needs `users:read.email`, `chat:write`, and `im:write` scopes.

**Store admin:** only `devansh.saxena@thesouledstore.com` can add, edit, delete, or bulk-upload stores.

---

## Features

### Pincode Finder (Dashboard)
1. Select any store from the dropdown
2. Choose a range: 5 / 10 / 12 / 15 / 20 km
3. Click **Find Pincodes** → fetches all 6-digit pincodes within that radius via OpenStreetMap
4. View results as chips + table with distance, area, city, state
5. **Copy All** (comma-separated) or **Export CSV**

### Store Manager
- **Bulk upload** any JSON file in the same format as `tss.json` (drag & drop or file picker)
- **Add single store** via form (store name, lat/lon, address, hours, etc.)
- Search/filter stores
- Delete stores with confirmation

---

## Google Maps API Key

Get one from [Google Cloud Console](https://console.cloud.google.com/) — enable the **Maps JavaScript API**.
Add to `frontend/.env`:
```
VITE_GOOGLE_MAPS_KEY=AIza...
```

The map shows the store location with a radius circle. The pincode search itself is free (OpenStreetMap) — no extra API quota needed.

---

## Deploy

### Backend → Railway
1. Push `backend/` to a GitHub repo
2. Create a new Railway project → connect repo
3. Set env vars: `JWT_SECRET`, `FRONTEND_URL` (your Vercel URL)
4. Railway auto-detects `Procfile` and runs `node index.js`

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. Import in Vercel → Framework: Vite
3. Set env vars: `VITE_API_URL` (**must be `https://`** e.g. `https://your-app.up.railway.app/api`), `VITE_GOOGLE_MAPS_KEY`

---

## Data Format

The bulk upload accepts the exact same JSON format as the API response:

```json
[
  {
    "id": 3,
    "store_name": "Bandra, Mumbai",
    "latitude": "19.063825998028424",
    "longitude": "72.83585941845854",
    "address": "...",
    "city_name": "MUMBAI",
    "state_name": "Maharashtra",
    "pincode": "400050",
    ...
  }
]
```

Existing store IDs are updated, new IDs are inserted.
