import pytest


SAMPLE_BIBTEX = """
@article{smith2020,
  author = {Smith, John and Doe, Jane},
  title = {A Study on Mind Maps},
  journal = {Journal of Visualization},
  year = {2020},
  volume = {15},
  pages = {100-120},
  doi = {10.1234/jov.2020.001}
}

@inproceedings{johnson2021,
  author = {Johnson, Alice},
  title = {Reference Management Systems},
  booktitle = {Proceedings of Academic Tools},
  year = {2021},
  publisher = {ACM}
}
"""


def test_import_bibtex(client):
    """Test importing BibTeX references."""
    response = client.post("/api/references/import", json={
        "bibtex_content": SAMPLE_BIBTEX
    })
    assert response.status_code == 200
    data = response.json()
    assert data["imported"] == 2
    assert len(data["references"]) == 2


def test_import_bibtex_with_taxonomy(client):
    """Test importing BibTeX with taxonomies applied."""
    # Create taxonomy
    tax_resp = client.post("/api/taxonomies/", json={
        "name": "Academic",
        "color": "#0000FF"
    })
    tax_id = tax_resp.json()["id"]

    response = client.post("/api/references/import", json={
        "bibtex_content": SAMPLE_BIBTEX,
        "taxonomy_ids": [tax_id]
    })
    assert response.status_code == 200
    data = response.json()

    # Check taxonomies were applied
    for ref in data["references"]:
        assert len(ref["taxonomies"]) == 1
        assert ref["taxonomies"][0]["name"] == "Academic"


def test_list_references(client):
    """Test listing references."""
    client.post("/api/references/import", json={
        "bibtex_content": SAMPLE_BIBTEX
    })

    response = client.get("/api/references/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_references_by_taxonomy(client):
    """Test filtering references by taxonomy."""
    # Create taxonomies
    tax1_resp = client.post("/api/taxonomies/", json={"name": "Tag1"})
    tax1_id = tax1_resp.json()["id"]

    # Import with taxonomy
    client.post("/api/references/import", json={
        "bibtex_content": "@article{ref1, title={Test}, year={2020}}",
        "taxonomy_ids": [tax1_id]
    })

    # Import without taxonomy
    client.post("/api/references/import", json={
        "bibtex_content": "@article{ref2, title={Test2}, year={2021}}"
    })

    # Filter by taxonomy
    response = client.get(f"/api/references/?taxonomy_id={tax1_id}")
    assert response.status_code == 200
    refs = response.json()
    assert len(refs) == 1
    assert refs[0]["bibtex_key"] == "ref1"


def test_update_reference_taxonomies(client):
    """Test updating reference taxonomies."""
    # Create reference
    client.post("/api/references/import", json={
        "bibtex_content": "@article{test2020, title={Test}, year={2020}}"
    })
    refs = client.get("/api/references/").json()
    ref_id = refs[0]["id"]

    # Create taxonomy
    tax_resp = client.post("/api/taxonomies/", json={"name": "NewTag"})
    tax_id = tax_resp.json()["id"]

    # Update reference
    response = client.put(f"/api/references/{ref_id}", json={
        "taxonomy_ids": [tax_id]
    })
    assert response.status_code == 200
    assert len(response.json()["taxonomies"]) == 1


def test_duplicate_bibtex_key_skipped(client):
    """Test that duplicate BibTeX keys are skipped on import."""
    # Import first time
    client.post("/api/references/import", json={
        "bibtex_content": "@article{test2020, title={Test}, year={2020}}"
    })

    # Import same key again
    response = client.post("/api/references/import", json={
        "bibtex_content": "@article{test2020, title={Different}, year={2021}}"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["imported"] == 0
    assert "Skipped duplicate" in data["errors"][0]
