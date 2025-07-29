from pydantic import BaseModel

class WorkerNodeBase(BaseModel):
    hostname: str
    ip_address: str

class WorkerNodeCreate(WorkerNodeBase):
    pass

class WorkerNode(WorkerNodeBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True
