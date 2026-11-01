(function () {
'use strict';

/* ================= Datum & Kalenderwoche (ISO 8601) ================= */
const DAY_MS = 864e5;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function ymd(d) { return d.toISOString().slice(0, 10); }
function parseYmd(s) { return new Date(s + 'T00:00:00Z'); }
function todayYmd() { const n = new Date(); return ymd(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
function weekKeyOf(s) {
  const t = parseYmd(s); const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / DAY_MS + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}
function mondayOf(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)); const wd = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() + ((1 - wd) + (w - 1) * 7) * DAY_MS);
}
function shiftWeek(key, n) { return weekKeyOf(ymd(new Date(mondayOf(key).getTime() + n * 7 * DAY_MS))); }
function kwNum(key) { return Number(key.split('-W')[1]); }
function fmtShort(s) { const d = parseYmd(s); return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.'; }
function fmtWd(s) { return WD[parseYmd(s).getUTCDay()]; }
function weekRange(key) { const m = mondayOf(key); return fmtShort(ymd(m)) + '–' + fmtShort(ymd(new Date(m.getTime() + 6 * DAY_MS))); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function num(v) { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? null : n; }
function fmtNum(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
function uid() { return Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6); }

/* ================= Standard-Übungskatalog =================
   Nur Startwert beim allerersten Öffnen. Danach gehört der Katalog der
   Nutzerin (Tab „Übungen“) und wird mit den Daten gesichert. IDs nie
   ändern – die Historie hängt daran. */
const DEFAULT_CATALOG = [
  ['brust', 'Brust', ['Bankdrücken (KH)', 'Schrägbankdrücken (KH)', 'Butterfly Maschine', 'Kabel-Flys', 'Brustpresse Maschine', 'Liegestütze']],
  ['ruecken', 'Rücken', ['Latzug', 'Rudern Kabel sitzend', 'KH Rudern einarmig', 'Klimmzug assistiert', 'Face Pulls', 'Rückenstrecker']],
  ['schultern', 'Schultern', ['Schulterdrücken (KH)', 'Seitheben (KH)', 'Frontheben (KH)', 'Reverse Flys', 'Arnold Press', 'Aufrechtes Rudern']],
  ['bizeps', 'Bizeps', ['Bizeps Curl (KH)', 'Hammer Curl', 'Kabel Curl', 'SZ Curl', 'Konzentrationscurl', 'Preacher Curl']],
  ['trizeps', 'Trizeps', ['Trizeps Pushdown', 'Overhead Extension (KH)', 'Kickbacks (KH)', 'Bank-Dips', 'French Press (SZ)', 'Enges Bankdrücken']],
  ['beine', 'Beine', ['Kniebeugen', 'Beinpresse', 'Ausfallschritte', 'Beinstrecker', 'Beinbeuger', 'Wadenheben']],
  ['po', 'Po', ['Hip Thrust', 'Glute Bridge', 'Kabel-Kickback', 'Abduktoren Maschine', 'Rum. Kreuzheben', 'Step-ups']],
  ['bauch', 'Bauch', ['Crunches', 'Plank (Sek.)', 'Beinheben', 'Russian Twist', 'Bauchmaschine', 'Dead Bug']]
].map(([id, name, list]) => ({ id, name, ex: list.map((n, i) => ({ id: id + '-' + (i + 1), name: n })) }));

/* ================= State =================
   S = {
     version, catalog: [{id, name, archived?, ex: [{id, name, archived?}]}],
     log: { '2026-W44': { days: [{id, date, entries: [{id, ex, sets: [{kg, reps}], done}], notes}] } },
     view: { tab, week, day, histEx, histMetric, catOpen, tlCount },
     lastBackup: 'YYYY-MM-DD' | null, bannerHidden: 'YYYY-MM-DD' | null
   } */
const STATE_KEY = 'state';
const DATA_VERSION = 1;
const MAX_DAYS = 4;
let S;

function freshState() {
  const wk = weekKeyOf(todayYmd());
  return {
    version: DATA_VERSION,
    catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
    log: {},
    view: { tab: 'train', week: wk, day: 0 },
    lastBackup: null,
    bannerHidden: null
  };
}
function normalize(st) {
  const base = freshState();
  const out = Object.assign(base, st || {});
  out.view = Object.assign(base.view, (st && st.view) || {});
  if (!Array.isArray(out.catalog)) out.catalog = base.catalog;
  if (!out.log || typeof out.log !== 'object') out.log = {};
  out.version = DATA_VERSION;
  return out;
}

async function load() {
  try { S = normalize(await window.stapelFlexDB.get(STATE_KEY)); }
  catch (e) { S = freshState(); }
}
let saveT = null;
async function writeNow() {
  clearTimeout(saveT); saveT = null;
  try { await window.stapelFlexDB.set(STATE_KEY, S); return true; } catch (e) { return false; }
}
function save(silent) {
  // Ansichtswechsel (silent) sofort schreiben, damit „öffnet beim letzten Training“ auch nach hartem Beenden stimmt.
  if (silent) { writeNow(); return; }
  clearTimeout(saveT);
  if (!silent) note('speichert…');
  saveT = setTimeout(async () => {
    const ok = await writeNow();
    if (!silent) note(ok ? 'gespeichert' : 'Speichern fehlgeschlagen!');
  }, 300);
}
// Beim Wegwechseln (App in den Hintergrund) sofort schreiben.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveT) writeNow(); });
window.addEventListener('pagehide', () => { if (saveT) writeNow(); });

function note(t) {
  const el = document.getElementById('save-note'); if (!el) return;
  el.textContent = t; el.style.opacity = '1';
  if (t === 'gespeichert') setTimeout(() => { if (el.textContent === 'gespeichert') el.style.opacity = '0'; }, 1100);
}
function toast(t) {
  const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ================= Dauerhafter Speicher ================= */
let persisted = null; // true / false / null (unbekannt)
async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    persisted = await navigator.storage.persisted();
    if (!persisted) persisted = await navigator.storage.persist();
  } catch (e) { /* ignore */ }
}

/* ================= Daten-Helfer ================= */
function exById(id) { for (const g of S.catalog) for (const e of g.ex) if (e.id === id) return { ex: e, group: g }; return null; }
function weekData(key) { if (!S.log[key]) S.log[key] = { days: [] }; return S.log[key]; }
function curDay() { const w = S.log[S.view.week]; return (w && w.days[S.view.day]) || null; }
function sortedWeekKeys() { return Object.keys(S.log).filter(k => S.log[k].days.length).sort(); }
function cleanupEmptyWeeks() { Object.keys(S.log).forEach(k => { if (!S.log[k].days.length) delete S.log[k]; }); }
function activeGroups() { return S.catalog.filter(g => !g.archived); }

// Letzte Ausführung einer Übung VOR einem Datum -> Fortschritts-Hinweis
function lastPerformance(exId, beforeDate) {
  let best = null;
  Object.keys(S.log).forEach(wk => S.log[wk].days.forEach(d => {
    if (d.date >= beforeDate) return;
    const en = d.entries.find(e => e.ex === exId && e.sets.some(s => s.reps));
    if (en && (!best || d.date > best.date)) best = { date: d.date, week: wk, sets: en.sets.filter(s => s.reps) };
  }));
  return best;
}
function allSessions(exId) {
  const out = [];
  Object.keys(S.log).forEach(wk => S.log[wk].days.forEach(d => {
    const en = d.entries.find(e => e.ex === exId);
    if (en) { const sets = en.sets.filter(s => s.reps); if (sets.length) out.push({ date: d.date, week: wk, sets }); }
  }));
  return out.sort((a, b) => a.date < b.date ? -1 : 1);
}
function usageCount(exId) {
  let n = 0; Object.keys(S.log).forEach(wk => S.log[wk].days.forEach(d => { if (d.entries.some(e => e.ex === exId)) n++; })); return n;
}
function setsText(sets) {
  if (!sets.length) return '–';
  const same = sets.every(s => s.kg === sets[0].kg && s.reps === sets[0].reps);
  if (same) return sets.length + '×' + sets[0].reps + ' @ ' + (sets[0].kg ? sets[0].kg + ' kg' : 'KG');
  return sets.map(s => (s.kg || 'KG') + '×' + s.reps).join(' · ');
}
function topKg(sets) { let m = null; sets.forEach(s => { const n = num(s.kg); if (n !== null && (m === null || n > m)) m = n; }); return m; }
function volume(sets) { return sets.reduce((a, s) => a + (num(s.kg) || 0) * (num(s.reps) || 0), 0); }
function dayGroups(d) {
  const names = []; d.entries.forEach(e => { const r = exById(e.ex); if (r && !names.includes(r.group.name)) names.push(r.group.name); });
  return names;
}
function backupAgeDays() { return S.lastBackup ? Math.floor((parseYmd(todayYmd()) - parseYmd(S.lastBackup)) / DAY_MS) : null; }
function hasData() { return sortedWeekKeys().length > 0; }
function backupDue() { const a = backupAgeDays(); return hasData() && (a === null || a > 7); }

/* ================= Render ================= */
const ICONS = {
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/></svg>',
  cat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>'
};
function renderTabbar() {
  const tabs = [['train', 'Training'], ['hist', 'Verlauf'], ['cat', 'Übungen'], ['data', 'Daten']];
  document.getElementById('tabbar').innerHTML = tabs.map(([id, l]) =>
    `<button class="tab ${S.view.tab === id ? 'active' : ''}" data-tab="${id}">${ICONS[id]}${l}${id === 'data' && backupDue() ? '<span class="warn"></span>' : ''}</button>`).join('');
}
function header(sub) {
  return `<div class="header"><div><div class="title">Stapel <span>Flex</span></div><div class="subtitle">${sub}</div></div></div>`;
}
function render() {
  renderTabbar();
  const app = document.getElementById('app');
  if (S.view.tab === 'train') app.innerHTML = renderTrain();
  else if (S.view.tab === 'hist') { app.innerHTML = renderHist(); drawChart(); }
  else if (S.view.tab === 'cat') app.innerHTML = renderCatalog();
  else app.innerHTML = renderData();
}

/* ---------- Training ---------- */
function renderTrain() {
  const curWeek = weekKeyOf(todayYmd());
  const wk = S.view.week, w = S.log[wk] || { days: [] };
  if (S.view.day > w.days.length - 1) S.view.day = Math.max(0, w.days.length - 1);
  const isCur = wk === curWeek;
  let h = header('Flexibles Training · max. ' + MAX_DAYS + ' Tage/Woche');

  if (backupDue() && S.bannerHidden !== todayYmd()) {
    const a = backupAgeDays();
    h += `<div class="banner"><div class="grow"><b>Sicherung fällig</b> · ${a === null ? 'noch nie gesichert' : 'letzte vor ' + a + ' Tagen'}</div><button class="go" data-act="banner-go">SICHERN</button><button data-act="banner-hide" aria-label="Ausblenden">✕</button></div>`;
  }

  h += `<div class="week-nav">
    <button class="nav-btn" data-act="week" data-d="-1" aria-label="Vorherige Woche">◀</button>
    <div class="week-label ${isCur ? 'current' : ''}" data-act="week-pick"><b>KW ${kwNum(wk)}${isCur ? ' · aktuell' : ''}</b><small>${weekRange(wk)}</small></div>
    <button class="nav-btn" data-act="week" data-d="1" aria-label="Nächste Woche">▶</button>
    <button class="today-btn ${isCur ? '' : 'away'}" data-act="today">HEUTE</button>
  </div>`;

  h += `<div class="day-tabs">`;
  w.days.forEach((d, i) => {
    const complete = d.entries.length && d.entries.every(e => e.done);
    h += `<div class="day-tab ${i === S.view.day ? 'active' : ''} ${complete ? 'complete' : ''}" data-act="day" data-i="${i}">Tag ${i + 1}<span class="sub">${fmtWd(d.date)} ${fmtShort(d.date)}</span></div>`;
  });
  if (w.days.length < MAX_DAYS) h += `<div class="day-tab add" data-act="add-day">＋<span class="sub">Tag</span></div>`;
  h += `</div>`;

  const d = w.days[S.view.day];
  if (!d) {
    h += `<div class="empty"><b>Noch kein Training in KW ${kwNum(wk)}</b>Leg einen Trainingstag an und stell dein Training aus den Muskelgruppen zusammen.</div>`;
    h += `<button class="add-ex-btn" data-act="add-day">＋ Trainingstag starten</button>`;
    return h;
  }

  const groups = dayGroups(d);
  const mon = mondayOf(wk);
  h += `<div class="day-meta">
    <input type="date" class="date-input" data-act="date" value="${d.date}" min="${ymd(mon)}" max="${ymd(new Date(mon.getTime() + 6 * DAY_MS))}"/>
    <div class="chips">${groups.map(g => `<span class="chip">${esc(g)}</span>`).join('') || '<span class="chip">noch leer</span>'}</div>
    <button class="icon-btn" data-act="del-day" title="Tag löschen" aria-label="Tag löschen">🗑</button>
  </div>`;

  const total = d.entries.length, doneN = d.entries.filter(e => e.done).length;
  if (total) h += `<div class="stack"><div class="stack-plates">${d.entries.map((e, i) => `<div class="plate ${i < doneN ? 'filled' : ''}"></div>`).join('')}</div><div class="stack-label">${doneN}/${total}</div></div>`;
  else h += `<div class="empty"><b>Was steht heute an?</b>Tippe auf „Übung hinzufügen“ und wähle aus den Muskelgruppen.</div>`;

  d.entries.forEach((en, ei) => {
    const r = exById(en.ex);
    const name = r ? r.ex.name : 'Unbekannte Übung', gname = r ? r.group.name : '';
    const last = lastPerformance(en.ex, d.date);
    let lastHtml;
    if (last) {
      const lt = topKg(last.sets), ct = topKg(en.sets.filter(s => s.reps));
      const up = (lt !== null && ct !== null && ct > lt) ? ` <span class="trend-up">▲ +${fmtNum(ct - lt)} kg</span>` : '';
      lastHtml = `<div class="last-time">Zuletzt (KW ${kwNum(last.week)}, ${fmtWd(last.date)} ${fmtShort(last.date)}): ${esc(setsText(last.sets))}${up}</div>`;
    } else lastHtml = `<div class="last-time" style="border-left-color:var(--text-faint);color:var(--text-faint)">Zum ersten Mal – viel Erfolg!</div>`;
    h += `<div class="card ${en.done ? 'done' : ''}">
      <div class="card-top"><div><div class="ex-name">${esc(name)}</div><div class="ex-group">${esc(gname)}</div></div>
      <button class="check-btn ${en.done ? 'checked' : ''}" data-act="toggle" data-e="${ei}" aria-label="Erledigt">✓</button></div>
      ${lastHtml}
      <div class="sets">${en.sets.map((s, si) => `
        <div class="set-row">
          <div class="set-no">S${si + 1}</div>
          <div class="num-wrap"><input class="num" inputmode="decimal" enterkeyhint="next" placeholder="${last && last.sets[si] ? esc(last.sets[si].kg || '0') : '0'}" value="${esc(s.kg)}" data-act="set" data-e="${ei}" data-s="${si}" data-f="kg"/><span class="unit">kg</span></div>
          <div class="set-x">×</div>
          <div class="num-wrap"><input class="num" inputmode="numeric" enterkeyhint="next" placeholder="${last && last.sets[si] ? esc(last.sets[si].reps) : '12'}" value="${esc(s.reps)}" data-act="set" data-e="${ei}" data-s="${si}" data-f="reps"/><span class="unit">Wdh</span></div>
          <button class="del-set" data-act="del-set" data-e="${ei}" data-s="${si}" aria-label="Satz löschen">✕</button>
        </div>`).join('')}
      </div>
      <div class="card-actions"><button class="link-btn" data-act="add-set" data-e="${ei}">＋ Satz</button><button class="link-btn danger" data-act="del-ex" data-e="${ei}">Übung entfernen</button></div>
    </div>`;
  });

  h += `<button class="add-ex-btn" data-act="picker">＋ Übung hinzufügen</button>`;
  h += `<div class="notes-box"><div class="lbl">Notizen zum Tag</div><textarea class="notes-input" data-act="notes" placeholder="z.B. Cardio, Energielevel, Auffälligkeiten…">${esc(d.notes)}</textarea></div>`;
  const lastDay = S.view.day === w.days.length - 1, allDone = total && doneN === total;
  if (lastDay && allDone && w.days.length < MAX_DAYS)
    h += `<button class="add-ex-btn" data-act="add-day" style="border-color:var(--accent);color:var(--accent)">Training fertig 🎉 · Nächsten Tag anlegen</button>`;
  if (lastDay && (w.days.length >= MAX_DAYS || allDone))
    h += `<button class="add-ex-btn" data-act="week" data-d="1">Weiter zu KW ${kwNum(shiftWeek(wk, 1))} ▶</button>`;
  h += `<div class="save-note" id="save-note"></div>`;
  return h;
}

/* ---------- Übungs-Picker (Muskelgruppen als Dropdowns) ---------- */
function openPicker(openGroup) {
  const d = curDay(); if (!d) return;
  const inDay = d.entries.map(e => e.ex);
  let h = `<div class="sheet-head"><div class="sheet-title">Übung hinzufügen</div><button class="sheet-close" data-act="close">✕</button></div><div class="sheet-body" id="picker-body">`;
  activeGroups().forEach(g => {
    const exs = g.ex.filter(e => !e.archived);
    h += `<details class="group" ${openGroup === g.id ? 'open' : ''} data-g="${g.id}"><summary><span class="gdot"></span>${esc(g.name)}<span class="count">${exs.length} Übungen</span></summary>`;
    exs.forEach(e => {
      const last = lastPerformance(e.id, '9999-12-31');
      const added = inDay.includes(e.id);
      h += `<div class="ex-row" data-act="pick" data-ex="${e.id}" data-g="${g.id}"><div class="nm">${esc(e.name)}<div class="meta">${last ? 'zuletzt ' + fmtShort(last.date) + ' · ' + esc(setsText(last.sets)) : 'noch nie trainiert'}</div></div>${added ? '<span class="added">✓ drin</span>' : '<span class="plus">＋</span>'}</div>`;
    });
    h += `<div class="new-ex"><input class="txt" placeholder="Neue Übung in ${esc(g.name)}…" data-newex="${g.id}"/><button class="small-btn" data-act="new-ex-pick" data-g="${g.id}">＋</button></div></details>`;
  });
  h += `</div>`;
  const prev = document.getElementById('picker-body'); const scroll = prev ? prev.scrollTop : 0;
  showSheet(h);
  document.getElementById('picker-body').scrollTop = scroll;
}

/* ---------- Verlauf ---------- */
function renderHist() {
  if (!S.view.histEx || !exById(S.view.histEx)) {
    let best = null;
    Object.keys(S.log).forEach(wk => S.log[wk].days.forEach(d => d.entries.forEach(e => { if (!best || d.date > best.d) best = { d: d.date, ex: e.ex }; })));
    S.view.histEx = best ? best.ex : (activeGroups()[0] && activeGroups()[0].ex[0] ? activeGroups()[0].ex[0].id : null);
  }
  const metric = S.view.histMetric || 'kg';
  let h = header('Fortschritt über die Zeitleiste');
  h += `<div class="section-title">Übung</div><div class="select-wrap"><select class="select" data-act="hist-ex">`;
  S.catalog.forEach(g => {
    const exs = g.ex.filter(e => !e.archived || allSessions(e.id).length);
    if (!exs.length) return;
    h += `<optgroup label="${esc(g.name)}">` + exs.map(e => `<option value="${e.id}" ${e.id === S.view.histEx ? 'selected' : ''}>${esc(e.name)}${allSessions(e.id).length ? '' : ' (–)'}</option>`).join('') + `</optgroup>`;
  });
  h += `</select></div>`;
  h += `<div class="seg"><button class="${metric === 'kg' ? 'on' : ''}" data-act="metric" data-m="kg">Top-Gewicht</button><button class="${metric === 'vol' ? 'on' : ''}" data-act="metric" data-m="vol">Volumen</button><button class="${metric === 'reps' ? 'on' : ''}" data-act="metric" data-m="reps">Wdh gesamt</button></div>`;
  h += `<div class="chart-card" id="chart-card"></div>`;

  const sess = S.view.histEx ? allSessions(S.view.histEx).slice().reverse() : [];
  if (sess.length) {
    h += `<div class="info-card" style="padding:4px 14px">` + sess.map((s, i) => `<div class="hist-row" data-act="goto" data-wk="${s.week}" data-date="${s.date}" style="cursor:pointer${i === 0 ? ';border-top:none' : ''}"><div class="d">KW${kwNum(s.week)} · ${fmtWd(s.date)} ${fmtShort(s.date)}</div><div class="s">${esc(setsText(s.sets))}</div></div>`).join('') + `</div>`;
  }

  h += `<div class="section-title">Zeitleiste · Wochen</div>`;
  const cur = weekKeyOf(todayYmd());
  const count = S.view.tlCount || 8;
  for (let i = 0; i < count; i++) {
    const wk = shiftWeek(cur, -i); const w = S.log[wk];
    const days = w ? w.days : [];
    const groups = []; days.forEach(d => dayGroups(d).forEach(g => { if (!groups.includes(g)) groups.push(g); }));
    h += `<div class="tl-week ${wk === cur ? 'current' : ''}" data-act="goto" data-wk="${wk}"><div class="tl-kw">KW${kwNum(wk)}</div><div class="tl-days">${[0, 1, 2, 3].map(j => `<div class="tl-dot ${j < days.length ? 'on' : ''}"></div>`).join('')}</div><div class="tl-groups">${groups.length ? esc(groups.join(' · ')) : '<span style="color:var(--text-faint)">kein Training</span>'}</div><div class="tl-arrow">›</div></div>`;
  }
  h += `<button class="more-btn" data-act="tl-more">Ältere Wochen anzeigen</button>`;
  return h;
}

function drawChart() {
  const card = document.getElementById('chart-card'); if (!card) return;
  const metric = S.view.histMetric || 'kg';
  const sess = S.view.histEx ? allSessions(S.view.histEx) : [];
  const val = s => metric === 'kg' ? topKg(s.sets) : metric === 'vol' ? volume(s.sets) : s.sets.reduce((a, x) => a + (num(x.reps) || 0), 0);
  const unit = metric === 'kg' ? 'kg' : metric === 'vol' ? 'kg·Wdh' : 'Wdh';
  const pts = sess.map(s => ({ s, v: val(s) })).filter(p => p.v !== null && p.v > 0);
  const title = metric === 'kg' ? 'Schwerster Satz pro Training' : metric === 'vol' ? 'Volumen (kg × Wdh) pro Training' : 'Wiederholungen gesamt pro Training';
  if (!pts.length) { card.innerHTML = `<div class="chart-head"><div class="chart-title">${title}</div></div><div class="empty" style="border:none;margin:0">Noch keine Daten für diese Übung.</div>`; return; }
  const first = pts[0].v, last = pts[pts.length - 1].v, diff = last - first;
  card.innerHTML = `<div class="chart-head"><div><div class="chart-title">${title}</div><div class="hero">${fmtNum(last)}<small>${unit}</small></div></div><div class="delta">${pts.length > 1 ? (diff >= 0 ? '▲ +' : '▼ ') + fmtNum(diff) + ' ' + unit + ' seit ' + fmtShort(pts[0].s.date) : 'erstes Training'}</div></div><svg id="chart" viewBox="0 0 340 150" width="100%" style="display:block;overflow:visible" role="img" aria-label="${title}"></svg><div class="tooltip" id="tt"></div>`;
  const W = 340, H = 150, pl = 34, pr = 10, pt = 10, pb = 22;
  const vs = pts.map(p => p.v); let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo = lo * 0.8; hi = hi * 1.2 || 1; } else { const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi = hi + pad; }
  { const raw = (hi - lo) / 3, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= raw); lo = Math.floor(lo / step) * step; hi = lo + step * 3; while (hi < Math.max(...vs)) hi += step; }
  const t0 = parseYmd(pts[0].s.date).getTime(), t1 = parseYmd(pts[pts.length - 1].s.date).getTime();
  const x = d => pts.length === 1 ? (pl + W - pr) / 2 : pl + (parseYmd(d).getTime() - t0) / (t1 - t0) * (W - pl - pr);
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let svg = '';
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, yy = y(v); svg += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="#33363C" stroke-width="1"/><text x="${pl - 6}" y="${yy + 3}" fill="#5C5F66" font-size="9" font-family="JetBrains Mono,monospace" text-anchor="end">${fmtNum(v)}</text>`; }
  const labelIdx = pts.length <= 5 ? pts.map((_, i) => i) : [0, Math.floor(pts.length / 2), pts.length - 1];
  labelIdx.forEach(i => { svg += `<text x="${x(pts[i].s.date)}" y="${H - 6}" fill="#5C5F66" font-size="9" font-family="JetBrains Mono,monospace" text-anchor="middle">KW${kwNum(pts[i].s.week)}</text>`; });
  svg += `<line id="xh" y1="${pt}" y2="${H - pb}" stroke="#5C5F66" stroke-width="1" stroke-dasharray="2 3" style="display:none"/>`;
  svg += `<polyline fill="none" stroke="#C9A050" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => x(p.s.date) + ',' + y(p.v)).join(' ')}"/>`;
  pts.forEach(p => { svg += `<circle cx="${x(p.s.date)}" cy="${y(p.v)}" r="4" fill="#C9A050" stroke="#1F2124" stroke-width="2"/>`; });
  const hitW = Math.max(16, Math.min(40, (W - pl - pr) / pts.length));
  pts.forEach((p, i) => { svg += `<rect class="hit" data-i="${i}" x="${x(p.s.date) - hitW / 2}" y="${pt}" width="${hitW}" height="${H - pt - pb}" fill="transparent"/>`; });
  const el = document.getElementById('chart'); el.innerHTML = svg;
  const tt = document.getElementById('tt'), xh = document.getElementById('xh');
  const show = i => {
    const p = pts[i]; const sc = el.getBoundingClientRect().width / W;
    tt.innerHTML = `<b>${fmtNum(p.v)} ${unit}</b><br>KW${kwNum(p.s.week)} · ${fmtWd(p.s.date)} ${fmtShort(p.s.date)}<br><span style="color:#93969D">${esc(setsText(p.s.sets))}</span>`;
    tt.style.display = 'block';
    tt.style.left = Math.min(Math.max(x(p.s.date) * sc + 12, 70), card.clientWidth - 70) + 'px';
    tt.style.top = (y(p.v) * sc + el.offsetTop - 6) + 'px';
    xh.setAttribute('x1', x(p.s.date)); xh.setAttribute('x2', x(p.s.date)); xh.style.display = '';
  };
  el.querySelectorAll('.hit').forEach(r => { r.addEventListener('pointerenter', () => show(+r.dataset.i)); r.addEventListener('pointerdown', () => show(+r.dataset.i)); });
  el.addEventListener('pointerleave', () => { tt.style.display = 'none'; xh.style.display = 'none'; });
}

