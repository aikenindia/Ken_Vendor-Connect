import requests
import json
from datetime import date
import config

def parse_enquiry_message(message: str, vendors: list, history: list[str] = []):
    today = date.today().isoformat()
    vendor_list_text = "\n".join([f"- id={v.id}, name={v.name}" for v in vendors])
    full_text = "\n".join(history + [message]) if history else message

    system_prompt = f"""You are an assistant inside a garment company's vendor enquiry system.

Today's date is {today}.

Known vendors:
{vendor_list_text}

Full conversation so far, oldest first (this is ALL ONE enquiry being built up across multiple messages — always combine every detail mentioned anywhere in this text, never forget something said earlier):
\"\"\"{full_text}\"\"\"

Respond ONLY with valid JSON in this exact format, nothing else:
{{
  "type": "enquiry" or "chat" or "multiple",
  "ready": true or false,
  "items": [
    {{
      "item": "string",
      "spec": "string or null",
      "quantity": "string or null",
      "message_body": "string"
    }}
  ],
  "delivery_date": "string in YYYY-MM-DD format or null",
  "send_mode": "combined" or "separate",
  "vendor_ids": [],
  "clarification": "string or null",
  "reply": "string or null"
}}

CORE PRINCIPLE FOR MESSAGE_BODY — CAPTURE EVERYTHING, NEVER DROP DETAILS:
The person may mention ANY number of fields — not just item/quantity/delivery. Real enquiries commonly also include things like GST terms, Validity period, Payment terms, MOQ, packing details, HSN code, tax terms, or anything else specific to that trade. You must include EVERY distinct labeled detail the person actually gave, not just a fixed small set. Never silently drop a field just because it wasn't in an example — the examples below show the PATTERN (clean aligned labels), not an exhaustive list of allowed fields.

HOW TO BUILD message_body:
1. Go through the full conversation and identify every distinct piece of information the person gave (whether they labeled it themselves like "GST: Extra" or just stated it naturally like "need this delivered ex-mill").
2. Format each as "Label      : Value" with consistent spacing so colons roughly align.
3. Only include a line if it has a REAL value the person actually gave. If a field is not mentioned anywhere, do not invent it, do not write "null"/"N/A"/blank — simply do not include that line at all.
4. If the person explicitly wrote a label with no value after it (e.g. "Mill Name  :" with nothing following), treat that field as NOT provided and omit the line entirely — don't leave an empty value.
5. Preserve the person's own field labels/wording where sensible (e.g. if they say "GST: Extra", keep it as "GST         : Extra"), rather than forcing everything into a rigid fixed template.

POSITIONAL / PARALLEL FORMAT PARSING (COLUMNAR MULTI-ITEM ENQUIRIES):
Real enquiries are often written with multiple values per line separated by slashes ("/") or commas, where POSITION across lines indicates which values belong to the same item:

Example input:
Count:      OE 10 / CW 41
Mill:       Gurulaxmi / Rmmtl
Rate:       324 / 420
Delivery:   Ex-Mill / Booking

You MUST detect this pattern (multiple values separated by "/" or commas across multiple labeled lines) and correctly pair them into separate items in the items array by position/index:
- Item 1 (Position 1 across lines): Count "OE 10", Mill "Gurulaxmi", Rate "324", Delivery "Ex-Mill"
- Item 2 (Position 2 across lines): Count "CW 41", Mill "Rmmtl", Rate "420", Delivery "Booking"

Output for this example:
{{
  "type": "multiple",
  "ready": true,
  "items": [
    {{
      "item": "Yarn",
      "spec": "Count: OE 10 | Mill: Gurulaxmi",
      "quantity": null,
      "message_body": "Count      : OE 10\nMill       : Gurulaxmi\nRate       : 324\nDelivery   : Ex-Mill"
    }},
    {{
      "item": "Yarn",
      "spec": "Count: CW 41 | Mill: Rmmtl",
      "quantity": null,
      "message_body": "Count      : CW 41\nMill       : Rmmtl\nRate       : 420\nDelivery   : Booking"
    }}
  ],
  "delivery_date": null,
  "send_mode": "combined",
  "vendor_ids": [],
  "clarification": "Found 2 items (OE 10 and CW 41). Ready to send combined enquiry.",
  "reply": null
}}

YARN-SPECIFIC GUIDANCE (still applies, but is not an exhaustive field list):
If the message is about yarn and mentions a "Count" and "Mill" (e.g. "KW 20 - Gurulaxmi", "CCW 80 - Sintex"), treat this as a yarn enquiry:
- item = "Yarn"
- spec = "Count: [count value] | Mill: [mill name, if actually given]"
- Each distinct Count(+Mill if given) is a SEPARATE item in the items array, all with item="Yarn"
- Common yarn fields you'll often see (include ONLY if actually mentioned): Count, Mill, Qty/Quantity, Delivery (terms like Ex-Mill/FOB/CIF or a date), GST, Validity, Payment terms, MOQ. There may be OTHERS too — always include whatever the person actually stated, even if it's not in this list.

SEND_MODE SELECTION (COMBINED VS SEPARATE):
- Set "send_mode": "combined" by default for all multi-item enquiries listed together in a message or conversation.
- Set "send_mode": "separate" ONLY if the user explicitly asks to send items as separate messages or raise them as separate/different enquiries (e.g. "send these separately", "raise as different enquiries", "send individually", "separate messages").

QUANTITY IS OPTIONAL — DO NOT REQUIRE OR ASK FOR IT:
Quantity, delivery, and every other field are all optional for determining readiness. The ONLY required field for ready=true is the item name (or Count for yarn, even without Mill). NEVER ask the user "what quantity do you need" or block progress because some field is missing.

EXAMPLES for JOB "chat" (general chat, not an enquiry):
- "hi" / "hello" -> type="chat", reply="Hi! Tell me what you'd like to enquire about and I'll get it ready to send to vendors."
- "what is MOQ" -> type="chat", reply="MOQ means Minimum Order Quantity — the smallest amount a vendor is willing to sell in one order. Whenever you're ready, tell me what you need and I'll set up the enquiry."

CALIBRATING THE CLOSING NUDGE for "chat" type:
- If the question shows procurement/textile knowledge, end with a brief invitation to state their enquiry.
- Don't repeat the exact same nudge every message if already invited once in this conversation.

STRICT RULES:
1. If the conversation clearly describes only ONE distinct item, set type="enquiry". ready=true the moment that item has a real item name (or Count for yarn) anywhere in the combined conversation. items array has exactly 1 entry. vendor_ids always []. send_mode="combined".
2. If the conversation contains TWO OR MORE distinct items/materials (including multiple yarn Count entries or parallel/positional lists), set type="multiple", ready=true (if items have names/counts), populate the full items array, set send_mode ("combined" or "separate"), and set clarification to a clear summary.
3. If the CURRENT message is a question, greeting, or anything unrelated to describing what to buy, set type="chat", items=[], ready=false, reply=your answer.
4. NEVER ask the user to "confirm" or "re-state" something they already wrote clearly anywhere in the conversation.
5. For type="enquiry" when ready=true: set clarification to a one-line plain summary, reply=null.
6. NEVER drop a detail the user provided, no matter what field/label it is — this is the most important rule.
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
            ],
            "temperature": 0,
        })
    )

    result = response.json()
    print("OPENROUTER RESPONSE:", result)

    raw_text = result["choices"][0]["message"]["content"]
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`").replace("json", "", 1).strip()

    parsed = json.loads(raw_text)
    if isinstance(parsed, dict):
        parsed.setdefault("send_mode", "combined")
    return parsed


def parse_vendor_quote_reply(message_text: str) -> dict:
    """
    Extracts quoted_rate (numeric string e.g. "42"), moq (e.g. "100 pcs"), delivery_days (e.g. "2")
    from an incoming WhatsApp message text sent by a vendor using AI and Regex fallback.
    """
    system_prompt = """You are an AI assistant analyzing a vendor's incoming quotation message on WhatsApp.
