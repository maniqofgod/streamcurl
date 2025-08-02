from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
import psutil
import requests
from typing import Optional

from app.api.dependencies import get_db, get_current_user
from app.db.models import Overlay, User, Stream, VPS, GoogleDriveConfig
from app.services import gdrive_service

router = APIRouter()

@router.get("/data")
def get_dashboard_data(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    vps_id: Optional[int] = Query(None)
):
    # Base queries
    stream_query = db.query(Stream)
    if current_user.role != "admin":
        stream_query = stream_query.filter(Stream.user_id == current_user.id)

    # Stream stats
    total_streams = stream_query.count()
    active_streams = stream_query.filter(Stream.status.ilike('%live%')).count()
    inactive_streams = total_streams - active_streams
    
    # Recent streams
    recent_streams = stream_query.order_by(Stream.created_at.desc()).limit(5).all()

    # Google Drive Stats
    gdrive_stats = {
        "limit_gb": "N/A",
        "usage_gb": "N/A",
        "usage_percent": 0,
        "error": "Not Configured"
    }
    # Attempt to get stats for the current user. 
    # The service will handle whether the user has a token.
    stats = gdrive_service.get_drive_about(db, user=current_user)
    if stats:
        gdrive_stats = stats
    # If stats is None, it means the user (nor a global account) is configured.
    # The default "Not Configured" message will be shown, which is fine.


    # VPS stats
    vps_stats = {
        "cpu_usage_percent": 0,
        "ram_usage_percent": 0,
        "network_io": {"sent": "0 B", "recv": "0 B"},
        "error": None
    }
    if vps_id:
        vps = db.query(VPS).filter(VPS.id == vps_id)
        if current_user.role != "admin":
            vps = vps.filter(VPS.user_id == current_user.id)
        vps = vps.first()

        if vps:
            try:
                agent_url = f"http://{vps.ip_address}:{vps.port}/agent/v1/stats"
                headers = {"X-API-Key": vps.api_key}
                response = requests.get(agent_url, headers=headers, timeout=5)
                response.raise_for_status()
                data = response.json()
                vps_stats["cpu_usage_percent"] = data.get("cpu_usage_percent", 0)
                vps_stats["ram_usage_percent"] = data.get("ram_usage_percent", 0)
                vps_stats["network_io"] = data.get("network_io", {"sent": "N/A", "recv": "N/A"})
            except requests.exceptions.RequestException as e:
                vps_stats["error"] = f"Could not connect to VPS agent: {e}"
                vps_stats["network_io"] = {"sent": "Error", "recv": "Error"}
            except Exception as e:
                vps_stats["error"] = f"An unexpected error occurred: {e}"
                vps_stats["network_io"] = {"sent": "Error", "recv": "Error"}
        else:
            vps_stats["error"] = "VPS not found or you do not have permission to access it."
    elif current_user.role == "admin":
        # Fallback to local stats for admin if no VPS is selected
        vps_stats["cpu_usage_percent"] = psutil.cpu_percent(interval=None)
        vps_stats["ram_usage_percent"] = psutil.virtual_memory().percent
        try:
            net_io = psutil.net_io_counters()
            vps_stats["network_io"] = {"sent": f"{net_io.bytes_sent / 1e9:.2f} GB", "recv": f"{net_io.bytes_recv / 1e9:.2f} GB"}
        except Exception:
             vps_stats["network_io"] = {"sent": "N/A", "recv": "N/A"}


    # Base response for all users
    response_data = {
        "vps_stats": vps_stats,
        "gdrive_stats": gdrive_stats,
        "stream_stats": {
            "total": total_streams,
            "active": active_streams,
            "inactive": inactive_streams
        },
        "recent_streams": [
            {"id": s.id, "name": s.name, "status": s.status, "created_at": s.created_at.isoformat()}
            for s in recent_streams
        ]
    }

    # Add admin-specific data
    if current_user.role == "admin":
        response_data["admin_stats"] = {
            "total_users": db.query(User).count(),
            "total_all_streams": db.query(Stream).count()
        }

    return response_data