/* ---------- Übungen verwalten ---------- */
function renderCatalog() {
  let h = header('Übungen je Muskelgruppe · iterativ erweiterbar');
  activeGroups().forEach(g => {
    const exs = g.ex.filter(e => !e.archived), arch = g.ex.filter(e => e.archived);
    h += `<details class="group" data-g="${g.id}" ${S.view.catOpen === g.id ? 'open' : ''}><summary><span class="gdot"></span>${esc(g.name)}<span class="count">${exs.length}</span></summary>`;
    exs.forEach(e => {
      const n = usageCount(e.id);
      h += `<div class="new-ex"><input class="txt" value="${esc(e.name)}" data-act="rename-ex" data-ex="${e.id}" aria-label="Name der Übung"/><span style="align-self:center;font-family:var(--mono);font-size:10px;color:var(--text-faint);min-width:28px;text-align:right" title="so oft trainiert">${n}×</span><button class="small-btn danger" data-act="del-cat-ex" data-ex="${e.id}" aria-label="Übung entfernen">✕</button></div>`;
    });
    h += `<div class="new-ex"><input class="txt" placeholder="＋ Neue Übung…" data-newex="${g.id}"/><button class="small-btn" data-act="new-ex" data-g="${g.id}">Anlegen</button></div>`;
    arch.forEach(e => { h += `<div class="archived-row"><span>Archiviert: ${esc(e.name)}</span><button class="small-btn" data-act="unarchive-ex" data-ex="${e.id}">Zurückholen</button></div>`; });
    h += `<div class="new-ex" style="justify-content:space-between"><input class="txt" value="${esc(g.name)}" data-act="rename-group" data-g="${g.id}" style="flex:0 1 60%" aria-label="Name der Muskelgruppe"/><button class="small-btn danger" data-act="del-group" data-g="${g.id}">Gruppe entfernen</button></div>`;
    h += `</details>`;
  });
  h += `<div class="new-ex" style="padding:4px 0;border:none"><input class="txt" id="new-group" placeholder="Neue Muskelgruppe, z.B. Waden, Cardio…"/><button class="small-btn" data-act="new-group">＋ Gruppe</button></div>`;
  const archG = S.catalog.filter(g => g.archived);
  if (archG.length) {
    h += `<div class="section-title">Archivierte Gruppen</div>`;
    archG.forEach(g => { h += `<div class="archived-row" style="border:1px solid var(--border);border-radius:10px;margin-bottom:6px"><span>${esc(g.name)}</span><button class="small-btn" data-act="unarchive-group" data-g="${g.id}">Zurückholen</button></div>`; });
  }
  h += `<div class="note-mock">Umbenennen ändert die Historie nicht. Übungen mit Historie werden beim Entfernen archiviert (Verlauf bleibt erhalten), ungenutzte werden gelöscht.</div>`;
  return h;
}

