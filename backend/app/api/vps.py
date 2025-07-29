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