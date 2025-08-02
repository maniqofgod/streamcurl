from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import logging
import json
import redis
import shutil

from app.db.models import Stream
from app.api.dependencies import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

AGENT_CALLBACK_API_KEY = os.getenv("AGENT_CALLBACK_API_KEY", "a-very-secret-key-for-agents")
redis_client = redis.Redis(host='redis', port=6379, db=0)

class AgentStatusUpdate(BaseModel):
    stream_id: int
    status: str
    details: str = ""

async def verify_agent_api_key(x_agent_api_key: str = Header(None, alias="x-agent-api-key")):
    """Verifikasi kunci API yang dikirim oleh agen di header."""
    if not x_agent_api_key:
        logger.warning("Agent callback attempt without API key.")
        raise HTTPException(status_code=401, detail="Agent API Key missing")
    if x_agent_api_key != AGENT_CALLBACK_API_KEY:
        logger.warning("Unauthorized agent callback attempt with wrong API key.")
        raise HTTPException(status_code=403, detail="Invalid Agent API Key")

@router.post("/status-update", dependencies=[Depends(verify_agent_api_key)])
async def receive_agent_status_update(update: AgentStatusUpdate, db: Session = Depends(get_db)):
    """
    This endpoint receives status updates from a running VPS agent.
    """
    logger.info(f"Received status update from agent for stream {update.stream_id}: {update.status}")
    
    try:
        stream = db.query(Stream).filter(Stream.id == update.stream_id).first()
        if stream:
            stream.status = update.status
            db.commit()
            
            message = json.dumps({
                "type": "status_update",
                "stream_id": update.stream_id, 
                "status": update.status, 
                "details": update.details
            })
            redis_client.publish(f"stream_status_{update.stream_id}", message)
            logger.info(f"Successfully updated and published status for stream {update.stream_id}")
            return {"message": "Status update received"}
        else:
            logger.error(f"Stream with ID {update.stream_id} not found for agent status update.")
            raise HTTPException(status_code=404, detail="Stream not found")
            
    except Exception as e:
        logger.error(f"Failed to process agent status update for stream {update.stream_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error processing update")

@router.post("/upload-thumbnail/{stream_id}", dependencies=[Depends(verify_agent_api_key)])
async def upload_thumbnail_from_agent(stream_id: int, thumbnail_file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Menerima file thumbnail yang diunggah dari agen VPS dan menyimpannya.
    """
    logger.info(f"Menerima unggahan thumbnail untuk stream {stream_id} dari agen.")
    
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream:
            logger.error(f"Stream {stream_id} tidak ditemukan saat agen mengunggah thumbnail.")
            raise HTTPException(status_code=404, detail="Stream not found")

        thumbnail_dir = "/app/media/thumbnails"
        os.makedirs(thumbnail_dir, exist_ok=True)
        
        thumbnail_filename = f"{stream.id}.jpg"
        thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)

        if stream.thumbnail_url and os.path.exists(f"/app{stream.thumbnail_url}"):
            if os.path.basename(stream.thumbnail_url) != thumbnail_filename:
                 os.remove(f"/app{stream.thumbnail_url}")

        with open(thumbnail_path, "wb") as buffer:
            shutil.copyfileobj(thumbnail_file.file, buffer)
        
        stream.thumbnail_url = f"/media/thumbnails/{thumbnail_filename}"
        db.commit()
        
        logger.info(f"Berhasil menyimpan thumbnail dari agen untuk stream {stream_id} di {thumbnail_path}")
        return {"message": "Thumbnail uploaded successfully", "path": stream.thumbnail_url}

    except Exception as e:
        logger.error(f"Gagal memproses unggahan thumbnail dari agen untuk stream {stream_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error processing thumbnail upload")
