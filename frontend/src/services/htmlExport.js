/**
 * HTML Export Module
 *
 * Generates a self-contained HTML/CSS/JS export of a BibMap for offline viewing.
 * The export includes:
 * - index.html: Main BibMap canvas view
 * - styles.css: Styling for the exported view
 * - app.js: JavaScript for canvas rendering and interactivity
 * - references/: Individual reference pages
 * - assets/: Supporting files
 */

import { getLinkedReferences } from './bibmapExport.js';
import {
  LEGEND_PATTERNS,
  getPatternForIndex,
  extractColorsFromNodes,
  buildColorToPatternMap,
  getPatternForColor
} from '../utils/legend.js';

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Generates a safe filename from a string
 * @param {string} str - String to convert to filename
 * @returns {string} Safe filename
 */
export function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50) || 'untitled';
}

/**
 * Gets the CSS styles for the exported HTML
 * @returns {string} CSS content
 */
export function getExportStyles() {
  return `
:root {
  --primary-color: #3B82F6;
  --text-color: #1F2937;
  --bg-color: #F9FAFB;
  --border-color: #E5E7EB;
  --card-bg: #FFFFFF;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: var(--bg-color);
  color: var(--text-color);
  line-height: 1.5;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem;
}

header {
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 1rem;
  margin-bottom: 1rem;
}

header h1 {
  font-size: 1.5rem;
  color: var(--text-color);
}

header p {
  color: #6B7280;
  margin-top: 0.25rem;
}

.bibmap-container {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  height: 70vh;
  min-height: 400px;
}

#bibmap-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.node-group {
  cursor: pointer;
}

.node-group:hover {
  filter: brightness(1.05);
}

.node-group.selected .node-shape {
  stroke-width: 3;
  stroke: #2563EB;
}

.connection-line {
  cursor: default;
}

.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 100;
}

.zoom-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.zoom-btn:hover {
  background: #F3F4F6;
  border-color: var(--primary-color);
}

/* Legend */
.legend-panel {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  min-width: 150px;
  max-width: 280px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.legend-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.legend-items {
  list-style: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  position: relative;
}

/* Accessibility patterns for legend indicators */
.legend-color[data-pattern="stripes"] {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.4) 2px,
    rgba(255, 255, 255, 0.4) 4px
  );
}

.legend-color[data-pattern="dots"] {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.5) 1.5px, transparent 1.5px);
  background-size: 5px 5px;
}

.legend-color[data-pattern="crosshatch"] {
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.3) 2px, rgba(255, 255, 255, 0.3) 4px),
    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255, 255, 255, 0.3) 2px, rgba(255, 255, 255, 0.3) 4px);
}

.legend-color[data-pattern="dashes"] {
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(255, 255, 255, 0.4) 3px,
    rgba(255, 255, 255, 0.4) 5px
  );
}

.legend-color[data-pattern="waves"] {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.4) 2px,
    rgba(255, 255, 255, 0.4) 4px
  );
}

/* Description callout */
.description-callout {
  position: absolute;
  max-width: 250px;
  padding: 0.75rem;
  background: #1F2937;
  color: #F9FAFB;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 0.875rem;
  line-height: 1.4;
  z-index: 1000;
  white-space: pre-wrap;
}

.callout-close {
  position: absolute;
  top: 4px;
  right: 8px;
  background: none;
  border: none;
  color: #9CA3AF;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* References panel */
.refs-panel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-top: 1rem;
  padding: 1rem;
}

.refs-panel h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.refs-panel .back-link {
  color: var(--primary-color);
  text-decoration: none;
  font-size: 0.875rem;
}

.refs-panel .back-link:hover {
  text-decoration: underline;
}

.refs-list {
  display: grid;
  gap: 1rem;
}

.ref-card {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1rem;
  background: var(--bg-color);
}

.ref-card h3 {
  font-size: 1rem;
  margin-bottom: 0.25rem;
  color: var(--text-color);
}

.ref-card h3 a {
  color: inherit;
  text-decoration: none;
}

.ref-card h3 a:hover {
  color: var(--primary-color);
}

.ref-card .authors {
  color: #6B7280;
  font-size: 0.875rem;
}

.ref-card .meta {
  color: #6B7280;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.ref-card .meta em {
  font-style: italic;
}

.ref-card .abstract {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #4B5563;
}

.ref-card .tags {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.match-indicators {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.match-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  background: #DBEAFE;
  color: #1E40AF;
  border-radius: 4px;
  font-size: 0.7rem;
}

/* Reference detail page */
.reference-detail {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 1rem;
}

.reference-detail h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.reference-detail .authors {
  font-size: 1.1rem;
  color: #4B5563;
  margin-bottom: 0.5rem;
}

.reference-detail .meta {
  color: #6B7280;
  margin-bottom: 1rem;
}

.reference-detail .abstract {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.reference-detail .abstract h2 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.reference-detail .bibtex {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.reference-detail .bibtex h2 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.reference-detail pre {
  background: #F3F4F6;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.875rem;
  font-family: 'Fira Code', 'Consolas', monospace;
}

.nav-breadcrumb {
  margin-bottom: 1rem;
}

.nav-breadcrumb a {
  color: var(--primary-color);
  text-decoration: none;
}

.nav-breadcrumb a:hover {
  text-decoration: underline;
}

footer {
  margin-top: 2rem;
  padding: 1rem;
  text-align: center;
  color: #9CA3AF;
  font-size: 0.875rem;
  border-top: 1px solid var(--border-color);
}

footer a {
  color: var(--primary-color);
  text-decoration: none;
}

footer a:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .bibmap-container {
    height: 50vh;
  }

  .legend-panel {
    max-width: 180px;
    font-size: 0.75rem;
  }
}
`.trim();
}

/**
 * Gets the JavaScript for the exported HTML (D3-based canvas rendering)
 * @param {Object} bibmap - BibMap data
 * @param {Object} colorToPattern - Map of color to pattern index
 * @returns {string} JavaScript content
 */
export function getExportScript(bibmap, colorToPattern = {}) {
  const nodes = bibmap.nodes || [];
  const connections = bibmap.connections || [];

  return `
(function() {
  const nodes = ${JSON.stringify(nodes)};
  const connections = ${JSON.stringify(connections)};
  const colorToPattern = ${JSON.stringify(colorToPattern)};

  // Pattern definitions for accessibility
  const PATTERNS = ['stripes', 'dots', 'crosshatch', 'dashes', 'waves'];

  function getPatternForColor(bgColor) {
    const upperColor = (bgColor || '#3B82F6').toUpperCase();
    const patternIndex = colorToPattern[upperColor];
    if (patternIndex === undefined) return null;
    return PATTERNS[patternIndex % PATTERNS.length];
  }

  const svg = d3.select('#bibmap-svg');
  const connectionsLayer = svg.select('#connections-layer');
  const nodesLayer = svg.select('#nodes-layer');

  let currentCallout = null;

  // Zoom and pan setup
  const zoom = d3.zoom()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      nodesLayer.attr('transform', event.transform);
      connectionsLayer.attr('transform', event.transform);
      hideCallout();
    });

  svg.call(zoom);

  // Double-click to reset
  svg.on('dblclick.zoom', () => {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  });

  // Zoom controls
  document.getElementById('zoom-in')?.addEventListener('click', () => {
    svg.transition().duration(200).call(zoom.scaleBy, 1.3);
  });

  document.getElementById('zoom-out')?.addEventListener('click', () => {
    svg.transition().duration(200).call(zoom.scaleBy, 0.7);
  });

  document.getElementById('zoom-fit')?.addEventListener('click', fitToScreen);

  function fitToScreen() {
    if (nodes.length === 0) {
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
      return;
    }

    const padding = 50;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
      const w = node.width || 150;
      const h = node.height || 60;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + w);
      maxY = Math.max(maxY, node.y + h);
    });

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const svgRect = svg.node().getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const scale = Math.min(svgWidth / contentWidth, svgHeight / contentHeight, 2);
    const translateX = (svgWidth - contentWidth * scale) / 2 - minX * scale;
    const translateY = (svgHeight - contentHeight * scale) / 2 - minY * scale;

    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    svg.transition().duration(300).call(zoom.transform, transform);
  }

  function getShapePath(node) {
    const w = node.width || 150;
    const h = node.height || 60;
    const shape = node.shape || 'rectangle';

    switch (shape) {
      case 'ellipse': {
        const cx = w / 2, cy = h / 2;
        const rx = w / 2, ry = h / 2;
        const kappa = 0.5522848;
        const ox = rx * kappa, oy = ry * kappa;
        return \`M \${cx - rx} \${cy}
                C \${cx - rx} \${cy - oy}, \${cx - ox} \${cy - ry}, \${cx} \${cy - ry}
                C \${cx + ox} \${cy - ry}, \${cx + rx} \${cy - oy}, \${cx + rx} \${cy}
                C \${cx + rx} \${cy + oy}, \${cx + ox} \${cy + ry}, \${cx} \${cy + ry}
                C \${cx - ox} \${cy + ry}, \${cx - rx} \${cy + oy}, \${cx - rx} \${cy}
                Z\`;
      }
      case 'diamond': {
        const cx = w / 2, cy = h / 2;
        return \`M \${cx} 0 L \${w} \${cy} L \${cx} \${h} L 0 \${cy} Z\`;
      }
      case 'rounded-rectangle': {
        const r = Math.min(16, w / 4, h / 4);
        return \`M \${r} 0 L \${w - r} 0 Q \${w} 0, \${w} \${r} L \${w} \${h - r} Q \${w} \${h}, \${w - r} \${h} L \${r} \${h} Q 0 \${h}, 0 \${h - r} L 0 \${r} Q 0 0, \${r} 0 Z\`;
      }
      default:
        return \`M 0 0 L \${w} 0 L \${w} \${h} L 0 \${h} Z\`;
    }
  }

  function getEdgePoint(node, angle) {
    const cx = node.x + (node.width || 150) / 2;
    const cy = node.y + (node.height || 60) / 2;
    const w = (node.width || 150) / 2;
    const h = (node.height || 60) / 2;
    const shape = node.shape || 'rectangle';

    let x, y;

    switch (shape) {
      case 'ellipse':
        x = cx + w * Math.cos(angle);
        y = cy + h * Math.sin(angle);
        break;
      case 'diamond': {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        if (Math.abs(cosA) * h > Math.abs(sinA) * w) {
          const t = w / Math.abs(cosA);
          x = cx + t * cosA;
          y = cy + t * sinA;
        } else {
          const t = h / Math.abs(sinA);
          x = cx + t * cosA;
          y = cy + t * sinA;
        }
        break;
      }
      default: {
        const tanAngle = Math.tan(angle);
        if (Math.abs(Math.cos(angle)) * h > Math.abs(Math.sin(angle)) * w) {
          x = cx + (Math.cos(angle) > 0 ? w : -w);
          y = cy + (Math.cos(angle) > 0 ? w : -w) * tanAngle;
        } else {
          y = cy + (Math.sin(angle) > 0 ? h : -h);
          x = cx + (Math.sin(angle) > 0 ? h : -h) / tanAngle;
        }
      }
    }

    return { x, y };
  }

  function calculateConnectionPath(connection) {
    const source = nodes.find(n => n.id === connection.source_node_id);
    const target = nodes.find(n => n.id === connection.target_node_id);

    if (!source || !target) return '';

    const sx = source.x + (source.width || 150) / 2;
    const sy = source.y + (source.height || 60) / 2;
    const tx = target.x + (target.width || 150) / 2;
    const ty = target.y + (target.height || 60) / 2;

    const angle = Math.atan2(ty - sy, tx - sx);
    const sourceEdge = getEdgePoint(source, angle);
    const targetEdge = getEdgePoint(target, angle + Math.PI);

    return \`M \${sourceEdge.x} \${sourceEdge.y} L \${targetEdge.x} \${targetEdge.y}\`;
  }

  function ensureArrowMarker(lineWidth, color, isStart = false) {
    const suffix = isStart ? '-start' : '';
    const markerId = \`arrowhead-\${lineWidth}-\${color.replace('#', '')}\${suffix}\`;
    const defs = svg.select('defs');

    if (defs.select('#' + markerId).empty()) {
      const scale = lineWidth / 4;
      const markerWidth = 10 * scale;
      const markerHeight = 7 * scale;
      const refX = isStart ? 1 * scale : 9 * scale;
      const refY = 3.5 * scale;

      const marker = defs.append('marker')
        .attr('id', markerId)
        .attr('markerWidth', markerWidth)
        .attr('markerHeight', markerHeight)
        .attr('refX', refX)
        .attr('refY', refY)
        .attr('orient', 'auto');

      if (isStart) {
        marker.append('polygon')
          .attr('points', \`\${markerWidth} 0, 0 \${refY}, \${markerWidth} \${markerHeight}\`)
          .attr('fill', color);
      } else {
        marker.append('polygon')
          .attr('points', \`0 0, \${markerWidth} \${refY}, 0 \${markerHeight}\`)
          .attr('fill', color);
      }
    }

    return 'url(#' + markerId + ')';
  }

  function getNodeFilter(node) {
    const style = node.node_style || 'flat';
    if (style === 'bevel') return 'url(#bevel-filter)';
    if (style === 'emboss') return 'url(#emboss-filter)';
    return null;
  }

  function hideCallout() {
    if (currentCallout) {
      currentCallout.remove();
      currentCallout = null;
    }
  }

  function showCallout(node, event) {
    hideCallout();

    const container = document.querySelector('.bibmap-container');
    const transform = nodesLayer.attr('transform');

    let scale = 1, translateX = 0, translateY = 0;
    if (transform) {
      const match = transform.match(/translate\\(([-.\\d]+),\\s*([-.\\d]+)\\)\\s*scale\\(([-.\\d]+)\\)/);
      if (match) {
        translateX = parseFloat(match[1]);
        translateY = parseFloat(match[2]);
        scale = parseFloat(match[3]);
      }
    }

    const nodeX = node.x + (node.width || 150) - 12;
    const nodeY = node.y + 12;
    const screenX = nodeX * scale + translateX;
    const screenY = nodeY * scale + translateY;

    const callout = document.createElement('div');
    callout.className = 'description-callout';
    callout.innerHTML = \`
      <div>\${escapeHtml(node.description)}</div>
      <button class="callout-close" aria-label="Close">&times;</button>
    \`;
    callout.style.left = (screenX + 20) + 'px';
    callout.style.top = screenY + 'px';

    callout.querySelector('.callout-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hideCallout();
    });

    container.appendChild(callout);
    currentCallout = callout;

    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!callout.contains(e.target)) {
          hideCallout();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Ensure filter definitions
  const defs = svg.select('defs');

  if (defs.select('#bevel-filter').empty()) {
    const bevelFilter = defs.append('filter')
      .attr('id', 'bevel-filter')
      .attr('x', '-20%').attr('y', '-20%')
      .attr('width', '140%').attr('height', '140%');
    bevelFilter.append('feDropShadow')
      .attr('dx', '3').attr('dy', '3')
      .attr('stdDeviation', '2')
      .attr('flood-color', '#000000')
      .attr('flood-opacity', '0.4');
  }

  if (defs.select('#emboss-filter').empty()) {
    const embossFilter = defs.append('filter')
      .attr('id', 'emboss-filter')
      .attr('x', '-20%').attr('y', '-20%')
      .attr('width', '140%').attr('height', '140%');

    embossFilter.append('feOffset').attr('in', 'SourceAlpha').attr('dx', '2').attr('dy', '2').attr('result', 'shadowOffset');
    embossFilter.append('feGaussianBlur').attr('in', 'shadowOffset').attr('stdDeviation', '1').attr('result', 'shadowBlur');
    embossFilter.append('feComposite').attr('in', 'shadowBlur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', '-1').attr('k3', '1').attr('result', 'shadowDiff');
    embossFilter.append('feFlood').attr('flood-color', '#000000').attr('flood-opacity', '0.5');
    embossFilter.append('feComposite').attr('in2', 'shadowDiff').attr('operator', 'in').attr('result', 'innerShadow');
    embossFilter.append('feOffset').attr('in', 'SourceAlpha').attr('dx', '-2').attr('dy', '-2').attr('result', 'highlightOffset');
    embossFilter.append('feGaussianBlur').attr('in', 'highlightOffset').attr('stdDeviation', '1').attr('result', 'highlightBlur');
    embossFilter.append('feComposite').attr('in', 'highlightBlur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', '-1').attr('k3', '1').attr('result', 'highlightDiff');
    embossFilter.append('feFlood').attr('flood-color', '#ffffff').attr('flood-opacity', '0.4');
    embossFilter.append('feComposite').attr('in2', 'highlightDiff').attr('operator', 'in').attr('result', 'innerHighlight');
    const embossMerge = embossFilter.append('feMerge');
    embossMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    embossMerge.append('feMergeNode').attr('in', 'innerShadow');
    embossMerge.append('feMergeNode').attr('in', 'innerHighlight');
  }

  // Add accessibility pattern definitions for nodes
  // Stripes pattern (45 degree diagonal lines)
  if (defs.select('#pattern-stripes').empty()) {
    const stripesPattern = defs.append('pattern')
      .attr('id', 'pattern-stripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', '8')
      .attr('height', '8')
      .attr('patternTransform', 'rotate(45)');
    stripesPattern.append('line')
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '0').attr('y2', '8')
      .attr('stroke', 'rgba(255,255,255,0.25)')
      .attr('stroke-width', '3');
  }

  // Dots pattern
  if (defs.select('#pattern-dots').empty()) {
    const dotsPattern = defs.append('pattern')
      .attr('id', 'pattern-dots')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', '10')
      .attr('height', '10');
    dotsPattern.append('circle')
      .attr('cx', '5').attr('cy', '5')
      .attr('r', '2')
      .attr('fill', 'rgba(255,255,255,0.3)');
  }

  // Crosshatch pattern
  if (defs.select('#pattern-crosshatch').empty()) {
    const crosshatchPattern = defs.append('pattern')
      .attr('id', 'pattern-crosshatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', '8')
      .attr('height', '8');
    crosshatchPattern.append('line')
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '8').attr('y2', '0')
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-width', '2');
    crosshatchPattern.append('line')
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '0').attr('y2', '8')
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-width', '2');
  }

  // Dashes pattern (horizontal lines)
  if (defs.select('#pattern-dashes').empty()) {
    const dashesPattern = defs.append('pattern')
      .attr('id', 'pattern-dashes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', '8')
      .attr('height', '8');
    dashesPattern.append('line')
      .attr('x1', '0').attr('y1', '4')
      .attr('x2', '8').attr('y2', '4')
      .attr('stroke', 'rgba(255,255,255,0.25)')
      .attr('stroke-width', '2');
  }

  // Waves pattern (-45 degree diagonal lines)
  if (defs.select('#pattern-waves').empty()) {
    const wavesPattern = defs.append('pattern')
      .attr('id', 'pattern-waves')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', '8')
      .attr('height', '8')
      .attr('patternTransform', 'rotate(-45)');
    wavesPattern.append('line')
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '0').attr('y2', '8')
      .attr('stroke', 'rgba(255,255,255,0.25)')
      .attr('stroke-width', '3');
  }

  // Render connections
  connections.forEach(conn => {
    const lineColor = conn.line_color || '#6B7280';
    const lineWidth = conn.line_width || 4;

    const path = connectionsLayer.append('path')
      .attr('class', 'connection-line')
      .attr('d', calculateConnectionPath(conn))
      .attr('stroke', lineColor)
      .attr('stroke-width', lineWidth)
      .attr('fill', 'none');

    if (conn.line_style === 'dashed') {
      path.attr('stroke-dasharray', '8,4');
    } else if (conn.line_style === 'dotted') {
      path.attr('stroke-dasharray', '2,2');
    }

    if (conn.arrow_type !== 'none') {
      path.attr('marker-end', ensureArrowMarker(lineWidth, lineColor, false));
    }
    if (conn.arrow_type === 'both') {
      path.attr('marker-start', ensureArrowMarker(lineWidth, lineColor, true));
    }

    if (conn.show_label && conn.label) {
      const source = nodes.find(n => n.id === conn.source_node_id);
      const target = nodes.find(n => n.id === conn.target_node_id);
      if (source && target) {
        const mx = (source.x + (source.width || 150) / 2 + target.x + (target.width || 150) / 2) / 2;
        const my = (source.y + (source.height || 60) / 2 + target.y + (target.height || 60) / 2) / 2;
        connectionsLayer.append('text')
          .attr('x', mx)
          .attr('y', my - 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#374151')
          .attr('font-size', '12')
          .text(conn.label);
      }
    }
  });

  // Render nodes
  nodes.forEach(node => {
    const g = nodesLayer.append('g')
      .attr('class', 'node-group')
      .attr('transform', \`translate(\${node.x}, \${node.y})\`);

    const style = node.node_style || 'flat';
    const bgColor = node.background_color || '#3B82F6';
    const textColor = node.text_color || '#FFFFFF';
    const borderColor = node.border_color || '#1E40AF';

    g.append('path')
      .attr('class', 'node-shape')
      .attr('d', getShapePath(node))
      .attr('fill', style === 'outline' ? 'none' : bgColor)
      .attr('stroke', style === 'outline' ? bgColor : borderColor)
      .attr('stroke-width', style === 'outline' ? 3 : 2)
      .attr('filter', getNodeFilter(node));

    // Add subtle pattern overlay for accessibility (matching legend patterns)
    const nodePattern = getPatternForColor(bgColor);
    if (nodePattern && style !== 'outline') {
      g.append('path')
        .attr('class', 'node-pattern-overlay')
        .attr('d', getShapePath(node))
        .attr('fill', \`url(#pattern-\${nodePattern})\`)
        .attr('stroke', 'none')
        .attr('pointer-events', 'none');
    }

    const w = node.width || 150;
    const h = node.height || 60;

    const fo = g.append('foreignObject')
      .attr('x', 4).attr('y', 4)
      .attr('width', w - 8)
      .attr('height', h - 8);

    const div = fo.append('xhtml:div')
      .style('width', (w - 8) + 'px')
      .style('height', (h - 8) + 'px')
      .style('color', textColor)
      .style('font-size', (node.font_size || 14) + 'px')
      .style('font-family', node.font_family || 'system-ui')
      .style('font-weight', node.font_bold ? 'bold' : 'normal')
      .style('font-style', node.font_italic ? 'italic' : 'normal')
      .style('text-decoration', node.font_underline ? 'underline' : 'none')
      .style('overflow', 'hidden')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('justify-content', 'center')
      .style('text-align', 'center')
      .style('word-wrap', 'break-word')
      .style('overflow-wrap', 'break-word')
      .style('line-height', '1.2')
      .style('padding', '2px')
      .style('box-sizing', 'border-box')
      .text(node.label);

    // Info icon for nodes with descriptions
    if (node.description) {
      g.append('circle')
        .attr('cx', w - 12)
        .attr('cy', 12)
        .attr('r', 8)
        .attr('fill', '#6B7280')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          showCallout(node, event);
        });

      g.append('text')
        .attr('x', w - 12)
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#ffffff')
        .attr('font-size', '10')
        .attr('font-weight', 'bold')
        .attr('pointer-events', 'none')
        .text('i');
    }

    // Click to view references if linked
    if (node.link_to_references) {
      g.style('cursor', 'pointer')
        .on('click', () => {
          window.location.href = 'references/' + node.id + '.html';
        });
    }
  });

  // Initial fit to screen
  setTimeout(fitToScreen, 100);
})();
`.trim();
}

