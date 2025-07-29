import os
import logging
import json
import requests
import tempfile
from sqlalchemy.orm import Session
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from typing import IO, Union, Optional
import io

from app.db.models import GoogleDriveConfig, User
from app.services import ffmpeg_service

logger = logging.getLogger(__name__)
def _safe_int(value, default=0):
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default

SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive' # Full access to all files
]

def get_db_config(db: Session) -> GoogleDriveConfig:
    config = db.query(GoogleDriveConfig).first()
    if not config:
        config = GoogleDriveConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

def get_auth_url_from_db(db: Session, redirect_uri: str) -> Optional[str]:
    config = get_db_config(db)
    if not config.credentials:
        return None
    
    client_config = json.loads(config.credentials)
    flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)
    auth_url, _ = flow.authorization_url(access_type='offline', prompt='consent')
    return auth_url

def exchange_code_for_token(db: Session, code: str, redirect_uri: str):
    config = get_db_config(db)
    if not config.credentials:
        raise Exception("Google Drive credentials not configured.")
        
    client_config = json.loads(config.credentials)
    flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)
    flow.fetch_token(code=code)
    
    creds = flow.credentials
    config.token = creds.to_json()
    
    user_info_service = build('oauth2', 'v2', credentials=creds)
    user_info = user_info_service.userinfo().get().execute()
    config.account_email = user_info.get('email')
    
    db.commit()

def get_credentials(db: Session, user: Optional[User] = None) -> Optional[Credentials]:
    token_info = None
    if user and user.gdrive_token:
        token_info = json.loads(user.gdrive_token)
    else:
        config = get_db_config(db)
        if config.token:
            token_info = json.loads(config.token)

    if not token_info:
        logger.error("No Google Drive token found for user or globally.")
        return None

    try:
        creds = Credentials.from_authorized_user_info(token_info, SCOPES)
    except Exception as e:
        logger.error(f"Failed to load credentials from token info: {e}")
        return None

    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            new_token_json = creds.to_json()
            if user:
                user.gdrive_token = new_token_json
                logger.info(f"Refreshed and saved new Google Drive token for user {user.id}.")
            else:
                config = get_db_config(db)
                config.token = new_token_json
                logger.info("Refreshed and saved new global Google Drive token.")
            db.commit()
        except Exception as e:
            logger.error(f"Failed to refresh expired Google Drive credentials: {e}")
            if user:
                user.gdrive_token = None
            else:
                config = get_db_config(db)
                config.token = None
                config.account_email = None
            db.commit()
            return None
    return creds