/* ---------- Daten ---------- */
function renderData() {
  const age = backupAgeDays();
  const weeks = sortedWeekKeys(); const nDays = weeks.reduce((a, k) => a + S.log[k].days.length, 0);
  const nEx = S.catalog.reduce((a, g) => a + (g.archived ? 0 : g.ex.filter(e => !e.archived).length), 0);
  const warn = backupDue();
  let h = header('Export · Sicherung · Wiederherstellung');
  h += `<div class="info-card ${warn ? 'warn' : ''}"><h3>Letzte Sicherung</h3>
    <p class="${warn ? 'warn-text' : ''}">${age === null ? (hasData() ? 'Noch nie gesichert!' : 'Noch keine Daten zum Sichern.') : age === 0 ? 'Heute gesichert ✓' : 'Vor ' + age + ' Tagen (' + fmtShort(S.lastBackup) + ')'}${warn && age !== null ? ' – bitte bald sichern.' : ''}</p>
    <div class="stat">${nDays} Trainingstage · ${weeks.length} Wochen · ${nEx} Übungen</div>
    <div class="stat" style="margin-top:6px;color:var(--text-faint)">Speicher: ${persisted === true ? 'dauerhaft ✓' : persisted === false ? 'nicht dauerhaft – App zum Home-Bildschirm hinzufügen' : 'unbekannt'}</div></div>`;

  h += `<div class="info-card"><h3>Sicherung erstellen</h3><p>Komplette Datei (Übungen + alle Trainings). Öffnet das Teilen-Menü – z.B. „In Dateien sichern“ (iCloud Drive), AirDrop oder Mail.</p>
    <button class="big-btn" data-act="backup">Sicherung erstellen</button>
    <button class="link-btn" data-act="backup-text" style="margin-top:8px">oder als Text anzeigen &amp; kopieren</button></div>`;

  h += `<div class="info-card"><h3>Wiederherstellen</h3><p>Sicherungsdatei wählen oder Text einfügen. Vor dem Überschreiben siehst du, was drin ist.</p>
    <div class="btn-row"><button class="big-btn secondary" data-act="restore-file">Datei wählen</button><button class="big-btn secondary" data-act="restore-paste">Text einfügen</button></div>
    ${hasUndo ? '<button class="link-btn" data-act="undo-restore" style="margin-top:8px">↶ Stand vor der letzten Wiederherstellung zurückholen</button>' : ''}</div>`;

  h += `<div class="info-card"><h3>Export (lesbar)</h3><p>Textübersicht pro Woche – zum Teilen oder Einfügen in einen Chat.</p>
    <div class="btn-row"><button class="big-btn secondary" data-act="export" data-scope="week">Angezeigte Woche</button><button class="big-btn secondary" data-act="export" data-scope="all">Alles</button></div></div>`;

  h += `<div class="info-card"><h3>Alle Daten löschen</h3><p>Setzt die App komplett zurück (Übungen auf Standard, alle Trainings weg). Vorher unbedingt sichern.</p><button class="big-btn danger" data-act="wipe">Alles löschen</button></div>`;
  h += `<div class="save-note" id="save-note"></div>`;
  return h;
}