/**
 * Generates the main index.html page
 * @param {Object} bibmap - BibMap data
 * @param {boolean} showLegend - Whether to show the legend
 * @param {Object} legendLabels - Custom legend labels
 * @returns {string} HTML content
 */
export function generateIndexHtml(bibmap, showLegend, legendLabels) {
  const nodes = bibmap.nodes || [];
  const legendHtml = showLegend ? generateLegendHtml(nodes, legendLabels) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(bibmap.title)} - BibMap Export</title>
  <link rel="stylesheet" href="styles.css">
  <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body>
  <header>
    <div class="container">
      <h1>${escapeHtml(bibmap.title)}</h1>
      ${bibmap.description ? `<p>${escapeHtml(bibmap.description)}</p>` : ''}
    </div>
  </header>

  <main class="container">
    <div class="bibmap-container">
      <svg id="bibmap-svg">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
          </marker>
        </defs>
        <g id="connections-layer"></g>
        <g id="nodes-layer"></g>
      </svg>
      ${legendHtml}
      <div class="zoom-controls">
        <button class="zoom-btn" id="zoom-in" aria-label="Zoom in" title="Zoom In">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button class="zoom-btn" id="zoom-out" aria-label="Zoom out" title="Zoom Out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 8h10" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button class="zoom-btn" id="zoom-fit" aria-label="Fit to screen" title="Fit to Screen">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h4M2 2v4M14 2h-4M14 2v4M2 14h4M2 14v-4M14 14h-4M14 14v-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </button>
      </div>
    </div>
  </main>

  <footer>
    <p>Exported from <a href="https://github.com/pubino/bibmaps">BibMap</a></p>
  </footer>

  <script src="app.js"></script>