def get_service(db: Session, user: Optional[User] = None):
    creds = get_credentials(db, user=user)
    if not creds:
        return None
    
    try:
        service = build('drive', 'v3', credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Failed to build Google Drive service: {e}")
        return None

def get_or_create_user_drive_folder(db: Session, user: User) -> Optional[str]:
    """
    Returns the user's GDrive folder ID. Creates the folder if it doesn't exist.
    """
    if user.gdrive_folder_id:
        return user.gdrive_folder_id

    logger.info(f"User {user.id} does not have a GDrive folder. Attempting to create one.")
    service = get_service(db, user=user)
    if not service:
        logger.error(f"Could not get authenticated GDrive service to create a folder for user {user.id}.")
        return None

    folder_name = f"user_{user.id}_{user.username}"
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    try:
        folder = service.files().create(body=file_metadata, fields='id').execute()
        folder_id = folder.get('id')
        logger.info(f"Created Google Drive folder '{folder_name}' with ID: {folder_id} for user {user.id}")
        
        user.gdrive_folder_id = folder_id
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return folder_id
    except HttpError as error:
        logger.error(f"An error occurred while creating a folder for user {user.id}: {error}")
        return None

def file_exists(service, folder_id: str, filename: str) -> bool:
    """
    Checks if a file with the given name already exists in the specified folder.
    """
    try:
        # Important: Escape single quotes in filename to prevent query injection
        sanitized_filename = filename.replace("'", "\\'")
        query = f"name = '{sanitized_filename}' and '{folder_id}' in parents and trashed=false"
        
        response = service.files().list(
            q=query,
            fields='files(id)',
            pageSize=1
        ).execute()
        
        if response.get('files'):
            logger.info(f"File '{filename}' found to exist in folder {folder_id}.")
            return True
        return False
    except HttpError as error:
        logger.error(f"Error checking for file existence '{filename}': {error}")
        # To be safe, assume it doesn't exist on error to not block uploads.
        return False
def upload_file(db: Session, user: User, file_stream: IO, filename: str, mimetype: str) -> Optional[str]:
    service = get_service(db, user=user)
    if not service:
        raise Exception("Could not get authenticated Google Drive service for upload.")

    folder_id = get_or_create_user_drive_folder(db, user)
    if not folder_id:
        raise Exception(f"User {user.id} does not have a Google Drive folder and one could not be created.")

    # Check if file with the same name already exists
    if file_exists(service, folder_id, filename):
        raise Exception(f"A file named '{filename}' already exists in your Google Drive. Please use a different name or delete the existing file.")

    # Check quota
    file_size = os.fstat(file_stream.fileno()).st_size
    quota_bytes = user.gdrive_quota_gb * (1024**3)
    if user.gdrive_usage_bytes + file_size > quota_bytes:
        raise Exception(f"Upload would exceed user's Google Drive quota of {user.gdrive_quota_gb} GB.")

    file_metadata = {
        'name': filename,
        'parents': [folder_id]
    }
    media = MediaFileUpload(file_stream.name, mimetype=mimetype, resumable=True)
    
    try:
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        # Update user's usage
        user.gdrive_usage_bytes += file_size
        db.commit()

        file_id = file.get('id')
        logger.info(f"File '{filename}' uploaded to folder {folder_id} with ID: {file_id}")
        return file_id
    except HttpError as error:
        logger.error(f'An error occurred during file upload for user {user.id}: {error}')
        return None

def list_files(db: Session, user: User, mime_type_filter: Optional[str] = None) -> list:
    service = get_service(db, user=user)
    if not service:
        logger.error("Could not get authenticated Google Drive service for listing files.")
        return []

    folder_id = get_or_create_user_drive_folder(db, user)
    if not folder_id:
        logger.warning(f"User {user.id} does not have a Google Drive folder ID and one could not be created. Returning empty list.")
        return []

    try:
        query = f"'{folder_id}' in parents and trashed=false"
        if mime_type_filter:
            query += f" and mimeType contains '{mime_type_filter.rstrip('/')}'"

        results = service.files().list(
            q=query,
            pageSize=100,
            fields="nextPageToken, files(id, name, mimeType, createdTime, size, videoMediaMetadata)"
        ).execute()
        
        files = results.get('files', [])
        
        processed_files = []
        for file in files:
            video_metadata = file.get('videoMediaMetadata', {})
            duration_seconds = 0
            if video_metadata:
                duration_ms = video_metadata.get('durationMillis')
                if duration_ms:
                    duration_seconds = _safe_int(duration_ms) / 1000

            file_data = {
                "id": file['id'],
                "gdrive_id": file['id'],
                "display_name": file.get('name'),
                "mime_type": file.get('mimeType'),
                "created_at": file.get('createdTime'),
                "file_size": file.get('size'),
                "size_mb": _safe_int(file.get('size')) / (1024 * 1024),
                "source": "gdrive",
                "thumbnail_url": f"/api/v1/gdrive/thumbnail/{file['id']}",
                "duration": duration_seconds
            }
            
            mime_type = file.get('mimeType', '')
            
            if mime_type.startswith('video/'):
                file_data['type'] = 'Video'
            elif mime_type.startswith('image/'):
                file_data['type'] = 'Image'
            elif mime_type.startswith('audio/'):
                file_data['type'] = 'Audio'
                # The duration should be available in videoMediaMetadata for audio files as well.
                # If not, we default to 0 instead of downloading the whole file.
                if not duration_seconds:
                    logger.warning(f"Could not determine duration for audio file {file['id']} from metadata. Attempting to fetch with ffmpeg.")
                    try:
                        # Download a small chunk of the file to get duration
                        request = service.files().get_media(fileId=file['id'])
                        fh = io.BytesIO()
                        downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024) # 1MB chunk
                        
                        # Get first chunk
                        downloader.next_chunk()
                        
                        fh.seek(0)
                        duration = ffmpeg_service.get_duration_from_stream(fh)
                        file_data['duration'] = duration
                        logger.info(f"Successfully determined duration for audio file {file['id']} as {duration}s using ffmpeg.")
                    except Exception as e:
                        logger.error(f"Failed to determine duration for audio file {file['id']} with ffmpeg: {e}")
                        file_data['duration'] = 0
            else:
                file_data['type'] = 'File'
            
            processed_files.append(file_data)

        return processed_files
    except HttpError as error:
        logger.error(f'An error occurred while listing files from Google Drive for user {user.id}: {error}')
        return []

