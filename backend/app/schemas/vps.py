from pydantic import BaseModel
from typing import Optional, Any

# Schema for testing individual aspects of a VPS
class VPSTestStatus(BaseModel):
    status: str
    details: Any

# Schema for the overall result of a VPS test
class VPSTestResult(BaseModel):
    connection: VPSTestStatus
    ffmpeg: VPSTestStatus

# Base schema for VPS properties
class VPSBase(BaseModel):
    name: str
    ip_address: str
    port: int
    api_key: str

# Schema for creating a new VPS
class VPSCreate(VPSBase):
    pass

# Schema for updating an existing VPS
class VPSUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    api_key: Optional[str] = None

# Schema for reading/returning VPS data from the API
class VPS(VPSBase):
    id: int
    user_id: int
    cpu_usage: Optional[float] = None
    ram_usage: Optional[float] = None

    class Config:
        orm_mode = True