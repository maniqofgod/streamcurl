from pydantic import BaseModel, Field
from typing import Optional
import datetime

class OverlayBase(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=255)

class OverlayCreate(OverlayBase):
    filepath: Optional[str] = None
    source: str
    storage_type: str = 'local'
    gdrive_file_id: Optional[str] = None


class Overlay(OverlayBase):
    id: int
    user_id: Optional[int] = None
    filepath: Optional[str] = None
    source: str
    created_at: datetime.datetime
    storage_type: str
    gdrive_file_id: Optional[str] = None


    class Config:
        from_attributes = True

class DownloadRequest(BaseModel):
    url: str
