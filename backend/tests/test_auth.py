"""Tests for authentication endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import User, UserRole
from app.auth import get_password_hash


def get_auth_headers(client: TestClient, username: str, password: str) -> dict:
    """Helper to login and get auth headers."""
    response = client.post("/api/auth/login/json", json={
        "username": username,
        "password": password
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_user_in_db(db: Session, email: str, username: str, password: str,
                      role: UserRole = UserRole.USER, display_name: str = None,
                      is_active: bool = True) -> User:
    """Helper to create a user directly in the database."""
    user = User(
        email=email,
        username=username,
        display_name=display_name or username,
        password_hash=get_password_hash(password),
        role=role,
        is_active=is_active
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_registration_is_disabled(client: TestClient, db: Session):
    """Self-registration should be disabled."""
    response = client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "display_name": "Admin User",
        "password": "password123"
    })
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"].lower()


def test_login_success(client: TestClient, db: Session):
    """Test successful login."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")

    response = client.post("/api/auth/login/json", json={
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_with_email(client: TestClient, db: Session):
    """Test login with email instead of username."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")

    response = client.post("/api/auth/login/json", json={
        "username": "test@example.com",
        "password": "password123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client: TestClient, db: Session):
    """Test login with wrong password."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")

    response = client.post("/api/auth/login/json", json={
        "username": "testuser",
        "password": "wrongpassword"
    })
    assert response.status_code == 401


def test_login_nonexistent_user(client: TestClient, db: Session):
    """Test login with nonexistent user."""
    response = client.post("/api/auth/login/json", json={
        "username": "nonexistent",
        "password": "password123"
    })
    assert response.status_code == 401


def test_get_me_authenticated(client: TestClient, db: Session):
    """Test getting current user when authenticated."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")
    headers = get_auth_headers(client, "testuser", "password123")

    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["username"] == "testuser"


def test_get_me_unauthenticated(client: TestClient, db: Session):
    """Test getting current user when not authenticated."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_update_profile(client: TestClient, db: Session):
    """Test updating user profile."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")
    headers = get_auth_headers(client, "testuser", "password123")

    response = client.put("/api/auth/me",
        headers=headers,
        json={"display_name": "New Display Name"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "New Display Name"


def test_change_password(client: TestClient, db: Session):
    """Test changing password."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")
    headers = get_auth_headers(client, "testuser", "password123")

    response = client.post("/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "password123",
            "new_password": "newpassword456"
        }
    )
    assert response.status_code == 200

    # Verify can login with new password
    response = client.post("/api/auth/login/json", json={
        "username": "testuser",
        "password": "newpassword456"
    })
    assert response.status_code == 200


def test_change_password_wrong_current(client: TestClient, db: Session):
    """Test changing password with wrong current password."""
    create_user_in_db(db, "test@example.com", "testuser", "password123")
    headers = get_auth_headers(client, "testuser", "password123")

    response = client.post("/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "wrongpassword",
            "new_password": "newpassword456"
        }
    )
    assert response.status_code == 400


# Admin tests
def test_admin_list_users(client: TestClient, db: Session):
    """Test admin listing users."""
    create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    create_user_in_db(db, "user@example.com", "user", "password123")
    headers = get_auth_headers(client, "admin", "password123")

    response = client.get("/api/auth/users", headers=headers)
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 2


def test_non_admin_cannot_list_users(client: TestClient, db: Session):
    """Test non-admin cannot list users."""
    create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    create_user_in_db(db, "user@example.com", "user", "password123")
    headers = get_auth_headers(client, "user", "password123")

    response = client.get("/api/auth/users", headers=headers)
    assert response.status_code == 403


def test_admin_create_user(client: TestClient, db: Session):
    """Test admin creating a user."""
    create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    headers = get_auth_headers(client, "admin", "password123")

    response = client.post("/api/auth/users",
        headers=headers,
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "display_name": "New User",
            "password": "newpass123"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["username"] == "newuser"


def test_admin_update_user(client: TestClient, db: Session):
    """Test admin updating a user."""
    create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    user = create_user_in_db(db, "user@example.com", "user", "password123")
    headers = get_auth_headers(client, "admin", "password123")

    response = client.put(f"/api/auth/users/{user.id}",
        headers=headers,
        json={"display_name": "Updated Name"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Updated Name"


def test_admin_delete_user(client: TestClient, db: Session):
    """Test admin deleting a user."""
    create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    user = create_user_in_db(db, "user@example.com", "user", "password123")
    headers = get_auth_headers(client, "admin", "password123")

    response = client.delete(f"/api/auth/users/{user.id}", headers=headers)
    assert response.status_code == 204


def test_admin_cannot_delete_self(client: TestClient, db: Session):
    """Test admin cannot delete themselves."""
    admin = create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    headers = get_auth_headers(client, "admin", "password123")

    response = client.delete(f"/api/auth/users/{admin.id}", headers=headers)
    assert response.status_code == 400


def test_admin_cannot_deactivate_self(client: TestClient, db: Session):
    """Test admin cannot deactivate themselves."""
    admin = create_user_in_db(db, "admin@example.com", "admin", "password123", UserRole.ADMIN)
    headers = get_auth_headers(client, "admin", "password123")

    response = client.put(f"/api/auth/users/{admin.id}",
        headers=headers,
        json={"is_active": False}
    )
    assert response.status_code == 400


def test_inactive_user_cannot_login(client: TestClient, db: Session):
    """Test inactive user cannot login."""
    create_user_in_db(db, "test@example.com", "testuser", "password123", is_active=False)

    response = client.post("/api/auth/login/json", json={
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 401


# OAuth tests
def test_google_oauth_enabled_check(client: TestClient, db: Session):
    """Test checking if Google OAuth is enabled."""
    response = client.get("/api/auth/google/enabled")
    assert response.status_code == 200
    # Without env vars, should be disabled
    assert response.json()["enabled"] is False


def test_google_oauth_login_not_configured(client: TestClient, db: Session):
    """Test Google OAuth login when not configured."""
    response = client.get("/api/auth/google/login", follow_redirects=False)
    # Should redirect to error page
    assert response.status_code in [302, 307, 400]


def test_google_oauth_callback_no_code(client: TestClient, db: Session):
    """Test Google OAuth callback without code."""
    response = client.get("/api/auth/google/callback", follow_redirects=False)
    assert response.status_code in [302, 307, 400]


def test_google_oauth_callback_error_from_google(client: TestClient, db: Session):
    """Test Google OAuth callback with error from Google."""
    response = client.get("/api/auth/google/callback?error=access_denied", follow_redirects=False)
    assert response.status_code in [302, 307]


def test_google_oauth_callback_invalid_state(client: TestClient, db: Session):
    """Test Google OAuth callback with invalid state."""
    response = client.get("/api/auth/google/callback?code=test&state=invalid", follow_redirects=False)
    assert response.status_code in [302, 307, 400]