/* ================= Sicherung / Export ================= */
function backupPayload() { return { app: 'stapel-flex', version: DATA_VERSION, exportedAt: new Date().toISOString(), catalog: S.catalog, log: S.log }; }
function backupFilename() { return 'stapelflex-backup-' + todayYmd() + '.json'; }
function markBackedUp() { S.lastBackup = todayYmd(); save(true); render(); }

async function doBackup() {
  const json = JSON.stringify(backupPayload(), null, 2);
  const name = backupFilename();
  let file = null;
  try { file = new File([json], name, { type: 'application/json' }); } catch (e) { /* alter Browser */ }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Stapel Flex Sicherung' });
      markBackedUp(); toast('Sicherung geteilt ✓');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') { toast('Abgebrochen – nicht gesichert'); return; }
      // sonst: auf Download zurückfallen
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markBackedUp(); toast('Sicherung heruntergeladen ✓');
  } catch (e) {
    textSheet('Sicherung · ' + name, json, true);
  }
}

function exportText(scope) {
  const keys = scope === 'week' ? [S.view.week] : sortedWeekKeys();
  const L = ['STAPEL FLEX — Trainings', 'Exportiert am: ' + new Date().toLocaleDateString('de-DE'), ''];
  keys.forEach(k => {
    const w = S.log[k]; if (!w || !w.days.length) return;
    L.push('== KW' + kwNum(k) + ' (' + weekRange(k) + ') ==');
    w.days.forEach((d, i) => {
      L.push('Tag ' + (i + 1) + ' · ' + fmtWd(d.date) + ' ' + fmtShort(d.date) + ' · ' + dayGroups(d).join(', '));
      d.entries.forEach(e => { const r = exById(e.ex); L.push('  [' + (e.done ? '✓' : ' ') + '] ' + (r ? r.ex.name : e.ex) + ': ' + setsText(e.sets.filter(s => s.reps))); });
      if (d.notes && d.notes.trim()) L.push('  Notiz: ' + d.notes.trim());
    });
    L.push('');
  });
  if (L.length === 3) L.push('(keine Trainings)');
  return L.join('\n');
}

