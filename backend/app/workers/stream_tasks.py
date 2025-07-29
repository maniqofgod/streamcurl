from celery import Celery
import subprocess
import redis
import logging
import json
import re
import time
import requests
import os
from typing import Optional
import shutil
from sqlalchemy.orm import Session, joinedload
from app.db import session
from app.db.models import Stream, VPS, Overlay
from app.services.ffmpeg_service import build_ffmpeg_go_live_command, build_ffmpeg_preview_command, build_ffmpeg_thumbnail_command
from app.services.youtube_service import get_live_broadcast_status, extract_video_id_from_url
from app.services.youtube_service import get_video_stats
from app.services.gdrive_service import download_file_from_drive, get_file_metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

celery_app = Celery(
    "stream_tasks",
    broker="redis://redis:6379/0",
    backend="redis://redis:6379/0"
)

AGENT_CALLBACK_API_KEY = os.getenv("AGENT_CALLBACK_API_KEY", "a-very-secret-key-for-agents")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://api:8001")
PUBLIC_BACKEND_URL = os.getenv("PUBLIC_BACKEND_URL", BACKEND_BASE_URL)

redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

@celery_app.task
def generate_stream_thumbnail(stream_id: int):
    """
    Generates a thumbnail for a stream by rendering a single frame using the full FFmpeg filter_complex.
    """
    logger.info(f"Starting thumbnail generation for stream {stream_id}")
    db = session.SessionLocal()
    temp_dir = f"/app/media/temp/thumb_{stream_id}"
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream or not stream.settings:
            logger.error(f"Thumbnail task: Stream {stream_id} not found or has no settings.")
            return

        if stream.vps_id:
            logger.info(f"Thumbnail generation is not applicable for VPS streams (stream {stream_id}). Skipping.")
            update_stream_status(db, stream_id, "Idle", "Thumbnail generation not applicable for VPS streams.")
            return

        # Prepare media, which will also set the "Downloading" status
        new_settings, temp_dir = prepare_stream_media(stream_id)

        # Now that downloads are done, set status to "Generating Thumbnail"
        update_stream_status(db, stream_id, "Generating Thumbnail", progress=100)

        thumbnail_dir = "/app/media/thumbnails"
        os.makedirs(thumbnail_dir, exist_ok=True)
        thumbnail_filename = f"{stream.id}.jpg"
        thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)

        # Build the specific FFmpeg command for rendering one frame
        command = build_ffmpeg_thumbnail_command(stream, new_settings, thumbnail_path)
        
        logger.info(f"Executing thumbnail command for stream {stream_id}: {' '.join(command)}")
        process = subprocess.run(command, capture_output=True, text=True)

        if process.returncode != 0:
            logger.error(f"Failed to generate canvas thumbnail for stream {stream_id}: {process.stderr}")
            raise Exception(f"FFmpeg failed for thumbnail generation: {process.stderr}")

        # Hapus thumbnail lama jika ada
        if stream.thumbnail_url and os.path.exists(f"/app{stream.thumbnail_url}"):
            if os.path.basename(stream.thumbnail_url) != thumbnail_filename:
                 os.remove(f"/app{stream.thumbnail_url}")

        stream.thumbnail_url = f"/media/thumbnails/{thumbnail_filename}"
        db.commit()
        logger.info(f"Canvas thumbnail created and saved for stream {stream_id} at {thumbnail_path}")
        update_stream_status(db, stream_id, "Idle", "Thumbnail updated.")

    except Exception as e:
        logger.error(f"Thumbnail generation task failed for stream {stream_id}: {e}", exc_info=True)
        update_stream_status(db, stream_id, "Error", "Thumbnail generation failed.")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        db.close()


def update_stream_status(db: Session, stream_id: int, status: str, details: str = "", progress: Optional[float] = None):
    """
    Updates the stream status in the database and publishes it to Redis.
    """
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if stream:
            stream.status = status
            payload = {"type": "status_update", "stream_id": stream_id, "status": status, "details": details}
            if progress is not None:
                stream.download_progress = progress
                payload["download_progress"] = progress
            
            db.commit()
            
            message = json.dumps(payload)
            redis_client.publish(f"stream_status_{stream_id}", message)
            logger.info(f"Updated status for stream {stream_id} to {status} (Progress: {progress}%)")
        else:
            logger.error(f"Stream with ID {stream_id} not found for status update.")
    except Exception as e:
        logger.error(f"Failed to update status for stream {stream_id}: {e}")
        db.rollback()

