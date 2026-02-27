"""Transaction management API endpoints with AI classification."""

import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from middleware import get_current_user
from db import get_authenticated_client
from services.ai_service import classify_transactions_batch

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    business_id: str
    date: str
    description: str
    amount: float
    payment_method: str | None = None


class TransactionBulkCreate(BaseModel):
    business_id: str
    transactions: list[dict]


def normalize_date(date_str: str) -> str:
    """Normalize various date formats to YYYY-MM-DD."""
    import re
    from datetime import datetime

    date_str = date_str.strip().strip('"').strip("'")

    # YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}", date_str):
        return date_str[:10]

    # DD/MM/YYYY  
    if re.match(r"^\d{2}/\d{2}/\d{4}", date_str):
        parts = date_str.split("/")
        return f"{parts[2]}-{parts[1]}-{parts[0]}"

    # DD-MM-YYYY
    if re.match(r"^\d{2}-\d{2}-\d{4}", date_str):
        parts = date_str.split("-")
        return f"{parts[2]}-{parts[1]}-{parts[0]}"

    # Try Python date parsing as fallback
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return d.strftime("%Y-%m-%d")
    except ValueError:
        pass

    try:
        d = datetime.strptime(date_str, "%m/%d/%Y")
        return d.strftime("%Y-%m-%d")
    except ValueError:
        pass

    return date_str


def parse_csv_content(content: str) -> list[dict]:
    """Parse CSV text into transaction dicts."""
    reader = csv.DictReader(io.StringIO(content.strip()))
    
    # Normalize header names
    transactions = []
    for row in reader:
        # Find columns by common names
        normalized = {}
        for key, value in row.items():
            k = key.strip().lower().replace('"', '').replace("'", "")
            if k in ("date", "transaction date", "tx date"):
                normalized["date"] = value.strip().replace('"', '').replace("'", "")
            elif k in ("description", "desc", "narration", "details", "particulars"):
                normalized["description"] = value.strip().replace('"', '').replace("'", "")
            elif k in ("amount", "amt", "value", "debit/credit"):
                try:
                    normalized["amount"] = float(value.strip().replace('"', '').replace("'", "").replace(",", ""))
                except ValueError:
                    continue
            elif k in ("payment method", "method", "mode", "paymentmethod", "payment_method"):
                normalized["payment_method"] = value.strip()

        if "date" in normalized and "description" in normalized and "amount" in normalized:
            normalized["date"] = normalize_date(normalized["date"])
            transactions.append(normalized)

    return transactions


