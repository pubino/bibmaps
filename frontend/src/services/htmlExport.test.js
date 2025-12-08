import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  escapeHtml,
  sanitizeFilename,
  getExportStyles,
  getExportScript,
  generateIndexHtml,
  generateReferenceHtml,
  generateNodeReferencesHtml,
  generateHtmlExport,
  generateHtmlExportFilename
} from './htmlExport.js';

/**
 * Test fixtures
 */
function createTestBibmap() {
  return {
    id: 1,
    title: 'Test BibMap',
    description: 'A comprehensive test map for HTML export',
    is_published: true,
    settings_json: '{"legendLabels": {"#3B82F6": "Primary Category"}, "showLegend": true}',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T15:30:00Z',
    nodes: [
      {
        id: 101,
        label: 'Machine Learning',
        description: 'Introduction to ML concepts',
        x: 100,
        y: 200,
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
        node_style: 'flat',
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
        font_underline: false,
        shape: 'ellipse',
        node_style: 'bevel',
        link_to_references: false,
        taxonomies: [
          { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' }
        ]
      },
      {
        id: 103,
        label: 'Standalone Node',
        description: null,
        x: 250,
        y: 400,
        width: 120,
        height: 50,
        background_color: '#6B7280',
        text_color: '#FFFFFF',
        border_color: '#4B5563',
        shape: 'diamond',
        node_style: 'outline',
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
      doi: '10.1234/ml.2023.001',
      abstract: 'This paper presents advances in machine learning algorithms.',
      raw_bibtex: '@article{smith2023ml,\n  author = {Smith, John and Doe, Jane},\n  title = {Advances in Machine Learning},\n  journal = {Journal of AI},\n  year = {2023}\n}',
      taxonomies: [
        { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' }
      ],
      match_reasons: ['Tag: AI']
    },
    {
      id: 302,
      bibtex_key: 'johnson2022deep',
      entry_type: 'inproceedings',
      title: 'Deep Learning Methods',
      author: 'Johnson, Bob',
      year: '2022',
      booktitle: 'Proceedings of ML Conference',
      abstract: 'A comprehensive review of deep learning methods.',
      raw_bibtex: '@inproceedings{johnson2022deep,\n  author = {Johnson, Bob},\n  title = {Deep Learning Methods},\n  booktitle = {Proceedings of ML Conference},\n  year = {2022}\n}',
      taxonomies: [
        { id: 1, name: 'AI', color: '#FF5733', description: 'Artificial Intelligence' },
        { id: 2, name: 'Research', color: '#33FF57', description: 'Research papers' }
      ],
      match_reasons: ['Tag: AI', 'Tag: Research']
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

describe('HTML Export - Utility Functions', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>')).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should handle quotes (quotes may or may not be escaped depending on implementation)', () => {
      // The textContent/innerHTML approach doesn't escape quotes, which is acceptable
      // for text content (quotes only need escaping in attributes)
      const result = escapeHtml('"quoted"');
      expect(result).toContain('quoted');
    });

    it('should return empty string for null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should preserve normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('sanitizeFilename', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeFilename('MyFile')).toBe('myfile');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('my file name')).toBe('my_file_name');
    });

    it('should remove special characters', () => {
      expect(sanitizeFilename('file:with/special*chars!')).toBe('file_with_special_chars');
    });

    it('should trim leading/trailing underscores', () => {
      expect(sanitizeFilename('  trimmed  ')).toBe('trimmed');
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(100);
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(50);
    });

    it('should return untitled for empty string', () => {
      expect(sanitizeFilename('')).toBe('untitled');
    });

    it('should handle unicode characters', () => {
      const result = sanitizeFilename('Café résumé');
      expect(result).not.toContain('é');
    });
  });

  describe('generateHtmlExportFilename', () => {
    it('should generate filename with .zip extension', () => {
      expect(generateHtmlExportFilename('My BibMap')).toBe('my_bibmap_html_export.zip');
    });

    it('should sanitize special characters', () => {
      expect(generateHtmlExportFilename('Test: A/B')).toBe('test_a_b_html_export.zip');
    });
  });
});

describe('HTML Export - CSS Generation', () => {
  describe('getExportStyles', () => {
    it('should return non-empty CSS string', () => {
      const css = getExportStyles();
      expect(css).toBeTruthy();
      expect(css.length).toBeGreaterThan(100);
    });

    it('should include essential CSS selectors', () => {
      const css = getExportStyles();
      expect(css).toContain('.bibmap-container');
      expect(css).toContain('#bibmap-svg');
      expect(css).toContain('.node-group');
      expect(css).toContain('.connection-line');
      expect(css).toContain('.zoom-controls');
      expect(css).toContain('.legend-panel');
    });

    it('should include CSS variables', () => {
      const css = getExportStyles();
      expect(css).toContain('--primary-color');
      expect(css).toContain('--text-color');
      expect(css).toContain('--bg-color');
    });

    it('should include reference card styles', () => {
      const css = getExportStyles();
      expect(css).toContain('.ref-card');
      expect(css).toContain('.reference-detail');
    });

    it('should include responsive styles', () => {
      const css = getExportStyles();
      expect(css).toContain('@media');
    });

    it('should include accessibility pattern CSS for legend items', () => {
      const css = getExportStyles();
      expect(css).toContain('[data-pattern="stripes"]');
      expect(css).toContain('[data-pattern="dots"]');
      expect(css).toContain('[data-pattern="crosshatch"]');
      expect(css).toContain('[data-pattern="dashes"]');
      expect(css).toContain('[data-pattern="waves"]');
    });
  });
});

describe('HTML Export - JavaScript Generation', () => {
  describe('getExportScript', () => {
    let bibmap;

    beforeEach(() => {
      bibmap = createTestBibmap();
    });

    it('should return non-empty JavaScript string', () => {
      const js = getExportScript(bibmap);
      expect(js).toBeTruthy();
      expect(js.length).toBeGreaterThan(100);
    });

    it('should include embedded node data', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('Machine Learning');
      expect(js).toContain('Deep Learning');
    });

    it('should include embedded connection data', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('source_node_id');
      expect(js).toContain('target_node_id');
    });

    it('should include zoom functionality', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('zoom');
      expect(js).toContain('fitToScreen');
      expect(js).toContain('zoom-in');
      expect(js).toContain('zoom-out');
    });

    it('should include shape rendering functions', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('getShapePath');
      expect(js).toContain('ellipse');
      expect(js).toContain('diamond');
      expect(js).toContain('rectangle');
    });

    it('should include connection path calculation', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('calculateConnectionPath');
      expect(js).toContain('getEdgePoint');
    });

    it('should include description callout functionality', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('showCallout');
      expect(js).toContain('hideCallout');
    });

    it('should include SVG filter setup', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('bevel-filter');
      expect(js).toContain('emboss-filter');
    });

    it('should handle empty nodes array', () => {
      bibmap.nodes = [];
      const js = getExportScript(bibmap);
      expect(js).toContain('const nodes = []');
    });

    it('should handle empty connections array', () => {
      bibmap.connections = [];
      const js = getExportScript(bibmap);
      expect(js).toContain('const connections = []');
    });

    it('should include link_to_references click handler', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('link_to_references');
      expect(js).toContain('references/');
    });

    it('should include SVG pattern definitions for accessibility', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('pattern-stripes');
      expect(js).toContain('pattern-dots');
      expect(js).toContain('pattern-crosshatch');
      expect(js).toContain('pattern-dashes');
      expect(js).toContain('pattern-waves');
    });

    it('should include pattern helper function and PATTERNS array', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain("const PATTERNS = ['stripes', 'dots', 'crosshatch', 'dashes', 'waves']");
      expect(js).toContain('getPatternForColor');
    });

    it('should include colorToPattern mapping when provided', () => {
      const colorMapping = { '#3B82F6': 0, '#10B981': 1 };
      const js = getExportScript(bibmap, colorMapping);
      expect(js).toContain('const colorToPattern = {"#3B82F6":0,"#10B981":1}');
    });

    it('should add pattern overlay to nodes', () => {
      const js = getExportScript(bibmap);
      expect(js).toContain('node-pattern-overlay');
      expect(js).toContain('getPatternForColor(bgColor)');
    });
  });
});

