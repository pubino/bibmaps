import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildBibmapJson,
  getLinkedReferences,
  buildBibtexContent,
  buildTagMappings,
  generateFilename,
  NODE_PROPERTIES,
  CONNECTION_PROPERTIES,
  BIBMAP_PROPERTIES,
  TAG_PROPERTIES
} from './bibmapExport.js';

/**
 * Test fixtures representing a comprehensive BibMap with all possible data
 */
function createTestBibmap() {
  return {
    id: 1,
    title: 'Test BibMap',
    description: 'A comprehensive test map',
    is_published: true,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T15:30:00Z',
    user_id: 'user123',
    nodes: [
      {
        id: 101,
        label: 'Machine Learning',
        description: 'Introduction to ML concepts',
        x: 100.5,
        y: 200.75,
        width: 180,
        height: 80,
        background_color: '#3B82F6',
        text_color: '#FFFFFF',
        border_color: '#1E40AF',
        font_size: 16,
        font_family: 'Arial, sans-serif',
        font_bold: true,
        font_italic: false,
        font_underline: false,
        shape: 'rectangle',
        link_to_references: true,
        taxonomies: [
          { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' },
          { id: 2, name: 'Research', color: '#33FF57', description: 'Research papers' }
        ]
      },
      {
        id: 102,
        label: 'Deep Learning',
        description: 'Neural network architectures',
        x: 400,
        y: 200,
        width: 150,
        height: 60,
        background_color: '#10B981',
        text_color: '#000000',
        border_color: '#059669',
        font_size: 14,
        font_family: 'Georgia, serif',
        font_bold: false,
        font_italic: true,
        font_underline: true,
        shape: 'ellipse',
        link_to_references: false,
        taxonomies: [
          { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' }
        ]
      },
      {
        id: 103,
        label: 'Standalone Node',
        description: 'A node with no tags',
        x: 250,
        y: 400,
        width: 120,
        height: 50,
        background_color: '#6B7280',
        text_color: '#FFFFFF',
        border_color: '#4B5563',
        font_size: 12,
        font_family: 'monospace',
        font_bold: false,
        font_italic: false,
        font_underline: false,
        shape: 'diamond',
        link_to_references: true,
        taxonomies: []
      }
    ],
    connections: [
      {
        id: 201,
        source_node_id: 101,
        target_node_id: 102,
        label: 'extends',
        show_label: true,
        line_color: '#6B7280',
        line_width: 2,
        line_style: 'solid',
        arrow_type: 'end'
      },
      {
        id: 202,
        source_node_id: 102,
        target_node_id: 103,
        label: '',
        show_label: false,
        line_color: '#EF4444',
        line_width: 3,
        line_style: 'dashed',
        arrow_type: 'none'
      }
    ]
  };
}

function createTestReferences() {
  return [
    {
      id: 301,
      bibtex_key: 'smith2023ml',
      entry_type: 'article',
      title: 'Advances in Machine Learning',
      author: 'Smith, John and Doe, Jane',
      year: '2023',
      journal: 'Journal of AI',
      raw_bibtex: '@article{smith2023ml,\n  author = {Smith, John and Doe, Jane},\n  title = {Advances in Machine Learning},\n  journal = {Journal of AI},\n  year = {2023}\n}',
      taxonomies: [
        { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' }
      ]
    },
    {
      id: 302,
      bibtex_key: 'johnson2022deep',
      entry_type: 'inproceedings',
      title: 'Deep Learning Methods',
      author: 'Johnson, Bob',
      year: '2022',
      booktitle: 'Proceedings of ML Conference',
      raw_bibtex: '@inproceedings{johnson2022deep,\n  author = {Johnson, Bob},\n  title = {Deep Learning Methods},\n  booktitle = {Proceedings of ML Conference},\n  year = {2022}\n}',
      taxonomies: [
        { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' },
        { id: 2, name: 'Research', color: '#33FF57', description: 'Research papers' }
      ]
    },
    {
      id: 303,
      bibtex_key: 'unrelated2021',
      entry_type: 'article',
      title: 'Unrelated Paper',
      author: 'Nobody, Someone',
      year: '2021',
      journal: 'Other Journal',
      raw_bibtex: '@article{unrelated2021,\n  author = {Nobody, Someone},\n  title = {Unrelated Paper},\n  journal = {Other Journal},\n  year = {2021}\n}',
      taxonomies: [
        { id: 99, name: 'Unrelated', color: '#000000', description: 'Not linked' }
      ]
    }
  ];
}

describe('BibMap Export - Data Integrity', () => {
  let bibmap;
  let references;

  beforeEach(() => {
    bibmap = createTestBibmap();
    references = createTestReferences();
  });

  describe('buildBibmapJson - BibMap metadata', () => {
    it('should include all BibMap metadata properties', () => {
      const result = buildBibmapJson(bibmap);

      expect(result.bibmap.title).toBe('Test BibMap');
      expect(result.bibmap.description).toBe('A comprehensive test map');
      expect(result.bibmap.is_published).toBe(true);
      expect(result.bibmap.created_at).toBe('2024-01-15T10:00:00Z');
      expect(result.bibmap.updated_at).toBe('2024-01-20T15:30:00Z');
    });

    it('should preserve empty description', () => {
      bibmap.description = '';
      const result = buildBibmapJson(bibmap);
      expect(result.bibmap.description).toBe('');
    });

    it('should preserve null description', () => {
      bibmap.description = null;
      const result = buildBibmapJson(bibmap);
      expect(result.bibmap.description).toBeNull();
    });

    it('should include version and export timestamp', () => {
      const result = buildBibmapJson(bibmap);
      expect(result.version).toBe('1.0');
      expect(result.exported_at).toBeDefined();
      expect(new Date(result.exported_at)).toBeInstanceOf(Date);
    });
  });

  describe('buildBibmapJson - Node data completeness', () => {
    it('should export all nodes', () => {
      const result = buildBibmapJson(bibmap);
      expect(result.nodes).toHaveLength(3);
    });

    it('should include all required node properties', () => {
      const result = buildBibmapJson(bibmap);

      result.nodes.forEach(node => {
        NODE_PROPERTIES.forEach(prop => {
          expect(node).toHaveProperty(prop);
        });
      });
    });

    it('should preserve node position with decimal precision', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.x).toBe(100.5);
      expect(node.y).toBe(200.75);
    });

    it('should preserve node dimensions', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.width).toBe(180);
      expect(node.height).toBe(80);
    });

    it('should preserve all styling properties', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.background_color).toBe('#3B82F6');
      expect(node.text_color).toBe('#FFFFFF');
      expect(node.border_color).toBe('#1E40AF');
    });

    it('should preserve all font properties', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.font_size).toBe(16);
      expect(node.font_family).toBe('Arial, sans-serif');
      expect(node.font_bold).toBe(true);
      expect(node.font_italic).toBe(false);
      expect(node.font_underline).toBe(false);
    });

    it('should preserve shape property', () => {
      const result = buildBibmapJson(bibmap);

      const rectNode = result.nodes.find(n => n.id === 101);
      const ellipseNode = result.nodes.find(n => n.id === 102);
      const diamondNode = result.nodes.find(n => n.id === 103);

      expect(rectNode.shape).toBe('rectangle');
      expect(ellipseNode.shape).toBe('ellipse');
      expect(diamondNode.shape).toBe('diamond');
    });

    it('should preserve link_to_references flag', () => {
      const result = buildBibmapJson(bibmap);

      const linkedNode = result.nodes.find(n => n.id === 101);
      const unlinkedNode = result.nodes.find(n => n.id === 102);

      expect(linkedNode.link_to_references).toBe(true);
      expect(unlinkedNode.link_to_references).toBe(false);
    });

    it('should convert taxonomies to tag_names array', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.tag_names).toEqual(['AI', 'Research']);
    });

    it('should handle nodes with no taxonomies', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 103);

      expect(node.tag_names).toEqual([]);
    });

    it('should handle nodes with undefined taxonomies', () => {
      bibmap.nodes[0].taxonomies = undefined;
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.tag_names).toEqual([]);
    });

    it('should preserve node label and description', () => {
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.label).toBe('Machine Learning');
      expect(node.description).toBe('Introduction to ML concepts');
    });

    it('should preserve empty node description', () => {
      bibmap.nodes[0].description = '';
      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.description).toBe('');
    });
  });

  describe('buildBibmapJson - Connection data completeness', () => {
    it('should export all connections', () => {
      const result = buildBibmapJson(bibmap);
      expect(result.connections).toHaveLength(2);
    });

    it('should include all required connection properties', () => {
      const result = buildBibmapJson(bibmap);

      result.connections.forEach(conn => {
        CONNECTION_PROPERTIES.forEach(prop => {
          expect(conn).toHaveProperty(prop);
        });
      });
    });

    it('should preserve source and target node IDs', () => {
      const result = buildBibmapJson(bibmap);
      const conn = result.connections.find(c => c.id === 201);

      expect(conn.source_node_id).toBe(101);
      expect(conn.target_node_id).toBe(102);
    });

    it('should preserve connection label and show_label flag', () => {
      const result = buildBibmapJson(bibmap);
      const labeledConn = result.connections.find(c => c.id === 201);
      const unlabeledConn = result.connections.find(c => c.id === 202);

      expect(labeledConn.label).toBe('extends');
      expect(labeledConn.show_label).toBe(true);
      expect(unlabeledConn.label).toBe('');
      expect(unlabeledConn.show_label).toBe(false);
    });

    it('should preserve connection styling properties', () => {
      const result = buildBibmapJson(bibmap);
      const conn = result.connections.find(c => c.id === 202);

      expect(conn.line_color).toBe('#EF4444');
      expect(conn.line_width).toBe(3);
      expect(conn.line_style).toBe('dashed');
      expect(conn.arrow_type).toBe('none');
    });

    it('should preserve all line styles', () => {
      const result = buildBibmapJson(bibmap);

      const solidConn = result.connections.find(c => c.id === 201);
      const dashedConn = result.connections.find(c => c.id === 202);

      expect(solidConn.line_style).toBe('solid');
      expect(dashedConn.line_style).toBe('dashed');
    });

    it('should preserve arrow types', () => {
      const result = buildBibmapJson(bibmap);

      const arrowConn = result.connections.find(c => c.id === 201);
      const noArrowConn = result.connections.find(c => c.id === 202);

      expect(arrowConn.arrow_type).toBe('end');
      expect(noArrowConn.arrow_type).toBe('none');
    });
  });

  describe('buildBibmapJson - Tag data completeness', () => {
    it('should export all unique tags from nodes', () => {
      const result = buildBibmapJson(bibmap);

      expect(result.tags).toHaveLength(2);
      expect(result.tags.map(t => t.name).sort()).toEqual(['AI', 'Research']);
    });

    it('should include all tag properties', () => {
      const result = buildBibmapJson(bibmap);

      result.tags.forEach(tag => {
        TAG_PROPERTIES.forEach(prop => {
          expect(tag).toHaveProperty(prop);
        });
      });
    });

    it('should preserve tag colors', () => {
      const result = buildBibmapJson(bibmap);

      const aiTag = result.tags.find(t => t.name === 'AI');
      const researchTag = result.tags.find(t => t.name === 'Research');

      expect(aiTag.color).toBe('#FF5733');
      expect(researchTag.color).toBe('#33FF57');
    });

    it('should preserve tag descriptions', () => {
      const result = buildBibmapJson(bibmap);

      const aiTag = result.tags.find(t => t.name === 'AI');
      expect(aiTag.description).toBe('Artificial Intelligence');
    });

    it('should handle BibMap with no tags', () => {
      bibmap.nodes = [{ ...bibmap.nodes[2], taxonomies: [] }];
      const result = buildBibmapJson(bibmap);

      expect(result.tags).toHaveLength(0);
    });
  });

  describe('getLinkedReferences - Reference filtering', () => {
    it('should return references that share tags with nodes', () => {
      const linked = getLinkedReferences(bibmap, references);

      expect(linked).toHaveLength(2);
      expect(linked.map(r => r.bibtex_key).sort()).toEqual(['johnson2022deep', 'smith2023ml']);
    });

    it('should not return unrelated references', () => {
      const linked = getLinkedReferences(bibmap, references);

      const unrelatedRef = linked.find(r => r.bibtex_key === 'unrelated2021');
      expect(unrelatedRef).toBeUndefined();
    });

    it('should return empty array when no tags match', () => {
      bibmap.nodes = [{ ...bibmap.nodes[2], taxonomies: [] }];
      const linked = getLinkedReferences(bibmap, references);

      expect(linked).toHaveLength(0);
    });

    it('should return empty array when references is empty', () => {
      const linked = getLinkedReferences(bibmap, []);
      expect(linked).toHaveLength(0);
    });

    it('should handle references with undefined taxonomies', () => {
      references[0].taxonomies = undefined;
      const linked = getLinkedReferences(bibmap, references);

      expect(linked.find(r => r.bibtex_key === 'smith2023ml')).toBeUndefined();
    });
  });

  describe('buildBibtexContent - BibTeX generation', () => {
    it('should combine all reference BibTeX entries', () => {
      const linkedRefs = getLinkedReferences(bibmap, references);
      const content = buildBibtexContent(linkedRefs);

      expect(content).toContain('@article{smith2023ml');
      expect(content).toContain('@inproceedings{johnson2022deep');
    });

    it('should separate entries with double newlines', () => {
      const linkedRefs = getLinkedReferences(bibmap, references);
      const content = buildBibtexContent(linkedRefs);

      expect(content).toContain('}\n\n@');
    });

    it('should return placeholder for empty references', () => {
      const content = buildBibtexContent([]);
      expect(content).toBe('% No references linked to this BibMap');
    });

    it('should return placeholder for null/undefined references', () => {
      expect(buildBibtexContent(null)).toBe('% No references linked to this BibMap');
      expect(buildBibtexContent(undefined)).toBe('% No references linked to this BibMap');
    });

    it('should preserve complete BibTeX content', () => {
      const singleRef = [references[0]];
      const content = buildBibtexContent(singleRef);

      expect(content).toBe(references[0].raw_bibtex);
    });
  });

  describe('buildTagMappings - Tag to reference mappings', () => {
    it('should map tags to their reference keys', () => {
      const linkedRefs = getLinkedReferences(bibmap, references);
      const mappings = buildTagMappings(bibmap, linkedRefs);

      expect(mappings.tags).toHaveLength(2);

      const aiTag = mappings.tags.find(t => t.name === 'AI');
      expect(aiTag.reference_keys.sort()).toEqual(['johnson2022deep', 'smith2023ml']);

      const researchTag = mappings.tags.find(t => t.name === 'Research');
      expect(researchTag.reference_keys).toEqual(['johnson2022deep']);
    });

    it('should include tag metadata', () => {
      const linkedRefs = getLinkedReferences(bibmap, references);
      const mappings = buildTagMappings(bibmap, linkedRefs);

      const aiTag = mappings.tags.find(t => t.name === 'AI');
      expect(aiTag.color).toBe('#FF5733');
      expect(aiTag.description).toBe('Artificial Intelligence');
    });

    it('should include version and timestamp', () => {
      const linkedRefs = getLinkedReferences(bibmap, references);
      const mappings = buildTagMappings(bibmap, linkedRefs);

      expect(mappings.version).toBe('1.0');
      expect(mappings.exported_at).toBeDefined();
    });

    it('should handle empty linked references', () => {
      const mappings = buildTagMappings(bibmap, []);

      // Tags should still be present but with empty reference_keys
      const aiTag = mappings.tags.find(t => t.name === 'AI');
      expect(aiTag.reference_keys).toEqual([]);
    });
  });

  describe('generateFilename - Safe filename generation', () => {
    it('should create lowercase filename with .bibmap extension', () => {
      const filename = generateFilename('My BibMap');
      expect(filename).toBe('my_bibmap.bibmap');
    });

    it('should replace special characters with underscores', () => {
      const filename = generateFilename('Test: A/B & More!');
      expect(filename).toBe('test__a_b___more_.bibmap');
    });

    it('should handle unicode characters', () => {
      const filename = generateFilename('Café résumé');
      expect(filename).toBe('caf__r_sum_.bibmap');
    });

    it('should preserve numbers', () => {
      const filename = generateFilename('Project 2024');
      expect(filename).toBe('project_2024.bibmap');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty nodes array', () => {
      bibmap.nodes = [];
      const result = buildBibmapJson(bibmap);

      expect(result.nodes).toEqual([]);
      expect(result.tags).toEqual([]);
    });

    it('should handle empty connections array', () => {
      bibmap.connections = [];
      const result = buildBibmapJson(bibmap);

      expect(result.connections).toEqual([]);
    });

    it('should handle node with all optional fields as null', () => {
      bibmap.nodes = [{
        id: 999,
        label: 'Minimal Node',
        description: null,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        background_color: null,
        text_color: null,
        border_color: null,
        font_size: null,
        font_family: null,
        font_bold: null,
        font_italic: null,
        font_underline: null,
        shape: null,
        link_to_references: null,
        taxonomies: null
      }];

      const result = buildBibmapJson(bibmap);
      const node = result.nodes[0];

      expect(node.id).toBe(999);
      expect(node.label).toBe('Minimal Node');
      expect(node.tag_names).toEqual([]);
    });

    it('should handle special characters in labels and descriptions', () => {
      bibmap.nodes[0].label = 'Test <script>alert("XSS")</script>';
      bibmap.nodes[0].description = 'Contains "quotes" and \'apostrophes\'';

      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.label).toBe('Test <script>alert("XSS")</script>');
      expect(node.description).toBe('Contains "quotes" and \'apostrophes\'');
    });

    it('should handle very long labels and descriptions', () => {
      const longText = 'A'.repeat(10000);
      bibmap.nodes[0].label = longText;
      bibmap.nodes[0].description = longText;

      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.label).toBe(longText);
      expect(node.description).toBe(longText);
    });

    it('should handle extreme coordinate values', () => {
      bibmap.nodes[0].x = -999999.999;
      bibmap.nodes[0].y = 999999.999;

      const result = buildBibmapJson(bibmap);
      const node = result.nodes.find(n => n.id === 101);

      expect(node.x).toBe(-999999.999);
      expect(node.y).toBe(999999.999);
    });
  });

  describe('Property constants validation', () => {
    it('NODE_PROPERTIES should contain all expected properties', () => {
      expect(NODE_PROPERTIES).toContain('id');
      expect(NODE_PROPERTIES).toContain('label');
      expect(NODE_PROPERTIES).toContain('description');
      expect(NODE_PROPERTIES).toContain('x');
      expect(NODE_PROPERTIES).toContain('y');
      expect(NODE_PROPERTIES).toContain('width');
      expect(NODE_PROPERTIES).toContain('height');
      expect(NODE_PROPERTIES).toContain('background_color');
      expect(NODE_PROPERTIES).toContain('text_color');
      expect(NODE_PROPERTIES).toContain('border_color');
      expect(NODE_PROPERTIES).toContain('font_size');
      expect(NODE_PROPERTIES).toContain('font_family');
      expect(NODE_PROPERTIES).toContain('font_bold');
      expect(NODE_PROPERTIES).toContain('font_italic');
      expect(NODE_PROPERTIES).toContain('font_underline');
      expect(NODE_PROPERTIES).toContain('shape');
      expect(NODE_PROPERTIES).toContain('link_to_references');
      expect(NODE_PROPERTIES).toContain('tag_names');
    });

    it('CONNECTION_PROPERTIES should contain all expected properties', () => {
      expect(CONNECTION_PROPERTIES).toContain('id');
      expect(CONNECTION_PROPERTIES).toContain('source_node_id');
      expect(CONNECTION_PROPERTIES).toContain('target_node_id');
      expect(CONNECTION_PROPERTIES).toContain('label');
      expect(CONNECTION_PROPERTIES).toContain('show_label');
      expect(CONNECTION_PROPERTIES).toContain('line_color');
      expect(CONNECTION_PROPERTIES).toContain('line_width');
      expect(CONNECTION_PROPERTIES).toContain('line_style');
      expect(CONNECTION_PROPERTIES).toContain('arrow_type');
    });

    it('BIBMAP_PROPERTIES should contain all expected properties', () => {
      expect(BIBMAP_PROPERTIES).toContain('title');
      expect(BIBMAP_PROPERTIES).toContain('description');
      expect(BIBMAP_PROPERTIES).toContain('is_published');
      expect(BIBMAP_PROPERTIES).toContain('created_at');
      expect(BIBMAP_PROPERTIES).toContain('updated_at');
    });

    it('TAG_PROPERTIES should contain all expected properties', () => {
      expect(TAG_PROPERTIES).toContain('name');
      expect(TAG_PROPERTIES).toContain('color');
      expect(TAG_PROPERTIES).toContain('description');
    });
  });
});