</body>
</html>`;
}

/**
 * Generates the legend HTML
 * @param {Array} nodes - Array of nodes
 * @param {Object} legendLabels - Custom legend labels
 * @returns {string} Legend HTML
 */
function generateLegendHtml(nodes, legendLabels) {
  // Use shared utility for consistent color extraction and sorting
  const sortedColors = extractColorsFromNodes(nodes);

  if (sortedColors.length === 0) return '';

  let categoryIndex = 1;
  const items = sortedColors.map((item, index) => {
    const label = (legendLabels && legendLabels[item.color]) || `Category ${categoryIndex++}`;
    const pattern = getPatternForIndex(index);
    return `<li class="legend-item">
      <span class="legend-color" style="background-color: ${item.color}" data-pattern="${pattern}" title="Pattern: ${pattern}" aria-label="Color indicator with ${pattern} pattern"></span>
      <span>${escapeHtml(label)}</span>
    </li>`;
  }).join('\n      ');

  return `
    <div class="legend-panel">
      <h4 class="legend-title">Legend</h4>
      <ul class="legend-items">
        ${items}
      </ul>
    </div>`;
}

/**
 * Generates a reference detail page
 * @param {Object} reference - Reference data
 * @param {string} bibmapTitle - BibMap title for breadcrumb
 * @returns {string} HTML content
 */
export function generateReferenceHtml(reference, bibmapTitle) {
  const taxonomyTags = (reference.taxonomies || []).map(t =>
    `<span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>`
  ).join('');

  const matchIndicators = (reference.match_reasons || []).map(reason =>
    `<span class="match-indicator">${escapeHtml(reason)}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reference.title || reference.bibtex_key)} - Reference</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>${escapeHtml(bibmapTitle)}</h1>
    </div>
  </header>

  <main class="container">
    <nav class="nav-breadcrumb">
      <a href="../index.html">&larr; Back to BibMap</a>
    </nav>

    <article class="reference-detail">
      <h1>${escapeHtml(reference.title || reference.bibtex_key)}</h1>
      <p class="authors">${escapeHtml(reference.author || 'Unknown author')}</p>
      <p class="meta">
        ${reference.year ? `(${reference.year})` : ''}
        ${reference.journal ? `<em>${escapeHtml(reference.journal)}</em>` : ''}
        ${reference.booktitle ? `In <em>${escapeHtml(reference.booktitle)}</em>` : ''}
        ${reference.publisher ? `Published by ${escapeHtml(reference.publisher)}` : ''}
      </p>

      ${taxonomyTags ? `<div class="tags">${taxonomyTags}</div>` : ''}
      ${matchIndicators ? `<div class="match-indicators">${matchIndicators}</div>` : ''}

      ${reference.doi ? `<p class="meta"><a href="https://doi.org/${escapeHtml(reference.doi)}" target="_blank" rel="noopener noreferrer">DOI: ${escapeHtml(reference.doi)}</a></p>` : ''}
      ${reference.url ? `<p class="meta"><a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.url)}</a></p>` : ''}

      ${reference.abstract ? `
      <div class="abstract">
        <h2>Abstract</h2>
        <p>${escapeHtml(reference.abstract)}</p>
      </div>
      ` : ''}

      ${reference.raw_bibtex ? `
      <div class="bibtex">
        <h2>BibTeX</h2>
        <pre>${escapeHtml(reference.raw_bibtex)}</pre>
      </div>
      ` : ''}
    </article>
  </main>

  <footer>
    <p>Exported from <a href="https://github.com/pubino/bibmaps">BibMap</a></p>
  </footer>
