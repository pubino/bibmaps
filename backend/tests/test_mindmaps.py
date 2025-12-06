import pytest


def test_health_check(client):
    """Test health endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_create_mindmap(client):
    """Test creating a mind map."""
    response = client.post("/api/bibmaps/", json={
        "title": "Test Mind Map",
        "description": "A test description"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Mind Map"
    assert data["description"] == "A test description"
    assert "id" in data


def test_list_mindmaps(client):
    """Test listing mind maps."""
    # Create two mind maps
    client.post("/api/bibmaps/", json={"title": "Map 1"})
    client.post("/api/bibmaps/", json={"title": "Map 2"})

    response = client.get("/api/bibmaps/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_mindmap(client):
    """Test getting a specific mind map."""
    create_resp = client.post("/api/bibmaps/", json={"title": "Test Map"})
    mm_id = create_resp.json()["id"]

    response = client.get(f"/api/bibmaps/{mm_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Test Map"


def test_update_mindmap(client):
    """Test updating a mind map."""
    create_resp = client.post("/api/bibmaps/", json={"title": "Original"})
    mm_id = create_resp.json()["id"]

    response = client.put(f"/api/bibmaps/{mm_id}", json={"title": "Updated"})
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"


def test_delete_mindmap(client):
    """Test deleting a mind map."""
    create_resp = client.post("/api/bibmaps/", json={"title": "To Delete"})
    mm_id = create_resp.json()["id"]

    response = client.delete(f"/api/bibmaps/{mm_id}")
    assert response.status_code == 204

    # Verify it's gone
    get_resp = client.get(f"/api/bibmaps/{mm_id}")
    assert get_resp.status_code == 404


def test_mindmap_not_found(client):
    """Test 404 for non-existent mind map."""
    response = client.get("/api/bibmaps/9999")
    assert response.status_code == 404


def test_publish_mindmap(client):
    """Test publishing a mind map."""
    create_resp = client.post("/api/bibmaps/", json={"title": "To Publish"})
    mm_id = create_resp.json()["id"]

    # Initially not published
    assert create_resp.json()["is_published"] is False

    # Publish it
    response = client.put(f"/api/bibmaps/{mm_id}/publish")
    assert response.status_code == 200
    assert response.json()["is_published"] is True


def test_unpublish_mindmap(client):
    """Test unpublishing a mind map."""
    create_resp = client.post("/api/bibmaps/", json={"title": "To Unpublish"})
    mm_id = create_resp.json()["id"]

    # Publish first
    client.put(f"/api/bibmaps/{mm_id}/publish")

    # Then unpublish
    response = client.put(f"/api/bibmaps/{mm_id}/unpublish")
    assert response.status_code == 200
    assert response.json()["is_published"] is False


def test_get_public_mindmap(client):
    """Test getting a published mind map via public endpoint."""
    create_resp = client.post("/api/bibmaps/", json={"title": "Public Map"})
    mm_id = create_resp.json()["id"]

    # Try to access before publishing - should fail
    response = client.get(f"/api/bibmaps/public/{mm_id}")
    assert response.status_code == 403

    # Publish the map
    client.put(f"/api/bibmaps/{mm_id}/publish")

    # Now should be accessible
    response = client.get(f"/api/bibmaps/public/{mm_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Public Map"


def test_public_mindmap_not_found(client):
    """Test 404 for non-existent public mind map."""
    response = client.get("/api/bibmaps/public/9999")
    assert response.status_code == 404


def test_update_mindmap_with_is_published(client):
    """Test updating a mind map's is_published field via update endpoint."""
    create_resp = client.post("/api/bibmaps/", json={"title": "Test"})
    mm_id = create_resp.json()["id"]

    response = client.put(f"/api/bibmaps/{mm_id}", json={"is_published": True})
    assert response.status_code == 200
    assert response.json()["is_published"] is True
