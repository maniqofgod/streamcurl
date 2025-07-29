from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import logging
import json
import redis

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

async def verify_agent_token(x_agent_token: str = Header(None)):
    if not x_agent_token:
        logger.warning("Agent callback attempt without token.")
        raise HTTPException(status_code=401, detail="Agent token missing")
    if x_agent_token != AGENT_CALLBACK_API_KEY:
        logger.warning("Unauthorized agent callback attempt with wrong token.")
        raise HTTPException(status_code=403, detail="Invalid agent token")

@router.post("/status-update", dependencies=[Depends(verify_agent_token)])
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