</body>
</html>`;
}

/**
 * Generates a node references page (list of references for a node)
 * @param {Object} node - Node data
 * @param {Array} references - Array of references for this node
 * @param {string} bibmapTitle - BibMap title for breadcrumb
 * @returns {string} HTML content
 */
export function generateNodeReferencesHtml(node, references, bibmapTitle) {
  const refCards = references.map(ref => {
    const taxonomyTags = (ref.taxonomies || []).map(t =>
      `<span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>`
    ).join('');

    const matchIndicators = (ref.match_reasons || []).map(reason =>
      `<span class="match-indicator">${escapeHtml(reason)}</span>`
    ).join('');

    return `
      <article class="ref-card">
        <h3><a href="${sanitizeFilename(ref.bibtex_key)}.html">${escapeHtml(ref.title || ref.bibtex_key)}</a></h3>
        <p class="authors">${escapeHtml(ref.author || 'Unknown author')}</p>
        <p class="meta">
          ${ref.year ? `(${ref.year})` : ''}
          ${ref.journal ? `<em>${escapeHtml(ref.journal)}</em>` : ''}
          ${ref.booktitle ? `In <em>${escapeHtml(ref.booktitle)}</em>` : ''}
        </p>
        ${taxonomyTags ? `<div class="tags">${taxonomyTags}</div>` : ''}
        ${matchIndicators ? `<div class="match-indicators">${matchIndicators}</div>` : ''}
        ${ref.abstract ? `<p class="abstract">${escapeHtml(ref.abstract.substring(0, 200))}${ref.abstract.length > 200 ? '...' : ''}</p>` : ''}
      </article>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>References for "${escapeHtml(node.label)}" - ${escapeHtml(bibmapTitle)}</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>${escapeHtml(bibmapTitle)}</h1>
    </div>
  </header>

  <main class="container">
    <nav class="nav-breadcrumb">
      <a href="../index.html">&larr; Back to BibMap</a>
    </nav>

    <div class="refs-panel">
      <h2>References for "${escapeHtml(node.label)}"</h2>
      ${references.length > 0 ? `
      <div class="refs-list">
        ${refCards}
      </div>
      ` : '<p>No linked references found for this node.</p>'}
    </div>
  </main>

  <footer>
    <p>Exported from <a href="https://github.com/pubino/bibmaps">BibMap</a></p>
  </footer>
