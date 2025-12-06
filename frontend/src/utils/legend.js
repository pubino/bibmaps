// Legend utility functions - extracted for testability

export const LEGEND_PATTERNS = ['stripes', 'dots', 'crosshatch', 'dashes', 'waves'];

/**
 * Get the accessibility pattern for a given index
 * @param {number} index - The index of the legend item
 * @returns {string} - The pattern name
 */
export function getPatternForIndex(index) {
  return LEGEND_PATTERNS[index % LEGEND_PATTERNS.length];
}

/**
 * Extract unique background colors from nodes and sort by frequency
 * @param {Array} nodes - Array of node objects
 * @returns {Array} - Array of color objects sorted by frequency
 */
export function extractColorsFromNodes(nodes) {
  const colorMap = new Map();

  nodes.forEach(node => {
    const bgColor = (node.background_color || '#3B82F6').toUpperCase();
    if (!colorMap.has(bgColor)) {
      colorMap.set(bgColor, {
        color: bgColor,
        count: 1
      });
    } else {
      colorMap.get(bgColor).count++;
    }
  });

  // Sort by frequency (most used first)
  return Array.from(colorMap.values())
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate placeholder labels for colors without user-defined labels
 * @param {Array} sortedColors - Array of color objects sorted by frequency
 * @param {Object} existingLabels - Existing legend labels map
 * @returns {Object} - Updated legend labels map
 */
export function generateLegendLabels(sortedColors, existingLabels = {}) {
  const labels = { ...existingLabels };
  let categoryIndex = 1;

  sortedColors.forEach(item => {
    if (!labels[item.color]) {
      labels[item.color] = `Category ${categoryIndex}`;
    }
    categoryIndex++;
  });

  return labels;
}

/**
 * Create a legend item element
 * @param {Object} colorItem - Color object with color and count
 * @param {number} index - Index for pattern assignment
 * @param {string} label - Label for the legend item
 * @returns {HTMLLIElement} - The legend item element
 */
export function createLegendItemElement(colorItem, index, label) {
  const li = document.createElement('li');
  li.className = 'legend-item';
  li.dataset.color = colorItem.color;

  const pattern = getPatternForIndex(index);

  li.innerHTML = `
    <span class="legend-color-indicator"
          style="background-color: ${colorItem.color}"
          data-pattern="${pattern}"
          title="Pattern: ${pattern}"
          aria-label="Color indicator with ${pattern} pattern"></span>
    <span class="legend-label"
          tabindex="0"
          role="button"
          aria-label="${label}. Double-click to edit."
          title="Double-click to edit">${label}</span>
  `;

  return li;
}

/**
 * Validate if a color string is a valid hex color
 * @param {string} color - The color string to validate
 * @returns {boolean} - True if valid hex color
 */
export function isValidHexColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Parse legend metadata from bibmap
 * @param {string|null} metadataString - JSON string of bibmap metadata
 * @returns {Object} - Parsed legend settings { showLegend, legendLabels }
 */
export function parseLegendMetadata(metadataString) {
  if (!metadataString) {
    return { showLegend: false, legendLabels: {} };
  }

  try {
    const metadata = JSON.parse(metadataString);
    return {
      showLegend: metadata.showLegend || false,
      legendLabels: metadata.legendLabels || {}
    };
  } catch (e) {
    return { showLegend: false, legendLabels: {} };
  }
}

/**
 * Create a read-only legend item element (for share view)
 * @param {Object} colorItem - Color object with color and count
 * @param {number} index - Index for pattern assignment
 * @param {string} label - Label for the legend item
 * @returns {HTMLLIElement} - The legend item element (read-only)
 */
export function createReadOnlyLegendItemElement(colorItem, index, label) {
  const li = document.createElement('li');
  li.className = 'legend-item';

  const pattern = getPatternForIndex(index);

  li.innerHTML = `
    <span class="legend-color-indicator"
          style="background-color: ${colorItem.color}"
          data-pattern="${pattern}"
          title="Pattern: ${pattern}"
          aria-label="Color indicator with ${pattern} pattern"></span>
    <span class="legend-label-readonly">${label}</span>
  `;

  return li;
}
