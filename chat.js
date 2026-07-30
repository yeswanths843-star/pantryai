// ============================================================
// js/chat.js
// Drives the AI Assistant chat panel: sending messages, rendering
// bubbles, a lightweight markdown renderer, typing animation,
// copy/regenerate actions, and auto-scroll.
// ============================================================

const Chat = (() => {
  const log = () => document.getElementById("chatLog");
  let history = []; // Gemini-format {role, parts:[{text}]} pairs, for conversational context
  let lastUserMessage = "";

  function timestamp() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Minimal, safe markdown -> HTML: bold, bullet lists, paragraphs.
  function renderMarkdown(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const lines = escaped.split("\n");
    let html = "";
    let inList = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inlineFormat(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (trimmed) html += `<p>${inlineFormat(trimmed)}</p>`;
      }
    });
    if (inList) html += "</ul>";
    return html || `<p>${inlineFormat(escaped)}</p>`;
  }

  function inlineFormat(str) {
    return str.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function appendUserMessage(text) {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--user";
    el.innerHTML = `
      <div class="chat-msg__avatar">🧑</div>
      <div class="chat-msg__body">
        <div class="chat-msg__bubble">${inlineFormat(escapeText(text))}</div>
        <span class="chat-msg__time">${timestamp()}</span>
      </div>`;
    log().appendChild(el);
    scrollToBottom();
  }

  function escapeText(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function appendTypingIndicator() {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--ai";
    el.id = "typingIndicator";
    el.innerHTML = `
      <div class="chat-msg__avatar">✨</div>
      <div class="chat-msg__body">
        <div class="chat-msg__bubble">
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      </div>`;
    log().appendChild(el);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    document.getElementById("typingIndicator")?.remove();
  }

  function appendAIMessage(text, { isError = false } = {}) {
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg--ai ${isError ? "chat-msg--error" : ""}`;
    el.innerHTML = `
      <div class="chat-msg__avatar">✨</div>
      <div class="chat-msg__body">
        <div class="chat-msg__bubble">${isError ? escapeText(text) : renderMarkdown(text)}</div>
        <span class="chat-msg__time">${timestamp()}</span>
        ${isError ? `<div class="chat-msg__tools"><button data-action="retry">Retry</button></div>`
                  : `<div class="chat-msg__tools"><button data-action="copy">Copy</button><button data-action="regenerate">Regenerate</button></div>`}
      </div>`;

    const copyBtn = el.querySelector('[data-action="copy"]');
    if (copyBtn) copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    });

    const regenBtn = el.querySelector('[data-action="regenerate"]');
    if (regenBtn) regenBtn.addEventListener("click", () => {
      el.remove();
      history = history.slice(0, -2); // drop the last user+model turn before retrying
      sendMessage(lastUserMessage, { fromUI: false });
    });

    const retryBtn = el.querySelector('[data-action="retry"]');
    if (retryBtn) retryBtn.addEventListener("click", () => {
      el.remove();
      sendMessage(lastUserMessage, { fromUI: false });
    });

    log().appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    const l = log();
    l.scrollTop = l.scrollHeight;
  }

  let pendingImage = null; // { base64, mimeType, previewUrl }

  function setPendingImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      pendingImage = { base64, mimeType: file.type, previewUrl: reader.result };
      document.getElementById("imagePreviewThumb").src = reader.result;
      document.getElementById("imagePreviewName").textContent = file.name;
      document.getElementById("imagePreview").hidden = false;
    };
    reader.readAsDataURL(file);
  }

  function clearPendingImage() {
    pendingImage = null;
    document.getElementById("imagePreview").hidden = true;
    document.getElementById("imageInput").value = "";
  }

  async function sendMessage(text, { fromUI = true } = {}) {
    const trimmed = text.trim();
    const image = pendingImage;
    if (!trimmed && !image) return;

    const displayText = trimmed || "Scanned an item photo";
    lastUserMessage = trimmed || "What item is in this photo, and should I add it to my pantry?";
    if (fromUI) appendUserMessage(displayText + (image ? " 📷" : ""));
    clearPendingImage();

    const sendBtn = document.getElementById("chatSend");
    sendBtn.disabled = true;
    appendTypingIndicator();

    try {
      const pantryItems = Pantry.getAll();
      const messageForAI = trimmed || lastUserMessage;
      const reply = await AIService.askGemini(messageForAI, pantryItems, history, image);
      removeTypingIndicator();
      appendAIMessage(reply);
      history.push({ role: "user", parts: [{ text: messageForAI }] });
      history.push({ role: "model", parts: [{ text: reply }] });
      // Keep history bounded so requests don't grow unbounded.
      if (history.length > 12) history = history.slice(-12);
    } catch (err) {
      removeTypingIndicator();
      const message = err instanceof AIService.AIError ? err.message : "Something went wrong. Please try again.";
      appendAIMessage(message, { isError: true });
    } finally {
      sendBtn.disabled = false;
    }
  }

  // ---------- Voice input (Web Speech API — free, built into Chrome/Edge) ----------
  function initVoice() {
    const micBtn = document.getElementById("micBtn");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      micBtn.disabled = true;
      micBtn.title = "Voice input isn't supported in this browser — try Chrome or Edge";
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    let listening = false;

    micBtn.addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      recognition.start();
    });

    recognition.onstart = () => { listening = true; micBtn.classList.add("is-active"); };
    recognition.onend = () => { listening = false; micBtn.classList.remove("is-active"); };
    recognition.onerror = () => { listening = false; micBtn.classList.remove("is-active"); };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById("chatInput").value = transcript;
    };
  }

  // ---------- Image attach (Gemini Vision item scanning) ----------
  function initImageAttach() {
    const imageBtn = document.getElementById("imageBtn");
    const imageInput = document.getElementById("imageInput");

    imageBtn.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      if (file) setPendingImage(file);
    });
    document.getElementById("imagePreviewClear").addEventListener("click", clearPendingImage);
  }

  function clear() {
    log().innerHTML = "";
    history = [];
    appendAIMessage("Chat cleared. What would you like to know about your pantry?");
  }

  function init() {
    document.getElementById("chatForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("chatInput");
      sendMessage(input.value);
      input.value = "";
    });

    document.getElementById("suggestedPrompts").addEventListener("click", (e) => {
      if (e.target.matches(".chip")) sendMessage(e.target.textContent);
    });

    document.getElementById("clearChat").addEventListener("click", clear);

    initVoice();
    initImageAttach();
  }

  return { init, sendMessage };
})();
