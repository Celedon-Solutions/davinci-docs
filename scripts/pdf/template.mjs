import { escapeHtml, pageIdForRoute } from './mdx.mjs';

/**
 * HTML document assembly for the PDF export: cover, table of contents, part
 * divider pages, and one section per documentation page.
 */

export const PRINT_CSS = `
@page { size: Letter; }
* { box-sizing: border-box; }
html { font-size: 10.5pt; }
body {
  margin: 0;
  color: #1f2328;
  font-family: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", "DejaVu Sans", sans-serif;
  line-height: 1.5;
  overflow-wrap: break-word;
}
a { color: #5b3fa8; text-decoration: none; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 12pt; }
h2 { font-size: 17pt; margin: 18pt 0 8pt; }
h3 { font-size: 13.5pt; margin: 16pt 0 6pt; }
h4 { font-size: 11.5pt; margin: 12pt 0 4pt; }
h5, h6 { font-size: 10.5pt; margin: 10pt 0 4pt; }
p { margin: 0 0 8pt; }
ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
li { margin: 0 0 3pt; }
img { max-width: 100%; max-height: 8.5in; height: auto; vertical-align: middle; }
figure, .frame { margin: 8pt 0 12pt; text-align: center; break-inside: avoid; page-break-inside: avoid; }
figcaption, .frame-caption { font-size: 9pt; color: #57606a; }
code {
  font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace;
  font-size: 0.88em;
  background: #f1f3f5;
  padding: 0.5pt 3pt;
  border-radius: 3pt;
}
pre {
  margin: 0 0 10pt;
  padding: 8pt 10pt;
  background: #f6f8fa;
  border: 0.5pt solid #d0d7de;
  border-radius: 4pt;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 8.5pt;
  line-height: 1.4;
}
pre code { background: none; padding: 0; font-size: inherit; }
blockquote { margin: 0 0 8pt; padding: 2pt 10pt; border-left: 3pt solid #d0d7de; color: #57606a; }
hr { border: 0; border-top: 0.5pt solid #d0d7de; margin: 12pt 0; }
table { width: 100%; border-collapse: collapse; margin: 0 0 12pt; font-size: 9pt; }
th, td { border: 0.5pt solid #d0d7de; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f6f8fa; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }

.callout { margin: 0 0 10pt; padding: 6pt 10pt; border-left: 3pt solid #8c959f; background: #f6f8fa; break-inside: avoid; page-break-inside: avoid; }
.callout > :last-child { margin-bottom: 0; }
.callout-label { font-weight: 700; font-size: 8.5pt; letter-spacing: 0.04em; text-transform: uppercase; color: #57606a; margin-bottom: 2pt; }
.callout-info { border-left-color: #0969da; }
.callout-note { border-left-color: #8250df; }
.callout-tip, .callout-check { border-left-color: #1a7f37; }
.callout-warning { border-left-color: #bf8700; background: #fff8e1; }
.callout-danger { border-left-color: #cf222e; background: #fff1f0; }

.card, .accordion, .expandable, .tab, .update {
  margin: 0 0 8pt; padding: 6pt 10pt; border: 0.5pt solid #d0d7de; border-radius: 4pt; break-inside: avoid; page-break-inside: avoid;
}
.card > :last-child, .accordion > :last-child, .tab > :last-child, .expandable > :last-child { margin-bottom: 0; }
.card-title, .accordion-title, .tab-title, .step-title, .update-title { margin-bottom: 3pt; }
.steps { padding-left: 20pt; }
.step { margin-bottom: 8pt; }
.code-label { font-size: 8.5pt; margin: 4pt 0 2pt; color: #57606a; }
.param-field { margin: 0 0 10pt; padding: 6pt 0 2pt; border-top: 0.5pt solid #d0d7de; }
.param-head { margin-bottom: 4pt; }
.param-type, .param-kind, .param-default { color: #57606a; font-size: 9pt; }
.param-flag { color: #cf222e; font-size: 9pt; font-weight: 600; }
.missing-image { color: #8c959f; font-style: italic; }
.hidden { display: none; }

.cover { min-height: 8.6in; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.cover img { height: 48pt; margin-bottom: 24pt; }
.cover h1 { font-size: 36pt; margin-bottom: 6pt; }
.cover .subtitle { font-size: 14pt; color: #57606a; margin-bottom: 4pt; }
.cover .meta { font-size: 10pt; color: #8c959f; }

.toc { break-before: page; page-break-before: always; }
.toc h1 { font-size: 22pt; }
.toc ul { list-style: none; padding-left: 0; margin: 0; }
.toc ul ul { padding-left: 14pt; }
.toc .toc-part { font-weight: 700; font-size: 11.5pt; margin-top: 10pt; }
.toc .toc-group { font-weight: 600; color: #57606a; margin-top: 4pt; }
.toc li { margin: 1.5pt 0; }

.part { break-before: page; page-break-before: always; }
.part ul { list-style: none; padding-left: 0; }
.part ul ul { padding-left: 14pt; }
.part .toc-group { font-weight: 600; color: #57606a; margin-top: 6pt; }
.part-intro { margin-top: 18pt; }

.page { break-before: page; page-break-before: always; }
.page-eyebrow { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #8c959f; margin-bottom: 2pt; }
.page-title { font-size: 22pt; margin: 0 0 4pt; }
.page-description { font-size: 11.5pt; color: #57606a; margin-bottom: 14pt; }
`;