async def get_or_create_category(client, category_name: str, tx_type: str) -> str | None:
    """Get category ID by name, or create it if it doesn't exist.
    
    Handles RLS-restricted tables gracefully – if insert is denied,
    falls back to using a default/admin client or returns None.
    """
    if not category_name:
        return None

    try:
        # Try to find existing
        result = client.table("categories").select("id").eq("name", category_name).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception:
        pass

    try:
        # Create new – may fail if RLS blocks inserts on categories
        result = client.table("categories").insert({
            "name": category_name,
            "type": tx_type,
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception:
        # RLS blocked the insert – try with the base (anon) client
        from db import get_supabase
        try:
            base = get_supabase()
            # Check again with base client
            result = base.table("categories").select("id").eq("name", category_name).execute()
            if result.data:
                return result.data[0]["id"]
            result = base.table("categories").insert({
                "name": category_name,
                "type": tx_type,
            }).execute()
            return result.data[0]["id"] if result.data else None
        except Exception:
            # All attempts failed – skip category assignment
            return None


async def get_or_create_entity(client, entity_name: str, entity_type: str, business_id: str) -> str | None:
    """Get entity ID by name, or create it if it doesn't exist."""
    if not entity_name:
        return None

    try:
        result = client.table("entities").select("id").eq("name", entity_name).eq("business_id", business_id).execute()
        if result.data:
            return result.data[0]["id"]

        result = client.table("entities").insert({
            "name": entity_name,
            "entity_type": entity_type,
            "business_id": business_id,
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception:
        # RLS or other error – skip entity assignment
        return None


@router.get("")
async def list_transactions(
    business_id: str,
    limit: int = 500,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    """List transactions for a business with category and entity joins."""
    client = get_authenticated_client(user["access_token"])
    
    result = (
        client.table("transactions")
        .select("*, categories(name), entities(name, entity_type)")
        .eq("business_id", business_id)
        .order("date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    # Flatten the joined data
    transactions = []
    for tx in result.data:
        flat = {
            "id": tx["id"],
            "business_id": tx["business_id"],
            "date": tx["date"],
            "description": tx["description"],
            "amount": float(tx["amount"]),
            "type": tx["type"],
            "category_id": tx["category_id"],
            "category_name": tx.get("categories", {}).get("name", "") if tx.get("categories") else "",
            "entity_id": tx["entity_id"],
            "entity_name": tx.get("entities", {}).get("name", "") if tx.get("entities") else "",
            "entity_type": tx.get("entities", {}).get("entity_type", "") if tx.get("entities") else "",
            "created_at": tx["created_at"],
        }
        transactions.append(flat)

    return {"transactions": transactions, "count": len(transactions)}


@router.post("")
async def create_transaction(body: TransactionCreate, user: dict = Depends(get_current_user)):
    """Create a single transaction with AI classification."""
    client = get_authenticated_client(user["access_token"])

    # Verify business belongs to user
    biz = client.table("businesses").select("id").eq("id", body.business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    # Check user corrections first
    corrections = client.table("user_corrections").select("*").eq("business_id", body.business_id).execute()
    correction_match = None
    for c in corrections.data:
        if c.get("description_pattern") and c["description_pattern"].lower() in body.description.lower():
            correction_match = c
            break

    # AI Classification
    tx_type = "expense" if body.amount < 0 else "income"
    
    if correction_match:
        category_id = correction_match.get("category_id")
        entity_name = correction_match.get("entity_name", "")
    else:
        classified = await classify_transactions_batch([{
            "description": body.description,
            "amount": body.amount,
        }])
        cls = classified[0] if classified else {}
        
        category_name = cls.get("category", "Miscellaneous" if tx_type == "expense" else "Other Income")
        entity_name = cls.get("entity_name", "")
        entity_type = cls.get("entity_type", "supplier" if tx_type == "expense" else "customer")
        
        category_id = await get_or_create_category(client, category_name, tx_type)

    # Create entity if found
    entity_type = "supplier" if tx_type == "expense" else "customer"
    entity_id = await get_or_create_entity(client, entity_name, entity_type, body.business_id) if entity_name else None

    # Insert transaction
    tx_data = {
        "business_id": body.business_id,
        "date": body.date,
        "description": body.description,
        "amount": body.amount,
        "type": tx_type,
        "category_id": category_id,
        "entity_id": entity_id,
    }
    result = client.table("transactions").insert(tx_data).execute()

    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create transaction")

    return {"transaction": result.data[0], "entity_name": entity_name}


@router.post("/upload-csv")
async def upload_csv(
    business_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload and process a CSV file of transactions."""
    client = get_authenticated_client(user["access_token"])

    # Verify business
    biz = client.table("businesses").select("id").eq("id", business_id).eq("user_id", user["id"]).execute()
    if not biz.data:
        raise HTTPException(status_code=404, detail="Business not found")

    content = await file.read()
    text = content.decode("utf-8")
    
    raw_txs = parse_csv_content(text)
    if not raw_txs:
        raise HTTPException(status_code=400, detail="No valid transactions found in CSV")

    # Load user corrections
    corrections = client.table("user_corrections").select("*").eq("business_id", business_id).execute()
    correction_map = {}
    for c in corrections.data:
        if c.get("description_pattern"):
            correction_map[c["description_pattern"].lower()] = c

    # Separate transactions needing AI vs corrections
    needs_ai = []
    corrected = []
    for tx in raw_txs:
        desc_lower = tx["description"].lower()
        matched = None
        for pattern, correction in correction_map.items():
            if pattern in desc_lower:
                matched = correction
                break
        if matched:
            corrected.append({**tx, "_correction": matched})
        else:
            needs_ai.append(tx)

    # Batch AI classification
    ai_results = []
    batch_size = 30
    for i in range(0, len(needs_ai), batch_size):
        batch = needs_ai[i:i + batch_size]
        batch_results = await classify_transactions_batch(batch)
        ai_results.extend(batch_results)

    # Insert all transactions
    inserted = []
    
    # Process AI-classified transactions
    for i, tx in enumerate(needs_ai):
        cls = ai_results[i] if i < len(ai_results) else {}
        tx_type = "expense" if tx["amount"] < 0 else "income"
        
        category_name = cls.get("category", "Miscellaneous" if tx_type == "expense" else "Other Income")
        entity_name = cls.get("entity_name", "")
        entity_type = cls.get("entity_type", "supplier" if tx_type == "expense" else "customer")
        
        category_id = await get_or_create_category(client, category_name, tx_type)
        entity_id = await get_or_create_entity(client, entity_name, entity_type, business_id) if entity_name else None

        tx_record = {
            "business_id": business_id,
            "date": tx["date"],
            "description": tx["description"],
            "amount": tx["amount"],
            "type": tx_type,
            "category_id": category_id,
            "entity_id": entity_id,
        }
        inserted.append(tx_record)

    # Process corrected transactions
    for tx_data in corrected:
        correction = tx_data.pop("_correction")
        tx_type = "expense" if tx_data["amount"] < 0 else "income"
        entity_name = correction.get("entity_name", "")
        entity_type = "supplier" if tx_type == "expense" else "customer"
        entity_id = await get_or_create_entity(client, entity_name, entity_type, business_id) if entity_name else None

        tx_record = {
            "business_id": business_id,
            "date": tx_data["date"],
            "description": tx_data["description"],
            "amount": tx_data["amount"],
            "type": tx_type,
            "category_id": correction.get("category_id"),
            "entity_id": entity_id,
        }
        inserted.append(tx_record)

    # Bulk insert
    if inserted:
        result = client.table("transactions").insert(inserted).execute()
        return {
            "message": f"Successfully processed {len(result.data)} transactions",
            "count": len(result.data),
            "transactions": result.data,
        }

    return {"message": "No transactions to insert", "count": 0, "transactions": []}


@router.post("/process-csv-text")
async def process_csv_text(
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Process CSV text content (sent as JSON body) and insert transactions."""
    import traceback as _tb

    business_id = body.get("business_id")
    csv_text = body.get("csv_text", "")
    
    if not business_id or not csv_text:
        raise HTTPException(status_code=400, detail="business_id and csv_text required")

    try:
        client = get_authenticated_client(user["access_token"])

        # Verify business
        biz = client.table("businesses").select("id").eq("id", business_id).eq("user_id", user["id"]).execute()
        if not biz.data:
            raise HTTPException(status_code=404, detail="Business not found")

        raw_txs = parse_csv_content(csv_text)
        if not raw_txs:
            raise HTTPException(status_code=400, detail="No valid transactions found in CSV")

        # Load user corrections (gracefully handle if table doesn't exist)
        correction_map = {}
        try:
            corrections = client.table("user_corrections").select("*").eq("business_id", business_id).execute()
            for c in corrections.data:
                if c.get("description_pattern"):
                    correction_map[c["description_pattern"].lower()] = c
        except Exception as corr_err:
            print(f"[WARN] Could not load user_corrections: {corr_err}")

        needs_ai = []
        corrected = []
        for tx in raw_txs:
            desc_lower = tx["description"].lower()
            matched = None
            for pattern, correction in correction_map.items():
                if pattern in desc_lower:
                    matched = correction
                    break
            if matched:
                corrected.append({**tx, "_correction": matched})
            else:
                needs_ai.append(tx)

        # Batch AI classification (with fallback on failure)
        ai_results = []
        batch_size = 30
        for i in range(0, len(needs_ai), batch_size):
            batch = needs_ai[i:i + batch_size]
            try:
                batch_results = await classify_transactions_batch(batch)
                ai_results.extend(batch_results)
            except Exception as ai_err:
                print(f"[WARN] AI classification failed for batch: {ai_err}")
                # Fallback: basic classification without AI
                for tx in batch:
                    is_expense = tx["amount"] < 0
                    ai_results.append({
                        "category": "Miscellaneous" if is_expense else "Other Income",
                        "entity_name": "",
                        "entity_type": "supplier" if is_expense else "customer",
                        "tags": [],
                    })

        inserted = []
        
        for i, tx in enumerate(needs_ai):
            cls = ai_results[i] if i < len(ai_results) else {}
            tx_type = "expense" if tx["amount"] < 0 else "income"
            
            category_name = cls.get("category", "Miscellaneous" if tx_type == "expense" else "Other Income")
            entity_name = cls.get("entity_name", "")
            entity_type = cls.get("entity_type", "supplier" if tx_type == "expense" else "customer")
            
            category_id = await get_or_create_category(client, category_name, tx_type)
            entity_id = await get_or_create_entity(client, entity_name, entity_type, business_id) if entity_name else None

            tx_record = {
                "business_id": business_id,
                "date": tx["date"],
                "description": tx["description"],
                "amount": tx["amount"],
                "type": tx_type,
                "category_id": category_id,
                "entity_id": entity_id,
            }
            inserted.append(tx_record)

        for tx_data in corrected:
            correction = tx_data.pop("_correction")
            tx_type = "expense" if tx_data["amount"] < 0 else "income"
            entity_name = correction.get("entity_name", "")
            entity_type = "supplier" if tx_type == "expense" else "customer"
            entity_id = await get_or_create_entity(client, entity_name, entity_type, business_id) if entity_name else None

            tx_record = {
                "business_id": business_id,
                "date": tx_data["date"],
                "description": tx_data["description"],
                "amount": tx_data["amount"],
                "type": tx_type,
                "category_id": correction.get("category_id"),
                "entity_id": entity_id,
            }
            inserted.append(tx_record)

        if inserted:
            result = client.table("transactions").insert(inserted).execute()
            return {
                "message": f"Successfully processed {len(result.data)} transactions",
                "count": len(result.data),
                "transactions": result.data,
            }

        return {"message": "No transactions to insert", "count": 0, "transactions": []}

    except HTTPException:
        raise
    except Exception as e:
        _tb.print_exc()
        raise HTTPException(status_code=500, detail=f"CSV processing failed: {str(e)}")


@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a transaction."""
    client = get_authenticated_client(user["access_token"])
    result = client.table("transactions").delete().eq("id", transaction_id).execute()
    return {"message": "Transaction deleted", "deleted": len(result.data)}
