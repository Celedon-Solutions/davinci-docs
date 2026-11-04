import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTree, parsePage, prepareHeadings, renderHtml } from './mdx.mjs';
import { createLinkResolver } from './links.mjs';

function render(source, { images = {}, route = 'pages/current' } = {}) {
  const warnings = [];
  const page = parsePage(source, { onWarning: (message) => warnings.push(message) });
  prepareHeadings(page.tree, 'page-test');
  const resolveLink = createLinkResolver({
    pageRoutes: new Set(['pages/current', 'pages/other']),
    headings: new Map([['pages/other', new Set(['details'])]]),
    redirects: new Map(),
    baseUrl: 'https://docs.example.com',
  });
  normalizeTree(page.tree, {
    warn: (message) => warnings.push(message),
    resolveLink: (href) => resolveLink(href, route),
    resolveImage: (src) => images[src] ?? null,
  });
  return { html: renderHtml(page.tree), warnings, page };
}

test('frontmatter is parsed and removed from the body', () => {
  const { html, page } = render('---\ntitle: Hello\ndescription: World\n---\n\nBody text');
  assert.equal(page.frontmatter.title, 'Hello');
  assert.equal(page.frontmatter.description, 'World');
  assert.ok(html.includes('Body text'));
  assert.ok(!html.includes('description: World'));
});

test('headings are scoped by page id and shifted below the page title', () => {
  const { html } = render('## Setup\n\n### Details\n\n## Setup');
  assert.ok(html.includes('<h3 id="page-test--setup">Setup</h3>'));
  assert.ok(html.includes('<h4 id="page-test--details">Details</h4>'));
  assert.ok(html.includes('id="page-test--setup-1"'));
});

test('callouts on one line become block containers, not inline spans inside paragraphs', () => {
  const { html } = render('<Note>Remember **this** and [link](/pages/other).</Note>\n\n<Warning>\nCareful here.\n</Warning>');
  assert.ok(html.includes('callout-note'));
  assert.ok(html.includes('callout-warning'));
  assert.ok(html.includes('>Note</div>'));
  assert.ok(html.includes('<strong>this</strong>'));
  assert.ok(html.includes('Careful here.'));
  assert.ok(!/<p>\s*<div/.test(html));
  assert.ok(html.includes('href="#page-pages-other"'));
});

test('Frame and inline img resolve image sources and preserve missing images as text', () => {
  const { html, warnings } = render(
    '<Frame caption="Shot">\n  <img noZoom height="40" src="/images/a.png" alt="A" />\n</Frame>\n\n<img src="/images/missing.png" alt="Gone" />',
    { images: { '/images/a.png': 'file:///docs/images/a.png' } },
  );
  assert.ok(html.includes('<figure class="frame">'));
  assert.ok(html.includes('src="file:///docs/images/a.png"'));
  assert.ok(html.includes('height="40"'));
  assert.ok(html.includes('Shot'));
  assert.ok(html.includes('[image: Gone]'));
  assert.ok(warnings.some((w) => w.includes('/images/missing.png')));
});

test('markdown images are rewritten and missing ones become text', () => {
  const { html, warnings } = render('![ok](/images/ok.png) ![bad](/images/bad.png)', {
    images: { '/images/ok.png': 'file:///docs/images/ok.png' },
  });
  assert.ok(html.includes('src="file:///docs/images/ok.png"'));
  assert.ok(html.includes('[image: bad]'));
  assert.equal(warnings.length, 1);
});

test('Card, CardGroup, and Columns keep titles, descriptions, and links', () => {
  const { html } = render(
    '<CardGroup cols={2}>\n  <Card title="Admin" icon="users" href="/pages/other">\n    Manage users.\n  </Card>\n</CardGroup>\n\n<Columns cols={2}>\n  <Card title="External" href="https://example.com">Go.</Card>\n</Columns>',
  );
  assert.ok(html.includes('card-group'));
  assert.ok(html.includes('<a href="#page-pages-other">Admin</a>'));
  assert.ok(html.includes('Manage users.'));
  assert.ok(html.includes('<a href="https://example.com">External</a>'));
  assert.ok(html.includes('Go.'));
});

