"""
Tests to ensure all BibMap data is properly returned by the API for export.

These tests verify that:
1. The BibMap endpoint returns complete node and connection data
2. All node properties are included in the response
3. All connection properties are included in the response
4. Tags are properly linked and returned
5. References include all data needed for BibTeX export
"""
import pytest


class TestBibMapExportDataIntegrity:
    """Tests for BibMap data completeness for export."""

    def test_bibmap_includes_all_nodes(self, client):
        """Verify all created nodes are returned when fetching a BibMap."""
        # Create a BibMap
        bibmap = client.post("/api/bibmaps/", json={
            "title": "Export Test Map",
            "description": "Testing export data"
        }).json()

        # Create multiple nodes
        node_data = [
            {"bibmap_id": bibmap["id"], "label": "Node 1", "x": 100, "y": 100},
            {"bibmap_id": bibmap["id"], "label": "Node 2", "x": 200, "y": 200},
            {"bibmap_id": bibmap["id"], "label": "Node 3", "x": 300, "y": 300},
        ]
        created_nodes = []
        for data in node_data:
            node = client.post("/api/nodes/", json=data).json()
            created_nodes.append(node)

        # Fetch the complete BibMap
        response = client.get(f"/api/bibmaps/{bibmap['id']}")
        assert response.status_code == 200
        result = response.json()

        # Verify all nodes are included
        assert len(result["nodes"]) == 3
        returned_ids = {n["id"] for n in result["nodes"]}
        expected_ids = {n["id"] for n in created_nodes}
        assert returned_ids == expected_ids

    def test_node_includes_all_properties(self, client):
        """Verify all node properties are returned for export."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        # Create a node with all properties set
        node_data = {
            "bibmap_id": bibmap["id"],
            "label": "Complete Node",
            "description": "A fully specified node",
            "x": 150.5,
            "y": 250.75,
            "width": 180,
            "height": 80,
            "background_color": "#3B82F6",
            "text_color": "#FFFFFF",
            "border_color": "#1E40AF",
            "font_size": 16,
            "font_family": "Arial, sans-serif",
            "font_bold": True,
            "font_italic": True,
            "font_underline": True,
            "shape": "ellipse",
            "link_to_references": False
        }
        client.post("/api/nodes/", json=node_data)

        # Fetch the BibMap and check node
        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        node = result["nodes"][0]

        # Verify all properties are present and correct
        assert node["label"] == "Complete Node"
        assert node["description"] == "A fully specified node"
        assert node["x"] == 150.5
        assert node["y"] == 250.75
        assert node["width"] == 180
        assert node["height"] == 80
        assert node["background_color"] == "#3B82F6"
        assert node["text_color"] == "#FFFFFF"
        assert node["border_color"] == "#1E40AF"
        assert node["font_size"] == 16
        assert node["font_family"] == "Arial, sans-serif"
        assert node["font_bold"] is True
        assert node["font_italic"] is True
        assert node["font_underline"] is True
        assert node["shape"] == "ellipse"
        assert node["link_to_references"] is False

    def test_node_preserves_zero_values(self, client):
        """Verify zero values are not lost (not treated as falsy)."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node_data = {
            "bibmap_id": bibmap["id"],
            "label": "Zero Position Node",
            "x": 0,
            "y": 0,
        }
        client.post("/api/nodes/", json=node_data)

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        node = result["nodes"][0]

        assert node["x"] == 0
        assert node["y"] == 0

    def test_node_preserves_false_boolean_values(self, client):
        """Verify false boolean values are preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node_data = {
            "bibmap_id": bibmap["id"],
            "label": "Test Node",
            "font_bold": False,
            "font_italic": False,
            "font_underline": False,
            "link_to_references": False,
        }
        client.post("/api/nodes/", json=node_data)

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        node = result["nodes"][0]

        assert node["font_bold"] is False
        assert node["font_italic"] is False
        assert node["font_underline"] is False
        assert node["link_to_references"] is False

    def test_node_preserves_empty_description(self, client):
        """Verify empty string description is preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node_data = {
            "bibmap_id": bibmap["id"],
            "label": "Test Node",
            "description": "",
        }
        client.post("/api/nodes/", json=node_data)

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        node = result["nodes"][0]

        # Empty string or None are both acceptable
        assert node["description"] in ["", None]

    def test_bibmap_includes_all_connections(self, client):
        """Verify all created connections are returned."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        # Create nodes first
        node1 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "Node 1", "x": 0, "y": 0
        }).json()
        node2 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "Node 2", "x": 100, "y": 0
        }).json()
        node3 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "Node 3", "x": 200, "y": 0
        }).json()

        # Create connections
        conn_data = [
            {"bibmap_id": bibmap["id"], "source_node_id": node1["id"], "target_node_id": node2["id"]},
            {"bibmap_id": bibmap["id"], "source_node_id": node2["id"], "target_node_id": node3["id"]},
        ]
        created_conns = []
        for data in conn_data:
            conn = client.post("/api/connections/", json=data).json()
            created_conns.append(conn)

        # Fetch BibMap
        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()

        assert len(result["connections"]) == 2
        returned_ids = {c["id"] for c in result["connections"]}
        expected_ids = {c["id"] for c in created_conns}
        assert returned_ids == expected_ids

    def test_connection_includes_all_properties(self, client):
        """Verify all connection properties are returned."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node1 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "Node 1", "x": 0, "y": 0
        }).json()
        node2 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "Node 2", "x": 100, "y": 0
        }).json()

        conn_data = {
            "bibmap_id": bibmap["id"],
            "source_node_id": node1["id"],
            "target_node_id": node2["id"],
            "label": "test connection",
            "show_label": True,
            "line_color": "#EF4444",
            "line_width": 3,
            "line_style": "dashed",
            "arrow_type": "none"
        }
        client.post("/api/connections/", json=conn_data)

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        conn = result["connections"][0]

        assert conn["source_node_id"] == node1["id"]
        assert conn["target_node_id"] == node2["id"]
        assert conn["label"] == "test connection"
        assert conn["show_label"] is True
        assert conn["line_color"] == "#EF4444"
        assert conn["line_width"] == 3
        assert conn["line_style"] == "dashed"
        assert conn["arrow_type"] == "none"

    def test_node_includes_taxonomies(self, client):
        """Verify node taxonomies are included for export."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        # Create taxonomies (tags)
        tag1 = client.post("/api/taxonomies/", json={
            "name": "AI", "color": "#FF5733", "description": "AI research"
        }).json()
        tag2 = client.post("/api/taxonomies/", json={
            "name": "ML", "color": "#33FF57", "description": "Machine Learning"
        }).json()

        # Create node with taxonomies
        node = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"],
            "label": "AI Node",
            "x": 0, "y": 0,
            "taxonomy_ids": [tag1["id"], tag2["id"]]
        }).json()

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        node = result["nodes"][0]

        assert "taxonomies" in node
        assert len(node["taxonomies"]) == 2
        taxonomy_names = {t["name"] for t in node["taxonomies"]}
        assert taxonomy_names == {"AI", "ML"}

    def test_taxonomy_includes_all_properties(self, client):
        """Verify taxonomy data is complete."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        tag = client.post("/api/taxonomies/", json={
            "name": "Research",
            "color": "#123456",
            "description": "Research papers"
        }).json()

        client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"],
            "label": "Test",
            "x": 0, "y": 0,
            "taxonomy_ids": [tag["id"]]
        })

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        taxonomy = result["nodes"][0]["taxonomies"][0]

        assert taxonomy["id"] == tag["id"]
        assert taxonomy["name"] == "Research"
        assert taxonomy["color"] == "#123456"
        assert taxonomy["description"] == "Research papers"

    def test_bibmap_metadata_complete(self, client):
        """Verify BibMap metadata is complete for export."""
        resp = client.post("/api/bibmaps/", json={
            "title": "Complete Map",
            "description": "A fully described map"
        })
        bibmap_id = resp.json()["id"]

        # Publish the map
        client.put(f"/api/bibmaps/{bibmap_id}/publish")

        result = client.get(f"/api/bibmaps/{bibmap_id}").json()

        assert result["title"] == "Complete Map"
        assert result["description"] == "A fully described map"
        assert result["is_published"] is True
        assert "created_at" in result
        assert "updated_at" in result


