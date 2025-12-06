import pytest


@pytest.fixture
def bibmap_with_nodes(client):
    """Create a mind map with two nodes."""
    mm_resp = client.post("/api/bibmaps/", json={"title": "Test Map"})
    bibmap = mm_resp.json()

    node1_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Node 1"
    })
    node2_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Node 2"
    })

    return {
        "bibmap": bibmap,
        "node1": node1_resp.json(),
        "node2": node2_resp.json()
    }


def test_create_connection(client, bibmap_with_nodes):
    """Test creating a connection between nodes."""
    data = bibmap_with_nodes
    response = client.post("/api/connections/", json={
        "bibmap_id": data["bibmap"]["id"],
        "source_node_id": data["node1"]["id"],
        "target_node_id": data["node2"]["id"]
    })
    assert response.status_code == 201
    conn = response.json()
    assert conn["source_node_id"] == data["node1"]["id"]
    assert conn["target_node_id"] == data["node2"]["id"]


def test_connection_prevents_self_loop(client, bibmap_with_nodes):
    """Test that self-connections are prevented."""
    data = bibmap_with_nodes
    response = client.post("/api/connections/", json={
        "bibmap_id": data["bibmap"]["id"],
        "source_node_id": data["node1"]["id"],
        "target_node_id": data["node1"]["id"]
    })
    assert response.status_code == 400


def test_update_connection(client, bibmap_with_nodes):
    """Test updating a connection."""
    data = bibmap_with_nodes
    create_resp = client.post("/api/connections/", json={
        "bibmap_id": data["bibmap"]["id"],
        "source_node_id": data["node1"]["id"],
        "target_node_id": data["node2"]["id"]
    })
    conn_id = create_resp.json()["id"]

    response = client.put(f"/api/connections/{conn_id}", json={
        "line_color": "#FF0000",
        "line_style": "dashed"
    })
    assert response.status_code == 200
    assert response.json()["line_color"] == "#FF0000"
    assert response.json()["line_style"] == "dashed"


def test_delete_connection(client, bibmap_with_nodes):
    """Test deleting a connection."""
    data = bibmap_with_nodes
    create_resp = client.post("/api/connections/", json={
        "bibmap_id": data["bibmap"]["id"],
        "source_node_id": data["node1"]["id"],
        "target_node_id": data["node2"]["id"]
    })
    conn_id = create_resp.json()["id"]

    response = client.delete(f"/api/connections/{conn_id}")
    assert response.status_code == 204