def delete_file(db: Session, user: User, file_id: str) -> bool:
    service = get_service(db, user=user)
    if not service:
        logger.error("Could not get authenticated Google Drive service for deletion.")
        return False
    
    try:
        # Get file size before deleting to update quota
        file_metadata = service.files().get(fileId=file_id, fields='size').execute()
        file_size = int(file_metadata.get('size', 0))

        service.files().delete(fileId=file_id).execute()
        
        # Update user's usage
        user.gdrive_usage_bytes = max(0, user.gdrive_usage_bytes - file_size)
        db.commit()

        logger.info(f"Successfully deleted file {file_id} for user {user.id}.")
        return True
    except HttpError as error:
        logger.error(f"An error occurred while deleting file {file_id} for user {user.id}: {error}")
        return False

def get_direct_download_url(db: Session, file_id: str, user: Optional[User] = None) -> Optional[str]:
    if not file_id:
        return None
    
    service = get_service(db, user=user)
    if not service:
        logger.error("Could not get Google Drive service to set permissions.")
        return f"https://drive.google.com/uc?export=download&id={file_id}"

    try:
        permissions = service.permissions().list(fileId=file_id, fields='permissions(id,type,role)').execute()
        is_public = any(p for p in permissions.get('permissions', []) if p['type'] == 'anyone' and p['role'] == 'reader')

        if not is_public:
            logger.info(f"File {file_id} is not public. Setting public read permission.")
            public_permission = {'type': 'anyone', 'role': 'reader'}
            service.permissions().create(fileId=file_id, body=public_permission).execute()
            logger.info(f"Successfully made file {file_id} public.")
    except HttpError as error:
        logger.error(f"Failed to set public permissions for file {file_id}: {error}")
    
    return f"https://drive.google.com/uc?export=download&id={file_id}"

def get_folder_size(db: Session, folder_id: str, user: Optional[User] = None) -> int:
    service = get_service(db, user=user)
    if not service or not folder_id:
        return 0
    
    total_size = 0
    page_token = None
    try:
        while True:
            response = service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields='nextPageToken, files(size)',
                pageSize=1000,
                pageToken=page_token
            ).execute()
            
            for file in response.get('files', []):
                total_size += int(file.get('size', 0))
            
            page_token = response.get('nextPageToken', None)
            if page_token is None:
                break
    except HttpError as error:
        logger.error(f"Failed to calculate folder size for {folder_id}: {error}")

    return total_size

def copy_file_to_app_folder(db: Session, user: User, source_file_id: str) -> Optional[dict]:
    service = get_service(db, user=user)
    if not service:
        raise Exception("Could not get authenticated Google Drive service for copying.")

    folder_id = get_or_create_user_drive_folder(db, user)
    if not folder_id:
        raise Exception(f"User {user.id} does not have a Google Drive folder and one could not be created.")

    try:
        # Get metadata to find the original name
        source_file_meta = service.files().get(fileId=source_file_id, fields='name, size').execute()
        file_size = int(source_file_meta.get('size', 0))
