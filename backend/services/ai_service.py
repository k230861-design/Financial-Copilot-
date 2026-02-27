"""AI Service - Handles all LLM interactions via Groq API."""

import json
from openai import AsyncOpenAI
from config import GROQ_API_KEY, LLM_MODEL

# Groq uses OpenAI-compatible API
groq_client = AsyncOpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)


async def classify_transaction(description: str, amount: float) -> dict:
    """Use AI to classify a transaction into category, entity, type, and tags."""
    is_expense = amount < 0
    tx_type = "expense" if is_expense else "income"

    prompt = f"""You are a financial classification AI for small businesses. 
Classify this transaction and extract relevant information.

Transaction:
- Description: "{description}"
- Amount: {amount}
- Type: {tx_type}

EXPENSE categories: Fuel, Tools, Supplies, Rent, Utilities, Salary, Subscription, Marketing, Transport, Repair, Food, Miscellaneous
INCOME categories: Customer Payment, Service Revenue, Product Sales, Refund, Other Income

Return a JSON object with EXACTLY these fields:
{{
  "category": "<category name>",
  "entity_name": "<customer or supplier name extracted from description, empty string if none>",
  "entity_type": "<'customer' if income, 'supplier' if expense, or empty string>",
  "tags": ["<tag1>", "<tag2>"],
  "confidence": <0.0 to 1.0>
}}

Tags can include: Recurring, One-time, Large Expense, High Priority, Operational, Personal

IMPORTANT: Return ONLY the JSON object, no other text."""

    try:
        response = await groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise financial classification AI. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=200,
        )
        
        content = response.choices[0].message.content.strip()
        # Clean up potential markdown wrapping
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        
        result = json.loads(content)
        return {
            "category": result.get("category", "Miscellaneous" if is_expense else "Other Income"),
            "entity_name": result.get("entity_name", ""),
            "entity_type": result.get("entity_type", "supplier" if is_expense else "customer"),
            "tags": result.get("tags", []),
            "confidence": result.get("confidence", 0.5),
        }
    except Exception as e:
        print(f"AI classification error: {e}")
        # Fallback to basic classification
        return {
            "category": "Miscellaneous" if is_expense else "Other Income",
            "entity_name": "",
            "entity_type": "",
            "tags": [],
            "confidence": 0.0,
        }


async def classify_transactions_batch(transactions: list[dict]) -> list[dict]:
    """Classify multiple transactions in a single LLM call for efficiency."""
    if not transactions:
        return []

    # Build batch prompt
    tx_list = "\n".join([
        f"{i+1}. Description: \"{tx['description']}\", Amount: {tx['amount']}"
        for i, tx in enumerate(transactions[:50])  # Limit to 50 per batch
    ])

    prompt = f"""You are a financial classification AI. Classify each transaction below.

Transactions:
{tx_list}

EXPENSE categories (negative amounts): Fuel, Tools, Supplies, Rent, Utilities, Salary, Subscription, Marketing, Transport, Repair, Food, Miscellaneous
INCOME categories (positive amounts): Customer Payment, Service Revenue, Product Sales, Refund, Other Income

For each transaction return:
- category: best matching category
- entity_name: extracted customer/supplier name (empty string if none found)
- entity_type: "customer" for income, "supplier" for expense
- tags: array of applicable tags from [Recurring, One-time, Large Expense, High Priority, Operational, Personal]

Return a JSON array with one object per transaction, in the same order:
[{{"category": "...", "entity_name": "...", "entity_type": "...", "tags": [...]}}]

IMPORTANT: Return ONLY the JSON array, no other text."""

    try:
        response = await groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a precise financial classification AI. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=4000,
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        results = json.loads(content)
        
        # Ensure we have results for each transaction
        classified = []
        for i, tx in enumerate(transactions[:50]):
            is_expense = float(tx["amount"]) < 0
            if i < len(results):
                r = results[i]
                classified.append({
                    "category": r.get("category", "Miscellaneous" if is_expense else "Other Income"),
                    "entity_name": r.get("entity_name", ""),
                    "entity_type": r.get("entity_type", "supplier" if is_expense else "customer"),
                    "tags": r.get("tags", []),
                })
            else:
                classified.append({
                    "category": "Miscellaneous" if is_expense else "Other Income",
                    "entity_name": "",
                    "entity_type": "",
                    "tags": [],
                })
        return classified

    except Exception as e:
        print(f"Batch classification error: {e}")
        # Fallback
        return [
            {
                "category": "Miscellaneous" if float(tx["amount"]) < 0 else "Other Income",
                "entity_name": "",
                "entity_type": "",
                "tags": [],
            }
            for tx in transactions[:50]
        ]


