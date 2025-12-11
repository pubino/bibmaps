"""Authentication utilities for BibMap."""
from datetime import datetime, timedelta
from typing import Optional
import os

from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .database import get_db
from .models.models import User, UserRole, AllowedEmail
from . import schemas
import re
import base64
import json

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours default

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme - token can come from cookie or header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    # JWT spec requires 'sub' to be a string
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[schemas.TokenData]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        username: str = payload.get("username")
        if sub is None:
            return None
        # Convert sub back to int (it's stored as string in JWT)
        user_id = int(sub)
        return schemas.TokenData(user_id=user_id, username=username)
    except (JWTError, ValueError):
        return None


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Authenticate a user by username/email and password."""
    # Try to find by username or email
    user = db.query(User).filter(
        (User.username == username) | (User.email == username)
    ).first()

    if not user:
        return None
    if not user.password_hash:
        return None  # OAuth-only user
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_token_from_request(
    request: Request,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = None
) -> Optional[str]:
    """Extract token from Authorization header or cookie."""
    # Try Authorization header first
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]

    # Try OAuth2 scheme token
    if token:
        return token

    # Try cookie
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token

    return None


def is_email_allowed(db: Session, email: str) -> bool:
    """Check if an email is in the allowlist.

    Returns True if:
    - No allowed_emails entries exist (open access / first-time setup)
    - Email matches an exact entry
    - Email matches a pattern (e.g., *@example.com)
    """
    # Check if there are any allowlist entries
    allowlist_count = db.query(AllowedEmail).count()
    if allowlist_count == 0:
        # No allowlist configured - allow all (for initial setup)
        return True

    email_lower = email.lower()

    # Check for exact match or pattern match
    allowed_entries = db.query(AllowedEmail).all()
    for entry in allowed_entries:
        pattern = entry.email_pattern.lower()
        if pattern == email_lower:
            return True
        # Support wildcard patterns like *@domain.com
        if pattern.startswith('*'):
            domain_pattern = pattern[1:]  # Remove the *
            if email_lower.endswith(domain_pattern):
                return True

    return False


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    authorization: Optional[str] = Header(None),
    x_ms_client_principal_id: Optional[str] = Header(None),
    x_ms_client_principal_name: Optional[str] = Header(None),
    x_ms_client_principal: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get the current authenticated user.

    Supports multiple authentication methods:
    1. JWT token (from header, cookie, or OAuth2 scheme)
    2. Azure Easy Auth headers (auto-creates users if allowed)

    Returns None if not authenticated (for local mode).
    """
    # First try JWT token authentication
    actual_token = get_token_from_request(request, authorization, token)
    if actual_token:
        token_data = decode_token(actual_token)
        if token_data and token_data.user_id:
            user = db.query(User).filter(User.id == token_data.user_id).first()
            if user and user.is_active:
                return user

    # Try Azure Easy Auth
    if x_ms_client_principal_id:
        # Look up existing user by Azure OAuth ID
        user = db.query(User).filter(
            User.oauth_provider == "azure",
            User.oauth_id == x_ms_client_principal_id
        ).first()

        if user:
            if user.is_active:
                # Update last login
                user.last_login = datetime.utcnow()
                db.commit()
                return user
            else:
                return None  # User is deactivated

        # User doesn't exist yet - try to auto-create from Azure headers
        # Parse the X-MS-CLIENT-PRINCIPAL header to get email
        email = None
        display_name = x_ms_client_principal_name

        if x_ms_client_principal:
            try:
                # The header is base64 encoded JSON
                principal_data = json.loads(base64.b64decode(x_ms_client_principal))
                claims = principal_data.get("claims", [])
                for claim in claims:
                    claim_type = claim.get("typ", "")
                    if claim_type in ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
                                      "emails", "email", "preferred_username"]:
                        email = claim.get("val")
                        break
                    if claim_type == "name" and not display_name:
                        display_name = claim.get("val")
            except (ValueError, KeyError, json.JSONDecodeError):
                pass

        # If we couldn't get email from claims, try using the principal name
        if not email and x_ms_client_principal_name and "@" in x_ms_client_principal_name:
            email = x_ms_client_principal_name

        if not email:
            # Can't create user without email
            return None

        # Check if email is allowed
        if not is_email_allowed(db, email):
            return None  # Email not in allowlist

        # Check if this is the first user (make them admin)
        is_first_user = db.query(User).count() == 0

        # Generate a unique username from email
        base_username = email.split("@")[0]
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1

        # Check if a user with this email already exists (link accounts)
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            # Link existing account to Azure
            existing_user.oauth_provider = "azure"
            existing_user.oauth_id = x_ms_client_principal_id
            existing_user.last_login = datetime.utcnow()
            db.commit()
            return existing_user if existing_user.is_active else None

        # Create new user
        user = User(
            email=email,
            username=username,
            display_name=display_name or username,
            password_hash=None,  # Azure OAuth users don't have passwords
            role=UserRole.ADMIN if is_first_user else UserRole.USER,
            is_active=True,
            oauth_provider="azure",
            oauth_id=x_ms_client_principal_id,
            last_login=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return None


async def get_current_user_required(
    user: Optional[User] = Depends(get_current_user)
) -> User:
    """Get the current user, raising 401 if not authenticated."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_active_user(
    user: User = Depends(get_current_user_required)
) -> User:
    """Get the current active user."""
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return user


async def get_current_admin_user(
    user: User = Depends(get_current_active_user)
) -> User:
    """Get the current user if they are an admin."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


def require_owner_or_admin(user: User, owner_id: Optional[int]) -> bool:
    """Check if user is the owner or an admin."""
    if user.role == UserRole.ADMIN:
        return True
    if owner_id and user.id == owner_id:
        return True
    return False


def check_ownership(user: Optional[User], owner_id: Optional[int], allow_anonymous: bool = True) -> bool:
    """
    Check if the current user can access a resource.

    Args:
        user: Current user (may be None for anonymous access)
        owner_id: Owner ID of the resource
        allow_anonymous: If True, allow access when both user and owner_id are None (local mode)

    Returns:
        True if access is allowed
    """
    # Local mode: no authentication
    if user is None and owner_id is None and allow_anonymous:
        return True

    # Authenticated mode
    if user:
        # Admins can access anything
        if user.role == UserRole.ADMIN:
            return True
        # Owner can access their own resources
        if owner_id is None or user.id == owner_id:
            return True

    return False