test('Accordion, Steps, and Tabs keep their titles and content', () => {
  const { html } = render(
    '<AccordionGroup>\n<Accordion title="Why?">\n  Because.\n</Accordion>\n</AccordionGroup>\n\n<Steps>\n  <Step title="First">\n    Do the thing.\n  </Step>\n</Steps>\n\n<Tabs>\n  <Tab title="npm">\n    Install it.\n  </Tab>\n</Tabs>',
  );
  assert.ok(html.includes('Why?'));
  assert.ok(html.includes('Because.'));
  assert.ok(html.includes('<ol class="steps">'));
  assert.ok(html.includes('<li class="step">'));
  assert.ok(html.includes('First'));
  assert.ok(html.includes('Do the thing.'));
  assert.ok(html.includes('npm'));
  assert.ok(html.includes('Install it.'));
});

test('ParamField renders its name, type, required flag, and body', () => {
  const { html } = render('<ParamField path="Short Name" type="string" required>\n  A short label.\n</ParamField>');
  assert.ok(html.includes('<code>Short Name</code>'));
  assert.ok(html.includes('string'));
  assert.ok(html.includes('required'));
  assert.ok(html.includes('A short label.'));
  assert.ok(!html.includes('param-kind'));

  const request = render('<ParamField query="limit" type="integer" default="10">Page size.</ParamField>');
  assert.ok(request.html.includes('<code>limit</code>'));
  assert.ok(request.html.includes('query'));
  assert.ok(request.html.includes('default: 10'));
});

test('CodeGroup labels each code block with its fence title', () => {
  const { html } = render('<CodeGroup>\n\n```bash TypeScript\nnpm install a\n```\n\n```bash Python\npip install a\n```\n\n</CodeGroup>');
  assert.ok(html.includes('code-group'));
  assert.ok(html.includes('<strong>TypeScript</strong>'));
  assert.ok(html.includes('<strong>Python</strong>'));
  assert.ok(html.includes('npm install a'));
  assert.ok(html.includes('pip install a'));
});

test('unknown components keep their text and report a warning', () => {
  const { html, warnings } = render('<Mystery kind="x">\n  Still **visible**.\n</Mystery>');
  assert.ok(html.includes('Still <strong>visible</strong>.'));
  assert.ok(warnings.some((w) => w.includes('<Mystery>')));
});

test('inline icon links and tables with JSX keep working', () => {
  const { html } = render(
    '| Name | Icon |\n| --- | --- |\n| [Part](/pages/other#details) | <img width="15" noZoom style={{ margin: 0 }} src="/images/p.svg" /> |',
    { images: { '/images/p.svg': 'file:///docs/images/p.svg' } },
  );
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('href="#page-pages-other--details"'));
  assert.ok(html.includes('src="file:///docs/images/p.svg"'));
  assert.ok(html.includes('width="15"'));
  assert.ok(!html.includes('style='));
});

test('comment expressions are dropped and other expressions are kept as text with a warning', () => {
  const { html, warnings } = render('Before {/* hidden */} after {1 + 1}.');
  assert.ok(!html.includes('hidden'));
  assert.ok(html.includes('{1 + 1}'));
  assert.equal(warnings.length, 1);
});

test('links outside the export point at the published site', () => {
  const { html } = render('[API](/api-reference/projects/list#x) and [self](#details)', { route: 'pages/other' });
  assert.ok(html.includes('href="https://docs.example.com/api-reference/projects/list#x"'));
  assert.ok(html.includes('href="#page-pages-other--details"'));
});

test('malformed MDX falls back to Markdown without dropping text', () => {
  const { html, warnings, page } = render('# Title\n\n<Note>unclosed note text\n\nOther paragraph.');
  assert.equal(page.mode, 'markdown-fallback');
  assert.ok(html.includes('unclosed note text'));
  assert.ok(html.includes('Other paragraph.'));
  assert.ok(warnings.some((w) => w.includes('MDX parse failed')));
});

test('a leading H1 matching the title is not duplicated', () => {
  const { page } = render('---\ntitle: Same\n---\n\n# Same\n\nBody');
  assert.equal(page.tree.children[0].type, 'paragraph');
  const withoutTitle = render('# From Heading\n\nBody');
  assert.equal(withoutTitle.page.frontmatter.title, 'From Heading');
});
