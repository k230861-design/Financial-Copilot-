# AI Financial Co-Pilot – MUST Requirements Specification

## Project Goal
Build a lightweight AI-powered financial intelligence system for micro-business owners.

The system should:
- Accept raw transaction data
- Automatically structure business information
- Generate clear financial insights
- Present information in simple, non-accounting language

This is **not accounting software**.  
This is an **AI decision-support tool**.

---

# 1. Core Functional Modules

## 1.1 Transaction Data Ingestion

### Functional Requirements

The system must allow users to input financial transactions via:

#### A. CSV Upload
Supported fields:
- Date
- Description
- Amount

Optional fields:
- Payment Method
- Balance

CSV Example:
Date,Description,Amount  
2026-01-05,Payment from Ali Electric,12000  
2026-01-06,Shell Petrol,-3500  

#### B. Manual Entry Form
Fields:
- Date (required)
- Description (required)
- Amount (required)

### Processing Rules
- Positive amount = Income
- Negative amount = Expense
- Each record must be assigned a unique Transaction ID

---

# 2. Transaction Data Model

Each transaction must contain:

| Field | Type | Description |
|------|------|-------------|
| id | string | Unique ID |
| date | date | Transaction date |
| description | string | Raw text |
| amount | float | Positive or negative |
| type | enum | Income / Expense |
| category | string | AI-generated |
| entity_name | string | Customer or Supplier |
| tags | array | Optional AI tags |

---

# 3. AI Classification Engine

## 3.1 Category Classification

The system must automatically classify transactions into categories such as:

Expense Categories:
- Fuel
- Tools
- Supplies
- Rent
- Utilities
- Salary
- Subscription
- Marketing
- Miscellaneous

Income Categories:
- Customer Payment
- Service Revenue
- Product Sales
- Other Income

### Requirements
- Use description text
- Assign one category per transaction
- Allow fallback category: "Uncategorized"

---

## 3.2 Entity Extraction

The system must extract business entities:

If Income:
- Extract Customer name

If Expense:
- Extract Supplier name

Example:
"Payment from Ali Electric" → Customer: Ali Electric  
"Purchase from Metro Tools" → Supplier: Metro Tools  

If no entity detected → leave blank

---

# 4. Business Entity Layer

The system must aggregate data into:

## 4.1 Customers
For each customer:
- Total revenue
- Number of transactions
- Percentage contribution to total revenue

## 4.2 Suppliers
For each supplier:
- Total spend
- Number of transactions

## 4.3 Expense Categories
For each category:
- Total amount
- Percentage of total expenses

---

# 5. Financial Summary Engine

The system must calculate:

- Total Income
- Total Expenses
- Net Profit (Income - Expenses)
- Number of transactions
- Average daily expense
- Average daily income

Time range:
- Entire dataset
- Current month (if dates available)

---

# 6. AI Insight Generation (Critical Feature)

The system must automatically generate **plain-language insights**.

## Required Insight Types

### 6.1 Business Health
Example:
- "Your total profit this month is PKR 45,000"
- "Expenses represent 62% of your revenue"

---

### 6.2 Expense Trends
- Compare current month vs previous month
Example:
"Fuel expenses increased by 18% compared to last month"

---

### 6.3 Customer Concentration
- Identify top customer
Example:
"Your top customer contributes 42% of total revenue"

---

### 6.4 Expense Distribution
Example:
"Fuel is your largest expense category at 28%"

---

### 6.5 Growth Warning
If:
Expense growth > Income growth

Generate:
"Your expenses are growing faster than your income"

---

Minimum requirement:
Generate at least **5 insights automatically**

---

# 7. Anomaly Detection

The system must detect unusual transactions.

Rules:
- Expense > 2x average expense
- Income significantly larger than normal

Example output:
"Unusual expense detected: PKR 30,000 for Tools"

---

# 8. Cashflow Risk Estimation

Simple forecast based on averages.

Steps:
1. Calculate average daily income
2. Calculate average daily expense
3. Estimate net daily cash change

If negative trend:
Generate insight:
"At the current rate, your cash balance may decrease over the next 30 days"

---

# 9. Dashboard Requirements

## 9.1 Overview Cards
Display:
- Total Income
- Total Expenses
- Net Profit
- Total Transactions

---

## 9.2 Charts

### Required Visualizations
1. Income vs Expense (Monthly line chart)
2. Expense Category Breakdown (Pie or bar chart)
3. Top Customers (Bar chart)

---

## 9.3 Insight Panel

Display:
- List of AI-generated insights
- Highlight warnings or risks

---

# 10. UX Requirements

The interface must:
- Avoid accounting terminology
- Use simple labels:
  - Money In
  - Money Out
  - Profit
  - Where your money goes
- Be minimal and clean
- Focus on insights first, data second

---

# 11. System Behavior

- All calculations must update after CSV upload
- AI classification must run automatically
- Insights must refresh dynamically
- System must work without user configuration

---

# 12. Non-Goals (Do NOT Implement)

- Double-entry accounting
- Tax calculations
- Bank integrations
- Authentication system
- Multi-user SaaS
- Complex financial reporting

---

# 13. Success Criteria

The system is successful if a user can:

1. Upload transactions
2. See structured categories automatically
3. Understand:
   - Where money comes from
   - Where money goes
   - Whether the business is healthy
4. Receive clear AI advice without accounting knowledge