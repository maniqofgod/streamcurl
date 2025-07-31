from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..schemas import vps as vps_schema
from ..db import models
from .dependencies import get_current_user, get_db

router = APIRouter()

@router.post("/", response_model=vps_schema.VPS)
def create_vps(vps: vps_schema.VPSCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_vps = models.VPS(**vps.dict(), user_id=current_user.id)
    db.add(db_vps)
    db.commit()
    db.refresh(db_vps)
    return db_vps

@router.get("/", response_model=List[vps_schema.VPS])
def read_vps_list(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.VPS).filter(models.VPS.user_id == current_user.id).all()

@router.get("/{vps_id}", response_model=vps_schema.VPS)
def read_vps(vps_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id, models.VPS.user_id == current_user.id).first()
    if db_vps is None:
        raise HTTPException(status_code=404, detail="VPS not found")
    return db_vps

@router.put("/{vps_id}", response_model=vps_schema.VPS)
def update_vps(vps_id: int, vps: vps_schema.VPSUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id, models.VPS.user_id == current_user.id).first()
    if db_vps is None:
        raise HTTPException(status_code=404, detail="VPS not found")
    
    update_data = vps.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_vps, key, value)
        
    db.commit()
    db.refresh(db_vps)
    return db_vps

@router.delete("/{vps_id}", response_model=vps_schema.VPS)
def delete_vps(vps_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id, models.VPS.user_id == current_user.id).first()
    if db_vps is None:
        raise HTTPException(status_code=404, detail="VPS not found")
    db.delete(db_vps)
    db.commit()
    return db_vps
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import models, session
from app.schemas import vps as vps_schema
from app.api.dependencies import get_current_user

router = APIRouter()

@router.post("/{vps_id}/test", response_model=vps_schema.VPSTestResult)
async def test_vps_connection(vps_id: int, db: Session = Depends(session.get_db), current_user: models.User = Depends(get_current_user)):
    """
    Test the connection to a VPS agent and check its FFmpeg installation.
    """
    db_vps = db.query(models.VPS).filter(models.VPS.id == vps_id).first()
    if not db_vps:
        raise HTTPException(status_code=404, detail="VPS not found")
    
    # Pastikan pengguna memiliki akses ke VPS ini (baik pemilik atau admin)
    if db_vps.user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to test this VPS")

    agent_url = f"http://{db_vps.ip_address}:{db_vps.port}"
    headers = {"Authorization": f"Bearer {db_vps.api_key}"}
    
    connection_status = {"status": "failure", "details": "Test not run"}
    ffmpeg_status = {"status": "failure", "details": "Test not run"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # 1. Test koneksi dasar
            response = await client.get(f"{agent_url}/health", headers=headers)
            response.raise_for_status()
            connection_status = {"status": "success", "details": response.json()}
        except httpx.RequestError as e:
            connection_status = {"status": "failure", "details": f"Connection failed: {e}"}
        except Exception as e:
            connection_status = {"status": "failure", "details": f"An unexpected error occurred: {e}"}

        # 2. Test FFmpeg jika koneksi berhasil
        if connection_status["status"] == "success":
            try:
                response = await client.post(f"{agent_url}/test/ffmpeg", headers=headers)
                response.raise_for_status()
                ffmpeg_status = {"status": "success", "details": response.json()}
            except httpx.RequestError as e:
                ffmpeg_status = {"status": "failure", "details": f"FFmpeg test request failed: {e}"}
            except Exception as e:
                ffmpeg_status = {"status": "failure", "details": f"An unexpected error occurred during FFmpeg test: {e}"}

    return vps_schema.VPSTestResult(
        connection=connection_status,
        ffmpeg=ffmpeg_status
    )