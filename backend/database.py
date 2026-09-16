from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:@localhost/Ken-Vendor-Connect")

try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with engine.connect() as conn:
        pass
except Exception as e:
    print(f"MySQL unavailable ({e}), using SQLite fallback: sqlite:///./ken_vendor_connect.db")
    DATABASE_URL = "sqlite:///./ken_vendor_connect.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()