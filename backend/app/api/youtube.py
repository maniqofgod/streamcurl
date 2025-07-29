from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_user, csrf_protect
from app.db.models import Stream, User
from app.schemas.stream import Stream as StreamSchema
from app.schemas.youtube import YouTubeLinkPayload
from app.services.youtube_service import get_video_stats

router = APIRouter()

@router.post("/streams/{stream_id}/link_youtube", response_model=StreamSchema, dependencies=[Depends(csrf_protect)])
def link_youtube_to_stream(
    stream_id: int,
    payload: YouTubeLinkPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Links a YouTube video to a stream and fetches its statistics.
    """
    db_stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and db_stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this stream")

    video_id = payload.youtube_video_id
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube Video ID provided.")

    stats = get_video_stats(video_id)
    if not stats:
        raise HTTPException(
            status_code=503, 
            detail="Could not retrieve video statistics from YouTube. The video may be private, deleted, or the API key may be invalid/quota exceeded."
        )

    db_stream.youtube_video_id = video_id
    db_stream.youtube_view_count = stats.get("view_count")
    db_stream.youtube_like_count = stats.get("like_count")
    db_stream.youtube_comment_count = stats.get("comment_count")
    db_stream.youtube_live_viewers = stats.get("live_viewers")
    
    db.commit()
    db.refresh(db_stream)
    return db_stream

@router.get("/youtube/stats/{stream_id}", response_model=StreamSchema)
def get_youtube_stats(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get real-time statistics for a linked YouTube video.
    """
    db_stream = db.query(Stream).filter(Stream.id == stream_id).first()
    if not db_stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    if current_user.role != "admin" and db_stream.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this stream's stats")

    if not db_stream.youtube_video_id:
        raise HTTPException(status_code=404, detail="No YouTube video linked to this stream")

    stats = get_video_stats(db_stream.youtube_video_id)
    if not stats:
        raise HTTPException(
            status_code=503, 
            detail="Could not retrieve video statistics from YouTube."
        )

    db_stream.youtube_view_count = stats.get("view_count")
    db_stream.youtube_like_count = stats.get("like_count")
    db_stream.youtube_comment_count = stats.get("comment_count")
    db_stream.youtube_live_viewers = stats.get("live_viewers")
    
    db.commit()
    db.refresh(db_stream)
    return db_stream