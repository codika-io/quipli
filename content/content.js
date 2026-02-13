/* Quipli — LinkedIn AI Commenter content script */

const LOG = (...args) => console.log('[Quipli]', ...args);
const WARN = (...args) => console.warn('[Quipli]', ...args);
const ERR = (...args) => console.error('[Quipli]', ...args);

// Storage wrapper — works with both Promise and callback APIs (DIA/Arc compatibility)
function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      const result = chrome.storage.local.get(keys, (data) => {
        resolve(data || {});
      });
      if (result && typeof result.then === 'function') {
        result.then((data) => resolve(data || {}));
      }
    } catch (e) {
      ERR('storageGet error:', e);
      resolve({});
    }
  });
}

// A. Centralized selectors — update here when LinkedIn changes its DOM
const SELECTORS = {
  postContainer: [
    '[data-urn*="urn:li:activity"]',
    '.feed-shared-update-v2',
    'div[data-id]'
  ],
  postText: [
    '.feed-shared-update-v2__description',
    '.update-components-text',
    '.feed-shared-text',
    '.feed-shared-inline-show-more-text',
    'span[dir="ltr"]'
  ],
  commentButton: [
    'button[aria-label*="Comment"]',
    'button[aria-label*="comment"]',
    'button[aria-label*="commentaire"]',
    'button.comment-button'
  ],
  commentEditor: [
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]'
  ],
  socialActionsBar: [
    '.feed-shared-social-action-bar',
    '.social-details-social-actions',
    '.feed-shared-social-actions'
  ]
};

function querySelector(el, group) {
  const selectors = SELECTORS[group];
  for (const sel of selectors) {
    const match = el.querySelector(sel);
    if (match) return match;
  }
  return null;
}

function querySelectorAll(el, group) {
  const selectors = SELECTORS[group];
  const all = new Set();
  for (const sel of selectors) {
    el.querySelectorAll(sel).forEach((m) => all.add(m));
  }
  return [...all];
}

// B. State
const processedPosts = new WeakSet();
const generatingPosts = new WeakSet();
let settings = { enabled: false };
let concurrency = 0;
const MAX_CONCURRENCY = 3;
const pendingQueue = [];
let mutationObserver = null;
let intersectionObserver = null;
let mutationDebounce = null;

// C. Initialization
async function init() {
  LOG('Content script loaded on', window.location.href);

  settings = await storageGet(['provider', 'model', 'apiKey', 'tone', 'enabled']);
  LOG('Settings loaded:', {
    provider: settings.provider || '(not set)',
    model: settings.model || '(not set)',
    apiKey: settings.apiKey ? '***' + settings.apiKey.slice(-4) : '(not set)',
    tone: settings.tone || '(not set)',
    enabled: settings.enabled
  });

  if (settings.enabled) {
    LOG('Starting observers');
    startObservers();
  } else {
    LOG('Generate Comments is OFF — enable it in the Quipli popup');
  }
}

chrome.storage.onChanged.addListener((changes) => {
  LOG('Settings changed:', Object.keys(changes).join(', '));
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
  }

  if (changes.enabled) {
    if (settings.enabled) {
      LOG('Starting observers');
      startObservers();
      scanExistingPosts();
    } else {
      LOG('Stopping observers and cleaning up');
      stopObservers();
      cleanup();
    }
  }
});

// D. Post detection
function scanForNewPosts() {
  const posts = querySelectorAll(document, 'postContainer');
  let newCount = 0;
  posts.forEach((post) => {
    if (!processedPosts.has(post)) {
      intersectionObserver.observe(post);
      newCount++;
    }
  });
  if (newCount > 0) LOG(`Found ${newCount} new post(s) to watch`);
}

function startObservers() {
  if (mutationObserver) return;

  intersectionObserver = new IntersectionObserver(onPostVisible, { threshold: 0.3 });

  mutationObserver = new MutationObserver((mutations) => {
    const isOwnMutation = mutations.every((m) =>
      [...m.addedNodes].every((n) => n.nodeType === 1 && n.className && typeof n.className === 'string' && n.className.startsWith('lac-'))
    );
    if (isOwnMutation) return;

    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(scanForNewPosts, 200);
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  const posts = querySelectorAll(document, 'postContainer');
  LOG(`Initial scan: ${posts.length} post container(s)`);
  posts.forEach((post) => {
    if (!processedPosts.has(post)) {
      intersectionObserver.observe(post);
    }
  });
}

function stopObservers() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  LOG('Observers stopped');
}

function onPostVisible(entries) {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const post = entry.target;
    if (processedPosts.has(post)) return;

    processedPosts.add(post);
    intersectionObserver.unobserve(post);
    processPost(post);
  });
}

// E. Post processing
function processPost(post) {
  if (!settings.enabled) return;

  const text = extractPostText(post);
  if (!text || text.length < 20) {
    LOG(`Skipping — text too short (${text ? text.length : 0} chars)`);
    return;
  }

  LOG(`Processing post (${text.length} chars): "${text.slice(0, 60)}…"`);

  const anchor = querySelector(post, 'socialActionsBar');
  if (!anchor) {
    WARN('No social actions bar found — cannot attach UI');
    return;
  }

  generateForPost(post, text);
}

