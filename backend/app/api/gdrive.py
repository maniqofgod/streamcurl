from fastapi import APIRouter, Depends, HTTPException, Form, Request, Query, UploadFile, File, Header, Body, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from typing import Optional
import logging
import json
import os
import tempfile
import shutil
from pydantic import BaseModel
import httpx
from fastapi.responses import StreamingResponse
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import io

from app.api.dependencies import get_db, get_current_user, csrf_protect, get_current_admin_user, get_current_user_for_streaming
from app.db.models import User, GoogleDriveConfig
from app.services import gdrive_service, ffmpeg_service

router = APIRouter()
logger = logging.getLogger(__name__)

class PickerFile(BaseModel):
    id: str



class RenameRequest(BaseModel):
    new_name: str

class SetFolderRequest(BaseModel):
    folder_id: str

def get_or_create_gdrive_config(db: Session) -> GoogleDriveConfig:
    config = db.query(GoogleDriveConfig).first()
    if not config:
        config = GoogleDriveConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.post("/save-credentials", dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
async def save_credentials(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        credentials_content = await file.read()
        # Validate that the content is valid JSON
        try:
            parsed_json = json.loads(credentials_content)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON format.")

        # Validate that the JSON contains the expected structure
        if "web" not in parsed_json and "installed" not in parsed_json:
            raise HTTPException(status_code=400, detail="Invalid credentials file. Missing 'web' or 'installed' key.")
        config = get_or_create_gdrive_config(db)
        config.credentials = credentials_content.decode('utf-8')
        config.token = None
        config.account_email = None
        db.commit()
        return {"message": "Credentials saved successfully. Please authenticate."}
    except Exception as e:
        logger.error(f"Failed to save credentials: {e}")
        raise HTTPException(status_code=500, detail="Failed to process credentials.")

@router.get("/auth/url", dependencies=[Depends(get_current_admin_user)])
def get_auth_url(request: Request, db: Session = Depends(get_db)):
    redirect_uri = f"{os.getenv('PUBLIC_BACKEND_URL').rstrip('/')}/api/v1/gdrive/auth/callback"
    auth_url = gdrive_service.get_auth_url_from_db(db, redirect_uri)
    if not auth_url:
        raise HTTPException(status_code=400, detail="Could not generate auth URL. Have you uploaded credentials?")
    return {"auth_url": auth_url}

@router.get("/auth/callback")
async def handle_auth_callback(request: Request, code: str = Query(...), db: Session = Depends(get_db)):
    try:
        redirect_uri = f"{os.getenv('PUBLIC_BACKEND_URL').rstrip('/')}/api/v1/gdrive/auth/callback"
        await run_in_threadpool(gdrive_service.exchange_code_for_token, db, code, redirect_uri)
        return {"message": "Successfully authenticated with Google Drive."}
    except Exception as e:
        logger.error(f"Google Drive auth callback failed: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication failed: {e}")

@router.get("/status", dependencies=[Depends(get_current_admin_user)])
def get_gdrive_status(db: Session = Depends(get_db)):
    config = db.query(GoogleDriveConfig).first()
    if not config or not config.token:
        return {"status": "disconnected"}
    return {"status": "connected", "email": config.account_email}

@router.post("/disconnect", dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
def disconnect_gdrive(db: Session = Depends(get_db)):
    config = db.query(GoogleDriveConfig).first()
    if config:
        config.token = None

@router.post("/set-folder", dependencies=[Depends(get_current_admin_user), Depends(csrf_protect)])
async def set_drive_folder(request: SetFolderRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        # Here you would typically validate the folder_id with Google Drive API
        # For now, we'll just save it.
        current_user.gdrive_folder_id = request.folder_id
        db.commit()
        return {"message": "Folder ID set successfully."}
    except Exception as e:
        logger.error(f"Failed to set folder ID for user {current_user.id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to set folder ID.")

        config.account_email = None
        db.commit()
    return {"message": "Successfully disconnected from Google Drive."}

@router.get("/user-context")
def get_user_context(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_info = {
        "id": current_user.id,
        "username": current_user.username,
        "is_superuser": current_user.is_superuser,
        "gdrive_quota_gb": current_user.gdrive_quota_gb,
        "gdrive_usage_bytes": current_user.gdrive_usage_bytes,
    }
    
    users_list = []
    if current_user.is_superuser:
        all_users = db.query(User).all()
        users_list = [
            {
                "id": u.id, 
                "username": u.username, 
                "gdrive_quota_gb": u.gdrive_quota_gb, 
                "gdrive_usage_bytes": u.gdrive_usage_bytes
            } for u in all_users
        ]

    return {"user": user_info, "users": users_list}

# --- User-facing routes ---

@router.get("/files/{media_type}")
async def list_gdrive_files(
    media_type: str,
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target_user = current_user
    if user_id and current_user.is_superuser:
        found_user = db.query(User).filter(User.id == user_id).first()
        if not found_user:
            raise HTTPException(status_code=404, detail="User not found")
        target_user = found_user
    elif user_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view other users' files")

    try:
        # Determine the mime type filter based on the media_type parameter
        mime_type_filter = None
        if media_type == "video":
            mime_type_filter = "video/"
        elif media_type == "image":
            mime_type_filter = "image/"
        elif media_type == "audio":
            mime_type_filter = "audio/"
        elif media_type == "all":
            mime_type_filter = None
        
        files = await run_in_threadpool(
            gdrive_service.list_files,
            db,
            user=target_user,
            mime_type_filter=mime_type_filter
        )
        for file in files:
            thumbnail_url = f"/api/v1/gdrive/thumbnail/{file['id']}"
            if user_id and current_user.is_superuser:
                thumbnail_url += f"?user_id={user_id}"
            file['thumbnail_url'] = thumbnail_url
            file['source'] = 'gdrive'
        return files
    except Exception as e:
        logger.error(f"Failed to list Google Drive files for user {target_user.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files from Google Drive: {str(e)}")

@router.post("/upload")
async def upload_to_my_drive(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.gdrive_folder_id:
        raise HTTPException(status_code=400, detail="Current user does not have a Google Drive folder configured.")
    tmp_path = None
    try:
        logger.info(f"Uploading file '{file.filename}' with content type '{file.content_type}'")
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        logger.info(f"Reported file size: {file_size} bytes")
        file.file.seek(0)

        with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
            await run_in_threadpool(shutil.copyfileobj, file.file, tmp)
            tmp_path = tmp.name
        with open(tmp_path, "rb") as tmp_file:
            file_id = await run_in_threadpool(gdrive_service.upload_file, db=db, user=current_user, file_stream=tmp_file, filename=file.filename, mimetype=file.content_type)
        if not file_id:
            raise HTTPException(status_code=500, detail="Failed to upload file to Google Drive.")
        return {"message": "File uploaded successfully.", "file_id": file_id}
    except Exception as e:
        logger.error(f"Failed to upload file for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

@router.delete("/files/{file_id}")
async def delete_gdrive_file(file_id: str, user_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target_user = current_user
    if user_id and current_user.is_superuser:
        found_user = db.query(User).filter(User.id == user_id).first()
        if not found_user:
            raise HTTPException(status_code=404, detail="User not found")
        target_user = found_user
    elif user_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to delete other users' files")

    try:
        success = await run_in_threadpool(gdrive_service.delete_file, db, user=target_user, file_id=file_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete file from Google Drive.")
    except Exception as e:
        logger.error(f"Error deleting file {file_id} for user {target_user.id}: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while deleting the file.")
    return {"message": "File deleted successfully."}

@router.patch("/files/{file_id}")
async def rename_gdrive_file(file_id: str, rename_request: RenameRequest, user_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target_user = current_user
    if user_id and current_user.is_superuser:
        found_user = db.query(User).filter(User.id == user_id).first()
        if not found_user:
            raise HTTPException(status_code=404, detail="User not found")
        target_user = found_user
    elif user_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to rename other users' files")

    try:
        updated_file = await run_in_threadpool(gdrive_service.rename_file, db, user=target_user, file_id=file_id, new_name=rename_request.new_name)
        if not updated_file:
            raise HTTPException(status_code=404, detail="File not found or failed to rename.")
        return updated_file
    except Exception as e:
        logger.error(f"Error renaming file {file_id} for user {target_user.id}: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while renaming the file.")

# --- Admin routes ---

@router.get("/admin/users", dependencies=[Depends(get_current_admin_user)])
def admin_list_users_gdrive_info(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": user.id, "username": user.username, "gdrive_folder_id": user.gdrive_folder_id, "gdrive_quota_gb": user.gdrive_quota_gb, "gdrive_usage_bytes": user.gdrive_usage_bytes} for user in users]

@router.get("/admin/files/{user_id}", dependencies=[Depends(get_current_admin_user)])
async def admin_list_user_files(user_id: int, db: Session = Depends(get_db)):
    target_user = await run_in_threadpool(db.query(User).filter(User.id == user_id).first)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        files = await run_in_threadpool(gdrive_service.list_files, db, user=target_user)
        for file in files:
            file['thumbnail_url'] = f"/api/v1/gdrive/thumbnail/{file['id']}?user_id={user_id}"
            file['source'] = 'gdrive'
        return files
    except Exception as e:
        logger.error(f"Admin failed to list Google Drive files for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list files from Google Drive.")

@router.delete("/admin/files/{user_id}/{file_id}", dependencies=[Depends(get_current_admin_user)])
async def admin_delete_gdrive_file(user_id: int, file_id: str, db: Session = Depends(get_db)):
    target_user = await run_in_threadpool(db.query(User).filter(User.id == user_id).first)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        success = await run_in_threadpool(gdrive_service.delete_file, db, user=target_user, file_id=file_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to delete file from Google Drive.")
    except Exception as e:
        logger.error(f"Admin error deleting file {file_id} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while deleting the file.")
    return {"message": "File deleted successfully by admin."}

@router.patch("/admin/files/{user_id}/{file_id}", dependencies=[Depends(get_current_admin_user)])
async def admin_rename_gdrive_file(user_id: int, file_id: str, rename_request: RenameRequest, db: Session = Depends(get_db)):
    target_user = await run_in_threadpool(db.query(User).filter(User.id == user_id).first)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        updated_file = await run_in_threadpool(gdrive_service.rename_file, db, user=target_user, file_id=file_id, new_name=rename_request.new_name)
        if not updated_file:
            raise HTTPException(status_code=404, detail="File not found or failed to rename.")
        return updated_file
    except Exception as e:
        logger.error(f"Admin error renaming file {file_id} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while renaming the file.")

@router.post("/admin/upload/{user_id}", dependencies=[Depends(get_current_admin_user)])
async def admin_upload_to_user_drive(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    target_user = await run_in_threadpool(db.query(User).filter(User.id == user_id).first)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not target_user.gdrive_folder_id:
        raise HTTPException(status_code=400, detail=f"User {user_id} does not have a Google Drive folder configured.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
            await run_in_threadpool(shutil.copyfileobj, file.file, tmp)
            tmp_path = tmp.name
        
        with open(tmp_path, "rb") as tmp_file:
            file_id = await run_in_threadpool(
                gdrive_service.upload_file,
                db=db, 
                user=target_user, 
                file_stream=tmp_file, 
                filename=file.filename, 
                mimetype=file.content_type
            )

        if not file_id:
            raise HTTPException(status_code=500, detail="Failed to upload file to Google Drive.")
        
        return {"message": "File uploaded successfully by admin.", "file_id": file_id}

    except Exception as e:
        logger.error(f"Admin failed to upload file for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

# --- Streaming/Proxy Routes ---

@router.get("/hello")
def hello_gdrive():
    return {"message": "Hello from GDrive router"}

@router.get("/stream/{file_id:path}")
async def stream_gdrive_file(
    file_id: str, 
    request: Request, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user_for_streaming)
):
    creds = await run_in_threadpool(gdrive_service.get_credentials, db, user=current_user)
    if not creds or not creds.token:
        raise HTTPException(status_code=503, detail="Could not authenticate with Google Drive for streaming.")

    try:
        range_header = request.headers.get('Range')
        
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        headers = {
            'Authorization': f'Bearer {creds.token}'
        }
        if range_header:
            headers['Range'] = range_header

        client = httpx.AsyncClient()
        req = client.build_request("GET", url, headers=headers, timeout=None)
        r = await client.send(req, stream=True)

        if r.status_code >= 400:
            error_body = await r.aread()
            logger.error(f"Google Drive stream error for {file_id}: {r.status_code} {error_body.decode()}")
            await r.aclose()
            await client.aclose()
            raise HTTPException(status_code=r.status_code, detail="Error streaming from Google Drive.")

        response_headers = {
            "Content-Length": r.headers.get("Content-Length"),
            "Content-Range": r.headers.get("Content-Range"),
            "Content-Type": r.headers.get("Content-Type", "application/octet-stream"),
            "Accept-Ranges": "bytes",
        }
        response_headers = {k: v for k, v in response_headers.items() if v is not None}

        async def content_streamer():
            try:
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()

        return StreamingResponse(
            content_streamer(),
            status_code=r.status_code,
            headers=response_headers
        )

    except HttpError as e:
        logger.error(f"Google Drive API error for stream {file_id}: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to prepare stream for file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to prepare stream: {e}")


@router.api_route("/thumbnail/{file_id:path}", methods=["GET", "HEAD"])
async def get_gdrive_thumbnail(file_id: str, user_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user_for_streaming)):
    target_user = current_user
    if user_id and current_user.is_superuser:
        found_user = db.query(User).filter(User.id == user_id).first()
        if not found_user:
            raise HTTPException(status_code=404, detail="User not found")
        target_user = found_user
    elif user_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view other users' thumbnails")

    service = await run_in_threadpool(gdrive_service.get_service, db, user=target_user)
    if not service:
        raise HTTPException(status_code=503, detail="Google Drive service not available.")

    # Define a path for caching the thumbnail and ensure the directory exists.
    THUMBNAIL_CACHE_DIR = os.path.join(tempfile.gettempdir(), "gdrive_thumbnails")
    os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)
    cached_thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, f"{file_id}.jpg")

    # If a cached thumbnail exists, serve it directly.
    if os.path.exists(cached_thumbnail_path):
        with open(cached_thumbnail_path, "rb") as f:
            return Response(content=f.read(), media_type="image/jpeg")

    try:
        file_metadata = await run_in_threadpool(
            service.files().get(fileId=file_id, fields='thumbnailLink, webContentLink, mimeType').execute
        )
        
        thumbnail_link = file_metadata.get('thumbnailLink')
        
        if thumbnail_link:
            creds = await run_in_threadpool(gdrive_service.get_credentials, db, user=target_user)
            if not creds or not creds.token:
                raise HTTPException(status_code=503, detail="Could not authenticate with Google Drive for thumbnail.")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                auth_headers = {'Authorization': f'Bearer {creds.token}'}
                response = await client.get(thumbnail_link, headers=auth_headers, follow_redirects=True)
                response.raise_for_status()
                thumbnail_data = response.content

            # Cache the thumbnail
            with open(cached_thumbnail_path, "wb") as f:
                f.write(thumbnail_data)

            return Response(content=thumbnail_data, media_type="image/jpeg")

        # Fallback for files without a direct thumbnailLink
        mime_type = file_metadata.get('mimeType', '')
        logger.info(f"No thumbnailLink for {file_id} ({mime_type}). Attempting fallback.")

        # Fallback for images: download the full image content
        if mime_type.startswith('image/'):
            logger.info(f"Using webContentLink for image {file_id}")
            creds = await run_in_threadpool(gdrive_service.get_credentials, db, user=target_user)
            if not creds or not creds.token:
                raise HTTPException(status_code=503, detail="Could not authenticate with Google Drive for thumbnail.")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                auth_headers = {'Authorization': f'Bearer {creds.token}'}
                download_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
                response = await client.get(download_url, headers=auth_headers, follow_redirects=True)
                response.raise_for_status()
                thumbnail_data = response.content

            with open(cached_thumbnail_path, "wb") as f:
                f.write(thumbnail_data)
            return Response(content=thumbnail_data, media_type=mime_type)

        # Fallback to FFmpeg for video files
        if not mime_type.startswith('video/'):
            raise HTTPException(status_code=404, detail="No thumbnail available and file is not a video or image.")

        media_request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, media_request, chunksize=2*1024*1024)
        
        try:
            status, done = await run_in_threadpool(downloader.next_chunk)
            if not status:
                raise HTTPException(status_code=500, detail="Failed to download video chunk for thumbnail generation.")
        except HttpError as e:
            logger.error(f"HttpError while downloading chunk for thumbnail {file_id}: {e}")
            raise HTTPException(status_code=e.resp.status, detail=f"Failed to download video for thumbnail: {e}")

        video_chunk = fh.getvalue()
        if not video_chunk:
            raise HTTPException(status_code=500, detail="Downloaded video chunk is empty.")

        thumbnail_data = await run_in_threadpool(ffmpeg_service.generate_thumbnail_from_stream, video_chunk)
        if not thumbnail_data:
            raise HTTPException(status_code=500, detail="FFmpeg failed to generate thumbnail.")

        # Save the newly generated thumbnail to the cache.
        with open(cached_thumbnail_path, "wb") as f:
            f.write(thumbnail_data)
            
        return Response(content=thumbnail_data, media_type="image/jpeg")

    except HTTPException:
        raise
    except HttpError as e:
        logger.error(f"Google Drive API error for thumbnail {file_id}: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))
