from datetime import timedelta
from fastapi import Request, Response
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError
import secrets
import os
import shutil
import uuid
from fastapi import UploadFile, File
from PIL import Image, ImageDraw, ImageFont
import random

from ..schemas import token as token_schema
from ..schemas import user as user_schema
from .dependencies import get_db, get_current_user
from ..core import security
from ..db import models
from ..services import gdrive_service

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/token")

PROFILE_PICS_STORAGE_PATH = "/app/media/profile_pics"
os.makedirs(PROFILE_PICS_STORAGE_PATH, exist_ok=True)

def generate_default_profile_picture(username: str) -> str:
    """Generates a simple profile picture with the user's first initial."""
    initial = username[0].upper()
    
    # Generate a random background color
    bg_color = (random.randint(100, 200), random.randint(100, 200), random.randint(100, 200))
    
    # Create an image
    image = Image.new('RGB', (200, 200), color=bg_color)
    draw = ImageDraw.Draw(image)
    
    # Use a default font
    try:
        font = ImageFont.truetype("arial.ttf", 100)
    except IOError:
        font = ImageFont.load_default()

    # Get text size and position
    text_bbox = draw.textbbox((0, 0), initial, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    position = ((200 - text_width) / 2, (200 - text_height) / 2)
    
    # Draw the initial on the image
    draw.text(position, initial, fill="white", font=font)
    
    # Save the image
    filename = f"{uuid.uuid4()}.png"
    file_location = os.path.join(PROFILE_PICS_STORAGE_PATH, filename)
    image.save(file_location)
    
    return filename

@router.post("/token", response_model=token_schema.Token)
async def login_for_access_token(response: Response, db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = security.authenticate_user(db, username=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please wait for admin approval.",
        )
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    
    csrf_token = secrets.token_hex(16)
    response.set_cookie(key="access_token", value=access_token, httponly=True, samesite='lax', expires=access_token_expires)
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=False, samesite='lax')
    
    return {"access_token": access_token, "token_type": "bearer", "csrf_token": csrf_token}


@router.post("/users", response_model=user_schema.User)
async def create_user(user: user_schema.UserCreate, db: Session = Depends(get_db)):
    db_user = security.get_user(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Generate default profile picture
    default_pic_filename = generate_default_profile_picture(user.username)
    user.profile_image_url = f"/media/profile_pics/{default_pic_filename}"
    
    return security.create_user(db=db, user=user)

@router.get("/users/me", response_model=user_schema.User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.put("/users/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_current_user_password(
    password_data: user_schema.UserChangePassword,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not security.verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )
    
    current_user.password_hash = security.get_password_hash(password_data.new_password)
    db.commit()
    db.refresh(current_user)
    return

@router.put("/users/me/profile-picture", response_model=user_schema.User)
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

    # Generate a unique filename
    extension = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{extension}"
    file_location = os.path.join(PROFILE_PICS_STORAGE_PATH, filename)

    # Save the file
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
    finally:
        file.file.close()

    # Update user's profile image URL
    # The URL should be relative to the media serving path
    profile_image_url = f"/media/profile_pics/{filename}"
    current_user.profile_image_url = profile_image_url
    db.commit()
    db.refresh(current_user)

    return current_user
