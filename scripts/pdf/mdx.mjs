import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import YAML from 'yaml';

/**
 * MDX -> plain HTML normalization for the PDF export.
 *
 * Pages are parsed into an mdast tree. Mintlify components (JSX) are rewritten
 * in place into plain semantic HTML by attaching `data.hName` /
 * `data.hProperties`, which remark-rehype honors. Component text is always
 * preserved; unknown components render their children and emit a warning.
 */

const CALLOUTS = {
  Note: 'note',
  Info: 'info',
  Warning: 'warning',
  Tip: 'tip',
  Check: 'check',
  Danger: 'danger',
  Callout: 'note',
};

// Capitalized components that are known containers or decorations.
const KNOWN_COMPONENTS = new Set([
  ...Object.keys(CALLOUTS),
  'Frame',
  'Card',
  'CardGroup',
  'Columns',
  'Accordion',
  'AccordionGroup',
  'Steps',
  'Step',
  'Tabs',
  'Tab',
  'CodeGroup',
  'ParamField',
  'ResponseField',
  'Expandable',
  'Update',
  'Tooltip',
  'Badge',
  'Icon',
]);

// Components whose text-level form is really a block (e.g. `<Note>text</Note>`
// on its own line parses as a paragraph holding a text-level element).
const BLOCK_COMPONENTS = new Set([
  ...Object.keys(CALLOUTS),
  'Frame',
  'Card',
  'CardGroup',
  'Columns',
  'Accordion',
  'AccordionGroup',
  'Steps',
  'Step',
  'Tabs',
  'Tab',
  'CodeGroup',
  'ParamField',
  'ResponseField',
  'Expandable',
  'Update',
]);

const PASS_THROUGH_ATTRS = {
  alt: 'alt',
  title: 'title',
  width: 'width',
  height: 'height',
  align: 'align',
  colspan: 'colSpan',
  colSpan: 'colSpan',
  rowspan: 'rowSpan',
  rowSpan: 'rowSpan',
  target: 'target',
  rel: 'rel',
  start: 'start',
  open: 'open',
};

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

export function pageIdForRoute(route) {
  return `page-${route.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function strictParser() {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkMdx);
}

function markdownParser() {
  return unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);
}

const htmlSerializer = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * Parse a page. Falls back to plain Markdown when strict MDX parsing fails so
 * the page text is never silently dropped.
 */
export function parsePage(source, { onWarning = () => {} } = {}) {
  let tree;
  let mode = 'mdx';
  try {
    const parser = strictParser();
    tree = parser.parse(source);
  } catch (error) {
    mode = 'markdown-fallback';
    onWarning(`MDX parse failed (${String(error.message).split('\n')[0]}); rendered as plain Markdown`);
    tree = markdownParser().parse(source);
  }

  let frontmatter = {};
  const first = tree.children[0];
  if (first?.type === 'yaml') {
    try {
      frontmatter = YAML.parse(first.value) ?? {};
    } catch (error) {
      onWarning(`Invalid frontmatter (${error.message.split('\n')[0]})`);
    }
    tree.children.shift();
  }

  // A leading H1 duplicates the page title block; promote or drop it.
  const lead = tree.children[0];
  if (lead?.type === 'heading' && lead.depth === 1) {
    const leadText = toString(lead).trim();
    if (!frontmatter.title) frontmatter.title = leadText;
    if (leadText === String(frontmatter.title).trim()) tree.children.shift();
  }

  return { frontmatter, tree, mode };
}

/**
 * Assign page-scoped ids to headings and shift their depth below the page
 * title. Returns the set of heading slugs so links can be validated.
 */
export function prepareHeadings(tree, pageId) {
  const slugs = new Set();
  const counts = new Map();
  visit(tree, 'heading', (node) => {
    const base = slugify(toString(node)) || 'section';
    const seenCount = counts.get(base) ?? 0;
    counts.set(base, seenCount + 1);
    const slug = seenCount === 0 ? base : `${base}-${seenCount}`;
    slugs.add(slug);
    node.data = {
      ...node.data,
      hProperties: { ...node.data?.hProperties, id: `${pageId}--${slug}` },
    };
    node.depth = Math.min(6, node.depth + 1);
  });
  return slugs;
}

/* ------------------------------------------------------------------ */
/* Node helpers                                                        */
/* ------------------------------------------------------------------ */

const text = (value) => ({ type: 'text', value });

function wrap(tag, classes, children = [], props = {}) {
  const hProperties = { ...props };
  if (classes.length > 0) hProperties.className = classes;
  return { type: 'wrapper', data: { hName: tag, hProperties }, children };
}

function setElement(node, tag, classes = [], props = {}) {
  const hProperties = { ...props };
  if (classes.length > 0) hProperties.className = classes;
  node.data = { ...node.data, hName: tag, hProperties };
}

function stripQuotes(value) {
  const match = /^(["'`])([\s\S]*)\1$/.exec(value.trim());
  return match ? match[2] : value;
}

function readAttrs(node) {
  const out = {};
  for (const attr of node.attributes ?? []) {
    if (attr.type !== 'mdxJsxAttribute') continue;
    const value = attr.value;
    if (value === null || value === undefined) out[attr.name] = true;
    else if (typeof value === 'string') out[attr.name] = value;
    else out[attr.name] = stripQuotes(String(value.value ?? ''));
  }
  return out;
}

function isBlank(node) {
  return node.type === 'text' && node.value.trim() === '';
}

/* ------------------------------------------------------------------ */
/* Normalization passes                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {object} tree mdast tree from parsePage (headings already prepared).
 * @param {object} ctx
 * @param {(url: string) => string} ctx.resolveLink
 * @param {(src: string) => string | null} ctx.resolveImage
 * @param {(message: string) => void} ctx.warn
 */
export function normalizeTree(tree, ctx) {
  stripMdxOnlyNodes(tree, ctx);
  rewriteMarkdownUrls(tree, ctx);
  hoistBlockComponents(tree);
  convertJsx(tree, ctx);
}

function stripMdxOnlyNodes(tree, ctx) {
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return undefined;

    // Web-only styling/scripts: drop them with their (expression) children.
    if (
      (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
      (node.name === 'style' || node.name === 'script')
    ) {
      ctx.warn(`<${node.name}> element removed (not applicable to PDF output)`);
      parent.children.splice(index, 1);
      return [SKIP, index];
    }

    if (node.type === 'mdxjsEsm') {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }

    if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
      const value = String(node.value ?? '').trim();
      if (/^\/\*[\s\S]*\*\/$/.test(value) || value === '') {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      ctx.warn(`Expression {${value.slice(0, 40)}} rendered as literal text`);
      const literal = text(`{${value}}`);
      parent.children[index] = node.type === 'mdxFlowExpression' ? { type: 'paragraph', children: [literal] } : literal;
      return [SKIP, index + 1];
    }

    return undefined;
  });
}

function rewriteMarkdownUrls(tree, ctx) {
  visit(tree, (node, index, parent) => {
    if (node.type === 'link' || node.type === 'definition') {
      node.url = ctx.resolveLink(node.url);
    } else if (node.type === 'image') {
      const resolved = ctx.resolveImage(node.url);
      if (resolved) {
        node.url = resolved;
      } else if (parent && index !== undefined) {
        ctx.warn(`Image not found: ${node.url}`);
        parent.children[index] = text(`[image: ${node.alt || node.url}]`);
        return [SKIP, index + 1];
      }
    } else if (node.type === 'html') {
      // Only reachable in the plain Markdown fallback.
      node.value = node.value
        .replace(/\bsrc="([^"]+)"/g, (match, src) => {
          const resolved = ctx.resolveImage(src);
          return resolved ? `src="${resolved}"` : match;
        })
        .replace(/\bhref="([^"]+)"/g, (_match, href) => `href="${ctx.resolveLink(href)}"`);
    }
    return undefined;
  });
}

function isBlockTextComponent(node) {
  return node.type === 'mdxJsxTextElement' && BLOCK_COMPONENTS.has(node.name);
}

