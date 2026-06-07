(() => {
  const script = document.currentScript;
  if (!script) return;

  const WIDGET_TOKEN = script.getAttribute('data-widget-token') || '';
  const BRAND_NAME   = script.getAttribute('data-brand-name')   || 'Travel Concierge';
  const ACCENT       = script.getAttribute('data-accent')        || '#0EA5E9';
  const API_BASE     = (script.getAttribute('data-api-base') || 'https://iqczpwzllkahswgzwzhc.supabase.co/functions/v1').replace(/\/$/, '');

  if (!WIDGET_TOKEN) {
    console.error('[Stompr Widget] missing data-widget-token');
    return;
  }

  // ── Persist anonymous session id ──────────────────────────────────────────
  const SESSION_KEY = 'stompr_widget_sid';
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  // ── Build shadow DOM ───────────────────────────────────────────────────────
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const ACCENT_DARK = shadeColor(ACCENT, -20);

  shadow.innerHTML = `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; }

    #launcher {
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${ACCENT}; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
      font-size: 22px;
    }
    #launcher:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.25); }

    #panel {
      position: fixed; bottom: 92px; right: 24px; z-index: 2147483000;
      width: 360px; max-height: 540px;
      background: #fff; border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
      display: flex; flex-direction: column;
      overflow: hidden;
      transition: opacity .2s, transform .2s;
    }
    #panel.hidden { opacity: 0; pointer-events: none; transform: translateY(12px); }

    #panel-header {
      background: ${ACCENT}; color: #fff;
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
    }
    #panel-header .avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    #panel-header .info { flex: 1; }
    #panel-header .name { font-weight: 700; font-size: 0.92rem; }
    #panel-header .status { font-size: 0.75rem; opacity: 0.85; }

    #messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 0.88rem; line-height: 1.5; }
    .msg.user {
      align-self: flex-end;
      background: ${ACCENT}; color: #fff; border-bottom-right-radius: 4px;
    }
    .msg.bot {
      align-self: flex-start;
      background: #F3F4F6; color: #111; border-bottom-left-radius: 4px;
    }
    .msg.typing { opacity: 0.6; font-style: italic; }

    #lead-form {
      margin: 8px 16px; padding: 12px; border-radius: 12px;
      border: 1px solid #E5E7EB; background: #F9FAFB; display: none;
    }
    #lead-form p { font-size: 0.8rem; color: #6B7280; margin-bottom: 8px; }
    #lead-form input {
      width: 100%; padding: 8px 10px; border-radius: 8px;
      border: 1px solid #D1D5DB; font-size: 0.85rem;
      font-family: inherit; margin-bottom: 6px; outline: none;
    }
    #lead-form input:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 2px ${ACCENT}22; }
    #lead-btn {
      width: 100%; padding: 8px; border-radius: 8px; border: none;
      background: ${ACCENT}; color: #fff; font-weight: 600; font-size: 0.85rem;
      cursor: pointer; font-family: inherit;
    }

    #input-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-top: 1px solid #E5E7EB;
    }
    #input-row textarea {
      flex: 1; resize: none; border: 1px solid #E5E7EB; border-radius: 10px;
      padding: 9px 12px; font-size: 0.88rem; font-family: inherit;
      outline: none; max-height: 80px; line-height: 1.4;
    }
    #input-row textarea:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 2px ${ACCENT}22; }
    #send-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: ${ACCENT}; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 16px; transition: background .2s;
    }
    #send-btn:hover { background: ${ACCENT_DARK}; }
    #send-btn:disabled { background: #D1D5DB; cursor: not-allowed; }

    #branding {
      text-align: center; padding: 6px; font-size: 0.68rem; color: #9CA3AF;
    }
    #branding a { color: #9CA3AF; text-decoration: none; }
    #branding a:hover { text-decoration: underline; }

    @media (max-width: 400px) {
      #panel { width: calc(100vw - 16px); right: 8px; bottom: 80px; }
      #launcher { bottom: 16px; right: 16px; }
    }
  </style>

  <button id="launcher" aria-label="Open travel concierge">✈️</button>

  <div id="panel" class="hidden" role="dialog" aria-label="${BRAND_NAME} travel concierge">
    <div id="panel-header">
      <div class="avatar">✈️</div>
      <div class="info">
        <div class="name">${BRAND_NAME}</div>
        <div class="status">AI Travel Concierge · Online</div>
      </div>
    </div>

    <div id="messages"></div>

    <div id="lead-form">
      <p>Want an agent to follow up? Leave your details:</p>
      <input id="lead-name"  type="text"  placeholder="Your name"  />
      <input id="lead-email" type="email" placeholder="Your email" />
      <button id="lead-btn">Send to an agent →</button>
    </div>

    <div id="input-row">
      <textarea id="user-input" rows="1" placeholder="Ask me anything about travel…"></textarea>
      <button id="send-btn" aria-label="Send">➤</button>
    </div>

    <div id="branding">Powered by <a href="https://stompr.app" target="_blank" rel="noopener">Stompr</a></div>
  </div>
  `;

  // ── Wire up logic ──────────────────────────────────────────────────────────
  const launcher  = shadow.getElementById('launcher');
  const panel     = shadow.getElementById('panel');
  const messages  = shadow.getElementById('messages');
  const textarea  = shadow.getElementById('user-input');
  const sendBtn   = shadow.getElementById('send-btn');
  const leadForm  = shadow.getElementById('lead-form');
  const leadBtn   = shadow.getElementById('lead-btn');

  let open = false;
  let history = [];
  let visitorName = null;
  let visitorEmail = null;
  let leadCaptured = false;
  let msgCount = 0;

  launcher.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('hidden', !open);
    launcher.textContent = open ? '✕' : '✈️';
    if (open && messages.children.length === 0) addBotMessage(
      `Hi there! 👋 I'm your AI travel concierge from ${BRAND_NAME}. Where are you dreaming of going?`
    );
    if (open) textarea.focus();
  });

  sendBtn.addEventListener('click', send);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
  });

  leadBtn.addEventListener('click', () => {
    const n = shadow.getElementById('lead-name').value.trim();
    const em = shadow.getElementById('lead-email').value.trim();
    if (!em) return;
    visitorName = n || null;
    visitorEmail = em;
    leadCaptured = true;
    leadForm.style.display = 'none';
    addBotMessage("Thanks! An agent will be in touch soon. Anything else I can help with?");
  });

  async function send() {
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;

    addUserMessage(text);
    msgCount++;

    // Show lead capture form after 3 messages if not yet captured
    if (msgCount === 3 && !leadCaptured) {
      leadForm.style.display = 'block';
    }

    const typing = addBotMessage('…', true);

    try {
      const res = await fetch(`${API_BASE}/widget-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-widget-token': WIDGET_TOKEN,
        },
        body: JSON.stringify({
          message: text,
          history,
          session_id: sessionId,
          visitor_name: visitorName,
          visitor_email: visitorEmail,
        }),
      });

      const data = await res.json();
      typing.remove();

      if (!res.ok) {
        addBotMessage(data.error === 'Monthly conversation limit reached'
          ? 'Sorry, we\'ve reached our monthly limit. Please contact us directly!'
          : 'Sorry, something went wrong. Please try again.');
      } else {
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: data.reply });
        addBotMessage(data.reply);
      }
    } catch {
      typing.remove();
      addBotMessage('Connection error. Please check your internet and try again.');
    }

    sendBtn.disabled = false;
    textarea.focus();
  }

  function addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function addBotMessage(text, isTyping = false) {
    const el = document.createElement('div');
    el.className = 'msg bot' + (isTyping ? ' typing' : '');
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function shadeColor(hex, pct) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + pct));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
    const b = Math.min(255, Math.max(0, (n & 0xff) + pct));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
})();