def stop_stream_on_vps(vps: VPS, stream_id: int):
    """Kirim permintaan untuk menghentikan stream pada agen VPS."""
    try:
        url = f"http://{vps.ip_address}:8001/stream/stop"
        headers = {"Authorization": f"Bearer {vps.api_key}"}
        payload = {"stream_id": stream_id}
        
        logger.info(f"Mengirim permintaan stop ke {url} untuk stream {stream_id}")
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        
        logger.info(f"Permintaan stop untuk stream {stream_id} berhasil dikirim ke VPS.")
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Gagal menghubungi agen VPS di {vps.ip_address} untuk menghentikan stream {stream_id}: {e}")
        raise

@celery_app.task
def stop_vps_stream(stream_id: int):
    """Tugas Celery untuk menghentikan stream di VPS."""
    logger.info(f"Starting stop VPS stream task for stream {stream_id}")
    db = session.SessionLocal()
    try:
        stream = db.query(Stream).options(joinedload(Stream.vps)).filter(Stream.id == stream_id).first()
        if not stream or not stream.vps:
            logger.warning(f"Stop task: Stream {stream_id} tidak ditemukan atau tidak terhubung ke VPS.")
            return

        stop_stream_on_vps(stream.vps, stream.id)
        
        # Update status to STOPPED first
        update_stream_status(db, stream_id, "STOPPED", "Stream stopped via VPS agent.")
        
        # Wait for a few seconds
        time.sleep(3)
        
        # Finally, update status to Idle
        update_stream_status(db, stream_id, "Idle", "Stream is now idle.")

    except Exception as e:
        logger.error(f"Gagal dalam tugas stop_vps_stream untuk stream {stream_id}: {e}")
        update_stream_status(db, stream_id, "Error", f"Failed to stop on VPS: {e}")
    finally:
        db.close()

def prepare_stream_media(stream_id: int):
    db = session.SessionLocal()
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream:
            raise Exception(f"Stream {stream_id} not found for media preparation.")

        # For VPS streams, we don't download locally. We serve files via HTTP.
        # The file paths in settings will be converted to URLs by ffmpeg_service.
        if stream.vps_id:
            logger.info(f"VPS stream {stream_id}: Skipping local media download.")
            # Return original settings, as paths will be handled by the URL generation logic.
            return stream.settings, None

        temp_dir = f"/app/media/temp/{stream_id}"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)

        logger.info(f"Preparing media for stream {stream_id} in {temp_dir}")
        
        settings = stream.settings
        new_settings = json.loads(json.dumps(settings))
        
        files_to_download = []
        for source in new_settings.get('sources') or []:
            items_to_process = []
            if source.get('type') == 'video':
                items_to_process = source.get('playlist', [])
            elif source.get('type') == 'image':
                items_to_process = source.get('image_items', source.get('items', []))
            elif source.get('type') == 'audio':
                items_to_process = source.get('audio_items', source.get('items', []))

            for item in items_to_process:
                filepath = item.get('filepath', '')
                gdrive_file_id = None
                if filepath.startswith('gdrive://'):
                    gdrive_file_id = filepath.replace('gdrive://', '')
                elif filepath.startswith('gdrive/stream/'):
                    gdrive_file_id = filepath.replace('gdrive/stream/', '')
                elif filepath.startswith('gdrive/thumbnail/'):
                    gdrive_file_id = filepath.replace('gdrive/thumbnail/', '')
                elif item.get('storage_type') == 'gdrive' and item.get('gdrive_file_id'):
                    gdrive_file_id = item['gdrive_file_id']
                
                if gdrive_file_id:
                    files_to_download.append({'item': item, 'gdrive_file_id': gdrive_file_id})

        total_files = len(files_to_download)
        downloaded_count = 0

        for i, file_info in enumerate(files_to_download):
            item = file_info['item']
            gdrive_file_id = file_info['gdrive_file_id']
            
            metadata = get_file_metadata(db, gdrive_file_id)
            if not metadata:
                raise Exception(f"Could not fetch metadata for GDrive file {gdrive_file_id}")

            mime_type = metadata.get('mimeType', '')
            ext = ".media"
            if 'video/mp4' in mime_type: ext = ".mp4"
            elif 'image/jpeg' in mime_type: ext = ".jpg"
            elif 'image/png' in mime_type: ext = ".png"
            elif 'audio/mpeg' in mime_type: ext = ".mp3"
            elif 'audio/mp4' in mime_type: ext = ".m4a"
            
            filename = f"{gdrive_file_id}{ext}"
            local_path = os.path.join(temp_dir, filename)
            
            progress = ((i + 1) / total_files) * 100 if total_files > 0 else 0
            logger.info(f"Downloading GDrive file {gdrive_file_id} as {filename} to {local_path} ({i+1}/{total_files})")
            update_stream_status(db, stream_id, "Downloading", f"Downloading {filename}...", progress=progress)

            success = download_file_from_drive(db, gdrive_file_id, local_path)
            if success:
                item['filepath'] = local_path
                item['storage_type'] = 'local'
                downloaded_count += 1
            else:
                raise Exception(f"Failed to download GDrive file {gdrive_file_id}")
        
        logger.info(f"Finished preparing media. Final settings object: {json.dumps(new_settings, indent=2)}")
        return new_settings, temp_dir

    except Exception as e:
        logger.error(f"Error preparing media for stream {stream_id}: {e}", exc_info=True)
        raise
    finally:
        db.close()

