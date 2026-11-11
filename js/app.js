import * as db from './db.js';
import { probe } from './media.js';
import { dayKey, addDays, parseKey, pad, journalStats } from './stats.js';

const SECTIONS = {
  private: { title: 'Private', label: 'Private journal', blurb: 'Just for you. Say the honest thing.', daily: true },
  public: { title: 'Public', label: 'Public journal', blurb: 'The version of today you’d share.', daily: true },
  physique: { title: 'Physique', label: 'Physique', blurb: 'Progress over time. No daily pressure.', daily: false },
};
const TABS = [
  ['home', 'Today', 'calendar'],
  ['private', 'Private', 'lock'],
  ['public', 'Public', 'globe'],
  ['physique', 'Physique', 'dumbbell'],
];

const ICONS = {
  calendar: '<rect x="4" y="5" width="16" height="16" rx="3.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9"/>',
  dumbbell: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8"/><path d="M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13"/>',
  trash: '<path d="M4.5 7h15M10 4h4M6.5 7l.8 11.6A2.5 2.5 0 0 0 9.8 21h4.4a2.5 2.5 0 0 0 2.5-2.4L17.5 7"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.75" fill="currentColor" stroke="none"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.2 2.2-5.3 3.6-7.4.4 1.6 1.3 2.7 2.4 3.2-.2-2.9.9-5.6 3.1-7.6.4 3.2 3.9 5.7 3.9 10.3 0 4.2-2.7 7.7-6.5 7.7z"/>',
  share_ios: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>',
};

const state = { entries: [], starts: {}, today: dayKey() };
const thumbUrls = new Map();
const root = document.getElementById('app');

/* ---------- tiny DOM helper ---------- */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const icon = (name, cls = '') =>
  h('span', {
    class: `icon ${cls}`,
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  });

/* ---------- formatting ---------- */

const fmtDay = (k, opts) => parseKey(k).toLocaleDateString(undefined, opts);

