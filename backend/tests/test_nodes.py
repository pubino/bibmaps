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


# ==================== PUBLIC NODE REFERENCES SECURITY TESTS ====================


def test_public_node_references_requires_published_bibmap(client, bibmap):
    """Test that public node references endpoint requires published bibmap."""
    # Create a node
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Try to access public references before publishing - should fail
    response = client.get(f"/api/nodes/public/{node_id}/references")
    assert response.status_code == 403
    assert "not published" in response.json()["detail"]


def test_public_node_media_requires_published_bibmap(client, bibmap):
    """Test that public node media endpoint requires published bibmap."""
    # Create a node
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Try to access public media before publishing - should fail
    response = client.get(f"/api/nodes/public/{node_id}/media")
    assert response.status_code == 403
    assert "not published" in response.json()["detail"]


def test_public_node_references_works_when_published(client, bibmap):
    """Test that public node references work when bibmap is published."""
    # Create a node
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Publish the bibmap
    client.put(f"/api/bibmaps/{bibmap['id']}/publish")

    # Now public references should work (returns empty list since no taxonomies)
    response = client.get(f"/api/nodes/public/{node_id}/references")
    assert response.status_code == 200
    assert response.json() == []


def test_public_node_media_works_when_published(client, bibmap):
    """Test that public node media work when bibmap is published."""
    # Create a node
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Publish the bibmap
    client.put(f"/api/bibmaps/{bibmap['id']}/publish")

    # Now public media should work (returns empty list since no taxonomies)
    response = client.get(f"/api/nodes/public/{node_id}/media")
    assert response.status_code == 200
    assert response.json() == []


def test_public_node_references_not_found(client):
    """Test that non-existent node returns 404 for public references."""
    response = client.get("/api/nodes/public/99999/references")
    assert response.status_code == 404


def test_public_node_media_not_found(client):
    """Test that non-existent node returns 404 for public media."""
    response = client.get("/api/nodes/public/99999/media")
    assert response.status_code == 404


def test_public_node_references_denied_after_unpublish(client, bibmap):
    """Test that public node references are denied after bibmap is unpublished."""
    # Create a node
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Test Node"
    })
    node_id = create_resp.json()["id"]

    # Publish the bibmap
    client.put(f"/api/bibmaps/{bibmap['id']}/publish")

    # Should work when published
    response = client.get(f"/api/nodes/public/{node_id}/references")
    assert response.status_code == 200

    # Unpublish
    client.put(f"/api/bibmaps/{bibmap['id']}/unpublish")

    # Should be denied again
    response = client.get(f"/api/nodes/public/{node_id}/references")
    assert response.status_code == 403


# ==================== LEGEND CATEGORY TESTS ====================


def test_node_references_by_legend_category(client, bibmap):
    """Test that node returns references matching its background color (legend category)."""
    # Create a node with a specific background color (non-default)
    node_color = "#FF5733"
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Red Node",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create a reference with matching legend_category
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "legend_test_ref",
        "entry_type": "article",
        "title": "Legend Category Test",
        "raw_bibtex": "@article{legend_test_ref, title={Legend Category Test}}",
        "legend_category": node_color
    })
    assert ref_resp.status_code == 201

    # Get references for the node - should include the reference
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1
    assert refs[0]["bibtex_key"] == "legend_test_ref"


def test_node_references_by_legend_category_case_insensitive(client, bibmap):
    """Test that legend category matching is case insensitive."""
    # Create a node with lowercase color
    node_color = "#ff5733"
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Red Node Lower",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create a reference with uppercase legend_category
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "legend_case_test",
        "entry_type": "article",
        "title": "Case Test",
        "raw_bibtex": "@article{legend_case_test, title={Case Test}}",
        "legend_category": "#FF5733"  # Uppercase
    })
    assert ref_resp.status_code == 201

    # Get references for the node - should still match
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1


def test_node_references_default_color_no_legend_match(client, bibmap):
    """Test that default node color doesn't match legend categories."""
    # Create a node with default color
    default_color = "#3B82F6"
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Default Node"
        # background_color defaults to #3B82F6
    })
    node_id = create_resp.json()["id"]

    # Create a reference with the default color as legend_category
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "default_color_ref",
        "entry_type": "article",
        "title": "Default Color Ref",
        "raw_bibtex": "@article{default_color_ref, title={Default}}",
        "legend_category": default_color
    })
    assert ref_resp.status_code == 201

    # Get references for the node - should NOT include ref because default color is excluded
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    # Empty because default color is excluded from legend matching
    assert len(refs) == 0