@celery_app.task(bind=True)
def stream_video(self, stream_id: int, is_preview: bool = False, public_url: str = None):
    logger.info(f"Starting stream video task for stream {stream_id}, is_preview: {is_preview}")
    db = session.SessionLocal()
    process = None
    final_status = "Idle"
    error_message = ""
    temp_dir = None

    try:
        stream = db.query(Stream).options(joinedload(Stream.vps)).filter(Stream.id == stream_id).first()
        if not stream:
            raise Exception("Stream not found in worker task.")

        is_vps_stream = stream.vps_id is not None and stream.vps is not None
        
        update_stream_status(db, stream_id, "Preparing Media", "Downloading all required files...")
        try:
            # For VPS streams, this now just returns the original settings.
            # For local streams, it downloads files and returns updated settings.
            new_settings, temp_dir = prepare_stream_media(stream_id)
            logger.info(f"Prepared settings for FFmpeg: {json.dumps(new_settings, indent=2)}")
        except Exception as e:
            raise Exception(f"Failed to prepare media: {e}")

        effective_base_url = public_url if public_url else PUBLIC_BACKEND_URL

        if is_preview:
            # Preview on VPS is not supported, always run locally.
            command = build_ffmpeg_preview_command(stream, settings=new_settings, is_vps_stream=False)
            update_stream_status(db, stream_id, "Previewing")
        else:
            command = build_ffmpeg_go_live_command(
                stream, 
                settings=new_settings, 
                is_vps_stream=is_vps_stream, 
                public_url=effective_base_url
            )
        
        logger.info(f"Executing command for stream {stream_id}: {' '.join(command)}")

        if is_vps_stream and not is_preview:
            logger.info(f"Stream {stream_id} is targeted for VPS {stream.vps.name} ({stream.vps.ip_address}). Delegating to agent.")
            
            try:
                stop_stream_on_vps(stream.vps, stream.id)
                time.sleep(2)
            except Exception as e:
                logger.warning(f"Could not stop pre-existing stream {stream_id} (this can be ignored): {e}")
            
            try:
                agent_url = f"http://{stream.vps.ip_address}:8001/stream/start"
                headers = {"Authorization": f"Bearer {stream.vps.api_key}"}
                
                clean_base_url = effective_base_url.rstrip('/')
                callback_url = f"{clean_base_url}/api/v1/agent-callbacks/status-update"
                logger.info(f"Constructed callback URL for agent: {callback_url}")
                
                payload = {
                    "ffmpeg_command": command,
                    "stream_id": stream_id,
                    "callback_url": callback_url,
                    "callback_api_key": AGENT_CALLBACK_API_KEY
                }
                response = requests.post(agent_url, json=payload, headers=headers, timeout=20)
                response.raise_for_status()
                
                logger.info(f"Successfully delegated stream {stream_id} to VPS agent. Response: {response.json()}")
                
            except requests.exceptions.RequestException as e:
                error_message = f"Could not connect to VPS agent: {e}"
                logger.error(f"Error for stream {stream_id}: {error_message}")
                final_status = "Error"
        else:
            logger.info(f"Stream {stream_id} is running locally.")
            update_stream_status(db, stream_id, "Starting...")
            process = subprocess.Popen(
                ['nice', '-n', '19'] + command, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                text=True, 
                bufsize=1, 
                universal_newlines=True
            )
            
            redis_client.set(f"stream_task_id_{stream_id}", self.request.id)
            
            time.sleep(2)
            if process.poll() is None:
                update_stream_status(db, stream_id, "LIVE")
            else:
                output = process.stdout.read()
                error_message = f"FFmpeg process for stream {stream_id} terminated unexpectedly. Output: {output}"
                logger.error(error_message)
                raise Exception(error_message)

            for line in iter(process.stdout.readline, ''):
                log_line = line.strip()
                logger.info(f"FFMPEG (stream {stream_id}): {log_line}")

            process.wait()
            if process.returncode != 0:
                error_message = f"FFmpeg exited with code {process.returncode}"
                logger.error(error_message)
                final_status = "Error"
            else:
                final_status = "Idle"
            
    except Exception as e:
        error_message = f"Task failed: {e}"
        logger.error(f"Error in stream_video task for stream {stream_id}: {error_message}", exc_info=True)
        final_status = "Error"
        self.update_state(state='FAILURE', meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait()
        
        if temp_dir and os.path.exists(temp_dir):
            logger.info(f"Cleaning up temporary directory: {temp_dir}")
            shutil.rmtree(temp_dir)

        if 'stream' in locals() and stream:
            if final_status != "Idle" or not stream.vps_id:
                update_stream_status(db, stream_id, final_status, error_message)
        elif final_status == "Error":
            update_stream_status(db, stream_id, final_status, error_message)

        redis_client.delete(f"stream_task_id_{stream_id}")
        redis_client.delete(f"stream:{stream_id}:download_total")
        redis_client.delete(f"stream:{stream_id}:download_progress")
        db.close()

@celery_app.task
def monitor_youtube_stream(stream_id: int):
    """
    Monitors a YouTube stream for status and stats, and stops the task if the stream ends.
    """
    logger.info(f"Starting YouTube monitor task for stream {stream_id}")
    db = session.SessionLocal()
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream or not stream.youtube_video_url:
            logger.warning(f"Monitor: Stream {stream_id} not found or has no YouTube URL. Exiting.")
            return

        video_id = extract_video_id_from_url(stream.youtube_video_url)
        if not video_id:
            logger.error(f"Monitor: Could not extract video ID from URL for stream {stream_id}. Exiting.")
            return

        logger.info(f"Starting YouTube monitor for stream {stream_id} (video ID: {video_id}).")

        while True:
            current_stream = db.query(Stream).filter(Stream.id == stream_id).first()
            if not current_stream or current_stream.status not in ["LIVE", "Processing...", "Starting..."]:
                logger.info(f"Monitor: Stream {stream_id} is no longer active in DB (status: {current_stream.status if current_stream else 'Not Found'}). Exiting monitor.")
                break

            broadcast_status = get_live_broadcast_status(video_id)
            logger.info(f"Monitor: YouTube broadcast status for stream {stream_id} is '{broadcast_status}'.")

            if broadcast_status not in ['live', 'upcoming']:
                logger.info(f"Monitor: YouTube stream {stream_id} is no longer live (status: {broadcast_status}). Stopping stream.")
                break

            stats = get_video_stats(video_id)
            if stats:
                current_stream.youtube_view_count = stats.get("view_count")
                current_stream.youtube_like_count = stats.get("like_count")
                current_stream.youtube_comment_count = stats.get("comment_count")
                db.commit()

                stats_message = json.dumps({
                    "stream_id": stream_id,
                    "type": "stats_update",
                    "stats": {
                        "youtube_view_count": current_stream.youtube_view_count,
                        "youtube_like_count": current_stream.youtube_like_count,
                        "youtube_comment_count": current_stream.youtube_comment_count,
                    }
                })
                redis_client.publish(f"stream_status_{stream_id}", stats_message)
                logger.info(f"Monitor: Updated stats for stream {stream_id}: {stats}")

            time.sleep(30)

    except Exception as e:
        logger.error(f"An error occurred in the YouTube monitor task for stream {stream_id}: {e}")
    finally:
        db.close()

@celery_app.task
def create_video_thumbnail(video_path: str, thumbnail_path: str):
    """
    Generates a thumbnail for a video file.
    """
    logger.info(f"Creating thumbnail for video: {video_path}")
    try:
        command = [
            'ffmpeg',
            '-i', video_path,
            '-ss', '00:00:01',  # Capture frame at 1 second
            '-vframes', '1',
            '-y',  # Overwrite output file if it exists
            thumbnail_path
        ]
        logger.info(f"Executing thumbnail command: {' '.join(command)}")
        process = subprocess.run(command, capture_output=True, text=True, check=True)
        logger.info(f"Thumbnail created for {video_path} at {thumbnail_path}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to create thumbnail for {video_path}: {e.stderr}")
    except Exception as e:
        logger.error(f"An unexpected error occurred during thumbnail creation for {video_path}: {e}")