function dayLabel(k) {
  if (k === state.today) return 'Today';
  if (k === addDays(state.today, -1)) return 'Yesterday';
  const sameYear = k.slice(0, 4) === state.today.slice(0, 4);
  return fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

const shortDay = (k) => fmtDay(k, { month: 'short', day: 'numeric' });

function fmtDur(s) {
  s = Math.round(s || 0);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function timeLeft() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const m = Math.max(0, Math.ceil((end - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function daysAgo(k) {
  const diff = Math.round((parseKey(state.today) - parseKey(k)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 60) return `${Math.round(diff / 7)} wk ago`;
  return shortDay(k);
}

function fmtBytes(n) {
  if (!n) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- data ---------- */

async function load() {
  state.entries = (await db.allEntries()).sort((a, b) => b.createdAt - a.createdAt);
  for (const s of ['private', 'public']) state.starts[s] = await db.getMeta(`start:${s}`);
}

const entriesOf = (s) => state.entries.filter((e) => e.section === s);

function statsOf(s) {
  const es = entriesOf(s);
  let start = state.starts[s];
  for (const e of es) if (!start || e.day < start) start = e.day;
  return journalStats(es, start, state.today);
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function thumbUrl(e) {
  if (!e.thumb) return null;
  if (!thumbUrls.has(e.id)) thumbUrls.set(e.id, URL.createObjectURL(e.thumb));
  return thumbUrls.get(e.id);
}

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------- uploads ---------- */

function pick(section) {
  const input = h('input', { type: 'file', accept: 'video/*', multiple: true, style: 'display:none' });
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.remove();
    if (files.length) save(section, files);
  });
  document.body.append(input);
  input.click();
}

async function save(section, files) {
  const t = toast(`Saving ${files.length > 1 ? `1 of ${files.length}` : 'video'}…`, 'busy');
  navigator.storage?.persist?.().catch(() => {});
  try {
    for (const [i, file] of files.entries()) {
      if (files.length > 1) t.set(`Saving ${i + 1} of ${files.length}…`);
      // The day is stamped at save time, so entries can only ever land on today.
      const day = dayKey();
      const { thumb, duration } = await probe(file);
      await db.addEntry(
        { id: uid(), section, day, createdAt: Date.now(), duration, thumb, type: file.type || 'video/mp4', size: file.size },
        file,
      );
      if (SECTIONS[section].daily && !state.starts[section]) {
        state.starts[section] = day;
        await db.setMeta(`start:${section}`, day);
      }
    }
    t.done(files.length > 1 ? `${files.length} videos saved` : 'Saved');
  } catch (err) {
    console.error(err);
    t.fail('Couldn’t save — your phone may be low on storage');
  }
  await refresh();
}

/* ---------- overlays ---------- */

function toast(text, kind = '') {
  document.querySelector('.toast')?.remove();
  const label = h('span', {}, text);
  const el = h('div', { class: `toast ${kind}` }, h('i', { class: 'toast-dot' }), label);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const dismiss = (ms) =>
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
    }, ms);
  return {
    set: (s) => (label.textContent = s),
    done: (s) => {
      el.className = 'toast in ok';
      label.textContent = s;
      dismiss(1600);
    },
    fail: (s) => {
      el.className = 'toast in err';
      label.textContent = s;
      dismiss(3500);
    },
  };
}

function sheet(...content) {
  const close = () => {
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 280);
  };
  const wrap = h(
    'div',
    { class: 'sheet-wrap' },
    h('div', { class: 'sheet-backdrop', onclick: () => close() }),
    h('div', { class: 'sheet' }, h('div', { class: 'sheet-grip' }), ...content),
  );
  document.body.append(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  return close;
}

function confirmSheet({ title, body, action }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => {
      if (answered) return;
      answered = true;
      close();
      resolve(v);
    };
    const close = sheet(
      h('h3', { class: 'sheet-title' }, title),
      body && h('p', { class: 'sheet-body' }, body),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn-danger btn-block', onclick: () => answer(true) }, action),
        h('button', { class: 'btn btn-quiet btn-block', onclick: () => answer(false) }, 'Cancel')),
    );
  });
}

async function openViewer(e) {
  const blob = await db.getVideo(e.id);
  if (!blob) return toast('').fail('Video not found');
  const url = URL.createObjectURL(blob);
  const video = h('video', { src: url, controls: true, playsinline: true, autoplay: true, preload: 'auto' });

  const close = () => {
    video.pause();
    ov.classList.remove('in');
    setTimeout(() => {
      ov.remove();
      URL.revokeObjectURL(url);
    }, 260);
  };

  const remove = async () => {
    const lastOfDay =
      SECTIONS[e.section].daily && state.entries.filter((x) => x.section === e.section && x.day === e.day).length === 1;
    const ok = await confirmSheet({
      title: 'Delete this video?',
      body:
        lastOfDay && e.day !== state.today
          ? `It’s the only entry for ${shortDay(e.day)}, so that day will count as missed.`
          : 'This can’t be undone.',
      action: 'Delete video',
    });
    if (!ok) return;
    await db.deleteEntry(e.id);
    URL.revokeObjectURL(thumbUrls.get(e.id));
    thumbUrls.delete(e.id);
    close();
    refresh();
  };

  const ov = h(
    'div',
    { class: 'viewer' },
    h('div', { class: 'viewer-top' },
      h('button', { class: 'icon-btn glass', onclick: close, 'aria-label': 'Close' }, icon('close')),
      h('div', { class: 'viewer-title' },
        h('strong', {}, dayLabel(e.day)),
        h('span', {}, `${SECTIONS[e.section].label} · ${fmtTime(e.createdAt)}`)),
      h('span', { class: 'icon-btn-spacer' })),
    h('div', { class: 'viewer-stage' }, video),
    h('div', { class: 'viewer-bar' },
      h('button', { class: 'btn btn-glass', onclick: () => shareVideo(e, blob) }, icon('share'), 'Save'),
      h('button', { class: 'btn btn-glass danger', onclick: remove }, icon('trash'), 'Delete')),
  );
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('in'));
  video.play().catch(() => {});
}

