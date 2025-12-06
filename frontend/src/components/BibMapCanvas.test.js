import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock D3 before any imports
vi.mock('d3', () => ({
  default: {
    select: vi.fn(),
    zoom: vi.fn(),
    drag: vi.fn(),
    pointer: vi.fn(),
    zoomIdentity: {},
  },
  select: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    data: vi.fn().mockReturnThis(),
    exit: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    enter: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    merge: vi.fn().mockReturnThis(),
    attr: vi.fn().mockReturnThis(),
    classed: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    style: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    raise: vi.fn().mockReturnThis(),
    empty: vi.fn().mockReturnValue(true),
    node: vi.fn().mockReturnValue(null),
    transition: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
  })),
  zoom: vi.fn(() => ({
    scaleExtent: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    transform: vi.fn().mockReturnThis(),
  })),
  drag: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
  })),
  pointer: vi.fn(() => [0, 0]),
  zoomIdentity: {},
}));

// Mock the API module - must use inline factory
vi.mock('../services/api.js', () => ({
  api: {
    nodes: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updatePosition: vi.fn(),
      updateSize: vi.fn(),
      getReferences: vi.fn(),
    },
    connections: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bibmaps: {
      get: vi.fn(),
    },
  }
}));

// Import after mocking
import { BibMapCanvas } from './BibMapCanvas.js';
import { api } from '../services/api.js';

