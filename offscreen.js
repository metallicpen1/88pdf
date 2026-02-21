import * as pdfjsLib from './lib/pdfjs/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('./lib/pdfjs/build/pdf.worker.mjs');

async function extractPages(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableRange: true, disableStream: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ pageNumber: i, text });
  }
  return pages;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
    return false;
  }

  if (message.type === 'EXTRACT_TEXT') {
    const { url, id } = message;
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok && response.status !== 0) throw new Error(`Fetch failed: ${response.status}`);
        const buffer = await response.arrayBuffer();
        const pages = await extractPages(buffer);
        chrome.runtime.sendMessage({ type: 'PAGES_EXTRACTED', pages, id });
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'PAGES_EXTRACTED', pages: [], id, error: err.message });
      }
    })();
    return true;
  }
});

chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });