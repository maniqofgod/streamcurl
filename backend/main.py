from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.api import streams, overlays, soundcloud, images, auth, youtube, admin, vps, dashboard, agent_callbacks, gdrive, media_files, health
from app.services import gdrive_service
from app.db import base, session
from app.db.models import User, Stream
from app.db import models
import os
from typing import List
import json
import asyncio
import logging
import redis.asyncio as aredis
from websockets.exceptions import ConnectionClosedError

from app.api.dependencies import get_db, get_token_for_websocket, get_db_session
from app.core import security

from fastapi.responses import StreamingResponse
from pathlib import Path
import mimetypes
from jose import JWTError
import paramiko
from app.schemas import vps as vps_schema


# Check for SECRET_KEY
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("No SECRET_KEY set for JWT. Please set it in your .env file.")


app = FastAPI()
aredis_client = aredis.Redis(host='redis', port=6379, db=0, decode_responses=True)
logger = logging.getLogger(__name__)

# Session Middleware for OAuth state
SECRET_KEY = os.getenv("SECRET_KEY")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

# CORS Middleware
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    base.Base.metadata.create_all(bind=base.engine)
    inspector = inspect(base.engine)
    columns = [col['name'] for col in inspector.get_columns('streams')]
    with base.engine.connect() as connection:
        if 'description' not in columns:
            connection.execute(text('ALTER TABLE streams ADD COLUMN description VARCHAR(1024)'))
        if 'thumbnail_url' not in columns:
            connection.execute(text('ALTER TABLE streams ADD COLUMN thumbnail_url VARCHAR(1024)'))
        connection.commit()

    db = session.SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            admin_username = os.getenv("ADMIN_USERNAME", "admin")
            admin_password = os.getenv("ADMIN_PASSWORD", "admin")
            
            existing_user = db.query(User).filter(User.username == admin_username).first()
            if not existing_user:
                hashed_password = security.get_password_hash(admin_password)
                new_admin = User(
                    username=admin_username,
                    password_hash=hashed_password,
                    role="admin",
                    is_active=True
                )
                db.add(new_admin)
                db.commit()
                print(f"Admin user '{admin_username}' created.")
            elif existing_user.role != 'admin':
                existing_user.role = 'admin'
                db.commit()
                print(f"User '{admin_username}' promoted to admin.")
    finally:
        db.close()



@app.websocket("/ws/stream_status/{stream_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    stream_id: int,
    token: str = Depends(get_token_for_websocket)
):
    db = get_db_session()
    listener_task = None
    try:
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token missing")
            return
        try:
            payload = security.decode_access_token(token)
            username: str = payload.get("sub")
            if username is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
                return
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return
        
        current_user = security.get_user(db, username=username)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
            return

        await websocket.accept()

        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream:
            await websocket.close(code=status.WS_1007_INVALID_FRAMEWORK_PAYLOAD, reason="Stream not found")
            return
        if current_user.role != "admin" and stream.user_id != current_user.id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authorized")
            return

        initial_status = json.dumps({"type": "status_update", "stream_id": stream_id, "status": stream.status, "details": ""})
        await websocket.send_text(initial_status)

        pubsub = aredis_client.pubsub()
        await pubsub.subscribe(f"stream_status_{stream_id}")

        async def redis_listener(ws: WebSocket):
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=None)
                if message:
                    await ws.send_text(message['data'])

        listener_task = asyncio.create_task(redis_listener(websocket))
        
        while True:
            await websocket.receive_text()

    except (WebSocketDisconnect, ConnectionClosedError):
        logger.info(f"Client for stream {stream_id} disconnected.")
    finally:
        if listener_task:
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass
        db.close()

@app.websocket("/ws/install_agent")
async def websocket_install_agent(
    websocket: WebSocket,
    token: str = Depends(get_token_for_websocket)
):
    db = get_db_session()
    ssh = None
    db_vps = None
    try:
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token missing")
            return
        try:
            payload = security.decode_access_token(token)
            username: str = payload.get("sub")
            if username is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
                return
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return
        
        current_user = security.get_user(db, username=username)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
            return

        await websocket.accept()
        
        await websocket.send_text("INFO: Waiting for VPS details...")
        data = await websocket.receive_json()
        vps_details = vps_schema.VPSCreateSSH(**data)
        
        await websocket.send_text("INFO: Creating database entry...")
        api_key = vps.generate_api_key()
        db_vps = models.VPS(
            name=vps_details.name, ip_address=vps_details.ssh_host, api_key=api_key,
            user_id=current_user.id, port=8001
        )
        db.add(db_vps)
        db.commit()
        db.refresh(db_vps)
        
        await websocket.send_text(f"INFO: Connecting to {vps_details.ssh_host}...")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        loop = asyncio.get_event_loop()
        
        try:
            await loop.run_in_executor(
                None, 
                ssh.connect,
                vps_details.ssh_host,
                vps_details.ssh_port,
                vps_details.ssh_user,
                vps_details.ssh_password,
                30
            )
        except Exception as ssh_error:
            await websocket.send_text(f"ERROR: SSH connection failed: {str(ssh_error)}")
            raise

        await websocket.send_text("INFO: Running installation script...")
        agent_python_code = '''
import uvicorn
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import APIKeyHeader
import os
from dotenv import load_dotenv
import subprocess
import psutil
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
load_dotenv()
app = FastAPI(title="VPS Agent")
API_KEY_NAME = "Authorization"
API_KEY_HEADER = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
SECRET_API_KEY = os.getenv("API_KEY")

async def get_api_key(api_key_header: str = Depends(API_KEY_HEADER)):
    if not SECRET_API_KEY: raise HTTPException(status_code=500, detail="Agent not configured")
    if not api_key_header or not api_key_header.startswith("Bearer "): raise HTTPException(status_code=403, detail="Invalid credentials")
    token = api_key_header.split(" ")[1]
    if token != SECRET_API_KEY: raise HTTPException(status_code=403, detail="Invalid credentials")
    return token

@app.get("/health", dependencies=[Depends(get_api_key)])
async def health_check(): return {"status": "ok"}

@app.get("/stats", dependencies=[Depends(get_api_key)])
async def get_stats():
    return {"cpu_usage": psutil.cpu_percent(interval=1), "ram_usage": psutil.virtual_memory().percent}

@app.post("/stream/start", dependencies=[Depends(get_api_key)])
async def start_stream(request: Request):
    data = await request.json()
    ffmpeg_command, stream_id = data.get("ffmpeg_command"), data.get("stream_id")
    if not ffmpeg_command or stream_id is None: raise HTTPException(status_code=400, detail="Missing params")
    pid_file = f"/tmp/stream_{stream_id}.pid"
    if os.path.exists(pid_file):
        try:
            with open(pid_file, 'r') as f: pid = int(f.read())
            p = psutil.Process(pid)
            p.terminate()
            p.wait()
        except (psutil.NoSuchProcess, FileNotFoundError, ValueError): pass
        os.remove(pid_file)
    with open(f"/tmp/stream_{stream_id}.log", 'w') as log:
        process = subprocess.Popen(ffmpeg_command, stdout=log, stderr=subprocess.STDOUT)
    with open(pid_file, 'w') as f: f.write(str(process.pid))
    return {"status": "started", "pid": process.pid}

@app.post("/stream/stop", dependencies=[Depends(get_api_key)])
async def stop_stream(request: Request):
    stream_id = (await request.json()).get("stream_id")
    pid_file = f"/tmp/stream_{stream_id}.pid"
    if not os.path.exists(pid_file): return {"status": "not_running"}
    try:
        with open(pid_file, 'r') as f: pid = int(f.read())
        p = psutil.Process(pid)
        p.terminate()
        p.wait()
    except (psutil.NoSuchProcess, ValueError): pass
    finally:
        if os.path.exists(pid_file): os.remove(pid_file)
    return {"status": "stopped"}

@app.post("/test/ffmpeg", dependencies=[Depends(get_api_key)])
async def test_ffmpeg():
    try:
        path = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True, check=True).stdout.strip()
        version = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, check=True).stdout.splitlines()[0]
        return {"status": "success", "path": path, "version": version}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8001)))
'''
        agent_port = 8001
        install_script = f"""
set -e; set -x;
AGENT_DIR="/opt/streamcurl_agent"; VENV_DIR="$AGENT_DIR/venv"; AGENT_USER="streamcurl"; SERVICE_NAME="streamcurl-agent";
_API_KEY="{db_vps.api_key}"; _AGENT_PORT="{agent_port}";
echo "--- Setup User & Dirs ---";
if id "$AGENT_USER" &>/dev/null; then echo "User exists."; else sudo useradd -r -m -s /bin/bash "$AGENT_USER"; fi;
sudo mkdir -p "$AGENT_DIR"; sudo chown -R $AGENT_USER:$AGENT_USER "$AGENT_DIR";
echo "--- Install Deps ---";
sudo apt-get update; sudo apt-get install -y python3 python3-pip python3-venv ffmpeg;
echo "--- Create Python Env ---";
sudo -u "$AGENT_USER" bash << EOF
python3 -m venv "$VENV_DIR"; source "$VENV_DIR/bin/activate";
pip install "fastapi[all]" uvicorn python-dotenv psutil;
cat > "$AGENT_DIR/main.py" << 'AGENT_CODE'
{agent_python_code}
AGENT_CODE
cat > "$AGENT_DIR/.env" << ENV_CONFIG
API_KEY=${{_API_KEY}}
PORT=${{_AGENT_PORT}}
ENV_CONFIG
EOF
echo "--- Setup systemd ---";
sudo bash -c "cat > /etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Streamcurl Agent; After=network.target
[Service]
User=$AGENT_USER; Group=$AGENT_USER; WorkingDirectory=$AGENT_DIR;
Environment="PATH=$VENV_DIR/bin";
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port $_AGENT_PORT;
Restart=always; RestartSec=3;
[Install]
WantedBy=multi-user.target
EOF
echo "--- Start Service ---";
sudo systemctl daemon-reload; sudo systemctl enable $SERVICE_NAME;
sudo systemctl restart $SERVICE_NAME; sudo systemctl status $SERVICE_NAME --no-pager;
echo "--- Installation Complete ---";
"""
        stdin, stdout, stderr = ssh.exec_command("sudo bash", get_pty=True)
        stdin.write(install_script)
        stdin.flush()
        stdin.channel.shutdown_write()

        for line in iter(stdout.readline, ""): await websocket.send_text(line.strip())
        for line in iter(stderr.readline, ""): await websocket.send_text(f"ERROR: {line.strip()}")
        
        await websocket.send_text("INFO: Script finished.")
        db_vps.port = agent_port
        db.commit()
        await websocket.send_text("INFO: DB updated.")
    except WebSocketDisconnect:
        print("Client disconnected.")
    except Exception as e:
        if db_vps:
            db.delete(db_vps)
            db.commit()
            await websocket.send_text(f"INFO: Rolled back VPS creation due to error.")
        await websocket.send_text(f"FATAL_ERROR: {str(e)}")
    finally:
        if ssh and ssh.get_transport() and ssh.get_transport().is_active(): ssh.close()
        if db: db.close()
        if websocket.client_state != status.WS_1001_GOING_AWAY: await websocket.close()

app.include_router(media_files.router, prefix="/v1/media-files", tags=["media_files"])
app.include_router(streams.router, prefix="/v1/streams", tags=["streams"])
app.include_router(health.router, prefix="/v1/health", tags=["health"])
app.include_router(overlays.router, prefix="/v1/overlays", tags=["overlays"])
app.include_router(soundcloud.router, prefix="/v1/soundcloud", tags=["soundcloud"])
app.include_router(images.router, prefix="/v1/images", tags=["images"])
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(youtube.router, prefix="/v1/youtube", tags=["youtube"])
app.include_router(admin.router, prefix="/v1/admin", tags=["admin"])
app.include_router(gdrive.router, prefix="/v1/gdrive", tags=["gdrive"])
app.include_router(vps.router, prefix="/v1/vps", tags=["vps"])
app.include_router(dashboard.router, prefix="/v1/dashboard", tags=["dashboard"])
app.include_router(agent_callbacks.router, prefix="/v1/agent-callbacks", tags=["agent_callbacks"])

app.mount("/media", StaticFiles(directory="/app/media"), name="media")


# Force app reload
