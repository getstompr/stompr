(() => {
  const script = document.currentScript;
  if (!script) return;

  const tenantId = script.getAttribute("data-tenant-id") || "";
  const siteId = script.getAttribute("data-site-id") || window.location.hostname;
  const apiBase = (script.getAttribute("data-api-base") || script.src.replace(/\/widget\/v1\.js.*$/, "")).replace(/\/$/, "");
  const brandName = script.getAttribute("data-brand-name") || "Travel Concierge";
  const accentColor = script.getAttribute("data-accent") || "#111111";
  const widgetToken = script.getAttribute("data-widget-token") || "";

  if (!tenantId) {
    console.error("travel-widget: missing data-tenant-id");
    return;
  }

  const rootHost = document.createElement("div");
  rootHost.setAttribute("id", "travel-widget-root");
  document.body.appendChild(rootHost);
  const shadow = rootHost.attachShadow({ mode: "open" });

  const css = `
    :host, * { box-sizing: border-box; }
    :host { color: #171717; font-family: inherit; }
    .tw-launcher {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483000;
      background: #ffffff;
      color: #171717;
      border: 1px solid rgba(17, 17, 17, 0.16);
      border-radius: 16px;
      padding: 12px 14px;
      min-width: 56px;
      min-height: 56px;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      font: 600 14px/1.1 inherit;
      letter-spacing: 0.2px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    }
    .tw-launcher:hover { transform: translateY(-1px); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18); border-color: rgba(17, 17, 17, 0.28); }
    .tw-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid rgba(17, 17, 17, 0.2);
      margin-right: 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .tw-panel {
      position: fixed;
      right: 24px;
      bottom: 92px;
      width: min(420px, calc(100vw - 24px));
      height: min(680px, calc(100vh - 126px));
      z-index: 2147483001;
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid rgba(17, 17, 17, 0.1);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
      display: grid;
      grid-template-rows: 74px 1fr 86px;
      overflow: hidden;
      font: 500 14px/1.45 inherit;
      color: #171717;
      opacity: 0;
      transform: translateY(10px) scale(0.985);
      visibility: hidden;
      pointer-events: none;
      transition: opacity .28s ease, transform .28s ease, visibility .28s ease;
    }
    .tw-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      visibility: visible;
      pointer-events: auto;
    }
    .tw-header {
      padding: 14px 16px;
      color: #171717;
      background: #fffdf9;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid rgba(17, 17, 17, 0.08);
    }
    .tw-title { margin: 0; font-weight: 700; font-size: 15px; }
    .tw-subtitle { margin: 2px 0 0; font-size: 12px; opacity: 0.7; }
    .tw-close {
      border: 1px solid rgba(17, 17, 17, 0.15); background: #fff; color: #171717;
      width: 32px; height: 32px; border-radius: 10px; cursor: pointer; font-size: 18px;
    }
    .tw-feed {
      background: #ffffff;
      padding: 14px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .tw-msg { max-width: 88%; padding: 11px 12px; border-radius: 12px; line-height: 1.5; }
    .tw-msg.bot { background: #fff; border: 1px solid rgba(17, 17, 17, 0.12); color: #171717; align-self: flex-start; }
    .tw-msg.user { background: #171717; color: #fff; align-self: flex-end; border: 1px solid #101010; }
    .tw-msg p { margin: 0 0 8px; }
    .tw-msg p:last-child { margin-bottom: 0; }
    .tw-msg ul { margin: 0 0 8px 18px; padding: 0; }
    .tw-msg li { margin: 0 0 4px; }
    .tw-msg strong { font-weight: 700; }
    .tw-msg em { font-style: italic; }
    .tw-msg code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      padding: 1px 5px;
      border-radius: 6px;
      background: rgba(17, 17, 17, 0.08);
    }
    .tw-citations { margin-top: 8px; border-top: 1px dashed rgba(17, 17, 17, 0.2); padding-top: 8px; }
    .tw-citation { font-size: 12px; color: rgba(23, 23, 23, 0.75); margin: 4px 0; }
    .tw-image {
      display: block;
      width: 100%;
      max-height: 180px;
      object-fit: cover;
      border-radius: 10px;
      border: 1px solid rgba(17, 17, 17, 0.12);
      margin-top: 8px;
      background: #f5f5f5;
    }
    .tw-typing { font-size: 12px; color: rgba(23, 23, 23, 0.7); padding: 0 4px; }
    .tw-footer {
      display: grid; grid-template-columns: 1fr auto; gap: 8px;
      padding: 12px; border-top: 1px solid rgba(17, 17, 17, 0.1); background: #fff;
    }
    .tw-input {
      border: 1px solid rgba(17, 17, 17, 0.2); border-radius: 12px; padding: 11px 12px; outline: none;
      font: 500 14px/1.4 inherit;
    }
    .tw-input:focus { border-color: ${accentColor}; box-shadow: 0 0 0 3px rgba(17,17,17,0.12); }
    .tw-send {
      border: 0; border-radius: 12px; min-width: 70px;
      background: ${accentColor}; color: #fff; font-weight: 700; cursor: pointer;
      transition: opacity .2s ease, transform .2s ease;
    }
    .tw-send:hover { transform: translateY(-1px); }
    .tw-send:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
    .tw-disclaimer {
      font-size: 11px; color: rgba(23, 23, 23, 0.65); padding: 0 12px 10px; background: #fff;
    }
    @media (max-width: 768px) {
      .tw-launcher { right: 14px; bottom: 14px; }
      .tw-panel { right: 10px; left: 10px; width: auto; bottom: 78px; height: calc(100vh - 95px); }
    }
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <style>${css}</style>
    <button class="tw-launcher" type="button" aria-label="Open chat">
      <span class="tw-badge">AI</span>
      <span>Plan Trip</span>
    </button>
    <section class="tw-panel" role="dialog" aria-label="Travel AI Assistant" aria-modal="false">
      <header class="tw-header">
        <div>
          <h3 class="tw-title">${brandName}</h3>
          <p class="tw-subtitle">Enterprise travel assistant</p>
        </div>
        <button class="tw-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="tw-feed" id="tw-feed"></div>
      <div>
        <div class="tw-footer">
          <input class="tw-input" id="tw-input" type="text" placeholder="Tell us where and when you want to travel" maxlength="1200" />
          <button class="tw-send" id="tw-send" type="button">Send</button>
        </div>
        <div class="tw-disclaimer">Inventory and pricing are advisor-confirmed before booking.</div>
      </div>
    </section>
  `;

  shadow.appendChild(wrapper);

  const launcher = shadow.querySelector(".tw-launcher");
  const panel = shadow.querySelector(".tw-panel");
  const closeBtn = shadow.querySelector(".tw-close");
  const feed = shadow.getElementById("tw-feed");
  const input = shadow.getElementById("tw-input");
  const send = shadow.getElementById("tw-send");

  let isOpen = false;
  let isSending = false;
  let sessionId = "";

  function appendInlineMarkdown(target, line) {
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let match;

    while ((match = pattern.exec(line)) !== null) {
      const [token] = match;
      if (match.index > last) {
        target.appendChild(document.createTextNode(line.slice(last, match.index)));
      }

      if (token.startsWith("**") && token.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        target.appendChild(strong);
      } else if (token.startsWith("*") && token.endsWith("*")) {
        const em = document.createElement("em");
        em.textContent = token.slice(1, -1);
        target.appendChild(em);
      } else if (token.startsWith("`") && token.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = token.slice(1, -1);
        target.appendChild(code);
      } else {
        target.appendChild(document.createTextNode(token));
      }

      last = match.index + token.length;
    }

    if (last < line.length) {
      target.appendChild(document.createTextNode(line.slice(last)));
    }
  }

  function renderMarkdown(container, text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    let listEl = null;

    function closeList() {
      listEl = null;
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        if (!listEl) {
          listEl = document.createElement("ul");
          container.appendChild(listEl);
        }
        const li = document.createElement("li");
        appendInlineMarkdown(li, bulletMatch[1]);
        listEl.appendChild(li);
        return;
      }

      closeList();
      if (!line.trim()) {
        return;
      }

      const p = document.createElement("p");
      appendInlineMarkdown(p, line.trim());
      container.appendChild(p);
    });
  }

  function extractImageUrls(citations, payload) {
    const urls = [];

    if (payload && Array.isArray(payload.images)) {
      payload.images.forEach((url) => {
        if (typeof url === "string") urls.push(url);
      });
    }

    if (Array.isArray(citations)) {
      citations.forEach((c) => {
        const candidate =
          c?.imageUrl ||
          c?.image_url ||
          c?.metadata?.imageUrl ||
          c?.metadata?.image_url ||
          c?.metadata?.heroImage ||
          c?.metadata?.hero_image;
        if (typeof candidate === "string") {
          urls.push(candidate);
        }
      });
    }

    const seen = new Set();
    return urls
      .map((x) => String(x).trim())
      .filter((x) => /^https?:\/\//i.test(x))
      .filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      })
      .slice(0, 3);
  }

  function appendMessage(kind, text, citations, imageUrls) {
    const msg = document.createElement("div");
    msg.className = `tw-msg ${kind}`;
    renderMarkdown(msg, text);

    if (kind === "bot" && Array.isArray(imageUrls)) {
      imageUrls.forEach((url) => {
        const img = document.createElement("img");
        img.className = "tw-image";
        img.loading = "lazy";
        img.src = url;
        img.alt = "Travel recommendation";
        msg.appendChild(img);
      });
    }

    if (kind === "bot" && Array.isArray(citations) && citations.length > 0) {
      const box = document.createElement("div");
      box.className = "tw-citations";
      citations.slice(0, 3).forEach((c) => {
        const row = document.createElement("div");
        row.className = "tw-citation";
        row.textContent = `Source: ${c.title} (${Math.round((c.score || 0) * 100)}%)`;
        box.appendChild(row);
      });
      msg.appendChild(box);
    }

    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
  }

  function setTyping(active) {
    const prev = shadow.getElementById("tw-typing");
    if (prev) prev.remove();
    if (active) {
      const el = document.createElement("div");
      el.id = "tw-typing";
      el.className = "tw-typing";
      el.textContent = "Assistant is preparing recommendations...";
      feed.appendChild(el);
      feed.scrollTop = feed.scrollHeight;
    }
  }

  async function track(event, metadata = {}) {
    try {
      await fetch(`${apiBase}/v1/widget/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, siteId, sessionId: sessionId || undefined, widgetToken: widgetToken || undefined, event, metadata }),
      });
    } catch (_) {}
  }

  async function bootstrapSession() {
    if (sessionId) return sessionId;

    const visitorId = `visitor_${Math.random().toString(36).slice(2, 10)}`;
    const res = await fetch(`${apiBase}/v1/chat/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, siteId, visitorId, consentGiven: true, widgetToken: widgetToken || undefined }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`session bootstrap failed: ${txt}`);
    }

    const data = await res.json();
    sessionId = data.sessionId;
    return sessionId;
  }

  async function sendMessage() {
    if (isSending) return;
    const text = (input.value || "").trim();
    if (!text) return;

    isSending = true;
    send.disabled = true;
    input.disabled = true;
    appendMessage("user", text);
    input.value = "";
    setTyping(true);
    track("message_sent", { chars: String(text.length) });

    try {
      await bootstrapSession();
      const res = await fetch(`${apiBase}/v1/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, sessionId, message: text }),
      });

      const payload = await res.json();
      setTyping(false);
      if (!res.ok) {
        appendMessage("bot", "I hit a connection issue. Please try again in a moment.");
        track("error", { type: "message_error", status: String(res.status) });
      } else {
        const imageUrls = extractImageUrls(payload?.citations || [], payload);
        appendMessage("bot", payload.response || "I can help plan your next trip.", payload.citations || [], imageUrls);
        if (payload?.handoff?.shouldEscalate) {
          appendMessage("bot", "You qualify for a priority advisor handoff. Reply 'agent' to connect now.");
          track("handoff_clicked", { reason: payload?.handoff?.reason || "auto" });
        }
      }
    } catch (err) {
      setTyping(false);
      const msg = String(err).includes("widgetToken")
        ? "Secure chat token missing or expired. Please refresh the page."
        : "We’re temporarily unavailable. Please try again shortly.";
      appendMessage("bot", msg);
      track("error", { type: "network_error", message: String(err) });
    } finally {
      isSending = false;
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  function openPanel() {
    if (isOpen) return;
    isOpen = true;
    panel.classList.add("open");
    launcher.setAttribute("aria-expanded", "true");
    track("widget_opened");

    if (!feed.hasChildNodes()) {
      appendMessage("bot", "Welcome. Share your destination, dates, and budget, and we’ll prepare tailored options.");
      if (!widgetToken) {
        appendMessage("bot", "Security note: this site has not provided a signed widget token yet.");
      }
    }

    input.focus();
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
    track("widget_closed");
  }

  launcher.addEventListener("click", () => (isOpen ? closePanel() : openPanel()));
  closeBtn.addEventListener("click", closePanel);
  send.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  track("widget_loaded", { siteId, hasTenant: String(Boolean(tenantId)), hasToken: String(Boolean(widgetToken)) });

  window.TravelAIWidget = {
    open: openPanel,
    close: closePanel,
    send: (message) => {
      if (typeof message === "string" && message.trim()) {
        input.value = message;
        sendMessage();
      }
    },
  };
})();
