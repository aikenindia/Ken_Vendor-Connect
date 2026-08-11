from fastapi import FastAPI, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
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
        query = query.filter(models.Vendor.assigned_to == user_id)
    return query.all()

@app.post("/vendors")
def add_vendor(vendor: VendorCreate, db: Session = Depends(get_db)):
    new_vendor = models.Vendor(**vendor.dict())
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    return new_vendor

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
class EnquiryCreate(BaseModel):
    item: str
    spec: str | None = None
    quantity: str | None = None
    delivery_date: str | None = None
    vendor_ids: list[int]
    sender_name: str | None = None
    message_body: str | None = None

@app.post("/enquiries")
def create_enquiry(payload: EnquiryCreate, db: Session = Depends(get_db)):
    enquiry = models.Enquiry(
        item=payload.item,
        spec=payload.spec,
        quantity=payload.quantity or "Not specified",
        delivery_date=payload.delivery_date
    )
    db.add(enquiry)
    db.commit()
    db.refresh(enquiry)

    sender_name = payload.sender_name or "the Purchase Team"

    if payload.message_body:
        body = clean_message_body(payload.message_body)
    else:
        body_lines = [f"Item       : {payload.item}"]
        if payload.spec:
            body_lines.append(f"Spec       : {payload.spec}")
        if payload.quantity:
            body_lines.append(f"Quantity   : {payload.quantity}")
        if payload.delivery_date:
            body_lines.append(f"Delivery   : {payload.delivery_date}")
        body = "\n".join(body_lines)

    whatsapp_message = build_whatsapp_message(sender_name, body)
    email_message = build_email_message(sender_name, body)

    results = []
    for vid in payload.vendor_ids:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
        if not vendor:
            continue

        whatsapp_link = sender.get_whatsapp_link(vendor.whatsapp_number, whatsapp_message)
        wa_api_result = sender.send_whatsapp_direct(vendor.whatsapp_number, whatsapp_message)

        email_sent = False
        if vendor.email:
            sender.send_email(vendor.email, f"Enquiry - {payload.item}", email_message)
            email_sent = True

        ev = models.EnquiryVendor(enquiry_id=enquiry.id, vendor_id=vid, status="sent")
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
    return {"enquiry_id": enquiry.id, "sent_to": results}


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
        query = query.filter(models.Vendor.assigned_to == user_id)
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