// ============================================================
// js/ai.js
// All Gemini API calls live here. Nothing else in the app talks
// to the network directly.
// ============================================================

const AIService = (() => {
  const ENDPOINT = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  function buildSystemContext(pantryItems) {
    const today = new Date().toISOString().slice(0, 10);
    return `You are the in-app AI assistant for SmartPantry AI, a kitchen inventory app.
Today's date is ${today}.
Here is the user's current pantry as JSON:
${JSON.stringify(pantryItems, null, 2)}

Rules for every reply:
- Base every answer strictly on the pantry data above (do not invent items).
- Use short paragraphs and markdown bullet lists. Bold key items with **asterisks**.
- Be concrete: name actual items from the pantry, not generic advice.
- Keep replies focused and skimmable — no long preamble.
- If the user asks to "analyze my pantry" or something similarly broad, cover: items to use first,
  items expiring soon, 3 recipe ideas from available ingredients, missing ingredients for those recipes,
  a food waste risk note, and one shopping suggestion.
- If asked for a pantry health score, give a number out of 100 with one line of reasoning.`;
  }

  // image: optional { base64, mimeType } — used for grocery/receipt photo recognition via Gemini Vision.
  async function askGemini(userMessage, pantryItems, history = [], image = null) {
    if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
      throw new AIError("missing_key", "No Gemini API key configured. Paste one into js/config.js.");
    }

    const lastUserParts = [{ text: userMessage }];
    if (image) {
      lastUserParts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
      lastUserParts[0].text +=
        "\n\n(An image is attached. Identify the grocery item(s) shown, estimate a reasonable quantity, " +
        "suggest a category from [Dairy, Grains, Produce, Protein, Spices, Beverages, Other], and a sensible " +
        "shelf-life estimate in days from today. Then answer the user's message normally.)";
    }

    const contents = [
      { role: "user", parts: [{ text: buildSystemContext(pantryItems) }] },
      { role: "model", parts: [{ text: "Understood. I'll base every answer on that pantry data." }] },
      ...history,
      { role: "user", parts: lastUserParts },
    ];

    let response;
    try {
      response = await fetch(ENDPOINT(CONFIG.GEMINI_MODEL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      });
    } catch (networkErr) {
      throw new AIError("network", "Couldn't reach Gemini. Check your internet connection and try again.");
    }

    if (!response.ok) {
      const status = response.status;
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error?.message || "";
      } catch (_) {}

      if (status === 400 || status === 403) throw new AIError("auth", `Gemini rejected the request (${status}). Check your API key in js/config.js. ${detail}`);
      if (status === 429) throw new AIError("rate_limit", "Rate limit reached. Wait a moment and try again.");
      throw new AIError("server", `Gemini returned an error (${status}). ${detail}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text) throw new AIError("empty", "Gemini returned an empty response. Try rephrasing your question.");
    return text;
  }

  // ---- Deterministic pantry health score (instant, no API call needed) ----
  // This is a local heuristic used to drive the sidebar gauge in real time;
  // the conversational health-score explanation still comes from Gemini.
  function computeLocalHealthScore(pantryItems) {
    if (pantryItems.length === 0) return 0;
    let score = 100;
    pantryItems.forEach((item) => {
      const days = Pantry.daysUntil(item.expiry);
      if (days < 0) score -= 14;
      else if (days <= 2) score -= 8;
      else if (days <= 5) score -= 3;
    });
    const categories = new Set(pantryItems.map((i) => i.category)).size;
    score += Math.min(categories * 2, 10);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  class AIError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  return { askGemini, computeLocalHealthScore, AIError };
})();
