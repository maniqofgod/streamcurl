from fastapi import Depends, HTTPException, status, Request, Header, Query, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError
import secrets
from typing import Optional

from ..db import session
from ..core import security
from ..db import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/token")

def get_db():
    db = session.SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_access_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = security.get_user(db, username=username)
    if user is None:
        raise credentials_exception
    return user

def get_current_admin_user(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized for this resource")
    return current_user




async def csrf_protect(request: Request):
    if request.method not in ("POST", "PUT", "DELETE", "PATCH"):
        return
        
    csrf_cookie = request.cookies.get("csrf_token")
    x_csrf_token = request.headers.get("x-csrf-token")
    if not csrf_cookie or not x_csrf_token or not secrets.compare_digest(csrf_cookie, x_csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token mismatch")

async def get_token_from_header_or_query(
    request: Request,
    token: Optional[str] = Query(None, alias="token")
):
    if token:
        return token
    
    auth_header = request.headers.get("Authorization")
    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1]
    
    return None

async def get_current_user_for_streaming(
    request: Request,
    db: Session = Depends(get_db), 
    token: str = Depends(get_token_from_header_or_query)
):
    if token == "null":
        token = None
    if token is None:
        token = request.cookies.get("access_token")
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_access_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = security.get_user(db, username=username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_user_for_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
):
    auth_token = token
    if not auth_token:
        auth_token = websocket.cookies.get("access_token")

    if not auth_token:
        raise WebSocketDisconnect(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token missing")

    try:
        payload = security.decode_access_token(auth_token)
        username: str = payload.get("sub")
        if username is None:
            raise WebSocketDisconnect(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token payload")
    except JWTError:
        raise WebSocketDisconnect(code=status.WS_1008_POLICY_VIOLATION, reason="Could not validate credentials")

    user = security.get_user(db, username=username)
    if user is None:
        raise WebSocketDisconnect(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
        
    return user