async function shareVideo(e, blob) {
  const ext = /quicktime/.test(e.type) ? 'mov' : (e.type.split('/')[1] || 'mp4');
  const file = new File([blob], `${e.section}-${e.day}.${ext}`, { type: e.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {}
    return;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
  a.click();
}

async function openSettings() {
  const est = (await navigator.storage?.estimate?.()) || {};
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const videoBytes = state.entries.reduce((n, e) => n + (e.size || 0), 0);
  const row = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('strong', {}, v));
  sheet(
    h('h3', { class: 'sheet-title' }, 'Storage'),
    h('div', { class: 'kv-list' },
      row('Private journal', plural(entriesOf('private').length, 'video')),
      row('Public journal', plural(entriesOf('public').length, 'video')),
      row('Physique', plural(entriesOf('physique').length, 'video')),
      row('Space used', fmtBytes(est.usage || videoBytes)),
      est.quota && row('Available to app', fmtBytes(est.quota)),
      row('Protected from cleanup', persisted ? 'Yes' : 'Not yet')),
    h('p', { class: 'sheet-body small' },
      'Everything is stored only on this iPhone and is never uploaded. Removing the app from your Home Screen deletes its videos, so use Save on anything you want to keep elsewhere.'),
  );
}

/* ---------- pieces ---------- */

function statusPill(st) {
  if (st.doneToday) return h('span', { class: 'pill ok' }, icon('check'), 'Done today');
  if (!st.start) return h('span', { class: 'pill' }, 'Not started');
  return h('span', { class: 'pill due', 'data-countdown': 'Due · {t}' }, `Due · ${timeLeft()}`);
}

function heatmap(st) {
  const monday = addDays(state.today, -((parseKey(state.today).getDay() + 6) % 7));
  const first = addDays(monday, -28);
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = addDays(first, i);
    let cls = 'idle';
    if (d > state.today) cls = 'future';
    else if (st.days.has(d)) cls = 'done';
    else if (st.missedDays.has(d)) cls = 'missed';
    if (d === state.today) cls += ' today';
    cells.push(h('i', { class: `cell ${cls}`, title: shortDay(d) }));
  }
  return h('div', { class: 'heat' },
    h('div', { class: 'heat-grid' }, cells),
    h('div', { class: 'heat-legend' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h('span', {}, x))));
}

const stat = (label, value, tone) =>
  h('div', { class: `stat ${tone || ''}` }, h('dt', {}, label), h('dd', {}, value));

function tile(e, { showTime = false } = {}) {
  const src = thumbUrl(e);
  return h('button', { class: 'tile', onclick: () => openViewer(e), 'aria-label': `Play video from ${dayLabel(e.day)}` },
    src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'tile-blank' }, icon('record')),
    h('span', { class: 'tile-shade' }),
    showTime && h('span', { class: 'tile-time' }, fmtTime(e.createdAt)),
    h('span', { class: 'tile-dur' }, fmtDur(e.duration)));
}

const addTile = (section, label = 'Add') =>
  h('button', { class: 'tile tile-add', onclick: () => pick(section) }, icon('plus'), h('span', {}, label));

const grid = (...items) => h('div', { class: 'grid' }, ...items);

const sectionHead = (title, meta) =>
  h('div', { class: 'section-head' }, h('h2', {}, title), meta && h('span', { class: 'section-meta' }, meta));

