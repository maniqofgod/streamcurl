from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict
import httpx
import requests
import logging
from pydantic import BaseModel

from app.db.models import User, VPS
from app.schemas import vps as vps_schema
from app.db import models
from .dependencies import get_db, get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/", response_model=vps_schema.VPS, status_code=status.HTTP_201_CREATED)
async def create_vps(
    vps_create: vps_schema.VPSCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Creates a new VPS worker, tests the connection, and adds it to the database.
    The agent should already be installed on the VPS.
    """
    if current_user.role == 'admin' and vps_create.user_id:
        user_id_to_assign = vps_create.user_id
    else:
        user_id_to_assign = current_user.id

    agent_url = f"http://{vps_create.ip_address}:{vps_create.port}/agent/v1/health"
    headers = {"x-api-key": vps_create.api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(agent_url, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Agent connection failed. The agent responded with status {e.response.status_code}. Ensure the API key is correct."
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Agent connection failed. Could not connect to {e.request.url}. Please check the IP address, port, and firewall settings on the VPS."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {e}"
        )

    db_vps = models.VPS(
        name=vps_create.name,
        ip_address=vps_create.ip_address,
        api_key=vps_create.api_key,
        port=vps_create.port,
        user_id=user_id_to_assign
    )
    db.add(db_vps)
    db.commit()
    db.refresh(db_vps)
    return db_vps

@router.get("/", response_model=List[vps_schema.VPS])
def read_vps_list_for_user(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Lists all VPS workers assigned to the current user.
    Admins will see all VPS workers.
    """
    if current_user.role == 'admin':
        return db.query(models.VPS).all()
    return db.query(models.VPS).filter(models.VPS.user_id == current_user.id).all()

@router.delete("/{vps_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vps(vps_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Deletes a VPS worker.
    """
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if not db_vps:
        raise HTTPException(status_code=404, detail="VPS not found")
    
    if current_user.role != 'admin' and db_vps.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this VPS")
        
    db.delete(db_vps)
    db.commit()
    return

@router.put("/{vps_id}", response_model=vps_schema.VPS)
def update_vps(
    vps_id: int,
    vps_update: vps_schema.VPSUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Updates a VPS worker's details.
    """
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if not db_vps:
        raise HTTPException(status_code=404, detail="VPS not found")

    if current_user.role != 'admin' and db_vps.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this VPS")

    update_data = vps_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_vps, key, value)
    
    db.add(db_vps)
    db.commit()
    db.refresh(db_vps)
    return db_vps

@router.post("/{vps_id}/test", response_model=vps_schema.VPSTestResult)
async def test_vps_connection(vps_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Tests the connection to the VPS agent and checks its health.
    """
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if not db_vps:
        raise HTTPException(status_code=404, detail="VPS not found")
    
    if current_user.role != 'admin' and db_vps.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    agent_url = f"http://{db_vps.ip_address}:{db_vps.port}/agent/v1/health"
    headers = {"x-api-key": db_vps.api_key}
    
    connection_status = {"status": "failure", "details": "Test not run."}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(agent_url, headers=headers)
            response.raise_for_status()
            connection_status = {"status": "success", "details": response.json()}
        except httpx.RequestError as e:
            connection_status["details"] = f"Connection failed: {e}"
        except httpx.HTTPStatusError as e:
            connection_status["details"] = f"Agent returned an error: {e.response.status_code} - {e.response.text}"
        except Exception as e:
            connection_status["details"] = f"An unexpected error occurred: {e}"
            
    return vps_schema.VPSTestResult(
        connection=connection_status, 
        ffmpeg={"status": "not_tested", "details": "FFmpeg test not performed on this check."}
    )

@router.post("/{vps_id}/test-streaming", response_model=Dict)
async def test_vps_streaming(vps_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Tests the streaming capabilities of the VPS agent.
    """
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if not db_vps:
        raise HTTPException(status_code=404, detail="VPS not found")

    if current_user.role != 'admin' and db_vps.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    agent_url = f"http://{db_vps.ip_address}:{db_vps.port}/agent/v1/test-streaming"
    headers = {"x-api-key": db_vps.api_key}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(agent_url, headers=headers)
            response.raise_for_status()
            return {"message": "Streaming test successful!", "details": response.json()}
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not connect to agent for streaming test: {e}"
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Streaming test failed: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during streaming test: {e}"
        )

class AgentCommand(BaseModel):
    command: str

@router.post("/{vps_id}/manage", response_model=dict)
async def manage_vps_agent(
    vps_id: int,
    payload: AgentCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mengirim perintah manajemen (logs, stop, restart, status) ke agen VPS.
    """
    vps = db.query(VPS).filter(VPS.id == vps_id).first()
    if not vps:
        raise HTTPException(status_code=404, detail="VPS not found")
    
    if not current_user.is_superuser and vps.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    command = payload.command
    if command not in ["logs", "stop", "restart", "status"]:
        raise HTTPException(status_code=400, detail="Invalid command")

    try:
        http_method = "GET" if command in ["logs", "status"] else "POST"
        
        agent_url = f"http://{vps.ip_address}:8002/agent/v1/manage/{command}"
        headers = {"x-api-key": vps.api_key}
        
        logger.info(f"Mengirim perintah '{command}' ke agen VPS {vps.name} di {agent_url}")

        if http_method == "POST":
            response = requests.post(agent_url, headers=headers, timeout=45)
        else:
            response = requests.get(agent_url, headers=headers, timeout=45)
            
        response.raise_for_status()
        
        return {"output": response.text}

    except requests.exceptions.RequestException as e:
        logger.error(f"Gagal menghubungi agen VPS di {vps.ip_address} untuk perintah '{command}': {e}")
        raise HTTPException(status_code=502, detail=f"Could not connect to VPS agent: {e}")
    except Exception as e:
        logger.error(f"Terjadi kesalahan tak terduga saat menjalankan perintah '{command}' di VPS {vps_id}: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")