class TestReferenceExportDataIntegrity:
    """Tests for reference data completeness for export."""

    def test_reference_includes_raw_bibtex(self, client):
        """Verify raw BibTeX is preserved for export."""
        bibtex = """@article{test2024,
  author = {Test Author},
  title = {Test Paper},
  journal = {Test Journal},
  year = {2024}
}"""
        result = client.post("/api/references/import", json={
            "bibtex_content": bibtex,
            "taxonomy_ids": []
        }).json()

        assert result["imported"] == 1
        ref = result["references"][0]
        # BibTeX parser may normalize formatting but should preserve content
        assert "raw_bibtex" in ref
        assert "@article{test2024" in ref["raw_bibtex"]
        assert "Test Author" in ref["raw_bibtex"]
        assert "Test Paper" in ref["raw_bibtex"]
        assert "Test Journal" in ref["raw_bibtex"]
        assert "2024" in ref["raw_bibtex"]

    def test_reference_includes_all_fields(self, client):
        """Verify all parsed fields are available."""
        bibtex = """@article{complete2024,
  author = {John Smith and Jane Doe},
  title = {Complete Paper},
  journal = {Nature},
  year = {2024},
  volume = {123},
  number = {4},
  pages = {100-200},
  doi = {10.1234/test},
  url = {https://example.com},
  abstract = {This is the abstract.}
}"""
        result = client.post("/api/references/import", json={
            "bibtex_content": bibtex
        }).json()

        ref = result["references"][0]
        assert ref["bibtex_key"] == "complete2024"
        assert ref["entry_type"] == "article"
        assert ref["title"] == "Complete Paper"
        assert ref["author"] == "John Smith and Jane Doe"
        assert ref["year"] == "2024"
        assert ref["journal"] == "Nature"
        assert ref["volume"] == "123"
        assert ref["number"] == "4"
        assert ref["pages"] == "100-200"
        assert ref["doi"] == "10.1234/test"
        assert ref["url"] == "https://example.com"
        assert ref["abstract"] == "This is the abstract."

    def test_reference_includes_taxonomies(self, client):
        """Verify reference taxonomies are preserved."""
        tag1 = client.post("/api/taxonomies/", json={"name": "Tag1"}).json()
        tag2 = client.post("/api/taxonomies/", json={"name": "Tag2"}).json()

        bibtex = "@article{tagged2024, author = {Test}, title = {Test}}"
        result = client.post("/api/references/import", json={
            "bibtex_content": bibtex,
            "taxonomy_ids": [tag1["id"], tag2["id"]]
        }).json()

        ref_id = result["references"][0]["id"]
        ref = client.get(f"/api/references/{ref_id}").json()

        assert len(ref["taxonomies"]) == 2
        taxonomy_names = {t["name"] for t in ref["taxonomies"]}
        assert taxonomy_names == {"Tag1", "Tag2"}

    def test_references_list_includes_all(self, client):
        """Verify references list endpoint returns all references."""
        bibtex = """
@article{ref1, author = {A}, title = {T1}}
@article{ref2, author = {B}, title = {T2}}
@article{ref3, author = {C}, title = {T3}}
"""
        client.post("/api/references/import", json={"bibtex_content": bibtex})

        refs = client.get("/api/references/").json()
        assert len(refs) >= 3
        keys = {r["bibtex_key"] for r in refs}
        assert {"ref1", "ref2", "ref3"}.issubset(keys)


