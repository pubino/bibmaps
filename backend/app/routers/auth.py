"""Authentication router for BibMap."""
import os
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
import httpx

from ..database import get_db
from ..models.models import User, UserRole
from .. import schemas
from ..auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    authenticate_user,
    get_current_user,
    get_current_active_user,
    get_current_admin_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from ..rate_limiting import rate_limit, AUTH_RATE_LIMIT, PASSWORD_RATE_LIMIT

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")

# In-memory state storage for OAuth (in production, use Redis or similar)
oauth_states: dict = {}

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserResponse, status_code=201)
@rate_limit(AUTH_RATE_LIMIT)
def register(
    request: Request,
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    """Register a new user account."""
    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Check if username already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Check if this is the first user (make them admin)
    is_first_user = db.query(User).count() == 0

    # Create new user
    user = User(
        email=user_data.email,
        username=user_data.username,
        display_name=user_data.display_name or user_data.username,
        password_hash=get_password_hash(user_data.password),
        role=UserRole.ADMIN if is_first_user else UserRole.USER,
        is_active=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post("/login", response_model=schemas.Token)
@rate_limit(AUTH_RATE_LIMIT)
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get an access token."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    # Create access token
    access_token = create_access_token(
        data={"sub": user.id, "username": user.username}
    )

    # Set cookie for browser clients
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login/json", response_model=schemas.Token)
@rate_limit(AUTH_RATE_LIMIT)
def login_json(
    request: Request,
    response: Response,
    login_data: schemas.UserLogin,
    db: Session = Depends(get_db)
):
    """Login with JSON body instead of form data."""
    user = authenticate_user(db, login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    # Create access token
    access_token = create_access_token(
        data={"sub": user.id, "username": user.username}
    )

    # Set cookie for browser clients
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    """Logout by clearing the access token cookie."""
    response.delete_cookie(key="access_token")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=schemas.UserResponse)
def get_me(
    user: User = Depends(get_current_active_user)
):
    """Get the current user's profile."""
    return user


@router.put("/me", response_model=schemas.UserResponse)
def update_me(
    user_update: schemas.UserUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update the current user's profile."""
    update_data = user_update.model_dump(exclude_unset=True)

    # Check email uniqueness if changing
    if "email" in update_data and update_data["email"] != user.email:
        if db.query(User).filter(User.email == update_data["email"]).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
@rate_limit(PASSWORD_RATE_LIMIT)
def change_password(
    request: Request,
    password_data: schemas.PasswordChange,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change the current user's password."""
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change password for OAuth-only accounts"
        )

    if not verify_password(password_data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    user.password_hash = get_password_hash(password_data.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


# Admin endpoints
@router.get("/users", response_model=List[schemas.UserListResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    query = db.query(User)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                User.email.ilike(search_filter),
                User.username.ilike(search_filter),
                User.display_name.ilike(search_filter)
            )
        )

    users = query.offset(skip).limit(limit).all()
    return users


@router.post("/users", response_model=schemas.UserResponse, status_code=201)
def create_user(
    user_data: schemas.UserCreateByAdmin,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)."""
    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Check if username already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Map role enum
    role = UserRole.ADMIN if user_data.role == schemas.UserRoleEnum.ADMIN else UserRole.USER

    # Create new user
    user = User(
        email=user_data.email,
        username=user_data.username,
        display_name=user_data.display_name or user_data.username,
        password_hash=get_password_hash(user_data.password),
        role=role,
        is_active=user_data.is_active
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get a specific user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_update: schemas.UserUpdateByAdmin,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    update_data = user_update.model_dump(exclude_unset=True)

    # Check email uniqueness if changing
    if "email" in update_data and update_data["email"] != user.email:
        if db.query(User).filter(User.email == update_data["email"]).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

    # Check username uniqueness if changing
    if "username" in update_data and update_data["username"] != user.username:
        if db.query(User).filter(User.username == update_data["username"]).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )

    # Handle role conversion
    if "role" in update_data:
        update_data["role"] = UserRole.ADMIN if update_data["role"] == schemas.UserRoleEnum.ADMIN else UserRole.USER

    # Prevent admin from deactivating themselves
    if "is_active" in update_data and update_data["is_active"] is False:
        if user.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account"
            )

    # Prevent admin from removing their own admin role
    if "role" in update_data and update_data["role"] == UserRole.USER:
        if user.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own admin role"
            )

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent admin from deleting themselves
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    db.delete(user)
    db.commit()
    return None


@router.post("/users/{user_id}/reset-password")
@rate_limit(PASSWORD_RATE_LIMIT)
def reset_user_password(
    request: Request,
    user_id: int,
    new_password: str,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Reset a user's password (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.password_hash = get_password_hash(new_password)
    db.commit()

    return {"message": "Password reset successfully"}


# Google OAuth endpoints
@router.get("/google/enabled")
def google_oauth_enabled():
    """Check if Google OAuth is configured."""
    return {"enabled": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)}


@router.get("/google/login")
def google_login():
    """Initiate Google OAuth login flow."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured"
        )

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    oauth_states[state] = datetime.utcnow()

    # Clean up old states (older than 10 minutes)
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    expired_states = [s for s, t in oauth_states.items() if t < cutoff]
    for s in expired_states:
        del oauth_states[s]

    # Build Google OAuth authorization URL
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account"
    }

    query = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(
    response: Response,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Handle Google OAuth callback."""
    # Handle errors from Google
    if error:
        return RedirectResponse(url=f"/?error=google_oauth_error&message={error}")

    if not code:
        return RedirectResponse(url="/?error=no_code")

    # Verify state to prevent CSRF
    if not state or state not in oauth_states:
        return RedirectResponse(url="/?error=invalid_state")

    # Remove used state
    del oauth_states[state]

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return RedirectResponse(url="/?error=google_not_configured")

    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                },
            )

            if token_response.status_code != 200:
                return RedirectResponse(url="/?error=token_exchange_failed")

            tokens = token_response.json()
            access_token = tokens.get("access_token")

            # Get user info from Google
            userinfo_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if userinfo_response.status_code != 200:
                return RedirectResponse(url="/?error=userinfo_failed")

            userinfo = userinfo_response.json()

        google_id = userinfo.get("id")
        email = userinfo.get("email")
        name = userinfo.get("name", "")

        if not google_id or not email:
            return RedirectResponse(url="/?error=missing_user_info")

        # Look up existing user by Google OAuth ID
        user = db.query(User).filter(
            User.oauth_provider == "google",
            User.oauth_id == google_id
        ).first()

        if not user:
            # Check if user exists with this email (link accounts)
            user = db.query(User).filter(User.email == email).first()
            if user:
                # Link existing account to Google
                user.oauth_provider = "google"
                user.oauth_id = google_id
            else:
                # Create new user
                # Check if this is the first user (make them admin)
                is_first_user = db.query(User).count() == 0

                # Generate a unique username from email
                base_username = email.split("@")[0]
                username = base_username
                counter = 1
                while db.query(User).filter(User.username == username).first():
                    username = f"{base_username}{counter}"
                    counter += 1

                user = User(
                    email=email,
                    username=username,
                    display_name=name or username,
                    password_hash=None,  # OAuth users don't have passwords
                    role=UserRole.ADMIN if is_first_user else UserRole.USER,
                    is_active=True,
                    oauth_provider="google",
                    oauth_id=google_id,
                )
                db.add(user)

        if not user.is_active:
            return RedirectResponse(url="/?error=account_disabled")

        # Update last login
        user.last_login = datetime.utcnow()
        db.commit()

        # Create JWT token
        access_token = create_access_token(
            data={"sub": user.id, "username": user.username}
        )

        # Create redirect response with cookie
        redirect = RedirectResponse(url="/", status_code=302)
        redirect.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

        return redirect

    except Exception as e:
        print(f"Google OAuth error: {e}")
        return RedirectResponse(url=f"/?error=oauth_error")
