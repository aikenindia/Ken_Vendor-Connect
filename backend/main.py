from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import engine, get_db, Base
from services import sender
import models

Base.metadata.create_all(bind=engine)

app = FastAPI()

# ---------- HOME ----------
@app.get("/")
def home():
    return {"status": "KENConnect backend is running"}


# ---------- VENDORS ----------
class VendorCreate(BaseModel):
    name: str
    whatsapp_number: str
    email: str | None = None
    category: str | None = None

@app.get("/vendors")
def list_vendors(db: Session = Depends(get_db)):
    return db.query(models.Vendor).all()

@app.post("/vendors")
def add_vendor(vendor: VendorCreate, db: Session = Depends(get_db)):
    new_vendor = models.Vendor(**vendor.dict())
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    return new_vendor


# ---------- ENQUIRIES ----------
class EnquiryCreate(BaseModel):
    item: str
    spec: str | None = None
    quantity: str
    delivery_date: str | None = None
    vendor_ids: list[int]

@app.post("/enquiries")
def create_enquiry(payload: EnquiryCreate, db: Session = Depends(get_db)):
    enquiry = models.Enquiry(
        item=payload.item,
        spec=payload.spec,
        quantity=payload.quantity,
        delivery_date=payload.delivery_date
    )
    db.add(enquiry)
    db.commit()
    db.refresh(enquiry)

    message_text = (
        f"Enquiry: {payload.item}\n"
        f"Spec: {payload.spec}\n"
        f"Qty: {payload.quantity}\n"
        f"Delivery needed by: {payload.delivery_date}"
    )

    results = []
    for vid in payload.vendor_ids:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
        if not vendor:
            continue

        whatsapp_link = sender.get_whatsapp_link(vendor.whatsapp_number, message_text)

        email_sent = False
        if vendor.email:
            sender.send_email(vendor.email, f"Enquiry - {payload.item}", message_text)
            email_sent = True

        ev = models.EnquiryVendor(enquiry_id=enquiry.id, vendor_id=vid, status="sent")
        db.add(ev)

        results.append({
            "vendor": vendor.name,
            "whatsapp_link": whatsapp_link,
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
    db.commit()
    return {"status": "reply recorded", "vendor_id": payload.vendor_id, "enquiry_id": payload.enquiry_id}


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

from services import ai

class ChatMessage(BaseModel):
    message: str

@app.post("/chat/parse")
def chat_parse(payload: ChatMessage, db: Session = Depends(get_db)):
    vendors = db.query(models.Vendor).all()
    parsed = ai.parse_enquiry_message(payload.message, vendors)
    return parsed