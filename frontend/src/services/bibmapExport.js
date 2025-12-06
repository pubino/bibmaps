/**
 * BibMap Export Module
 *
 * Handles the creation of .bibmap export files containing:
 * - bibmap.json: Map structure with nodes, connections, and properties
 * - references.bib: BibTeX content of linked references
 * - tag-mappings.json: Tag-to-reference mappings for re-import
 */

/**
 * Builds the bibmap.json data structure from a BibMap object
 * @param {Object} bibmap - The BibMap with nodes and connections
 * @returns {Object} The structured data for bibmap.json
 */
export function buildBibmapJson(bibmap) {
  // Get unique tag IDs from all nodes
  const nodeTagIds = new Set();
  bibmap.nodes.forEach(node => {
    if (node.taxonomies) {
      node.taxonomies.forEach(t => nodeTagIds.add(t.id));
    }
  });

  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    bibmap: {
      title: bibmap.title,
      description: bibmap.description,
      is_published: bibmap.is_published,
      settings_json: bibmap.settings_json,
      created_at: bibmap.created_at,
      updated_at: bibmap.updated_at
    },
    nodes: bibmap.nodes.map(node => ({
      id: node.id,
      label: node.label,
      description: node.description,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      background_color: node.background_color,
      text_color: node.text_color,
      border_color: node.border_color,
      font_size: node.font_size,
      font_family: node.font_family,
      font_bold: node.font_bold,
      font_italic: node.font_italic,
      font_underline: node.font_underline,
      shape: node.shape,
      link_to_references: node.link_to_references,
      tag_names: node.taxonomies?.map(t => t.name) || []
    })),
    connections: bibmap.connections.map(conn => ({
      id: conn.id,
      source_node_id: conn.source_node_id,
      target_node_id: conn.target_node_id,
      label: conn.label,
      show_label: conn.show_label,
      line_color: conn.line_color,
      line_width: conn.line_width,
      line_style: conn.line_style,
      arrow_type: conn.arrow_type
    })),
    tags: Array.from(nodeTagIds).map(tagId => {
      const tag = bibmap.nodes.flatMap(n => n.taxonomies || []).find(t => t.id === tagId);
      return tag ? { name: tag.name, color: tag.color, description: tag.description } : null;
    }).filter(Boolean)
  };
}

/**
 * Filters references that share tags with the BibMap's nodes
 * @param {Object} bibmap - The BibMap with nodes
 * @param {Array} allRefs - All available references
 * @returns {Array} References linked via shared tags
 */
export function getLinkedReferences(bibmap, allRefs) {
  const nodeTagIds = new Set();
  bibmap.nodes.forEach(node => {
    if (node.taxonomies) {
      node.taxonomies.forEach(t => nodeTagIds.add(t.id));
    }
  });

  return allRefs.filter(ref =>
    ref.taxonomies?.some(t => nodeTagIds.has(t.id))
  );
}

/**
 * Builds the BibTeX content from an array of references
 * @param {Array} references - Array of reference objects with raw_bibtex
 * @returns {string} Combined BibTeX content
 */
export function buildBibtexContent(references) {
  if (!references || references.length === 0) {
    return '% No references linked to this BibMap';
  }
  return references.map(ref => ref.raw_bibtex).join('\n\n');
}

/**
 * Builds the tag-mappings.json data structure
 * @param {Object} bibmap - The BibMap with nodes
 * @param {Array} linkedRefs - References linked to this BibMap
 * @returns {Object} The structured data for tag-mappings.json
 */
export function buildTagMappings(bibmap, linkedRefs) {
  const nodeTagIds = new Set();
  bibmap.nodes.forEach(node => {
    if (node.taxonomies) {
      node.taxonomies.forEach(t => nodeTagIds.add(t.id));
    }
  });

  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    tags: Array.from(nodeTagIds).map(tagId => {
      const tag = bibmap.nodes.flatMap(n => n.taxonomies || []).find(t => t.id === tagId);
      if (!tag) return null;
      return {
        name: tag.name,
        color: tag.color,
        description: tag.description,
        reference_keys: linkedRefs
          .filter(ref => ref.taxonomies?.some(t => t.id === tagId))
          .map(ref => ref.bibtex_key)
      };
    }).filter(Boolean)
  };
}

/**
 * Generates a safe filename from a BibMap title
 * @param {string} title - The BibMap title
 * @returns {string} Safe filename with .bibmap extension
 */
export function generateFilename(title) {
  return `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.bibmap`;
}

/**
 * Node property names that should be included in the export
 */
export const NODE_PROPERTIES = [
  'id',
  'label',
  'description',
  'x',
  'y',
  'width',
  'height',
  'background_color',
  'text_color',
  'border_color',
  'font_size',
  'font_family',
  'font_bold',
  'font_italic',
  'font_underline',
  'shape',
  'link_to_references',
  'tag_names'
];

/**
 * Connection property names that should be included in the export
 */
export const CONNECTION_PROPERTIES = [
  'id',
  'source_node_id',
  'target_node_id',
  'label',
  'show_label',
  'line_color',
  'line_width',
  'line_style',
  'arrow_type'
];

/**
 * BibMap properties that should be included in the export
 */
export const BIBMAP_PROPERTIES = [
  'title',
  'description',
  'is_published',
  'settings_json',
  'created_at',
  'updated_at'
];

/**
 * Tag properties that should be included in the export
 */
export const TAG_PROPERTIES = [
  'name',
  'color',
  'description'
];
