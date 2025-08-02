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
    api_key: str
    port: int = 8002

# Schema for creating a new VPS via SSH credentials (DEPRECATED)
class VPSCreateSSH(BaseModel):
    name: str
    ssh_host: str
    ssh_port: int = 22
    ssh_user: str
    ssh_password: str

class VPSCreate(VPSBase):
    user_id: Optional[int] = None

# Schema for updating an existing VPS
class VPSUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    api_key: Optional[str] = None
    port: Optional[int] = None

# Schema for reading/returning VPS data from the API
class VPSStats(BaseModel):
    cpu_usage: float
    ram_usage: float

class VPS(VPSBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True