let hasUndo = false;
function validBackup(p) {
  return p && typeof p === 'object' && Array.isArray(p.catalog) && p.log && typeof p.log === 'object' &&
    Object.keys(p.log).every(k => /^\d{4}-W\d{2}$/.test(k) && Array.isArray(p.log[k].days));
}
function previewRestore(parsed) {
  if (!validBackup(parsed)) { toast('Keine gültige Stapel-Flex-Sicherung'); return; }
  const wk = Object.keys(parsed.log).filter(k => parsed.log[k].days.length).sort();
  const nd = wk.reduce((a, k) => a + parsed.log[k].days.length, 0);
  confirmSheet('Sicherung einspielen?', `Sicherung vom <b>${esc((parsed.exportedAt || '?').slice(0, 10))}</b>: ${nd} Trainingstage in ${wk.length} Wochen${wk.length ? ' (KW' + kwNum(wk[0]) + ' ' + wk[0].slice(0, 4) + ' – KW' + kwNum(wk[wk.length - 1]) + ' ' + wk[wk.length - 1].slice(0, 4) + ')' : ''}.<br><br>Die aktuellen Daten werden ersetzt. Der bisherige Stand wird als Rückfall-Kopie behalten.`, 'Ersetzen', async () => {
    try { await window.stapelFlexDB.set('state-before-restore', S); hasUndo = true; } catch (e) { /* ignore */ }
    const view = S.view;
    S = normalize({ catalog: parsed.catalog, log: parsed.log, lastBackup: todayYmd(), view });
    jumpToLatest(); S.view.tab = 'train';
    await writeNow(); render(); toast('Wiederhergestellt ✓');
  }, true);
}

