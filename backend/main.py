from fastapi import FastAPI, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import engine, get_db, Base
from services import sender
import models
import config

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- HOME ----------
@app.get("/")
def home():
    return {"status": "KENConnect backend is running"}


# ---------- USERS / AUTH ----------
class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    role: str
    requester_role: str

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    user_id: int
    current_password: str
    new_password: str

@app.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if payload.requester_role not in ["head", "vp", "owner"]:
        return {"error": "Only management can create user accounts."}
    new_user = models.User(
        name=payload.name,
        username=payload.username,
        password=payload.password,
        role=payload.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "name": new_user.name, "role": new_user.role}

@app.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return [{"id": u.id, "name": u.name, "role": u.role} for u in users]

@app.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.username == payload.username,
        models.User.password == payload.password
    ).first()
    if not user:
        return {"error": "Invalid username or password"}
    return {"id": user.id, "name": user.name, "role": user.role}

@app.post("/users/change-password")
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        return {"error": "User not found"}
    if user.password != payload.current_password:
        return {"error": "Current password is incorrect"}
    user.password = payload.new_password
    db.commit()
    return {"status": "Password updated successfully"}


# ---------- VENDORS ----------
class VendorCreate(BaseModel):
    name: str
    whatsapp_number: str
    email: str | None = None
    category: str | None = None
    assigned_to: int | None = None

@app.get("/vendors")
def list_vendors(user_id: int | None = None, role: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Vendor)
    if role == "purchase_user" and user_id:
        query = query.filter(or_(models.Vendor.assigned_to == user_id, models.Vendor.assigned_to == None))
    return query.all()

@app.post("/vendors")
def add_vendor(vendor: VendorCreate, db: Session = Depends(get_db)):
    new_vendor = models.Vendor(**vendor.dict())
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    return new_vendor

class VendorUpdate(BaseModel):
    name: str | None = None
    whatsapp_number: str | None = None
    email: str | None = None
    category: str | None = None