def test_node_references_combined_tags_and_legend(client, bibmap):
    """Test that node returns references matching either tags OR legend category."""
    # Create a taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Combined Test Tag",
        "color": "#00FF00"
    })
    tax_id = tax_resp.json()["id"]

    # Create a node with specific color AND taxonomy
    node_color = "#FF0000"
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Combined Node",
        "background_color": node_color,
        "taxonomy_ids": [tax_id]
    })
    node_id = create_resp.json()["id"]

    # Create a reference matching the taxonomy (not legend)
    ref1_resp = client.post("/api/references/", json={
        "bibtex_key": "tag_match_ref",
        "entry_type": "article",
        "title": "Tag Match",
        "raw_bibtex": "@article{tag_match_ref, title={Tag Match}}",
        "taxonomy_ids": [tax_id]
    })

    # Create a reference matching the legend category (not taxonomy)
    ref2_resp = client.post("/api/references/", json={
        "bibtex_key": "legend_match_ref",
        "entry_type": "article",
        "title": "Legend Match",
        "raw_bibtex": "@article{legend_match_ref, title={Legend Match}}",
        "legend_category": node_color
    })

    # Get references for the node - should include BOTH
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 2
    ref_keys = {r["bibtex_key"] for r in refs}
    assert "tag_match_ref" in ref_keys
    assert "legend_match_ref" in ref_keys


def test_node_media_by_legend_category(client, bibmap):
    """Test that node returns media matching its background color."""
    node_color = "#ABCDEF"
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Media Test Node",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create media with matching legend_category
    media_resp = client.post("/api/media/", json={
        "title": "Legend Media",
        "url": "https://example.com/legend",
        "legend_category": node_color
    })
    assert media_resp.status_code == 201

    # Get media for the node
    response = client.get(f"/api/nodes/{node_id}/media")
    assert response.status_code == 200
    media_list = response.json()
    assert len(media_list) == 1
    assert media_list[0]["title"] == "Legend Media"


def test_reference_update_legend_category(client):
    """Test updating a reference's legend_category."""
    # Create a reference
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "update_legend_test",
        "entry_type": "article",
        "title": "Update Legend Test",
        "raw_bibtex": "@article{update_legend_test, title={Test}}"
    })
    ref_id = ref_resp.json()["id"]
    assert ref_resp.json()["legend_category"] is None

    # Update with legend_category
    update_resp = client.put(f"/api/references/{ref_id}", json={
        "legend_category": "#123456"
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["legend_category"] == "#123456"

    # Clear legend_category
    update_resp = client.put(f"/api/references/{ref_id}", json={
        "legend_category": None
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["legend_category"] is None


def test_media_update_legend_category(client):
    """Test updating media's legend_category."""
    # Create media
    media_resp = client.post("/api/media/", json={
        "title": "Legend Update Media",
        "url": "https://example.com/test"
    })
    media_id = media_resp.json()["id"]
    assert media_resp.json()["legend_category"] is None

    # Update with legend_category
    update_resp = client.put(f"/api/media/{media_id}", json={
        "legend_category": "#FEDCBA"
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["legend_category"] == "#FEDCBA"


def test_import_bibtex_with_legend_category(client):
    """Test importing references with legend_category."""
    bibtex = """
    @article{import_legend_test,
        title = {Import Legend Test},
        author = {Test Author},
        year = {2024}
    }
    """
    response = client.post("/api/references/import", json={
        "bibtex_content": bibtex,
        "taxonomy_ids": [],
        "legend_category": "#999888"
    })
    assert response.status_code == 200
    assert response.json()["imported"] == 1
    ref = response.json()["references"][0]
    assert ref["legend_category"] == "#999888"


# ==================== MATCH REASONS TESTS ====================


def test_node_references_include_match_reasons_taxonomy(client, bibmap):
    """Test that node references include match_reasons for taxonomy matches."""
    # Create a taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Match Reason Tag",
        "color": "#FF0000"
    })
    tax_id = tax_resp.json()["id"]

    # Create a node with the taxonomy
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Match Reason Node",
        "taxonomy_ids": [tax_id]
    })
    node_id = create_resp.json()["id"]

    # Create a reference with the same taxonomy
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "match_reason_ref",
        "entry_type": "article",
        "title": "Match Reason Test",
        "raw_bibtex": "@article{match_reason_ref, title={Test}}",
        "taxonomy_ids": [tax_id]
    })
    assert ref_resp.status_code == 201

    # Get references for the node
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1

    # Check match_reasons
    assert "match_reasons" in refs[0]
    match_reasons = refs[0]["match_reasons"]
    assert len(match_reasons) == 1
    assert match_reasons[0]["type"] == "taxonomy"
    assert match_reasons[0]["taxonomy_id"] == tax_id
    assert match_reasons[0]["taxonomy_name"] == "Match Reason Tag"
    assert match_reasons[0]["taxonomy_color"] == "#FF0000"


def test_node_references_include_match_reasons_legend(client, bibmap):
    """Test that node references include match_reasons for legend category matches."""
    node_color = "#AABBCC"

    # Create a node with a specific color
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Legend Match Node",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create a reference with matching legend_category
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "legend_reason_ref",
        "entry_type": "article",
        "title": "Legend Match Test",
        "raw_bibtex": "@article{legend_reason_ref, title={Test}}",
        "legend_category": node_color
    })
    assert ref_resp.status_code == 201

    # Get references for the node
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1

    # Check match_reasons
    assert "match_reasons" in refs[0]
    match_reasons = refs[0]["match_reasons"]
    assert len(match_reasons) == 1
    assert match_reasons[0]["type"] == "legend_category"
    assert match_reasons[0]["legend_category"].upper() == node_color.upper()


