from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    TIMESTAMP,
    JSON,
    Float,
    Text,
    BigInteger
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default='user')
    is_active = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False, nullable=False, server_default='false')
    profile_image_url = Column(String(1024), nullable=True)
    
    # Google Drive related fields per user
    gdrive_folder_id = Column(String(255), nullable=True)
    gdrive_token = Column(Text, nullable=True)
    gdrive_quota_gb = Column(Integer, nullable=False, default=50)
    gdrive_usage_bytes = Column(BigInteger, nullable=False, default=0)

    vps = relationship("VPS", back_populates="user")


class GoogleDriveConfig(Base):
    __tablename__ = "google_drive_config"
    id = Column(Integer, primary_key=True, index=True)
    # This table now holds only the global API credentials and token.
    # The folder ID is moved to the User model.
    credentials = Column(Text, nullable=True) # Stores the content of credentials.json
    token = Column(Text, nullable=True) # Stores the content of token.json
    account_email = Column(String(255), nullable=True)
    # drive_folder_id is removed from here.


class WorkerNode(Base):
    __tablename__ = "worker_nodes"
    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String(255), unique=True, nullable=False)
    ip_address = Column(String(45), nullable=False)
    is_active = Column(Boolean, default=True)


class Overlay(Base):
    __tablename__ = "overlays"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    display_name = Column(String(255), nullable=False)
    filepath = Column(String(1024), nullable=True) # Can be null for GDrive
    source = Column(String(50), nullable=False) # e.g., "upload", "pixabay"
    storage_type = Column(String(50), nullable=False, default='local')
    gdrive_file_id = Column(String(255), nullable=True)
    created_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    user = relationship("User")


class Stream(Base):
    __tablename__ = "streams"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    video_ids = Column(JSON)  # Changed from video_id to video_ids
    name = Column(String(255), nullable=False)
    description = Column(String(1024), nullable=True)
    youtube_key = Column(String(255), nullable=True)
    facebook_key = Column(String(255), nullable=True)
    twitch_key = Column(String(255), nullable=True)
    live_platform = Column(String(50), nullable=True)  # e.g., 'youtube', 'facebook', 'twitch'
    status = Column(String(20), nullable=False, default="idle")
    current_pid = Column(Integer)
    duration_seconds = Column(Integer, default=0)
    download_progress = Column(Float, nullable=False, default=0.0)
    
    # YouTube stats fields
    youtube_video_id = Column(String(255), nullable=True)
    youtube_view_count = Column(Integer, default=0)
    youtube_like_count = Column(Integer, default=0)
    youtube_comment_count = Column(Integer, default=0)
    youtube_live_viewers = Column(Integer, default=0)
    thumbnail_url = Column(String(1024), nullable=True)

    vps_id = Column(Integer, ForeignKey("vps.id"), nullable=True)
    running_on_worker_id = Column(Integer, ForeignKey("worker_nodes.id"))
    settings = Column(JSON)
    created_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    started_at = Column(TIMESTAMP(timezone=True), nullable=True)
    user = relationship("User")
    worker = relationship("WorkerNode")
    vps = relationship("VPS", back_populates="streams")

class VPS(Base):
    __tablename__ = "vps"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=False)
    port = Column(Integer, nullable=False, default=8002)
    api_key = Column(String(255), nullable=False)
    user = relationship("User", back_populates="vps")
    streams = relationship("Stream", back_populates="vps")