function scanExistingPosts() {
  const posts = querySelectorAll(document, 'postContainer');
  let count = 0;
  posts.forEach((post) => {
    if (!processedPosts.has(post)) {
      processedPosts.add(post);
      processPost(post);
      count++;
    }
  });
  LOG(`scanExistingPosts: processed ${count} new post(s)`);
}

function extractPostText(post) {
  const textEl = querySelector(post, 'postText');
  return textEl ? textEl.innerText.trim() : '';
}

// F. Generation flow
async function generateForPost(post, postText) {
  if (generatingPosts.has(post)) return;

  if (concurrency >= MAX_CONCURRENCY) {
    LOG(`Queued post (${pendingQueue.length + 1} in queue)`);
    pendingQueue.push({ post, postText });
    return;
  }

  generatingPosts.add(post);
  concurrency++;
  LOG(`Generating comment (concurrency: ${concurrency}/${MAX_CONCURRENCY})`);

  clearLacElements(post);
  const loader = showLoader(post);

  try {
    const response = await sendMessage({ type: 'generateComment', postText });

    if (loader.parentNode) loader.remove();

    if (response?.error) {
      ERR('Generation error:', response.error);
      showError(post, response.error);
    } else if (response?.comment) {
      LOG('Comment generated:', response.comment.slice(0, 80) + '…');
      showCommentPreview(post, response.comment, postText);
    } else {
      ERR('Empty response from background');
      showError(post, 'No response from AI provider');
    }
  } catch (err) {
    if (loader.parentNode) loader.remove();
    ERR('Generation threw:', err);
    showError(post, err.message || 'Failed to generate comment');
  } finally {
    generatingPosts.delete(post);
    concurrency--;
    processQueue();
  }
}

function processQueue() {
  while (pendingQueue.length > 0 && concurrency < MAX_CONCURRENCY) {
    const { post, postText } = pendingQueue.shift();
    if (post.isConnected) {
      generateForPost(post, postText);
    }
  }
}

function showLoader(post) {
  const anchor = querySelector(post, 'socialActionsBar');
  const loader = document.createElement('div');
  loader.className = 'lac-loader';
  if (anchor) anchor.insertAdjacentElement('afterend', loader);
  return loader;
}

function showCommentPreview(post, comment, postText) {
  const anchor = querySelector(post, 'socialActionsBar');
  if (!anchor) return;

  const preview = document.createElement('div');
  preview.className = 'lac-comment-preview';
  preview.textContent = comment;

  const strip = document.createElement('div');
  strip.className = 'lac-action-strip';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'lac-btn-accept';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', () => {
    clearLacElements(post);
    injectComment(post, comment);
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'lac-btn-dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    clearLacElements(post);
  });

  const regenBtn = document.createElement('button');
  regenBtn.className = 'lac-btn-regenerate';
  regenBtn.textContent = 'Regenerate';
  regenBtn.addEventListener('click', () => {
    clearLacElements(post);
    generatingPosts.delete(post);
    generateForPost(post, postText);
  });

  strip.append(acceptBtn, dismissBtn, regenBtn);
  anchor.insertAdjacentElement('afterend', strip);
  strip.insertAdjacentElement('beforebegin', preview);
}

function showError(post, message) {
  const anchor = querySelector(post, 'socialActionsBar');
  if (!anchor) return;

  const errEl = document.createElement('div');
  errEl.className = 'lac-error';
  errEl.textContent = message;
  anchor.insertAdjacentElement('afterend', errEl);

  setTimeout(() => {
    if (errEl.parentNode) errEl.remove();
  }, 5000);
}

// G. Comment injection
async function injectComment(post, comment) {
  try {
    const commentBtn = querySelector(post, 'commentButton');
    if (commentBtn) {
      commentBtn.click();
    }

    const editorSelector = SELECTORS.commentEditor.join(', ');
    const editor = await waitForElement(post, editorSelector, 4000);
    if (!editor) {
      showError(post, 'Could not find comment editor — try clicking Comment manually');
      return;
    }

    editor.focus();
    await sleep(100);

    document.execCommand('selectAll', false, null);
    const inserted = document.execCommand('insertText', false, comment);

    if (!inserted) {
      editor.innerHTML = `<p>${escapeHtml(comment)}</p>`;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: comment, inputType: 'insertText' }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (err) {
    ERR('injectComment error:', err);
    showError(post, 'Failed to inject comment into editor');
  }
}

function waitForElement(container, selector, timeout = 3000) {
  return new Promise((resolve) => {
    const existing = container.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = container.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// H. Utilities
function clearLacElements(post) {
  post.querySelectorAll('.lac-generate-btn, .lac-loader, .lac-comment-preview, .lac-action-strip, .lac-error')
    .forEach((el) => el.remove());
}

function cleanup() {
  document.querySelectorAll('.lac-generate-btn, .lac-loader, .lac-comment-preview, .lac-action-strip, .lac-error')
    .forEach((el) => el.remove());
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// I. Safe message sending
function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          ERR('sendMessage error:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      ERR('sendMessage threw:', e);
      resolve({ error: 'Extension was updated — please reload the page' });
    }
  });
}

// Start
init();