/* ================= Sheets ================= */
function showSheet(html) { document.getElementById('sheet').innerHTML = html; document.getElementById('overlay').classList.remove('hidden'); }
function closeSheet() { document.getElementById('overlay').classList.add('hidden'); if (S.view.tab === 'train') render(); }
function confirmSheet(title, text, okLabel, onOk, danger) {
  showSheet(`<div class="sheet-head"><div class="sheet-title">${esc(title)}</div><button class="sheet-close" data-act="close">✕</button></div><p style="margin:0;font-size:13px;color:var(--text-dim);line-height:1.5">${text}</p><div class="btn-row"><button class="big-btn secondary" data-act="close">Abbrechen</button><button class="big-btn ${danger ? 'danger' : ''}" id="confirm-ok">${esc(okLabel)}</button></div>`);
  document.getElementById('confirm-ok').onclick = () => { document.getElementById('overlay').classList.add('hidden'); onOk(); };
}
let sheetIsBackup = false;
function textSheet(title, text, isBackup) {
  sheetIsBackup = !!isBackup;
  showSheet(`<div class="sheet-head"><div class="sheet-title">${esc(title)}</div><button class="sheet-close" data-act="close">✕</button></div><pre class="pre" id="sheet-pre">${esc(text)}</pre><button class="big-btn" data-act="copy">Kopieren</button>`);
}

