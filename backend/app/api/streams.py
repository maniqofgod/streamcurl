from fastapi import APIRouter, Depends, HTTPException, WebSocket, Body, WebSocketDisconnect, Request, status, BackgroundTasks
from websockets.exceptions import ConnectionClosedError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import redis
import redis.asyncio as aredis
import json
import copy
from typing import List, Dict, Any
import requests
import asyncio
import logging
import os
import uuid
import time
import datetime
PUBLIC_BACKEND_URL = os.getenv("PUBLIC_BACKEND_URL", "http://localhost:8001")

from app.api.dependencies import get_db, get_current_user, csrf_protect
from app.db.models import Stream, User, VPS
from app.schemas.stream import StreamCreate, StreamUpdate, Stream as StreamSchema, StreamInfo
from app.schemas.youtube import YouTubeLinkPayload

from app.services.youtube_service import get_video_stats
from app.workers.stream_tasks import stream_video, celery_app, monitor_youtube_stream, generate_stream_thumbnail

try:
    import vlc
    VLC_AVAILABLE = True
except (ImportError, OSError):
    VLC_AVAILABLE = False
    logging.warning("VLC library not found or failed to load. Preview in VLC will not be available.")

router = APIRouter()
redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
aredis_client = aredis.Redis(host='redis', port=6379, db=0, decode_responses=True)
logger = logging.getLogger(__name__)
vlc_players = {}



def deep_update(mapping: Dict[str, Any], *updating_mappings: Dict[str, Any]) -> Dict[str, Any]:
    for updating_mapping in updating_mappings:
        for k, v in updating_mapping.items():
            if k in mapping and isinstance(mapping[k], dict) and isinstance(v, dict):
                mapping[k] = deep_update(mapping[k], v)
            else:
                mapping[k] = v
    return mapping

def _publish_status(stream_id: int, status: str, details: str = ""):
    message = json.dumps({"type": "status_update", "stream_id": stream_id, "status": status, "details": details})
    redis_client.publish(f"stream_status_{stream_id}", message)

from sqlalchemy.orm import load_only

@router.get("/", response_model=List[StreamInfo])
def get_streams(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Stream).options(
        load_only(
            Stream.id, Stream.name, Stream.status, Stream.created_at, Stream.user_id,
            Stream.duration_seconds, Stream.youtube_video_id, Stream.youtube_view_count,
            Stream.youtube_like_count, Stream.youtube_comment_count, Stream.thumbnail_url,
            Stream.started_at
        )
    )
    if current_user.role != "admin":
        query = query.filter(Stream.user_id == current_user.id)
    
    streams = query.all()
    base_url = PUBLIC_BACKEND_URL
    streams_with_hls = []
    for stream in streams:
        if stream.settings and 'sources' in stream.settings:
            for source in stream.settings['sources']:
                if source.get('type') == 'image' and 'image_items' in source:
                    source['items'] = source.get('image_items')
                if source.get('type') == 'audio' and 'audio_items' in source:
                    source['items'] = source.get('audio_items')
        
        stream_info = StreamInfo.from_orm(stream)
        if stream.status in ["Previewing", "LIVE", "Running"]:
            stream_info.hls_url = f"/media/hls/{stream.id}/stream.m3u8"
        
        
        streams_with_hls.append(stream_info)
        
    return streams_with_hls