</body>
</html>`;
}

/**
 * Generates the complete HTML export package
 * @param {Object} options - Export options
 * @param {Object} options.bibmap - BibMap data with nodes and connections
 * @param {Array} options.allReferences - All user references
 * @param {boolean} options.showLegend - Whether to show legend
 * @param {Object} options.legendLabels - Custom legend labels
 * @param {Function} options.getNodeReferences - Function to get references for a node (optional)
 * @returns {Object} Object with files to include in ZIP
 */
export async function generateHtmlExport(options) {
  const { bibmap, allReferences, showLegend, legendLabels, getNodeReferences } = options;

  const files = {};

  // Get linked references
  const linkedRefs = getLinkedReferences(bibmap, allReferences);

  // Build color-to-pattern mapping for accessibility patterns
  const colorToPattern = buildColorToPatternMap(bibmap.nodes || []);

  // Main index.html
  files['index.html'] = generateIndexHtml(bibmap, showLegend, legendLabels);

  // Styles
  files['styles.css'] = getExportStyles();

  // JavaScript (with color-to-pattern mapping for node accessibility patterns)
  files['app.js'] = getExportScript(bibmap, colorToPattern);

  // Generate reference pages for nodes with link_to_references enabled
  const nodesWithRefs = (bibmap.nodes || []).filter(n => n.link_to_references);

  for (const node of nodesWithRefs) {
    // Get references for this node
    let nodeRefs = [];
    if (getNodeReferences) {
      try {
        nodeRefs = await getNodeReferences(node.id);
      } catch (e) {
        // If we can't fetch node-specific refs, fall back to tag-based filtering
        nodeRefs = getNodeReferencesFromTags(node, linkedRefs);
      }
    } else {
      nodeRefs = getNodeReferencesFromTags(node, linkedRefs);
    }

    // Create the node's reference list page
    files[`references/${node.id}.html`] = generateNodeReferencesHtml(node, nodeRefs, bibmap.title);

    // Create individual reference detail pages
    for (const ref of nodeRefs) {
      const refFilename = `references/${sanitizeFilename(ref.bibtex_key)}.html`;
      if (!files[refFilename]) {
        files[refFilename] = generateReferenceHtml(ref, bibmap.title);
      }
    }
  }

  return files;
}

/**
 * Gets references for a node based on shared tags
 * @param {Object} node - Node with taxonomies
 * @param {Array} linkedRefs - Array of linked references
 * @returns {Array} References matching the node's tags
 */
function getNodeReferencesFromTags(node, linkedRefs) {
  if (!node.taxonomies || node.taxonomies.length === 0) {
    return [];
  }

  const nodeTagIds = new Set(node.taxonomies.map(t => t.id));

  return linkedRefs.filter(ref =>
    ref.taxonomies?.some(t => nodeTagIds.has(t.id))
  ).map(ref => ({
    ...ref,
    match_reasons: ref.taxonomies
      ?.filter(t => nodeTagIds.has(t.id))
      .map(t => `Tag: ${t.name}`) || []
  }));
}

/**
 * Generates the filename for the HTML export ZIP
 * @param {string} title - BibMap title
 * @returns {string} Filename with .zip extension
 */
export function generateHtmlExportFilename(title) {
  return `${sanitizeFilename(title)}_html_export.zip`;
}
