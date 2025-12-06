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


def test_register_first_user_is_admin(client: TestClient, db: Session):
    """First user to register should be admin."""
    response = client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "display_name": "Admin User",
        "password": "password123"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "admin@example.com"
    assert data["username"] == "admin"
    assert data["role"] == "admin"
    assert data["is_active"] is True


def test_register_subsequent_user_is_standard(client: TestClient, db: Session):
    """Subsequent users should be standard users."""
    # Create first user (admin)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })

    # Create second user (should be standard)
    response = client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "display_name": "Standard User",
        "password": "password123"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["role"] == "user"


def test_register_duplicate_email(client: TestClient, db: Session):
    """Cannot register with duplicate email."""
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "user1",
        "password": "password123"
    })

    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "user2",
        "password": "password123"
    })
    assert response.status_code == 400
    assert "Email already registered" in response.json()["detail"]


def test_register_duplicate_username(client: TestClient, db: Session):
    """Cannot register with duplicate username."""
    client.post("/api/auth/register", json={
        "email": "user1@example.com",
        "username": "testuser",
        "password": "password123"
    })

    response = client.post("/api/auth/register", json={
        "email": "user2@example.com",
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 400
    assert "Username already taken" in response.json()["detail"]


def test_login_success(client: TestClient, db: Session):
    """Test successful login."""
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })

    # Login
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
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })

    # Login with email
    response = client.post("/api/auth/login/json", json={
        "username": "test@example.com",
        "password": "password123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client: TestClient, db: Session):
    """Test login with wrong password."""
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })

    # Login with wrong password
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
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })
    headers = get_auth_headers(client, "testuser", "password123")

    # Get current user
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
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })
    headers = get_auth_headers(client, "testuser", "password123")

    # Update profile
    response = client.put("/api/auth/me",
        headers=headers,
        json={"display_name": "New Display Name"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "New Display Name"


def test_change_password(client: TestClient, db: Session):
    """Test changing password."""
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })
    headers = get_auth_headers(client, "testuser", "password123")

    # Change password
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
    # Register user
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123"
    })
    headers = get_auth_headers(client, "testuser", "password123")

    # Try to change password with wrong current
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
    # Create admin user (first user)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    headers = get_auth_headers(client, "admin", "password123")

    # Create another user
    client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "password": "password123"
    })

    # List users
    response = client.get("/api/auth/users", headers=headers)
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 2


def test_non_admin_cannot_list_users(client: TestClient, db: Session):
    """Test that non-admin cannot list users."""
    # Create admin first
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })

    # Create standard user
    client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "password": "password123"
    })
    headers = get_auth_headers(client, "user", "password123")

    # Try to list users
    response = client.get("/api/auth/users", headers=headers)
    assert response.status_code == 403


def test_admin_create_user(client: TestClient, db: Session):
    """Test admin creating a new user."""
    # Create admin user (first user)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    headers = get_auth_headers(client, "admin", "password123")

    # Create new user
    response = client.post("/api/auth/users",
        headers=headers,
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "password123",
            "role": "user",
            "is_active": True
        }
    )
    assert response.status_code == 201
    assert response.json()["email"] == "newuser@example.com"


def test_admin_update_user(client: TestClient, db: Session):
    """Test admin updating a user."""
    # Create admin user (first user)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    headers = get_auth_headers(client, "admin", "password123")

    # Create another user
    response = client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "password": "password123"
    })
    user_id = response.json()["id"]

    # Update user
    response = client.put(f"/api/auth/users/{user_id}",
        headers=headers,
        json={"display_name": "Updated Name"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Updated Name"


def test_admin_delete_user(client: TestClient, db: Session):
    """Test admin deleting a user."""
    # Create admin user (first user)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    headers = get_auth_headers(client, "admin", "password123")

    # Create another user
    response = client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "password": "password123"
    })
    user_id = response.json()["id"]

    # Delete user
    response = client.delete(f"/api/auth/users/{user_id}", headers=headers)
    assert response.status_code == 204


def test_admin_cannot_delete_self(client: TestClient, db: Session):
    """Test that admin cannot delete themselves."""
    # Create admin user (first user)
    response = client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    admin_id = response.json()["id"]
    headers = get_auth_headers(client, "admin", "password123")

    # Try to delete self
    response = client.delete(f"/api/auth/users/{admin_id}", headers=headers)
    assert response.status_code == 400
    assert "Cannot delete your own account" in response.json()["detail"]


def test_admin_cannot_deactivate_self(client: TestClient, db: Session):
    """Test that admin cannot deactivate themselves."""
    # Create admin user (first user)
    response = client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    admin_id = response.json()["id"]
    headers = get_auth_headers(client, "admin", "password123")

    # Try to deactivate self
    response = client.put(f"/api/auth/users/{admin_id}",
        headers=headers,
        json={"is_active": False}
    )
    assert response.status_code == 400
    assert "Cannot deactivate your own account" in response.json()["detail"]


def test_inactive_user_cannot_login(client: TestClient, db: Session):
    """Test that inactive user cannot login."""
    # Create admin user (first user)
    client.post("/api/auth/register", json={
        "email": "admin@example.com",
        "username": "admin",
        "password": "password123"
    })
    headers = get_auth_headers(client, "admin", "password123")

    # Create another user
    response = client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "user",
        "password": "password123"
    })
    user_id = response.json()["id"]

    # Deactivate user
    client.put(f"/api/auth/users/{user_id}",
        headers=headers,
        json={"is_active": False}
    )

    # Try to login as deactivated user
    response = client.post("/api/auth/login/json", json={
        "username": "user",
        "password": "password123"
    })
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]


# Google OAuth tests
def test_google_oauth_enabled_check(client: TestClient, db: Session):
    """Test checking if Google OAuth is enabled."""
    response = client.get("/api/auth/google/enabled")
    assert response.status_code == 200
    data = response.json()
    assert "enabled" in data
    # In test environment, Google OAuth should be disabled (no env vars)
    assert data["enabled"] is False


def test_google_oauth_login_not_configured(client: TestClient, db: Session):
    """Test Google OAuth login when not configured."""
    response = client.get("/api/auth/google/login", follow_redirects=False)
    assert response.status_code == 501
    assert "not configured" in response.json()["detail"]


def test_google_oauth_callback_no_code(client: TestClient, db: Session):
    """Test Google OAuth callback without code."""
    response = client.get("/api/auth/google/callback", follow_redirects=False)
    assert response.status_code == 307
    assert "error=no_code" in response.headers["location"]


def test_google_oauth_callback_error_from_google(client: TestClient, db: Session):
    """Test Google OAuth callback with error from Google."""
    response = client.get("/api/auth/google/callback?error=access_denied", follow_redirects=False)
    assert response.status_code == 307
    assert "error=google_oauth_error" in response.headers["location"]


def test_google_oauth_callback_invalid_state(client: TestClient, db: Session):
    """Test Google OAuth callback with invalid state."""
    response = client.get("/api/auth/google/callback?code=test_code&state=invalid_state", follow_redirects=False)
    assert response.status_code == 307
    assert "error=invalid_state" in response.headers["location"]
