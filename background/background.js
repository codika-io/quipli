/* Quipli — Background service worker */

const LOG = (...args) => console.log('[Quipli BG]', ...args);
const ERR = (...args) => console.error('[Quipli BG]', ...args);

const SYSTEM_PROMPT_TEMPLATE = `You are a LinkedIn comment assistant. Write a {{tone}} comment in response to the LinkedIn post below.

Guidelines:
- Keep it concise (1-3 sentences max)
- Sound authentic and human — never robotic or generic
- Match the language of the original post
- Add value: share a perspective, ask a thoughtful question, or build on the idea
- Do not use hashtags or emojis unless the post's tone calls for it
- Do not start with "Great post!" or similar filler
- Return ONLY the comment text, nothing else`;

LOG('Service worker started');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  LOG('Message received:', message.type);

  if (message.type === 'generateComment') {
    handleGenerateComment(message).then(sendResponse);
    return true;
  }

  if (message.type === 'testApiKey') {
    handleTestApiKey(message).then(sendResponse);
    return true;
  }
});

async function handleGenerateComment({ postText }) {
  try {
    const settings = await storageGet([
      'provider', 'model', 'apiKey', 'tone', 'systemPrompt'
    ]);

    const { provider, model, apiKey, tone } = settings;
    LOG('Settings for generation:', { provider, model, apiKey: apiKey ? '***' + apiKey.slice(-4) : '(none)', tone });

    if (!provider || !model || !apiKey) {
      ERR('Missing settings');
      return { error: 'Please configure your API provider and key in the Quipli popup' };
    }

    const customSP = settings.systemPrompt && settings.systemPrompt.trim();
    const systemPrompt = customSP
      ? settings.systemPrompt.trim()
      : SYSTEM_PROMPT_TEMPLATE.replace('{{tone}}', tone || 'professional');
    LOG('Using system prompt:', customSP ? 'CUSTOM' : 'DEFAULT', '→', systemPrompt.slice(0, 120) + '…');
    const truncatedPost = (postText || '').slice(0, 2000);

    if (!truncatedPost || truncatedPost.length < 20) {
      return { error: 'Post text is too short to generate a meaningful comment' };
    }

    LOG(`Calling ${provider}/${model} with ${truncatedPost.length} chars of post text…`);
    const comment = await generateComment(provider, model, apiKey, systemPrompt, truncatedPost);
    LOG('API returned comment:', comment.slice(0, 80));
    return { comment };
  } catch (err) {
    ERR('generateComment error:', err.message);
    return { error: err.message || 'An unexpected error occurred' };
  }
}

async function handleTestApiKey({ provider, model, apiKey }) {
  try {
    if (!provider || !model || !apiKey) {
      return { valid: false, error: 'Missing provider, model, or API key' };
    }

    LOG(`Testing API key for ${provider}/${model}…`);
    const systemPrompt = 'Reply with the single word "ok".';
    const userMessage = 'Test';

    await generateComment(provider, model, apiKey, systemPrompt, userMessage);
    LOG('API key valid');
    return { valid: true };
  } catch (err) {
    ERR('testApiKey error:', err.message);
    return { valid: false, error: err.message };
  }
}

// --- Storage wrapper (DIA/Arc compatibility) ---

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

// --- API providers (inlined for compatibility — no ES module import) ---

async function generateComment(provider, model, apiKey, systemPrompt, userMessage) {
  switch (provider) {
    case 'claude':
      return callClaude(model, apiKey, systemPrompt, userMessage);
    case 'openai':
      return callOpenAI(model, apiKey, systemPrompt, userMessage);
    case 'gemini':
      return callGemini(model, apiKey, systemPrompt, userMessage);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function callClaude(model, apiKey, systemPrompt, userMessage) {
  const res = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await handleResponse(res, 'Claude');
  if (!data.content?.[0]?.text) throw new Error('Claude returned an unexpected response format');
  return data.content[0].text.trim();
}

async function callOpenAI(model, apiKey, systemPrompt, userMessage) {
  const res = await safeFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  const data = await handleResponse(res, 'OpenAI');
  if (!data.choices?.[0]?.message?.content) throw new Error('OpenAI returned an unexpected response format');
  return data.choices[0].message.content.trim();
}

async function callGemini(model, apiKey, systemPrompt, userMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await safeFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 300 }
    })
  });

  const data = await handleResponse(res, 'Gemini');
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error('Gemini returned an unexpected response format');
  return data.candidates[0].content.parts[0].text.trim();
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Network error — check your internet connection');
    }
    throw err;
  }
}

async function handleResponse(res, providerName) {
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Invalid API key for ${providerName}`);
  }
  if (res.status === 429) {
    throw new Error('Rate limit exceeded — please wait a moment and try again');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${providerName} API error (${res.status}): ${text.slice(0, 200)}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error(`${providerName} returned a malformed response`);
  }
}