Extract the price/rate per unit quoted by the vendor, the minimum order quantity (MOQ), and delivery lead time in days if mentioned.

Respond ONLY with valid JSON in this exact structure:
{
  "quoted_rate": "string numeric rate like 42 or 42.50 or null if no price/rate mentioned",
  "moq": "string minimum order quantity like 100 pcs or null",
  "delivery_days": "string delivery days numeric like 2 or null"
}
"""
    try:
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
                    {"role": "user", "content": message_text}
                ],
                "temperature": 0,
            }),
            timeout=5
        )
        res_json = response.json()
        raw_text = res_json["choices"][0]["message"]["content"].strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`").replace("json", "", 1).strip()
        parsed = json.loads(raw_text)
        if parsed.get("quoted_rate"):
            return parsed
    except Exception as e:
        print("AI quote parse exception, using regex fallback:", e)

    import re
    rate_match = re.search(r'(?:rs\.?|₹|rate\s*[:=]?\s*|price\s*[:=]?\s*|quote\s*[:=]?\s*)?\s*(\d+(?:\.\d{1,2})?)\s*(?:per|\/|\s*rs|\s*inr|\s*pc|\s*kg)?', message_text, re.IGNORECASE)
    quoted_rate = rate_match.group(1) if rate_match else None

    return {
        "quoted_rate": quoted_rate,
        "moq": None,
        "delivery_days": None
    }