class TestNodeShapeSupport:
    """Tests to ensure all node shapes are properly stored and returned."""

    @pytest.mark.parametrize("shape", ["rectangle", "ellipse", "diamond"])
    def test_node_shape_preserved(self, client, shape):
        """Verify each node shape is preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"],
            "label": f"{shape} node",
            "x": 0, "y": 0,
            "shape": shape
        })

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        assert result["nodes"][0]["shape"] == shape


class TestConnectionStyleSupport:
    """Tests to ensure all connection styles are properly stored and returned."""

    @pytest.mark.parametrize("line_style", ["solid", "dashed", "dotted"])
    def test_line_style_preserved(self, client, line_style):
        """Verify each line style is preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node1 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N1", "x": 0, "y": 0
        }).json()
        node2 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N2", "x": 100, "y": 0
        }).json()

        client.post("/api/connections/", json={
            "bibmap_id": bibmap["id"],
            "source_node_id": node1["id"],
            "target_node_id": node2["id"],
            "line_style": line_style
        })

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        assert result["connections"][0]["line_style"] == line_style

    @pytest.mark.parametrize("arrow_type", ["end", "none"])
    def test_arrow_type_preserved(self, client, arrow_type):
        """Verify each arrow type is preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node1 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N1", "x": 0, "y": 0
        }).json()
        node2 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N2", "x": 100, "y": 0
        }).json()

        client.post("/api/connections/", json={
            "bibmap_id": bibmap["id"],
            "source_node_id": node1["id"],
            "target_node_id": node2["id"],
            "arrow_type": arrow_type
        })

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        assert result["connections"][0]["arrow_type"] == arrow_type

    @pytest.mark.parametrize("line_width", [1, 2, 5, 10])
    def test_line_width_preserved(self, client, line_width):
        """Verify line width values are preserved."""
        bibmap = client.post("/api/bibmaps/", json={"title": "Test"}).json()

        node1 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N1", "x": 0, "y": 0
        }).json()
        node2 = client.post("/api/nodes/", json={
            "bibmap_id": bibmap["id"], "label": "N2", "x": 100, "y": 0
        }).json()

        client.post("/api/connections/", json={
            "bibmap_id": bibmap["id"],
            "source_node_id": node1["id"],
            "target_node_id": node2["id"],
            "line_width": line_width
        })

        result = client.get(f"/api/bibmaps/{bibmap['id']}").json()
        assert result["connections"][0]["line_width"] == line_width
