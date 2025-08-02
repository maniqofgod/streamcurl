from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import datetime

# Represents a single image within a source
class ImageInSource(BaseModel):
    id: str
    display_name: str
    filepath: Optional[str] = None # Make optional for GDrive
    storage_type: str = 'local'
    gdrive_file_id: Optional[str] = None
    transform: Dict[str, Any] = Field(default_factory=dict)
    chromaKey: Dict[str, Any] = Field(default_factory=dict)

# Represents a single video within a playlist
class VideoInPlaylist(BaseModel):
    id: str
    display_name: str
    filepath: str
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    transform: Dict[str, Any] = Field(default_factory=dict)
    muted: bool = False
    loop: bool = False
    effects: Dict[str, Any] = Field(default_factory=dict)
    chromaKey: Dict[str, Any] = Field(default_factory=dict)

# Represents a single audio item
class AudioInPlaylist(BaseModel):
    id: str
    display_name: str
    filepath: str
    duration: Optional[float] = None
    loop: bool = False
    storage_type: str = 'local'
    gdrive_file_id: Optional[str] = None

# Settings for individual sources
class SourceSettings(BaseModel):
    id: str
    type: str
    name: str
    # Video/Playlist specific
    playlist: Optional[List[VideoInPlaylist]] = None
    image_items: Optional[List[ImageInSource]] = Field(default_factory=list, alias='items')
    playbackMode: Optional[str] = "individual"
    # Audio specific
    audio_items: Optional[List[AudioInPlaylist]] = None # For audio lists
    volume: Optional[float] = 1.0
    
    # Text specific
    text: Optional[str] = None
    font: Optional[str] = None
    size: Optional[int] = None
    color: Optional[str] = None
    effect: Optional[str] = None
    # General transform/positioning for all sources
    transform: Dict[str, Any] = Field(default_factory=dict)

# Settings for Scheduling
class ScheduleSettings(BaseModel):
    start_option: str = 'immediately'
    start_date: Optional[str] = None
    end_option: str = 'never'
    end_date: Optional[str] = None
    end_duration_hours: Optional[str] = None
    repeat: bool = False
    repeat_delay: Optional[str] = None

# Settings for Platforms
class PlatformSettings(BaseModel):
    youtube_stream_key: Optional[str] = None
    facebook_stream_key: Optional[str] = None
    twitch_stream_key: Optional[str] = None

# Settings for Advanced Configuration
class AdvancedSettings(BaseModel):
    resolution: Optional[str] = None
    transcode_mode: Optional[str] = 'vbr'
    video_bitrate: Optional[str] = '3000'
    video_fps: Optional[str] = '30'
    audio_bitrate: Optional[str] = '160'
    mute_original_video: Optional[bool] = False

# Main container for all stream settings
class StreamSettings(BaseModel):
    aspectRatio: Optional[str] = None
    sources: List[SourceSettings] = Field(default_factory=list)
    schedule: ScheduleSettings = Field(default_factory=ScheduleSettings)
    platforms: PlatformSettings = Field(default_factory=PlatformSettings)
    advanced: AdvancedSettings = Field(default_factory=AdvancedSettings)

class StreamBase(BaseModel):
    name: str
    description: Optional[str] = None
    settings: Optional[StreamSettings] = None
    vps_id: Optional[int] = None

class StreamCreate(StreamBase):
    pass

class StreamUpdate(StreamBase):
    name: Optional[str] = None # Make all fields optional for update
    youtube_video_id: Optional[str] = None
    youtube_view_count: Optional[int] = None
    youtube_like_count: Optional[int] = None
    youtube_comment_count: Optional[int] = None
    youtube_live_viewers: Optional[int] = None

class Stream(StreamBase):
    id: int
    user_id: int
    status: str
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    duration_seconds: Optional[int] = None
    youtube_video_id: Optional[str] = None
    youtube_view_count: Optional[int] = None
    youtube_like_count: Optional[int] = None
    youtube_comment_count: Optional[int] = None
    youtube_live_viewers: Optional[int] = None
    thumbnail_url: Optional[str] = None
    hls_url: Optional[str] = None

    class Config:
        from_attributes = True

class StreamInfo(BaseModel):
    id: int
    name: str
    status: str
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    user_id: int
    duration_seconds: Optional[int] = None
    youtube_video_id: Optional[str] = None
    youtube_view_count: Optional[int] = None
    youtube_like_count: Optional[int] = None
    youtube_comment_count: Optional[int] = None
    youtube_live_viewers: Optional[int] = None
    thumbnail_url: Optional[str] = None
    hls_url: Optional[str] = None

    class Config:
        from_attributes = True

class StreamStatus(BaseModel):
    status: str
    progress: Optional[float] = 0.0

class GoLivePayload(BaseModel):
    live_platform: str = Field(..., description="The platform to go live on, e.g., 'youtube', 'facebook', 'twitch'")
    vps_id: Optional[int] = Field(None, description="The ID of the VPS to run the stream on. If null, uses the stream's current VPS setting.")
