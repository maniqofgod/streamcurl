import os
import tempfile
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.dependencies import get_db, get_current_user
from app.core.soundcloud_search import SoundCloudSearch
from app.db.models import User
from app.services import gdrive_service

router = APIRouter()
soundcloud_search = SoundCloudSearch()
logger = logging.getLogger(__name__)

class SoundCloudTrack(BaseModel):
    url: str
    track_id: str
    title: str

@router.get("/search")
async def search_soundcloud(q: str, limit: int = 10, page: int = 1):
    try:
        tracks = soundcloud_search.search(q, limit, page)
        return tracks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/download")
async def download_soundcloud_track(
    track: SoundCloudTrack,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Create a temporary directory to store the download
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            logger.info(f"Downloading SoundCloud track '{track.title}' from {track.url} for user {current_user.id}")
            
            # Download the track, which returns file details
            download_details = soundcloud_search.download(track.url, temp_dir)
            
            temp_path = download_details["path"]
            filename = download_details["filename"]
            mimetype = download_details["mimetype"]
            
            logger.info(f"Successfully downloaded to temporary file: {temp_path}")

            # Upload the downloaded file to the user's Google Drive
            with open(temp_path, "rb") as file_stream:
                file_id = gdrive_service.upload_file(
                    db=db,
                    user=current_user,
                    file_stream=file_stream,
                    filename=filename,
                    mimetype=mimetype
                )

            if not file_id:
                raise HTTPException(status_code=500, detail="Failed to upload file to Google Drive.")

            logger.info(f"Successfully uploaded '{filename}' to Google Drive with file ID: {file_id}")
            return {"message": f"'{track.title}' downloaded and uploaded to your Google Drive successfully.", "gdrive_file_id": file_id}

        except Exception as e:
            logger.error(f"An error occurred during SoundCloud download/upload for user {current_user.id}: {e}", exc_info=True)
            # The temporary directory is cleaned up automatically by the 'with' statement
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")
