/* ============================================================
   ZERO — app.js
   CHUNK 1 of 3 — paste chunk 2 directly below the last line
   ============================================================ */

'use strict';

/* ---------- CONSTANTS ---------- */
const CATEGORIES = [
  { id: 'all',       label: 'All' },
  { id: 'movies',    label: 'Movies' },
  { id: 'tv-shows',  label: 'TV Shows' },
  { id: 'anime',     label: 'Anime' },
  { id: 'manga',     label: 'Manga' },
  { id: 'books',     label: 'Books' },
  { id: 'comics',    label: 'Comics' }
];

const READER_CATS = new Set(['manga', 'books', 'comics']);

const DEFAULT_BLOCKLIST = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'taboola.com',
  'outbrain.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'exoclick.com',
  'juicyads.com',
  'trafficjunky.com'
];

const DB_NAME = 'zero-db';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_META = 'meta';

/* ---------- STATE ---------- */
const state = {
  items: [],
  settings: null,
  blocklist: [],
  route: { view: 'library', id: null },
  filter: { cat: 'all', search: '', sort: 'recent', chips: new Set() },
  player: { item: null, mode: 'native', saveTimer: null },
  reader: { item: null, page: 0, pages: [], width: 0 },
  objectUrls: []
};

/* ---------- DB ---------- */
let db = null;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_ITEMS)) {
        const s = d.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        s.createIndex('category', 'category', { unique: false });
        s.createIndex('created', 'created', { unique: false });
        s.createIndex('lastOpened', 'lastOpened', { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_META)) {
        d.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(store){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(store, key){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, value){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(store, key){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbClear(store){
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---------- SETTINGS ---------- */
const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: 'ember',
  layout: 'net',
  controls: 'native',
  readerWidth: 0
};

async function loadSettings(){
  const row = await dbGet(STORE_META, 'settings');
  state.settings = Object.assign({}, DEFAULT_SETTINGS, row ? row.value : {});
  applySettings();
}

async function saveSettings(patch){
  state.settings = Object.assign({}, state.settings, patch);
  await dbPut(STORE_META, { key: 'settings', value: state.settings });
  applySettings();
}

function applySettings(){
  const s = state.settings;
  document.documentElement.setAttribute('data-theme', s.theme);
  document.documentElement.setAttribute('data-accent', s.accent);
  const grid = document.getElementById('grid');
  if (grid) {
    grid.classList.toggle('net', s.layout === 'net');
    grid.classList.toggle('cruch', s.layout === 'cruch');
  }
  const lbl = document.getElementById('layoutLbl');
  if (lbl) lbl.textContent = s.layout === 'net' ? 'Net' : 'Cruch';
  syncSettingsUI();
}

function syncSettingsUI(){
  const s = state.settings;
  document.querySelectorAll('#themeSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === s.theme);
  });
  document.querySelectorAll('#layoutSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === s.layout);
  });
  document.querySelectorAll('#ctlSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === s.controls);
  });
  document.querySelectorAll('#accentSwatches .swatch').forEach(b => {
    b.classList.toggle('on', b.dataset.a === s.accent);
  });
}

/* ---------- BLOCKLIST ---------- */
async function loadBlocklist(){
  const row = await dbGet(STORE_META, 'blocklist');
  state.blocklist = row && Array.isArray(row.value) ? row.value : DEFAULT_BLOCKLIST.slice();
  updateBlockedStat();
}

async function saveBlocklist(list){
  state.blocklist = list.filter(Boolean);
  await dbPut(STORE_META, { key: 'blocklist', value: state.blocklist });
  updateBlockedStat();
}

function updateBlockedStat(){
  const el = document.getElementById('statBlocked');
  if (el) el.textContent = state.blocklist.length + ' domains';
}

function isBlocked(url){
  try {
    const host = new URL(url).hostname.toLowerCase();
    return state.blocklist.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

/* ---------- UTILITIES ---------- */
function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function esc(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(sec){
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function looksLikeVideo(url){
  return /\.(mp4|webm|ogv|mov|m4v|mkv)(\?|#|$)/i.test(url);
}
function looksLikeImage(url){
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
}
function looksLikePdf(url){
  return /\.pdf(\?|#|$)/i.test(url);
}

function detectType(url, chosen){
  if (chosen && chosen !== 'auto') return chosen;
  if (looksLikeVideo(url)) return 'video';
  if (looksLikeImage(url)) return 'image';
  if (looksLikePdf(url)) return 'reader';
  return 'page';
}

let toastTimer = null;
function toast(msg, ms){
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2200);
}

function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

/* ---------- ROUTER ---------- */
function parseHash(){
  const h = (location.hash || '#/library').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'player' && parts[1]) return { view: 'player', id: parts[1] };
  if (parts[0] === 'reader' && parts[1]) return { view: 'reader', id: parts[1] };
  if (parts[0] === 'image' && parts[1])  return { view: 'image', id: parts[1] };
  if (parts[0] === 'frame' && parts[1])  return { view: 'frame', id: parts[1] };
  if (parts[0] === 'settings')           return { view: 'settings', id: null };
  if (parts[0] === 'legal' && parts[1])  return { view: 'legal', id: parts[1] };
  return { view: 'library', id: null };
}

function showView(name){
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function navigate(hash){
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route(){
  state.route = parseHash();
  const r = state.route;

  if (r.view === 'library') {
    showView('library');
    renderLibrary();
    return;
  }

  const item = state.items.find(i => i.id === r.id);

  if (r.view === 'player') {
    if (!item) return navigate('#/library');
    showView('player');
    openPlayer(item);
    return;
  }
  if (r.view === 'reader') {
    if (!item) return navigate('#/library');
    showView('reader');
    openReader(item);
    return;
  }
  if (r.view === 'image') {
    if (!item) return navigate('#/library');
    showView('image');
    openImage(item);
    return;
  }
  if (r.view === 'frame') {
    if (!item) return navigate('#/library');
    showView('frame');
    openFrame(item);
    return;
  }
  if (r.view === 'settings') {
    showView('settings');
    updateStats();
    return;
  }
  if (r.view === 'legal') {
    showView('legal');
    renderLegal(r.id);
    return;
  }

  showView('library');
  renderLibrary();
}
/* ============================================================
   CHUNK 2 of 3 — paste directly below chunk 1's last line
   ============================================================ */

/* ---------- LIBRARY RENDER ---------- */
function renderTabs(){
  const el = document.getElementById('catTabs');
  if (!el) return;
  el.innerHTML = CATEGORIES.map(c => {
    const on = state.filter.cat === c.id ? ' on' : '';
    return `<button class="tab${on}" data-cat="${c.id}" type="button" role="tab">${esc(c.label)}</button>`;
  }).join('');
  el.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => {
      state.filter.cat = b.dataset.cat;
      renderLibrary();
    });
  });
}

function filteredItems(){
  const f = state.filter;
  let list = state.items.slice();

  if (f.cat !== 'all') list = list.filter(i => i.category === f.cat);

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    list = list.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.url || '').toLowerCase().includes(q)
    );
  }

  if (f.chips.has('continue')) list = list.filter(i => i.resume && (i.resume.time > 0 || i.resume.page > 0));
  if (f.chips.has('cover'))    list = list.filter(i => !!i.cover);
  if (f.chips.has('week')) {
    const cutoff = Date.now() - 7 * 86400000;
    list = list.filter(i => (i.created || 0) >= cutoff);
  }

  if (f.sort === 'alpha') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (f.sort === 'watched') {
    list.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  } else {
    list.sort((a, b) => (b.created || 0) - (a.created || 0));
  }

  return list;
}

function resumeLabel(item){
  const r = item.resume;
  if (!r) return '';
  if (r.time > 0) return 'Resume ' + fmtTime(r.time);
  if (r.page > 0) return 'Page ' + (r.page + 1);
  if (r.scroll > 0) return 'Saved scroll';
  return '';
}

function resumePct(item){
  const r = item.resume;
  if (!r) return 0;
  if (r.duration > 0 && r.time > 0) return Math.min(100, (r.time / r.duration) * 100);
  if (r.total > 0 && r.page > 0) return Math.min(100, ((r.page + 1) / r.total) * 100);
  return 0;
}

function cardHTML(item){
  const cat = CATEGORIES.find(c => c.id === item.category);
  const catLabel = cat ? cat.label : item.category;
  const pct = resumePct(item);
  const coverStyle = item.cover
    ? `background-image:url('${esc(item.cover).replace(/'/g, "%27")}')`
    : '';
  const coverClass = item.cover ? 'cover' : 'cover placeholder';
  const coverInner = item.cover ? '' : esc(item.name || 'Untitled');
  const resumeBar = pct > 0
    ? `<div class="resume"><i style="width:${pct.toFixed(1)}%"></i></div>`
    : '';
  const typeBadge = item.type === 'video' ? '▶'
    : item.type === 'reader' ? '📖'
    : item.type === 'image' ? '🖼'
    : '🌐';

  return `
    <article class="card" data-id="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(item.name)}">
      <div class="${coverClass}" style="${coverStyle}">${coverInner}</div>
      <span class="badge">${typeBadge}</span>
      ${resumeBar}
      <div class="scrim">
        <div class="cat">${esc(catLabel)}</div>
        <div class="nm">${esc(item.name)}</div>
      </div>
      <div class="namebar">${esc(item.name)}</div>
    </article>
  `;
}

function bindCardClicks(container){
  container.querySelectorAll('.card').forEach(card => {
    const go = () => {
      const id = card.dataset.id;
      const item = state.items.find(i => i.id === id);
      if (!item) return;
      if (item.type === 'video')  navigate('#/player/' + id);
      else if (item.type === 'reader') navigate('#/reader/' + id);
      else if (item.type === 'image')  navigate('#/image/' + id);
      else navigate('#/frame/' + id);
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

function renderContinue(){
  const section = document.getElementById('continueSection');
  const row = document.getElementById('continueRow');
  const sub = document.getElementById('continueSub');
  if (!section || !row) return;

  const recent = state.items
    .filter(i => i.resume && (i.resume.time > 0 || i.resume.page > 0 || i.resume.scroll > 0))
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
    .slice(0, 8);

  if (!recent.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  if (sub) sub.textContent = recent.length + ' item' + (recent.length === 1 ? '' : 's');

  row.innerHTML = recent.map(item => {
    const coverStyle = item.cover
      ? `background-image:url('${esc(item.cover).replace(/'/g, "%27")}')`
      : 'background:linear-gradient(150deg, color-mix(in srgb, var(--accent) 26%, var(--bg3)), var(--bg3))';
    const label = resumeLabel(item);
    return `
      <div class="ccard" data-id="${esc(item.id)}" tabindex="0" role="button">
        <div class="thumb" style="${coverStyle}"><span class="playbadge">▶</span></div>
        <div class="meta">
          <div class="nm">${esc(item.name)}</div>
          <div class="pos">${esc(label)}</div>
        </div>
      </div>
    `;
  }).join('');

  row.querySelectorAll('.ccard').forEach(card => {
    const go = () => {
      const item = state.items.find(i => i.id === card.dataset.id);
      if (!item) return;
      if (item.type === 'video')  navigate('#/player/' + item.id);
      else if (item.type === 'reader') navigate('#/reader/' + item.id);
      else if (item.type === 'image')  navigate('#/image/' + item.id);
      else navigate('#/frame/' + item.id);
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

function renderLibrary(){
  renderTabs();
  renderContinue();

  const grid = document.getElementById('grid');
  const emptyEl = document.getElementById('gridEmpty');
  if (!grid) return;

  const list = filteredItems();

  if (!list.length) {
    grid.innerHTML = '';
    if (state.items.length === 0) {
      emptyEl.innerHTML = `
        <div class="empty">
          <div class="glyph">◎</div>
          <h3>Your library is empty</h3>
          <p>Paste a direct media link or a page link. Zero displays it — it never hosts or uploads anything.</p>
          <button class="iconbtn primary" id="emptyAdd" type="button"><span class="glyph">＋</span><span class="txt">Add your first item</span></button>
        </div>`;
      const b = document.getElementById('emptyAdd');
      if (b) b.addEventListener('click', openAddModal);
    } else {
      emptyEl.innerHTML = `
        <div class="empty">
          <div class="glyph">∅</div>
          <h3>Nothing matches</h3>
          <p>Try a different category, clear the search, or remove a filter chip.</p>
        </div>`;
    }
    return;
  }

  emptyEl.innerHTML = '';
  grid.innerHTML = list.map(cardHTML).join('');
  bindCardClicks(grid);
}

/* ---------- ADD MODAL ---------- */
function openAddModal(){
  const back = document.getElementById('modalBack');
  if (!back) return;
  document.getElementById('fName').value = '';
  document.getElementById('fUrl').value = '';
  document.getElementById('fCover').value = '';
  document.getElementById('fCat').value = state.filter.cat === 'all' ? 'movies' : state.filter.cat;
  document.getElementById('fType').value = 'auto';
  ['errName','errUrl','errCover'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.textContent = ''; e.classList.remove('show'); }
  });
  back.classList.add('show');
  setTimeout(() => document.getElementById('fName').focus(), 60);
}

function closeAddModal(){
  const back = document.getElementById('modalBack');
  if (back) back.classList.remove('show');
}

function showFieldError(id, msg){
  const e = document.getElementById(id);
  if (!e) return;
  e.textContent = msg;
  e.classList.add('show');
}

async function confirmAdd(){
  const name = document.getElementById('fName').value.trim();
  const url = document.getElementById('fUrl').value.trim();
  const cover = document.getElementById('fCover').value.trim();
  const category = document.getElementById('fCat').value;
  const typeChoice = document.getElementById('fType').value;

  ['errName','errUrl','errCover'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.textContent = ''; e.classList.remove('show'); }
  });

  let ok = true;

  if (!name) { showFieldError('errName', 'Give it a name so it shows on the frame.'); ok = false; }

  let parsed = null;
  try { parsed = new URL(url); } catch { parsed = null; }
  if (!url) {
    showFieldError('errUrl', 'Paste a URL.'); ok = false;
  } else if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    showFieldError('errUrl', 'Needs to be a full http(s):// link.'); ok = false;
  } else if (isBlocked(url)) {
    showFieldError('errUrl', 'That domain is on your blocklist.'); ok = false;
  }

  if (cover) {
    let cp = null;
    try { cp = new URL(cover); } catch { cp = null; }
    if (!cp || !/^https?:$/.test(cp.protocol)) {
      showFieldError('errCover', 'Cover needs to be a full http(s):// link.'); ok = false;
    }
  }

  if (!ok) return;

  const type = detectType(url, typeChoice);

  const item = {
    id: uid(),
    name,
    url,
    cover: cover || '',
    category,
    type,
    created: Date.now(),
    lastOpened: 0,
    resume: { time: 0, duration: 0, page: 0, total: 0, scroll: 0 }
  };

  await dbPut(STORE_ITEMS, item);
  state.items.push(item);
  closeAddModal();
  toast('Added “' + name + '”');
  renderLibrary();
      }
/* ============================================================
   CHUNK 3 of 3 — paste directly below chunk 2's last line
   This chunk CLOSES app.js.
   ============================================================ */

/* ---------- PLAYER ---------- */
let saveDebounce = null;

function openPlayer(item){
  state.player.item = item;
  state.player.mode = state.settings.controls;

  const video = document.getElementById('video');
  const title = document.getElementById('pTitle');
  const sub = document.getElementById('pSub');
  const ctlMode = document.getElementById('btnCtlMode');

  if (!video) return;

  video.src = item.url;
  video.load();

  if (title) title.textContent = item.name;
  if (sub) sub.textContent = item.url;

  if (ctlMode) {
    ctlMode.textContent = 'Controls: ' + (state.player.mode === 'custom' ? 'Custom' : 'Native');
    ctlMode.classList.toggle('on', state.player.mode === 'custom');
  }

  const custom = document.getElementById('customCtl');
  if (custom) custom.classList.toggle('show', state.player.mode === 'custom');
  video.controls = state.player.mode === 'native';

  // Resume
  const r = item.resume || {};
  if (r.time > 0) {
    const seekAndToast = () => {
      try {
        video.currentTime = r.time;
        toast('Resumed at ' + fmtTime(r.time));
      } catch {}
    };
    if (video.readyState >= 1) seekAndToast();
    else video.addEventListener('loadedmetadata', seekAndToast, { once: true });
  }

  item.lastOpened = Date.now();
  dbPut(STORE_ITEMS, item).catch(() => {});

  bindPlayerControls(video);
}

function bindPlayerControls(video){
  if (!video) return;
  if (video._bound) return;
  video._bound = true;

  video.addEventListener('timeupdate', () => {
    updateCustomTime(video);
    scheduleSavePosition();
  });
  video.addEventListener('play', () => {
    const b = document.getElementById('ccPlay');
    if (b) b.textContent = '⏸';
  });
  video.addEventListener('pause', () => {
    const b = document.getElementById('ccPlay');
    if (b) b.textContent = '▶';
    savePositionNow();
  });
  video.addEventListener('ended', () => { savePositionNow(); });
  video.addEventListener('beforeunload', savePositionNow);
}

function updateCustomTime(video){
  const fill = document.getElementById('seekFill');
  const tc = document.getElementById('tcode');
  const dur = video.duration || 0;
  const cur = video.currentTime || 0;
  if (fill) fill.style.width = dur > 0 ? ((cur / dur) * 100).toFixed(2) + '%' : '0%';
  if (tc) tc.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
}

function scheduleSavePosition(){
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(savePositionNow, 4000);
}

async function savePositionNow(){
  const item = state.player.item;
  const video = document.getElementById('video');
  if (!item || !video) return;
  if (!isFinite(video.currentTime)) return;
  item.resume = item.resume || {};
  item.resume.time = video.currentTime || 0;
  item.resume.duration = video.duration || 0;
  item.lastOpened = Date.now();
  try { await dbPut(STORE_ITEMS, item); } catch {}
}

function setControlsMode(mode){
  state.player.mode = mode;
  saveSettings({ controls: mode });
  const video = document.getElementById('video');
  const custom = document.getElementById('customCtl');
  const btn = document.getElementById('btnCtlMode');
  if (custom) custom.classList.toggle('show', mode === 'custom');
  if (video) video.controls = mode === 'native';
  if (btn) {
    btn.textContent = 'Controls: ' + (mode === 'custom' ? 'Custom' : 'Native');
    btn.classList.toggle('on', mode === 'custom');
  }
}

/* ---------- IMAGE ---------- */
function openImage(item){
  const img = document.getElementById('imgViewer');
  const t = document.getElementById('iTitle');
  const s = document.getElementById('iSub');
  if (img) img.src = item.url;
  if (t) t.textContent = item.name;
  if (s) s.textContent = item.url;
  item.lastOpened = Date.now();
  dbPut(STORE_ITEMS, item).catch(() => {});
}

/* ---------- READER ---------- */
function buildReaderPages(item){
  // If the URL is a list (newline-separated) treat each line as a page.
  // Otherwise it's a single page: image or text URL.
  if (item.pages && Array.isArray(item.pages) && item.pages.length) {
    return item.pages.slice();
  }
  const raw = item.url || '';
  if (raw.includes('\n')) {
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return [raw];
}

function openReader(item){
  state.reader.item = item;
  state.reader.pages = buildReaderPages(item);
  const r = item.resume || {};
  state.reader.page = Math.min(r.page || 0, Math.max(0, state.reader.pages.length - 1));

  const shell = document.getElementById('readerShell');
  if (shell) {
    shell.classList.remove('wide', 'full');
    if (state.settings.readerWidth === 1) shell.classList.add('wide');
    if (state.settings.readerWidth === 2) shell.classList.add('full');
  }

  const title = document.getElementById('rTitle');
  const cat = document.getElementById('rCat');
  if (title) title.textContent = item.name;
  if (cat) {
    const c = CATEGORIES.find(x => x.id === item.category);
    cat.textContent = c ? c.label : item.category;
  }

  item.lastOpened = Date.now();
  dbPut(STORE_ITEMS, item).catch(() => {});

  renderReaderPage();
}

function renderReaderPage(){
  const item = state.reader.item;
  const pages = state.reader.pages;
  const page = state.reader.page;
  const body = document.getElementById('readerBody');
  const pnum = document.getElementById('rPnum');
  const prog = document.getElementById('rProg');
  const prev = document.getElementById('rPrev');
  const next = document.getElementById('rNext');
  if (!body) return;

  const url = pages[page];
  body.classList.remove('text');

  if (looksLikeImage(url)) {
    body.innerHTML = `<img src="${esc(url)}" alt="Page ${page + 1}">`;
  } else if (looksLikePdf(url)) {
    body.innerHTML = `<iframe src="${esc(url)}" style="width:100%;height:70vh;border:none;border-radius:var(--r-s)"></iframe>`;
  } else if (/^https?:/i.test(url)) {
    // Treat as text page: try to fetch text; if CORS blocks, show a graceful link.
    body.innerHTML = `<p style="color:var(--txt-dim)">Loading page…</p>`;
    fetch(url).then(r => r.text()).then(txt => {
      const paragraphs = txt.split(/\n{2,}/).map(p => `<p>${esc(p.trim())}</p>`).join('');
      body.classList.add('text');
      body.innerHTML = paragraphs || `<p>${esc(txt)}</p>`;
    }).catch(() => {
      body.innerHTML = `<p style="color:var(--txt-dim)">This page can’t be embedded directly. <a href="${esc(url)}" target="_blank" rel="noopener">Open it in a new tab</a>.</p>`;
    });
  } else {
    body.innerHTML = `<p>${esc(url)}</p>`;
  }

  if (pnum) pnum.textContent = (page + 1) + ' / ' + pages.length;
  if (prog) prog.style.width = pages.length > 1 ? (((page + 1) / pages.length) * 100).toFixed(1) + '%' : '100%';
  if (prev) prev.disabled = page <= 0;
  if (next) next.disabled = page >= pages.length - 1;
}

function readerGo(delta){
  const pages = state.reader.pages;
  const next = state.reader.page + delta;
  if (next < 0 || next >= pages.length) return;
  state.reader.page = next;
  const item = state.reader.item;
  if (item) {
    item.resume = item.resume || {};
    item.resume.page = state.reader.page;
    item.resume.total = pages.length;
    item.lastOpened = Date.now();
    dbPut(STORE_ITEMS, item).catch(() => {});
  }
  renderReaderPage();
}

function cycleReaderWidth(){
  const w = (state.settings.readerWidth + 1) % 3;
  saveSettings({ readerWidth: w });
  const shell = document.getElementById('readerShell');
  if (!shell) return;
  shell.classList.remove('wide', 'full');
  if (w === 1) shell.classList.add('wide');
  if (w === 2) shell.classList.add('full');
}

/* ---------- FRAME ---------- */
function openFrame(item){
  const frame = document.getElementById('frame');
  const note = document.getElementById('frameNote');
  const title = document.getElementById('fTitle');
  const sub = document.getElementById('fSub');
  if (title) title.textContent = item.name;
  if (sub) sub.textContent = item.url;

  if (isBlocked(item.url)) {
    if (note) {
      note.innerHTML = '<div><strong>Blocked.</strong><br>This domain is on your blocklist.</div>';
      note.classList.add('show');
    }
    if (frame) frame.src = 'about:blank';
    return;
  }

  if (note) note.classList.remove('show');
  if (frame) frame.src = item.url;

  item.lastOpened = Date.now();
  dbPut(STORE_ITEMS, item).catch(() => {});
}

/* ---------- SETTINGS ---------- */
function updateStats(){
  const el = document.getElementById('statItems');
  if (el) el.textContent = state.items.length + ' item' + (state.items.length === 1 ? '' : 's');
  updateBlockedStat();
}

function bindSettings(){
  const themeSeg = document.getElementById('themeSeg');
  if (themeSeg) {
    themeSeg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => saveSettings({ theme: b.dataset.v }));
    });
  }

  const layoutSeg = document.getElementById('layoutSeg');
  if (layoutSeg) {
    layoutSeg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => saveSettings({ layout: b.dataset.v }));
    });
  }

  const ctlSeg = document.getElementById('ctlSeg');
  if (ctlSeg) {
    ctlSeg.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => saveSettings({ controls: b.dataset.v }));
    });
  }

  const sw = document.getElementById('accentSwatches');
  if (sw) {
    sw.querySelectorAll('.swatch').forEach(b => {
      b.addEventListener('click', () => saveSettings({ accent: b.dataset.a }));
    });
  }

  const exp = document.getElementById('btnExport');
  if (exp) {
    exp.addEventListener('click', async () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        items: state.items,
        settings: state.settings,
        blocklist: state.blocklist
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'zero-export-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const clear = document.getElementById('btnClear');
  if (clear) {
    clear.addEventListener('click', async () => {
      if (!confirm('Clear all saved items and resume points? This cannot be undone.')) return;
      await dbClear(STORE_ITEMS);
      state.items = [];
      toast('Library cleared');
      renderLibrary();
      updateStats();
    });
  }

  const bl = document.getElementById('btnBlocklist');
  if (bl) {
    bl.addEventListener('click', () => {
      const back = document.getElementById('blockBack');
      const ta = document.getElementById('blockList');
      if (ta) ta.value = state.blocklist.join('\n');
      if (back) back.classList.add('show');
    });
  }

  const cancelBlock = document.getElementById('btnCancelBlock');
  if (cancelBlock) cancelBlock.addEventListener('click', () => {
    document.getElementById('blockBack').classList.remove('show');
  });

  const saveBlock = document.getElementById('btnSaveBlock');
  if (saveBlock) {
    saveBlock.addEventListener('click', async () => {
      const ta = document.getElementById('blockList');
      const list = ta.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
      await saveBlocklist(list);
      document.getElementById('blockBack').classList.remove('show');
      toast('Blocklist saved');
    });
  }

  $$('[data-legal]').forEach(b => {
    b.addEventListener('click', () => navigate('#/legal/' + b.dataset.legal));
  });
}

/* ---------- LEGAL ---------- */
const LEGAL = {
  tos: `
    <span class="stamp">Terms of Service</span>
    <h4>1. What Zero is</h4>
    <p>Zero is a display frame for media you already have a link to. It does not host, upload, store, or stream any media of its own. Every URL you paste is supplied by you, and Zero simply renders it on your device.</p>
    <h4>2. Your responsibility</h4>
    <p>You are responsible for every link you paste and for having the right to view the content it points to. Zero makes no representation about the legality of any source you choose to open.</p>
    <h4>3. No content hosted</h4>
    <p>Zero hosts no media, uploads no media, and stores no media. The only data Zero keeps on your device is the name, URL, optional cover, category, and resume position for items you add. That data never leaves your device.</p>
    <h4>4. No warranty</h4>
    <p>Zero is provided as-is. Playback depends on the source you paste and on your device's capabilities. Zero is not responsible for links that fail, break, or behave unexpectedly.</p>
    <h4>5. Changes</h4>
    <p>These terms may be updated in future versions of the app. Continued use after an update constitutes acceptance.</p>
  `,
  privacy: `
    <span class="stamp">Privacy</span>
    <h4>What Zero stores</h4>
    <p>Zero stores your library, settings, and resume positions locally on your device using your browser's or WebView's IndexedDB. Nothing is transmitted to a server. There are no accounts, no analytics, and no tracking.</p>
    <h4>What Zero does not store</h4>
    <p>Zero does not store the media you view. It stores only the URL you pasted and your position within it, so you can resume later.</p>
    <h4>Network activity</h4>
    <p>When you open an item, your device loads the URL you supplied directly from its source. That source may see your IP address and device information, exactly as it would if you opened the link in a browser. Zero does not proxy or relay that traffic.</p>
    <h4>Deleting your data</h4>
    <p>You can clear your entire library from Settings. Removing the app also removes the local data, depending on your platform's behavior.</p>
  `,
  dmca: `
    <span class="stamp">DMCA</span>
    <h4>Zero hosts no content</h4>
    <p>Zero is a display frame. It does not host, store, upload, or distribute any media. All content is supplied by the user as a URL and loaded directly from its source. There is nothing on Zero's side to take down.</p>
    <h4>Where to send notices</h4>
    <p>If you believe content you own is being infringed, the correct recipient is the host of the URL in question — the site the user pasted — not Zero. Zero has no copy of that content and no ability to remove it from the source.</p>
    <h4>Contact</h4>
    <p>For questions about Zero itself, reach the app's maintainer through the distribution channel you obtained it from.</p>
  `
};

function renderLegal(key){
  const body = document.getElementById('legalBody');
  if (!body) return;
  body.innerHTML = LEGAL[key] || '<p>Unknown page.</p>';
}

/* ---------- BOOT ---------- */
function bindStaticUI(){
  const add = document.getElementById('btnAdd');
  if (add) add.addEventListener('click', openAddModal);

  const settings = document.getElementById('btnSettings');
  if (settings) settings.addEventListener('click', () => navigate('#/settings'));

  const search = document.getElementById('search');
  if (search) {
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.filter.search = search.value;
        renderLibrary();
      }, 140);
    });
  }

  const sort = document.getElementById('sortSel');
  if (sort) {
    sort.addEventListener('change', () => {
      state.filter.sort = sort.value;
      renderLibrary();
    });
  }

  const layoutBtn = document.getElementById('layoutBtn');
  if (layoutBtn) {
    layoutBtn.addEventListener('click', () => {
      const next = state.settings.layout === 'net' ? 'cruch' : 'net';
      saveSettings({ layout: next });
    });
  }

  $$('#filterChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const f = chip.dataset.f;
      if (state.filter.chips.has(f)) state.filter.chips.delete(f);
      else state.filter.chips.add(f);
      chip.classList.toggle('on', state.filter.chips.has(f));
      renderLibrary();
    });
  });

  const cancelAdd = document.getElementById('btnCancelAdd');
  if (cancelAdd) cancelAdd.addEventListener('click', closeAddModal);

  const confirm = document.getElementById('btnConfirmAdd');
  if (confirm) confirm.addEventListener('click', confirmAdd);

  const modalBack = document.getElementById('modalBack');
  if (modalBack) {
    modalBack.addEventListener('click', e => {
      if (e.target === modalBack) closeAddModal();
    });
  }

  const blockBack = document.getElementById('blockBack');
  if (blockBack) {
    blockBack.addEventListener('click', e => {
      if (e.target === blockBack) blockBack.classList.remove('show');
    });
  }

  const ctlMode = document.getElementById('btnCtlMode');
  if (ctlMode) {
    ctlMode.addEventListener('click', () => {
      setControlsMode(state.player.mode === 'custom' ? 'native' : 'custom');
    });
  }

  const savePos = document.getElementById('btnSavePos');
  if (savePos) {
    savePos.addEventListener('click', async () => {
      await savePositionNow();
      toast('Position saved');
    });
  }

  const ccPlay = document.getElementById('ccPlay');
  if (ccPlay) {
    ccPlay.addEventListener('click', () => {
      const v = document.getElementById('video');
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    });
  }

  const ccFs = document.getElementById('ccFs');
  if (ccFs) {
    ccFs.addEventListener('click', () => {
      const v = document.getElementById('video');
      if (!v) return;
      if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    });
  }

  const seek = document.getElementById('seek');
  if (seek) {
    seek.addEventListener('click', e => {
      const v = document.getElementById('video');
      if (!v || !v.duration) return;
      const rect = seek.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      v.currentTime = ratio * v.duration;
    });
  }

  const vol = document.getElementById('vol');
  if (vol) {
    vol.addEventListener('input', () => {
      const v = document.getElementById('video');
      if (v) v.volume = Number(vol.value);
    });
  }

  const rPrev = document.getElementById('rPrev');
  if (rPrev) rPrev.addEventListener('click', () => readerGo(-1));

  const rNext = document.getElementById('rNext');
  if (rNext) rNext.addEventListener('click', () => readerGo(1));

  const rWidth = document.getElementById('btnReaderWidth');
  if (rWidth) rWidth.addEventListener('click', cycleReaderWidth);

  const savePage = document.getElementById('btnSavePage');
  if (savePage) {
    savePage.addEventListener('click', async () => {
      const item = state.reader.item;
      if (!item) return;
      item.resume = item.resume || {};
      item.resume.page = state.reader.page;
      item.resume.total = state.reader.pages.length;
      item.lastOpened = Date.now();
      await dbPut(STORE_ITEMS, item);
      toast('Page saved');
    });
  }

  const backImage = document.getElementById('btnBackFromImage');
  if (backImage) backImage.addEventListener('click', () => navigate('#/library'));

  const backFrame = document.getElementById('btnBackFromFrame');
  if (backFrame) backFrame.addEventListener('click', () => navigate('#/library'));

  const openExt = document.getElementById('btnOpenExternal');
  if (openExt) {
    openExt.addEventListener('click', () => {
      const item = state.items.find(i => i.id === state.route.id);
      if (item) window.open(item.url, '_blank', 'noopener');
    });
  }

  const backLegal = document.getElementById('btnBackFromLegal');
  if (backLegal) backLegal.addEventListener('click', () => navigate('#/settings'));

  bindSettings();

  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAddModal();
      const b = document.getElementById('blockBack');
      if (b) b.classList.remove('show');
    }
  });
}

async function boot(){
  try {
    await openDB();
    await loadSettings();
    await loadBlocklist();
    state.items = await dbGetAll(STORE_ITEMS);
    state.items.sort((a, b) => (b.created || 0) - (a.created || 0));
    bindStaticUI();
    route();
    const sort = document.getElementById('sortSel');
    if (sort) sort.value = state.filter.sort;
  } catch (err) {
    console.error('[Zero] boot failed', err);
