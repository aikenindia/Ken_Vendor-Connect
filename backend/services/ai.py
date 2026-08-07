import requests
import json
from datetime import date
import config

def parse_enquiry_message(message: str, vendors: list):
    today = date.today().isoformat()
    vendor_list_text = "\n".join([f"- id={v.id}, name={v.name}" for v in vendors])

    system_prompt = f"""You are an assistant inside a garment company's vendor enquiry system.
The purchase team will type a message describing an enquiry in their own words, possibly with typos or incomplete grammar.

Today's date is {today}. If the person mentions a date without a year (e.g. "20 aug"), assume the nearest upcoming occurrence of that date from today, not a past year.

Known vendors in the system:
{vendor_list_text}

Extract the enquiry details and respond ONLY with valid JSON, no other text, in this exact format:
{{
  "ready": true or false,
  "item": "string or null",
  "spec": "string or null",
  "quantity": "string or null",
  "delivery_date": "string in YYYY-MM-DD format or null",
  "vendor_ids": [list of integers, matched from the known vendors above by name],
  "clarification": "a short, polite message asking for missing/unclear info, or a corrected clean version of their enquiry to confirm, or null if everything is clear"
}}

Rules:
- Set "ready" to true only if item, quantity, and at least one vendor_id are all present and clear.
- If the person's sentence has spelling or grammar issues but the meaning is clear, silently correct it in your understanding, don't reject it for that reason alone.
- If vendor names don't match any known vendor, ask them to clarify which vendor from the list.
- If something important is missing (item, quantity, or vendor), set ready to false and ask for exactly that in "clarification".
- If everything is ready, still include a short one-line "clarification" that summarizes what you understood, so they can confirm before it's sent.
"""

    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        },
        data=json.dumps({
            "model": config.AI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ]
        })
    )

    result = response.json()
    print("OPENROUTER RESPONSE:", result)

    raw_text = result["choices"][0]["message"]["content"]
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`").replace("json", "", 1).strip()

    return json.loads(raw_text)