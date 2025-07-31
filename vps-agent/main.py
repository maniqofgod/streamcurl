import asyncio
import logging
import os
import subprocess
from typing import Dict, List, Optional

import psutil
import requests
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field

# Konfigurasi Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Inisialisasi Aplikasi FastAPI
app = FastAPI(title="VPS Streaming Agent", version="1.0.0")

# Kunci API untuk mengamankan endpoint, diambil dari environment variable
AGENT_API_KEY = os.getenv("AGENT_API_KEY", "a-very-secret-key")

# Struktur data untuk menyimpan proses yang sedang berjalan
# Key: stream_id (int), Value: Popen object
running_processes: Dict[int, subprocess.Popen] = {}

# --- Model Data (Pydantic) ---

class StreamPayload(BaseModel):
    stream_id: int = Field(..., description="ID unik untuk stream.")
    ffmpeg_command: List[str] = Field(..., description="Perintah FFmpeg yang akan dieksekusi.")
    callback_url: str = Field(..., description="URL untuk mengirim pembaruan status.")
    callback_api_key: str = Field(..., description="Kunci API untuk otentikasi callback.")

class StopPayload(BaseModel):
    stream_id: int = Field(..., description="ID unik untuk stream yang akan dihentikan.")

class StatusUpdatePayload(BaseModel):
    stream_id: int
    status: str
    details: Optional[str] = None

# --- Fungsi Helper & Dependensi ---

def get_api_key(authorization: str = Header(None)):
    """Dependensi untuk memeriksa header otentikasi."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header is missing")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
        
    if parts[1] != AGENT_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return parts[1]

async def send_status_update(payload: StatusUpdatePayload, url: str, api_key: str):
    """Mengirim pembaruan status ke backend utama."""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        # Menggunakan httpx sebagai pengganti requests untuk async
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload.dict(), headers=headers, timeout=10)
            response.raise_for_status()
            logger.info(f"Successfully sent status '{payload.status}' for stream {payload.stream_id} to {url}")
    except ImportError:
        logger.error("httpx is not installed. Cannot send status update.")
    except httpx.RequestError as e:
        logger.error(f"Failed to send status update for stream {payload.stream_id}: {e}")

async def monitor_stream_process(payload: StreamPayload):
    """Memantau proses FFmpeg dan mengirim callback saat selesai."""
    stream_id = payload.stream_id
    process = running_processes.get(stream_id)
    
    if not process:
        logger.error(f"Monitor: Process for stream {stream_id} not found.")
        return

    await asyncio.sleep(5)
    if process.poll() is None:
        status_payload = StatusUpdatePayload(stream_id=stream_id, status="LIVE", details="Stream is now live on VPS.")
        await send_status_update(status_payload, payload.callback_url, payload.callback_api_key)

    stdout, stderr = await process.communicate()
    
    running_processes.pop(stream_id, None)
    
    if process.returncode == 0:
        final_status = "Idle"
        details = "Stream completed successfully."
    else:
        error_output = stderr.decode('utf-8', errors='ignore').strip()
        final_status = "Error"
        details = f"FFmpeg failed on VPS: {error_output[-500:]}"

    final_status_payload = StatusUpdatePayload(stream_id=stream_id, status=final_status, details=details)
    await send_status_update(final_status_payload, payload.callback_url, payload.callback_api_key)


def stop_process_tree(pid: int):
    """Menghentikan proses dan semua proses turunannya."""
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        for child in children:
            child.terminate()
        parent.terminate()
        gone, still_alive = psutil.wait_procs(children + [parent], timeout=3)
        for p in still_alive:
            p.kill()
    except psutil.NoSuchProcess:
        pass # Proses sudah tidak ada, tidak masalah

# --- Endpoint API ---

@app.on_event("startup")
async def startup_event():
    logger.info("VPS Streaming Agent is starting up.")

@app.get("/health", summary="Health Check")
async def health_check():
    """Endpoint untuk memeriksa apakah agen berjalan."""
    return {"status": "ok", "running_streams": len(running_processes)}

@app.post("/test/ffmpeg", summary="Test FFmpeg command")
async def test_ffmpeg(api_key: str = Depends(get_api_key)):
    """Menjalankan 'ffmpeg -version' untuk memeriksa apakah FFmpeg dapat dieksekusi."""
    try:
        process = await asyncio.create_subprocess_exec(
            'ffmpeg', '-version',
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode == 0:
            return {"status": "success", "version": stdout.decode().split('\n')[0]}
        else:
            raise HTTPException(status_code=500, detail=f"FFmpeg execution failed: {stderr.decode()}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="FFmpeg command not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@app.post("/stream/start", summary="Start a new stream")
async def start_stream(payload: StreamPayload, background_tasks: BackgroundTasks, api_key: str = Depends(get_api_key)):
    stream_id = payload.stream_id
    if stream_id in running_processes:
        process_to_stop = running_processes.pop(stream_id)
        stop_process_tree(process_to_stop.pid)

    try:
        process = await asyncio.create_subprocess_exec(
            *payload.ffmpeg_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        running_processes[stream_id] = process
        background_tasks.add_task(monitor_stream_process, payload)
        return {"status": "success", "message": f"Stream {stream_id} started.", "pid": process.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start FFmpeg: {e}")

@app.post("/stream/stop", summary="Stop a running stream")
async def stop_stream(payload: StopPayload, api_key: str = Depends(get_api_key)):
    stream_id = payload.stream_id
    if stream_id not in running_processes:
        raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found.")
    process = running_processes.pop(stream_id)
    stop_process_tree(process.pid)
    return {"status": "success", "message": f"Stream {stream_id} stopped."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)