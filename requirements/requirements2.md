# AI Financial Co-Pilot – SHOULD Requirements Specification

## Purpose

This document defines **SHOULD-level features** for the AI Financial Co-Pilot.

These features are not mandatory for a basic MVP but should be implemented if time and resources allow.

They enhance:
- Intelligence
- Proactiveness
- Decision support
- Product differentiation

---

# 1. Advanced AI Insight Layer

## 1.1 Insight Summary Card (Executive Overview)

### Functional Requirements

The system should generate a **single high-level business summary** after data processing.

The summary must:
- Be written in plain language
- Be 2–4 sentences long
- Describe overall business condition

### Example Outputs

- "Your business is profitable, but expenses have increased faster than revenue this month."
- "Revenue is stable, but you are highly dependent on one customer."
- "Costs are under control and your profit margin is improving."

This summary should appear at the top of the dashboard.

---

# 2. Recurring Transaction Detection

## 2.1 Pattern Identification

The system should detect recurring transactions based on:

Criteria:
- Same description (or similar text)
- Similar amount (+/- 5–10%)
- Repeating at regular intervals (monthly or weekly)

Examples:
- Rent
- Salaries
- Subscriptions
- Internet/Utilities

---

## 2.2 Recurring Expense Summary

For detected recurring transactions, the system should calculate:

- Number of recurring expenses
- Total recurring monthly cost

### Insight Example

"You have 6 recurring expenses totaling PKR 42,000 per month."

---

# 3. Top Customer Analysis

## 3.1 Customer Ranking

The system should:

- Rank customers by total revenue
- Identify top 3 customers
- Calculate percentage contribution

---

## 3.2 Customer Concentration Risk

If top customer revenue share > 40%:

Generate insight:

"Your top customer contributes 52% of revenue. This may pose a dependency risk."

---

# 4. Supplier Cost Trend Analysis

## 4.1 Supplier Spend Tracking

For each supplier:
- Total spend
- Monthly spend trend

---

## 4.2 Cost Increase Detection

If supplier cost increases by more than 20% compared to previous period:

Generate insight:

"Spending with Supplier ABC increased by 27% compared to last month."

---

# 5. Category Trend Monitoring

## 5.1 Monthly Category Comparison

For each expense category:

Calculate:
- Current month total
- Previous month total
- Percentage change

---

## 5.2 Trend Insights

Examples:

- "Fuel expenses increased by 18% this month."
- "Marketing costs decreased by 12%."

---

# 6. Enhanced Anomaly Detection

## 6.1 Category-Based Anomalies

Detect if:
- Category spending exceeds historical average by 2x

Example:

"Unusual spike detected in Tools expenses this month."

---

## 6.2 Duplicate Transaction Detection

The system should flag potential duplicates when:
- Same amount
- Same description
- Same date

Insight:

"Possible duplicate payment detected for PKR 5,000."

---

# 7. Cashflow Forecast (Enhanced)

## 7.1 Short-Term Forecast

The system should estimate:

- Expected income next 30 days
- Expected expenses next 30 days
- Net projected cash change

---

## 7.2 Risk Detection

If projected cashflow is negative:

Generate insight:

"At the current rate, your cash balance may decrease by PKR 18,000 over the next 30 days."

---

# 8. Insight Prioritization

## 8.1 Insight Severity Levels

Each insight should have a priority:

- Info
- Warning
- Risk
- Opportunity

Example:

Risk:
"Expenses are growing faster than revenue."

Opportunity:
"You could reduce costs by reviewing recurring subscriptions."

---

## 8.2 Dashboard Behavior

- High-risk insights should appear at the top
- Warnings should be visually highlighted

---

# 9. Time-Based Filtering

## 9.1 Period Selection

The dashboard should allow filtering by:

- Last 7 days
- Last 30 days
- Current month
- Last 3 months
- Custom date range

All calculations and insights must update based on the selected period.

---

# 10. Insight History

## 10.1 Tracking Changes Over Time

The system should maintain a history of key insights such as:

- Profit trend
- Expense growth
- Revenue growth

Example:

"Profit has increased for 3 consecutive months."

---

# 11. Auto Tagging (AI-Based)

## 11.1 Tag Types

The system should automatically assign tags such as:

- Recurring
- One-time
- Large Expense
- High Priority
- Operational
- Personal

---

## 11.2 Tag Usage

Tags should:
- Be visible in transaction details
- Be usable for filtering

---

# 12. Insight Personalization (Basic)

## 12.1 Learning from Corrections

If a user changes:
- Category
- Entity name

The system should:
- Remember the correction
- Apply it to similar future transactions

---

# 13. Dashboard Enhancements

## 13.1 Top Panels

The dashboard should include:

- Top Customers widget
- Top Expense Categories
- Recurring Cost Summary
- Cashflow Forecast summary

---

# 14. Performance Requirements

- CSV processing should handle at least 5,000 transactions
- Insight generation should complete within a few seconds
- Dashboard updates should be near real-time after data upload

---

# 15. Success Criteria

The SHOULD features are considered successful if:

- The system identifies patterns automatically
- Users receive proactive insights without manual analysis
- The dashboard highlights risks and opportunities
- The system feels like an intelligent financial assistant, not just a reporting tool