async def generate_insights_ai(financial_data: dict) -> list[dict]:
    """Generate AI-powered business insights from financial data."""
    prompt = f"""You are an AI financial advisor for small businesses. Analyze this financial data and generate actionable insights.

Financial Summary:
- Total Income: {financial_data.get('total_income', 0)}
- Total Expenses: {financial_data.get('total_expenses', 0)}
- Net Profit: {financial_data.get('net_profit', 0)}
- Profit Margin: {financial_data.get('profit_margin', 0):.1f}%
- Expense Ratio: {financial_data.get('expense_ratio', 0):.1f}%

Top Expense Categories: {json.dumps(financial_data.get('top_categories', []))}
Top Customers: {json.dumps(financial_data.get('top_customers', []))}
Monthly Trends: {json.dumps(financial_data.get('monthly_trends', []))}
Recurring Expenses: {json.dumps(financial_data.get('recurring', []))}

Generate 5-8 business insights. Each insight should be:
- Written in plain, non-accounting language
- Actionable and specific
- Relevant to a small business owner

Return a JSON array:
[{{
  "title": "<short title>",
  "text": "<insight text, 1-2 sentences>",
  "type": "<health|risk|warning|opportunity|info>",
  "severity": "<low|medium|high>"
}}]

IMPORTANT: Return ONLY the JSON array."""

    try:
        response = await groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert financial advisor AI. Respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        return json.loads(content)
    except Exception as e:
        print(f"Insight generation error: {e}")
        return []


async def chat_response(
    query: str,
    financial_context: dict,
    chat_history: list[dict] | None = None,
) -> str:
    """Generate a conversational AI response about user's finances."""
    context_str = json.dumps(financial_context, default=str)
    
    system_prompt = f"""You are an AI Financial Co-Pilot — a friendly, intelligent business advisor. 
You help small business owners understand their finances in simple, non-accounting language.

Current Financial Context:
{context_str}

Rules:
- Be concise but helpful (2-4 sentences)
- Use PKR as currency
- Reference specific numbers from the data
- Give actionable advice when appropriate
- Be encouraging but honest about problems
- Never use complex accounting jargon
- Format numbers with commas for readability
- Use bold (**text**) for key numbers"""

    messages = [{"role": "system", "content": system_prompt}]
    
    # Add chat history for context
    if chat_history:
        for msg in chat_history[-6:]:  # Last 6 messages for context
            role = "assistant" if msg.get("role") == "ai" else "user"
            messages.append({"role": role, "content": msg["text"]})
    
    messages.append({"role": "user", "content": query})

    try:
        response = await groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=0.4,
            max_tokens=500,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Chat error: {e}")
        return "I'm having trouble connecting right now. Please try again in a moment."


async def generate_executive_summary(financial_data: dict) -> str:
    """Generate a 2-4 sentence executive summary of the business."""
    prompt = f"""Based on this financial data, write a 2-3 sentence executive summary for a small business owner.
Use plain language, no jargon. Be specific with numbers.

Data: {json.dumps(financial_data, default=str)}

Just write the summary text, nothing else."""

    try:
        response = await groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a concise financial advisor. Write plain-language summaries."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Executive summary error: {e}")
        return "Upload transactions to see your AI-generated business summary."