describe('BibMapCanvas', () => {
  let canvas;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock DOM elements
    document.body.innerHTML = `
      <div id="bibmap-container">
        <svg id="bibmap-svg">
          <defs></defs>
          <g id="connections-layer"></g>
          <g id="nodes-layer"></g>
        </svg>
        <div id="sr-node-list"></div>
      </div>
    `;

    canvas = new BibMapCanvas('bibmap-container', {
      onNodeSelect: vi.fn(),
      onConnectionSelect: vi.fn(),
      onCanvasClick: vi.fn(),
      announce: vi.fn(),
    });
  });

  describe('duplicateNode', () => {
    const originalNode = {
      id: 1,
      bibmap_id: 100,
      label: 'Original Node',
      description: 'A description',
      x: 100,
      y: 200,
      background_color: '#FF5733',
      text_color: '#000000',
      border_color: '#CC4422',
      font_size: 16,
      font_family: 'Arial, sans-serif',
      font_bold: true,
      font_italic: true,
      font_underline: true,
      width: 180,
      height: 80,
      shape: 'ellipse',
      link_to_references: false,
      wrap_text: false,
      taxonomies: [
        { id: 1, name: 'Tag1' },
        { id: 2, name: 'Tag2' },
      ],
    };

    it('should copy all styling properties when duplicating a node', async () => {
      const duplicatedNode = {
        ...originalNode,
        id: 2,
        label: 'Original Node (copy)',
        x: 130,
        y: 230,
      };

      api.nodes.create.mockResolvedValueOnce(duplicatedNode);

      canvas.bibmapId = 100;
      canvas.nodes = [originalNode];

      await canvas.duplicateNode(1);

      // Verify the API was called with all the styling properties
      expect(api.nodes.create).toHaveBeenCalledWith({
        bibmap_id: 100,
        label: 'Original Node (copy)',
        description: 'A description',
        x: 130, // original + 30
        y: 230, // original + 30
        background_color: '#FF5733',
        text_color: '#000000',
        border_color: '#CC4422',
        font_size: 16,
        font_family: 'Arial, sans-serif',
        font_bold: true,
        font_italic: true,
        font_underline: true,
        width: 180,
        height: 80,
        shape: 'ellipse',
        link_to_references: false,
        wrap_text: false,
        taxonomy_ids: [1, 2],
      });
    });

    it('should copy background_color property', async () => {
      const nodeWithColor = { ...originalNode, background_color: '#123456' };
      const duplicated = { ...nodeWithColor, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithColor];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ background_color: '#123456' })
      );
    });

    it('should copy text_color property', async () => {
      const nodeWithTextColor = { ...originalNode, text_color: '#ABCDEF' };
      const duplicated = { ...nodeWithTextColor, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithTextColor];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ text_color: '#ABCDEF' })
      );
    });

    it('should copy border_color property', async () => {
      const nodeWithBorder = { ...originalNode, border_color: '#FEDCBA' };
      const duplicated = { ...nodeWithBorder, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithBorder];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ border_color: '#FEDCBA' })
      );
    });

    it('should copy font_size property', async () => {
      const nodeWithFontSize = { ...originalNode, font_size: 24 };
      const duplicated = { ...nodeWithFontSize, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithFontSize];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ font_size: 24 })
      );
    });

    it('should copy font_family property', async () => {
      const nodeWithFont = { ...originalNode, font_family: 'Georgia, serif' };
      const duplicated = { ...nodeWithFont, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithFont];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ font_family: 'Georgia, serif' })
      );
    });

    it('should copy font_bold property', async () => {
      const nodeWithBold = { ...originalNode, font_bold: true };
      const duplicated = { ...nodeWithBold, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithBold];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ font_bold: true })
      );
    });

    it('should copy font_italic property', async () => {
      const nodeWithItalic = { ...originalNode, font_italic: true };
      const duplicated = { ...nodeWithItalic, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithItalic];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ font_italic: true })
      );
    });

    it('should copy font_underline property', async () => {
      const nodeWithUnderline = { ...originalNode, font_underline: true };
      const duplicated = { ...nodeWithUnderline, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithUnderline];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ font_underline: true })
      );
    });

    it('should copy width and height properties', async () => {
      const nodeWithDimensions = { ...originalNode, width: 300, height: 150 };
      const duplicated = { ...nodeWithDimensions, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithDimensions];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ width: 300, height: 150 })
      );
    });

    it('should copy shape property for rectangle', async () => {
      const nodeWithShape = { ...originalNode, shape: 'rectangle' };
      const duplicated = { ...nodeWithShape, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithShape];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ shape: 'rectangle' })
      );
    });

    it('should copy shape property for rounded-rectangle', async () => {
      const nodeWithShape = { ...originalNode, shape: 'rounded-rectangle' };
      const duplicated = { ...nodeWithShape, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithShape];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ shape: 'rounded-rectangle' })
      );
    });

    it('should copy shape property for ellipse', async () => {
      const nodeWithShape = { ...originalNode, shape: 'ellipse' };
      const duplicated = { ...nodeWithShape, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithShape];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ shape: 'ellipse' })
      );
    });

    it('should copy shape property for diamond', async () => {
      const nodeWithShape = { ...originalNode, shape: 'diamond' };
      const duplicated = { ...nodeWithShape, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithShape];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ shape: 'diamond' })
      );
    });

    it('should copy link_to_references property', async () => {
      const nodeWithLinkRefs = { ...originalNode, link_to_references: false };
      const duplicated = { ...nodeWithLinkRefs, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithLinkRefs];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ link_to_references: false })
      );
    });

    it('should copy wrap_text property', async () => {
      const nodeWithWrapText = { ...originalNode, wrap_text: false };
      const duplicated = { ...nodeWithWrapText, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithWrapText];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ wrap_text: false })
      );
    });

    it('should copy taxonomy_ids from taxonomies array', async () => {
      const nodeWithTaxonomies = {
        ...originalNode,
        taxonomies: [
          { id: 5, name: 'Research' },
          { id: 8, name: 'Review' },
          { id: 12, name: 'Methods' },
        ]
      };
      const duplicated = { ...nodeWithTaxonomies, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithTaxonomies];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ taxonomy_ids: [5, 8, 12] })
      );
    });

    it('should handle node with no taxonomies', async () => {
      const nodeNoTaxonomies = { ...originalNode, taxonomies: undefined };
      const duplicated = { ...nodeNoTaxonomies, id: 2, label: 'Original Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeNoTaxonomies];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ taxonomy_ids: [] })
      );
    });

    it('should offset position by 30 pixels', async () => {
      const nodeAtPosition = { ...originalNode, x: 500, y: 400 };
      const duplicated = { ...nodeAtPosition, id: 2, label: 'Original Node (copy)', x: 530, y: 430 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeAtPosition];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ x: 530, y: 430 })
      );
    });

    it('should append "(copy)" to the label', async () => {
      const nodeWithLabel = { ...originalNode, label: 'My Custom Node' };
      const duplicated = { ...nodeWithLabel, id: 2, label: 'My Custom Node (copy)', x: 130, y: 230 };

      api.nodes.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.nodes = [nodeWithLabel];

      await canvas.duplicateNode(1);

      expect(api.nodes.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'My Custom Node (copy)' })
      );
    });

    it('should return null if node is not found', async () => {
      canvas.bibmapId = 100;
      canvas.nodes = [originalNode];

      const result = await canvas.duplicateNode(999);

      expect(result).toBeNull();
      expect(api.nodes.create).not.toHaveBeenCalled();
    });
  });

  describe('duplicateConnection', () => {
    const originalConnection = {
      id: 1,
      bibmap_id: 100,
      source_node_id: 10,
      target_node_id: 20,
      line_color: '#FF0000',
      line_width: 5,
      line_style: 'dashed',
      arrow_type: 'none',
      label: 'Connection Label',
      show_label: true,
    };

    it('should copy all connection styling properties', async () => {
      const duplicatedConn = { ...originalConnection, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicatedConn);

      canvas.bibmapId = 100;
      canvas.connections = [originalConnection];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith({
        bibmap_id: 100,
        source_node_id: 10,
        target_node_id: 20,
        line_color: '#FF0000',
        line_width: 5,
        line_style: 'dashed',
        arrow_type: 'none',
        label: 'Connection Label (copy)',
        show_label: true,
      });
    });

    it('should copy line_color property', async () => {
      const connWithColor = { ...originalConnection, line_color: '#00FF00' };
      const duplicated = { ...connWithColor, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithColor];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ line_color: '#00FF00' })
      );
    });

    it('should copy line_width property', async () => {
      const connWithWidth = { ...originalConnection, line_width: 8 };
      const duplicated = { ...connWithWidth, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithWidth];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ line_width: 8 })
      );
    });

    it('should copy line_style property for solid', async () => {
      const connWithStyle = { ...originalConnection, line_style: 'solid' };
      const duplicated = { ...connWithStyle, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithStyle];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ line_style: 'solid' })
      );
    });

    it('should copy line_style property for dotted', async () => {
      const connWithStyle = { ...originalConnection, line_style: 'dotted' };
      const duplicated = { ...connWithStyle, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithStyle];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ line_style: 'dotted' })
      );
    });

    it('should copy arrow_type property for end', async () => {
      const connWithArrow = { ...originalConnection, arrow_type: 'end' };
      const duplicated = { ...connWithArrow, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithArrow];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ arrow_type: 'end' })
      );
    });

    it('should copy show_label property', async () => {
      const connWithShowLabel = { ...originalConnection, show_label: true };
      const duplicated = { ...connWithShowLabel, id: 2, label: 'Connection Label (copy)' };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connWithShowLabel];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ show_label: true })
      );
    });

    it('should handle connection with null label', async () => {
      const connNoLabel = { ...originalConnection, label: null };
      const duplicated = { ...connNoLabel, id: 2 };

      api.connections.create.mockResolvedValueOnce(duplicated);
      canvas.bibmapId = 100;
      canvas.connections = [connNoLabel];

      await canvas.duplicateConnection(1);

      expect(api.connections.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: null })
      );
    });

    it('should return null if connection is not found', async () => {
      canvas.bibmapId = 100;
      canvas.connections = [originalConnection];

      const result = await canvas.duplicateConnection(999);

      expect(result).toBeNull();
      expect(api.connections.create).not.toHaveBeenCalled();
    });
  });

  describe('getShapePath', () => {
    it('should return sharp rectangle path for rectangle shape', () => {
      const node = { width: 150, height: 60, shape: 'rectangle' };
      const path = canvas.getShapePath(node);

      // Rectangle should have sharp corners (no Q commands)
      expect(path).toContain('M 0 0');
      expect(path).toContain('L 150 0');
      expect(path).toContain('L 150 60');
      expect(path).toContain('L 0 60');
      expect(path).not.toContain('Q'); // No quadratic curves for sharp corners
    });

    it('should return rounded rectangle path for rounded-rectangle shape', () => {
      const node = { width: 150, height: 60, shape: 'rounded-rectangle' };
      const path = canvas.getShapePath(node);

      // Rounded rectangle should have Q (quadratic curve) commands for corners
      expect(path).toContain('Q');
      expect(path).toContain('Z');
    });

    it('should return ellipse path for ellipse shape', () => {
      const node = { width: 150, height: 60, shape: 'ellipse' };
      const path = canvas.getShapePath(node);

      // Ellipse should have C (cubic bezier) commands
      expect(path).toContain('C');
      expect(path).toContain('Z');
    });

    it('should return diamond path for diamond shape', () => {
      const node = { width: 150, height: 60, shape: 'diamond' };
      const path = canvas.getShapePath(node);

      // Diamond is made of 4 lines, centered
      expect(path).toContain('M 75 0'); // Top point (width/2)
      expect(path).toContain('L 150'); // Right point
      expect(path).toContain('L 75 60'); // Bottom point
      expect(path).toContain('L 0'); // Left point
      expect(path).toContain('Z');
    });

    it('should default to rectangle for unknown shape', () => {
      const node = { width: 150, height: 60, shape: 'unknown-shape' };
      const path = canvas.getShapePath(node);

      // Should fall through to default (rectangle)
      expect(path).toContain('M 0 0');
      expect(path).not.toContain('Q'); // Sharp corners
    });

    it('should use default dimensions if not provided', () => {
      const node = { shape: 'rectangle' };
      const path = canvas.getShapePath(node);

      // Should use defaults: width=150, height=60
      expect(path).toContain('L 150 0');
      expect(path).toContain('L 150 60');
    });
  });
});