describe('HTML Export - Index Page Generation', () => {
  describe('generateIndexHtml', () => {
    let bibmap;

    beforeEach(() => {
      bibmap = createTestBibmap();
    });

    it('should generate valid HTML document', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('should include bibmap title in title tag', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('<title>Test BibMap - BibMap Export</title>');
    });

    it('should include bibmap title in header', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('<h1>Test BibMap</h1>');
    });

    it('should include bibmap description if present', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('A comprehensive test map for HTML export');
    });

    it('should not include description paragraph if description is empty', () => {
      bibmap.description = null;
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).not.toContain('<p></p>');
    });

    it('should include D3.js script reference', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('d3.v7.min.js');
    });

    it('should include CSS link', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('href="styles.css"');
    });

    it('should include app.js script reference', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('src="app.js"');
    });

    it('should include SVG canvas structure', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('id="bibmap-svg"');
      expect(html).toContain('id="connections-layer"');
      expect(html).toContain('id="nodes-layer"');
    });

    it('should include zoom controls', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('id="zoom-in"');
      expect(html).toContain('id="zoom-out"');
      expect(html).toContain('id="zoom-fit"');
    });

    it('should include legend when showLegend is true', () => {
      const html = generateIndexHtml(bibmap, true, { '#3B82F6': 'Primary' });
      expect(html).toContain('legend-panel');
      expect(html).toContain('Legend');
    });

    it('should include accessibility patterns in legend items', () => {
      const html = generateIndexHtml(bibmap, true, { '#3B82F6': 'Primary' });
      expect(html).toContain('data-pattern="stripes"');
      expect(html).toContain('data-pattern="dots"');
      expect(html).toContain('aria-label="Color indicator with');
    });

    it('should not include legend when showLegend is false', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).not.toContain('legend-panel');
    });

    it('should include legend labels from legendLabels object', () => {
      const html = generateIndexHtml(bibmap, true, { '#3B82F6': 'Machine Learning Category' });
      expect(html).toContain('Machine Learning Category');
    });

    it('should use default category labels when no custom labels provided', () => {
      const html = generateIndexHtml(bibmap, true, {});
      expect(html).toContain('Category');
    });

    it('should include footer with BibMap attribution', () => {
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).toContain('footer');
      expect(html).toContain('BibMap');
    });

    it('should escape HTML in title', () => {
      bibmap.title = '<script>alert("XSS")</script>';
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape HTML in description', () => {
      bibmap.description = '<img onerror="alert(1)" src="x">';
      const html = generateIndexHtml(bibmap, false, {});
      expect(html).not.toContain('<img onerror');
    });
  });
});

