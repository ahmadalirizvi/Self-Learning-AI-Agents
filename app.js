/* ===========================================================
   Recall — front-end for a mem0 + Gemini backend
   State is in-memory only (sandboxed iframes block localStorage).
   =========================================================== */

const $ = (id) => document.getElementById(id);

const el = {
  app: document.querySelector('.app'),
  thread: $('thread'),
  welcome: $('welcome'),
  composer: $('composer'),
  input: $('input'),
  send: $('send'),
  memoryBody: $('memoryBody'),
  memoryEmpty: $('memoryEmpty'),
  memorySub: $('memorySub'),
  memoryCount: $('memoryCount'),
  threads: $('threads'),
  chatTitle: $('chatTitle'),
  statusPill: $('statusPill'),
  statusText: $('statusText'),
  scrim: $('scrim'),
  settings: $('settings'),
  apiBase: $('apiBase'),
  userId: $('userId'),
  userName: $('userName'),
  userSub: $('userSub'),
  userAvatar: $('userAvatar'),
};

const state = {
  apiBase: '',
  userId: 'default_user',
  conversations: [],
  activeId: null,
  storedCount: 0,
  busy: false,
};

/* ───────── Theme ───────── */

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let theme = prefersDark.matches ? 'dark' : 'light';
const applyTheme = () => document.documentElement.setAttribute('data-theme', theme);
applyTheme();
prefersDark.addEventListener('change', (e) => { theme = e.matches ? 'dark' : 'light'; applyTheme(); });
$('themeToggle').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); });

/* ───────── Conversations ───────── */

function newConversation(activate = true) {
  const convo = { id: crypto.randomUUID(), title: 'New conversation', messages: [], memories: [] };
  state.conversations.unshift(convo);
  if (activate) state.activeId = convo.id;
  return convo;
}

const active = () => state.conversations.find((c) => c.id === state.activeId);

function renderThreadList() {
  el.threads.innerHTML = '';
  const named = state.conversations.filter((c) => c.messages.length);
  if (!named.length) {
    el.threads.innerHTML = '<p class="threads__empty">No conversations yet</p>';
    return;
  }
  named.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'thread-item';
    b.textContent = c.title;
    b.setAttribute('aria-current', String(c.id === state.activeId));
    b.addEventListener('click', () => { state.activeId = c.id; renderAll(); closeNav(); });
    el.threads.appendChild(b);
  });
}

function renderAll() {
  const convo = active();
  el.chatTitle.textContent = convo.messages.length ? convo.title : 'New conversation';
  el.thread.innerHTML = '';

  if (!convo.messages.length) {
    el.thread.appendChild(el.welcome);
  } else {
    const inner = document.createElement('div');
    inner.className = 'thread__inner';
    el.thread.appendChild(inner);
    convo.messages.forEach((m) => inner.appendChild(messageNode(m)));
  }
  renderMemories(convo.memories);
  renderThreadList();
  scrollDown();
}

/* ───────── Messages ───────── */

function messageNode({ role, text, used }) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg--${role === 'user' ? 'user' : 'ai'}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);

  if (role === 'ai') {
    const meta = document.createElement('div');
    meta.className = 'msg__meta';
    if (used && used.length) {
      const chip = document.createElement('button');
      chip.className = 'msg__chip';
      chip.type = 'button';
      chip.innerHTML =
        '<svg viewBox="0 0 20 20"><path d="M4 6h12M4 10h12M4 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>' +
        `${used.length} ${used.length === 1 ? 'memory' : 'memories'} used`;
      chip.addEventListener('click', () => { openMemory(); renderMemories(used); });
      meta.appendChild(chip);
    } else {
      const s = document.createElement('span');
      s.textContent = 'No prior memory used';
      meta.appendChild(s);
    }
    wrap.appendChild(meta);
  }
  return wrap;
}

function ensureInner() {
  let inner = el.thread.querySelector('.thread__inner');
  if (!inner) {
    el.thread.innerHTML = '';
    inner = document.createElement('div');
    inner.className = 'thread__inner';
    el.thread.appendChild(inner);
  }
  return inner;
}

const scrollDown = () => requestAnimationFrame(() => { el.thread.scrollTop = el.thread.scrollHeight; });

/* ───────── Memory panel ───────── */