/**
 * `<Note>text</Note>` alone on a line parses as a paragraph that contains a
 * text-level element. Promote such elements to flow level so they become block
 * containers rather than inline spans inside a paragraph.
 */
function hoistBlockComponents(tree) {
  visit(tree, 'paragraph', (node, index, parent) => {
    if (!parent || index === undefined) return undefined;
    const meaningful = node.children.filter((child) => !isBlank(child));
    if (meaningful.length === 0 || !meaningful.every(isBlockTextComponent)) return undefined;
    for (const child of meaningful) child.type = 'mdxJsxFlowElement';
    parent.children.splice(index, 1, ...meaningful);
    return [SKIP, index];
  });
}

function convertJsx(tree, ctx) {
  visit(tree, (node, index, parent) => {
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return undefined;
    convertJsxNode(node, ctx);
    return undefined;
  });
}

function convertJsxNode(node, ctx) {
  const isFlow = node.type === 'mdxJsxFlowElement';
  const block = isFlow ? 'div' : 'span';
  const name = node.name;
  const attrs = readAttrs(node);

  if (name === null || name === undefined) {
    setElement(node, block);
    return;
  }

  if (/^[a-z]/.test(name)) {
    convertHtmlElement(node, name, attrs, ctx);
    return;
  }

  if (!KNOWN_COMPONENTS.has(name)) {
    ctx.warn(`Unknown component <${name}> rendered as a plain container`);
    setElement(node, block, ['component', `component-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`]);
    return;
  }

  if (CALLOUTS[name]) {
    setElement(node, block, ['callout', `callout-${CALLOUTS[name]}`]);
    const label = isFlow
      ? wrap('div', ['callout-label'], [text(name)])
      : wrap('strong', ['callout-label'], [text(`${name}: `)]);
    node.children.unshift(label);
    return;
  }

  switch (name) {
    case 'Frame': {
      setElement(node, isFlow ? 'figure' : 'span', ['frame']);
      if (typeof attrs.caption === 'string') {
        node.children.push(wrap(isFlow ? 'figcaption' : 'span', ['frame-caption'], [text(attrs.caption)]));
      }
      break;
    }
    case 'Card': {
      setElement(node, block, ['card']);
      if (typeof attrs.title === 'string') {
        const titleNode = typeof attrs.href === 'string'
          ? { type: 'link', url: ctx.resolveLink(attrs.href), children: [text(attrs.title)] }
          : text(attrs.title);
        node.children.unshift(wrap(block, ['card-title'], [wrap('strong', [], [titleNode])]));
      }
      break;
    }
    case 'CardGroup':
    case 'Columns': {
      setElement(node, block, ['card-group']);
      break;
    }
    case 'Accordion':
    case 'Expandable': {
      setElement(node, block, [name === 'Accordion' ? 'accordion' : 'expandable']);
      if (typeof attrs.title === 'string') {
        node.children.unshift(wrap(block, ['accordion-title'], [wrap('strong', [], [text(attrs.title)])]));
      }
      break;
    }
    case 'AccordionGroup': {
      setElement(node, block, ['accordion-group']);
      break;
    }
    case 'Steps': {
      setElement(node, isFlow ? 'ol' : 'span', ['steps']);
      break;
    }
    case 'Step': {
      setElement(node, isFlow ? 'li' : 'span', ['step']);
      if (typeof attrs.title === 'string') {
        node.children.unshift(wrap(block, ['step-title'], [wrap('strong', [], [text(attrs.title)])]));
      }
      break;
    }
    case 'Tabs': {
      setElement(node, block, ['tabs']);
      break;
    }
    case 'Tab': {
      setElement(node, block, ['tab']);
      if (typeof attrs.title === 'string') {
        node.children.unshift(wrap(block, ['tab-title'], [wrap('strong', [], [text(attrs.title)])]));
      }
      break;
    }
    case 'CodeGroup': {
      setElement(node, block, ['code-group']);
      labelCodeGroup(node);
      break;
    }
    case 'ParamField':
    case 'ResponseField': {
      setElement(node, block, ['param-field']);
      node.children.unshift(buildParamHead(name, attrs));
      break;
    }
    case 'Update': {
      setElement(node, block, ['update']);
      const label = [attrs.label, attrs.description].filter((v) => typeof v === 'string').join(' - ');
      if (label) node.children.unshift(wrap(block, ['update-title'], [wrap('strong', [], [text(label)])]));
      break;
    }
    case 'Tooltip': {
      setElement(node, 'span', ['tooltip']);
      break;
    }
    case 'Badge': {
      setElement(node, 'span', ['badge']);
      break;
    }
    case 'Icon': {
      setElement(node, 'span', ['icon']);
      node.children = [];
      break;
    }
    default: {
      setElement(node, block);
    }
  }
}