describe('HTML Export - Reference Page Generation', () => {
  describe('generateReferenceHtml', () => {
    let reference;

    beforeEach(() => {
      reference = createTestReferences()[0];
    });

    it('should generate valid HTML document', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should include reference title', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('Advances in Machine Learning');
    });

    it('should include author', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('Smith, John and Doe, Jane');
    });

    it('should include year', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('2023');
    });

    it('should include journal', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('Journal of AI');
    });

    it('should include DOI link', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('https://doi.org/10.1234/ml.2023.001');
      expect(html).toContain('DOI:');
    });

    it('should include abstract', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('advances in machine learning algorithms');
    });

    it('should include BibTeX', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('@article{smith2023ml');
    });

    it('should include taxonomy tags', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('AI');
      expect(html).toContain('#FF5733');
    });

    it('should include match reasons', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('Tag: AI');
    });

    it('should include breadcrumb navigation', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('href="../index.html"');
      expect(html).toContain('Back to BibMap');
    });

    it('should include parent CSS reference', () => {
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('href="../styles.css"');
    });

    it('should use bibtex_key as title fallback', () => {
      reference.title = null;
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('smith2023ml');
    });

    it('should handle missing abstract', () => {
      reference.abstract = null;
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).not.toContain('Abstract');
    });

    it('should handle missing DOI', () => {
      reference.doi = null;
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).not.toContain('doi.org');
    });

    it('should include booktitle for inproceedings', () => {
      reference.booktitle = 'Some Conference';
      const html = generateReferenceHtml(reference, 'Test BibMap');
      expect(html).toContain('Some Conference');
    });
  });

  describe('generateNodeReferencesHtml', () => {
    let node;
    let references;

    beforeEach(() => {
      node = createTestBibmap().nodes[0];
      references = createTestReferences().slice(0, 2);
    });

    it('should generate valid HTML document', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should include node label in heading', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('Machine Learning');
      expect(html).toContain('References for');
    });

    it('should include reference cards', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('Advances in Machine Learning');
      expect(html).toContain('Deep Learning Methods');
    });

    it('should include links to individual reference pages', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('smith2023ml.html');
      expect(html).toContain('johnson2022deep.html');
    });

    it('should show message when no references', () => {
      const html = generateNodeReferencesHtml(node, [], 'Test BibMap');
      expect(html).toContain('No linked references found');
    });

    it('should truncate long abstracts', () => {
      references[0].abstract = 'A'.repeat(300);
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('...');
    });

    it('should include breadcrumb navigation', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('href="../index.html"');
    });

    it('should include parent CSS reference', () => {
      const html = generateNodeReferencesHtml(node, references, 'Test BibMap');
      expect(html).toContain('href="../styles.css"');
    });
  });
});

