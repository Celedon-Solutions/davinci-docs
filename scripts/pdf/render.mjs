import { pathToFileURL } from 'node:url';

/**
 * Print a prepared HTML file to PDF with headless Chromium (Playwright).
 * Playwright is imported lazily so `--html-only` runs work without a browser.
 */
export async function renderPdf({ htmlPath, pdfPath, format = 'Letter' }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              }),
        ),
      ),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: pdfPath,
      format,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;font-family:Arial,sans-serif;color:#8c959f;text-align:center;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '0.7in', bottom: '0.8in', left: '0.75in', right: '0.75in' },
      outline: true,
      tagged: true,
    });
  } finally {
    await browser.close();
  }
}
