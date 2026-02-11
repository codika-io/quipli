const MODELS = {
  claude: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }
  ],
  openai: [
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }
  ],
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' }
  ]
};

const PROVIDER_ICONS = {
  claude: 'anthropic.svg',
  openai: 'openai.svg',
  gemini: 'google.svg'
};

const DEFAULTS = {
  provider: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  tone: 'professional',
  enabled: false
};

const $ = (id) => document.getElementById(id);

// Wrapper for chrome.storage that works with both Promise and callback APIs
function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      const result = chrome.storage.local.get(keys, (data) => {
        resolve(data || {});
      });
      // If it returns a Promise (Chrome 91+), use that instead
      if (result && typeof result.then === 'function') {
        result.then((data) => resolve(data || {}));
      }
    } catch (e) {
      console.error('[Quipli popup] storageGet error:', e);
      resolve({});
    }
  });
}

function storageSet(obj) {
  try {
    chrome.storage.local.set(obj);
  } catch (e) {
    console.error('[Quipli popup] storageSet error:', e);
  }
}

function runtimeSendMessage(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response || {});
        }
      });
    } catch (e) {
      console.error('[Quipli popup] sendMessage error:', e);
      resolve({ error: e.message });
    }
  });
}

let keyTestTimeout = null;

// --- Initialization ---

async function initPopup() {
  const providerEl = $('provider');
  const modelEl = $('model');
  const apiKeyEl = $('apiKey');
  const toneEl = $('tone');
  const enabledEl = $('enabled');
  const toggleKeyEl = $('toggleKey');
  const keyStatusEl = $('keyStatus');
  const providerIconEl = $('providerIcon');
  const modelIconEl = $('modelIcon');

  if (!providerEl || !modelEl) {
    console.error('[Quipli popup] DOM elements not found');
    return;
  }

  const systemPromptBtnEl = $('systemPromptBtn');
  const systemPromptRowEl = $('systemPromptRow');
  const systemPromptModalEl = $('systemPromptModal');
  const systemPromptInputEl = $('systemPromptInput');
  const spCancelEl = $('spCancel');
  const spSaveEl = $('spSave');

  // Load settings
  const settings = await storageGet([
    'provider', 'model', 'apiKey', 'tone', 'enabled', 'systemPrompt'
  ]);

  providerEl.value = settings.provider || DEFAULTS.provider;
  populateModels(providerEl.value, settings.model || DEFAULTS.model);
  if (settings.apiKey) apiKeyEl.value = settings.apiKey;
  toneEl.value = settings.tone || DEFAULTS.tone;
  enabledEl.checked = !!settings.enabled;

  updateProviderIcon(providerEl.value);
  renderSystemPromptRow(settings.systemPrompt || '');

  // Persist defaults on first load
  storageSet({
    provider: providerEl.value,
    model: modelEl.value,
    tone: toneEl.value,
    enabled: enabledEl.checked
  });

  // --- Event Listeners ---

  providerEl.addEventListener('change', () => {
    populateModels(providerEl.value, null);
    updateProviderIcon(providerEl.value);
    storageSet({ provider: providerEl.value, model: modelEl.value });
    clearKeyStatus();
  });

  modelEl.addEventListener('change', () => storageSet({ model: modelEl.value }));

  apiKeyEl.addEventListener('input', () => {
    storageSet({ apiKey: apiKeyEl.value });
    scheduleKeyTest();
  });

  toneEl.addEventListener('change', () => storageSet({ tone: toneEl.value }));

  enabledEl.addEventListener('change', () => storageSet({ enabled: enabledEl.checked }));

  toggleKeyEl.addEventListener('click', () => {
    const isPassword = apiKeyEl.type === 'password';
    apiKeyEl.type = isPassword ? 'text' : 'password';
  });

  // --- Helpers ---

  function populateModels(provider, selectedModel) {
    const models = MODELS[provider] || [];
    modelEl.innerHTML = '';
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      modelEl.appendChild(opt);
    });
    if (selectedModel && models.some((m) => m.value === selectedModel)) {
      modelEl.value = selectedModel;
    }
  }

  function updateProviderIcon(provider) {
    const iconFile = PROVIDER_ICONS[provider];
    if (iconFile && providerIconEl && modelIconEl) {
      const iconPath = '../icons/providers/' + iconFile;
      providerIconEl.src = iconPath;
      providerIconEl.classList.add('visible');
      modelIconEl.src = iconPath;
      modelIconEl.classList.add('visible');
    } else if (providerIconEl && modelIconEl) {
      providerIconEl.classList.remove('visible');
      modelIconEl.classList.remove('visible');
    }
  }

  function scheduleKeyTest() {
    clearTimeout(keyTestTimeout);
    const key = apiKeyEl.value.trim();
    if (!key) {
      clearKeyStatus();
      return;
    }
    keyStatusEl.textContent = 'Will validate shortly\u2026';
    keyStatusEl.className = 'key-status checking';
    keyTestTimeout = setTimeout(() => testApiKey(key), 800);
  }

  async function testApiKey(key) {
    keyStatusEl.textContent = 'Validating\u2026';
    keyStatusEl.className = 'key-status checking';

    const response = await runtimeSendMessage({
      type: 'testApiKey',
      provider: providerEl.value,
      model: modelEl.value,
      apiKey: key
    });

    if (response?.valid) {
      keyStatusEl.textContent = 'Valid key';
      keyStatusEl.className = 'key-status valid';
    } else {
      keyStatusEl.textContent = response?.error || 'Invalid key';
      keyStatusEl.className = 'key-status invalid';
    }
  }

  function clearKeyStatus() {
    keyStatusEl.textContent = '';
    keyStatusEl.className = 'key-status';
  }

  // --- System prompt ---

  function renderSystemPromptRow(prompt) {
    systemPromptRowEl.innerHTML = '';
    if (prompt && prompt.trim()) {
      // Show check + modify button
      const check = document.createElement('span');
      check.className = 'system-prompt-check';
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Set';
      systemPromptRowEl.appendChild(check);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'system-prompt-btn';
      btn.textContent = 'Modify';
      btn.addEventListener('click', () => openSystemPromptModal());
      systemPromptRowEl.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'system-prompt-btn';
      btn.textContent = 'Add system prompt';
      btn.addEventListener('click', () => openSystemPromptModal());
      systemPromptRowEl.appendChild(btn);
    }
  }

  function openSystemPromptModal() {
    storageGet(['systemPrompt']).then((data) => {
      systemPromptInputEl.value = data.systemPrompt || '';
      systemPromptModalEl.style.display = 'flex';
      systemPromptInputEl.focus();
    });
  }

  spCancelEl.addEventListener('click', () => {
    systemPromptModalEl.style.display = 'none';
  });

  spSaveEl.addEventListener('click', () => {
    const val = systemPromptInputEl.value.trim();
    storageSet({ systemPrompt: val });
    renderSystemPromptRow(val);
    systemPromptModalEl.style.display = 'none';
  });

  systemPromptModalEl.addEventListener('click', (e) => {
    if (e.target === systemPromptModalEl) {
      systemPromptModalEl.style.display = 'none';
    }
  });
}

// Run initialization — support both DOMContentLoaded and already-loaded states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPopup().catch((e) => console.error('[Quipli popup] init error:', e));
  });
} else {
  initPopup().catch((e) => console.error('[Quipli popup] init error:', e));
}
