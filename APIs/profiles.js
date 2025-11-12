from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.auth import AuthorizedUser
from app.libs.db import execute
import os
import requests

router = APIRouter()

class UserProfile(BaseModel):
    user_id: str
    display_name: str | None
    avatar_url: str | None

@router.get("/me")
async def get_my_profile(user: AuthorizedUser) -> UserProfile:
    user_id = user.sub
    # Stack Auth may not provide display_name or profile_image_url
    display_name = getattr(user, 'display_name', None) or getattr(user, 'client_metadata', {}).get('display_name') or 'Player'
    avatar_url = getattr(user, 'profile_image_url', None) or getattr(user, 'client_metadata', {}).get('avatar_url') or ''
    
    print(f"🔄 Syncing profile for user {user_id}: {display_name} - {avatar_url}")
    
    # Insert or update profile in database
    await execute(
        """
        INSERT INTO profiles (user_id, display_name, avatar_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW()
        """,
        user_id, display_name, avatar_url
    )
    
    print(f"✅ Profile synced successfully for {user_id}")
    
    return UserProfile(
        user_id=user_id,
        display_name=display_name,
        avatar_url=avatar_url
    )