/* ================= Aktionen ================= */
function jumpToLatest() {
  // Öffnet beim zuletzt angelegten Trainingstag (bzw. aktueller Woche, wenn leer)
  const keys = sortedWeekKeys();
  if (!keys.length) { S.view.week = weekKeyOf(todayYmd()); S.view.day = 0; return; }
  const wk = keys[keys.length - 1];
  S.view.week = wk; S.view.day = S.log[wk].days.length - 1;
}
function addDay() {
  const wk = S.view.week, w = weekData(wk);
  if (w.days.length >= MAX_DAYS) { toast('Max. ' + MAX_DAYS + ' Trainingstage pro Woche'); return; }
  const t = todayYmd(); const mon = mondayOf(wk);
  let date;
  if (weekKeyOf(t) === wk) date = t;
  else {
    const lastDate = w.days.length ? w.days[w.days.length - 1].date : null;
    const next = lastDate ? new Date(parseYmd(lastDate).getTime() + DAY_MS) : mon;
    date = weekKeyOf(ymd(next)) === wk ? ymd(next) : ymd(new Date(mon.getTime() + 6 * DAY_MS));
  }
  w.days.push({ id: uid(), date, entries: [], notes: '' });
  w.days.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  S.view.day = w.days.length - 1;
  save(); render(); window.scrollTo(0, 0);
  setTimeout(() => openPicker(), 50);
}
function addEntry(exId) {
  const d = curDay(); if (!d) return;
  if (d.entries.some(e => e.ex === exId)) { toast('Schon im Training'); return; }
  const last = lastPerformance(exId, d.date);
  // Sätze vom letzten Mal als Vorlage: Gewicht vorbelegt, Wdh frisch eintragen
  const sets = last ? last.sets.map(s => ({ kg: s.kg, reps: '' })) : [{ kg: '', reps: '' }, { kg: '', reps: '' }, { kg: '', reps: '' }];
  d.entries.push({ id: uid(), ex: exId, sets, done: false });
  save(); toast('Hinzugefügt: ' + exById(exId).ex.name);
}
function newExercise(gid) {
  const inp = document.querySelector(`[data-newex="${gid}"]`); const name = inp && inp.value.trim();
  if (!name) { if (inp) inp.focus(); return null; }
  const g = S.catalog.find(x => x.id === gid); const id = gid + '-' + uid();
  g.ex.push({ id, name }); return id;
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { S.view.tab = t.dataset.tab; save(true); render(); window.scrollTo(0, 0); return; }
  const a = t.dataset.act, d = curDay();
  const ei = +t.dataset.e, si = +t.dataset.s;
  switch (a) {
    case 'week': S.view.week = shiftWeek(S.view.week, +t.dataset.d); S.view.day = Math.max(0, ((S.log[S.view.week] || { days: [] }).days.length) - 1); save(true); render(); window.scrollTo(0, 0); break;
    case 'today': {
      const cw = weekKeyOf(todayYmd()); S.view.week = cw;
      const days = (S.log[cw] || { days: [] }).days; const idx = days.findIndex(x => x.date === todayYmd());
      S.view.day = idx >= 0 ? idx : Math.max(0, days.length - 1); save(true); render(); toast('Aktuelle Woche: KW ' + kwNum(cw)); break;
    }
    case 'week-pick': S.view.tab = 'hist'; save(true); render(); setTimeout(() => { const el = document.querySelector('.tl-week'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50); break;
    case 'day': S.view.day = +t.dataset.i; save(true); render(); break;
    case 'add-day': addDay(); break;
    case 'del-day': confirmSheet('Trainingstag löschen?', `Tag ${S.view.day + 1} (${fmtWd(d.date)} ${fmtShort(d.date)}) mit ${d.entries.length} Übungen wird gelöscht.`, 'Löschen', () => { S.log[S.view.week].days.splice(S.view.day, 1); cleanupEmptyWeeks(); S.view.day = Math.max(0, S.view.day - 1); save(); render(); }, true); break;
    case 'toggle': d.entries[ei].done = !d.entries[ei].done; save(); render(); break;
    case 'add-set': { const s = d.entries[ei].sets; const l = s[s.length - 1] || { kg: '', reps: '' }; s.push({ kg: l.kg, reps: '' }); save(); render(); break; }
    case 'del-set': d.entries[ei].sets.splice(si, 1); if (!d.entries[ei].sets.length) d.entries[ei].sets.push({ kg: '', reps: '' }); save(); render(); break;
    case 'del-ex': {
      const en = d.entries[ei]; const filled = en.sets.some(s => s.reps);
      const doIt = () => { d.entries.splice(ei, 1); save(); render(); };
      if (filled) confirmSheet('Übung entfernen?', 'Die eingetragenen Sätze dieser Übung an diesem Tag gehen verloren.', 'Entfernen', doIt, true); else doIt();
      break;
    }
    case 'picker': openPicker(); break;
    case 'pick': addEntry(t.dataset.ex); openPicker(t.dataset.g); break;
    case 'new-ex-pick': { const id = newExercise(t.dataset.g); if (id) { addEntry(id); openPicker(t.dataset.g); } break; }
    case 'new-ex': { const id = newExercise(t.dataset.g); if (id) { S.view.catOpen = t.dataset.g; save(); render(); toast('Übung angelegt'); } break; }
    case 'del-cat-ex': {
      const r = exById(t.dataset.ex); const n = usageCount(t.dataset.ex);
      if (n) { r.ex.archived = true; save(); render(); toast('Archiviert – Verlauf bleibt erhalten'); }
      else confirmSheet('Übung löschen?', `„${esc(r.ex.name)}“ wurde noch nie trainiert und wird gelöscht.`, 'Löschen', () => { r.group.ex = r.group.ex.filter(e => e !== r.ex); save(); render(); }, true);
      break;
    }
    case 'unarchive-ex': { const r = exById(t.dataset.ex); delete r.ex.archived; save(); render(); break; }
    case 'del-group': {
      const g = S.catalog.find(x => x.id === t.dataset.g);
      const used = g.ex.some(e => usageCount(e.id));
      confirmSheet('Gruppe entfernen?', used ? `„${esc(g.name)}“ wird archiviert – der Verlauf bleibt erhalten und du kannst sie zurückholen.` : `„${esc(g.name)}“ mit ${g.ex.length} Übungen wird gelöscht.`, used ? 'Archivieren' : 'Löschen', () => {
        if (used) g.archived = true; else S.catalog = S.catalog.filter(x => x !== g);
        save(); render();
      }, true);
      break;
    }
    case 'unarchive-group': { const g = S.catalog.find(x => x.id === t.dataset.g); delete g.archived; S.view.catOpen = g.id; save(); render(); break; }
    case 'new-group': { const inp = document.getElementById('new-group'); const n = inp.value.trim(); if (!n) { inp.focus(); return; } const id = 'g-' + uid(); S.catalog.push({ id, name: n, ex: [] }); S.view.catOpen = id; save(); render(); break; }
    case 'metric': S.view.histMetric = t.dataset.m; save(true); render(); break;
    case 'tl-more': S.view.tlCount = (S.view.tlCount || 8) + 8; render(); break;
    case 'goto': {
      const wk = t.dataset.wk; S.view.tab = 'train'; S.view.week = wk;
      const days = (S.log[wk] || { days: [] }).days;
      const i = t.dataset.date ? days.findIndex(x => x.date === t.dataset.date) : days.length - 1;
      S.view.day = Math.max(0, i); save(true); render(); window.scrollTo(0, 0); break;
    }
    case 'banner-go': S.view.tab = 'data'; save(true); render(); window.scrollTo(0, 0); break;
    case 'banner-hide': S.bannerHidden = todayYmd(); save(true); render(); break;
    case 'backup': doBackup(); break;
    case 'backup-text': textSheet('Sicherung · ' + backupFilename(), JSON.stringify(backupPayload(), null, 2), true); break;
    case 'copy': {
      const pre = document.getElementById('sheet-pre'); const txt = pre.textContent;
      const done = () => { toast('Kopiert ✓'); if (sheetIsBackup) { S.lastBackup = todayYmd(); save(true); renderTabbar(); } };
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(done).catch(() => {
        const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        toast('Markiert – bitte manuell kopieren');
      });
      break;
    }
    case 'export': textSheet('Export', exportText(t.dataset.scope), false); break;
    case 'restore-file': document.getElementById('restore-input').click(); break;
    case 'restore-paste': showSheet(`<div class="sheet-head"><div class="sheet-title">Sicherung einfügen</div><button class="sheet-close" data-act="close">✕</button></div><textarea class="notes-input" id="paste-json" style="min-height:200px;font-family:var(--mono);font-size:11px" placeholder="Text der Sicherung hier einfügen…"></textarea><button class="big-btn" data-act="paste-go">Prüfen</button>`); break;
    case 'paste-go': { let p; try { p = JSON.parse(document.getElementById('paste-json').value); } catch (e) { toast('Kein gültiger Sicherungs-Text'); return; } previewRestore(p); break; }
    case 'undo-restore': confirmSheet('Vorherigen Stand zurückholen?', 'Ersetzt die aktuellen Daten durch den Stand vor der letzten Wiederherstellung.', 'Zurückholen', async () => {
      try { const prev = await window.stapelFlexDB.get('state-before-restore'); if (!prev) { toast('Kein vorheriger Stand vorhanden'); return; } S = normalize(prev); await window.stapelFlexDB.set('state-before-restore', null); hasUndo = false; await writeNow(); render(); toast('Zurückgeholt ✓'); } catch (e) { toast('Fehlgeschlagen'); }
    }, true); break;
    case 'wipe': confirmSheet('Wirklich alles löschen?', 'Alle Trainings und eigenen Übungen werden gelöscht. Das kann nicht rückgängig gemacht werden (außer mit einer Sicherung).', 'Alles löschen', async () => {
      try { await window.stapelFlexDB.set('state-before-restore', S); hasUndo = true; } catch (e) { /* ignore */ }
      S = freshState(); await writeNow(); render(); toast('Zurückgesetzt');
    }, true); break;
    case 'close': closeSheet(); break;
  }
});

document.addEventListener('input', ev => {
  const t = ev.target, a = t.dataset.act;
  if (a === 'set') { const d = curDay(); d.entries[+t.dataset.e].sets[+t.dataset.s][t.dataset.f] = t.value.trim(); save(); }
  else if (a === 'notes') { curDay().notes = t.value; save(); }
  else if (a === 'rename-ex') { const r = exById(t.dataset.ex); if (r && t.value.trim()) { r.ex.name = t.value.trim(); save(true); } }
  else if (a === 'rename-group') { const g = S.catalog.find(x => x.id === t.dataset.g); if (g && t.value.trim()) { g.name = t.value.trim(); save(true); } }
});
document.addEventListener('change', ev => {
  const t = ev.target, a = t.dataset.act;
  if (a === 'date') {
    const d = curDay(); const w = S.log[S.view.week];
    if (t.value && weekKeyOf(t.value) === S.view.week) {
      d.date = t.value; w.days.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
      S.view.day = w.days.indexOf(d); save(); render();
    } else { toast('Datum muss in KW ' + kwNum(S.view.week) + ' liegen'); render(); }
  } else if (a === 'hist-ex') { S.view.histEx = t.value; save(true); render(); }
  else if (a === 'set') {
    // Alle Sätze mit Wdh ausgefüllt -> Übung automatisch abhaken
    const en = curDay().entries[+t.dataset.e];
    if (en.sets.every(s => s.reps) && !en.done) { en.done = true; save(); render(); }
  } else if (a === 'rename-ex' || a === 'rename-group') render();
  else if (t.id === 'restore-input') {
    const f = t.files && t.files[0]; if (!f) return;
    f.text().then(x => { let p; try { p = JSON.parse(x); } catch (e) { toast('Datei nicht lesbar'); return; } previewRestore(p); });
    t.value = '';
  }
});
document.addEventListener('toggle', ev => {
  const el = ev.target;
  if (el.matches && el.matches('details.group') && S.view.tab === 'cat' && el.open) { S.view.catOpen = el.dataset.g; save(true); }
}, true);
document.getElementById('overlay').addEventListener('click', ev => { if (ev.target.id === 'overlay') closeSheet(); });

// Wischen links/rechts auf dem Trainingsscreen = Tag wechseln
let sx = null, sy = null;
const appEl = document.getElementById('app');
appEl.addEventListener('touchstart', e => { if (e.target.closest('input,textarea,select,svg')) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
appEl.addEventListener('touchend', e => {
  if (sx === null || S.view.tab !== 'train') return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
  if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
  const n = (S.log[S.view.week] || { days: [] }).days.length;
  if (dx < 0 && S.view.day < n - 1) S.view.day++; else if (dx > 0 && S.view.day > 0) S.view.day--; else return;
  save(true); render();
});

/* ================= Start ================= */
async function init() {
  appEl.innerHTML = '<div style="padding:40px;text-align:center;color:#93969D">Lädt…</div>';
  await load();
  // Beim Start immer im Training beim zuletzt geöffneten Tag (view wird gespeichert).
  S.view.tab = 'train';
  if (!S.log[S.view.week] || !S.log[S.view.week].days.length) {
    // gespeicherte Ansicht zeigt eine leere Woche -> zum letzten Training springen
    jumpToLatest();
  }
  try { hasUndo = !!(await window.stapelFlexDB.get('state-before-restore')); } catch (e) { /* ignore */ }
  render();
  if (curDay()) setTimeout(() => toast('Weiter bei Tag ' + (S.view.day + 1) + ' · KW ' + kwNum(S.view.week)), 300);
  await requestPersist();
  writeNow();
}
init();

})();