function pageHead(eyebrow, title, action) {
  return h('header', { class: 'page-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'display' }, title)),
    action);
}

function isStandalone() {
  return navigator.standalone || matchMedia('(display-mode: standalone)').matches;
}

function installHint() {
  if (isStandalone()) return null;
  return h('div', { class: 'hint' },
    icon('share_ios'),
    h('p', {}, h('strong', {}, 'Install this app. '), 'Tap Share in Safari, then “Add to Home Screen”. Your videos are tied to the installed app, so record from there.'));
}

/* ---------- views ---------- */

function homeView() {
  const now = new Date();
  const pending = ['private', 'public'].filter((s) => !statsOf(s).doneToday);
  const summary = pending.length
    ? h('span', { 'data-countdown': `${pending.length === 2 ? 'Both journals' : SECTIONS[pending[0]].label} waiting · {t} left` },
        `${pending.length === 2 ? 'Both journals' : SECTIONS[pending[0]].label} waiting · ${timeLeft()} left`)
    : 'Both journals are done today.';

  return [
    pageHead(
      now.toLocaleDateString(undefined, { weekday: 'long' }),
      now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
      h('button', { class: 'icon-btn', onclick: openSettings, 'aria-label': 'Storage' }, icon('sliders')),
    ),
    h('p', { class: `lede ${pending.length ? '' : 'calm'}` }, summary),
    installHint(),
    journalCard('private'),
    journalCard('public'),
    physiqueCard(),
  ];
}

function journalCard(s) {
  const st = statsOf(s);
  return h('section', { class: `card accent-${s}` },
    h('div', { class: 'card-top' },
      h('a', { class: 'card-label', href: `#/${s}` }, icon(s === 'private' ? 'lock' : 'globe'), SECTIONS[s].label),
      statusPill(st)),
    h('div', { class: 'card-main' },
      h('div', { class: 'streak' },
        h('span', { class: 'streak-num' }, st.streak),
        h('span', { class: 'streak-cap' }, icon('flame'), 'day streak')),
      h('dl', { class: 'mini-stats' },
        stat('Missed', st.missed, st.missed ? 'warn' : ''),
        stat('Best', st.longest),
        stat('Videos', st.total))),
    heatmap(st),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn btn-accent', onclick: () => pick(s) }, icon('record'), st.doneToday ? 'Add another' : 'Record today'),
      h('a', { class: 'btn btn-quiet', href: `#/${s}` }, 'Open', icon('chev'))));
}

function physiqueCard() {
  const es = entriesOf('physique');
  const latest = es[0];
  return h('section', { class: 'card accent-physique' },
    h('div', { class: 'card-top' },
      h('a', { class: 'card-label', href: '#/physique' }, icon('dumbbell'), 'Physique'),
      h('span', { class: 'pill' }, latest ? `Last · ${daysAgo(latest.day)}` : 'No check-ins yet')),
    es.length
      ? h('div', { class: 'strip' }, es.slice(0, 4).map((e) => tile(e)))
      : h('p', { class: 'card-empty' }, 'Film a check-in whenever you like. No streaks, no pressure.'),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn btn-accent', onclick: () => pick('physique') }, icon('plus'), 'Add check-in'),
      h('a', { class: 'btn btn-quiet', href: '#/physique' }, es.length ? plural(es.length, 'video') : 'Open', icon('chev'))));
}

