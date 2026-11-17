/* English Offline – moduł sprawdzania odpowiedzi (bez AI, działa offline).
   Wspólny dla aplikacji (przeglądarka) i testów (Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Checker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- pisownia brytyjska -> amerykańska (obie uznawane za poprawne) ---
  var BR = {
    colour: 'color', colours: 'colors', favourite: 'favorite', favourites: 'favorites', flavour: 'flavor', flavours: 'flavors',
    honour: 'honor', labour: 'labor', neighbour: 'neighbor', neighbours: 'neighbors', neighbourhood: 'neighborhood',
    behaviour: 'behavior', humour: 'humor', rumour: 'rumor', rumours: 'rumors', harbour: 'harbor', favour: 'favor', favours: 'favors',
    centre: 'center', centres: 'centers', theatre: 'theater', theatres: 'theaters', metre: 'meter', metres: 'meters',
    litre: 'liter', litres: 'liters', kilometre: 'kilometer', kilometres: 'kilometers', fibre: 'fiber',
    organise: 'organize', organised: 'organized', organising: 'organizing', organisation: 'organization',
    realise: 'realize', realised: 'realized', realising: 'realizing', recognise: 'recognize', recognised: 'recognized',
    apologise: 'apologize', apologised: 'apologized', apologising: 'apologizing', specialise: 'specialize', specialised: 'specialized',
    specialises: 'specializes', specialising: 'specializing', finalise: 'finalize', finalised: 'finalized', finalising: 'finalizing',
    prioritise: 'prioritize', summarise: 'summarize', emphasise: 'emphasize', criticise: 'criticize', analyse: 'analyze', analysed: 'analyzed',
    memorise: 'memorize', minimise: 'minimize', maximise: 'maximize', optimise: 'optimize', customise: 'customize', customised: 'customized',
    authorise: 'authorize', authorised: 'authorized', standardise: 'standardize', organiser: 'organizer',
    travelling: 'traveling', travelled: 'traveled', traveller: 'traveler', travellers: 'travelers',
    cancelled: 'canceled', cancelling: 'canceling', labelled: 'labeled', labelling: 'labeling', modelling: 'modeling',
    fuelled: 'fueled', fuelling: 'fueling', levelled: 'leveled', jewellery: 'jewelry', fulfil: 'fulfill', enrol: 'enroll',
    programme: 'program', programmes: 'programs', cheque: 'check', cheques: 'checks', licence: 'license', defence: 'defense',
    offence: 'offense', practise: 'practice', practised: 'practiced', practising: 'practicing', grey: 'gray', tyre: 'tire', tyres: 'tires',
    kerb: 'curb', aluminium: 'aluminum', catalogue: 'catalog', catalogues: 'catalogs', dialogue: 'dialog', analogue: 'analog',
    cosy: 'cozy', storey: 'story', plough: 'plow', sceptical: 'skeptical', ageing: 'aging', judgement: 'judgment',
    learnt: 'learned', dreamt: 'dreamed', spelt: 'spelled', burnt: 'burned', leant: 'leaned', smelt: 'smelled', spoilt: 'spoiled',
    whilst: 'while', towards: 'toward', afterwards: 'afterward', forwards: 'forward', backwards: 'backward', upwards: 'upward',
    maths: 'math', mum: 'mom', mums: 'moms', mummy: 'mommy', pyjamas: 'pajamas', yoghurt: 'yogurt', doughnut: 'donut', doughnuts: 'donuts',
    // słowa wyłącznie brytyjskie -> odpowiednik amerykański (jednoznaczne)
    petrol: 'gas', lorry: 'truck', lorries: 'trucks', takeaway: 'takeout', motorway: 'highway',
    rubbish: 'trash', autumn: 'fall', cv: 'resume', biscuit: 'cookie', biscuits: 'cookies', timetable: 'schedule',
    film: 'movie', films: 'movies', anticlockwise: 'counterclockwise', aeroplane: 'airplane', aeroplanes: 'airplanes'
  };

  var WORDMAP = {
    gonna: 'going to', wanna: 'want to', gotta: 'got to', kinda: 'kind of', sorta: 'sort of', dunno: 'do not know',
    ok: 'okay', alright: 'all right', yeah: 'yes', yep: 'yes', nope: 'no', cannot: 'cannot',
    im: 'i am', ive: 'i have', dont: 'do not', doesnt: 'does not', didnt: 'did not', cant: 'cannot', isnt: 'is not',
    arent: 'are not', wasnt: 'was not', werent: 'were not', havent: 'have not', hasnt: 'has not', hadnt: 'had not',
    wouldnt: 'would not', couldnt: 'could not', shouldnt: 'should not', youre: 'you are', theyre: 'they are', thats: 'that is',
    whats: 'what is', theres: 'there is', youll: 'you will', theyll: 'they will', itll: 'it will', weve: 'we have', youve: 'you have', theyve: 'they have',
    wont: 'will not', hes: 'he is', shes: 'she is', whos: 'who is', hows: 'how is', wheres: 'where is', heres: 'here is', couldve: 'could have',
    shouldve: 'should have', wouldve: 'would have', mustve: 'must have', hadnt: 'had not', mustnt: 'must not', neednt: 'need not',
    lets: 'let us', zero: '0', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50'
  };

  var S_IS = { it: 1, he: 1, she: 1, that: 1, there: 1, here: 1, what: 1, who: 1, where: 1, how: 1, when: 1, why: 1,
    everything: 1, nothing: 1, something: 1, everyone: 1, someone: 1, everybody: 1, nobody: 1, somebody: 1, this: 1 };

  function expandToken(t) {
    if (t.indexOf("'") < 0) {
      if (BR[t]) return BR[t];
      if (WORDMAP[t]) return WORDMAP[t];
      return t;
    }
    if (t === "can't") return 'cannot';
    if (t === "won't") return 'will not';
    if (t === "shan't") return 'shall not';
    if (t === "let's") return 'let us';
    if (t === "o'clock") return 'oclock';
    if (t === "y'all") return 'you all';
    var m;
    if ((m = /^(.+)n't$/.exec(t))) return m[1] + ' not';
    if ((m = /^(.+)'re$/.exec(t))) return m[1] + ' are';
    if ((m = /^(.+)'ve$/.exec(t))) return m[1] + ' have';
    if ((m = /^(.+)'ll$/.exec(t))) return m[1] + ' will';
    if ((m = /^(.+)'m$/.exec(t))) return m[1] + ' am';
    if ((m = /^(.+)'d$/.exec(t))) return m[1] + ' would';
    if ((m = /^(.+)'s$/.exec(t))) { if (S_IS[m[1]]) return m[1] + ' is'; return (BR[m[1]] || m[1]) + "'s"; }
    if ((m = /^(.+)s'$/.exec(t))) return m[1] + "s'";
    return t.replace(/'/g, '');
  }

  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toLowerCase();
    s = s.replace(/[‘’ʼ`´′‛]/g, "'");
    s = s.replace(/&/g, ' and ').replace(/%/g, ' percent ');
    s = s.replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2');      // 1,000 / 1.000 -> 1000
    s = s.replace(/[^a-z0-9'À-ɏ]+/g, ' ');       // interpunkcja, myślniki -> spacja
    var raw = s.split(' '), out = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].replace(/^'+|'+$/g, function (q, off) { return off === 0 ? '' : (/s'$/.test(raw[i]) ? "'" : ''); });
      if (!t) continue;
      out.push(expandToken(t));
    }
    s = ' ' + out.join(' ') + ' ';
    s = s.replace(/ can not /g, ' cannot ')
      .replace(/ (is|would) (been|got|gotten) /g, function (m0, a, b) { return (a === 'is' ? ' has ' : ' had ') + b + ' '; })
      .replace(/ would better /g, ' had better ')
      .replace(/ would (already|never|just) (been|seen|done|gone|met|had|heard|left|finished) /g, ' had $1 $2 ')
      .replace(/ would (seen|done|gone|met|heard|known|forgotten|finished|eaten|told) /g, ' had $1 ')
      .replace(/ e mail/g, ' email')
      .replace(/ at the weekend /g, ' on the weekend ').replace(/ at weekends /g, ' on weekends ')
      .replace(/ car park /g, ' parking lot ').replace(/ mobile phone /g, ' cell phone ')
      .replace(/ a m /g, ' am ').replace(/ p m /g, ' pm ')
      .replace(/ +/g, ' ');
    return s.trim();
  }

  function toks(n) { return n ? n.split(' ') : []; }

  // --- wzorce: (a|b|) alternatywy, [x] opcjonalne, zagnieżdżanie dozwolone ---
  function expand(p, limit) {
    limit = limit || 4000;
    var i = 0;
    function cross(a, b) {
      var r = [];
      for (var x = 0; x < a.length; x++) for (var y = 0; y < b.length; y++) {
        r.push(a[x] + b[y]);
        if (r.length > limit) throw new Error('Za dużo wariantów we wzorcu: ' + p);
      }
      return r;
    }
    function seq(stop) {
      var res = [''];
      while (i < p.length && stop.indexOf(p[i]) < 0) {
        var ch = p[i];
        if (ch === '(') { i++; var a1 = alts(')'); if (p[i] !== ')') throw new Error('Brak ) we wzorcu: ' + p); i++; res = cross(res, a1); }
        else if (ch === '[') { i++; var a2 = alts(']'); if (p[i] !== ']') throw new Error('Brak ] we wzorcu: ' + p); i++; res = cross(res, [''].concat(a2)); }
        else if (ch === ')' || ch === ']') { throw new Error('Nadmiarowy nawias we wzorcu: ' + p); }
        else { var j = i; while (j < p.length && '()[]|'.indexOf(p[j]) < 0) j++; var lit = p.slice(i, j); i = j; res = res.map(function (r) { return r + lit; }); }
      }
      return res;
    }
    function alts(close) {
      var all = [];
      for (;;) { all = all.concat(seq('|' + close)); if (p[i] === '|') { i++; continue; } break; }
      return all;
    }
    var out = seq('');
    if (i < p.length) throw new Error('Błąd składni wzorca: ' + p);
    return out.map(function (s) { return s.replace(/\s+/g, ' ').replace(/\s+([,.?!;:])/g, '$1').trim(); });
  }

  function uniq(a) { var s = {}, o = []; for (var i = 0; i < a.length; i++) if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); } return o; }

  var GAP_TYPES = { gap: 1, dialog: 1, conn: 1, idiom: 1 };

  // linia z luką (dla dialogu: tylko kwestia zawierająca ___, bez "A:")
  function gapLine(task) {
    var q = task.q || '';
    if (q.indexOf('___') < 0) return null;
    var parts = q.split(' / ');
    for (var i = 0; i < parts.length; i++) if (parts[i].indexOf('___') >= 0) return parts[i].replace(/^\s*[A-Z][A-Za-z]*:\s*/, '').replace(/\s*\([^)]*\)\s*$/, '');
    return null;
  }

  function compile(task) {
    if (task._c) return task._c;
    var c = { variants: {}, list: [], model: '', bad: [], ban: [], need: [] };
    var raws = [];
    (task.a || []).forEach(function (p) { raws = raws.concat(expand(p)); });
    c.model = raws[0] || '';
    c.raw = raws;
    var line = GAP_TYPES[task.type] ? gapLine(task) : null;
    raws.forEach(function (r) {
      var n = norm(r);
      if (n && !c.variants[n]) { c.variants[n] = 1; c.list.push(n); }
      if (line) { var f = norm(line.replace('___', ' ' + r + ' ')); if (f && !c.variants[f]) { c.variants[f] = 2; c.list.push(f); } }
    });
    c.count = Object.keys(c.variants).filter(function (k) { return c.variants[k] === 1; }).length;
    (task.bad || []).forEach(function (b) {
      var set = {};
      expand(b.p).forEach(function (r) {
        set[norm(r)] = 1;
        if (line) set[norm(line.replace('___', ' ' + r + ' '))] = 1;
      });
      c.bad.push({ set: set, m: b.m });
    });
    if (task.type === 'fix' && task.q) { var s0 = {}; s0[norm(task.q)] = 1; c.bad.push({ set: s0, m: 'Zdanie jest bez zmian – błąd nadal w nim siedzi.' }); }
    (task.ban || []).forEach(function (b) {
      c.ban.push({ alts: uniq(expand(b.p).map(norm)).filter(Boolean), m: b.m });
    });
    (task.need || []).forEach(function (g) {
      c.need.push(uniq(g.map(norm)).filter(Boolean));
    });
    if (task.type === 'translate' && task.req) c.req = norm(task.req);
    Object.defineProperty(task, '_c', { value: c, enumerable: false, configurable: true });
    return c;
  }

  function hasSeq(n, phrase) { return (' ' + n + ' ').indexOf(' ' + phrase + ' ') >= 0; }
  function idxSeq(n, phrase, from) { return (' ' + n + ' ').indexOf(' ' + phrase + ' ', from); }

  // odległość Damerau-Levenshteina, tylko czy <= 1
  function within1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;                                   // podmiana
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);   // zamiana sąsiednich
    }
    if (la > lb) return a.slice(i + 1) === b.slice(i);
    return a.slice(i) === b.slice(i + 1);
  }

  // końcówki gramatyczne – różnica w nich to nie literówka
  function grammarDiff(a, b) {
    var x = a.length >= b.length ? a : b, y = a.length >= b.length ? b : a;
    if (x === y + 's' && /ss$/.test(x)) return false;      // business / busines – to literówka, nie liczba mnoga
    if (x === y + 's' || x === y + 'd' || x === y + 'e' || x === y + 'r' || x === y + 'y' || x === y + 'n') return true;
    if (a.length === b.length && a.slice(0, -1) === b.slice(0, -1)) {
      var pair = a.slice(-1) + b.slice(-1);
      if (/^(sd|ds|ed|de|es|se|dn|nd|ty|yt|mn|nm)$/.test(pair)) return true;
    }
    return false;
  }

  var PROTECT = {};
  ('a an the to too of off on in at by for from with as is are was were be been am do does did has have had it its if so no not ' +
   'than then this that these those they them their there here where were we he she his her him you your our us me my i or and but ' +
   'who whom whose which what when why how much many few less more most some any each every both all one once ' +
   'affect effect accept except advice advise quite quiet lose loose lost last list form price prize ' +
   'good goods guts food foot feet feel fell fill full fall felt left lift life live love leave late later latter ' +
   'work works word words worked week weak meet meat met made make take took talk tell told sell sold sale sales sail ' +
   'want went wont send sent seen seem same some come came can cant car care card cart ' +
   'think thing thinks things thank than though through thought tough ' +
   'bring bought brought buy bye pay paid day days say says said see sea set sit seat site side size ' +
   'ship shop shipped shipping shipment show shown know known now new knew news near need ' +
   'offer order orders ordered other others over open option options plan plane plans place piece peace ' +
   'watch watched watching wash wish which witch white write wrote right rate ride road read ready really real ' +
   'time times tired tried tries trip trade train rain run ran rent ' +
   'long along alone also already always almost about above able ' +
   'call called cold could would should shall will well wall walk wait want way why ' +
   'here hear heard hard hand had head held help hold hole whole home hope house hour hours our ' +
   'best beat bit but bet better bill bell ball back bad bag big bag').split(' ').forEach(function (w) { PROTECT[w] = 1; });

  var SOFT = /^Poprawnie, ale ćwiczymy/;   // poprawny synonim: komunikat bez liczenia próby
  function typoMatch(utoks, vtoks, vocab) {
    if (utoks.length !== vtoks.length) return null;
    var diff = -1;
    for (var i = 0; i < utoks.length; i++) if (utoks[i] !== vtoks[i]) { if (diff >= 0) return null; diff = i; }
    if (diff < 0) return null;
    var u = utoks[diff], v = vtoks[diff];
    if (v.indexOf("'") >= 0 && v.replace(/'/g, '') === u) return { from: u, to: v, apos: true };   // sam brak apostrofu (Toms = Tom's)
    if (v.length <= 4 || u.length <= 4 || /\d/.test(v) || /\d/.test(u)) return null;         // słowa do 4 liter: bez tolerancji literówek
    if (!within1(u, v)) return null;
    if (grammarDiff(u, v)) return null;
    if (PROTECT[u] || (vocab && vocab[u])) return null;      // "literówka" jest innym prawdziwym słowem
    return { from: u, to: v };
  }

  /* Wynik: { r: 'ok'|'bad'|'near'|'no'|'empty', via, msg, typo, model }
     ok   – poprawna (via: exact | own | typo)
     bad  – znana zła wersja / zakazany fragment (msg = konkretny komunikat)
     near – kluczowe elementy są, ale całość nie pasuje do żadnej znanej wersji
     no   – brakuje wymaganego elementu */
  function check(task, input, ctx) {
    ctx = ctx || {};
    var c = compile(task), n = norm(input);
    if (!n) return { r: 'empty' };
    var own = ctx.accepted || [];
    for (var o = 0; o < own.length; o++) if (own[o] === n) return { r: 'ok', via: 'own', model: c.model };
    if (c.variants[n]) return { r: 'ok', via: 'exact', model: c.model };
    var i, j;
    for (i = 0; i < c.bad.length; i++) if (c.bad[i].set[n]) return { r: 'bad', msg: c.bad[i].m, soft: SOFT.test(c.bad[i].m || ''), model: c.model };
    for (i = 0; i < c.ban.length; i++) for (j = 0; j < c.ban[i].alts.length; j++)
      if (hasSeq(n, c.ban[i].alts[j])) return { r: 'bad', msg: c.ban[i].m, model: c.model };
    var alts = noApos(n);
    for (i = 0; i < alts.length; i++) {
      if (c.variants[alts[i]]) return { r: 'ok', via: 'exact', model: c.model };
      for (o = 0; o < own.length; o++) if (own[o] === alts[i]) return { r: 'ok', via: 'own', model: c.model };
    }
    var ut = toks(n);
    for (i = 0; i < c.list.length; i++) {
      var tm = typoMatch(ut, toks(c.list[i]), ctx.vocab);
      if (tm) return { r: 'ok', via: 'typo', typo: tm, model: c.model };
    }
    if (c.req && !hasSeq(n, c.req)) return { r: 'no', why: 'req', model: c.model };
    var pos = 0;
    for (i = 0; i < c.need.length; i++) {
      var best = -1, bl = 0;
      for (j = 0; j < c.need[i].length; j++) {
        var k = idxSeq(n, c.need[i][j], pos);
        if (k >= 0 && (best < 0 || k < best)) { best = k; bl = c.need[i][j].length; }
      }
      if (best < 0) return { r: 'no', why: 'need', group: i, model: c.model };
      pos = best + bl;
    }
    return { r: 'near', model: c.model };
  }

  var NOAPOS = { its: 'it is', ill: 'i will', id: 'i would', were: 'we are', well: 'we will', wed: 'we would' };
  function noApos(n) {
    var t = toks(n), out = [], all = t.slice(), any = false;
    for (var i = 0; i < t.length; i++) if (NOAPOS[t[i]]) { any = true; var one = t.slice(); one[i] = NOAPOS[t[i]]; out.push(one.join(' ')); all[i] = NOAPOS[t[i]]; }
    if (any) out.push(all.join(' '));
    return out;
  }

  // czy odpowiedź przechodzi same reguły (need + ban) – używane przez walidator
  function rulesPass(task, input) {
    var c = compile(task), n = norm(input), i, j;
    for (i = 0; i < c.ban.length; i++) for (j = 0; j < c.ban[i].alts.length; j++) if (hasSeq(n, c.ban[i].alts[j])) return false;
    if (c.req && !hasSeq(n, c.req)) return false;
    var pos = 0;
    for (i = 0; i < c.need.length; i++) {
      var best = -1, bl = 0;
      for (j = 0; j < c.need[i].length; j++) { var k = idxSeq(n, c.need[i][j], pos); if (k >= 0 && (best < 0 || k < best)) { best = k; bl = c.need[i][j].length; } }
      if (best < 0) return false;
      pos = best + bl;
    }
    return true;
  }

  return { norm: norm, expand: expand, compile: compile, check: check, rulesPass: rulesPass, gapLine: gapLine, GAP_TYPES: GAP_TYPES, PROTECT: PROTECT, SOFT: SOFT };
});
