/* English Offline – logika aplikacji. Zero połączeń sieciowych poza własnymi plikami (cache service workera). */
(function () {
  'use strict';
  var DB = self.ENG_DB || { version: '?', tasks: [], vocab: [], assets: [] };
  var C = self.Checker;
  var app = document.getElementById('app');

  var TYPE = { gap: 'Uzupełnij lukę', translate: 'Przetłumacz na angielski', order: 'Ułóż zdanie', fix: 'Znajdź i popraw błąd',
    dialog: 'Dialog – uzupełnij', conn: 'Fraza-łącznik', idiom: 'Idiom / potoczny zwrot', card: 'Fiszka' };
  var CAT = { art: 'przedimki a/an/the', prep: 'przyimki', ger: '-ing czy bezokolicznik', agr: 'zgoda liczby (is/are, -s)',
    adj: 'przymiotniki -ed / -ing', word: 'pomylone słowa', tense: 'czasy', order: 'szyk zdania', coll: 'kolokacje',
    conn: 'frazy-łączniki', idiom: 'idiomy i potoczne zwroty', phr: 'zwroty i phrasal verbs', q: 'pytania', rel: 'zdania względne (who/which/whose)',
    inv: 'inwersja', struct: 'konstrukcje zdaniowe', biz: 'słownictwo biznesowe', modal: 'czasowniki modalne', cond: 'tryby warunkowe',
    quant: 'much/many/few/enough', comp: 'stopniowanie i porównania', voc: 'słownictwo' };
  var TOPIC = { smalltalk: 'small talk', food: 'jedzenie', shopping: 'zakupy', travel: 'podróże', car: 'samochód', gym: 'siłownia',
    health: 'lekarz i apteka', weather: 'pogoda', weekend: 'weekend', movies: 'filmy i seriale', opinions: 'opinie', plans: 'plany',
    complain: 'narzekanie i reakcje', workuni: 'praca i uczelnia', intro: 'prezentacja firmy', offer: 'oferta', price: 'cena i negocjacje',
    orders: 'zamówienia', logistics: 'logistyka', quality: 'jakość i certyfikaty', payment: 'płatności', meeting: 'spotkania i rozmowy',
    mail: 'krótkie wiadomości', followup: 'follow-up', claims: 'reklamacje', fair: 'targi', general: 'ogólne' };
  var QUICK = 10, LONG = 30, STREAK_MIN = 10, DAY = 864e5;

  // ---------- pomocnicze ----------
  function h(tag, attrs) {
    var e = document.createElement(tag), i, k;
    if (attrs) for (k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e) {
    for (var i = 1; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null || kid === false) continue;
      if (Array.isArray(kid)) { kid.forEach(function (x) { add(e, x); }); continue; }
      e.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
  }
  function show() { app.innerHTML = ''; for (var i = 0; i < arguments.length; i++) add(app, arguments[i]); window.scrollTo(0, 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dnum(d) { d = d || new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  function tstr(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function hash(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  function seeded(seed) { var x = 0; for (var i = 0; i < seed.length; i++) x = (Math.imul(x, 31) + seed.charCodeAt(i)) | 0; return function () { x = (Math.imul(x, 1103515245) + 12345) | 0; return ((x >>> 8) & 0xffff) / 0x10000; }; }
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // ---------- stan i zapis ----------
  var S = null;
  var save = { status: 'busy', at: 0, err: '', persisted: null, idb: null, timer: null, count: 0 };
  var LS_KEY = 'eng-offline-backup';

  function freshState() {
    return { kind: 'eng-offline-backup', v: 1, created: Date.now(), updated: 0, goal: 20, xp: 0, prog: {}, days: {}, cat: {}, typ: {}, tagc: {},
      acc: {}, rej: [], flags: [], imp: [], lastExport: 0, lastReport: 0 };
  }
  function validState(o) { return o && typeof o === 'object' && o.kind === 'eng-offline-backup' && o.prog && typeof o.prog === 'object'; }
  function fixState(o) {
    var f = freshState(), k;
    for (k in f) if (o[k] == null) o[k] = f[k];
    return o;
  }
  function idbOpen() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open('eng-offline', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error || new Error('IndexedDB niedostępne')); };
        r.onblocked = function () { rej(new Error('IndexedDB zablokowane')); };
      } catch (e) { rej(e); }
    });
  }
  function idbGet(key) {
    return new Promise(function (res, rej) {
      var tx = save.idb.transaction('kv', 'readonly'), rq = tx.objectStore('kv').get(key);
      rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbPut(key, val) {
    return new Promise(function (res, rej) {
      var tx = save.idb.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key);
      tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error || new Error('przerwano zapis')); };
    });
  }
  function lsGet() { try { var t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

  function loadState() {
    var cands = [], ls = lsGet();
    if (validState(ls)) cands.push({ s: ls, src: 'kopia zapasowa' });
    return idbOpen().then(function (db) {
      save.idb = db;
      return Promise.all([idbGet('state'), idbGet('snap1'), idbGet('snap2')]);
    }).then(function (arr) {
      if (validState(arr[0])) cands.push({ s: arr[0], src: 'IndexedDB' });
      if (validState(arr[1])) cands.push({ s: arr[1], src: 'migawka 1' });
      if (validState(arr[2])) cands.push({ s: arr[2], src: 'migawka 2' });
    }).catch(function (e) { save.err = 'IndexedDB: ' + (e && e.message || e); }).then(function () {
      cands.sort(function (a, b) { return (b.s.updated || 0) - (a.s.updated || 0); });
      if (cands.length) { S = fixState(cands[0].s); save.src = cands[0].src; save.at = S.updated; }
      else S = freshState();
      save.status = save.idb ? 'ok' : 'err';
      if (!save.idb && !save.err) save.err = 'Brak IndexedDB – zapis tylko w kopii zapasowej.';
    });
  }

  function persistNow() {
    if (save.timer) { clearTimeout(save.timer); save.timer = null; }
    S.updated = Date.now();
    save.status = 'busy'; paintSave();
    var json;
    try { json = JSON.stringify(S); } catch (e) { save.status = 'err'; save.err = String(e); paintSave(); return Promise.resolve(false); }
    var okLS = false;
    try { localStorage.setItem(LS_KEY, json); okLS = true; } catch (e) { /* pełny lub wyłączony */ }
    var p = Promise.resolve();
    if (save.idb) {
      var copy = JSON.parse(json);
      p = idbPut('state', copy).then(function () {
        save.count++;
        var today = dstr();
        if (S._snapDay !== today) {           // dzienna migawka w IndexedDB (rotacja 2 sztuk)
          S._snapDay = today;
          return idbGet('snap1').then(function (old) { return old ? idbPut('snap2', old) : null; }).then(function () { return idbPut('snap1', copy); });
        }
      });
    } else if (!okLS) p = Promise.reject(new Error('brak miejsca na zapis'));
    return p.then(function () { save.status = 'ok'; save.at = S.updated; save.err = ''; paintSave(); return true; })
      .catch(function (e) { save.status = okLS ? 'ok' : 'err'; save.err = 'Zapis główny nieudany: ' + (e && e.message || e) + (okLS ? ' (kopia zapasowa zapisana)' : ''); save.at = okLS ? S.updated : save.at; paintSave(); return okLS; });
  }
  function saveSoon() { save.status = 'busy'; paintSave(); if (save.timer) clearTimeout(save.timer); save.timer = setTimeout(persistNow, 200); }
  function paintSave() {
    var e = document.getElementById('save'); if (!e) return;
    var cls = save.status === 'ok' ? 'ok' : save.status === 'busy' ? 'busy' : 'err';
    var txt = save.status === 'ok' ? (save.at ? 'Zapisano ' + tstr(save.at) : 'Gotowe') : save.status === 'busy' ? 'Zapisuję…' : 'Błąd zapisu!';
    e.innerHTML = ''; add(e, h('span', { class: 'dot ' + cls })); add(e, txt);
  }
  function askPersist() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); })
        .then(function (p) { save.persisted = !!p; }).catch(function () { save.persisted = null; });
    }
    return Promise.resolve();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && S && save.timer) persistNow(); });
  window.addEventListener('pagehide', function () { if (S && save.timer) persistNow(); });

  // ---------- zadania ----------
  var ALL = [], BY = {}, VOCAB = {};
  function rebuild() {
    ALL = DB.tasks.concat(S.imp || []); BY = {};
    ALL.forEach(function (t) { BY[t.id] = t; });
    VOCAB = {}; (DB.vocab || []).forEach(function (w) { VOCAB[w] = 1; });
    (S.imp || []).forEach(function (t) { try { C.compile(t).list.forEach(function (v) { v.split(' ').forEach(function (w) { VOCAB[w] = 1; }); }); } catch (e) { } });
  }
  function accList(id) { return (S.acc[id] || []).map(function (x) { return x.n; }); }

  function counts() {
    var t = dnum(), c = { due: 0, fresh: 0, learn: 0, solid: 0, total: ALL.length };
    ALL.forEach(function (task) { var p = S.prog[task.id]; if (!p) c.fresh++; else { if (p.d <= t) c.due++; if (p.i >= 21) c.solid++; else c.learn++; } });
    return c;
  }
  function today() { var k = dstr(); if (!S.days[k]) S.days[k] = { n: 0, ok: 0, xp: 0 }; return S.days[k]; }
  function streak() {
    var d = new Date(), n = 0, k = dstr(d);
    if (!(S.days[k] && S.days[k].n >= STREAK_MIN)) d.setDate(d.getDate() - 1);
    for (;;) { k = dstr(d); if (S.days[k] && S.days[k].n >= STREAK_MIN) { n++; d.setDate(d.getDate() - 1); } else break; }
    return n;
  }
  function level() { return 1 + Math.floor((S.xp || 0) / 500); }

  function buildSession(n) {
    var t = dnum(), due = [], fresh = [];
    ALL.forEach(function (task) { var p = S.prog[task.id]; if (!p) fresh.push(task); else if (p.d <= t) due.push(task); });
    due.sort(function (a, b) { return S.prog[a.id].d - S.prog[b.id].d; });
    var minNew = Math.min(fresh.length, Math.round(n * (due.length > 3 * n ? 0.1 : 0.3)));
    var dueTake = Math.min(due.length, n - minNew), newTake = Math.min(fresh.length, n - dueTake);
    var cnt = { d: 0, b: 0 }, picked = [];
    function pick(list, k) {
      var pool = list.slice();
      while (k > 0 && pool.length) {
        var want = cnt.d <= cnt.b ? 'd' : 'b', idx = -1;
        for (var i = 0; i < pool.length; i++) if (pool[i].tag === want) { idx = i; break; }
        if (idx < 0) idx = 0;
        var x = pool.splice(idx, 1)[0]; picked.push(x); cnt[x.tag === 'b' ? 'b' : 'd']++; k--;
      }
    }
    pick(due, dueTake); pick(fresh, newTake);
    var d = shuffle(picked.filter(function (x) { return x.tag !== 'b'; })), b = shuffle(picked.filter(function (x) { return x.tag === 'b'; })), out = [];
    while (d.length || b.length) { if (d.length) out.push(d.shift()); if (b.length) out.push(b.shift()); }
    return out.map(function (x) { return x.id; });
  }

  function grade(task, q, attempts) {
    var t = dnum(), p = S.prog[task.id] || { r: 0, e: 2.5, i: 0, d: t, l: 0, n: 0, ok: 0 };
    p.n++;
    if (q >= 3) {
      p.ok++; p.r++;
      if (p.r === 1) p.i = q >= 5 ? 2 : 1;
      else if (p.r === 2) p.i = q >= 5 ? 6 : 4;
      else p.i = Math.max(p.i + 1, Math.round(p.i * p.e));
      p.e = Math.max(1.3, p.e + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    } else { p.r = 0; p.i = 1; p.l++; p.e = Math.max(1.3, p.e - 0.2); }
    p.i = Math.min(p.i, 180); p.d = t + p.i; p.t = Date.now();
    S.prog[task.id] = p;
    var first = q >= 5, fail = q < 3;
    [[S.cat, task.cat || 'voc'], [S.typ, task.type], [S.tagc, task.tag === 'b' ? 'b' : 'd']].forEach(function (pr) {
      var o = pr[0][pr[1]] || (pr[0][pr[1]] = { n: 0, ok1: 0, fail: 0 }); o.n++; if (first) o.ok1++; if (fail) o.fail++;
    });
    var day = today(), xp = first ? 10 : fail ? 1 : 5;
    day.n++; if (first) day.ok++; day.xp = (day.xp || 0) + xp; S.xp = (S.xp || 0) + xp;
    saveSoon();
    return xp;
  }

  // ---------- głos (wbudowany syntezator telefonu, działa bez internetu) ----------
  function canSpeak() { return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'; }
  function modelText(task) {
    var c = C.compile(task), line = C.GAP_TYPES[task.type] ? C.gapLine(task) : null;
    return line ? line.replace('___', c.model) : c.model;
  }
  function speak(text) {
    try {
      var ss = window.speechSynthesis; ss.cancel();
      var u = new SpeechSynthesisUtterance(text), vs = ss.getVoices ? ss.getVoices() : [], pick = null;
      for (var i = 0; i < vs.length; i++) { if (vs[i].lang === 'en-US' && (!pick || vs[i].localService)) pick = vs[i]; }
      if (!pick) for (i = 0; i < vs.length; i++) if (/^en/.test(vs[i].lang)) { pick = vs[i]; break; }
      if (pick) u.voice = pick;
      u.lang = 'en-US'; u.rate = 0.95; ss.speak(u); return true;
    } catch (e) { return false; }
  }

  // ---------- widok: nagłówek ----------
  function header(title, back) {
    return h('div', { class: 'top' },
      h('div', { class: 'row', style: 'flex:1;gap:8px' },
        back ? h('button', { class: 'link', style: 'flex:0;padding:4px 8px 4px 0;text-decoration:none;font-size:22px', onclick: back, 'aria-label': 'Wróć' }, '‹') : null,
        h('h1', null, title)),
      h('div', { class: 'save', id: 'save' }));
  }

  // ---------- widok: start ----------
  var offline = { ok: null, have: 0, need: (DB.assets || []).length };
  function checkCache() {
    if (!self.caches || !DB.assets) { offline.ok = false; return Promise.resolve(); }
    return Promise.all(DB.assets.map(function (u) { return caches.match(u, { ignoreSearch: true }).then(function (r) { return r ? 1 : 0; }).catch(function () { return 0; }); }))
      .then(function (a) { offline.have = a.reduce(function (x, y) { return x + y; }, 0); offline.ok = offline.have === offline.need && offline.need > 0; });
  }
  var swState = { reg: null, waiting: false };

  function home() {
    var c = counts(), day = today(), st = streak(), goal = S.goal || 20;
    var sinceExp = S.lastExport ? Math.floor((Date.now() - S.lastExport) / DAY) : null;
    var doneEver = Object.keys(S.prog).length;
    show(
      header('English Offline'),
      swState.waiting ? h('div', { class: 'banner info' }, 'Nowa wersja aplikacji jest gotowa. Postęp zostaje. ',
        h('button', { class: 'pri', style: 'margin-top:8px', onclick: applyUpdate }, 'Zaktualizuj teraz')) : null,
      save.status === 'err' ? h('div', { class: 'banner err' }, 'Problem z zapisem: ' + save.err + ' Zrób eksport kopii w „Kopia i dane”.') : null,
      (isIOS && !standalone) ? h('div', { class: 'banner' }, 'Otwierasz aplikację w Safari. Dodaj ją do ekranu początkowego i ucz się z ikony – postęp w Safari i w ikonie to dwa osobne zapisy.') : null,
      (doneEver > 0 && (sinceExp === null || sinceExp >= 4)) ? h('div', { class: 'banner' }, sinceExp === null ? 'Nie masz jeszcze kopii postępu w Plikach.' : 'Ostatnia kopia w Plikach: ' + sinceExp + ' dni temu.', ' ',
        h('button', { class: 'link', onclick: dataView }, 'Zrób kopię')) : null,
      h('div', { class: 'card' },
        h('div', { class: 'row' },
          h('div', null, h('div', { class: 'big' }, '🔥 ' + st), h('div', { class: 'mut sm' }, st === 1 ? 'dzień serii' : 'dni serii')),
          h('div', null, h('div', { class: 'big' }, day.n + '/' + goal), h('div', { class: 'mut sm' }, 'dzisiejszy cel')),
          h('div', null, h('div', { class: 'big' }, 'L' + level()), h('div', { class: 'mut sm' }, (S.xp || 0) + ' XP'))),
        h('div', { class: 'bar ok', style: 'margin-top:12px' }, h('i', { style: 'width:' + Math.min(100, pct(day.n, goal)) + '%' })),
        h('div', { class: 'mut xs', style: 'margin-top:6px' }, 'Seria rośnie, gdy zrobisz min. ' + STREAK_MIN + ' zadań w danym dniu.')),
      h('div', { class: 'stack' },
        h('button', { class: 'pri', onclick: function () { startSession('quick'); } }, '⚡ Szybkie 5 minut (' + QUICK + ' zadań)'),
        h('button', { onclick: function () { startSession('long'); } }, '🗺️ Długa sesja (' + LONG + ' zadań)')),
      h('div', { class: 'card' },
        h('div', { class: 'kv' }, h('span', null, 'Do powtórki dziś'), h('b', null, c.due)),
        h('div', { class: 'kv' }, h('span', null, 'Nowe (jeszcze nierozpoczęte)'), h('b', null, c.fresh)),
        h('div', { class: 'kv' }, h('span', null, 'W nauce / utrwalone'), h('b', null, c.learn + ' / ' + c.solid)),
        h('div', { class: 'kv' }, h('span', null, 'Tryb offline'), h('b', { id: 'offl' }, offline.ok === null ? 'sprawdzam…' : offline.ok ? '✓ gotowy (' + offline.have + '/' + offline.need + ' plików)' : '✗ niegotowy (' + offline.have + '/' + offline.need + ')'))),
      h('div', { class: 'stack' },
        h('button', { class: 'flight', onclick: flightView }, '✈️ Zrób kopię przed lotem'),
        h('div', { class: 'banner err xs', style: 'margin:0' }, '⚠️ Usunięcie ikony z ekranu głównego kasuje postęp. Jedyna kopia niezależna od telefonu to plik zapisany w Plikach.'),
        h('div', { class: 'row' }, h('button', { onclick: statsView }, '📊 Statystyki'), h('button', { onclick: dataView }, '💾 Kopia i dane'))),
      h('p', { class: 'mut xs center', id: 'ver' }, 'Baza: ' + DB.tasks.length + ' zadań + ' + (S.imp || []).length + ' z importu · wersja ' + DB.version + ' · aplikacja ' + (DB.build || '?'))
    );
    paintSave();
    checkCache().then(function () { var e = document.getElementById('offl'); if (e) e.textContent = offline.ok ? '✓ gotowy (' + offline.have + '/' + offline.need + ' plików)' : '✗ niegotowy (' + offline.have + '/' + offline.need + ')'; });
  }

  // ---------- sesja ----------
  var sess = null;
  function startSession(mode) {
    var ids = buildSession(mode === 'quick' ? QUICK : LONG);
    if (!ids.length) { show(header('Brak zadań', home), h('div', { class: 'card' }, 'Na dziś wszystko zrobione i nie ma nowych zadań. Zaimportuj nowe zadania z Claude w „Kopia i dane”.'), h('button', { onclick: home }, 'Wróć')); paintSave(); return; }
    sess = { mode: mode, q: ids, i: 0, xp: 0, ok1: 0, ok2: 0, fail: 0, retry: {}, total: ids.length, done: 0 };
    nextTask();
  }
  function nextTask() {
    if (sess.i >= sess.q.length) return summary();
    var task = BY[sess.q[sess.i]];
    if (!task) { sess.i++; return nextTask(); }
    taskView(task);
  }

  function renderPrompt(task) {
    var box = h('div', { class: 'q' });
    function withGap(text, fill) {
      var parts = text.split('___'), out = [];
      parts.forEach(function (p, i) { out.push(p); if (i < parts.length - 1) out.push(h('span', { class: 'gap' }, fill || '   ?   ')); });
      return out;
    }
    if (task.type === 'dialog' || (task.q && / \/ /.test(task.q) && /^[A-Z][A-Za-z]*: /.test(task.q))) {
      (task.q || '').split(' / ').forEach(function (ln) {
        var m = /^\s*([A-Z][A-Za-z]*):\s*(.*)$/.exec(ln);
        box.appendChild(h('div', { class: 'line' }, m ? h('span', { class: 'who' }, m[1] + ':') : null, withGap(m ? m[2] : ln, task._fill)));
      });
    } else if (task.type === 'fix') {
      box.appendChild(h('div', { class: 'wrong' }, task.q));
    } else if (task.type === 'order') {
      /* słowa pokazuje pole z kafelkami */
    } else if (task.q) {
      add(box, withGap(task.q, task._fill));
    }
    return box;
  }
  function scramble(task) {
    var model = C.compile(task).model.replace(/[.?!,]/g, '').split(/\s+/).filter(Boolean);
    if (model.length && !/^(I|I'm|I'll|I've|I'd)$/.test(model[0]) && !task.keepCap) model[0] = model[0].charAt(0).toLowerCase() + model[0].slice(1);
    var rnd = seeded(task.id), a = model.slice(), n = 0;
    do { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } n++; } while (a.join(' ') === model.join(' ') && n < 5);
    return a;
  }
  function instr(task) {
    if (task.type === 'gap') return 'Wpisz brakujące słowo lub słowa.';
    if (task.type === 'dialog') return 'Wpisz brakujący fragment rozmowy.';
    if (task.type === 'conn') return task.q && task.q.indexOf('___') >= 0 ? 'Wpisz frazę-łącznik, która tu pasuje.' : 'Napisz zdanie z frazą-łącznikiem.';
    if (task.type === 'idiom') return task.q && task.q.indexOf('___') >= 0 ? 'Dokończ zwrot.' : 'Napisz ten zwrot po angielsku.';
    if (task.type === 'translate' || task.type === 'card') return 'Napisz po angielsku.';
    if (task.type === 'order') return 'Ułóż zdanie z tych słów (wpisz albo stukaj w kafelki).';
    if (task.type === 'fix') return 'W zdaniu jest błąd. Popraw je i wpisz całe poprawne zdanie.';
    return '';
  }

  function taskView(task) {
    var cur = { attempts: 0, answers: [], retry: !!sess.retry[task.id], lastRes: null };
    delete task._fill;
    var input = h('textarea', { id: 'ans', rows: task.type === 'gap' ? 1 : 2, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
      enterkeyhint: 'done', placeholder: 'Twoja odpowiedź…', 'aria-label': 'Odpowiedź' });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!zone.dataset.locked) submit(); else if (zone.dataset.next) goNext(); } });
    if (task.type === 'fix') input.value = task.q || '';
    var words = null;
    if (task.type === 'order') {
      words = h('div', { class: 'words' });
      scramble(task).forEach(function (w) {
        var b = h('button', { type: 'button', onclick: function () { if (zone.dataset.locked) return; input.value = (input.value ? input.value.replace(/\s+$/, '') + ' ' : '') + w; b.classList.add('used'); } }, w);
        words.appendChild(b);
      });
      words.appendChild(h('button', { type: 'button', class: 'ghost', onclick: function () { if (zone.dataset.locked) return; input.value = ''; Array.prototype.forEach.call(words.children, function (x) { x.classList.remove('used'); }); } }, '⌫ wyczyść'));
    }
    var zone = h('div', { id: 'zone' }), fb = h('div'), actions = h('div', { class: 'stack sticky' });
    var promptBox = renderPrompt(task);
    var mainPL = (task.type === 'translate' || task.type === 'card' || ((task.type === 'idiom' || task.type === 'conn') && !(task.q && task.q.indexOf('___') >= 0)));

    function setActions() { actions.innerHTML = ''; for (var i = 0; i < arguments.length; i++) add(actions, arguments[i]); }
    function lock(v) { if (v) { zone.dataset.locked = '1'; input.setAttribute('readonly', 'readonly'); } else { delete zone.dataset.locked; input.removeAttribute('readonly'); } }
    function sayBtn() { return canSpeak() ? h('button', { class: 'link', onclick: function () { speak(modelText(task)); } }, '🔊 Odsłuchaj wzorzec') : null; }
    function flagBtn() { return h('button', { class: 'link', onclick: function () { flagForm(task, cur, fb); } }, '⚑ Zgłoś błąd w zadaniu'); }

    function submit() {
      var val = input.value;
      var res = C.check(task, val, { accepted: accList(task.id), vocab: VOCAB });
      if (res.r === 'empty') { input.focus(); return; }
      if (res.r === 'bad' && res.soft) { softHint(res, val); return; }   // poprawny synonim: bez liczenia próby i bez zapisu jako błąd
      cur.answers.push(val); cur.lastRes = res; cur.attempts++;
      if (res.r === 'ok') return correct(res);
      if (cur.attempts >= 2) return reveal(res);
      hint(res);
    }
    function hintText(res) {
      if (res.r === 'bad') return res.msg;
      if (res.r === 'no' && res.why === 'req') return 'Użyj wymaganej frazy: „' + task.req + '”.';
      if (res.r === 'near') return 'Blisko. Kluczowe elementy są, ale całość nie zgadza się z żadną wersją, którą znam. Sprawdź drobiazgi: przedimki, końcówki, szyk.';
      return task.hint || ('Jeszcze nie to. Przyjrzyj się: ' + (CAT[task.cat] || 'forma i dobór słów') + '.');
    }
    function softHint(res, val) {
      fb.innerHTML = '';
      add(fb, h('div', { class: 'fb ok' }, h('b', { class: 'h' }, '✓ ' + res.msg),
        h('div', { class: 'sm' }, 'Twoja odpowiedź („' + val.trim() + '”) jest dobra. Wpisz teraz ćwiczoną frazę – ta próba się nie liczy.')));
      setActions(h('button', { class: 'pri', onclick: submit }, 'Sprawdź'), h('button', { class: 'ghost', onclick: function () { reveal(null); } }, 'Pokaż frazę'));
      input.value = ''; input.focus();
    }
    function hint(res) {
      fb.innerHTML = '';
      add(fb, h('div', { class: 'fb hint' }, h('b', { class: 'h' }, res.r === 'bad' ? 'Uwaga, częsty błąd · próba 1 z 2' : 'Próba 1 z 2'), hintText(res)));
      setActions(h('button', { class: 'pri', onclick: submit }, 'Sprawdź ponownie'), h('button', { class: 'ghost', onclick: function () { reveal(cur.lastRes); } }, 'Pokaż odpowiedź'));
      input.focus();
    }
    function modelNode() {
      var c = C.compile(task), line = C.GAP_TYPES[task.type] ? C.gapLine(task) : null;
      if (line) { var parts = line.split('___'); return h('div', { class: 'model' }, parts[0], h('span', { style: 'color:var(--ok)' }, c.model), parts[1] || ''); }
      return h('div', { class: 'model' }, c.model);
    }
    function correct(res) {
      lock(true);
      var q = cur.attempts === 1 ? 5 : 3, xp = 0;
      if (!cur.retry) { xp = grade(task, q); sess.xp += xp; if (q === 5) sess.ok1++; else sess.ok2++; sess.done++; }
      fb.innerHTML = '';
      add(fb, h('div', { class: 'fb ok' }, h('b', { class: 'h' }, '✓ Dobrze!' + (xp ? '  +' + xp + ' XP' : '')),
        res.via === 'typo' ? h('div', { class: 'sm' }, 'Uznane z literówką: „' + res.typo.from + '” → „' + res.typo.to + '”.') : null,
        res.via === 'own' ? h('div', { class: 'sm mut' }, 'Twoja zapamiętana wersja.') : null,
        task.ex ? h('div', { class: 'sm mut', style: 'margin-top:4px' }, task.ex) : null));
      zone.dataset.next = '1';
      setActions(h('button', { class: 'good', onclick: goNext }, 'Dalej →'), sayBtn(), flagBtn());
    }
    function reveal(res) {
      lock(true);
      fb.innerHTML = '';
      var mine = cur.answers.length ? cur.answers[cur.answers.length - 1] : '';
      add(fb, h('div', { class: 'fb bad' },
        h('b', { class: 'h' }, 'Wzorzec'), modelNode(),
        mine ? h('div', { class: 'sm mut' }, 'Twoja odpowiedź: ' + mine) : null,
        (res && res.r === 'bad') ? h('div', { class: 'sm', style: 'margin-top:6px' }, res.msg) : null,
        task.ex ? h('div', { class: 'sm', style: 'margin-top:6px' }, task.ex) : null));
      if (cur.retry) { zone.dataset.next = '1'; setActions(h('button', { class: 'pri', onclick: goNext }, 'Dalej →'), sayBtn(), flagBtn()); return; }
      setActions(
        h('button', { class: 'pri', onclick: function () { myBad(mine); } }, mine ? 'Mój błąd' : 'Dalej (zadanie wróci w powtórkach)'),
        mine ? h('button', { onclick: function () { myVersion(mine); } }, 'Moja wersja też jest poprawna') : null,
        sayBtn(), flagBtn());
    }
    function myBad(mine) {
      var xp = grade(task, 1); sess.xp += xp; sess.fail++; sess.done++;
      if (cur.answers.length) S.rej.push({ id: task.id, t: Date.now(), ans: cur.answers.slice(), why: cur.lastRes ? cur.lastRes.r : '' });
      if (S.rej.length > 400) S.rej.splice(0, S.rej.length - 400);
      if (!sess.retry[task.id]) { sess.retry[task.id] = 1; sess.q.push(task.id); }
      saveSoon(); goNext();
    }
    function myVersion(mine) {
      var n = C.norm(mine), list = S.acc[task.id] || (S.acc[task.id] = []);
      if (!list.some(function (x) { return x.n === n; })) list.push({ n: n, raw: mine, t: Date.now(), rules: cur.lastRes ? cur.lastRes.r : '' });
      var xp = grade(task, 4); sess.xp += xp; sess.ok2++; sess.done++;
      saveSoon(); goNext();
    }
    function goNext() { sess.i++; nextTask(); }

    add(zone,
      h('div', { class: 'row', style: 'margin-bottom:8px' },
        h('div', { class: 'bar', style: 'flex:1' }, h('i', { style: 'width:' + pct(sess.i, sess.q.length) + '%' })),
        h('div', { class: 'mut xs', style: 'flex:0;white-space:nowrap' }, (sess.i + 1) + ' / ' + sess.q.length)),
      h('div', null,
        h('span', { class: 'chip ' + (task.tag === 'b' ? 'b' : 'd') }, task.tag === 'b' ? 'biznes' : 'codzienne'), ' ',
        h('span', { class: 'chip t' }, TOPIC[task.topic] || task.topic || ''), ' ',
        cur.retry ? h('span', { class: 'chip t' }, 'powtórka z tej sesji') : null),
      h('h3', null, TYPE[task.type] || task.type),
      h('div', { class: 'mut sm' }, instr(task)),
      promptBox,
      task.pl ? h('div', { class: 'pl' + (mainPL ? ' main' : '') }, (mainPL ? '' : '🇵🇱 ') + task.pl) : null,
      task.req ? h('div', null, h('span', { class: 'req' }, 'Użyj: ' + task.req)) : null,
      words,
      h('div', { style: 'margin-top:12px' }, input),
      fb, actions);
    setActions(h('button', { class: 'pri', onclick: submit }, 'Sprawdź'));
    show(h('div', { class: 'top' }, h('button', { class: 'link', style: 'text-decoration:none', onclick: function () { persistNow(); home(); } }, '‹ Zakończ'), h('div', { class: 'save', id: 'save' })), zone);
    paintSave();
    try { input.focus({ preventScroll: true }); if (task.type === 'fix') input.setSelectionRange(input.value.length, input.value.length); } catch (e) { }
  }

  function flagForm(task, cur, fb) {
    var ta = h('textarea', { rows: 2, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Co jest nie tak? (opcjonalnie)' });
    var box = h('div', { class: 'fb hint' }, h('b', { class: 'h' }, 'Zgłoszenie błędu w zadaniu ' + task.id), ta,
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'pri', onclick: function () {
          S.flags.push({ id: task.id, t: Date.now(), note: ta.value.trim(), ans: cur ? cur.answers.slice() : [] });
          saveSoon(); box.innerHTML = ''; add(box, '⚑ Zapisano zgłoszenie. Trafi do eksportu dla Claude.');
        } }, 'Zapisz zgłoszenie'),
        h('button', { class: 'ghost', onclick: function () { box.remove(); } }, 'Anuluj')));
    fb.appendChild(box); ta.focus();
  }

  function summary() {
    persistNow();
    var s = sess, day = today(), goal = S.goal || 20;
    show(header('Quest ukończony'),
      h('div', { class: 'card center' },
        h('div', { class: 'big' }, '+' + s.xp + ' XP'),
        h('p', null, 'Za pierwszym razem: ', h('b', null, s.ok1), ' · za drugim: ', h('b', null, s.ok2), ' · do powtórki: ', h('b', null, s.fail)),
        h('p', { class: 'mut sm' }, 'Dziś: ' + day.n + '/' + goal + ' zadań · seria: ' + streak() + ' dni · poziom ' + level())),
      h('div', { class: 'stack' },
        h('button', { class: 'pri', onclick: function () { startSession(s.mode); } }, 'Jeszcze jedna sesja'),
        h('button', { onclick: home }, 'Wróć na start')));
    paintSave(); sess = null;
  }

  // ---------- statystyki ----------
  function statRows(obj, labels, minN) {
    var rows = Object.keys(obj).map(function (k) { var o = obj[k]; return { k: k, n: o.n, ok1: o.ok1, fail: o.fail, r: o.n ? o.ok1 / o.n : 0 }; })
      .filter(function (r) { return r.n >= (minN || 1); }).sort(function (a, b) { return a.r - b.r; });
    if (!rows.length) return h('p', { class: 'mut sm' }, 'Za mało danych – zrób kilka sesji.');
    return rows.map(function (r) {
      return h('div', { class: 'stat' },
        h('div', { class: 'l' }, h('span', null, labels[r.k] || r.k), h('span', { class: 'mut' }, pct(r.ok1, r.n) + '% od razu · ' + r.n + ' prób · ' + r.fail + ' błędnych')),
        h('div', { class: 'bar ' + (r.r >= 0.8 ? 'ok' : r.r < 0.55 ? 'bad' : '') }, h('i', { style: 'width:' + pct(r.ok1, r.n) + '%' })));
    });
  }
  function statsView() {
    var c = counts(), tot = { n: 0, ok1: 0, fail: 0 };
    Object.keys(S.typ).forEach(function (k) { tot.n += S.typ[k].n; tot.ok1 += S.typ[k].ok1; tot.fail += S.typ[k].fail; });
    var d = new Date(), bars = [], max = 1, i;
    d.setDate(d.getDate() - 13);
    for (i = 0; i < 14; i++) { var k = dstr(d), v = S.days[k] ? S.days[k].n : 0; bars.push(v); if (v > max) max = v; d.setDate(d.getDate() + 1); }
    var hard = Object.keys(S.prog).filter(function (id) { return S.prog[id].l > 0 && BY[id]; }).sort(function (a, b) { return S.prog[b].l - S.prog[a].l; }).slice(0, 10);
    show(header('Statystyki', home),
      h('div', { class: 'card' },
        h('div', { class: 'kv' }, h('span', null, 'Rozwiązane zadania (łącznie)'), h('b', null, tot.n)),
        h('div', { class: 'kv' }, h('span', null, 'Poprawnie za pierwszym razem'), h('b', null, pct(tot.ok1, tot.n) + '%')),
        h('div', { class: 'kv' }, h('span', null, 'Nowe / w nauce / utrwalone'), h('b', null, c.fresh + ' / ' + c.learn + ' / ' + c.solid)),
        h('div', { class: 'kv' }, h('span', null, 'Seria / XP / poziom'), h('b', null, streak() + ' dni / ' + (S.xp || 0) + ' / L' + level())),
        h('div', { class: 'mut xs', style: 'margin-top:8px' }, 'Ostatnie 14 dni (zadań dziennie)'),
        h('div', { class: 'days' }, bars.map(function (v) { return h('i', { class: v ? '' : 'z', style: 'height:' + Math.max(3, Math.round(100 * v / max)) + '%', title: v }); }))),
      h('h2', null, 'Typy błędów (od najsłabszych)'), h('div', { class: 'card' }, statRows(S.cat, CAT, 2)),
      h('h2', null, 'Typy zadań'), h('div', { class: 'card' }, statRows(S.typ, TYPE)),
      h('h2', null, 'Codzienne vs biznes'), h('div', { class: 'card' }, statRows(S.tagc, { d: 'Codzienne', b: 'Biznes' })),
      h('h2', null, 'Najtrudniejsze zadania'),
      h('div', { class: 'card' }, hard.length ? hard.map(function (id) { return h('div', { class: 'kv' }, h('span', { class: 'sm' }, C.compile(BY[id]).model), h('b', null, S.prog[id].l + '× źle')); }) : h('p', { class: 'mut sm' }, 'Brak – świetnie.')),
      h('button', { onclick: home }, 'Wróć'));
    paintSave();
  }

  // ---------- eksport / import ----------
  function line(ch, n) { return new Array((n || 60) + 1).join(ch); }
  function taskBrief(t) { return t ? (t.type + ' | ' + (t.pl || t.q || '') + (t.req ? ' [użyj: ' + t.req + ']' : '')) : '(zadanie usunięte z bazy)'; }
  function taskFull(t) { if (!t) return '(zadanie usunięte z bazy)'; return (TYPE[t.type] || t.type) + (t.q ? ' | ' + t.q : '') + (t.pl ? ' | PL: ' + t.pl : '') + (t.req ? ' | użyj: ' + t.req : ''); }
  function makeReport() {
    var L = [], c = counts(), tot = { n: 0, ok1: 0, fail: 0 }, k;
    Object.keys(S.typ).forEach(function (x) { tot.n += S.typ[x].n; tot.ok1 += S.typ[x].ok1; tot.fail += S.typ[x].fail; });
    L.push('=== RAPORT Z APLIKACJI ENGLISH OFFLINE ===');
    L.push('Data: ' + dstr() + ' ' + tstr(Date.now()) + ' | wersja bazy: ' + DB.version + ' | zadań w bazie: ' + DB.tasks.length + ' + import: ' + (S.imp || []).length);
    L.push('Seria: ' + streak() + ' dni | XP: ' + (S.xp || 0) + ' | dzienny cel: ' + (S.goal || 20));
    L.push('Rozwiązane łącznie: ' + tot.n + ' | od razu poprawnie: ' + pct(tot.ok1, tot.n) + '% | błędne: ' + tot.fail);
    L.push('Nowe: ' + c.fresh + ' | w nauce: ' + c.learn + ' | utrwalone: ' + c.solid + ' | do powtórki dziś: ' + c.due);
    var nCheck = 0; Object.keys(S.acc).forEach(function (id) { nCheck += S.acc[id].length; });
    L.push(''); L.push('=== DO SPRAWDZENIA (' + nCheck + ') – odpowiedzi uznane przyciskiem „Moja wersja też jest poprawna” ===');
    L.push('Prośba do Claude: oceń każdą pozycję jako POPRAWNA albo BŁĘDNA i dodaj jedno zdanie uzasadnienia.');
    Object.keys(S.acc).forEach(function (id) { S.acc[id].forEach(function (a) {
      L.push('DO SPRAWDZENIA [' + id + '] ' + dstr(new Date(a.t)));
      L.push('    zadanie: ' + taskFull(BY[id]));
      L.push('    moja odpowiedź: ' + a.raw + (a.rules === 'no' ? '   (uwaga: nie spełnia reguł zadania)' : ''));
      L.push('    wzorzec: ' + (BY[id] ? modelText(BY[id]) : '?'));
    }); });
    if (!nCheck) L.push('(brak)');
    L.push(''); L.push('--- TYPY BŁĘDÓW (kategoria: próby / od razu OK / błędne) ---');
    Object.keys(S.cat).sort(function (a, b) { return (S.cat[a].ok1 / S.cat[a].n) - (S.cat[b].ok1 / S.cat[b].n); }).forEach(function (x) { var o = S.cat[x]; L.push((CAT[x] || x) + ': ' + o.n + ' / ' + pct(o.ok1, o.n) + '% / ' + o.fail); });
    L.push(''); L.push('--- TYPY ZADAŃ ---');
    Object.keys(S.typ).forEach(function (x) { var o = S.typ[x]; L.push((TYPE[x] || x) + ': ' + o.n + ' / ' + pct(o.ok1, o.n) + '% / ' + o.fail); });
    L.push(''); L.push('--- CODZIENNE vs BIZNES ---');
    Object.keys(S.tagc).forEach(function (x) { var o = S.tagc[x]; L.push((x === 'b' ? 'biznes' : 'codzienne') + ': ' + o.n + ' / ' + pct(o.ok1, o.n) + '% / ' + o.fail); });
    L.push(''); L.push('--- AKTYWNOŚĆ (ostatnie 14 dni: data zadania/od razu OK) ---');
    var d = new Date(); d.setDate(d.getDate() - 13);
    for (var i = 0; i < 14; i++) { k = dstr(d); if (S.days[k] && S.days[k].n) L.push(k + ': ' + S.days[k].n + '/' + S.days[k].ok); d.setDate(d.getDate() + 1); }
    L.push(''); L.push('--- NAJTRUDNIEJSZE ZADANIA (ile razy źle) ---');
    Object.keys(S.prog).filter(function (id) { return S.prog[id].l > 0; }).sort(function (a, b) { return S.prog[b].l - S.prog[a].l; }).slice(0, 25).forEach(function (id) {
      L.push('[' + id + '] ' + S.prog[id].l + '× | ' + taskBrief(BY[id]) + ' => ' + (BY[id] ? C.compile(BY[id]).model : '?'));
    });
    L.push(''); L.push('--- ODRZUCONE ODPOWIEDZI („Mój błąd”), ostatnie 80 ---');
    S.rej.slice(-80).forEach(function (r) { L.push('[' + r.id + '] ' + dstr(new Date(r.t)) + ' | ' + taskBrief(BY[r.id])); L.push('    moje: ' + r.ans.join('  ||  ')); L.push('    wzorzec: ' + (BY[r.id] ? C.compile(BY[r.id]).model : '?')); });
    L.push(''); L.push('--- ZGŁOSZONE BŁĘDY W ZADANIACH ---');
    S.flags.forEach(function (f) { L.push('[' + f.id + '] ' + dstr(new Date(f.t)) + ' | ' + taskBrief(BY[f.id])); L.push('    wzorzec: ' + (BY[f.id] ? C.compile(BY[f.id]).model : '?')); if (f.ans && f.ans.length) L.push('    moje odpowiedzi: ' + f.ans.join('  ||  ')); L.push('    uwaga: ' + (f.note || '(bez opisu)')); });
    if (!S.flags.length) L.push('(brak)');
    L.push(''); L.push(line('='));
    L.push('Prośba do Claude: przeanalizuj raport, oceń uznane własne wersje, popraw zgłoszone zadania i przygotuj plik importu JSON (format eng-offline-import) z nowymi zadaniami na moje najsłabsze typy błędów.');
    return L.join('\n');
  }
  function makeBackup() { var o = JSON.parse(JSON.stringify(S)); o.exported = Date.now(); o.dbVersion = DB.version; delete o._snapDay; return JSON.stringify(o); }

  function saveFile(name, text) {
    var blob = new Blob([text], { type: 'text/plain' }), file = null;
    try { file = new File([blob], name, { type: 'text/plain' }); } catch (e) { }
    if ((isIOS || standalone) && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).then(function () { return 'share'; }).catch(function (e) { if (e && e.name === 'AbortError') return 'cancel'; return dl(); });
    }
    return Promise.resolve(dl());
    function dl() { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return 'download'; }
  }
  function exportBackup(msgEl) {
    var txt = makeBackup();
    return saveFile('english-offline-KOPIA-' + dstr() + '.txt', txt).then(function (how) {
      if (how === 'cancel') { if (msgEl) msgEl.textContent = 'Anulowano – kopia nie została zapisana.'; return false; }
      S.lastExport = Date.now(); persistNow();
      if (msgEl) msgEl.textContent = (how === 'share' ? '✓ Wybierz „Zachowaj w Plikach”, jeśli jeszcze tego nie zrobiłeś. ' : '✓ Plik kopii pobrany. ') + 'Pamiętaj: jedyna kopia niezależna od telefonu to ten plik w Plikach (najlepiej w iCloud Drive). Kopie automatyczne znikają razem z ikoną aplikacji.';
      return true;
    });
  }

  function importText(text) {
    var o;
    try { o = JSON.parse(text.replace(/^﻿/, '').trim()); } catch (e) {
      var m = /\{[\s\S]*\}/.exec(text); try { o = m ? JSON.parse(m[0]) : null; } catch (e2) { o = null; }
    }
    if (!o || typeof o !== 'object') return { err: 'To nie jest poprawny plik JSON. Wklej dokładnie to, co wygenerował Claude.' };
    if (o.kind === 'eng-offline-backup') return { backup: o };
    var list = [], cards = o.cards || [], rep = { added: 0, updated: 0, skipped: [] };
    (o.tasks || []).forEach(function (t) { list.push(t); });
    cards.forEach(function (c) { list.push({ id: c.id, type: 'card', tag: c.tag, topic: c.topic, cat: c.cat || 'voc', pl: c.pl, a: Array.isArray(c.en) ? c.en : [c.en], ex: c.ex || c.note || '' }); });
    if (!list.length) return { err: 'W pliku nie ma zadań („tasks”) ani fiszek („cards”).' };
    list.forEach(function (t, idx) {
      var why = null;
      try {
        if (!t || typeof t !== 'object') why = 'to nie obiekt';
        else {
          t = JSON.parse(JSON.stringify(t));
          if (!TYPE[t.type]) why = 'nieznany typ „' + t.type + '”';
          else if (!Array.isArray(t.a) || !t.a.length || t.a.some(function (x) { return typeof x !== 'string' || !x.trim(); })) why = 'brak poprawnych odpowiedzi w „a”';
          else if (!t.pl && !t.q) why = 'brak treści („q” lub „pl”)';
          else if ((t.type === 'gap' || t.type === 'dialog') && String(t.q || '').indexOf('___') < 0) why = 'brak luki ___ w „q”';
          else {
            t.tag = t.tag === 'b' || t.tag === 'biznes' ? 'b' : 'd';
            t.topic = t.topic || 'general'; t.cat = t.cat || 'voc';
            (t.bad || []).forEach(function (b) { if (!b || !b.p) throw new Error('zły wpis w „bad”'); });
            (t.ban || []).forEach(function (b) { if (!b || !b.p) throw new Error('zły wpis w „ban”'); });
            if (t.need && !Array.isArray(t.need)) throw new Error('„need” musi być listą list');
            t.id = 'imp-' + String(t.id || hash(t.type + '|' + (t.q || '') + '|' + (t.pl || '') + '|' + t.a[0])).replace(/^imp-/, '');
            var c = C.compile(t);
            if (!c.list.length) why = 'pusty wzorzec odpowiedzi';
            else {
              c.raw.forEach(function (r) { var res = C.check(t, r, {}); if (res.r !== 'ok') throw new Error('wzorzec „' + r + '” nie przechodzi własnych reguł (' + res.r + ')'); });
              t.src = 'import'; t.imported = dstr();
            }
          }
        }
      } catch (e) { why = e.message || String(e); }
      if (why) { rep.skipped.push('#' + (idx + 1) + ': ' + why); return; }
      if (DB.tasks.some(function (x) { return x.id === t.id; })) { rep.skipped.push('#' + (idx + 1) + ': id już jest w bazie'); return; }
      var at = -1; S.imp.forEach(function (x, i) { if (x.id === t.id) at = i; });
      if (at >= 0) { S.imp[at] = t; rep.updated++; } else { S.imp.push(t); rep.added++; }
    });
    rebuild(); persistNow();
    return { rep: rep };
  }

  function modal(node) { var m = h('div', { class: 'modal' }, h('div', { class: 'card' }, node)); document.body.appendChild(m); return m; }

  function dataView() {
    var msg = h('p', { class: 'sm', id: 'dmsg' }), out = h('pre', { class: 'out hide' });
    var file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', class: 'hide' });
    var paste = h('textarea', { rows: 4, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Albo wklej tutaj tekst JSON z Claude…' });
    function handle(text) {
      var r = importText(text);
      if (r.err) { msg.textContent = '✗ ' + r.err; return; }
      if (r.backup) return restoreAsk(r.backup);
      msg.textContent = '✓ Import: dodano ' + r.rep.added + ', zaktualizowano ' + r.rep.updated + ', pominięto ' + r.rep.skipped.length + '.';
      if (r.rep.skipped.length) { out.textContent = 'Pominięte:\n' + r.rep.skipped.join('\n'); out.classList.remove('hide'); }
      paste.value = '';
    }
    function restoreAsk(b) {
      var n = Object.keys(b.prog || {}).length, mine = Object.keys(S.prog).length;
      var m = modal([h('h2', { style: 'margin-top:0' }, 'Przywrócić kopię?'),
        h('p', null, 'Kopia z ' + (b.exported ? dstr(new Date(b.exported)) + ' ' + tstr(b.exported) : '?') + ': ' + n + ' rozpoczętych zadań, ' + (b.xp || 0) + ' XP.'),
        h('p', null, 'Obecny stan w tej aplikacji: ' + mine + ' rozpoczętych zadań, ' + (S.xp || 0) + ' XP. Zostanie zastąpiony.'),
        h('div', { class: 'stack' },
          h('button', { class: 'pri', onclick: function () { S = fixState(b); delete S.exported; delete S.dbVersion; rebuild(); persistNow().then(function () { m.remove(); home(); }); } }, 'Tak, przywróć kopię'),
          h('button', { onclick: function () { m.remove(); } }, 'Anuluj'))]);
    }
    file.addEventListener('change', function () { var f = file.files && file.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { handle(String(rd.result || '')); file.value = ''; }; rd.onerror = function () { msg.textContent = '✗ Nie udało się odczytać pliku.'; }; rd.readAsText(f); });
    var est = h('b', null, '…');
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { est.textContent = Math.round((e.usage || 0) / 1024) + ' kB zajęte'; }).catch(function () { est.textContent = '?'; });
    var goalSel = h('div', { class: 'row' }, [10, 20, 30, 50].map(function (g) { return h('button', { class: (S.goal || 20) === g ? 'pri' : '', onclick: function () { S.goal = g; persistNow(); dataView(); } }, String(g)); }));
    show(header('Kopia i dane', home),
      h('h2', null, 'Eksport'),
      h('div', { class: 'stack' },
        h('button', { class: 'pri', onclick: function () { exportBackup(msg); } }, '💾 Zapisz kopię postępu (plik do Plików)'),
        h('button', { onclick: function () { var t = makeReport(); S.lastReport = Date.now(); saveSoon(); saveFile('english-offline-RAPORT-' + dstr() + '.txt', t).then(function (how) { msg.textContent = how === 'cancel' ? 'Anulowano.' : '✓ Raport gotowy – wklej go do rozmowy z Claude. Uwaga: raport to nie kopia postępu. Jedyna niezależna kopia to plik z przycisku „Zapisz kopię postępu” zapisany w Plikach.'; }); } }, '📄 Raport dla Claude (plik .txt)'),
        h('button', { onclick: function () { var t = makeReport(); out.textContent = t; out.classList.remove('hide'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { msg.textContent = '✓ Raport skopiowany do schowka.'; }, function () { msg.textContent = 'Zaznacz tekst poniżej i skopiuj ręcznie.'; }); else msg.textContent = 'Zaznacz tekst poniżej i skopiuj ręcznie.'; } }, '📋 Skopiuj raport do schowka')),
      h('div', { class: 'banner err sm' }, '⚠️ Jedyna kopia niezależna od telefonu to plik kopii zapisany w Plikach. Usunięcie ikony z ekranu głównego kasuje postęp razem z kopiami automatycznymi.'),
      h('button', { class: 'ghost', onclick: function () { var t = makeBackup(); out.textContent = t; out.classList.remove('hide'); var done = function () { msg.textContent = '✓ Kopia skopiowana do schowka. Wklej ją do Notatek. Przywracanie: wklej ten tekst w polu importu poniżej.'; }, manual = function () { msg.textContent = 'Zaznacz cały tekst poniżej, skopiuj i wklej do Notatek.'; }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, manual); else manual(); } }, '📋 Awaryjnie: skopiuj kopię postępu do schowka'),
      msg, out,
      h('h2', null, 'Import'),
      h('div', { class: 'stack' },
        h('button', { onclick: function () { file.click(); } }, '📥 Wczytaj plik (nowe zadania z Claude albo kopia postępu)'), file, paste,
        h('button', { onclick: function () { if (paste.value.trim()) handle(paste.value); else msg.textContent = 'Najpierw wklej tekst.'; } }, 'Importuj wklejony tekst')),
      h('h2', null, 'Dzienny cel (zadań)'), goalSel,
      h('h2', null, 'Stan zapisu'),
      h('div', { class: 'card' },
        h('div', { class: 'kv' }, h('span', null, 'Zapis główny (IndexedDB)'), h('b', null, save.idb ? '✓ działa' : '✗ niedostępny')),
        h('div', { class: 'kv' }, h('span', null, 'Kopia automatyczna (2. miejsce)'), h('b', null, lsGet() ? '✓ jest' : '✗ brak')),
        h('div', { class: 'kv' }, h('span', null, 'Pamięć trwała (persist)'), h('b', null, save.persisted === true ? '✓ przyznana' : save.persisted === false ? '✗ nieprzyznana' : 'nieznane')),
        h('div', { class: 'kv' }, h('span', null, 'Uruchomiona z ikony'), h('b', null, standalone ? '✓ tak' : 'nie (przeglądarka)')),
        h('div', { class: 'kv' }, h('span', null, 'Pliki offline'), h('b', null, offline.have + '/' + offline.need)),
        h('div', { class: 'kv' }, h('span', null, 'Ostatni zapis'), h('b', null, save.at ? dstr(new Date(save.at)) + ' ' + tstr(save.at) : '—')),
        h('div', { class: 'kv' }, h('span', null, 'Ostatnia kopia w Plikach'), h('b', null, S.lastExport ? dstr(new Date(S.lastExport)) : 'nigdy')),
        h('div', { class: 'kv' }, h('span', null, 'Dane aplikacji'), est),
        h('div', { class: 'kv' }, h('span', null, 'Zadania z importu / do sprawdzenia / zgłoszenia'), h('b', null, (S.imp || []).length + ' / ' + Object.keys(S.acc).length + ' / ' + S.flags.length)),
        h('div', { class: 'kv' }, h('span', null, 'Wersja bazy'), h('b', null, DB.version)),
        h('div', { class: 'kv' }, h('span', null, 'Wersja aplikacji'), h('b', null, DB.build || '?'))),
      h('div', { class: 'stack' },
        canSpeak() ? h('button', { onclick: function () { msg.textContent = speak('This is a voice test. If you can hear me, everything works.') ? '🔊 Powinieneś słyszeć angielski głos. Cisza? Sprawdź przełącznik wyciszenia i głośność.' : '✗ Głos niedostępny na tym urządzeniu.'; } }, '🔊 Test głosu') : null,
        h('button', { onclick: function () { checkUpdate(msg); } }, '🔄 Sprawdź aktualizację aplikacji'),
        h('button', { class: 'ghost', onclick: resetAsk }, 'Wyzeruj cały postęp…'),
        h('button', { onclick: home }, 'Wróć')));
    paintSave();
  }
  function resetAsk() {
    var m = modal([h('h2', { style: 'margin-top:0' }, 'Wyzerować postęp?'), h('p', null, 'Usunie powtórki, statystyki, własne wersje, zgłoszenia i zaimportowane zadania z tego urządzenia. Najpierw zrób kopię.'),
      h('div', { class: 'stack' },
        h('button', { onclick: function () { exportBackup(null); } }, '💾 Najpierw zapisz kopię'),
        h('button', { class: 'ghost', style: 'color:var(--bad)', onclick: function () { S = freshState(); rebuild(); persistNow().then(function () { m.remove(); home(); }); } }, 'Tak, wyzeruj'),
        h('button', { class: 'pri', onclick: function () { m.remove(); } }, 'Anuluj'))]);
  }

  function flightView() {
    var rows = h('div'), msg = h('p', { class: 'sm' });
    function row(ok, text) { return h('div', { class: 'check' }, h('span', null, ok === true ? '✅' : ok === false ? '❌' : '⏳'), h('span', null, text)); }
    function paint(st) {
      rows.innerHTML = '';
      add(rows, row(st.saved, 'Postęp zapisany w pamięci telefonu' + (st.saved ? ' (' + tstr(save.at) + ')' : '')));
      add(rows, row(!!lsGet(), 'Automatyczna kopia w drugim miejscu'));
      add(rows, row(offline.ok, 'Pliki aplikacji w pamięci offline: ' + offline.have + '/' + offline.need));
      add(rows, row(standalone ? true : (isIOS ? false : null), standalone ? 'Uruchomiona z ikony na ekranie początkowym' : 'Uruchom z ikony na ekranie początkowym (nie z Safari)'));
      add(rows, row(save.persisted === true ? true : null, save.persisted === true ? 'Pamięć trwała przyznana' : 'Pamięć trwała: system nie potwierdził (na iOS to częste – dlatego plik kopii jest ważny)'));
      add(rows, row(st.file, 'Plik kopii zapisany w Plikach'));
    }
    var st = { saved: null, file: S.lastExport && (Date.now() - S.lastExport) < 3600e3 ? true : null };
    show(header('Przed lotem', home),
      h('div', { class: 'card' }, rows),
      h('div', { class: 'banner err sm' }, '⚠️ Usunięcie ikony z ekranu głównego kasuje postęp. Jedyna kopia niezależna od telefonu to plik zapisany w Plikach.'),
      h('div', { class: 'stack' },
        h('button', { class: 'flight', onclick: function () { exportBackup(msg).then(function (ok) { st.file = ok ? true : st.file; paint(st); }); } }, '💾 Zapisz plik kopii teraz'),
        msg,
        h('div', { class: 'card sm' }, h('b', null, 'Test na ziemi (30 sekund):'), h('br'), '1. Włącz tryb samolotowy i wyłącz Wi-Fi.', h('br'), '2. Zamknij aplikację (przesuń ją w górę w przełączniku aplikacji).', h('br'), '3. Otwórz ją z ikony i zrób jedno zadanie.', h('br'), '4. Działa? Jesteś gotowy. Nie działa? Wyłącz tryb samolotowy, otwórz aplikację z internetem i sprawdź „Pliki offline” powyżej.'),
        h('button', { onclick: home }, 'Wróć')));
    paintSave(); paint(st);
    Promise.all([persistNow(), checkCache(), askPersist()]).then(function (r) { st.saved = !!r[0]; paint(st); });
  }

  // ---------- service worker ----------
  function applyUpdate() {
    persistNow().then(function () {
      var w = swState.reg && swState.reg.waiting;
      if (w) w.postMessage('skip'); else location.reload();
    });
  }
  function checkUpdate(msgEl) {
    if (!swState.reg) { if (msgEl) msgEl.textContent = 'Service worker nieaktywny (aplikacja otwarta bez https?).'; return; }
    if (msgEl) msgEl.textContent = 'Sprawdzam…';
    swState.reg.update().then(function () {
      setTimeout(function () { if (msgEl) msgEl.textContent = (swState.waiting || swState.reg.waiting || swState.reg.installing) ? 'Jest nowa wersja – wróć na start i kliknij „Zaktualizuj teraz”.' : 'Masz aktualną wersję (' + DB.version + ').'; if (swState.reg.waiting) swState.waiting = true; }, 1500);
    }).catch(function () { if (msgEl) msgEl.textContent = 'Brak internetu – nie mogę sprawdzić. Aplikacja działa dalej offline.'; });
  }
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    var reloading = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloading || !hadController) { hadController = true; checkCache().then(function () { if (!sess && document.getElementById('offl')) home(); }); return; } reloading = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      swState.reg = reg;
      function watch(w) { if (!w) return; w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) { swState.waiting = true; if (!sess && document.getElementById('offl')) home(); } if (w.state === 'activated') checkCache().then(function () { if (!sess && document.getElementById('offl')) home(); }); }); }
      if (reg.waiting && navigator.serviceWorker.controller) { swState.waiting = true; if (!sess && document.getElementById('offl')) home(); }
      watch(reg.installing);
      reg.addEventListener('updatefound', function () { watch(reg.installing); });
      if (navigator.onLine !== false) reg.update().catch(function () { });
    }).catch(function () { });
  }

  // ---------- start ----------
  loadState().then(function () {
    rebuild();
    home();
    askPersist();
    initSW();
    if (!S.updated) persistNow();
  });

  self.__eng = { open: function (id) { sess = { mode: 'quick', q: [id], i: 0, xp: 0, ok1: 0, ok2: 0, fail: 0, retry: {}, total: 1, done: 0 }; nextTask(); }, home: function () { sess = null; home(); },
    state: function () { return S; }, sess: function () { return sess; }, by: function (id) { return BY[id]; }, build: buildSession, report: makeReport, backup: makeBackup, importText: importText, save: persistNow };
})();
