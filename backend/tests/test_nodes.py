import pytest


@pytest.fixture
def bibmap(client):
    """Create a mind map for node tests."""
    response = client.post("/api/bibmaps/", json={"title": "Test Map"})
    return response.json()


def test_create_node(client, bibmap):
    """Test creating a node."""
    response = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node",
        "x": 100,
        "y": 200,
        "background_color": "#FF0000"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["label"] == "Test Node"
    assert data["x"] == 100
    assert data["y"] == 200
    assert data["background_color"] == "#FF0000"


def test_update_node(client, bibmap):
    """Test updating a node."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Original"
    })
    node_id = create_resp.json()["id"]

    response = client.put(f"/api/nodes/{node_id}", json={
        "label": "Updated",
        "background_color": "#00FF00"
    })
    assert response.status_code == 200
    assert response.json()["label"] == "Updated"
    assert response.json()["background_color"] == "#00FF00"


def test_update_node_position(client, bibmap):
    """Test updating just node position."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Moveable",
        "x": 0,
        "y": 0
    })
    node_id = create_resp.json()["id"]

    response = client.put(f"/api/nodes/{node_id}/position?x=500&y=300")
    assert response.status_code == 200
    assert response.json()["x"] == 500
    assert response.json()["y"] == 300


def test_delete_node(client, bibmap):
    """Test deleting a node."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "To Delete"
    })
    node_id = create_resp.json()["id"]

    response = client.delete(f"/api/nodes/{node_id}")
    assert response.status_code == 204


def test_update_node_size(client, bibmap):
    """Test updating just node size."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Resizable",
        "width": 150,
        "height": 60
    })
    node_id = create_resp.json()["id"]

    response = client.put(f"/api/nodes/{node_id}/size?width=200&height=100")
    assert response.status_code == 200
    assert response.json()["width"] == 200
    assert response.json()["height"] == 100


def test_update_node_size_minimum(client, bibmap):
    """Test that node size respects minimum dimensions."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Resizable",
        "width": 150,
        "height": 60
    })
    node_id = create_resp.json()["id"]

    # Try to set size below minimum (50x30)
    response = client.put(f"/api/nodes/{node_id}/size?width=20&height=10")
    assert response.status_code == 200
    # Should be clamped to minimum
    assert response.json()["width"] == 50
    assert response.json()["height"] == 30


def test_node_with_taxonomies(client, bibmap):
    """Test creating a node with taxonomies."""
    # Create taxonomy first
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Test Tag",
        "color": "#FF00FF"
    })
    tax_id = tax_resp.json()["id"]

    # Create node with taxonomy
    response = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Tagged Node",
        "taxonomy_ids": [tax_id]
    })
    assert response.status_code == 201
    data = response.json()
    assert len(data["taxonomies"]) == 1
    assert data["taxonomies"][0]["name"] == "Test Tag"


def test_node_link_to_references_default(client, bibmap):
    """Test that link_to_references defaults to True."""
    response = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    assert response.status_code == 201
    assert response.json()["link_to_references"] is True


def test_node_link_to_references_false(client, bibmap):
    """Test creating a node with link_to_references set to False."""
    response = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "No Link Node",
        "link_to_references": False
    })
    assert response.status_code == 201
    assert response.json()["link_to_references"] is False


def test_update_node_link_to_references(client, bibmap):
    """Test updating link_to_references field."""
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Initially True
    assert create_resp.json()["link_to_references"] is True

    # Update to False
    response = client.put(f"/api/nodes/{node_id}", json={
        "link_to_references": False
    })
    assert response.status_code == 200
    assert response.json()["link_to_references"] is False

    # Update back to True
    response = client.put(f"/api/nodes/{node_id}", json={
        "link_to_references": True
    })
    assert response.status_code == 200
    assert response.json()["link_to_references"] is True
