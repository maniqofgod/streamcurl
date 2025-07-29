from pydantic import BaseModel
from typing import Optional
from .vps import VPS

class UserBase(BaseModel):
    username: str
    role: str = 'user'

class UserCreate(UserBase):
    password: str
    role: str = 'user'

class User(UserBase):
    id: int
    role: str
    is_active: bool
    is_superuser: Optional[bool] = None
    profile_image_url: Optional[str] = None
    vps: list[VPS] = []
    
    # GDrive fields
    gdrive_folder_id: Optional[str] = None
    gdrive_quota_gb: Optional[int] = None
    gdrive_usage_bytes: Optional[int] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    is_active: Optional[bool] = None
    gdrive_quota_gb: Optional[int] = None

class UserUpdateRole(BaseModel):
    role: str

class UserUpdatePassword(BaseModel):
    password: str


class UserChangePassword(BaseModel):
    current_password: str
    new_password: str
