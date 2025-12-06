"""Tests for user settings functionality."""
import pytest
from fastapi.testclient import TestClient


def test_get_settings_unauthenticated(client):
    """Test that unauthenticated users cannot access settings."""
    response = client.get("/api/settings")
    assert response.status_code == 401


def test_get_settings_creates_default(client, auth_headers):
    """Test that getting settings creates defaults if none exist."""
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["theme"] == "system"
    assert data["default_node_color"] == "#3B82F6"
    assert data["default_text_color"] == "#FFFFFF"
    assert data["default_node_shape"] == "rectangle"
    assert data["snap_to_grid"] is False
    assert data["grid_size"] == 20
    assert data["auto_save"] is True
    assert data["default_refs_page_size"] == 20
    assert data["default_refs_sort"] == "imported-desc"
    assert data["email_notifications"] is True


def test_get_settings_returns_same_settings(client, auth_headers):
    """Test that getting settings twice returns the same settings."""
    # First call creates settings
    response1 = client.get("/api/settings", headers=auth_headers)
    assert response1.status_code == 200
    data1 = response1.json()

    # Second call returns existing settings
    response2 = client.get("/api/settings", headers=auth_headers)
    assert response2.status_code == 200
    data2 = response2.json()

    assert data1["id"] == data2["id"]


def test_update_settings_theme(client, auth_headers):
    """Test updating theme setting."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"theme": "dark"}
    )
    assert response.status_code == 200
    assert response.json()["theme"] == "dark"

    # Verify it persists
    response = client.get("/api/settings", headers=auth_headers)
    assert response.json()["theme"] == "dark"


def test_update_settings_invalid_theme(client, auth_headers):
    """Test that invalid theme is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"theme": "invalid_theme"}
    )
    assert response.status_code == 400
    assert "Invalid theme" in response.json()["detail"]


def test_update_settings_node_color(client, auth_headers):
    """Test updating default node color."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_node_color": "#FF5733"}
    )
    assert response.status_code == 200
    assert response.json()["default_node_color"] == "#FF5733"


def test_update_settings_invalid_color(client, auth_headers):
    """Test that invalid color format is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_node_color": "red"}
    )
    assert response.status_code == 400
    assert "Invalid color format" in response.json()["detail"]


def test_update_settings_node_shape(client, auth_headers):
    """Test updating default node shape."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_node_shape": "ellipse"}
    )
    assert response.status_code == 200
    assert response.json()["default_node_shape"] == "ellipse"


def test_update_settings_invalid_shape(client, auth_headers):
    """Test that invalid shape is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_node_shape": "triangle"}
    )
    assert response.status_code == 400
    assert "Invalid node shape" in response.json()["detail"]


def test_update_settings_grid_size(client, auth_headers):
    """Test updating grid size."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"grid_size": 30}
    )
    assert response.status_code == 200
    assert response.json()["grid_size"] == 30


def test_update_settings_invalid_grid_size(client, auth_headers):
    """Test that invalid grid size is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"grid_size": 1}  # Too small
    )
    assert response.status_code == 400
    assert "Grid size must be between" in response.json()["detail"]


def test_update_settings_refs_page_size(client, auth_headers):
    """Test updating default refs page size."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_refs_page_size": 50}
    )
    assert response.status_code == 200
    assert response.json()["default_refs_page_size"] == 50


def test_update_settings_invalid_refs_page_size(client, auth_headers):
    """Test that invalid page size is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_refs_page_size": 25}
    )
    assert response.status_code == 400
    assert "Invalid page size" in response.json()["detail"]


def test_update_settings_refs_sort(client, auth_headers):
    """Test updating default refs sort."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_refs_sort": "year-desc"}
    )
    assert response.status_code == 200
    assert response.json()["default_refs_sort"] == "year-desc"


def test_update_settings_invalid_refs_sort(client, auth_headers):
    """Test that invalid sort is rejected."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={"default_refs_sort": "random"}
    )
    assert response.status_code == 400
    assert "Invalid sort option" in response.json()["detail"]


def test_update_settings_multiple(client, auth_headers):
    """Test updating multiple settings at once."""
    response = client.put(
        "/api/settings",
        headers=auth_headers,
        json={
            "theme": "light",
            "snap_to_grid": True,
            "auto_save": False
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["theme"] == "light"
    assert data["snap_to_grid"] is True
    assert data["auto_save"] is False


def test_reset_settings(client, auth_headers):
    """Test resetting settings to defaults."""
    # First, change some settings
    client.put(
        "/api/settings",
        headers=auth_headers,
        json={
            "theme": "dark",
            "snap_to_grid": True,
            "default_node_color": "#FF0000"
        }
    )

    # Then reset
    response = client.post("/api/settings/reset", headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["theme"] == "system"
    assert data["snap_to_grid"] is False
    assert data["default_node_color"] == "#3B82F6"


def test_settings_isolation_between_users(client, admin_client, auth_headers, admin_headers):
    """Test that settings are isolated between users."""
    # User changes their settings
    client.put(
        "/api/settings",
        headers=auth_headers,
        json={"theme": "dark"}
    )

    # Admin changes their settings
    admin_client.put(
        "/api/settings",
        headers=admin_headers,
        json={"theme": "light"}
    )

    # Verify user's settings
    response = client.get("/api/settings", headers=auth_headers)
    assert response.json()["theme"] == "dark"

    # Verify admin's settings
    response = admin_client.get("/api/settings", headers=admin_headers)
    assert response.json()["theme"] == "light"