function renderMemories(memories, label = 'Retrieved context') {
  el.memoryBody.innerHTML = '';
  if (!memories || !memories.length) {
    el.memoryBody.appendChild(el.memoryEmpty);
    el.memorySub.textContent = 'Context retrieved for the last message';
  } else {
    el.memorySub.textContent = `${memories.length} ${memories.length === 1 ? 'entry' : 'entries'} · ${label.toLowerCase()}`;
    const group = document.createElement('div');
    group.innerHTML = `<p class="mem-group__label">${label}</p>`;
    el.memoryBody.appendChild(group);
    memories.forEach((m, i) => {
      const score = typeof m.score === 'number' ? m.score : 0;
      const card = document.createElement('div');
      card.className = 'mem-card' + (m.isNew ? ' mem-card--new' : '');
      card.style.animationDelay = `${i * 60}ms`;
      card.innerHTML = `
        <p></p>
        <div class="mem-card__foot">
          <span>${m.isNew ? 'just added' : 'relevance'}</span>
          <span class="meter"><i style="width:0%"></i></span>
          <span>${score ? score.toFixed(2) : '—'}</span>
        </div>`;
      card.querySelector('p').textContent = m.memory;
      el.memoryBody.appendChild(card);
      requestAnimationFrame(() => {
        card.querySelector('.meter i').style.width = `${Math.round((score || 0.5) * 100)}%`;
      });
    });
  }
  el.memoryCount.textContent = `${state.storedCount} stored`;
}

const narrow = window.matchMedia('(max-width: 1080px)');

function syncScrim() {
  const overlayOpen =
    el.app.getAttribute('data-nav') === 'open' ||
    (narrow.matches && el.app.getAttribute('data-memory') !== 'hidden');
  if (overlayOpen) el.scrim.setAttribute('data-open', 'true');
  else el.scrim.removeAttribute('data-open');
}

const openMemory = () => { el.app.setAttribute('data-memory', 'shown'); syncScrim(); };
const closeMemory = () => { el.app.setAttribute('data-memory', 'hidden'); syncScrim(); };
const closeNav = () => { el.app.removeAttribute('data-nav'); syncScrim(); };
const closeOverlays = () => { el.app.removeAttribute('data-nav'); if (narrow.matches) closeMemory(); else syncScrim(); };

narrow.addEventListener('change', (e) => { if (e.matches) closeMemory(); else openMemory(); });

/* ───────── Sending ───────── */

function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 168) + 'px';
  el.send.disabled = !el.input.value.trim() || state.busy;
}
el.input.addEventListener('input', autoGrow);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.composer.requestSubmit(); }
});

el.composer.addEventListener('submit', (e) => { e.preventDefault(); send(el.input.value.trim()); });

document.querySelectorAll('#suggestions button').forEach((b) =>
  b.addEventListener('click', () => send(b.dataset.q))
);

async function send(text) {
  if (!text || state.busy) return;
  const convo = active();

  state.busy = true;
  el.input.value = '';
  autoGrow();

  if (convo.title === 'New conversation') {
    convo.title = text.length > 38 ? text.slice(0, 38).trim() + '…' : text;
    el.chatTitle.textContent = convo.title;
  }

  convo.messages.push({ role: 'user', text });
  const inner = ensureInner();
  inner.appendChild(messageNode({ role: 'user', text }));
  renderThreadList();
  scrollDown();

  const typing = document.createElement('div');
  typing.className = 'msg msg--ai';
  typing.innerHTML = '<div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  inner.appendChild(typing);
  scrollDown();

  let reply = '';
  let used = [];
  try {
    const res = state.apiBase ? await callBackend(text) : await mockEngine(text, convo);
    reply = res.response;
    used = res.memories || [];
  } catch (err) {
    reply = `Couldn't reach the backend at ${state.apiBase}.\n\n${err.message}`;
  }

  typing.remove();
  convo.memories = used;
  const node = messageNode({ role: 'ai', text: '', used });
  inner.appendChild(node);
  renderMemories(used);
  await typewriter(node.querySelector('.bubble'), reply);
  convo.messages.push({ role: 'ai', text: reply, used });

  state.busy = false;
  autoGrow();
  el.input.focus();
}

function typewriter(node, text) {
  return new Promise((resolve) => {
    const words = text.split(/(\s+)/);
    let i = 0;
    const step = () => {
      node.textContent += words.slice(i, i + 3).join('');
      i += 3;
      scrollDown();
      if (i < words.length) setTimeout(step, 26);
      else resolve();
    };
    step();
  });
}

/* ───────── Backend ───────── */