function journalView(s) {
  const st = statsOf(s);
  const byDay = groupBy(entriesOf(s), (e) => e.day);
  const today = byDay.get(state.today) || [];
  const blocks = [];

  blocks.push(h('section', { class: 'day' },
    sectionHead('Today', today.length
      ? plural(today.length, 'video')
      : h('span', { 'data-countdown': '{t} left' }, `${timeLeft()} left`)),
    today.length
      ? grid(today.map((e) => tile(e, { showTime: true })), addTile(s))
      : h('button', { class: 'cta', onclick: () => pick(s) },
          h('span', { class: 'cta-icon' }, icon('record')),
          h('span', { class: 'cta-text' }, h('strong', {}, 'Record today’s entry'),
            h('span', {}, st.streak ? `Keep your ${st.streak}-day streak alive` : 'Start a new streak today')))));

  if (st.start) {
    let misses = [];
    const flush = () => {
      if (!misses.length) return;
      const to = misses[0];
      const from = misses[misses.length - 1];
      blocks.push(h('div', { class: 'missed-row' },
        h('i', { class: 'missed-mark' }),
        h('span', {}, misses.length === 1 ? `Missed · ${dayLabel(to)}` : `Missed · ${shortDay(from)} – ${shortDay(to)}`),
        misses.length > 1 && h('span', { class: 'missed-count' }, plural(misses.length, 'day'))));
      misses = [];
    };
    for (let d = addDays(state.today, -1); d >= st.start; d = addDays(d, -1)) {
      const list = byDay.get(d);
      if (!list) {
        misses.push(d);
        continue;
      }
      flush();
      blocks.push(h('section', { class: 'day' },
        sectionHead(dayLabel(d), plural(list.length, 'video')),
        grid(list.map((e) => tile(e, { showTime: true })))));
    }
    flush();
    blocks.push(h('p', { class: 'foot' }, `Started ${fmtDay(st.start, { month: 'long', day: 'numeric', year: 'numeric' })}`));
  }

  return [
    pageHead(SECTIONS[s].label, SECTIONS[s].title,
      h('button', { class: `icon-btn solid accent-${s}`, onclick: () => pick(s), 'aria-label': 'Record' }, icon('plus'))),
    h('p', { class: 'lede' }, SECTIONS[s].blurb),
    h('dl', { class: `strip-stats accent-${s}` },
      stat('Streak', st.streak, 'accent'),
      stat('Missed', st.missed, st.missed ? 'warn' : ''),
      stat('Best', st.longest),
      stat('Videos', st.total)),
    h('div', { class: `days accent-${s}` }, blocks),
  ];
}

function physiqueView() {
  const es = entriesOf('physique');
  const byMonth = groupBy(es, (e) => e.day.slice(0, 7));
  const first = es[es.length - 1];
  const latest = es[0];
  const blocks = [];
  let isFirst = true;
  for (const [month, list] of byMonth) {
    const label = parseKey(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    blocks.push(h('section', { class: 'day' },
      sectionHead(label, plural(list.length, 'video')),
      grid(isFirst && month === state.today.slice(0, 7) ? addTile('physique') : null, list.map((e) => tile(e)))));
    isFirst = false;
  }
  if (!byMonth.has(state.today.slice(0, 7))) {
    blocks.unshift(h('section', { class: 'day' },
      sectionHead(parseKey(state.today).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      grid(addTile('physique', 'Add check-in'))));
  }

  return [
    pageHead('No daily obligation', 'Physique',
      h('button', { class: 'icon-btn solid accent-physique', onclick: () => pick('physique'), 'aria-label': 'Add' }, icon('plus'))),
    h('p', { class: 'lede' }, SECTIONS.physique.blurb),
    h('dl', { class: 'strip-stats accent-physique' },
      stat('Videos', es.length, 'accent'),
      stat('Latest', latest ? daysAgo(latest.day) : '—'),
      stat('Since', first ? fmtDay(first.day, { month: 'short', year: '2-digit' }) : '—')),
    h('div', { class: 'days accent-physique' }, blocks),
  ];
}

function tabBar(active) {
  return h('nav', { class: 'tabbar' },
    TABS.map(([id, label, ic]) =>
      h('a', { class: `tab ${id === active ? 'active' : ''} accent-${id}`, href: `#/${id}` }, icon(ic), h('span', {}, label))));
}

/* ---------- render loop ---------- */

const route = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return r in SECTIONS ? r : 'home';
};

function render() {
  const r = route();
  const body = r === 'home' ? homeView() : SECTIONS[r].daily ? journalView(r) : physiqueView();
  root.replaceChildren(h('main', { class: `view view-${r}` }, body), tabBar(r));
}

async function refresh() {
  await load();
  render();
}

function tick() {
  const t = dayKey();
  if (t !== state.today) {
    state.today = t;
    render();
    return;
  }
  for (const el of document.querySelectorAll('[data-countdown]')) {
    el.textContent = el.dataset.countdown.replace('{t}', timeLeft());
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
document.addEventListener('visibilitychange', () => !document.hidden && tick());
setInterval(tick, 30000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

refresh();
