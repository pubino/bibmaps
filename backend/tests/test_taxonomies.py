import pytest


def test_create_taxonomy(client):
    """Test creating a taxonomy."""
    response = client.post("/api/taxonomies/", json={
        "name": "Machine Learning",
        "description": "ML related papers",
        "color": "#FF5733"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Machine Learning"
    assert data["color"] == "#FF5733"


def test_list_taxonomies(client):
    """Test listing taxonomies."""
    client.post("/api/taxonomies/", json={"name": "Tag1"})
    client.post("/api/taxonomies/", json={"name": "Tag2"})

    response = client.get("/api/taxonomies/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_duplicate_taxonomy_name_rejected(client):
    """Test that duplicate taxonomy names are rejected."""
    client.post("/api/taxonomies/", json={"name": "Unique"})
    response = client.post("/api/taxonomies/", json={"name": "Unique"})
    assert response.status_code == 400


def test_update_taxonomy(client):
    """Test updating a taxonomy."""
    create_resp = client.post("/api/taxonomies/", json={"name": "Original"})
    tax_id = create_resp.json()["id"]

    response = client.put(f"/api/taxonomies/{tax_id}", json={
        "name": "Updated",
        "color": "#00FF00"
    })
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"
    assert response.json()["color"] == "#00FF00"


def test_delete_taxonomy(client):
    """Test deleting a taxonomy."""
    create_resp = client.post("/api/taxonomies/", json={"name": "ToDelete"})
    tax_id = create_resp.json()["id"]

    response = client.delete(f"/api/taxonomies/{tax_id}")
    assert response.status_code == 204


def test_get_taxonomy_references(client):
    """Test getting references for a taxonomy."""
    # Create taxonomy
    tax_resp = client.post("/api/taxonomies/", json={"name": "TestTag"})
    tax_id = tax_resp.json()["id"]

    # Import reference with taxonomy
    client.post("/api/references/import", json={
        "bibtex_content": "@article{test2020, title={Test}, year={2020}}",
        "taxonomy_ids": [tax_id]
    })

    response = client.get(f"/api/taxonomies/{tax_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1
    assert refs[0]["bibtex_key"] == "test2020"


def test_get_taxonomy_nodes(client):
    """Test getting nodes for a taxonomy."""
    # Create taxonomy
    tax_resp = client.post("/api/taxonomies/", json={"name": "NodeTag"})
    tax_id = tax_resp.json()["id"]

    # Create mindmap and node with taxonomy
    bm_resp = client.post("/api/bibmaps/", json={"title": "Test Map"})
    bm_id = bm_resp.json()["id"]

    client.post("/api/nodes/", json={
        "bibmap_id": bm_id,
        "label": "Tagged Node",
        "taxonomy_ids": [tax_id]
    })

    response = client.get(f"/api/taxonomies/{tax_id}/nodes")
    assert response.status_code == 200
    nodes = response.json()
    assert len(nodes) == 1
    assert nodes[0]["label"] == "Tagged Node"