async function callBackend(message) {
  const res = await fetch(`${state.apiBase.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, user_id: state.userId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  state.storedCount = data.stored_count ?? state.storedCount + 1;
  return {
    response: data.response ?? data.answer ?? '',
    memories: (data.memories || []).map((m) =>
      typeof m === 'string' ? { memory: m, score: 0 } : { memory: m.memory, score: m.score ?? 0 }
    ),
  };
}

/* ───────── Demo engine ───────── */

const seedMemories = [
  { memory: 'Works as a software builder in Lahore, Pakistan', score: 0.61 },
  { memory: 'Is building a memory layer with mem0, Qdrant and Gemini', score: 0.74 },
  { memory: 'Prefers concise answers with concrete next steps', score: 0.58 },
  { memory: 'Trains early in the morning on weekdays', score: 0.52 },
  { memory: 'Follows a vegetarian diet', score: 0.55 },
  { memory: 'Decided to self-host Qdrant on localhost:6333 instead of cloud', score: 0.69 },
];

function pickMemories(text) {
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = seedMemories
    .map((m) => {
      const hay = m.memory.toLowerCase();
      const overlap = words.filter((w) => hay.includes(w.slice(0, 5))).length;
      return { ...m, score: Math.min(0.95, m.score + overlap * 0.11) };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

const demoReplies = [
  'Here’s what I’d do, grounded in what I already know about you:',
  'Based on your stored context, this is the shortest path:',
  'Pulling from memory, here’s my take:',
];

function mockEngine(text, convo) {
  const memories = pickMemories(text);
  const body = [
    `${demoReplies[convo.messages.length % demoReplies.length]}`,
    '',
    '1. Start from what you already committed to — no need to re-litigate settled decisions.',
    '2. Keep the change small enough to ship today, then measure before expanding.',
    '3. Write the outcome back so future answers stay consistent.',
    '',
    'This is demo mode — add your backend URL in Settings to get real Gemini responses with live mem0 recall.',
  ].join('\n');

  const extracted = extractNewMemory(text);
  if (extracted) {
    memories.unshift({ memory: extracted, score: 1, isNew: true });
    state.storedCount += 1;
  }
  state.storedCount = Math.max(state.storedCount, seedMemories.length);

  return new Promise((r) => setTimeout(() => r({ response: body, memories }), 620));
}

function extractNewMemory(text) {
  const t = text.trim();
  const patterns = [/\bi'?m\b/i, /\bi am\b/i, /\bi like\b/i, /\bi prefer\b/i, /\bmy \w+ is\b/i, /\bi work\b/i, /\bi live\b/i, /\bremember\b/i];
  if (!patterns.some((p) => p.test(t))) return null;
  const sentence = t.split(/[.!?]/)[0].trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/* ───────── Chrome wiring ───────── */

$('newChat').addEventListener('click', () => { newConversation(); renderAll(); closeNav(); el.input.focus(); });
$('memoryToggle').addEventListener('click', () => {
  if (el.app.getAttribute('data-memory') === 'hidden') { el.app.removeAttribute('data-nav'); openMemory(); }
  else closeMemory();
});
$('memoryClose').addEventListener('click', closeMemory);
$('sidebarOpen').addEventListener('click', () => {
  if (narrow.matches) el.app.setAttribute('data-memory', 'hidden');
  el.app.setAttribute('data-nav', 'open');
  syncScrim();
});
$('sidebarClose').addEventListener('click', closeNav);
el.scrim.addEventListener('click', closeOverlays);

/* Settings */
function openSettings() {
  el.apiBase.value = state.apiBase;
  el.userId.value = state.userId;
  el.settings.setAttribute('data-open', 'true');
  setTimeout(() => el.apiBase.focus(), 60);
}
function closeSettings() { el.settings.removeAttribute('data-open'); }

$('openSettings').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', closeSettings);
$('settingsCancel').addEventListener('click', closeSettings);
$('settingsSave').addEventListener('click', () => {
  state.apiBase = el.apiBase.value.trim();
  state.userId = el.userId.value.trim() || 'default_user';
  el.userName.textContent = state.userId;
  el.userAvatar.textContent = state.userId.charAt(0).toUpperCase();
  const live = Boolean(state.apiBase);
  el.statusText.textContent = live ? 'Connected' : 'Demo mode';
  el.statusPill.setAttribute('data-live', String(live));
  el.userSub.textContent = live ? state.apiBase.replace(/^https?:\/\//, '') : 'Local memory store';
  closeSettings();
});
el.settings.addEventListener('click', (e) => { if (e.target === el.settings) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSettings(); closeOverlays(); } });

/* Boot */
newConversation();
state.storedCount = seedMemories.length;
renderAll();
autoGrow();
if (narrow.matches) el.app.setAttribute('data-memory', 'hidden');
else el.app.setAttribute('data-memory', 'shown');
el.input.focus();
