import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LEGEND_PATTERNS,
  getPatternForIndex,
  extractColorsFromNodes,
  generateLegendLabels,
  createLegendItemElement,
  isValidHexColor,
  parseLegendSettings,
  createReadOnlyLegendItemElement,
  buildColorToPatternMap,
  getPatternForColor
} from './legend.js';

describe('Legend Utilities', () => {
  describe('LEGEND_PATTERNS', () => {
    it('should have exactly 5 patterns', () => {
      expect(LEGEND_PATTERNS).toHaveLength(5);
    });

    it('should contain expected accessibility patterns', () => {
      expect(LEGEND_PATTERNS).toContain('stripes');
      expect(LEGEND_PATTERNS).toContain('dots');
      expect(LEGEND_PATTERNS).toContain('crosshatch');
      expect(LEGEND_PATTERNS).toContain('dashes');
      expect(LEGEND_PATTERNS).toContain('waves');
    });
  });

  describe('getPatternForIndex', () => {
    it('should return the correct pattern for index 0', () => {
      expect(getPatternForIndex(0)).toBe('stripes');
    });

    it('should return the correct pattern for index 1', () => {
      expect(getPatternForIndex(1)).toBe('dots');
    });

    it('should wrap around for indices beyond array length', () => {
      expect(getPatternForIndex(5)).toBe('stripes');
      expect(getPatternForIndex(6)).toBe('dots');
    });

    it('should handle large indices', () => {
      expect(getPatternForIndex(100)).toBe('stripes');
    });
  });

  describe('extractColorsFromNodes', () => {
    it('should return empty array for empty nodes array', () => {
      const result = extractColorsFromNodes([]);
      expect(result).toEqual([]);
    });

    it('should extract unique colors from nodes', () => {
      const nodes = [
        { background_color: '#FF0000' },
        { background_color: '#00FF00' },
        { background_color: '#FF0000' }
      ];
      const result = extractColorsFromNodes(nodes);
      expect(result).toHaveLength(2);
    });

    it('should normalize colors to uppercase', () => {
      const nodes = [
        { background_color: '#ff0000' },
        { background_color: '#FF0000' }
      ];
      const result = extractColorsFromNodes(nodes);
      expect(result).toHaveLength(1);
      expect(result[0].color).toBe('#FF0000');
    });

    it('should sort colors by frequency (most used first)', () => {
      const nodes = [
        { background_color: '#00FF00' },
        { background_color: '#FF0000' },
        { background_color: '#FF0000' },
        { background_color: '#FF0000' }
      ];
      const result = extractColorsFromNodes(nodes);
      expect(result[0].color).toBe('#FF0000');
      expect(result[0].count).toBe(3);
      expect(result[1].color).toBe('#00FF00');
      expect(result[1].count).toBe(1);
    });

    it('should use default color for nodes without background_color', () => {
      const nodes = [
        {},
        { background_color: null }
      ];
      const result = extractColorsFromNodes(nodes);
      expect(result).toHaveLength(1);
      expect(result[0].color).toBe('#3B82F6');
      expect(result[0].count).toBe(2);
    });
  });

  describe('generateLegendLabels', () => {
    it('should generate placeholder labels for new colors', () => {
      const sortedColors = [
        { color: '#FF0000', count: 3 },
        { color: '#00FF00', count: 1 }
      ];
      const result = generateLegendLabels(sortedColors);
      expect(result['#FF0000']).toBe('Category 1');
      expect(result['#00FF00']).toBe('Category 2');
    });

    it('should preserve existing labels', () => {
      const sortedColors = [
        { color: '#FF0000', count: 3 },
        { color: '#00FF00', count: 1 }
      ];
      const existingLabels = { '#FF0000': 'Important' };
      const result = generateLegendLabels(sortedColors, existingLabels);
      expect(result['#FF0000']).toBe('Important');
      expect(result['#00FF00']).toBe('Category 2');
    });

    it('should not modify original existingLabels object', () => {
      const sortedColors = [{ color: '#FF0000', count: 1 }];
      const existingLabels = {};
      const result = generateLegendLabels(sortedColors, existingLabels);
      expect(existingLabels).toEqual({});
      expect(result).toHaveProperty('#FF0000');
    });

    it('should handle empty sortedColors array', () => {
      const result = generateLegendLabels([]);
      expect(result).toEqual({});
    });
  });

  describe('createLegendItemElement', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should create a list item element', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.tagName).toBe('LI');
    });

    it('should have legend-item class', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.classList.contains('legend-item')).toBe(true);
    });

    it('should set data-color attribute', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.dataset.color).toBe('#FF0000');
    });

    it('should include color indicator with correct background color', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      const indicator = element.querySelector('.legend-color-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('should include accessibility pattern attribute', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      const indicator = element.querySelector('.legend-color-indicator');
      expect(indicator.dataset.pattern).toBe('stripes');
    });

    it('should include label text', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      const label = element.querySelector('.legend-label');
      expect(label.textContent).toBe('Test Label');
    });

    it('should have accessible attributes on label', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createLegendItemElement(colorItem, 0, 'Test Label');
      const label = element.querySelector('.legend-label');
      expect(label.getAttribute('tabindex')).toBe('0');
      expect(label.getAttribute('role')).toBe('button');
      expect(label.getAttribute('aria-label')).toContain('Double-click to edit');
    });

    it('should use correct pattern for different indices', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element1 = createLegendItemElement(colorItem, 0, 'Label');
      const element2 = createLegendItemElement(colorItem, 1, 'Label');

      expect(element1.querySelector('.legend-color-indicator').dataset.pattern).toBe('stripes');
      expect(element2.querySelector('.legend-color-indicator').dataset.pattern).toBe('dots');
    });
  });

  describe('isValidHexColor', () => {
    it('should return true for valid 6-digit hex colors', () => {
      expect(isValidHexColor('#FF0000')).toBe(true);
      expect(isValidHexColor('#00ff00')).toBe(true);
      expect(isValidHexColor('#3B82F6')).toBe(true);
    });

    it('should return false for 3-digit hex colors', () => {
      expect(isValidHexColor('#F00')).toBe(false);
    });

    it('should return false for colors without hash', () => {
      expect(isValidHexColor('FF0000')).toBe(false);
    });

    it('should return false for invalid characters', () => {
      expect(isValidHexColor('#GGGGGG')).toBe(false);
      expect(isValidHexColor('#FF000G')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidHexColor(null)).toBe(false);
      expect(isValidHexColor(undefined)).toBe(false);
      expect(isValidHexColor(123456)).toBe(false);
    });
  });

  describe('parseLegendSettings', () => {
    it('should return defaults for null settings', () => {
      const result = parseLegendSettings(null);
      expect(result).toEqual({ showLegend: false, legendLabels: {} });
    });

    it('should return defaults for undefined settings', () => {
      const result = parseLegendSettings(undefined);
      expect(result).toEqual({ showLegend: false, legendLabels: {} });
    });

    it('should return defaults for empty string', () => {
      const result = parseLegendSettings('');
      expect(result).toEqual({ showLegend: false, legendLabels: {} });
    });

    it('should return defaults for invalid JSON', () => {
      const result = parseLegendSettings('not valid json');
      expect(result).toEqual({ showLegend: false, legendLabels: {} });
    });

    it('should parse showLegend as true', () => {
      const settings = JSON.stringify({ showLegend: true });
      const result = parseLegendSettings(settings);
      expect(result.showLegend).toBe(true);
    });

    it('should parse showLegend as false', () => {
      const settings = JSON.stringify({ showLegend: false });
      const result = parseLegendSettings(settings);
      expect(result.showLegend).toBe(false);
    });

    it('should parse legendLabels', () => {
      const settings = JSON.stringify({
        showLegend: true,
        legendLabels: { '#FF0000': 'Important', '#00FF00': 'Secondary' }
      });
      const result = parseLegendSettings(settings);
      expect(result.legendLabels).toEqual({
        '#FF0000': 'Important',
        '#00FF00': 'Secondary'
      });
    });

    it('should handle settings without showLegend', () => {
      const settings = JSON.stringify({ legendLabels: { '#FF0000': 'Test' } });
      const result = parseLegendSettings(settings);
      expect(result.showLegend).toBe(false);
      expect(result.legendLabels).toEqual({ '#FF0000': 'Test' });
    });

    it('should handle settings without legendLabels', () => {
      const settings = JSON.stringify({ showLegend: true });
      const result = parseLegendSettings(settings);
      expect(result.showLegend).toBe(true);
      expect(result.legendLabels).toEqual({});
    });
  });

  describe('createReadOnlyLegendItemElement', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should create a list item element', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.tagName).toBe('LI');
    });

    it('should have legend-item class', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.classList.contains('legend-item')).toBe(true);
    });

    it('should NOT have data-color attribute (read-only)', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      expect(element.dataset.color).toBeUndefined();
    });

    it('should include color indicator with correct background color', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      const indicator = element.querySelector('.legend-color-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator.style.backgroundColor).toBe('rgb(255, 0, 0)');
    });

    it('should include accessibility pattern attribute', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      const indicator = element.querySelector('.legend-color-indicator');
      expect(indicator.dataset.pattern).toBe('stripes');
    });

    it('should use legend-label-readonly class instead of legend-label', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      const label = element.querySelector('.legend-label-readonly');
      expect(label).not.toBeNull();
      expect(label.textContent).toBe('Test Label');

      const editableLabel = element.querySelector('.legend-label');
      expect(editableLabel).toBeNull();
    });

    it('should NOT have tabindex or role attributes (not interactive)', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element = createReadOnlyLegendItemElement(colorItem, 0, 'Test Label');
      const label = element.querySelector('.legend-label-readonly');
      expect(label.getAttribute('tabindex')).toBeNull();
      expect(label.getAttribute('role')).toBeNull();
    });

    it('should use correct pattern for different indices', () => {
      const colorItem = { color: '#FF0000', count: 1 };
      const element1 = createReadOnlyLegendItemElement(colorItem, 0, 'Label');
      const element2 = createReadOnlyLegendItemElement(colorItem, 1, 'Label');

      expect(element1.querySelector('.legend-color-indicator').dataset.pattern).toBe('stripes');
      expect(element2.querySelector('.legend-color-indicator').dataset.pattern).toBe('dots');
    });
  });

  describe('buildColorToPatternMap', () => {
    it('should return empty object for empty nodes array', () => {
      const result = buildColorToPatternMap([]);
      expect(result).toEqual({});
    });

    it('should map colors to pattern indices based on frequency', () => {
      const nodes = [
        { background_color: '#FF0000' },
        { background_color: '#FF0000' },
        { background_color: '#00FF00' },
        { background_color: '#0000FF' },
        { background_color: '#0000FF' },
        { background_color: '#0000FF' }
      ];
      const result = buildColorToPatternMap(nodes);

      // Blue (3) should be index 0, Red (2) should be index 1, Green (1) should be index 2
      expect(result['#0000FF']).toBe(0);
      expect(result['#FF0000']).toBe(1);
      expect(result['#00FF00']).toBe(2);
    });

    it('should uppercase color keys', () => {
      const nodes = [
        { background_color: '#ff0000' },
        { background_color: '#FF0000' }
      ];
      const result = buildColorToPatternMap(nodes);
      expect(result['#FF0000']).toBe(0);
      expect(result['#ff0000']).toBeUndefined();
    });

    it('should use default color for nodes without background_color', () => {
      const nodes = [
        {},
        { background_color: '#FF0000' }
      ];
      const result = buildColorToPatternMap(nodes);
      expect(result['#3B82F6']).toBeDefined();
      expect(result['#FF0000']).toBeDefined();
    });
  });

  describe('getPatternForColor', () => {
    it('should return correct pattern based on colorToPattern map', () => {
      const colorToPattern = {
        '#FF0000': 0,
        '#00FF00': 1,
        '#0000FF': 2
      };

      expect(getPatternForColor('#FF0000', colorToPattern)).toBe('stripes');
      expect(getPatternForColor('#00FF00', colorToPattern)).toBe('dots');
      expect(getPatternForColor('#0000FF', colorToPattern)).toBe('crosshatch');
    });

    it('should handle lowercase color input', () => {
      const colorToPattern = { '#FF0000': 0 };
      expect(getPatternForColor('#ff0000', colorToPattern)).toBe('stripes');
    });

    it('should return null for colors not in map', () => {
      const colorToPattern = { '#FF0000': 0 };
      expect(getPatternForColor('#00FF00', colorToPattern)).toBeNull();
    });

    it('should use default color if input is null/undefined', () => {
      const colorToPattern = { '#3B82F6': 0 };
      expect(getPatternForColor(null, colorToPattern)).toBe('stripes');
      expect(getPatternForColor(undefined, colorToPattern)).toBe('stripes');
    });
  });

  describe('Pattern Consistency Across Representations', () => {
    // These tests verify that the pattern assignment is consistent
    // regardless of which representation (editor, share view, HTML export) uses it

    it('should produce same pattern mapping for identical node sets', () => {
      const nodes = [
        { id: 1, background_color: '#FF0000' },
        { id: 2, background_color: '#FF0000' },
        { id: 3, background_color: '#00FF00' },
        { id: 4, background_color: '#0000FF' }
      ];

      // Call buildColorToPatternMap multiple times - should always return same result
      const map1 = buildColorToPatternMap(nodes);
      const map2 = buildColorToPatternMap(nodes);
      const map3 = buildColorToPatternMap([...nodes]); // Copy of array

      expect(map1).toEqual(map2);
      expect(map1).toEqual(map3);
    });

    it('should maintain consistent pattern for same color across calls', () => {
      const nodes = [
        { background_color: '#FF0000' },
        { background_color: '#FF0000' },
        { background_color: '#00FF00' }
      ];

      const colorToPattern = buildColorToPatternMap(nodes);

      // getPatternForColor should always return same pattern for same color
      const pattern1 = getPatternForColor('#FF0000', colorToPattern);
      const pattern2 = getPatternForColor('#ff0000', colorToPattern); // lowercase
      const pattern3 = getPatternForColor('#FF0000', colorToPattern);

      expect(pattern1).toBe(pattern2);
      expect(pattern1).toBe(pattern3);
    });

    it('extractColorsFromNodes and buildColorToPatternMap should use same sorting', () => {
      const nodes = [
        { background_color: '#FF0000' },
        { background_color: '#FF0000' },
        { background_color: '#00FF00' },
        { background_color: '#0000FF' },
        { background_color: '#0000FF' },
        { background_color: '#0000FF' }
      ];

      const sortedColors = extractColorsFromNodes(nodes);
      const colorToPattern = buildColorToPatternMap(nodes);

      // The order from extractColorsFromNodes should match the indices in colorToPattern
      sortedColors.forEach((colorItem, index) => {
        expect(colorToPattern[colorItem.color]).toBe(index);
      });
    });

    it('patterns should be deterministic based on frequency', () => {
      // Most frequent color gets first pattern, etc.
      const nodes = [
        { background_color: '#AAAAAA' }, // 1 occurrence
        { background_color: '#BBBBBB' }, // 2 occurrences
        { background_color: '#BBBBBB' },
        { background_color: '#CCCCCC' }, // 3 occurrences
        { background_color: '#CCCCCC' },
        { background_color: '#CCCCCC' }
      ];

      const colorToPattern = buildColorToPatternMap(nodes);

      // CCCCCC (most frequent) should get index 0 -> stripes
      // BBBBBB (second) should get index 1 -> dots
      // AAAAAA (least) should get index 2 -> crosshatch
      expect(getPatternForColor('#CCCCCC', colorToPattern)).toBe('stripes');
      expect(getPatternForColor('#BBBBBB', colorToPattern)).toBe('dots');
      expect(getPatternForColor('#AAAAAA', colorToPattern)).toBe('crosshatch');
    });
  });
});
