'use strict';

const CORS_RULES = [
  {
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'access-control-allow-origin', operation: 'set', value: '*' },
        { header: 'access-control-allow-methods', operation: 'set', value: 'GET, OPTIONS' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: {
      urlFilter: '*pdf*',
      resourceTypes: ['xmlhttprequest', 'sub_frame', 'other'],
    },
  },
  {
    id: 2,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'access-control-allow-origin', operation: 'set', value: '*' },
        { header: 'access-control-allow-methods', operation: 'set', value: 'GET, OPTIONS' },
      ],
    },
    condition: {
      urlFilter: '*',
      resourceTypes: ['xmlhttprequest', 'sub_frame', 'other'],
      initiatorDomains: [chrome.runtime.id],
    },
  },
];

chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: CORS_RULES.map((r) => r.id),
  addRules: CORS_RULES,
}).catch(() => { });

const DB_NAME = 'PdfSearchDB';
const STORE_NAME = 'pdfCache';
const MAX_CACHE_ENTRIES = 100;

let dbConnection = null;
let sidepanelPort = null;

async function getDB() {
  if (dbConnection) return dbConnection;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'url' });
    };
    request.onsuccess = () => {
      dbConnection = request.result;
      resolve(dbConnection);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getCachedPdf(url) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function savePdfToCache(url, title, pages) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result >= MAX_CACHE_ENTRIES) {
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) cursor.delete();
        };
      }
    };
    store.put({ url, title, pages, cachedAt: Date.now() });
  } catch (error) { }
}

async function clearCache() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (e) {
    console.warn('Failed to clear PDF cache:', e);
  }
}

chrome.runtime.onStartup.addListener(() => {
  clearCache();
});

chrome.runtime.onInstalled.addListener(() => {
  clearCache();
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

const handlers = {
  async PERFORM_SEARCH({ query, tabs }) {
    try {
      const BATCH_SIZE = 3;
      for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
        const batch = tabs.slice(i, i + BATCH_SIZE);
        if (sidepanelPort) {
          sidepanelPort.postMessage({
            type: 'SEARCH_PROGRESS',
            data: `Searching ${i + 1}-${Math.min(i + BATCH_SIZE, tabs.length)} of ${tabs.length} PDFs...`
          });
        }
        await Promise.all(batch.map(tab => processTabSearch(tab, query)));
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      if (sidepanelPort) {
        sidepanelPort.postMessage({ type: 'SEARCH_FINISHED' });
      }
    }
  },
  JUMP_TO_PAGE({ tabId, url, pageNumber, query }) {
    const viewerUrl = chrome.runtime.getURL(
      `lib/pdfjs/web/viewer.html?file=${encodeURIComponent(url)}#page=${pageNumber}&search=${encodeURIComponent(query)}`
    );
    chrome.tabs.update(tabId, { url: viewerUrl, active: true });
  }
};

async function processTabSearch(tab, query) {
  let url = tab.url;
  if (url.startsWith('chrome-extension://') && url.includes('viewer.html')) {
    const match = url.match(/[?&]file=([^&#]+)/);
    url = match ? decodeURIComponent(match[1]) : null;
  }

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  // Strip hash fragment if present to ensure consistent caching and fetching
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    url = url.substring(0, hashIndex);
  }

  let pdfData = await getCachedPdf(url);

  if (!pdfData) {
    try {
      await setupOffscreen();
      const pages = await new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error('Extraction timeout for ' + url));
        }, 30000);

        const listener = (m) => {
          if (m.type === 'PAGES_EXTRACTED' && m.id === id) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            if (m.error) reject(new Error(m.error));
            else resolve(m.pages);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        chrome.runtime.sendMessage({ type: 'EXTRACT_TEXT', url, id }).catch(e => {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          reject(e);
        });
      });

      pdfData = { url, title: tab.title, pages };
      await savePdfToCache(url, tab.title, pages);
    } catch (e) {
      console.error('Failed to process tab:', tab.id, url, e);
      return;
    }
  }

  const results = [];
  const queryLower = query.toLowerCase();
  for (const page of pdfData.pages) {
    const pageLower = page.text.toLowerCase();
    let pos = 0;
    while ((pos = pageLower.indexOf(queryLower, pos)) !== -1) {
      results.push({
        tabId: tab.id,
        url: url,
        fileName: pdfData.title || 'PDF',
        pageNumber: page.pageNumber,
        context: buildSnippet(page.text, pos, query.length)
      });
      pos += query.length;
    }
  }

  if (results.length > 0 && sidepanelPort) {
    sidepanelPort.postMessage({ type: 'SEARCH_RESULTS', data: results, append: true });
  }
}

function buildSnippet(text, matchStart, queryLength) {
  const start = Math.max(0, text.lastIndexOf(' ', matchStart - 5));
  const end = text.indexOf(' ', matchStart + queryLength + 60);
  const snippet = text.substring(start === -1 ? 0 : start, end === -1 ? text.length : end).trim();
  return (start > 0 ? '...' : '') + snippet + (end !== -1 ? '...' : '');
}

let offscreenSetupPromise = null;

async function setupOffscreen() {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) return;
  if (offscreenSetupPromise) return offscreenSetupPromise;

  offscreenSetupPromise = new Promise((resolve, reject) => {
    const handler = (m) => {
      if (m.type === 'OFFSCREEN_READY') {
        chrome.runtime.onMessage.removeListener(handler);
        offscreenSetupPromise = null;
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(handler);

    chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parsing PDF content',
    }).catch(err => {
      chrome.runtime.onMessage.removeListener(handler);
      offscreenSetupPromise = null;
      reject(err);
    });
  });

  return offscreenSetupPromise;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidepanelPort = port;
    port.onMessage.addListener((message) => {
      const handler = handlers[message.type];
      if (handler) handler(message.data);
    });
    port.onDisconnect.addListener(() => {
      sidepanelPort = null;
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'JUMP_TO_PAGE') {
    handlers.JUMP_TO_PAGE(message.data);
  }
});