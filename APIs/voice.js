"""Voice and video call system for table communication"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import asyncpg
import os
from typing import List, Optional
from app.auth import AuthorizedUser

router = APIRouter()

class VoiceSettingsRequest(BaseModel):
    table_id: str
    audio_enabled: bool
    video_enabled: bool

class MutePlayerRequest(BaseModel):
    table_id: str
    target_user_id: str
    muted: bool

class TableVoiceSettingsRequest(BaseModel):
    table_id: str
    voice_enabled: bool

@router.post("/settings")
async def update_voice_settings(body: VoiceSettingsRequest, user: AuthorizedUser):
    """Update user's voice/video settings for a table"""
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    
    try:
        await conn.execute(
            """UPDATE table_players 
               SET audio_enabled = $1, video_enabled = $2
               WHERE table_id = $3 AND user_id = $4""",
            body.audio_enabled,
            body.video_enabled,
            body.table_id,
            user.sub
        )
        
        return {"success": True}
    
    finally:
        await conn.close()

@router.post("/mute-player")
async def mute_player(body: MutePlayerRequest, user: AuthorizedUser):
    """Host can mute/unmute other players"""
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    
    try:
        # Verify user is host
        is_host = await conn.fetchval(
            "SELECT host_id = $1 FROM tables WHERE id = $2",
            user.sub,
            body.table_id
        )
        
        if not is_host:
            raise HTTPException(status_code=403, detail="Only host can mute players")
        
        await conn.execute(
            """UPDATE table_players 
               SET audio_enabled = $1
               WHERE table_id = $2 AND user_id = $3""",
            not body.muted,
            body.table_id,
            body.target_user_id
        )
        
        return {"success": True}
    
    finally:
        await conn.close()

@router.post("/table-settings")
async def update_table_voice_settings(body: TableVoiceSettingsRequest, user: AuthorizedUser):
    """Host can enable/disable voice for entire table"""
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    
    try:
        # Verify user is host
        is_host = await conn.fetchval(
            "SELECT host_id = $1 FROM tables WHERE id = $2",
            user.sub,
            body.table_id
        )
        
        if not is_host:
            raise HTTPException(status_code=403, detail="Only host can change table voice settings")
        
        await conn.execute(
            "UPDATE tables SET voice_enabled = $1 WHERE id = $2",
            body.voice_enabled,
            body.table_id
        )
        
        return {"success": True}
    
    finally:
        await conn.close()

@router.get("/participants/{table_id}")
async def get_voice_participants(table_id: str, user: AuthorizedUser):
    """Get all voice participants and their settings"""
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    
    try:
        participants = await conn.fetch(
            """SELECT tp.user_id, p.display_name, tp.is_muted, tp.is_speaking
               FROM rummy_table_players tp
               LEFT JOIN profiles p ON tp.user_id = p.user_id
               WHERE tp.table_id = $1""",
            table_id
        )
        
        return {
            "participants": [
                {
                    "user_id": p['user_id'],
                    "display_name": p['display_name'] or p['user_id'][:8],
                    "is_muted": p['is_muted'] or False,
                    "is_speaking": p['is_speaking'] or False
                }
                for p in participants
            ]
        }
    
    finally:
        await conn.close()