def test_node_references_include_multiple_match_reasons(client, bibmap):
    """Test that references matching both taxonomy AND legend show both reasons."""
    # Create a taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Both Match Tag",
        "color": "#00FF00"
    })
    tax_id = tax_resp.json()["id"]

    node_color = "#DDEEFF"

    # Create a node with both taxonomy and color
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Both Match Node",
        "background_color": node_color,
        "taxonomy_ids": [tax_id]
    })
    node_id = create_resp.json()["id"]

    # Create a reference matching BOTH taxonomy AND legend
    ref_resp = client.post("/api/references/", json={
        "bibtex_key": "both_match_ref",
        "entry_type": "article",
        "title": "Both Match Test",
        "raw_bibtex": "@article{both_match_ref, title={Test}}",
        "taxonomy_ids": [tax_id],
        "legend_category": node_color
    })
    assert ref_resp.status_code == 201

    # Get references for the node
    response = client.get(f"/api/nodes/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1

    # Check match_reasons - should have both
    match_reasons = refs[0]["match_reasons"]
    assert len(match_reasons) == 2

    reason_types = {r["type"] for r in match_reasons}
    assert "taxonomy" in reason_types
    assert "legend_category" in reason_types


def test_node_media_include_match_reasons_taxonomy(client, bibmap):
    """Test that node media include match_reasons for taxonomy matches."""
    # Create a taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Media Match Tag",
        "color": "#0000FF"
    })
    tax_id = tax_resp.json()["id"]

    # Create a node with the taxonomy
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Media Match Node",
        "taxonomy_ids": [tax_id]
    })
    node_id = create_resp.json()["id"]

    # Create media with the same taxonomy
    media_resp = client.post("/api/media/", json={
        "title": "Match Reason Media",
        "url": "https://example.com/match",
        "taxonomy_ids": [tax_id]
    })
    assert media_resp.status_code == 201

    # Get media for the node
    response = client.get(f"/api/nodes/{node_id}/media")
    assert response.status_code == 200
    media_list = response.json()
    assert len(media_list) == 1

    # Check match_reasons
    assert "match_reasons" in media_list[0]
    match_reasons = media_list[0]["match_reasons"]
    assert len(match_reasons) == 1
    assert match_reasons[0]["type"] == "taxonomy"


def test_node_media_include_match_reasons_legend(client, bibmap):
    """Test that node media include match_reasons for legend category matches."""
    node_color = "#112233"

    # Create a node with a specific color
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Media Legend Node",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create media with matching legend_category
    media_resp = client.post("/api/media/", json={
        "title": "Legend Match Media",
        "url": "https://example.com/legend-media",
        "legend_category": node_color
    })
    assert media_resp.status_code == 201

    # Get media for the node
    response = client.get(f"/api/nodes/{node_id}/media")
    assert response.status_code == 200
    media_list = response.json()
    assert len(media_list) == 1

    # Check match_reasons
    assert "match_reasons" in media_list[0]
    match_reasons = media_list[0]["match_reasons"]
    assert len(match_reasons) == 1
    assert match_reasons[0]["type"] == "legend_category"


def test_public_node_references_include_match_reasons(client, bibmap):
    """Test that public node references include match_reasons."""
    # Create a taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Public Match Tag",
        "color": "#FFFF00"
    })
    tax_id = tax_resp.json()["id"]

    # Create a node with the taxonomy
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Public Match Node",
        "taxonomy_ids": [tax_id]
    })
    node_id = create_resp.json()["id"]

    # Create a reference with the same taxonomy
    client.post("/api/references/", json={
        "bibtex_key": "public_match_ref",
        "entry_type": "article",
        "title": "Public Match Test",
        "raw_bibtex": "@article{public_match_ref, title={Test}}",
        "taxonomy_ids": [tax_id]
    })

    # Publish the bibmap
    client.put(f"/api/bibmaps/{bibmap['id']}/publish")

    # Get public references for the node
    response = client.get(f"/api/nodes/public/{node_id}/references")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1

    # Check match_reasons
    assert "match_reasons" in refs[0]
    assert len(refs[0]["match_reasons"]) == 1


def test_public_node_media_include_match_reasons(client, bibmap):
    """Test that public node media include match_reasons."""
    node_color = "#445566"

    # Create a node with the color
    create_resp = client.post("/api/nodes/", json={
        "bibmap_id": bibmap["id"],
        "label": "Public Media Node",
        "background_color": node_color
    })
    node_id = create_resp.json()["id"]

    # Create media with matching legend
    client.post("/api/media/", json={
        "title": "Public Match Media",
        "url": "https://example.com/public",
        "legend_category": node_color
    })

    # Publish the bibmap
    client.put(f"/api/bibmaps/{bibmap['id']}/publish")

    # Get public media for the node
    response = client.get(f"/api/nodes/public/{node_id}/media")
    assert response.status_code == 200
    media_list = response.json()
    assert len(media_list) == 1

    # Check match_reasons
    assert "match_reasons" in media_list[0]
    assert len(media_list[0]["match_reasons"]) == 1
