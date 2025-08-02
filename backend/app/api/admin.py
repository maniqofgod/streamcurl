import os
import shutil
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_db, get_current_user, csrf_protect
from app.schemas import user as user_schema
from app.schemas import vps as vps_schema
from app.db import models
from app.core import security
from app.services import gdrive_service

router = APIRouter()

# Dependency to check for admin user
def get_current_admin_user(current_user: user_schema.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

# Define a secure location to store the secrets file
SECRETS_STORAGE_PATH = "/secure_storage/client_secrets"
os.makedirs(SECRETS_STORAGE_PATH, exist_ok=True)

@router.post("/upload_client_secret", dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
async def upload_client_secret(file: UploadFile = File(...)):
    if file.content_type != "application/json":
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a JSON file.")

    # Generate a unique filename to avoid overwriting
    filename = f"{uuid.uuid4()}.json"
    file_location = os.path.join(SECRETS_STORAGE_PATH, filename)
    
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
    finally:
        file.file.close()

    return {"message": f"Client secrets file '{file.filename}' uploaded successfully as '{filename}'."}

@router.get("/client_secrets", response_model=List[str], dependencies=[Depends(get_current_admin_user)])
async def get_client_secrets():
    try:
        files = [f for f in os.listdir(SECRETS_STORAGE_PATH) if f.endswith('.json')]
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read secrets directory: {e}")

@router.delete("/client_secrets/{secret_name}", status_code=204, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
async def delete_client_secret(secret_name: str):
    file_path = os.path.join(SECRETS_STORAGE_PATH, secret_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Secret file not found.")
    
    try:
        os.remove(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete file: {e}")
    return

@router.post("/users/", response_model=user_schema.User, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def create_user(user: user_schema.UserCreate, db: Session = Depends(get_db)):
    db_user = security.get_user(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    if user.role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role specified. Can be 'admin' or 'user'.")
        
    return security.create_user(db=db, user=user)

@router.get("/users/", response_model=List[user_schema.User], dependencies=[Depends(get_current_admin_user)])
def read_users(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    return db.query(models.User).options(joinedload(models.User.vps)).offset(skip).limit(limit).all()

@router.put("/users/{user_id}", response_model=user_schema.User, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def update_user(user_id: int, user_update: user_schema.UserUpdate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.dict(exclude_unset=True)
    
    if "username" in update_data:
        existing_user = db.query(models.User).filter(models.User.username == update_data["username"]).first()
        if existing_user and existing_user.id != user_id:
            raise HTTPException(status_code=400, detail="Username already taken")
    
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    return db_user

@router.put("/users/{user_id}/approve", response_model=user_schema.User, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def approve_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.is_active = True
    db.commit()
    db.refresh(db_user)
    return db_user

@router.put("/users/{user_id}/role", response_model=user_schema.User, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def update_user_role(user_id: int, user_update: user_schema.UserUpdateRole, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_update.role not in ["admin", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role specified. Can be 'admin' or 'user'.")

    db_user.role = user_update.role
    db.commit()
    db.refresh(db_user)
    return db_user
@router.put("/users/{user_id}/password", status_code=204, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def update_user_password(user_id: int, user_update: user_schema.UserUpdatePassword, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.password_hash = security.get_password_hash(user_update.password)
    db.commit()

    return
@router.delete("/users/{user_id}", status_code=204, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent admin from deleting themselves
    # This is a simple check, a more robust solution might be needed
    if db_user.role == "admin":
        # A simple way to count other admins
        admin_count = db.query(models.User).filter(models.User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the only admin account.")

    db.delete(db_user)
    db.commit()
    return

@router.post("/users/{user_id}/vps/", response_model=vps_schema.VPS, dependencies=[Depends(get_current_admin_user)])
def admin_create_vps_for_user(user_id: int, vps: vps_schema.VPSCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_vps = models.VPS(**vps.dict(), user_id=user_id)
    db.add(db_vps)
    db.commit()
    db.refresh(db_vps)
    return db_vps

@router.get("/vps/", response_model=List[vps_schema.VPS], dependencies=[Depends(get_current_admin_user)])
def admin_read_vps_list(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    return db.query(models.VPS).offset(skip).limit(limit).all()

@router.delete("/vps/{vps_id}", response_model=vps_schema.VPS, dependencies=[Depends(get_current_admin_user)])
def admin_delete_vps(vps_id: int, db: Session = Depends(get_db)):
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if db_vps is None:
        raise HTTPException(status_code=404, detail="VPS not found")

    db.query(models.Stream).filter(models.Stream.vps_id == vps_id).update({"vps_id": None})
    
    db.delete(db_vps)
    db.commit()
    return db_vps
from dotenv import get_key, set_key
from pydantic import BaseModel

class ApiSettings(BaseModel):
    pixabay_api_key: str
    youtube_api_key: str
    google_fonts_api_key: str

@router.get("/settings", response_model=ApiSettings, dependencies=[Depends(get_current_admin_user)])
def get_api_settings():
    dotenv_path = "/app/.env"
    
    return ApiSettings(
        pixabay_api_key=get_key(dotenv_path, "PIXABAY_API_KEY") or "",
        youtube_api_key=get_key(dotenv_path, "YOUTUBE_API_KEY") or "",
        google_fonts_api_key=get_key(dotenv_path, "GOOGLE_FONTS_API_KEY") or ""
    )

@router.put("/settings", status_code=204, dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def update_api_settings(settings: ApiSettings):
    dotenv_path = "/app/.env"

    set_key(dotenv_path, "PIXABAY_API_KEY", settings.pixabay_api_key)
    set_key(dotenv_path, "YOUTUBE_API_KEY", settings.youtube_api_key)
    set_key(dotenv_path, "GOOGLE_FONTS_API_KEY", settings.google_fonts_api_key)

    return
import requests

class CheckApiKeyRequest(BaseModel):
    api_type: str
    api_key: str

@router.post("/check_api_key", dependencies=[Depends(get_current_admin_user)])
def check_api_key(request: CheckApiKeyRequest):
    is_valid = False
    if request.api_type == "pixabay":
        response = requests.get(f"https://pixabay.com/api/?key={request.api_key}&q=test&per_page=1")
        try:
            response.json()
            if response.status_code == 200:
                is_valid = True
        except requests.exceptions.JSONDecodeError:
            is_valid = False
    elif request.api_type == "youtube":
        response = requests.get(f"https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&key={request.api_key}")
        if response.status_code == 200:
            is_valid = True
    elif request.api_type == "google_fonts":
        response = requests.get(f"https://www.googleapis.com/webfonts/v1/webfonts?key={request.api_key}")
        if response.status_code == 200:
            is_valid = True
            
    if not is_valid:
        raise HTTPException(status_code=400, detail="API Key is invalid.")
        
    return {"valid": is_valid}