# Check if a file with the same name already exists in the destination folder
        original_filename = source_file_meta.get('name')
        if file_exists(service, folder_id, original_filename):
            raise Exception(f"A file named '{original_filename}' already exists in your app folder. Cannot copy.")

        # Check quota
        quota_bytes = user.gdrive_quota_gb * (1024**3)
        if user.gdrive_usage_bytes + file_size > quota_bytes:
            raise Exception(f"Copying this file would exceed user's Google Drive quota of {user.gdrive_quota_gb} GB.")

        # Prepare metadata for the new file
        copied_file_metadata = {
            'name': source_file_meta.get('name'),
            'parents': [folder_id]
        }

        # Copy the file
        copied_file = service.files().copy(
            fileId=source_file_id,
            body=copied_file_metadata,
            fields='id, name, mimeType, thumbnailLink, webViewLink, webContentLink, createdTime, size'
        ).execute()

        # Update user's usage
        user.gdrive_usage_bytes += file_size
        db.commit()

        logger.info(f"Successfully copied file {source_file_id} to {copied_file.get('id')} in folder {folder_id} for user {user.id}")
        return copied_file
    except HttpError as error:
        logger.error(f"An error occurred while copying file {source_file_id} for user {user.id}: {error}")
        return None

def rename_file(db: Session, user: User, file_id: str, new_name: str) -> Optional[dict]:
    service = get_service(db, user=user)
    if not service:
        raise Exception("Could not get authenticated Google Drive service for renaming.")
    
    try:
        file_metadata = {'name': new_name}
        updated_file = service.files().update(
            fileId=file_id,
            body=file_metadata,
            fields='id, name, mimeType, thumbnailLink, webViewLink, webContentLink, createdTime, size'
        ).execute()
        logger.info(f"Successfully renamed file {file_id} to '{new_name}' for user {user.id}.")
        return updated_file
    except HttpError as error:
        logger.error(f"An error occurred while renaming file {file_id} for user {user.id}: {error}")
        return None
def get_drive_about(db: Session, user: Optional[User] = None) -> Optional[dict]:
    """
    Retrieves information about the user's Google Drive storage quota.
    """
    service = get_service(db, user=user)
    if not service:
        logger.error("Could not get authenticated Google Drive service for about info.")
        return None
    
    try:
        about = service.about().get(fields='storageQuota').execute()
        storage_quota = about.get('storageQuota', {})
        
        limit = int(storage_quota.get('limit', 0))
        usage = int(storage_quota.get('usage', 0))
        
        return {
            "limit_bytes": limit,
            "usage_bytes": usage,
            "limit_gb": f"{limit / (1024**3):.2f}",
            "usage_gb": f"{usage / (1024**3):.2f}",
            "usage_percent": f"{(usage / limit * 100):.2f}" if limit > 0 else "0.00"
        }
    except HttpError as error:
        logger.error(f"An error occurred while getting Drive about info: {error}")
        return None

from googleapiclient.http import MediaIoBaseDownload
import io

def download_file_from_drive(db: Session, file_id: str, destination_path: str, user: Optional[User] = None) -> bool:
    """
    Downloads a file from Google Drive to a local path.
    """
    service = get_service(db, user=user)
    if not service:
        logger.error(f"Could not get authenticated Google Drive service for downloading file {file_id}.")
        return False

    try:
        request = service.files().get_media(fileId=file_id)
        fh = io.FileIO(destination_path, 'wb')
        downloader = MediaIoBaseDownload(fh, request)
        
        done = False
        while done is False:
            status, done = downloader.next_chunk()
            logger.info(f"Download {int(status.progress() * 100)}% for file {file_id}.")
        
        logger.info(f"Successfully downloaded file {file_id} to {destination_path}")
        return True
    except HttpError as error:
        logger.error(f"An error occurred while downloading file {file_id}: {error}")
        # Clean up partially downloaded file if it exists
        if os.path.exists(destination_path):
            os.remove(destination_path)
        return False
    except Exception as e:
        logger.error(f"An unexpected error occurred during download for file {file_id}: {e}")
        if os.path.exists(destination_path):
            os.remove(destination_path)
        return False

def get_file_metadata(db: Session, file_id: str, user: Optional[User] = None) -> Optional[dict]:
    """
    Retrieves metadata for a specific file from Google Drive.
    """
    service = get_service(db, user=user)
    if not service:
        logger.error(f"Could not get authenticated Google Drive service for metadata fetch for file {file_id}.")
        return None
    
    try:
        file_metadata = service.files().get(fileId=file_id, fields='id, name, mimeType').execute()
        return file_metadata
    except HttpError as error:
        logger.error(f"An error occurred while fetching metadata for file {file_id}: {error}")
        return None