function renderTocList(nodes, titles, { partClass = false } = {}) {
  const items = nodes
    .map((node) => {
      if (node.type === 'page') {
        const title = titles.get(node.route) ?? node.route;
        return `<li><a href="#${pageIdForRoute(node.route)}">${escapeHtml(title)}</a></li>`;
      }
      const nested = renderTocList(node.children, titles);
      return `<li class="${partClass ? 'toc-part' : 'toc-group'}">${escapeHtml(node.title)}${nested}</li>`;
    })
    .join('\n');
  return `<ul>\n${items}\n</ul>`;
}

function renderPartIntro(part, titles) {
  return `<ul>\n${part.children
    .map((node) => {
      if (node.type === 'page') {
        const title = titles.get(node.route) ?? node.route;
        return `<li><a href="#${pageIdForRoute(node.route)}">${escapeHtml(title)}</a></li>`;
      }
      return `<li class="toc-group">${escapeHtml(node.title)}${renderTocList(node.children, titles)}</li>`;
    })
    .join('\n')}\n</ul>`;
}

function renderPages(nodes, pageHtml, trail) {
  const out = [];
  for (const node of nodes) {
    if (node.type === 'page') {
      const rendered = pageHtml.get(node.route);
      if (rendered) out.push(renderPage(node, rendered, trail));
    } else {
      out.push(renderPages(node.children, pageHtml, [...trail, node.title]));
    }
  }
  return out.join('\n');
}

function renderPage(node, { title, description, html }, trail) {
  const eyebrow = trail.length > 0 ? `<div class="page-eyebrow">${trail.map(escapeHtml).join(' &rsaquo; ')}</div>` : '';
  const lead = description ? `<p class="page-description">${escapeHtml(description)}</p>` : '';
  return `<section class="page" id="${pageIdForRoute(node.route)}">
${eyebrow}
<h2 class="page-title">${escapeHtml(title)}</h2>
${lead}
${html}
</section>`;
}

/**
 * @param {object} options
 * @param {Array} options.tree Ordered export tree (parts at the top level).
 * @param {Map<string, {title: string, description?: string, html: string}>} options.pageHtml
 * @param {string} options.title Document title.
 * @param {string} [options.subtitle]
 * @param {string} [options.logoUrl] file:// URL of a logo for the cover.
 * @param {string} [options.generatedOn]
 */
export function buildDocument({ tree, pageHtml, title, subtitle, logoUrl, generatedOn }) {
  const titles = new Map([...pageHtml].map(([route, value]) => [route, value.title]));

  const cover = `<section class="cover">
${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="">` : ''}
<h1>${escapeHtml(title)}</h1>
${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
${generatedOn ? `<div class="meta">Generated ${escapeHtml(generatedOn)}</div>` : ''}
</section>`;

  const toc = `<section class="toc">
<h1>Contents</h1>
${renderTocList(tree, titles, { partClass: true })}
</section>`;

  const body = tree
    .map((part, index) => {
      const partId = `part-${index + 1}`;
      return `<section class="part" id="${partId}">
<h1>${escapeHtml(part.title)}</h1>
<div class="part-intro">${renderPartIntro(part, titles)}</div>
</section>
${renderPages(part.children, pageHtml, [part.title])}`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${cover}
${toc}
${body}
</body>
</html>
`;
}
