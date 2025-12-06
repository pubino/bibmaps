"""Tests for the Media API endpoints."""
import pytest
from fastapi.testclient import TestClient


class TestMediaCRUD:
    """Test basic CRUD operations for media."""

    def test_create_media(self, client: TestClient, admin_headers: dict):
        """Test creating a new media entry."""
        response = client.post(
            "/api/media/",
            json={
                "title": "Test Video",
                "url": "https://example.com/video.mp4",
                "description": "A test video resource"
            },
            headers=admin_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Test Video"
        assert data["url"] == "https://example.com/video.mp4"
        assert data["description"] == "A test video resource"
        assert "id" in data
        assert "created_at" in data

    def test_list_media(self, client: TestClient, admin_headers: dict):
        """Test listing media entries."""
        # Create a media entry first
        client.post(
            "/api/media/",
            json={"title": "Media 1", "url": "https://example.com/1"},
            headers=admin_headers
        )
        client.post(
            "/api/media/",
            json={"title": "Media 2", "url": "https://example.com/2"},
            headers=admin_headers
        )

        response = client.get("/api/media/", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_get_media(self, client: TestClient, admin_headers: dict):
        """Test getting a specific media entry."""
        # Create a media entry
        create_response = client.post(
            "/api/media/",
            json={"title": "Single Media", "url": "https://example.com/single"},
            headers=admin_headers
        )
        media_id = create_response.json()["id"]

        # Get the media
        response = client.get(f"/api/media/{media_id}", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["title"] == "Single Media"

    def test_update_media(self, client: TestClient, admin_headers: dict):
        """Test updating a media entry."""
        # Create a media entry
        create_response = client.post(
            "/api/media/",
            json={"title": "Original Title", "url": "https://example.com/original"},
            headers=admin_headers
        )
        media_id = create_response.json()["id"]

        # Update the media
        response = client.put(
            f"/api/media/{media_id}",
            json={"title": "Updated Title", "description": "New description"},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["description"] == "New description"
        assert data["url"] == "https://example.com/original"  # URL unchanged

    def test_delete_media(self, client: TestClient, admin_headers: dict):
        """Test deleting a media entry."""
        # Create a media entry
        create_response = client.post(
            "/api/media/",
            json={"title": "To Delete", "url": "https://example.com/delete"},
            headers=admin_headers
        )
        media_id = create_response.json()["id"]

        # Delete the media
        response = client.delete(f"/api/media/{media_id}", headers=admin_headers)
        assert response.status_code == 204

        # Verify it's deleted
        get_response = client.get(f"/api/media/{media_id}", headers=admin_headers)
        assert get_response.status_code == 404


class TestMediaWithTags:
    """Test media with taxonomy (tag) support."""

    def test_create_media_with_tags(self, client: TestClient, admin_headers: dict):
        """Test creating media with tags."""
        # Create a taxonomy first
        tax_response = client.post(
            "/api/taxonomies/",
            json={"name": "Video", "color": "#FF0000"},
            headers=admin_headers
        )
        tax_id = tax_response.json()["id"]

        # Create media with the tag
        response = client.post(
            "/api/media/",
            json={
                "title": "Tagged Video",
                "url": "https://example.com/tagged",
                "taxonomy_ids": [tax_id]
            },
            headers=admin_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["taxonomies"]) == 1
        assert data["taxonomies"][0]["name"] == "Video"

    def test_update_media_tags(self, client: TestClient, admin_headers: dict):
        """Test updating media tags."""
        # Create taxonomies
        tax1_response = client.post(
            "/api/taxonomies/",
            json={"name": "Tag1", "color": "#FF0000"},
            headers=admin_headers
        )
        tax1_id = tax1_response.json()["id"]

        tax2_response = client.post(
            "/api/taxonomies/",
            json={"name": "Tag2", "color": "#00FF00"},
            headers=admin_headers
        )
        tax2_id = tax2_response.json()["id"]

        # Create media with first tag
        create_response = client.post(
            "/api/media/",
            json={
                "title": "Media with Tag",
                "url": "https://example.com/tagged",
                "taxonomy_ids": [tax1_id]
            },
            headers=admin_headers
        )
        media_id = create_response.json()["id"]

        # Update to use second tag
        response = client.put(
            f"/api/media/{media_id}",
            json={"taxonomy_ids": [tax2_id]},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["taxonomies"]) == 1
        assert data["taxonomies"][0]["name"] == "Tag2"

    def test_filter_media_by_taxonomy(self, client: TestClient, admin_headers: dict):
        """Test filtering media by taxonomy."""
        # Create taxonomies
        video_tax = client.post(
            "/api/taxonomies/",
            json={"name": "Video", "color": "#FF0000"},
            headers=admin_headers
        ).json()

        audio_tax = client.post(
            "/api/taxonomies/",
            json={"name": "Audio", "color": "#00FF00"},
            headers=admin_headers
        ).json()

        # Create media with different tags
        client.post(
            "/api/media/",
            json={
                "title": "Video 1",
                "url": "https://example.com/v1",
                "taxonomy_ids": [video_tax["id"]]
            },
            headers=admin_headers
        )
        client.post(
            "/api/media/",
            json={
                "title": "Audio 1",
                "url": "https://example.com/a1",
                "taxonomy_ids": [audio_tax["id"]]
            },
            headers=admin_headers
        )

        # Filter by video tag
        response = client.get(
            f"/api/media/?taxonomy_id={video_tax['id']}",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "Video 1"


class TestMediaOwnership:
    """Test media ownership and access control."""

    def test_user_cannot_access_other_user_media(
        self, client: TestClient, admin_headers: dict, auth_headers: dict
    ):
        """Test that users cannot access media owned by other users."""
        # Admin creates media
        create_response = client.post(
            "/api/media/",
            json={"title": "Admin Media", "url": "https://example.com/admin"},
            headers=admin_headers
        )
        media_id = create_response.json()["id"]

        # Standard user tries to access it
        response = client.get(f"/api/media/{media_id}", headers=auth_headers)
        assert response.status_code == 403

    def test_user_sees_only_own_media_in_list(
        self, client: TestClient, admin_headers: dict, auth_headers: dict
    ):
        """Test that users only see their own media in the list."""
        # Admin creates media
        client.post(
            "/api/media/",
            json={"title": "Admin Media", "url": "https://example.com/admin"},
            headers=admin_headers
        )

        # Standard user creates media
        client.post(
            "/api/media/",
            json={"title": "User Media", "url": "https://example.com/user"},
            headers=auth_headers
        )

        # Standard user lists media
        response = client.get("/api/media/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "User Media"

    def test_admin_sees_all_media(
        self, client: TestClient, admin_headers: dict, auth_headers: dict
    ):
        """Test that admin can see all media."""
        # Admin creates media
        client.post(
            "/api/media/",
            json={"title": "Admin Media", "url": "https://example.com/admin"},
            headers=admin_headers
        )

        # Standard user creates media
        client.post(
            "/api/media/",
            json={"title": "User Media", "url": "https://example.com/user"},
            headers=auth_headers
        )

        # Admin lists all media
        response = client.get("/api/media/", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


class TestMediaValidation:
    """Test media input validation."""

    def test_create_media_requires_title(self, client: TestClient, admin_headers: dict):
        """Test that title is required."""
        response = client.post(
            "/api/media/",
            json={"url": "https://example.com/test"},
            headers=admin_headers
        )
        assert response.status_code == 422

    def test_create_media_requires_url(self, client: TestClient, admin_headers: dict):
        """Test that URL is required."""
        response = client.post(
            "/api/media/",
            json={"title": "Test Media"},
            headers=admin_headers
        )
        assert response.status_code == 422

    def test_get_nonexistent_media(self, client: TestClient, admin_headers: dict):
        """Test getting a media that doesn't exist."""
        response = client.get("/api/media/99999", headers=admin_headers)
        assert response.status_code == 404
