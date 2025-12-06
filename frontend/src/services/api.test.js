import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { api } from './api.js';

describe('API Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('health', () => {
    it('should call health endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' })
      });

      const result = await api.health();

      expect(mockFetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
      expect(result.status).toBe('healthy');
    });
  });

  describe('bibmaps', () => {
    it('should list bibmaps', async () => {
      const mockBibmaps = [
        { id: 1, title: 'Map 1' },
        { id: 2, title: 'Map 2' }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockBibmaps
      });

      const result = await api.bibmaps.list();

      expect(mockFetch).toHaveBeenCalledWith('/api/bibmaps/', expect.any(Object));
      expect(result).toEqual(mockBibmaps);
    });

    it('should create bibmap', async () => {
      const newBibmap = { id: 1, title: 'New Map' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => newBibmap
      });

      const result = await api.bibmaps.create({ title: 'New Map' });

      expect(mockFetch).toHaveBeenCalledWith('/api/bibmaps/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Map' }),
        credentials: 'include'
      });
      expect(result).toEqual(newBibmap);
    });

    it('should handle delete with 204 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const result = await api.bibmaps.delete(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/bibmaps/1', expect.objectContaining({
        method: 'DELETE'
      }));
      expect(result).toBeNull();
    });
  });

  describe('references', () => {
    it('should import bibtex', async () => {
      const importResult = { imported: 2, errors: [], references: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => importResult
      });

      const result = await api.references.import('@article{...}', [1, 2]);

      expect(mockFetch).toHaveBeenCalledWith('/api/references/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bibtex_content: '@article{...}',
          taxonomy_ids: [1, 2],
          legend_category: null
        }),
        credentials: 'include'
      });
      expect(result.imported).toBe(2);
    });

    it('should import bibtex with legend category', async () => {
      const importResult = { imported: 2, errors: [], references: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => importResult
      });

      const result = await api.references.import('@article{...}', [1, 2], '#FF0000');

      expect(mockFetch).toHaveBeenCalledWith('/api/references/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bibtex_content: '@article{...}',
          taxonomy_ids: [1, 2],
          legend_category: '#FF0000'
        }),
        credentials: 'include'
      });
      expect(result.imported).toBe(2);
    });

    it('should filter by taxonomy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      await api.references.list(5);

      expect(mockFetch).toHaveBeenCalledWith('/api/references/?taxonomy_id=5', expect.any(Object));
    });
  });

  describe('nodes', () => {
    it('should update node position', async () => {
      const updatedNode = { id: 1, x: 100, y: 200 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedNode
      });

      const result = await api.nodes.updatePosition(1, 100, 200);

      expect(mockFetch).toHaveBeenCalledWith('/api/nodes/1/position?x=100&y=200', expect.objectContaining({
        method: 'PUT'
      }));
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it('should update node size', async () => {
      const updatedNode = { id: 1, width: 200, height: 100 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedNode
      });

      const result = await api.nodes.updateSize(1, 200, 100);

      expect(mockFetch).toHaveBeenCalledWith('/api/nodes/1/size?width=200&height=100', expect.objectContaining({
        method: 'PUT'
      }));
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });
  });

  describe('error handling', () => {
    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Not found' })
      });

      await expect(api.bibmaps.get(999)).rejects.toThrow('Not found');
    });
  });

  describe('public node endpoints', () => {
    it('should get public references for a node', async () => {
      const mockRefs = [
        { id: 1, title: 'Reference 1' },
        { id: 2, title: 'Reference 2' }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefs
      });

      const result = await api.nodes.getPublicReferences(5);

      expect(mockFetch).toHaveBeenCalledWith('/api/nodes/public/5/references', expect.any(Object));
      expect(result).toEqual(mockRefs);
    });

    it('should get public media for a node', async () => {
      const mockMedia = [
        { id: 1, title: 'Media 1' },
        { id: 2, title: 'Media 2' }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMedia
      });

      const result = await api.nodes.getPublicMedia(5);

      expect(mockFetch).toHaveBeenCalledWith('/api/nodes/public/5/media', expect.any(Object));
      expect(result).toEqual(mockMedia);
    });

    it('should throw 403 when bibmap is not published', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'This bib map is not published' })
      });

      await expect(api.nodes.getPublicReferences(1)).rejects.toThrow('This bib map is not published');
    });

    it('should throw 404 when node not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Node not found' })
      });

      await expect(api.nodes.getPublicReferences(999)).rejects.toThrow('Node not found');
    });

    it('should get references with match_reasons for taxonomy', async () => {
      const mockRefs = [
        {
          id: 1,
          title: 'Reference 1',
          match_reasons: [
            { type: 'taxonomy', taxonomy_id: 1, taxonomy_name: 'AI', taxonomy_color: '#FF0000' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefs
      });

      const result = await api.nodes.getReferences(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('taxonomy');
      expect(result[0].match_reasons[0].taxonomy_name).toBe('AI');
    });

    it('should get references with match_reasons for legend_category', async () => {
      const mockRefs = [
        {
          id: 1,
          title: 'Reference 1',
          match_reasons: [
            { type: 'legend_category', legend_category: '#AABBCC' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefs
      });

      const result = await api.nodes.getReferences(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('legend_category');
      expect(result[0].match_reasons[0].legend_category).toBe('#AABBCC');
    });

    it('should get references with multiple match_reasons', async () => {
      const mockRefs = [
        {
          id: 1,
          title: 'Reference 1',
          match_reasons: [
            { type: 'taxonomy', taxonomy_id: 1, taxonomy_name: 'AI', taxonomy_color: '#FF0000' },
            { type: 'legend_category', legend_category: '#AABBCC' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefs
      });

      const result = await api.nodes.getReferences(1);

      expect(result[0].match_reasons).toHaveLength(2);
      expect(result[0].match_reasons[0].type).toBe('taxonomy');
      expect(result[0].match_reasons[1].type).toBe('legend_category');
    });

    it('should get media with match_reasons for taxonomy', async () => {
      const mockMedia = [
        {
          id: 1,
          title: 'Media 1',
          match_reasons: [
            { type: 'taxonomy', taxonomy_id: 2, taxonomy_name: 'ML', taxonomy_color: '#00FF00' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMedia
      });

      const result = await api.nodes.getMedia(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('taxonomy');
    });

    it('should get media with match_reasons for legend_category', async () => {
      const mockMedia = [
        {
          id: 1,
          title: 'Media 1',
          match_reasons: [
            { type: 'legend_category', legend_category: '#112233' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMedia
      });

      const result = await api.nodes.getMedia(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('legend_category');
    });

    it('should get public references with match_reasons', async () => {
      const mockRefs = [
        {
          id: 1,
          title: 'Reference 1',
          match_reasons: [
            { type: 'taxonomy', taxonomy_id: 1, taxonomy_name: 'AI', taxonomy_color: '#FF0000' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefs
      });

      const result = await api.nodes.getPublicReferences(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('taxonomy');
    });

    it('should get public media with match_reasons', async () => {
      const mockMedia = [
        {
          id: 1,
          title: 'Media 1',
          match_reasons: [
            { type: 'legend_category', legend_category: '#445566' }
          ]
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMedia
      });

      const result = await api.nodes.getPublicMedia(1);

      expect(result[0].match_reasons).toBeDefined();
      expect(result[0].match_reasons[0].type).toBe('legend_category');
    });
  });
});
