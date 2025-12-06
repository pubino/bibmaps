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
          taxonomy_ids: [1, 2]
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
});
