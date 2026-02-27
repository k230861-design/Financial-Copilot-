# AI Financial Co-Pilot – Complete System Architecture

## Tech Stack

Frontend:
- React
- Chart.js
- Axios
- Supabase JS SDK

Backend:
- FastAPI (Python)
- Background Tasks / Celery (optional)

AI Layer:
- OpenAI API OR Local LLM (Ollama / vLLM)

Database & Auth:
- Supabase (PostgreSQL)
- Supabase Auth
- Google OAuth via Supabase

Storage:
- Supabase Storage (CSV uploads)

---

# 1. High-Level Architecture
React Frontend
|
| HTTPS + JWT
v
FastAPI Backend
|
| SQL
v
Supabase PostgreSQL

AI Calls:
FastAPI → OpenAI / Local LLM

File Storage:
React → Supabase Storage


---

# 2. Core System Components

## 2.1 Frontend (React)

Modules:

1. Authentication
2. Dashboard
3. CSV Upload
4. Transactions View
5. Insights Panel
6. Chat Interface (optional)
7. Settings

Charts (Chart.js):
- Income vs Expense
- Expense Categories
- Monthly Trend
- Top Customers

---

## 2.2 Backend (FastAPI)

Modules:
app/
├── main.py
├── api/
│ ├── auth.py
│ ├── transactions.py
│ ├── insights.py
│ ├── analytics.py
│ ├── chat.py
├── services/
│ ├── ai_service.py
│ ├── classification_service.py
│ ├── insight_service.py
│ ├── analytics_service.py
│ ├── forecast_service.py
├── db/
│ ├── supabase_client.py
│ ├── repositories/
├── models/
├── background/


---

# 3. Authentication Architecture

## 3.1 Auth Provider

Use **Supabase Auth**

Supports:
- Email/Password
- Google OAuth

---

## 3.2 Google Login Flow

1. User clicks "Login with Google"
2. React calls:supabase.auth.signInWithOAuth({
provider: 'google'
})

3. User authenticates via Google
4. Supabase returns:
   - Access Token (JWT)
   - User info

5. React stores session

---

## 3.3 Backend Authorization

All API requests include:Authorization: Bearer <JWT>


FastAPI:
- Verifies token using Supabase public key
- Extracts user_id
- All queries filtered by user_id

---

# 4. Database Architecture (Supabase)

## 4.1 Core Tables

### users (managed by Supabase Auth)

---

### businesses

- id
- user_id
- name
- created_at

---

### transactions

- id
- business_id
- date
- description
- amount
- type (income/expense)
- category_id
- entity_id
- created_at

---

### categories

- id
- name
- type

---

### entities

- id
- name
- entity_type (customer/supplier)

---

### insights

- id
- business_id
- text
- type (health/risk/opportunity)
- severity
- created_at

---

### user_corrections

- description_pattern
- category_id
- entity_name

---

# 5. Data Flow – CSV Upload

## Step 1: Upload

React:
→ Upload CSV to Supabase Storage  
→ Send file URL to FastAPI

---

## Step 2: Backend Processing

FastAPI:

For each row:

1. Parse transaction
2. Determine type (amount)
3. Check user_corrections
4. If not found → AI classification
5. Get:
   - category
   - entity
   - tags
6. Insert into transactions

---

## Step 3: Post-Processing

After batch insert:

Run:
- Analytics calculation
- Insight generation
- Recurring detection
- Anomaly detection
- Cashflow forecast

Save insights to DB

---

# 6. AI Layer Architecture

## 6.1 AI Service

Supports:
- OpenAI
- Local LLM

Interface:
class AIService:
classify_transaction()
generate_insights()
chat_response()


---

## 6.2 Transaction Classification Flow

Input:
- description
- amount

Output:{
category: "Fuel",
entity: "Shell",
type: "Expense",
tags: ["Recurring"]
}


---

## 6.3 Insight Generation Flow

Inputs:
- totals
- category breakdown
- customer stats
- trends
- anomalies

LLM returns:
- 5–10 insights

Stored in DB.

---

# 7. Analytics Engine

Calculated via SQL or Python:

## Metrics

- Total income
- Total expense
- Profit
- Monthly trends
- Category totals
- Top customers
- Supplier totals
- Customer concentration
- Recurring totals

---

# 8. Forecast Engine

Basic method:
    avg_income_per_day
avg_expense_per_day
net_daily = income - expense
forecast_30_days = net_daily * 30


If negative → risk insight.

---

# 9. Anomaly Detection

Rules:

- Transaction > 2x average
- Category spike
- Duplicate transactions

---

# 10. Recurring Detection

Criteria:
- Same description
- Similar amount
- Appears monthly

Save to recurring_patterns table.

---

# 11. Dashboard Data Flow

React → GET /analytics

Response:

{
summary: {...},
monthly_trend: [...],
category_breakdown: [...],
top_customers: [...],
insights: [...]
}

Charts render via Chart.js.

---

# 12. Conversational AI (Optional)

Flow:

React Chat → FastAPI /chat  
FastAPI:
- Retrieve business data
- Build context
- Send to LLM
- Return answer

---

# 13. Background Processing (Recommended)

Use:
- FastAPI BackgroundTasks
OR
- Celery + Redis

For:
- CSV processing
- Insight generation
- AI batch calls

---

# 14. Security Architecture

- Supabase Auth JWT validation
- Row-level security (RLS)
- Each table filtered by user_id
- HTTPS only
- No API keys in frontend

---

# 15. Feature Mapping to Architecture

Feature | Component
---|---
Google Login | Supabase Auth
CSV Upload | Supabase Storage + FastAPI
AI Categorization | AI Service
Entities | Entities table
Insights | Insight Service
Cashflow Forecast | Forecast Service
Anomaly Detection | Analytics Service
Recurring Detection | Pattern Service
Dashboard Charts | React + Chart.js
Chat CFO | Chat API

---

# 16. Full System Flow

User Login  
→ Create Business  
→ Upload CSV  
→ Backend Processing  
→ AI Classification  
→ Store Data  
→ Run Analytics  
→ Generate Insights  
→ Dashboard Updates  
→ User Views Insights / Asks Questions

---

# 17. Scalability Design

Future improvements:

- Async AI workers
- Caching classification
- Vector DB for semantic search
- Multi-business support
- Mobile app

---

# 18. System Success Criteria

System is successful if:

- User logs in via Google
- Uploads CSV
- Transactions auto-classified
- Dashboard shows:
  - Profit
  - Trends
  - Categories
  - Top customers
  - AI insights
- System generates proactive financial advice