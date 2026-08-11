from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    password = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False)  # "purchase_user", "head", "vp", "owner"

class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    whatsapp_number = Column(String(20), nullable=False)
    email = Column(String(150), nullable=True)
    category = Column(String(100), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)

class Enquiry(Base):
    __tablename__ = "enquiries"
    id = Column(Integer, primary_key=True, index=True)
    item = Column(String(200), nullable=False)
    spec = Column(String(500), nullable=True)
    quantity = Column(String(50), nullable=False)
    delivery_date = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class EnquiryVendor(Base):
    __tablename__ = "enquiry_vendors"
    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id"))
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    status = Column(String(20), default="sent")
    quoted_rate = Column(String(50), nullable=True)
    moq = Column(String(50), nullable=True)
    delivery_days = Column(String(50), nullable=True)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    sender = Column(String(20))  # "user", "vendor", or "ai"
    text = Column(String(2000))
    is_read = Column(Integer, default=0)  # 0 = unread, 1 = read
    created_at = Column(DateTime, default=datetime.utcnow)