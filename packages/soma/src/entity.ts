/**
 * Entity parsing and serialization.
 *
 * Entities are Markdown files with YAML frontmatter.
 * Relationships are wikilinks: `[[type/name]]`.
 *
 * @module
 */

import type { Entity } from './types.js';

const FRONTMATTER_DELIM = '---';
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Parse a Markdown file with YAML frontmatter into an Entity.
 */
export function parseEntity(content: string, defaults?: Partial<Entity>): Entity {
  const lines = content.split('\n');
  let frontmatter: Record<string, unknown> = {};
  let bodyStartLine = 0;

  // Parse YAML frontmatter
  if (lines[0]?.trim() === FRONTMATTER_DELIM) {
    const endIdx = lines.indexOf(FRONTMATTER_DELIM, 1);
    if (endIdx > 0) {
      const yamlLines = lines.slice(1, endIdx);
      frontmatter = parseSimpleYaml(yamlLines.join('\n'));
      bodyStartLine = endIdx + 1;
    }
  }

  const body = lines.slice(bodyStartLine).join('\n').trim();

  // Extract wikilinks from both frontmatter.related and body
  const fmRelated = Array.isArray(frontmatter.related) ? frontmatter.related as string[] : [];
  const bodyLinks = extractWikilinks(body);
  const allRelated = [...new Set([...fmRelated, ...bodyLinks])];

  const now = new Date().toISOString();

  const resolvedType = (frontmatter.type as string) ?? defaults?.type;
  if (!resolvedType) console.warn(`[Entity] Missing type in frontmatter and defaults, using 'untyped'`);

  return {
    ...frontmatter,
    type: resolvedType ?? 'untyped',
    id: (frontmatter.id as string) ?? defaults?.id ?? '',
    name: (frontmatter.name as string) ?? defaults?.name ?? '',
    status: (frontmatter.status as string) ?? defaults?.status ?? 'active',
    created: (frontmatter.created as string) ?? defaults?.created ?? now,
    updated: (frontmatter.updated as string) ?? defaults?.updated ?? now,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [],
    related: allRelated,
    body,
  };
}

/**
 * Serialize an Entity to Markdown with YAML frontmatter.
 */
export function serializeEntity(entity: Entity): string {
  const { body, ...fm } = entity;

  // Build YAML frontmatter
  const yamlLines: string[] = [FRONTMATTER_DELIM];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    if (key === 'body') continue;
    yamlLines.push(serializeYamlField(key, value));
  }
  yamlLines.push(FRONTMATTER_DELIM);

  return `${yamlLines.join('\n')}\n\n${body ?? ''}\n`;
}

/**
 * Extract all wikilinks from text.
 * `[[agent/my-agent]]` → `["agent/my-agent"]`
 */
export function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  // biome-ignore lint: regex exec loop
  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    if (match[1]) links.push(match[1]);
  }
  return [...new Set(links)];
}

// ---------------------------------------------------------------------------
// Simple YAML parser (no external deps)
// ---------------------------------------------------------------------------

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // JSON object (starts with { and ends with })
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        result[key] = JSON.parse(value);
      } catch {
        // Fall back to string if not valid JSON
        result[key] = value.replace(/^["']|["']$/g, '');
      }
      continue;
    }

    // Array (inline `[a, b, c]` or multi-line `- item`)
    if (value.startsWith('[') && value.endsWith(']')) {
      // Try JSON.parse first for arrays containing objects or complex values
      try {
        result[key] = JSON.parse(value);
      } catch {
        // Fall back to simple comma-split for plain string arrays
        result[key] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
    } else if (value === '') {
      // Check for multi-line array
      const items: string[] = [];
      while (i + 1 < lines.length && lines[i + 1]!.trimStart().startsWith('- ')) {
        i++;
        items.push(lines[i]!.trimStart().slice(2).trim());
      }
      if (items.length > 0) result[key] = items;
      else result[key] = '';
    } else if (value === 'true' || value === 'false') {
      result[key] = value === 'true';
    } else if (!Number.isNaN(Number(value)) && value !== '') {
      result[key] = Number(value);
    } else {
      // Strip quotes
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

function serializeYamlField(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    // Arrays containing objects should use JSON.stringify for the entire array
    if (value.some((v) => typeof v === 'object' && v !== null)) {
      return `${key}: ${JSON.stringify(value)}`;
    }
    if (value.length <= 5 && value.every((v) => typeof v === 'string' && v.length < 30)) {
      return `${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    return `${key}:\n${value.map((v) => `  - ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}`;
  }
  if (typeof value === 'object' && value !== null) {
    return `${key}: ${JSON.stringify(value)}`;
  }
  if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes('\n'))) {
    return `${key}: "${value.replace(/"/g, '\\"')}"`;
  }
  return `${key}: ${value}`;
}