describe('BibMap Export - Regression Prevention', () => {
  /**
   * These tests specifically prevent data loss scenarios
   */

  it('should not silently drop nodes when some have errors', () => {
    const bibmap = createTestBibmap();
    // Simulate a problematic node mixed with valid ones
    bibmap.nodes.push({
      id: 999,
      label: 'Problem Node',
      taxonomies: [{ id: 'invalid' }] // Invalid ID type
    });

    const result = buildBibmapJson(bibmap);
    // Should still export all 4 nodes
    expect(result.nodes).toHaveLength(4);
  });

  it('should preserve zero values (not treat as falsy)', () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].x = 0;
    bibmap.nodes[0].y = 0;
    bibmap.nodes[0].font_size = 0;

    const result = buildBibmapJson(bibmap);
    const node = result.nodes.find(n => n.id === 101);

    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
    expect(node.font_size).toBe(0);
  });

  it('should preserve false boolean values', () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].font_bold = false;
    bibmap.nodes[0].font_italic = false;
    bibmap.nodes[0].font_underline = false;
    bibmap.nodes[0].link_to_references = false;
    bibmap.connections[0].show_label = false;

    const result = buildBibmapJson(bibmap);
    const node = result.nodes.find(n => n.id === 101);
    const conn = result.connections.find(c => c.id === 201);

    expect(node.font_bold).toBe(false);
    expect(node.font_italic).toBe(false);
    expect(node.font_underline).toBe(false);
    expect(node.link_to_references).toBe(false);
    expect(conn.show_label).toBe(false);
  });

  it('should preserve empty string values', () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].description = '';
    bibmap.connections[0].label = '';

    const result = buildBibmapJson(bibmap);
    const node = result.nodes.find(n => n.id === 101);
    const conn = result.connections.find(c => c.id === 201);

    expect(node.description).toBe('');
    expect(conn.label).toBe('');
  });

  it('should handle duplicate tag assignments correctly', () => {
    const bibmap = createTestBibmap();
    // Both nodes have the same 'AI' tag
    const result = buildBibmapJson(bibmap);

    // Should only appear once in tags array
    const aiTags = result.tags.filter(t => t.name === 'AI');
    expect(aiTags).toHaveLength(1);
  });

  it('should maintain node order', () => {
    const bibmap = createTestBibmap();
    const result = buildBibmapJson(bibmap);

    expect(result.nodes[0].id).toBe(101);
    expect(result.nodes[1].id).toBe(102);
    expect(result.nodes[2].id).toBe(103);
  });

  it('should maintain connection order', () => {
    const bibmap = createTestBibmap();
    const result = buildBibmapJson(bibmap);

    expect(result.connections[0].id).toBe(201);
    expect(result.connections[1].id).toBe(202);
  });
});
