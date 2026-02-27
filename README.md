# AI Financial Co-Pilot 🤖

AI-powered financial intelligence dashboard for micro-business owners. Upload your transactions — the AI auto-categorizes, forecasts cashflow, and delivers actionable insights.

## Tech Stack

| Layer    | Tech                          | Hosting   |
|----------|-------------------------------|-----------|
| Frontend | Vite + Vanilla JS + Chart.js  | Vercel    |
| Backend  | FastAPI + Python 3.13         | Railway   |
| Database | PostgreSQL + Auth             | Supabase  |
| AI/LLM   | Groq API (gpt-oss-120b)      | —         |

## Project Structure

```
financialCopilot/
├── frontend/          # Vite static site
│   ├── index.html     # App entry point
│   ├── public/static/ # JS, CSS assets
│   ├── vercel.json    # Vercel deployment config
│   └── vite.config.ts
├── backend/           # FastAPI REST API
│   ├── main.py        # App entry + CORS
│   ├── config.py      # Environment config
│   ├── api/           # Route handlers
│   ├── services/      # AI, analytics, business logic
│   ├── db/            # Supabase database layer
│   ├── middleware/     # JWT auth middleware
│   ├── Procfile       # Railway start command
│   └── railway.json   # Railway config
├── database/          # DB schema documentation
└── requirements/      # Project requirements docs
```

## Local Development

### Prerequisites
- Python 3.13+
- Node.js 18+
- Supabase project (free tier)
- Groq API key

### Backend
```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/activate   # Windows
# source ../.venv/bin/activate  # Mac/Linux

pip install -r requirements.txt
cp .env.example .env          # Fill in your keys
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # → http://localhost:5173
```

## Deployment

### 1. Supabase (Database — already set up)
Your Supabase project is ready. Note down:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. Railway (Backend)
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select this repo and set **Root Directory** to `backend`
4. Add these **Environment Variables** in Railway dashboard:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GROQ_API_KEY=your-groq-api-key
   LLM_MODEL=openai/gpt-oss-120b
   FRONTEND_URL=https://your-app.vercel.app
   ```
5. Railway auto-detects `Procfile` and deploys. Copy your Railway URL (e.g. `https://xxx.up.railway.app`).

### 3. Vercel (Frontend)
1. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import from GitHub
2. Set **Root Directory** to `frontend`
3. Framework Preset: **Other**
4. Build settings are auto-detected from `vercel.json`
5. Deploy!

### 4. Connect Frontend ↔ Backend
After both are deployed:
1. Edit `frontend/public/static/api.js` — replace `YOUR_RAILWAY_URL` with your actual Railway domain:
   ```javascript
   const API_BASE = window.location.hostname === 'localhost'
     ? 'http://localhost:8000'
     : 'https://your-actual-app.up.railway.app';
   ```
2. Update the Railway env var `FRONTEND_URL` to your Vercel domain
3. Redeploy both

### 5. Supabase Auth — Google OAuth (optional)
1. In Supabase Dashboard → Authentication → Providers → Google
2. Add your Vercel domain to the **Redirect URLs**:
   ```
   https://your-app.vercel.app
   ```

## Features
- 📊 Smart Dashboard with real-time stats
- 🤖 AI-powered transaction classification
- 🔮 Cashflow forecasting
- 💬 AI CFO chat assistant
- 💡 Auto-generated business insights
- 🎯 Goals & scenario planning
- 📤 CSV upload + manual entry
