'use strict';

let port = null;
let matchResults = [];
let currentMatchIndex = -1;

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('results');
const statusText = document.getElementById('status');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const fileAccessWarning = document.getElementById('fileAccessWarning');
const openSettingsLink = document.getElementById('openSettings');

async function checkFileAccess() {
  const isAllowed = await chrome.extension.isAllowedFileSchemeAccess();
  fileAccessWarning.style.display = isAllowed ? 'none' : 'block';
  return isAllowed;
}

if (openSettingsLink) {
  openSettingsLink.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  };
}

function connectPort() {
  port = chrome.runtime.connect({ name: 'sidepanel' });
  port.onMessage.addListener((message) => {
    if (message.type === 'SEARCH_RESULTS') {
      renderResults(message.data, true);
    } else if (message.type === 'SEARCH_PROGRESS') {
      statusText.textContent = message.data;
    } else if (message.type === 'SEARCH_FINISHED') {
      if (matchResults.length === 0) {
        statusText.textContent = 'No matches found';
      } else {
        statusText.textContent = `${matchResults.length} matches`;
      }
      searchBtn.disabled = false;
    }
  });
  port.onDisconnect.addListener(connectPort);
}

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  statusText.textContent = 'Searching...';
  resultsContainer.innerHTML = '';
  matchResults = [];
  currentMatchIndex = -1;
  nextBtn.disabled = true;
  prevBtn.disabled = true;

  const allTabs = await chrome.tabs.query({});
  const pdfTabs = allTabs.filter(t => {
    const url = (t.url || '').toLowerCase();
    const title = (t.title || '').toLowerCase();
    return url.includes('.pdf') || title.includes('.pdf');
  });

  if (pdfTabs.length === 0) {
    statusText.textContent = 'No PDF tabs found';
    searchBtn.disabled = false;
    return;
  }

  port.postMessage({ type: 'PERFORM_SEARCH', data: { query, tabs: pdfTabs } });
}

function renderResults(newResults = [], append = false) {
  if (!append) {
    resultsContainer.innerHTML = '';
    matchResults = [];
  }

  newResults.forEach((match) => {
    const index = matchResults.length;
    matchResults.push(match);

    let pdfGroup = resultsContainer.querySelector(`[data-pdf-url="${CSS.escape(match.url)}"]`);
    if (!pdfGroup) {
      pdfGroup = document.createElement('div');
      pdfGroup.className = 'pdf-group';
      pdfGroup.dataset.pdfUrl = match.url;

      const pdfHeader = document.createElement('div');
      pdfHeader.className = 'pdf-group-title';
      pdfHeader.textContent = match.fileName;
      pdfGroup.appendChild(pdfHeader);
      resultsContainer.appendChild(pdfGroup);
    }

    let pageGroup = pdfGroup.querySelector(`[data-page-number="${match.pageNumber}"]`);
    if (!pageGroup) {
      pageGroup = document.createElement('div');
      pageGroup.className = 'page-group';
      pageGroup.dataset.pageNumber = match.pageNumber;

      const pageHeader = document.createElement('div');
      pageHeader.className = 'page-group-title';
      pageHeader.textContent = `Page ${match.pageNumber}`;
      pageGroup.appendChild(pageHeader);
      pdfGroup.appendChild(pageGroup);
    }

    const item = document.createElement('div');
    item.className = 'result-item';
    item.dataset.index = index;

    const contextDiv = document.createElement('div');
    contextDiv.className = 'result-context';
    contextDiv.textContent = match.context;

    item.appendChild(contextDiv);
    item.onclick = () => jumpToMatch(index);
    pageGroup.appendChild(item);
  });

  if (matchResults.length > 0) {
    nextBtn.disabled = false;
    prevBtn.disabled = false;
    statusText.textContent = `${matchResults.length} matches`;
  }
}

function jumpToMatch(index) {
  if (matchResults.length === 0) return;
  if (index < 0) index = matchResults.length - 1;
  if (index >= matchResults.length) index = 0;

  currentMatchIndex = index;
  const match = matchResults[index];

  const allItems = resultsContainer.querySelectorAll('.result-item');
  allItems.forEach(i => i.classList.remove('active-result'));
  
  const targetItem = resultsContainer.querySelector(`.result-item[data-index="${index}"]`);
  if (targetItem) {
    targetItem.classList.add('active-result');
    targetItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  chrome.runtime.sendMessage({
    type: 'JUMP_TO_PAGE',
    data: {
      tabId: match.tabId,
      url: match.url,
      pageNumber: match.pageNumber,
      query: searchInput.value
    }
  });
}

searchBtn.onclick = performSearch;
searchInput.onkeydown = (e) => { if (e.key === 'Enter') performSearch(); };
nextBtn.onclick = () => jumpToMatch(currentMatchIndex + 1);
prevBtn.onclick = () => jumpToMatch(currentMatchIndex - 1);

connectPort();
checkFileAccess();
window.onfocus = checkFileAccess;