@app.patch("/vendors/{vendor_id}")
@app.put("/vendors/{vendor_id}")
def update_vendor(vendor_id: int, payload: VendorUpdate, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not vendor:
        return {"error": "Vendor not found"}
    if payload.email is not None:
        vendor.email = payload.email
    if payload.name is not None:
        vendor.name = payload.name
    if payload.whatsapp_number is not None:
        vendor.whatsapp_number = payload.whatsapp_number
    if payload.category is not None:
        vendor.category = payload.category
    db.commit()
    db.refresh(vendor)
    return vendor

@app.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not vendor:
        return {"error": "Vendor not found"}

    db.query(models.Message).filter(models.Message.vendor_id == vendor_id).delete()
    db.query(models.EnquiryVendor).filter(models.EnquiryVendor.vendor_id == vendor_id).delete()

    db.delete(vendor)
    db.commit()
    return {"status": "Vendor deleted", "vendor_id": vendor_id}


# ---------- MESSAGE FORMATTING HELPERS ----------
def clean_message_body(message_body: str) -> str:
    bad_endings = [": null", ":null", ": None", ":None", ": N/A", ":N/A", ": -", ":-"]
    clean_lines = []
    for line in message_body.split("\n"):
        stripped = line.strip()
        if stripped and any(stripped.endswith(bad) for bad in bad_endings):
            continue
        clean_lines.append(line)
    return "\n".join(clean_lines)

def build_whatsapp_message(sender_name: str, message_body: str) -> str:
    return (
        f"Hi, this is {sender_name} from KEN India Group.\n\n"
        f"{message_body}\n\n"
        f"Kindly share your best price and delivery. Thank you."
    )

def build_email_message(sender_name: str, message_body: str) -> str:
    return (
        f"Dear Sir/Madam,\n\n"
        f"This is {sender_name} from KEN India Group.\n\n"
        f"We would like to enquire about the following:\n\n"
        f"{message_body}\n\n"
        f"Kindly share your best price and earliest delivery for the above.\n\n"
        f"Regards,\n{sender_name}\nKEN India Group"
    )


# ---------- ENQUIRIES ----------
class ItemData(BaseModel):
    item: str
    spec: str | None = None
    quantity: str | None = None
    message_body: str | None = None
    vendor_ids: list[int] | None = None

class EnquiryCreate(BaseModel):
    item: str | None = None
    spec: str | None = None
    quantity: str | None = None
    delivery_date: str | None = None
    vendor_ids: list[int] = []
    sender_name: str | None = None
    message_body: str | None = None
    items: list[ItemData] | None = None
    send_mode: str | None = "combined"

@app.post("/enquiries")
def create_enquiry(payload: EnquiryCreate, db: Session = Depends(get_db)):
    send_mode = (payload.send_mode or "combined").lower()
    sender_name = payload.sender_name or "the Purchase Team"

    if payload.items and len(payload.items) > 0:
        raw_items = payload.items
    else:
        raw_items = [
            ItemData(
                item=payload.item or "Enquiry",
                spec=payload.spec,
                quantity=payload.quantity,
                message_body=payload.message_body,
                vendor_ids=payload.vendor_ids
            )
        ]

    created_enquiries = []
    for it in raw_items:
        enq = models.Enquiry(
            item=it.item,
            spec=it.spec,
            quantity=it.quantity or "Not specified",
            delivery_date=payload.delivery_date
        )
        db.add(enq)
        db.flush()
        created_enquiries.append((enq, it))

    def format_item_body(it: ItemData) -> str:
        if it.message_body:
            return clean_message_body(it.message_body)
        body_lines = [f"Item       : {it.item}"]
        if it.spec:
            body_lines.append(f"Spec       : {it.spec}")
        if it.quantity:
            body_lines.append(f"Quantity   : {it.quantity}")
        if payload.delivery_date:
            body_lines.append(f"Delivery   : {payload.delivery_date}")
        return "\n".join(body_lines)

    results = []

    if send_mode == "combined":
        all_vendor_ids = list(payload.vendor_ids)
        for it in raw_items:
            if it.vendor_ids:
                for vid in it.vendor_ids:
                    if vid not in all_vendor_ids:
                        all_vendor_ids.append(vid)

        for vid in all_vendor_ids:
            vendor = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
            if not vendor:
                continue

            vendor_items = [
                (enq, it) for (enq, it) in created_enquiries
                if not it.vendor_ids or vid in it.vendor_ids or vid in payload.vendor_ids
            ]
            if not vendor_items:
                continue

            formatted_blocks = []
            for idx, (enq, it) in enumerate(vendor_items, 1):
                item_body = format_item_body(it)
                if len(vendor_items) > 1:
                    formatted_blocks.append(f"--- Item {idx} ---\n{item_body}")
                else:
                    formatted_blocks.append(item_body)

            combined_body = "\n\n".join(formatted_blocks)
            whatsapp_message = build_whatsapp_message(sender_name, combined_body)
            email_message = build_email_message(sender_name, combined_body)

            whatsapp_link = sender.get_whatsapp_link(vendor.whatsapp_number, whatsapp_message)
            wa_api_result = sender.send_whatsapp_direct(vendor.whatsapp_number, whatsapp_message)

            email_sent = False
            if vendor.email:
                subject_item = vendor_items[0][1].item if len(vendor_items) == 1 else "Multi-Item Enquiry"
                email_sent = sender.send_email(vendor.email, f"Enquiry - {subject_item}", email_message)

            for enq, _ in vendor_items:
                ev = models.EnquiryVendor(enquiry_id=enq.id, vendor_id=vid, status="sent")
                db.add(ev)

            msg = models.Message(
                vendor_id=vid,
                sender="user",
                text=whatsapp_message,
                is_read=1,
            )
            db.add(msg)

            results.append({
                "vendor": vendor.name,
                "whatsapp_link": whatsapp_link,
                "whatsapp_api_sent": wa_api_result.get("success", False),
                "whatsapp_api_error": wa_api_result.get("error"),
                "email_sent": email_sent
            })

    else:
        for enq, it in created_enquiries:
            target_vids = it.vendor_ids if (it.vendor_ids and len(it.vendor_ids) > 0) else payload.vendor_ids
            item_body = format_item_body(it)
            whatsapp_message = build_whatsapp_message(sender_name, item_body)
            email_message = build_email_message(sender_name, item_body)

            for vid in target_vids:
                vendor = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
                if not vendor:
                    continue

                whatsapp_link = sender.get_whatsapp_link(vendor.whatsapp_number, whatsapp_message)
                wa_api_result = sender.send_whatsapp_direct(vendor.whatsapp_number, whatsapp_message)

                email_sent = False
                if vendor.email:
                    email_sent = sender.send_email(vendor.email, f"Enquiry - {it.item}", email_message)

                ev = models.EnquiryVendor(enquiry_id=enq.id, vendor_id=vid, status="sent")
                db.add(ev)

                msg = models.Message(
                    vendor_id=vid,
                    sender="user",
                    text=whatsapp_message,
                    is_read=1,
                )
                db.add(msg)

                results.append({
                    "vendor": vendor.name,
                    "whatsapp_link": whatsapp_link,
                    "whatsapp_api_sent": wa_api_result.get("success", False),
                    "whatsapp_api_error": wa_api_result.get("error"),
                    "email_sent": email_sent
                })

    db.commit()
    created_ids = [enq.id for enq, _ in created_enquiries]
    primary_id = created_ids[0] if created_ids else None
    return {
        "enquiry_id": primary_id,
        "enquiry_ids": created_ids,
        "sent_to": results
    }


@app.get("/enquiries")
def list_enquiries(db: Session = Depends(get_db)):
    return db.query(models.Enquiry).all()


# ---------- VENDOR REPLIES ----------
class VendorReply(BaseModel):
    enquiry_id: int
    vendor_id: int
    quoted_rate: str
    moq: str | None = None
    delivery_days: str | None = None

@app.post("/enquiries/reply")
def record_reply(payload: VendorReply, db: Session = Depends(get_db)):
    ev = db.query(models.EnquiryVendor).filter(
        models.EnquiryVendor.enquiry_id == payload.enquiry_id,
        models.EnquiryVendor.vendor_id == payload.vendor_id
    ).first()

    if not ev:
        return {"error": "No matching enquiry-vendor record found"}

    ev.quoted_rate = payload.quoted_rate
    ev.moq = payload.moq
    ev.delivery_days = payload.delivery_days
    ev.status = "replied"

    reply_text = f"Quoted rate: {payload.quoted_rate}"
    if payload.moq:
        reply_text += f", MOQ: {payload.moq}"
    if payload.delivery_days:
        reply_text += f", Delivery: {payload.delivery_days} days"

    msg = models.Message(
        vendor_id=payload.vendor_id,
        sender="vendor",
        text=reply_text,
        is_read=0,
    )
    db.add(msg)

    db.commit()
    return {"status": "reply recorded", "vendor_id": payload.vendor_id, "enquiry_id": payload.enquiry_id}


# ---------- ENQUIRY VENDORS ----------
@app.get("/enquiries/{enquiry_id}/vendors")
def enquiry_vendors(enquiry_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.EnquiryVendor).filter(
        models.EnquiryVendor.enquiry_id == enquiry_id
    ).all()
    result = []
    for row in rows:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == row.vendor_id).first()
        result.append({
            "vendor_id": row.vendor_id,
            "vendor_name": vendor.name if vendor else "Unknown",
            "status": row.status,
        })
    return result


# ---------- RATE COMPARISON ----------
@app.get("/enquiries/{enquiry_id}/compare")
def compare_rates(enquiry_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.EnquiryVendor).filter(
        models.EnquiryVendor.enquiry_id == enquiry_id
    ).all()

    comparison = []
    for row in rows:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == row.vendor_id).first()
        comparison.append({
            "vendor": vendor.name if vendor else "Unknown",
            "quoted_rate": row.quoted_rate,
            "moq": row.moq,
            "delivery_days": row.delivery_days,
            "status": row.status
        })

    return {"enquiry_id": enquiry_id, "quotes": comparison}


# ---------- AI CHAT PARSING ----------
from services import ai

class ChatMessage(BaseModel):
    message: str
    history: list[str] = []

@app.post("/chat/parse")
def chat_parse(payload: ChatMessage, db: Session = Depends(get_db)):
    vendors = db.query(models.Vendor).all()
    parsed = ai.parse_enquiry_message(payload.message, vendors, payload.history)
    return parsed


# ---------- MESSAGES / CONVERSATION HISTORY ----------
class MessageCreate(BaseModel):
    vendor_id: int
    sender: str
    text: str

@app.post("/messages")
def send_message(payload: MessageCreate, db: Session = Depends(get_db)):
    msg = models.Message(
        vendor_id=payload.vendor_id,
        sender=payload.sender,
        text=payload.text,
        is_read=1 if payload.sender == "user" else 0,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    wa_result = {"success": False, "error": None}
    wa_link = None
    if payload.sender == "user":
        vendor = db.query(models.Vendor).filter(models.Vendor.id == payload.vendor_id).first()
        if vendor and vendor.whatsapp_number:
            wa_result = sender.send_whatsapp_direct(vendor.whatsapp_number, payload.text)
            wa_link = sender.get_whatsapp_link(vendor.whatsapp_number, payload.text)

    return {
        "id": msg.id,
        "vendor_id": msg.vendor_id,
        "sender": msg.sender,
        "text": msg.text,
        "is_read": msg.is_read,
        "created_at": msg.created_at,
        "whatsapp_api": wa_result,
        "whatsapp_link": wa_link
    }

# ---------- DIRECT WHATSAPP & WEBHOOK ENDPOINTS ----------
class DirectWhatsAppPayload(BaseModel):
    phone_number: str
    message: str

@app.post("/whatsapp/send")
def send_direct_whatsapp(payload: DirectWhatsAppPayload):
    result = sender.send_whatsapp_direct(payload.phone_number, payload.message)
    wa_link = sender.get_whatsapp_link(payload.phone_number, payload.message)
    return {
        "api_result": result,
        "whatsapp_link": wa_link
    }

@app.get("/whatsapp/webhook")
def verify_whatsapp_webhook(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    verify_token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and verify_token == config.WHATSAPP_VERIFY_TOKEN:
        return Response(content=challenge, media_type="text/plain")
    return Response(content="Forbidden", status_code=403)

@app.post("/whatsapp/webhook")
async def handle_whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    try:
        entries = data.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                messages = value.get("messages", [])
                for message in messages:
                    sender_phone = message.get("from")
                    text_body = message.get("text", {}).get("body", "")
                    if sender_phone and text_body:
                        clean_from = sender.clean_phone_number(sender_phone)
                        vendors = db.query(models.Vendor).all()
                        target_vendor = None
                        for v in vendors:
                            if sender.clean_phone_number(v.whatsapp_number) == clean_from:
                                target_vendor = v
                                break
                        
                        if target_vendor:
                            msg = models.Message(
                                vendor_id=target_vendor.id,
                                sender="vendor",
                                text=text_body,
                                is_read=0
                            )
                            db.add(msg)
                            db.commit()

                            # AI Auto-Quote Parsing from WhatsApp message
                            try:
                                parsed_quote = ai.parse_vendor_quote_reply(text_body)
                                if parsed_quote.get("quoted_rate"):
                                    latest_ev = db.query(models.EnquiryVendor).filter(
                                        models.EnquiryVendor.vendor_id == target_vendor.id
                                    ).order_by(models.EnquiryVendor.id.desc()).first()

                                    if latest_ev:
                                        latest_ev.status = "replied"
                                        latest_ev.quoted_rate = str(parsed_quote["quoted_rate"])
                                        if parsed_quote.get("moq"):
                                            latest_ev.moq = str(parsed_quote["moq"])
                                        if parsed_quote.get("delivery_days"):
                                            latest_ev.delivery_days = str(parsed_quote["delivery_days"])
                                        db.commit()
                            except Exception as q_err:
                                print("AI quote parse error in webhook:", q_err)
    except Exception as e:
        print("Error processing webhook:", e)
    return {"status": "ok"}

@app.get("/messages/{vendor_id}")
def get_messages(vendor_id: int, db: Session = Depends(get_db)):
    return db.query(models.Message).filter(
        models.Message.vendor_id == vendor_id
    ).order_by(models.Message.created_at).all()

@app.post("/messages/{vendor_id}/mark-read")
def mark_read(vendor_id: int, db: Session = Depends(get_db)):
    db.query(models.Message).filter(
        models.Message.vendor_id == vendor_id,
        models.Message.is_read == 0
    ).update({"is_read": 1})
    db.commit()
    return {"status": "marked read"}

@app.get("/vendors/inbox")
def vendor_inbox(user_id: int | None = None, role: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Vendor)
    if role == "purchase_user" and user_id:
        query = query.filter(or_(models.Vendor.assigned_to == user_id, models.Vendor.assigned_to == None))
    vendors = query.all()

    result = []
    for v in vendors:
        last_msg = db.query(models.Message).filter(
            models.Message.vendor_id == v.id
        ).order_by(models.Message.created_at.desc()).first()
        unread_count = db.query(models.Message).filter(
            models.Message.vendor_id == v.id,
            models.Message.is_read == 0
        ).count()
        result.append({
            "vendor_id": v.id,
            "name": v.name,
            "last_message": last_msg.text if last_msg else None,
            "last_sender": last_msg.sender if last_msg else None,
            "last_time": last_msg.created_at.isoformat() if last_msg else None,
            "unread_count": unread_count,
        })
    return result