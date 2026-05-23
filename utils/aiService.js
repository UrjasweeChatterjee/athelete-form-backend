// ─────────────────────────────────────────────────────────────
// utils/aiService.js  –  Reusable AI API caller
//
// Reads AI_API_KEY, AI_MODEL, AI_API_URL from .env.
// Sends a chat-completion request to any OpenAI-compatible endpoint.
// Always asks the model to reply with pure JSON.
// Handles errors cleanly without crashing the server.
// The API key is never forwarded to the frontend.
// ─────────────────────────────────────────────────────────────

/**
 * callAI(systemPrompt, userPrompt)
 *
 * @param {string} systemPrompt  – Instructions for the model (role, format, safety rules)
 * @param {string} userPrompt    – The actual athlete data / question
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
async function callAI(systemPrompt, userPrompt) {
  const apiKey  = process.env.AI_API_KEY;
  const model   = process.env.AI_MODEL   || 'gpt-4o-mini';
  const apiUrl  = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';

  // ── Guard: key not configured ────────────────────────────────
  if (!apiKey || apiKey.trim() === '') {
    return {
      ok: false,
      error: 'AI_API_KEY is not configured. Please add it to your backend .env file.',
    };
  }

  // ── Build the request body ───────────────────────────────────
  const body = {
    model,
    temperature: 0.7,
    response_format: { type: 'json_object' }, // works with OpenAI + Groq
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt  },
    ],
  };

  try {
    const response = await fetch(apiUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    // ── Non-2xx from the AI API ──────────────────────────────────
    if (!response.ok) {
      const errText = await response.text();
      console.error('[aiService] AI API error:', response.status, errText);
      return {
        ok: false,
        error: `AI API returned status ${response.status}. Check your AI_API_KEY, AI_MODEL, and AI_API_URL in .env.`,
      };
    }

    const raw = await response.json();

    // ── Extract the message content ──────────────────────────────
    const content = raw?.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[aiService] Unexpected AI response shape:', JSON.stringify(raw));
      return { ok: false, error: 'AI returned an empty or unexpected response.' };
    }

    // ── Parse JSON safely ────────────────────────────────────────
    try {
      const parsed = JSON.parse(content);
      return { ok: true, data: parsed };
    } catch (parseErr) {
      console.error('[aiService] JSON parse failed. Raw content:', content);
      return { ok: false, error: 'AI response could not be parsed as JSON.' };
    }
  } catch (networkErr) {
    console.error('[aiService] Network/fetch error:', networkErr.message);
    return { ok: false, error: `Could not reach AI API: ${networkErr.message}` };
  }
}

module.exports = { callAI };