@router.get("/{stream_id}", response_model=StreamSchema)
def get_stream(request: Request, stream_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this stream")
    
    base_url = PUBLIC_BACKEND_URL
    if stream.status in ["Previewing", "LIVE", "Running"]:
        stream.hls_url = f"/media/hls/{stream.id}/stream.m3u8"
    
    
    
    if stream.settings and 'sources' in stream.settings:
        for source in stream.settings['sources']:
            if source.get('type') == 'image' and 'image_items' in source:
                source['items'] = source.get('image_items')
            if source.get('type') == 'audio' and 'audio_items' in source:
                source['items'] = source.get('audio_items')

    return stream
from app.schemas.stream import StreamStatus

@router.get("/{stream_id}/status", response_model=StreamStatus)
def get_stream_status(stream_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this stream")

    progress = 0.0
    if stream.status == "Downloading":
        try:
            total_files = int(redis_client.get(f"stream:{stream_id}:download_total") or 0)
            downloaded_files = int(redis_client.get(f"stream:{stream_id}:download_progress") or 0)
            if total_files > 0:
                progress = (downloaded_files / total_files) * 100
        except (ValueError, TypeError):
            progress = 0.0 # Default to 0 if redis keys are not numbers

    return StreamStatus(status=stream.status, progress=progress)

@router.post("/", response_model=StreamSchema, status_code=201, dependencies=[Depends(csrf_protect)])
def create_stream(stream: StreamCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if stream.vps_id:
        vps = db.query(VPS).filter(VPS.id == stream.vps_id, VPS.user_id == current_user.id).first()
        if not vps and current_user.role != "admin":
            raise HTTPException(status_code=404, detail="VPS not found or you don't have permission to use it.")

    stream_data = stream.dict()
    settings_dict = stream_data.pop("settings", None)
    platforms = settings_dict.get("platforms", {}) if settings_dict else {}
    
    db_stream = Stream(**stream_data, user_id=current_user.id)
    db_stream.settings = settings_dict
    
    if platforms:
        db_stream.youtube_key = platforms.get("youtube_stream_key")
        db_stream.facebook_key = platforms.get("facebook_stream_key")
        db_stream.twitch_key = platforms.get("twitch_stream_key")
    
    db_stream.status = "QUEUED"
    db.add(db_stream)
    db.commit()

    # Publish the queued status immediately
    _publish_status(db_stream.id, "QUEUED", "Stream is queued for processing.")

    # Schedule thumbnail generation
    generate_stream_thumbnail.delay(db_stream.id)

    db.refresh(db_stream)
    return db_stream

@router.put("/{stream_id}", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def update_stream(stream_id: int, stream: StreamUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and db_stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this stream")
    
    update_data = stream.dict(exclude_unset=True)
    
    if "vps_id" in update_data and update_data["vps_id"] is not None:
        vps = db.query(VPS).filter(VPS.id == update_data["vps_id"])
        if current_user.role != "admin":
            vps = vps.filter(VPS.user_id == current_user.id)
        if not vps.first():
            raise HTTPException(status_code=404, detail="VPS not found or you don't have permission to use it.")
            
    if "settings" in update_data and update_data["settings"] is not None:
        existing_settings = copy.deepcopy(db_stream.settings) if db_stream.settings else {}
        
        

        updated_settings = deep_update(existing_settings, update_data["settings"])
        db_stream.settings = updated_settings
        flag_modified(db_stream, "settings")

        platforms = updated_settings.get("platforms", {})
        db_stream.youtube_key = platforms.get("youtube_stream_key")
        db_stream.facebook_key = platforms.get("facebook_stream_key")
        db_stream.twitch_key = platforms.get("twitch_stream_key")
        
        if "settings" in update_data:
            del update_data["settings"]

    for key, value in update_data.items():
        setattr(db_stream, key, value)
        
    db_stream.status = "QUEUED"
    db.commit()
    
    # Publish the queued status immediately
    _publish_status(db_stream.id, "QUEUED", "Stream is queued for processing.")
    
    # Schedule thumbnail generation
    generate_stream_thumbnail.delay(db_stream.id)
    
    db.refresh(db_stream)
    return db_stream

from app.services import ffmpeg_service

@router.patch("/{stream_id}/settings", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def update_stream_live_settings(stream_id: int, settings: Dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and db_stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this stream's settings")

    if db_stream.status not in ["LIVE", "Previewing", "Running"]:
        raise HTTPException(status_code=400, detail=f"Cannot update settings for a stream that is not live or previewing. Current status: {db_stream.status}")

    # Update the live filter file
    try:
        ffmpeg_service.update_stream_settings(stream_id, settings)
    except Exception as e:
        logger.error(f"Failed to update live stream filter file for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to apply live settings update.")

    # Also persist the changes to the database for future runs
    existing_settings = copy.deepcopy(db_stream.settings) if db_stream.settings else {}
    updated_settings = deep_update(existing_settings, settings)
    db_stream.settings = updated_settings
    flag_modified(db_stream, "settings")
    
    db.commit()
    db.refresh(db_stream)
    
    return db_stream
@router.post("/{stream_id}/link_youtube", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def link_youtube_to_stream(stream_id: int, payload: YouTubeLinkPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_stream = db.query(Stream).filter(Stream.id == stream_id, Stream.user_id == current_user.id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found or not authorized")
    
    video_id = payload.youtube_video_id
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube Video ID provided.")
    
    stats = get_video_stats(video_id)
    if not stats:
        raise HTTPException(status_code=503, detail="Could not retrieve video statistics from YouTube.")

    db_stream.youtube_video_id = video_id
    db_stream.youtube_view_count = stats.get("view_count")
    db_stream.youtube_like_count = stats.get("like_count")
    db_stream.youtube_comment_count = stats.get("comment_count")
    db_stream.duration_seconds = stats.get("duration_seconds")
    db_stream.thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    
    db.commit()
    db.refresh(db_stream)
    return db_stream

@router.delete("/{stream_id}", status_code=204, dependencies=[Depends(csrf_protect)])
def delete_stream(stream_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and db_stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this stream")
    
    if db_stream.status not in ["Idle", "Error"]:
        raise HTTPException(status_code=400, detail="Please stop the stream before deleting it.")

    db.delete(db_stream)
    db.commit()
    return

def stop_vlc_player(stream_id: int):
    if stream_id in vlc_players:
        player = vlc_players.pop(stream_id)
        if player.is_playing():
            player.stop()
        logger.info(f"VLC player for stream {stream_id} stopped.")

def stop_existing_task(stream_id: int):
    task_id = redis_client.get(f"stream_task_id_{stream_id}")
    if task_id:
        celery_app.control.revoke(task_id, terminate=True, signal='SIGTERM')
        redis_client.delete(f"stream_task_id_{stream_id}")
    stop_vlc_player(stream_id)

@router.post("/{stream_id}/preview", dependencies=[Depends(csrf_protect)])
def preview_stream(request: Request, stream_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to preview this stream")

    stop_existing_task(stream_id)
    
    task = stream_video.delay(stream_id, is_preview=True)
    redis_client.set(f"stream_task_id_{stream_id}", task.id)
    
    hls_url_relative = f"/media/hls/{stream.id}/stream.m3u8"
    
    message = "Stream preview starting..."
    if VLC_AVAILABLE:
        try:
            base_url = PUBLIC_BACKEND_URL
            hls_url_full = f"{base_url}{hls_url_relative}"
            logger.info(f"VLC is available, attempting to start preview with URL: {hls_url_full}")
            time.sleep(2)
            instance = vlc.Instance()
            player = instance.media_player_new()
            media = instance.media_new(hls_url_full)
            player.set_media(media)
            player.play()
            vlc_players[stream.id] = player
            message = "Stream preview starting... and attempting to open in VLC."
        except Exception as e:
            logger.error(f"Failed to open preview in VLC: {e}")
            message = "Stream preview starting... (failed to open in VLC)."

    return {"message": message, "task_id": task.id, "hls_url": hls_url_relative}

@router.post("/{stream_id}/go-live", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def go_live_stream(request: Request, stream_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to start this stream")

    if not stream.settings or not stream.settings.get('sources'):
        raise HTTPException(status_code=400, detail="Cannot start a stream with no sources.")

    if stream.youtube_video_id:
        logger.info(f"Restarting stream {stream_id}. Clearing old YouTube link: {stream.youtube_video_id}")
        stream.youtube_video_id = None
    

    stop_existing_task(stream_id)

    stream.status = "Processing"
    stream.started_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(stream)
    _publish_status(stream.id, stream.status)

    if not stream.vps_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Please select a VPS to run the stream. Local worker is for admins only.")

    base_url = PUBLIC_BACKEND_URL
    task = stream_video.delay(stream_id, is_preview=False, public_url=base_url)
    redis_client.set(f"stream_task_id_{stream_id}", task.id)
        
    return stream

def set_stream_to_idle(stream_id: int, delay: int):
    """
    A background task to set a stream's status to Idle after a delay.
    """
    from app.db import session as db_session
    time.sleep(delay)
    db = db_session.SessionLocal()
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        # Only switch to Idle if the stream is still in the STOPPED state
        if stream and stream.status == "STOPPED":
            stream.status = "Idle"
            stream.started_at = None
            db.commit()
            _publish_status(stream.id, "Idle", "Stream is now idle.")
    finally:
        db.close()

@router.post("/{stream_id}/stop", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def stop_stream(stream_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to stop this stream")

    from app.workers.stream_tasks import stop_vps_stream

    # Immediately update status to give user feedback
    stream.status = "STOPPING"
    db.commit()
    db.refresh(stream)
    _publish_status(stream.id, stream.status, "Initiating stream stop sequence.")

    if stream.vps_id:
        stop_vps_stream.delay(stream_id)
    else:
        # For local streams, the stop is more direct
        stop_existing_task(stream_id)
        stream.status = "STOPPED"
        stream.started_at = None
        db.commit()
        db.refresh(stream)
        _publish_status(stream.id, stream.status, "Stream stopped.")
        # Schedule the transition to Idle to happen in the background
        background_tasks.add_task(set_stream_to_idle, stream_id, 3)

    return stream
@router.websocket("/ws/stream_status/{stream_id}")
async def websocket_stream_status(websocket: WebSocket, stream_id: int, db: Session = Depends(get_db)):
    await websocket.accept()
    
    # Verify user has access to this stream
    try:
        current_user = await get_current_user(websocket, db)
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Stream not found")
            return
        if current_user.role != "admin" and stream.user_id != current_user.id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authorized")
            return
    except HTTPException:
         await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
         return

    pubsub = aredis_client.pubsub()
    channel = f"stream_status_{stream_id}"
    await pubsub.subscribe(channel)
    
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = json.loads(message['data'])
                # Fetch the latest stream data from DB to send a complete object
                updated_stream = db.query(Stream).filter(Stream.id == stream_id).first()
                if updated_stream:
                    stream_data = StreamSchema.from_orm(updated_stream).dict()
                    await websocket.send_json(stream_data)

    except (WebSocketDisconnect, ConnectionClosedError):
        logger.info(f"WebSocket for stream {stream_id} disconnected.")
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
