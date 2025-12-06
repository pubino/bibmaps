import * as d3 from 'd3';
import { api } from '../services/api.js';

export class BibMapCanvas {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.svg = d3.select('#bibmap-svg');
    this.nodesLayer = this.svg.select('#nodes-layer');
    this.connectionsLayer = this.svg.select('#connections-layer');
    this.srNodeList = document.getElementById('sr-node-list');

    this.bibmapId = null;
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.connectMode = false;
    this.connectSourceNode = null;
    this.selectedConnection = null;
    this.resizing = false;
    this.snapToGrid = false;
    this.gridSize = 20;

    this.onNodeSelect = options.onNodeSelect || (() => {});
    this.onNodeUpdate = options.onNodeUpdate || (() => {});
    this.onConnectionSelect = options.onConnectionSelect || (() => {});
    this.onCanvasClick = options.onCanvasClick || (() => {});
    this.announce = options.announce || (() => {});

    this.defaultNodeColor = '#3B82F6';
    this.defaultTextColor = '#FFFFFF';

    // Minimum node dimensions
    this.minNodeWidth = 50;
    this.minNodeHeight = 30;

    this.setupZoomAndPan();
    this.setupKeyboardNavigation();
    this.setupCanvasClick();
  }

  setupCanvasClick() {
    // Click on canvas background dismisses selections
    this.svg.on('click', (event) => {
      // Only trigger if clicking directly on SVG (not on nodes/connections)
      if (event.target === this.svg.node()) {
        this.clearSelection();
        this.clearConnectionSelection();
        this.onCanvasClick();
      }
    });
  }

  setupZoomAndPan() {
    this.zoom = d3.zoom()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        this.nodesLayer.attr('transform', event.transform);
        this.connectionsLayer.attr('transform', event.transform);
        // Hide callout on zoom/pan
        this.hideDescriptionCallout();
      });

    this.svg.call(this.zoom);

    // Double-click to reset zoom
    this.svg.on('dblclick.zoom', () => {
      this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
    });
  }

  setupZoomControls() {
    // Create zoom controls container
    const controls = document.createElement('div');
    controls.className = 'zoom-controls';
    controls.innerHTML = `
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
    `;

    // Style the controls
    controls.style.cssText = `
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 100;
    `;

    // Style the buttons
    const btnStyle = `
      width: 32px;
      height: 32px;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      background: #FFFFFF;
      color: #374151;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    controls.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.style.cssText = btnStyle;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#F3F4F6';
        btn.style.borderColor = '#3B82F6';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#FFFFFF';
        btn.style.borderColor = '#E5E7EB';
      });
    });

    // Add click handlers
    controls.querySelector('#zoom-in').addEventListener('click', () => this.zoomIn());
    controls.querySelector('#zoom-out').addEventListener('click', () => this.zoomOut());
    controls.querySelector('#zoom-fit').addEventListener('click', () => this.fitToScreen());

    this.container.appendChild(controls);
  }

  zoomIn() {
    this.svg.transition().duration(200).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut() {
    this.svg.transition().duration(200).call(this.zoom.scaleBy, 0.7);
  }

  fitToScreen() {
    if (this.nodes.length === 0) {
      // No nodes, reset to identity
      this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
      return;
    }

    // Calculate bounding box of all nodes
    const padding = 50;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      const w = node.width || 150;
      const h = node.height || 60;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + w);
      maxY = Math.max(maxY, node.y + h);
    });

    // Add padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Calculate scale and translation to fit
    const svgRect = this.svg.node().getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const scale = Math.min(
      svgWidth / contentWidth,
      svgHeight / contentHeight,
      2 // Max scale of 2 to prevent too much zoom
    );

    const translateX = (svgWidth - contentWidth * scale) / 2 - minX * scale;
    const translateY = (svgHeight - contentHeight * scale) / 2 - minY * scale;

    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    this.svg.transition().duration(300).call(this.zoom.transform, transform);
  }

  setupKeyboardNavigation() {
    this.container.addEventListener('keydown', (e) => {
      if (!this.selectedNode) return;

      const currentIndex = this.nodes.findIndex(n => n.id === this.selectedNode.id);
      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          newIndex = Math.min(currentIndex + 1, this.nodes.length - 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          newIndex = Math.max(currentIndex - 1, 0);
          e.preventDefault();
          break;
        case 'Enter':
        case ' ':
          this.onNodeSelect(this.selectedNode);
          e.preventDefault();
          break;
        case 'Escape':
          this.clearConnectionSelection();
          this.clearSelection();
          e.preventDefault();
          break;
      }

      if (newIndex !== currentIndex && this.nodes[newIndex]) {
        this.selectNode(this.nodes[newIndex]);
      }
    });
  }

  async load(bibmapId) {
    this.bibmapId = bibmapId;
    const bibmap = await api.bibmaps.get(bibmapId);
    this.nodes = bibmap.nodes || [];
    this.connections = bibmap.connections || [];
    this.render();
    this.updateScreenReaderList();
    // Setup zoom controls if not already done
    if (!this.zoomControlsSetup) {
      this.setupZoomControls();
      this.zoomControlsSetup = true;
    }
    return bibmap;
  }

  render() {
    this.renderConnections();
    this.renderNodes();
  }

  ensureArrowMarker(lineWidth, color, isStart = false) {
    // Create a unique marker for each line width, color, and direction combination
    const suffix = isStart ? '-start' : '';
    const markerId = `arrowhead-${lineWidth}-${color.replace('#', '')}${suffix}`;
    const defs = this.svg.select('defs');

    // Check if marker already exists
    if (defs.select(`#${markerId}`).empty()) {
      // Scale marker size based on line width
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
        // Reversed arrow pointing backward
        marker.append('polygon')
          .attr('points', `${markerWidth} 0, 0 ${refY}, ${markerWidth} ${markerHeight}`)
          .attr('fill', color);
      } else {
        // Normal arrow pointing forward
        marker.append('polygon')
          .attr('points', `0 0, ${markerWidth} ${refY}, 0 ${markerHeight}`)
          .attr('fill', color);
      }
    }

    return `url(#${markerId})`;
  }

  renderConnections() {
    // Render connection groups (path + label)
    const connectionGroups = this.connectionsLayer.selectAll('.connection-group')
      .data(this.connections, d => d.id);

    connectionGroups.exit().remove();

    const groupsEnter = connectionGroups.enter()
      .append('g')
      .attr('class', 'connection-group');

    groupsEnter.append('path')
      .attr('class', 'connection-line');

    groupsEnter.append('text')
      .attr('class', 'connection-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#374151')
      .attr('font-size', '12')
      .attr('pointer-events', 'none');

    const allGroups = connectionGroups.merge(groupsEnter);
    const self = this;

    allGroups.select('.connection-line')
      .attr('d', d => this.calculateConnectionPath(d))
      .attr('stroke', d => d.line_color || '#6B7280')
      .attr('stroke-width', d => d.line_width || 4)
      .attr('stroke-dasharray', d => {
        if (d.line_style === 'dashed') return '8,4';
        if (d.line_style === 'dotted') return '2,2';
        return null;
      })
      .attr('marker-end', function(d) {
        if (d.arrow_type === 'none') return null;
        const lineWidth = d.line_width || 4;
        const color = d.line_color || '#6B7280';
        return self.ensureArrowMarker(lineWidth, color, false);
      })
      .attr('marker-start', function(d) {
        if (d.arrow_type !== 'both') return null;
        const lineWidth = d.line_width || 4;
        const color = d.line_color || '#6B7280';
        return self.ensureArrowMarker(lineWidth, color, true);
      })
      .attr('fill', 'none')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectConnection(d, event);
      });

    // Update connection labels
    allGroups.select('.connection-label')
      .attr('x', d => this.getConnectionMidpoint(d).x)
      .attr('y', d => this.getConnectionMidpoint(d).y - 10)
      .text(d => (d.show_label && d.label) ? d.label : '')
      .attr('visibility', d => (d.show_label && d.label) ? 'visible' : 'hidden');
  }

  getConnectionMidpoint(connection) {
    const source = this.nodes.find(n => n.id === connection.source_node_id);
    const target = this.nodes.find(n => n.id === connection.target_node_id);

    if (!source || !target) return { x: 0, y: 0 };

    const sx = source.x + (source.width || 150) / 2;
    const sy = source.y + (source.height || 60) / 2;
    const tx = target.x + (target.width || 150) / 2;
    const ty = target.y + (target.height || 60) / 2;

    return {
      x: (sx + tx) / 2,
      y: (sy + ty) / 2
    };
  }

  calculateConnectionPath(connection) {
    const source = this.nodes.find(n => n.id === connection.source_node_id);
    const target = this.nodes.find(n => n.id === connection.target_node_id);

    if (!source || !target) return '';

    const sx = source.x + (source.width || 150) / 2;
    const sy = source.y + (source.height || 60) / 2;
    const tx = target.x + (target.width || 150) / 2;
    const ty = target.y + (target.height || 60) / 2;

    let sourceEdge, targetEdge;

    // Use stored attachment points if available, otherwise calculate automatically
    if (connection.target_attach_x != null && connection.target_attach_y != null) {
      // Target attachment point is stored relative to target node position
      const targetPoint = {
        x: target.x + connection.target_attach_x,
        y: target.y + connection.target_attach_y
      };

      // Calculate source edge point based on direction to target attachment point
      const angleToTarget = Math.atan2(targetPoint.y - sy, targetPoint.x - sx);
      sourceEdge = this.getEdgePoint(source, angleToTarget);

      // Clamp target point to edge of target node
      targetEdge = this.clampToNodeEdge(target, targetPoint);
    } else {
      // Auto-calculate: use center-to-center direction
      const angle = Math.atan2(ty - sy, tx - sx);
      sourceEdge = this.getEdgePoint(source, angle);
      targetEdge = this.getEdgePoint(target, angle + Math.PI);
    }

    // Use stored source attachment point if available
    if (connection.source_attach_x != null && connection.source_attach_y != null) {
      const sourcePoint = {
        x: source.x + connection.source_attach_x,
        y: source.y + connection.source_attach_y
      };
      sourceEdge = this.clampToNodeEdge(source, sourcePoint);
    }

    return `M ${sourceEdge.x} ${sourceEdge.y} L ${targetEdge.x} ${targetEdge.y}`;
  }

  // Clamp a point to the edge of a node (finds the closest point on the edge)
  clampToNodeEdge(node, point) {
    const cx = node.x + (node.width || 150) / 2;
    const cy = node.y + (node.height || 60) / 2;

    // Calculate angle from center to the point
    const angle = Math.atan2(point.y - cy, point.x - cx);

    // Get the edge point at this angle
    return this.getEdgePoint(node, angle);
  }

  getEdgePoint(node, angle) {
    const cx = node.x + (node.width || 150) / 2;
    const cy = node.y + (node.height || 60) / 2;
    const w = (node.width || 150) / 2;
    const h = (node.height || 60) / 2;
    const shape = node.shape || 'rectangle';

    let x, y;

    switch (shape) {
      case 'ellipse': {
        // For ellipse, use parametric equation
        x = cx + w * Math.cos(angle);
        y = cy + h * Math.sin(angle);
        break;
      }
      case 'diamond': {
        // For diamond, find intersection with edge
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // Diamond edges are at 45 degrees
        if (Math.abs(cosA) * h > Math.abs(sinA) * w) {
          // Hit left or right edge
          const t = w / Math.abs(cosA);
          x = cx + t * cosA;
          y = cy + t * sinA;
        } else {
          // Hit top or bottom edge
          const t = h / Math.abs(sinA);
          x = cx + t * cosA;
          y = cy + t * sinA;
        }
        break;
      }
      case 'rounded-rectangle':
      case 'rectangle':
      default: {
        // Rectangle edge calculation (same for both rectangle types)
        const tanAngle = Math.tan(angle);
        if (Math.abs(Math.cos(angle)) * h > Math.abs(Math.sin(angle)) * w) {
          x = cx + (Math.cos(angle) > 0 ? w : -w);
          y = cy + (Math.cos(angle) > 0 ? w : -w) * tanAngle;
        } else {
          y = cy + (Math.sin(angle) > 0 ? h : -h);
          x = cx + (Math.sin(angle) > 0 ? h : -h) / tanAngle;
        }
        break;
      }
    }

    return { x, y };
  }

  getShapePath(node) {
    const w = node.width || 150;
    const h = node.height || 60;
    const shape = node.shape || 'rectangle';

    switch (shape) {
      case 'ellipse': {
        // SVG path for ellipse using bezier curves
        const cx = w / 2;
        const cy = h / 2;
        const rx = w / 2;
        const ry = h / 2;
        // Approximate ellipse with bezier curves
        const kappa = 0.5522848;
        const ox = rx * kappa;
        const oy = ry * kappa;
        return `M ${cx - rx} ${cy}
                C ${cx - rx} ${cy - oy}, ${cx - ox} ${cy - ry}, ${cx} ${cy - ry}
                C ${cx + ox} ${cy - ry}, ${cx + rx} ${cy - oy}, ${cx + rx} ${cy}
                C ${cx + rx} ${cy + oy}, ${cx + ox} ${cy + ry}, ${cx} ${cy + ry}
                C ${cx - ox} ${cy + ry}, ${cx - rx} ${cy + oy}, ${cx - rx} ${cy}
                Z`;
      }
      case 'diamond': {
        // Diamond/rhombus shape
        const cx = w / 2;
        const cy = h / 2;
        return `M ${cx} 0 L ${w} ${cy} L ${cx} ${h} L 0 ${cy} Z`;
      }
      case 'rounded-rectangle': {
        // Rounded rectangle with larger corner radius
        const r = Math.min(16, w / 4, h / 4); // larger radius, but proportional to size
        return `M ${r} 0
                L ${w - r} 0
                Q ${w} 0, ${w} ${r}
                L ${w} ${h - r}
                Q ${w} ${h}, ${w - r} ${h}
                L ${r} ${h}
                Q 0 ${h}, 0 ${h - r}
                L 0 ${r}
                Q 0 0, ${r} 0
                Z`;
      }
      case 'rectangle':
      default: {
        // Sharp rectangle (no rounded corners)
        return `M 0 0
                L ${w} 0
                L ${w} ${h}
                L 0 ${h}
                Z`;
      }
    }
  }

  getNodeFill(node) {
    const style = node.node_style || 'flat';
    const bgColor = node.background_color || this.defaultNodeColor;

    if (style === 'outline') {
      return 'none';
    }
    return bgColor;
  }

  getNodeStroke(node) {
    const style = node.node_style || 'flat';
    const bgColor = node.background_color || this.defaultNodeColor;
    const borderColor = node.border_color || '#1E40AF';

    if (style === 'outline') {
      return bgColor;
    }
    return borderColor;
  }

  getNodeStrokeWidth(node) {
    const style = node.node_style || 'flat';

    if (style === 'outline') {
      return 3;
    }
    return 2;
  }

  getNodeFilter(node) {
    const style = node.node_style || 'flat';

    // Ensure filter definitions exist
    this.ensureNodeStyleFilters();

    switch (style) {
      case 'bevel':
        return 'url(#bevel-filter)';
      case 'emboss':
        return 'url(#emboss-filter)';
      default:
        return null;
    }
  }

  ensureNodeStyleFilters() {
    const defs = this.svg.select('defs');

    // Bevel filter - 3D raised effect with drop shadow
    if (defs.select('#bevel-filter').empty()) {
      const bevelFilter = defs.append('filter')
        .attr('id', 'bevel-filter')
        .attr('x', '-20%')
        .attr('y', '-20%')
        .attr('width', '140%')
        .attr('height', '140%');

      // Drop shadow
      bevelFilter.append('feDropShadow')
        .attr('dx', '3')
        .attr('dy', '3')
        .attr('stdDeviation', '2')
        .attr('flood-color', '#000000')
        .attr('flood-opacity', '0.4');
    }

    // Emboss filter - inner highlight/shadow effect that preserves background color
    if (defs.select('#emboss-filter').empty()) {
      const embossFilter = defs.append('filter')
        .attr('id', 'emboss-filter')
        .attr('x', '-20%')
        .attr('y', '-20%')
        .attr('width', '140%')
        .attr('height', '140%');

      // Inner shadow (bottom-right)
      embossFilter.append('feOffset')
        .attr('in', 'SourceAlpha')
        .attr('dx', '2')
        .attr('dy', '2')
        .attr('result', 'shadowOffset');

      embossFilter.append('feGaussianBlur')
        .attr('in', 'shadowOffset')
        .attr('stdDeviation', '1')
        .attr('result', 'shadowBlur');

      embossFilter.append('feComposite')
        .attr('in', 'shadowBlur')
        .attr('in2', 'SourceAlpha')
        .attr('operator', 'arithmetic')
        .attr('k2', '-1')
        .attr('k3', '1')
        .attr('result', 'shadowDiff');

      embossFilter.append('feFlood')
        .attr('flood-color', '#000000')
        .attr('flood-opacity', '0.5');

      embossFilter.append('feComposite')
        .attr('in2', 'shadowDiff')
        .attr('operator', 'in')
        .attr('result', 'innerShadow');

      // Inner highlight (top-left)
      embossFilter.append('feOffset')
        .attr('in', 'SourceAlpha')
        .attr('dx', '-2')
        .attr('dy', '-2')
        .attr('result', 'highlightOffset');

      embossFilter.append('feGaussianBlur')
        .attr('in', 'highlightOffset')
        .attr('stdDeviation', '1')
        .attr('result', 'highlightBlur');

      embossFilter.append('feComposite')
        .attr('in', 'highlightBlur')
        .attr('in2', 'SourceAlpha')
        .attr('operator', 'arithmetic')
        .attr('k2', '-1')
        .attr('k3', '1')
        .attr('result', 'highlightDiff');

      embossFilter.append('feFlood')
        .attr('flood-color', '#ffffff')
        .attr('flood-opacity', '0.4');

      embossFilter.append('feComposite')
        .attr('in2', 'highlightDiff')
        .attr('operator', 'in')
        .attr('result', 'innerHighlight');

      // Combine: original + inner shadow + inner highlight
      const embossMerge = embossFilter.append('feMerge');
      embossMerge.append('feMergeNode').attr('in', 'SourceGraphic');
      embossMerge.append('feMergeNode').attr('in', 'innerShadow');
      embossMerge.append('feMergeNode').attr('in', 'innerHighlight');
    }
  }

  showDescriptionCallout(node, event) {
    // Remove any existing callout
    this.hideDescriptionCallout();

    // Get the node's position in screen coordinates
    const nodeGroup = this.nodesLayer.select(`.node-group[aria-label="Node: ${node.label}${node.taxonomies?.length ? `, Tags: ${node.taxonomies.map(t => t.name).join(', ')}` : ''}"]`);
    const transform = this.nodesLayer.attr('transform');

    // Calculate position relative to the container
    const containerRect = this.container.getBoundingClientRect();
    const nodeX = node.x + (node.width || 150) - 12;
    const nodeY = node.y + 12;

    // Parse any zoom transform
    let scale = 1, translateX = 0, translateY = 0;
    if (transform) {
      const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([-\d.]+)\)/);
      if (match) {
        translateX = parseFloat(match[1]);
        translateY = parseFloat(match[2]);
        scale = parseFloat(match[3]);
      } else {
        const translateMatch = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (translateMatch) {
          translateX = parseFloat(translateMatch[1]);
          translateY = parseFloat(translateMatch[2]);
        }
        const scaleMatch = transform.match(/scale\(([-\d.]+)\)/);
        if (scaleMatch) {
          scale = parseFloat(scaleMatch[1]);
        }
      }
    }

    const screenX = nodeX * scale + translateX;
    const screenY = nodeY * scale + translateY;

    // Create callout element
    const callout = document.createElement('div');
    callout.id = 'description-callout';
    callout.className = 'description-callout';
    callout.innerHTML = `
      <div class="callout-content">${this.escapeHtml(node.description)}</div>
      <button class="callout-close" aria-label="Close">&times;</button>
    `;

    // Position the callout
    callout.style.position = 'absolute';
    callout.style.left = `${screenX + 20}px`;
    callout.style.top = `${screenY}px`;
    callout.style.maxWidth = '250px';
    callout.style.padding = '0.75rem';
    callout.style.background = '#1F2937';
    callout.style.color = '#F9FAFB';
    callout.style.borderRadius = '8px';
    callout.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    callout.style.fontSize = '0.875rem';
    callout.style.lineHeight = '1.4';
    callout.style.zIndex = '1000';
    callout.style.whiteSpace = 'pre-wrap';

    // Add close button styling
    const closeBtn = callout.querySelector('.callout-close');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '4px';
    closeBtn.style.right = '8px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#9CA3AF';
    closeBtn.style.fontSize = '1.25rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.lineHeight = '1';

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideDescriptionCallout();
    });

    // Add to container
    this.container.appendChild(callout);

    // Close when clicking outside
    this._calloutClickHandler = (e) => {
      if (!callout.contains(e.target)) {
        this.hideDescriptionCallout();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this._calloutClickHandler);
    }, 0);
  }

  hideDescriptionCallout() {
    const callout = document.getElementById('description-callout');
    if (callout) {
      callout.remove();
    }
    if (this._calloutClickHandler) {
      document.removeEventListener('click', this._calloutClickHandler);
      this._calloutClickHandler = null;
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderNodes() {
    const self = this;

    const nodeGroups = this.nodesLayer.selectAll('.node-group')
      .data(this.nodes, d => d.id);

    nodeGroups.exit().remove();

    const nodeEnter = nodeGroups.enter()
      .append('g')
      .attr('class', 'node-group')
      .attr('tabindex', '0')
      .attr('role', 'button')
      .attr('aria-label', d => `Node: ${d.label}`)
      .call(d3.drag()
        .on('start', function(event, d) {
          if (self.connectMode || self.deleteMode || self.resizing) return;
          d3.select(this).raise();
        })
        .on('drag', function(event, d) {
          if (self.connectMode || self.deleteMode || self.resizing) return;
          let newX = event.x;
          let newY = event.y;
          if (self.snapToGrid) {
            newX = Math.round(newX / self.gridSize) * self.gridSize;
            newY = Math.round(newY / self.gridSize) * self.gridSize;
          }
          d.x = newX;
          d.y = newY;
          d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);
          self.renderConnections();
        })
        .on('end', async function(event, d) {
          if (self.connectMode || self.deleteMode || self.resizing) return;
          try {
            await api.nodes.updatePosition(d.id, d.x, d.y);
          } catch (err) {
            console.error('Failed to save position:', err);
          }
        })
      );

    // Add shape element (will be replaced based on shape type)
    nodeEnter.append('path')
      .attr('class', 'node-shape');

    // Add foreignObject for text wrapping
    const fo = nodeEnter.append('foreignObject')
      .attr('class', 'node-label-container');

    fo.append('xhtml:div')
      .attr('class', 'node-label-wrapper');

    // Add info icon for nodes with descriptions (top-right corner)
    nodeEnter.append('circle')
      .attr('class', 'info-icon')
      .attr('r', 8)
      .attr('fill', '#6B7280')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .style('opacity', 0);

    nodeEnter.append('text')
      .attr('class', 'info-icon-text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', '10')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .style('opacity', 0)
      .text('i');

    // Add resize handle (bottom-right corner)
    nodeEnter.append('rect')
      .attr('class', 'resize-handle')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', '#3B82F6')
      .attr('stroke', '#1E40AF')
      .attr('stroke-width', 1)
      .attr('cursor', 'se-resize')
      .style('opacity', 0)
      .call(d3.drag()
        .on('start', function(event, d) {
          event.sourceEvent.stopPropagation();
          self.resizing = true;
          d._startWidth = d.width || 150;
          d._startHeight = d.height || 60;
          d._startX = event.x;
          d._startY = event.y;
        })
        .on('drag', function(event, d) {
          event.sourceEvent.stopPropagation();
          const dx = event.x - d._startX;
          const dy = event.y - d._startY;
          d.width = Math.max(self.minNodeWidth, d._startWidth + dx);
          d.height = Math.max(self.minNodeHeight, d._startHeight + dy);
          self.render();
        })
        .on('end', async function(event, d) {
          event.sourceEvent.stopPropagation();
          self.resizing = false;
          delete d._startWidth;
          delete d._startHeight;
          delete d._startX;
          delete d._startY;
          try {
            await api.nodes.updateSize(d.id, d.width, d.height);
            self.announce('Node resized.');
          } catch (err) {
            console.error('Failed to save size:', err);
          }
        })
      );

    // Merge and update all
    const allNodes = nodeGroups.merge(nodeEnter);

    allNodes
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('aria-label', d => `Node: ${d.label}${d.taxonomies?.length ? `, Tags: ${d.taxonomies.map(t => t.name).join(', ')}` : ''}`);

    allNodes.select('.node-shape')
      .attr('d', d => this.getShapePath(d))
      .attr('fill', d => this.getNodeFill(d))
      .attr('stroke', d => this.getNodeStroke(d))
      .attr('stroke-width', d => this.getNodeStrokeWidth(d))
      .attr('filter', d => this.getNodeFilter(d));

    // Update foreignObject dimensions
    allNodes.select('.node-label-container')
      .attr('x', 4)
      .attr('y', 4)
      .attr('width', d => (d.width || 150) - 8)
      .attr('height', d => (d.height || 60) - 8);

    // Update the text wrapper div
    allNodes.select('.node-label-wrapper')
      .style('width', d => `${(d.width || 150) - 8}px`)
      .style('height', d => `${(d.height || 60) - 8}px`)
      .style('color', d => d.text_color || this.defaultTextColor)
      .style('font-size', d => `${d.font_size || 14}px`)
      .style('font-family', d => d.font_family || 'system-ui')
      .style('font-weight', d => d.font_bold ? 'bold' : 'normal')
      .style('font-style', d => d.font_italic ? 'italic' : 'normal')
      .style('text-decoration', d => d.font_underline ? 'underline' : 'none')
      .style('overflow', 'hidden')
      .style('display', 'flex')
      .style('align-items', 'center')
      .style('justify-content', 'center')
      .style('text-align', 'center')
      .style('word-wrap', d => d.wrap_text !== false ? 'break-word' : 'normal')
      .style('overflow-wrap', d => d.wrap_text !== false ? 'break-word' : 'normal')
      .style('white-space', d => d.wrap_text !== false ? 'normal' : 'nowrap')
      .style('text-overflow', d => d.wrap_text !== false ? 'clip' : 'ellipsis')
      .style('line-height', '1.2')
      .style('padding', '2px')
      .style('box-sizing', 'border-box')
      .text(d => d.label);

    // Position resize handle at bottom-right corner
    allNodes.select('.resize-handle')
      .attr('x', d => (d.width || 150) - 10)
      .attr('y', d => (d.height || 60) - 10)
      .style('opacity', d => this.selectedNode && this.selectedNode.id === d.id ? 1 : 0);

    // Position and show info icon for nodes with descriptions
    allNodes.select('.info-icon')
      .attr('cx', d => (d.width || 150) - 12)
      .attr('cy', 12)
      .style('opacity', d => d.description ? 1 : 0)
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.description) {
          this.showDescriptionCallout(d, event);
        }
      });

    allNodes.select('.info-icon-text')
      .attr('x', d => (d.width || 150) - 12)
      .attr('y', 12)
      .style('opacity', d => d.description ? 1 : 0);

    // Event handlers
    allNodes
      .on('click', (event, d) => {
        event.stopPropagation();
        this.clearConnectionSelection();
        if (this.connectMode) {
          this.handleConnectClick(d);
        } else {
          this.selectNode(d);
          this.onNodeSelect(d);
        }
      })
      .on('focus', (event, d) => {
        this.selectNode(d);
      });
  }

  truncateLabel(label, width) {
    const maxChars = Math.floor(width / 10);
    if (label.length <= maxChars) return label;
    return label.substring(0, maxChars - 2) + '...';
  }

  selectNode(node) {
    this.selectedNode = node;
    this.nodesLayer.selectAll('.node-group')
      .classed('selected', d => d.id === node.id);
    // Update resize handle visibility
    this.nodesLayer.selectAll('.resize-handle')
      .style('opacity', d => d.id === node.id ? 1 : 0);
    this.announce(`Selected node: ${node.label}`);
  }

  clearSelection() {
    this.selectedNode = null;
    this.connectSourceNode = null;
    this.nodesLayer.selectAll('.node-group').classed('selected', false);
    // Hide all resize handles
    this.nodesLayer.selectAll('.resize-handle').style('opacity', 0);
    // Hide any open callout
    this.hideDescriptionCallout();
  }

  setConnectMode(enabled) {
    this.connectMode = enabled;
    this.connectSourceNode = null;
    this.clearConnectionSelection();
    if (enabled) {
      this.announce('Connect mode enabled. Click a node to start connection.');
    }
  }

  startDragConnection(enabled) {
    if (enabled && this.selectedNode) {
      this.dragConnecting = true;
      this.connectSourceNode = this.selectedNode;
      this.dragLine = null;
      this.setupDragConnectionHandlers();
      this.announce(`Drag from ${this.selectedNode.label} to another node to connect.`);
    } else {
      this.cancelDragConnection();
    }
  }

  setupDragConnectionHandlers() {
    const self = this;
    const sourceNode = this.connectSourceNode;

    // Calculate source center
    const sx = sourceNode.x + (sourceNode.width || 150) / 2;
    const sy = sourceNode.y + (sourceNode.height || 60) / 2;

    // Track the last mouse position for calculating attachment point
    this.lastDragMousePos = { x: sx, y: sy };

    // Create temporary drag line
    this.dragLine = this.connectionsLayer.append('path')
      .attr('class', 'drag-connection-line')
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrowhead)')
      .attr('d', `M ${sx} ${sy} L ${sx} ${sy}`);

    // Mouse move handler
    this.svg.on('mousemove.dragconnect', function(event) {
      if (!self.dragConnecting || !self.dragLine) return;

      const [mx, my] = d3.pointer(event, self.nodesLayer.node());
      self.lastDragMousePos = { x: mx, y: my };
      self.dragLine.attr('d', `M ${sx} ${sy} L ${mx} ${my}`);
    });

    // Click on node to complete connection
    this.nodesLayer.selectAll('.node-group').on('click.dragconnect', function(event, d) {
      if (!self.dragConnecting) return;
      event.stopPropagation();

      if (d.id !== sourceNode.id) {
        // Calculate attachment point relative to target node position
        const targetAttachX = self.lastDragMousePos.x - d.x;
        const targetAttachY = self.lastDragMousePos.y - d.y;

        self.createConnectionWithAttachment(sourceNode.id, d.id, targetAttachX, targetAttachY);
      }
      self.cancelDragConnection();
    });

    // Click on canvas to cancel
    this.svg.on('click.dragconnect', function(event) {
      if (event.target === self.svg.node()) {
        self.cancelDragConnection();
      }
    });

    // Escape to cancel
    document.addEventListener('keydown', this.dragConnectionEscHandler = (e) => {
      if (e.key === 'Escape') {
        self.cancelDragConnection();
      }
    });
  }

  cancelDragConnection() {
    this.dragConnecting = false;
    this.connectSourceNode = null;

    if (this.dragLine) {
      this.dragLine.remove();
      this.dragLine = null;
    }

    // Remove temporary event handlers
    this.svg.on('mousemove.dragconnect', null);
    this.svg.on('click.dragconnect', null);
    this.nodesLayer.selectAll('.node-group').on('click.dragconnect', null);

    if (this.dragConnectionEscHandler) {
      document.removeEventListener('keydown', this.dragConnectionEscHandler);
      this.dragConnectionEscHandler = null;
    }

    // Reset button state
    const connectBtn = document.getElementById('connect-mode');
    if (connectBtn) {
      connectBtn.setAttribute('aria-pressed', 'false');
    }
  }

  selectConnection(connection, event) {
    this.selectedConnection = connection;
    this.clearSelection();

    this.onConnectionSelect(connection);
    this.announce(`Selected connection. Click delete to remove.`);
  }

  clearConnectionSelection() {
    this.selectedConnection = null;
    this.onConnectionSelect(null);
  }

  handleConnectClick(node) {
    if (!this.connectSourceNode) {
      this.connectSourceNode = node;
      this.selectNode(node);
      this.announce(`Connection started from ${node.label}. Click another node to connect.`);
    } else if (this.connectSourceNode.id !== node.id) {
      this.createConnection(this.connectSourceNode.id, node.id);
      this.connectSourceNode = null;
      this.clearSelection();
    }
  }

  async createConnection(sourceId, targetId) {
    try {
      const connection = await api.connections.create({
        bibmap_id: this.bibmapId,
        source_node_id: sourceId,
        target_node_id: targetId
      });
      this.connections.push(connection);
      this.renderConnections();
      this.announce('Connection created.');
    } catch (err) {
      this.announce(`Error: ${err.message}`);
    }
  }

  async createConnectionWithAttachment(sourceId, targetId, targetAttachX, targetAttachY) {
    try {
      const connection = await api.connections.create({
        bibmap_id: this.bibmapId,
        source_node_id: sourceId,
        target_node_id: targetId,
        target_attach_x: targetAttachX,
        target_attach_y: targetAttachY
      });
      this.connections.push(connection);
      this.renderConnections();
      this.announce('Connection created.');
    } catch (err) {
      this.announce(`Error: ${err.message}`);
    }
  }

  async deleteConnection(connectionId) {
    try {
      await api.connections.delete(connectionId);
      this.connections = this.connections.filter(c => c.id !== connectionId);
      this.renderConnections();
      this.announce('Connection deleted.');
    } catch (err) {
      this.announce(`Error: ${err.message}`);
    }
  }

  async updateConnection(connectionId, data) {
    try {
      const updated = await api.connections.update(connectionId, data);
      const index = this.connections.findIndex(c => c.id === connectionId);
      if (index >= 0) {
        this.connections[index] = updated;
      }
      this.renderConnections();
      return updated;
    } catch (err) {
      this.announce(`Error: ${err.message}`);
      throw err;
    }
  }

  async addNode(x = 100, y = 100) {
    try {
      const node = await api.nodes.create({
        bibmap_id: this.bibmapId,
        label: 'New Node',
        x: x,
        y: y,
        background_color: this.defaultNodeColor,
        text_color: this.defaultTextColor
      });
      this.nodes.push(node);
      this.render();
      this.updateScreenReaderList();
      this.selectNode(node);
      this.announce('New node created. Press Enter to edit properties.');
      return node;
    } catch (err) {
      this.announce(`Error: ${err.message}`);
      throw err;
    }
  }

  async updateNode(nodeId, data) {
    try {
      const updated = await api.nodes.update(nodeId, data);
      const index = this.nodes.findIndex(n => n.id === nodeId);
      if (index >= 0) {
        // Merge the update response with the sent data to preserve properties
        // that the backend may not persist yet (like node_style)
        this.nodes[index] = { ...this.nodes[index], ...updated, ...data };
      }
      this.render();
      this.updateScreenReaderList();
      this.announce('Node updated.');
      return this.nodes[index];
    } catch (err) {
      this.announce(`Error: ${err.message}`);
      throw err;
    }
  }

  async deleteNode(nodeId) {
    try {
      await api.nodes.delete(nodeId);
      this.nodes = this.nodes.filter(n => n.id !== nodeId);
      this.connections = this.connections.filter(
        c => c.source_node_id !== nodeId && c.target_node_id !== nodeId
      );
      this.render();
      this.updateScreenReaderList();
      this.clearSelection();
      this.announce('Node deleted.');
    } catch (err) {
      this.announce(`Error: ${err.message}`);
    }
  }

  async duplicateNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    try {
      const newNode = await api.nodes.create({
        bibmap_id: this.bibmapId,
        label: `${node.label} (copy)`,
        description: node.description,
        x: node.x + 30,
        y: node.y + 30,
        background_color: node.background_color,
        text_color: node.text_color,
        border_color: node.border_color,
        font_size: node.font_size,
        font_family: node.font_family,
        font_bold: node.font_bold,
        font_italic: node.font_italic,
        font_underline: node.font_underline,
        width: node.width,
        height: node.height,
        shape: node.shape,
        node_style: node.node_style,
        link_to_references: node.link_to_references,
        wrap_text: node.wrap_text,
        taxonomy_ids: node.taxonomies?.map(t => t.id) || []
      });
      this.nodes.push(newNode);
      this.render();
      this.updateScreenReaderList();
      this.selectNode(newNode);
      this.announce('Node duplicated.');
      return newNode;
    } catch (err) {
      this.announce(`Error: ${err.message}`);
      throw err;
    }
  }

  async duplicateConnection(connectionId) {
    const conn = this.connections.find(c => c.id === connectionId);
    if (!conn) return null;

    try {
      const newConn = await api.connections.create({
        bibmap_id: this.bibmapId,
        source_node_id: conn.source_node_id,
        target_node_id: conn.target_node_id,
        line_color: conn.line_color,
        line_width: conn.line_width,
        line_style: conn.line_style,
        arrow_type: conn.arrow_type,
        label: conn.label ? `${conn.label} (copy)` : null,
        show_label: conn.show_label
      });
      this.connections.push(newConn);
      this.renderConnections();
      this.announce('Connection duplicated.');
      return newConn;
    } catch (err) {
      this.announce(`Error: ${err.message}`);
      throw err;
    }
  }

  getConnectionById(id) {
    return this.connections.find(c => c.id === id);
  }

  setDefaultColors(bgColor, textColor) {
    this.defaultNodeColor = bgColor;
    this.defaultTextColor = textColor;
  }

  updateScreenReaderList() {
    if (!this.srNodeList) return;

    this.srNodeList.innerHTML = this.nodes.map(node => `
      <div role="listitem">
        ${node.label}
        ${node.taxonomies?.length ? `(Tags: ${node.taxonomies.map(t => t.name).join(', ')})` : ''}
      </div>
    `).join('');
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id);
  }

  setReadOnly(enabled) {
    this.readOnly = enabled;
    if (enabled) {
      // Disable all interactions
      this.connectMode = false;
      this.clearSelection();
      this.clearConnectionSelection();
      // Remove click handlers from nodes temporarily
      this.nodesLayer.selectAll('.node-group')
        .style('cursor', 'default')
        .on('click', null);
      this.connectionsLayer.selectAll('.connection-line')
        .style('cursor', 'default')
        .on('click', null);
    } else {
      // Re-render to restore all handlers
      this.render();
    }
  }
}
