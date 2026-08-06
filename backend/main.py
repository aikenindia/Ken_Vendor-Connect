from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import engine, get_db, Base
import models

Base.metadata.create_all(bind=engine)

app = FastAPI()

@app.get("/")
def home():
    return {"status": "KENConnect backend is running"}

@app.get("/vendors")
def list_vendors(db: Session = Depends(get_db)):
    return db.query(models.Vendor).all()

class VendorCreate(BaseModel):
    name: str
    whatsapp_number: str
    email: str | None = None
    category: str | None = None

@app.post("/vendors")
def add_vendor(vendor: VendorCreate, db: Session = Depends(get_db)):
    new_vendor = models.Vendor(**vendor.dict())
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)
    return new_vendor