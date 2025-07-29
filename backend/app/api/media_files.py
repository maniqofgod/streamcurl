from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import FileResponse
import os
import logging

from app.db.models import User
from app.api.dependencies import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

# Kunci API statis untuk otentikasi agen internal.
# Sebaiknya ini dikelola melalui variabel lingkungan.
INTERNAL_API_KEY = os.getenv("INTERNAL_AGENT_ACCESS_KEY", "a-very-secret-internal-key")

async def verify_internal_api_key(x_internal_api_key: str = Header(None)):
    """Dependensi untuk memverifikasi kunci API internal dari agen."""
    if not x_internal_api_key or x_internal_api_key != INTERNAL_API_KEY:
        logger.warning(f"Upaya akses file media internal tidak sah.")
        raise HTTPException(status_code=403, detail="Akses ditolak: Kunci API internal tidak valid.")
    return True

@router.get("/{file_path:path}", dependencies=[Depends(verify_internal_api_key)])
async def get_media_file(file_path: str):
    """
    Menyajikan file media dari direktori /app/media.
    Ini digunakan oleh agen VPS untuk mengambil sumber media melalui HTTP.
    """
    # Keamanan: Pastikan path tidak mencoba untuk keluar dari direktori yang diizinkan.
    base_path = "/app/media/"
    full_path = os.path.abspath(os.path.join(base_path, file_path))

    if not full_path.startswith(base_path):
        logger.error(f"Upaya akses path traversal terdeteksi: {file_path}")
        raise HTTPException(status_code=400, detail="Path tidak valid.")

    if not os.path.exists(full_path):
        logger.error(f"File media tidak ditemukan di path: {full_path}")
        raise HTTPException(status_code=404, detail="File tidak ditemukan.")

    logger.info(f"Menyajikan file media: {full_path}")
    return FileResponse(path=full_path)