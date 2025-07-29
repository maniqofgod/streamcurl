from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from sqlalchemy.orm import Session
from app.api.dependencies import get_db, get_current_user
from app.db.models import Overlay, User
from typing import List, Dict
import math
import os
import shutil
import uuid
import tempfile
from pathlib import Path
import logging
from app.services import gdrive_service

router = APIRouter()

MEDIA_DIR = Path("/media/overlays")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/")
def get_images(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
) -> Dict:
    # This now only queries for GDrive images for consistency
    query = db.query(Overlay).filter(Overlay.storage_type == 'gdrive')
    
    total_items = query.count()
    total_pages = math.ceil(total_items / limit)
    
    offset = (page - 1) * limit
    images = query.offset(offset).limit(limit).all()
    
    return {
        "items": [{"id": img.id, "gdrive_file_id": img.gdrive_file_id, "display_name": img.display_name} for img in images],
        "page": page,
        "pages": total_pages,
        "limit": limit,
        "total": total_items
    }

@router.post("/")
async def upload_image(
    display_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # The 'storage' parameter is removed, forcing all uploads to Google Drive.
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        file_id = gdrive_service.upload_file(
            db=db,
            user=current_user,
            file_stream=open(tmp_path, 'rb'),
            filename=display_name or file.filename,
            mimetype=file.content_type
        )

        if not file_id:
            raise HTTPException(status_code=500, detail="Failed to upload image to Google Drive.")

        db_image = Overlay(
            display_name=display_name,
            storage_type='gdrive',
            gdrive_file_id=file_id,
            source="upload",
            user_id=current_user.id
        )
        db.add(db_image)
        db.commit()
        db.refresh(db_image)
        # The filepath is now represented by the gdrive_file_id
        return {"id": db_image.id, "gdrive_file_id": db_image.gdrive_file_id, "display_name": db_image.display_name}
    except Exception as e:
        logging.error(f"An error occurred during Google Drive image upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        if file and not file.file.closed:
            file.file.close()
