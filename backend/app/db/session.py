from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

# Add connect_args for SQLite, though we are moving away from it
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL, 
    connect_args=connect_args,
    pool_size=20,
    max_overflow=40
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
