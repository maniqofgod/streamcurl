from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.api import streams, overlays, soundcloud, images, auth, youtube, admin, vps, dashboard, agent_callbacks, gdrive, media_files
from app.services import gdrive_service
from app.core import security
from app.schemas import user as user_schema
from app.db import base, session
from app.db.models import User, Stream
import os
from typing import List
import json
import asyncio
import logging
import redis.asyncio as aredis
from websockets.exceptions import ConnectionClosedError

from app.api.dependencies import get_db, get_current_user_for_websocket

from fastapi.responses import StreamingResponse
from pathlib import Path
import mimetypes


# Check for SECRET_KEY
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("No SECRET_KEY set for JWT. Please set it in your .env file.")


app = FastAPI()
aredis_client = aredis.Redis(host='redis', port=6379, db=0, decode_responses=True)
logger = logging.getLogger(__name__)

# Session Middleware for OAuth state
SECRET_KEY = os.getenv("SECRET_KEY")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

# CORS Middleware
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # Create database tables
    base.Base.metadata.create_all(bind=base.engine)
    # Manual migration for new columns
    inspector = inspect(base.engine)
    columns = [col['name'] for col in inspector.get_columns('streams')]
    with base.engine.connect() as connection:
        if 'description' not in columns:
            connection.execute(text('ALTER TABLE streams ADD COLUMN description VARCHAR(1024)'))
        if 'thumbnail_url' not in columns:
            connection.execute(text('ALTER TABLE streams ADD COLUMN thumbnail_url VARCHAR(1024)'))
        connection.commit()

    
    # Create a default admin user if one doesn't exist
    db = session.SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            admin_username = os.getenv("ADMIN_USERNAME", "admin")
            admin_password = os.getenv("ADMIN_PASSWORD", "admin")
            
            existing_user = db.query(User).filter(User.username == admin_username).first()
            if not existing_user:
                hashed_password = security.get_password_hash(admin_password)
                new_admin = User(
                    username=admin_username,
                    password_hash=hashed_password,
                    role="admin",
                    is_active=True
                )
                db.add(new_admin)
                db.commit()
                print(f"Admin user '{admin_username}' created.")
            elif existing_user.role != 'admin':
                existing_user.role = 'admin'
                db.commit()
                print(f"User '{admin_username}' promoted to admin.")
        

    finally:
        db.close()



@app.get("/v1/health")
def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{stream_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_for_websocket)
):

    stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not stream:
        await websocket.close(code=status.WS_1007_INVALID_FRAMEWORK_PAYLOAD, reason="Stream not found")
        return
    if current_user.role != "admin" and stream.user_id != current_user.id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authorized")
        return

    await websocket.accept()

    async def redis_listener(ws: WebSocket):
        async with aredis_client.pubsub() as pubsub:
            await pubsub.subscribe(f"stream_status_{stream_id}")
            while True:
                try:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message:
                        await ws.send_text(message['data'])
                except asyncio.CancelledError:
                    logger.info(f"Redis listener task for stream {stream_id} cancelled.")
                    break
                except (WebSocketDisconnect, ConnectionClosedError):
                    logger.info(f"WebSocket disconnected for stream {stream_id} during redis listen.")
                    break
                except Exception as e:
                    logger.error(f"Exception in Redis listener for stream {stream_id}: {e}")
                    break

    if stream:
        try:
            initial_status = json.dumps({"type": "status_update", "stream_id": stream_id, "status": stream.status, "details": ""})
            await websocket.send_text(initial_status)
        except (WebSocketDisconnect, ConnectionClosedError):
            return

    listener_task = asyncio.create_task(redis_listener(websocket))
    
    try:
        while True:
            await asyncio.sleep(60)
    except (WebSocketDisconnect, ConnectionClosedError):
        logger.info(f"Client for stream {stream_id} disconnected.")
    finally:
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass

app.include_router(media_files.router, prefix="/v1/media-files", tags=["media_files"])
app.include_router(streams.router, prefix="/v1/streams", tags=["streams"])
app.include_router(overlays.router, prefix="/v1/overlays", tags=["overlays"])
app.include_router(soundcloud.router, prefix="/v1/soundcloud", tags=["soundcloud"])
app.include_router(images.router, prefix="/v1/images", tags=["images"])
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(youtube.router, prefix="/v1/youtube", tags=["youtube"])
app.include_router(admin.router, prefix="/v1/admin", tags=["admin"])
app.include_router(gdrive.router, prefix="/v1/gdrive", tags=["gdrive"])
app.include_router(vps.router, prefix="/v1/vps", tags=["vps"])
app.include_router(dashboard.router, prefix="/v1/dashboard", tags=["dashboard"])
app.include_router(agent_callbacks.router, prefix="/v1", tags=["agent_callbacks"])


# This must be mounted last
# app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

app.mount("/media", StaticFiles(directory="media"), name="media")
