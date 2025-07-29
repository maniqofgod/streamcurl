from pydantic import BaseModel, Field
from typing import Optional

class VPSBase(BaseModel):
    name: str
    ip_address: str
    port: int = Field(default=8001, description="Port agen di VPS")
    cpu_cores: int = Field(default=1, description="Jumlah core CPU")
    ram_gb: int = Field(default=2, description="Jumlah RAM dalam GB")
    
class VPSCreate(VPSBase):
    api_key: str

class VPSUpdate(VPSBase):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    api_key: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None

class VPS(VPSBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True