function labelCodeGroup(node) {
  const next = [];
  for (const child of node.children) {
    if (child.type === 'code' && child.meta) {
      next.push(wrap('div', ['code-label'], [wrap('strong', [], [text(child.meta.trim())])]));
    }
    next.push(child);
  }
  node.children = next;
}

function buildParamHead(componentName, attrs) {
  const name = attrs.path ?? attrs.body ?? attrs.query ?? attrs.header ?? attrs.name ?? '';
  const kind = ['path', 'body', 'query', 'header'].find((key) => typeof attrs[key] === 'string');
  const parts = [];
  if (name) parts.push({ type: 'inlineCode', value: String(name) });
  // `path` is used as a plain field label in the object docs, so only show real request locations.
  if (kind && kind !== 'path' && componentName === 'ParamField') parts.push(wrap('span', ['param-kind'], [text(` ${kind}`)]));
  if (typeof attrs.type === 'string') parts.push(wrap('span', ['param-type'], [text(` ${attrs.type}`)]));
  if (attrs.required === true || attrs.required === 'true') parts.push(wrap('span', ['param-flag'], [text(' required')]));
  if (attrs.deprecated === true || attrs.deprecated === 'true') {
    parts.push(wrap('span', ['param-flag'], [text(' deprecated')]));
  }
  if (typeof attrs.default === 'string') {
    parts.push(wrap('span', ['param-default'], [text(` default: ${attrs.default}`)]));
  }
  return wrap('div', ['param-head'], parts);
}

function convertHtmlElement(node, tag, attrs, ctx) {
  const props = {};
  const classes = [];

  for (const [key, value] of Object.entries(attrs)) {
    if (value === true) continue;
    if (key === 'className' || key === 'class') {
      classes.push(...String(value).split(/\s+/).filter(Boolean));
    } else if (PASS_THROUGH_ATTRS[key]) {
      props[PASS_THROUGH_ATTRS[key]] = String(value);
    }
  }

  switch (tag) {
    case 'img': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      const resolved = src ? ctx.resolveImage(src) : null;
      if (!resolved) {
        ctx.warn(`Image not found: ${src || '(missing src)'}`);
        setElement(node, 'span', ['missing-image']);
        node.children = [text(`[image: ${attrs.alt || src || 'missing'}]`)];
        return;
      }
      setElement(node, 'img', classes, { ...props, src: resolved });
      node.children = [];
      return;
    }
    case 'a': {
      const href = typeof attrs.href === 'string' ? attrs.href : '';
      setElement(node, 'a', classes, { ...props, ...(href ? { href: ctx.resolveLink(href) } : {}) });
      return;
    }
    case 'video':
    case 'iframe':
    case 'audio':
    case 'embed': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      ctx.warn(`<${tag}> cannot be embedded in a PDF; rendered as a link`);
      setElement(node, 'span', ['embed']);
      node.children = src
        ? [{ type: 'link', url: ctx.resolveLink(src), children: [text(`Embedded media: ${src}`)] }]
        : [];
      return;
    }
    default:
      setElement(node, tag, classes, props);
  }
}

/** Render a normalized mdast tree to an HTML string. */
export function renderHtml(tree) {
  const hast = htmlSerializer.runSync(tree);
  return htmlSerializer.stringify(hast);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}