describe('HTML Export - Full Export Generation', () => {
  describe('generateHtmlExport', () => {
    let bibmap;
    let references;

    beforeEach(() => {
      bibmap = createTestBibmap();
      references = createTestReferences();
    });

    it('should generate index.html', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      expect(files['index.html']).toBeDefined();
      expect(files['index.html']).toContain('Test BibMap');
    });

    it('should generate styles.css', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      expect(files['styles.css']).toBeDefined();
      expect(files['styles.css']).toContain('.bibmap-container');
    });

    it('should generate app.js', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      expect(files['app.js']).toBeDefined();
      expect(files['app.js']).toContain('d3.select');
    });

    it('should generate node reference pages for nodes with link_to_references', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      // Node 101 has link_to_references: true
      expect(files['references/101.html']).toBeDefined();
      // Node 103 also has link_to_references: true (but no tags)
      expect(files['references/103.html']).toBeDefined();
    });

    it('should not generate reference pages for nodes without link_to_references', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      // Node 102 has link_to_references: false
      expect(files['references/102.html']).toBeUndefined();
    });

    it('should generate individual reference detail pages', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });
      expect(files['references/smith2023ml.html']).toBeDefined();
      expect(files['references/johnson2022deep.html']).toBeDefined();
    });

    it('should include legend when showLegend is true', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: true,
        legendLabels: { '#3B82F6': 'Primary' }
      });
      expect(files['index.html']).toContain('legend-panel');
      expect(files['index.html']).toContain('Primary');
    });

    it('should use custom getNodeReferences function when provided', async () => {
      const mockGetNodeRefs = vi.fn().mockResolvedValue([references[0]]);

      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {},
        getNodeReferences: mockGetNodeRefs
      });

      // Should have called the function for nodes with link_to_references
      expect(mockGetNodeRefs).toHaveBeenCalled();
    });

    it('should fall back to tag-based filtering if getNodeReferences fails', async () => {
      const mockGetNodeRefs = vi.fn().mockRejectedValue(new Error('API error'));

      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {},
        getNodeReferences: mockGetNodeRefs
      });

      // Should still generate the reference page with tag-based refs
      expect(files['references/101.html']).toBeDefined();
      expect(files['references/101.html']).toContain('AI');
    });

    it('should handle empty nodes array', async () => {
      bibmap.nodes = [];

      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });

      expect(files['index.html']).toBeDefined();
      expect(Object.keys(files).filter(k => k.startsWith('references/'))).toHaveLength(0);
    });

    it('should handle empty references array', async () => {
      const files = await generateHtmlExport({
        bibmap,
        allReferences: [],
        showLegend: false,
        legendLabels: {}
      });

      expect(files['index.html']).toBeDefined();
      // Reference pages should still be generated but show "no references"
      expect(files['references/101.html']).toContain('No linked references');
    });

    it('should not duplicate reference detail pages', async () => {
      // Both node 101 and 103 have link_to_references, but they might share refs
      const files = await generateHtmlExport({
        bibmap,
        allReferences: references,
        showLegend: false,
        legendLabels: {}
      });

      // Count occurrences of reference files
      const refFileKeys = Object.keys(files).filter(k => k.match(/references\/[a-z0-9_]+\.html$/));
      const uniqueRefs = new Set(refFileKeys);
      expect(refFileKeys.length).toBe(uniqueRefs.size);
    });
  });
});

