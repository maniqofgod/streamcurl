from pydantic import BaseModel
from typing import Optional

class YouTubeLinkPayload(BaseModel):
    youtube_video_id: str