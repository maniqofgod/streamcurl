from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List
import shutil
from pathlib import Path
import httpx
import os
import uuid
import logging
import tempfile
import mimetypes
from app.services import gdrive_service

from app.db.models import User
from app.api.dependencies import get_current_user, get_db, csrf_protect
from app.schemas import overlay as overlay_schema
from app.db.models import Overlay

OVERLAY_DIR = Path("media/overlays")
# Ensure the directory exists when the app starts
OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
PIXABAY_API_KEY = os.environ.get("PIXABAY_API_KEY")
PIXABAY_URL = "https://pixabay.com/api/"

router = APIRouter()



@router.get("/search_pixabay")
async def search_pixabay(q: str = Query(..., min_length=3), page: int = 1):
    params = {
        "key": PIXABAY_API_KEY,
        "q": q,
        "image_type": "photo",
        "safesearch": "true",
        "per_page": 20,
        "page": page
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(PIXABAY_URL, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Pixabay API: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")



@router.post("/download_pixabay", response_model=overlay_schema.Overlay)
async def download_pixabay_image(
    request: overlay_schema.DownloadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(csrf_protect)
):
    original_filename = os.path.basename(request.url.split('?')[0])
    tmp_path = None

    try:
        # Download the image to a temporary file
        async with httpx.AsyncClient() as client:
            response = await client.get(request.url)
            response.raise_for_status()
            file_extension = Path(original_filename).suffix or '.jpg'
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as tmp:
                tmp.write(response.content)
                tmp_path = tmp.name

        # Try to upload to Google Drive
        mimetype, _ = mimetypes.guess_type(tmp_path)
        if not mimetype:
            mimetype = 'image/jpeg'
        
        file_id = None
        try:
            with open(tmp_path, 'rb') as tmp_file:
                file_id = gdrive_service.upload_file(
                    db=db,
                    user=current_user,
                    file_stream=tmp_file,
                    filename=original_filename,
                    mimetype=mimetype
                )
        except Exception as gdrive_error:
            logging.error(f"Google Drive upload failed: {gdrive_error}", exc_info=True)
            # This is not a fatal error for the download itself, so we fallback to local.
            # We will raise a more specific error later if local saving also fails.
            pass

        if file_id:
            logging.info(f"Successfully uploaded {original_filename} to Google Drive with ID: {file_id}")
            db_overlay = Overlay(
                display_name=original_filename,
                source="pixabay",
                storage_type='gdrive',
                gdrive_file_id=file_id,
                user_id=current_user.id
            )
            db.add(db_overlay)
            db.commit()
            db.refresh(db_overlay)
            return db_overlay
        else:
            # Fallback to local storage if GDrive upload failed
            logging.warning("Failed to upload to Google Drive, falling back to local storage.")
            return await save_overlay_locally(db, original_filename, tmp_path, current_user.id)

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Failed to download image from Pixabay: {e.response.text}")
    except Exception as e:
        logging.error(f"An unrecoverable error occurred during Pixabay download: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        # Clean up the temporary file
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

async def save_overlay_locally(db: Session, original_filename: str, file_path: str, user_id: int) -> Overlay:
    """Helper function to save an overlay to local storage."""
    try:
        file_extension = Path(original_filename).suffix or '.jpg'
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        absolute_filepath = OVERLAY_DIR / unique_filename
        relative_filepath = Path("overlays") / unique_filename
        
        shutil.copy(file_path, absolute_filepath)

        db_overlay = Overlay(
            display_name=original_filename,
            filepath=str(relative_filepath),
            source="pixabay",
            storage_type='local',
            user_id=user_id
        )
        db.add(db_overlay)
        db.commit()
        db.refresh(db_overlay)
        return db_overlay
    except Exception as e:
        logging.error(f"Failed to save overlay locally after GDrive failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload to Google Drive and could not save locally.")


@router.post("/upload", response_model=overlay_schema.Overlay)
async def upload_overlay(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=Depends(csrf_protect)
):
    original_filename = Path(file.filename).name
    file_extension = Path(original_filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    
    absolute_filepath = OVERLAY_DIR / unique_filename
    relative_filepath = Path("overlays") / unique_filename
    
    try:
        with open(absolute_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    db_overlay = Overlay(
        display_name=original_filename,
        filepath=str(relative_filepath),
        source="upload",
        user_id=current_user.id
    )
    db.add(db_overlay)
    db.commit()
    db.refresh(db_overlay)
    
    return db_overlay

@router.get("/", response_model=List[overlay_schema.Overlay])
def read_overlays(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    overlays = db.query(Overlay).filter(Overlay.user_id == current_user.id).all()
    return overlays