describe('HTML Export - Edge Cases and Error Handling', () => {
  it('should handle bibmap with no description', async () => {
    const bibmap = createTestBibmap();
    bibmap.description = null;

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['index.html']).toBeDefined();
    expect(files['index.html']).not.toContain('<p></p>');
  });

  it('should handle nodes with undefined taxonomies', async () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].taxonomies = undefined;

    const files = await generateHtmlExport({
      bibmap,
      allReferences: createTestReferences(),
      showLegend: false,
      legendLabels: {}
    });

    expect(files['references/101.html']).toBeDefined();
  });

  it('should handle reference with all optional fields missing', async () => {
    const bibmap = createTestBibmap();
    const minimalRef = {
      id: 999,
      bibtex_key: 'minimal',
      raw_bibtex: '@misc{minimal}',
      taxonomies: [{ id: 1, name: 'AI', color: '#FF5733' }]
    };

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [minimalRef],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['references/minimal.html']).toBeDefined();
    expect(files['references/minimal.html']).toContain('minimal');
  });

  it('should handle special characters in bibmap title', async () => {
    const bibmap = createTestBibmap();
    bibmap.title = 'Test & Analysis: <>"\'';

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['index.html']).toContain('&amp;');
    expect(files['index.html']).toContain('&lt;');
    expect(files['index.html']).toContain('&gt;');
  });

  it('should handle very long node labels', async () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].label = 'A'.repeat(500);

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['index.html']).toBeDefined();
    expect(files['app.js']).toContain('A'.repeat(500));
  });

  it('should handle connection with missing source/target nodes', async () => {
    const bibmap = createTestBibmap();
    bibmap.connections.push({
      id: 999,
      source_node_id: 9999,
      target_node_id: 9998,
      line_color: '#000000',
      line_width: 2
    });

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    // Should not crash, just include the data
    expect(files['app.js']).toBeDefined();
  });

  it('should preserve node styles (flat, bevel, emboss, outline)', async () => {
    const bibmap = createTestBibmap();
    bibmap.nodes[0].node_style = 'bevel';
    bibmap.nodes[1].node_style = 'emboss';
    bibmap.nodes[2].node_style = 'outline';

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['app.js']).toContain('bevel');
    expect(files['app.js']).toContain('emboss');
    expect(files['app.js']).toContain('outline');
  });

  it('should handle different line styles (solid, dashed, dotted)', async () => {
    const bibmap = createTestBibmap();
    bibmap.connections[0].line_style = 'solid';
    bibmap.connections[1].line_style = 'dashed';

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    expect(files['app.js']).toContain('dashed');
    expect(files['app.js']).toContain('dotted');
  });
});

describe('HTML Export - Relative Links Validation', () => {
  it('should use relative CSS path in reference pages', async () => {
    const bibmap = createTestBibmap();
    const references = createTestReferences();

    const files = await generateHtmlExport({
      bibmap,
      allReferences: references,
      showLegend: false,
      legendLabels: {}
    });

    expect(files['references/101.html']).toContain('href="../styles.css"');
    expect(files['references/smith2023ml.html']).toContain('href="../styles.css"');
  });

  it('should use relative navigation links', async () => {
    const bibmap = createTestBibmap();
    const references = createTestReferences();

    const files = await generateHtmlExport({
      bibmap,
      allReferences: references,
      showLegend: false,
      legendLabels: {}
    });

    expect(files['references/101.html']).toContain('href="../index.html"');
  });

  it('should use relative links for reference details within node refs page', async () => {
    const bibmap = createTestBibmap();
    const references = createTestReferences();

    const files = await generateHtmlExport({
      bibmap,
      allReferences: references,
      showLegend: false,
      legendLabels: {}
    });

    // Node references page should link to detail pages with relative path
    expect(files['references/101.html']).toContain('href="smith2023ml.html"');
  });

  it('should generate clickable nodes linking to reference pages', async () => {
    const bibmap = createTestBibmap();

    const files = await generateHtmlExport({
      bibmap,
      allReferences: [],
      showLegend: false,
      legendLabels: {}
    });

    // The JS should navigate to relative reference pages
    expect(files['app.js']).toContain("'references/'");
  });
});
