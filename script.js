/* Error catcher: shows a message on the page if something goes wrong */
window.addEventListener('error', function (e) {
  var b = document.getElementById('bootMsg'); if (!b) return;
  b.style.display = 'block'; b.dataset.err = '1';
  b.innerHTML = '<b>The planner hit a problem and couldn\u2019t start.</b> ' + (e.message ? 'The browser says: ' + String(e.message).replace(/</g, '&lt;') + (e.lineno ? ' (line ' + e.lineno + ')' : '') + '. ' : '') + 'Try pasting the whole file again, from the first line to the last.';
});

var CARDS = [];
var STARTER_WORDS = [];
/* every drop space: what it holds and what it is called */
var SLOTS = {
  title:{accept:'any', hint:'Title: drop a heading or drawing'},
  cover:{accept:'img', hint:'Cover picture'}, coverCap:{accept:'text', hint:'Words'},
  end:{accept:'any', hint:'The end: drop words or a drawing'}
};
var MAX_PANELS = 12, panelCount = 6;
for (var n = 1; n <= MAX_PANELS; n++) {
  SLOTS['p' + n] = {accept:'img', hint:'Panel ' + n}; SLOTS['p' + n + 'Cap'] = {accept:'text', hint:'Words'};
  SLOTS['p' + n + 'Head'] = {accept:'text', hint:'Drop a heading for these cards'};
  for (var ck = 1; ck <= 6; ck++) { SLOTS['p' + n + 'c' + ck] = {accept:'img', hint:'Card ' + ck}; SLOTS['p' + n + 'c' + ck + 'Cap'] = {accept:'text', hint:'Words'}; }
}
var CAP_N = 18;   /* the most pieces any box can hold; capLimit() decides how many fit a given box */
function capIds(base) { var a = [base + 'Cap']; for (var i = 2; i <= CAP_N; i++) a.push(base + 'Cap' + i); return a; }
function capBase(id) { return id.replace(/Cap\d?$/, ''); }
function capsUsed(base) { return capIds(base).filter(function (id) { return placed[id]; }); }
/* the word spot for a piece dropped on a box: its own spot if it is already there, else the first free one */
/* bigger boxes hold more pieces: about 2 for every quarter-width, one-row block (at least 4, at most 18) */
function capLimit(base) {
  if (base === 'cover') return 6;
  var m = /^p(\d+)(?:c(\d))?$/.exec(base); if (!m) return 4;
  var sz = sizes[+m[1]] || {c: 6, r: 6}, cells = (sz.c / 3) * (sz.r / 6);
  if (m[2]) cells = cells * cardW(base) / 12 / Math.max(1, cardLayout(+m[1]).length);
  return Math.max(4, Math.min(18, Math.round(2 * cells)));
}
function freeCap(base, pid) {
  var ids = capIds(base), i;
  for (i = 0; i < ids.length; i++) if (placed[ids[i]] === pid) return ids[i];
  if (capsUsed(base).length >= capLimit(base)) return null;
  for (i = 0; i < ids.length; i++) if (!placed[ids[i]]) return ids[i];
  return null;
}
/* take a piece off the page; placeholders are deleted outright */
function removePiece(id) {
  var p = piece(id), sl = slotOf(id); if (!p) return;
  if (sl) { delete placed[sl]; delete capPos[sl]; delete mediaW[sl]; delete picFit[sl]; delete picPos[sl]; }
  multi = multi.filter(function (m) { return m !== id; });
  if (p.type === 'img' && p.ph) { extra = extra.filter(function (c) { return c.id !== id; }); say('Placeholder deleted.'); }
  else say(p.type === 'img' ? 'Drawing taken off the page. It is back in your drawings.' : 'Words taken off the page. They are back in your words.');
  selected = null; picFocus = null; panKey = null; render(); groupBar();
}
function duplicateSelected() {
  if (!selected) return; var from = slotOf(selected); if (!from || !/Cap\d?$/.test(from)) { toast('Select a piece on your page to duplicate it.'); return; }
  var base = capBase(from), src = piece(selected), nid, to;
  if (capsUsed(base).length >= capLimit(base)) { toast(fullMsg(base)); return; }
  if (src.type === 'img' && src.ph) {
    var orig = extra.find(function (c) { return c.id === selected; }); if (!orig) return;
    var copy = JSON.parse(JSON.stringify(orig)); copy.id = 'ph-' + orig.ph + '-' + Date.now();
    copy.alt = (orig.ph === 'video' ? 'Video placeholder ' : 'Image placeholder ') + (extra.filter(function (c) { return c.ph === orig.ph; }).length + 1);
    extra.push(copy); nid = copy.id;
  } else if (src.type === 'img') {
    /* a drawing copy is a new drawing with the same picture and file name */
    nid = 'add-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    extra.push({id: nid, alt: src.alt.replace(/ \(copy( \d+)?\)$/, '') + ' (copy)', src: src.src, file: src.file || (src.id + '.jpg')});
    if (imgRatio[src.id]) imgRatio[nid] = imgRatio[src.id];
  } else {
    var w0 = words.find(function (x) { return x.id === selected; }); if (!w0) return;
    var wc = JSON.parse(JSON.stringify(w0)); wc.id = 'w' + Date.now(); words.push(wc); nid = wc.id;
  }
  to = freeCap(base, nid); placed[to] = nid;
  if (mediaW[from]) mediaW[to] = mediaW[from];
  /* just below the original, or beside it if there is no room below */
  var capEl = document.querySelector('[data-slot="' + from + '"]'), box = capEl && capEl.closest('.box'), p0 = capPos[from] || {x: 2, y: 2};
  if (capEl && box) {
    var pd = padPx(box), bh = box.clientHeight - 2 * pd, bw = box.clientWidth - 2 * pd, hPct = capEl.offsetHeight / bh * 100, wPct = capEl.offsetWidth / bw * 100;
    var ny = p0.y + hPct + 2, nx = p0.x;
    if (ny + hPct > 100) { ny = p0.y; nx = p0.x + wPct + 2; if (nx + wPct > 100) { nx = Math.max(0, 100 - wPct); ny = Math.max(0, 100 - hPct); } }
    capPos[to] = {x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10};
  } else capPos[to] = {x: p0.x, y: Math.min(90, p0.y + 15)};
  selected = nid; selectedFrom = 'page'; render();
  say('Copy made. It is selected, so you can drag it where you want.');
}
var askOk = false;
function ask(msg, yesLabel, rerun) {
  if (askOk) { askOk = false; return true; }
  var o = document.getElementById('askBox');
  if (!o) {
    o = el('div', 'ask-wrap'); o.id = 'askBox'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="ask-box"><p id="askMsg"></p><div class="ask-btns"><button class="btn quiet" id="askNo">Cancel</button><button class="btn" id="askYes"></button></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) {
      if (e.target.id === 'askNo' || e.target === o) { o.classList.remove('open'); say('Cancelled.'); }
      else if (e.target.id === 'askYes') { o.classList.remove('open'); askOk = true; try { o._rerun(); } finally { askOk = false; } }
    });
  }
  document.getElementById('askMsg').textContent = msg; document.getElementById('askYes').textContent = yesLabel || 'Yes';
  o._rerun = rerun; o.classList.add('open'); document.getElementById('askYes').focus();
  return false;
}
document.addEventListener('keydown', function (e) { var o = document.getElementById('askBox'); if (o && o.classList.contains('open') && e.key === 'Escape') { o.classList.remove('open'); e.stopPropagation(); } }, true);
function groupBar() {}   /* Shift-click groups show only their dotted outlines */
function startMulti(slotId) {
  var pid = placed[slotId]; if (!pid) return;
  multiMode = true; if (multi.indexOf(pid) < 0) multi = [pid]; selected = null; picFocus = null; render(); groupBar();
  say('Picking several. Tap other pieces in this box to add them.');
}
function endMulti() { multiMode = false; multi = []; selected = null; render(); groupBar(); }
function toast(msg) {
  var t = document.getElementById('toast'); if (!t) { t = el('div', 'toast'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3500); say(msg);
}
function fullMsg(base) { return 'This box is full: it holds ' + capLimit(base) + ' pieces at this size. Make it bigger with Resize, or move a piece out.'; }
(function () { var bases = ['cover']; for (var n = 1; n <= MAX_PANELS; n++) { bases.push('p' + n); for (var k = 1; k <= 6; k++) bases.push('p' + n + 'c' + k); }
  bases.forEach(function (b) { for (var i = 2; i <= CAP_N; i++) SLOTS[b + 'Cap' + i] = {accept:'text', hint:'Words'}; }); })();
var NEST_ON = true;
var splits = splits || {};   /* panel number -> how many cards sit inside it (2 to 4) */
function isCardKey(k) { return /^p\d+c\d$/.test(k); }
var cardSizes = cardSizes || {};   /* card key -> width in 12ths of its panel */
var CARD_DEFAULT = {2:6, 3:4, 4:3, 5:4, 6:4};
function panelSufs() { var a = ['', 'Head'].concat(capIds('').map(function (x) { return x; })); for (var k = 1; k <= 6; k++) { a.push('c' + k); capIds('c' + k).forEach(function (x) { a.push(x); }); } return a; }
var picFit = picFit || {};
var picPos = picPos || {};   /* picture slot -> {x, y} percent: which part of a covering picture shows */
var picFocus = null, panKey = null, pan = null, selectedFrom = 'tray';
var multi = [], multiMode = false;   /* multiMode: plain taps add pieces to the group (no Shift needed) */   /* pieces picked with Shift in one box; dragging one moves them all */
var padShow = null;   /* the box whose padding is lit up green */
var pendingBg = null, pendingAt = 0;   /* a box waiting for an uploaded background picture */
var areaH = areaH || {};   /* title area, feature, footer -> height in pixels */
var AREA_H = [[120, 'Short'], [200, 'Medium'], [300, 'Tall'], [420, 'Extra tall'], [560, 'Huge']];
var AREA_NAME = {header:'Title area', section:'Feature', footer:'The end'};
var boxPad = boxPad || {};   /* panel or card key -> padding in pixels */
var PADS = [[0, 'None'], [8, 'Small'], [16, 'Medium'], [24, 'Large'], [32, 'Extra large']];
function padOf(key) { return boxPad[key] === undefined ? null : boxPad[key]; }
var snapOn = true;
function areaOfSlot(id) { return id === 'cover' ? 'section' : id; }   /* picture slot -> 'cover' when the picture fills its box edge to edge */
var cardRows = cardRows || {};   /* card key -> height share of the row it sits in (1 short, 2 medium, 3 tall) */
function cardR(key) { return cardRows[key] || 1; }
/* cards fill rows left to right; a new row starts when the 12 columns are used up */
function cardLayout(n) {
  var rows = [], cur = [], used = 0, k = cardsOf(n);
  for (var i = 1; i <= k; i++) { var key = 'p' + n + 'c' + i, w = cardW(key); if (used + w > 12 && cur.length) { rows.push(cur); cur = []; used = 0; } cur.push(key); used += w; }
  if (cur.length) rows.push(cur);
  return rows;
}
function rowShare(row) { var m = 1; row.forEach(function (k) { m = Math.max(m, cardR(k)); }); return m; }
function rowOf(n, key) { var rows = cardLayout(n); for (var i = 0; i < rows.length; i++) if (rows[i].indexOf(key) >= 0) return {i: i, row: rows[i], count: rows.length}; return null; }
function rowTemplate(n) { return cardLayout(n).map(function (r) { return rowShare(r) + 'fr'; }).join(' '); }
function sameShares(n) { var rs = cardLayout(n); return rs.every(function (r) { return rowShare(r) === rowShare(rs[0]); }); }
var SHARE_NAME = {1:'Short', 2:'Medium', 3:'Tall'};
function cardW(key) { var m = /^p(\d+)c\d$/.exec(key); return cardSizes[key] || CARD_DEFAULT[cardsOf(+m[1])] || 6; }
function cardsOf(n) { return NEST_ON && splits[n] >= 2 ? splits[n] : 0; }

var KEY = 'website-planner-blank-v1';
var DEFAULT_SIZES = {1:{c:8,r:6}, 2:{c:4,r:12}, 3:{c:4,r:6}, 4:{c:4,r:6}, 5:{c:6,r:6}, 6:{c:6,r:6}};
/* widths on a 12-column grid, shown three ways */
var WIDTHS = [3, 4, 6, 8, 9, 12];
var WGROUPS = [['Fourths', [3, 9]], ['Thirds', [4, 8]], ['Half', [6]], ['Full', [12]]];
/* heights in sixths of a comic row */
var HGROUPS = [['Part of a row', [2, 3]], ['Whole rows', [6, 12, 18]], ['More rows', [24, 30, 36]], ['Tall panels', [42, 48, 54]]];
var HLABEL = {2:'1/3 row', 3:'1/2 row', 6:'1 row', 12:'2 rows', 18:'3 rows', 24:'4 rows', 30:'5 rows', 36:'6 rows', 42:'7 rows', 48:'8 rows', 54:'9 rows'};
function hLabel(u) { return HLABEL[u] || (u / 6) + ' rows'; }
var FRAC = {2:'1/6', 3:'1/4', 4:'1/3', 6:'1/2', 8:'2/3', 9:'3/4', 10:'5/6', 12:'full (1/1)'};
var PCT = {2:'17%', 3:'25%', 4:'33%', 6:'50%', 8:'67%', 9:'75%', 10:'83%', 12:'100%'};
var notation = 'frac', codeStyle = 'tags', alsoShow = 'tags';
function classKeys(upTo) {
  var k = [['container','Whole page'],['header','Title area'],['section','Cover'],['row','Panel row']];
  for (var i = 1; i <= (upTo || panelCount); i++) k.push(['p' + i, 'Panel ' + i]);
  k.push(['card','Every card']); k.push(['footer','The end']); return k;
}
function defaultNames() { var o = {}; classKeys(MAX_PANELS).forEach(function (k) { o[k[0]] = /^p\d+$/.test(k[0]) ? 'panel-' + k[0].slice(1) : k[0]; }); return o; }
var classNames = defaultNames();
function cls(k) { return classNames[k] || defaultNames()[k]; }
function cleanName(v) { return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/^[^a-z_]+/, ''); }
/* the tag shown for each part, in either code style */
var SEMANTIC = {container:'body', header:'header', section:'section', row:'main', p:'figure', footer:'footer'};
var PSEUDO_NAME = {container:'page', header:'title', section:'feature', row:'panels', footer:'the end'};
function pName(key) { var m = /^p(\d+)c(\d)$/.exec(key); if (m) return 'card ' + m[2]; return /^p\d+$/.test(key) ? 'panel ' + key.slice(1) : PSEUDO_NAME[key]; }
function semTag(key) { if (isCardKey(key)) return 'article'; if (/^p\d+$/.test(key)) return cardsOf(+key.slice(1)) ? 'section' : 'figure'; return SEMANTIC[key]; }
function semOpen(key) { return isCardKey(key) ? '<article>' : (/^p\d+$/.test(key) && cardsOf(+key.slice(1)) ? '<section class="cards">' : '<' + semTag(key) + '>'); }
function divCls(key) { return isCardKey(key) ? cls('card') : cls(key); }
function openTag(key) { if (codeStyle === 'pseudo') return 'Start ' + pName(key); return openTag0(key); }
function closeTag(key) { if (codeStyle === 'pseudo') return 'Stop ' + pName(key); return closeTag0(key); }
function realOpen(key, style) { return style === 'div' ? '<div class="' + divCls(key) + '">' : semOpen(key); }
function realClose(key, style) { return style === 'div' ? '</div>' : '</' + semTag(key) + '>'; }
function hinting() { return codeStyle === 'pseudo' && alsoShow !== 'none'; }
function openTag0(key) { return realOpen(key, codeStyle === 'div' ? 'div' : 'tags'); }
function closeTag0(key) { return realClose(key, codeStyle === 'div' ? 'div' : 'tags'); }
function widthLabel(c) { return notation === 'pct' ? PCT[c] : notation === 'col' ? 'col-' + c : FRAC[c]; }
var hidden = [], placed = {}, extra = [], words = null, selected = null, capPos = {}, sizes = null;
try {
  var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) { hidden = saved.hidden || []; placed = saved.placed || {}; extra = saved.extra || []; words = saved.words || null; capPos = saved.capPos || {}; sizes = saved.sizes || null; notation = saved.notation || 'frac'; codeStyle = saved.codeStyle || 'tags'; if (saved.theme) theme = saved.theme; if (saved.splits) splits = saved.splits; if (saved.cardSizes) cardSizes = saved.cardSizes; if (saved.picFit) picFit = saved.picFit; if (saved.areaH) areaH = saved.areaH; if (saved.mediaW) mediaW = saved.mediaW; if (saved.boxPad) boxPad = saved.boxPad; if (saved.snapOn === false) snapOn = false; if (saved.picPos) picPos = saved.picPos; if (saved.cardRows) cardRows = saved.cardRows; if (saved.ux) { ux = saved.ux; ux.about = ux.about || {}; ux.checks = ux.checks || {}; ux.flow = ux.flow || []; } if (saved.bgs) bgs = saved.bgs; alsoShow = saved.alsoShow || 'tags'; if (saved.classNames) classNames = Object.assign(defaultNames(), saved.classNames); panelCount = Math.max(1, Math.min(MAX_PANELS, saved.panelCount || 6)); }
} catch (e) {}
if (sizes && !(saved && saved.hUnits)) { for (var k in sizes) sizes[k].r = Math.min(3, sizes[k].r) * 6; }
if (sizes) { for (var k2 in sizes) { var cc = sizes[k2].c; sizes[k2].c = cc <= 3 ? 3 : cc === 10 ? 9 : cc; } }
if (!sizes) sizes = JSON.parse(JSON.stringify(DEFAULT_SIZES));
for (var pn = 1; pn <= panelCount; pn++) if (!sizes[pn]) sizes[pn] = {c:6, r:6};
if (!words) words = STARTER_WORDS.map(function (w, i) { return {id:'w' + i, kind:w.kind, text:w.text}; });
function saveState() { return {hidden:hidden, placed:placed, extra:extra, words:words, capPos:capPos, sizes:sizes, notation:notation, codeStyle:codeStyle, alsoShow:alsoShow, theme:theme, bgs:bgs, ux:ux, splits:splits, areaH:areaH, mediaW:mediaW, snapOn:snapOn, boxPad:boxPad, picFit:picFit, picPos:picPos, cardSizes:cardSizes, cardRows:cardRows, classNames:classNames, hUnits:true, panelCount:panelCount}; }
function save() { trackHistory(); try { localStorage.setItem(KEY, JSON.stringify(saveState())); } catch (e) {} }

function allPieces() {
  return CARDS.filter(function (c) { return hidden.indexOf(c.id) < 0; }).map(function (c) { return {id:c.id, type:'img', alt:c.alt, src:c.src, file:c.file}; })
    .concat(extra.map(function (c) { return {id:c.id, type:'img', alt:c.alt, src:c.src, file:c.file, ph:c.ph, poster:c.poster}; }))
    .concat(words.map(function (w) { return {id:w.id, type:'txt', kind:w.kind, text:w.text, align:w.align, url:w.url, go:w.go, ph:w.ph, start:w.start, font:w.font, color:w.color, size:w.size, lh:w.lh, gap:w.gap, alt:(KIND_NAME[w.kind] || 'Sentence') + ': ' + String(w.text).replace(/\n+/g, ', ')}; }));
}
function piece(id) { return allPieces().find(function (p) { return p.id === id; }); }
function slotOf(id) { for (var s in placed) if (placed[s] === id) return s; return null; }
function floats(p) { return !!p && (p.type === 'txt' || p.type === 'img'); }
/* each picture's real shape (width / height), learned once it loads */
var imgRatio = {};
function ratioOf(p) { if (p.ph === 'video') return 16 / 9; if (p.ph) return 1.6; if (imgRatio[p.id]) return imgRatio[p.id];
  var im = new Image(); im.onload = function () { imgRatio[p.id] = im.naturalWidth / im.naturalHeight || 1.33; }; im.src = p.src; return 1.33; }
function fits(p, slotId) { var a = SLOTS[slotId].accept; return a === 'any' || (a === 'img' && p.type === 'img') || (a === 'text' && floats(p)); }
var mediaW = mediaW || {};   /* word spot holding a placeholder -> its width in % of the box */
function mw(id) { return mediaW[id] || 50; }
function say(m) { document.getElementById('status').textContent = m; }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

/* ---------- building pieces and boxes ---------- */
var LISTS_ON = true, STYLE_ON = true;
var PLANNER = true;
/* g: menu group. gf: the Google Fonts name, for fonts a computer may not already have */
var FONTS = [{k:'', n:'Default', s:''},
  {k:'playfair', g:'Serif', n:'Playfair Display', d:'elegant', s:"'Playfair Display', Georgia, serif", gf:'Playfair+Display:wght@400;700'},
  {k:'cormorant', g:'Serif', n:'Cormorant Garamond', d:'chic', s:"'Cormorant Garamond', Georgia, serif", gf:'Cormorant+Garamond:wght@400;700'},
  {k:'dmserif', g:'Serif', n:'DM Serif Display', d:'bold fashion', s:"'DM Serif Display', Georgia, serif", gf:'DM+Serif+Display'},
  {k:'lora', g:'Serif', n:'Lora', d:'warm and friendly', s:"Lora, Georgia, serif", gf:'Lora:wght@400;700'},
  {k:'merriweather', g:'Serif', n:'Merriweather', d:'easy to read', s:"Merriweather, Georgia, serif", gf:'Merriweather:wght@400;700'},
  {k:'georgia', g:'Serif', n:'Georgia', d:'classic book', s:'Georgia, serif'},
  {k:'times', g:'Serif', n:'Times New Roman', d:'newspaper', s:"'Times New Roman', serif"},
  {k:'atkinson', g:'Sans serif', n:'Atkinson Hyperlegible', d:'easiest to read', s:"'Atkinson Hyperlegible', Arial, sans-serif", gf:'Atkinson+Hyperlegible:wght@400;700'},
  {k:'lexend', g:'Sans serif', n:'Lexend', d:'easy to read', s:"Lexend, Arial, sans-serif", gf:'Lexend:wght@400;700'},
  {k:'inter', g:'Sans serif', n:'Inter', d:'clean app style', s:"Inter, Arial, sans-serif", gf:'Inter:wght@400;700'},
  {k:'montserrat', g:'Sans serif', n:'Montserrat', d:'modern', s:"Montserrat, Arial, sans-serif", gf:'Montserrat:wght@400;700'},
  {k:'poppins', g:'Sans serif', n:'Poppins', d:'round and friendly', s:"Poppins, Arial, sans-serif", gf:'Poppins:wght@400;700'},
  {k:'raleway', g:'Sans serif', n:'Raleway', d:'chic and light', s:"Raleway, Arial, sans-serif", gf:'Raleway:wght@400;700'},
  {k:'arial', g:'Sans serif', n:'Arial', d:'clean', s:'Arial, sans-serif'},
  {k:'verdana', g:'Sans serif', n:'Verdana', d:'wide', s:'Verdana, sans-serif'},
  {k:'trebuchet', g:'Sans serif', n:'Trebuchet', d:'friendly', s:"'Trebuchet MS', sans-serif"},
  {k:'bebas', g:'Display and handwriting', n:'Bebas Neue', d:'tall poster', s:"'Bebas Neue', Impact, sans-serif", gf:'Bebas+Neue'},
  {k:'oswald', g:'Display and handwriting', n:'Oswald', d:'bold and narrow', s:"Oswald, Impact, sans-serif", gf:'Oswald:wght@400;700'},
  {k:'impact', g:'Display and handwriting', n:'Impact', d:'poster', s:'Impact, sans-serif'},
  {k:'pacifico', g:'Display and handwriting', n:'Pacifico', d:'surf script', s:"Pacifico, cursive", gf:'Pacifico'},
  {k:'lobster', g:'Display and handwriting', n:'Lobster', d:'retro script', s:"Lobster, cursive", gf:'Lobster'},
  {k:'marker', g:'Display and handwriting', n:'Permanent Marker', d:'marker', s:"'Permanent Marker', cursive", gf:'Permanent+Marker'},
  {k:'comic', g:'Display and handwriting', n:'Comic Sans', d:'playful', s:"'Comic Sans MS', cursive"},
  {k:'spacemono', g:'Typewriter and code', n:'Space Mono', d:'techy', s:"'Space Mono', 'Courier New', monospace", gf:'Space+Mono:wght@400;700'},
  {k:'courier', g:'Typewriter and code', n:'Courier', d:'typewriter', s:"'Courier New', monospace"}];
var FONT_GROUPS = ['Serif', 'Sans serif', 'Display and handwriting', 'Typewriter and code'];
/* fonts the page uses that need loading from Google Fonts */
function googleFonts() {
  var keys = {}; if (theme.fontH) keys[theme.fontH] = 1; if (theme.fontP) keys[theme.fontP] = 1; if (PLANNER && !theme.fontP) keys.atkinson = 1;
  (words || []).forEach(function (w) { if (w.font && slotOf(w.id)) keys[w.font] = 1; });
  return FONTS.filter(function (f) { return f.gf && keys[f.k]; });
}
function googleHref(list) { return 'https://fonts.googleapis.com/css2?' + list.map(function (f) { return 'family=' + f.gf; }).join('&') + '&display=swap'; }
function defaultBodyStack() { return PLANNER ? fontOf('atkinson').s : '"Comic Neue", sans-serif'; }
function fontOf(k) { for (var i = 0; i < FONTS.length; i++) if (FONTS[i].k === k) return FONTS[i]; return FONTS[0]; }
function fontByStack(v) { for (var i = 1; i < FONTS.length; i++) if (FONTS[i].s === v) return FONTS[i].n; return v.split(',')[0].replace(/['"]/g, ''); }
/* swatches are real CSS color names, so the code shows names like crimson instead of codes */
var COLORS = [['#000000','black'],['#808080','gray'],['#FFFFFF','white'],['#F5F5DC','beige'],['#DC143C','crimson'],['#FF6347','tomato'],['#FF8C00','darkorange'],['#FFD700','gold'],['#228B22','forestgreen'],['#008080','teal'],['#4169E1','royalblue'],['#000080','navy'],['#ADD8E6','lightblue'],['#663399','rebeccapurple'],['#E6E6FA','lavender'],['#FF69B4','hotpink'],['#8B4513','saddlebrown'],['#2F4F4F','darkslategray']];
var cpHex = {};   /* hex codes with only digits that were chosen as HEX */
var CSS_NAMES = {"#F0F8FF": "aliceblue", "#FAEBD7": "antiquewhite", "#7FFFD4": "aquamarine", "#F0FFFF": "azure", "#F5F5DC": "beige", "#FFE4C4": "bisque", "#000000": "black", "#FFEBCD": "blanchedalmond", "#0000FF": "blue", "#8A2BE2": "blueviolet", "#A52A2A": "brown", "#DEB887": "burlywood", "#5F9EA0": "cadetblue", "#7FFF00": "chartreuse", "#D2691E": "chocolate", "#FF7F50": "coral", "#6495ED": "cornflowerblue", "#FFF8DC": "cornsilk", "#DC143C": "crimson", "#00FFFF": "cyan", "#00008B": "darkblue", "#008B8B": "darkcyan", "#B8860B": "darkgoldenrod", "#A9A9A9": "darkgray", "#006400": "darkgreen", "#BDB76B": "darkkhaki", "#8B008B": "darkmagenta", "#556B2F": "darkolivegreen", "#FF8C00": "darkorange", "#9932CC": "darkorchid", "#8B0000": "darkred", "#E9967A": "darksalmon", "#8FBC8F": "darkseagreen", "#483D8B": "darkslateblue", "#2F4F4F": "darkslategray", "#00CED1": "darkturquoise", "#9400D3": "darkviolet", "#FF1493": "deeppink", "#00BFFF": "deepskyblue", "#696969": "dimgray", "#1E90FF": "dodgerblue", "#B22222": "firebrick", "#FFFAF0": "floralwhite", "#228B22": "forestgreen", "#DCDCDC": "gainsboro", "#F8F8FF": "ghostwhite", "#FFD700": "gold", "#DAA520": "goldenrod", "#808080": "gray", "#008000": "green", "#ADFF2F": "greenyellow", "#F0FFF0": "honeydew", "#FF69B4": "hotpink", "#CD5C5C": "indianred", "#4B0082": "indigo", "#FFFFF0": "ivory", "#F0E68C": "khaki", "#E6E6FA": "lavender", "#FFF0F5": "lavenderblush", "#7CFC00": "lawngreen", "#FFFACD": "lemonchiffon", "#ADD8E6": "lightblue", "#F08080": "lightcoral", "#E0FFFF": "lightcyan", "#FAFAD2": "lightgoldenrodyellow", "#D3D3D3": "lightgray", "#90EE90": "lightgreen", "#FFB6C1": "lightpink", "#FFA07A": "lightsalmon", "#20B2AA": "lightseagreen", "#87CEFA": "lightskyblue", "#778899": "lightslategray", "#B0C4DE": "lightsteelblue", "#FFFFE0": "lightyellow", "#00FF00": "lime", "#32CD32": "limegreen", "#FAF0E6": "linen", "#FF00FF": "magenta", "#800000": "maroon", "#66CDAA": "mediumaquamarine", "#0000CD": "mediumblue", "#BA55D3": "mediumorchid", "#9370DB": "mediumpurple", "#3CB371": "mediumseagreen", "#7B68EE": "mediumslateblue", "#00FA9A": "mediumspringgreen", "#48D1CC": "mediumturquoise", "#C71585": "mediumvioletred", "#191970": "midnightblue", "#F5FFFA": "mintcream", "#FFE4E1": "mistyrose", "#FFE4B5": "moccasin", "#FFDEAD": "navajowhite", "#000080": "navy", "#FDF5E6": "oldlace", "#808000": "olive", "#6B8E23": "olivedrab", "#FFA500": "orange", "#FF4500": "orangered", "#DA70D6": "orchid", "#EEE8AA": "palegoldenrod", "#98FB98": "palegreen", "#AFEEEE": "paleturquoise", "#DB7093": "palevioletred", "#FFEFD5": "papayawhip", "#FFDAB9": "peachpuff", "#CD853F": "peru", "#FFC0CB": "pink", "#DDA0DD": "plum", "#B0E0E6": "powderblue", "#800080": "purple", "#663399": "rebeccapurple", "#FF0000": "red", "#BC8F8F": "rosybrown", "#4169E1": "royalblue", "#8B4513": "saddlebrown", "#FA8072": "salmon", "#F4A460": "sandybrown", "#2E8B57": "seagreen", "#FFF5EE": "seashell", "#A0522D": "sienna", "#C0C0C0": "silver", "#87CEEB": "skyblue", "#6A5ACD": "slateblue", "#708090": "slategray", "#FFFAFA": "snow", "#00FF7F": "springgreen", "#4682B4": "steelblue", "#D2B48C": "tan", "#008080": "teal", "#D8BFD8": "thistle", "#FF6347": "tomato", "#40E0D0": "turquoise", "#EE82EE": "violet", "#F5DEB3": "wheat", "#FFFFFF": "white", "#F5F5F5": "whitesmoke", "#FFFF00": "yellow", "#9ACD32": "yellowgreen"};
/* any color as a CSS color name: an exact match, or the closest named color */
function cssColor(c) {
  c = String(c || ''); if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/[a-f]/.test(c) || (c !== c.toUpperCase() && /^#[0-9a-f]{6}$/.test(c))) return c;   /* chosen as HEX in the picker: keep it */
  if (/^#[0-9]{6}$/.test(c) && cpHex[c]) return c;
  c = c.toUpperCase(); if (CSS_NAMES[c]) return CSS_NAMES[c];
  var r = parseInt(c.substr(1, 2), 16), g = parseInt(c.substr(3, 2), 16), b = parseInt(c.substr(5, 2), 16), best = 'black', bd = 1e9;
  Object.keys(CSS_NAMES).forEach(function (h) { var dr = parseInt(h.substr(1, 2), 16) - r, dg = parseInt(h.substr(3, 2), 16) - g, db = parseInt(h.substr(5, 2), 16) - b, d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = CSS_NAMES[h]; } });
  return best;
}
function colorName(hex) { return cssColor(hex); }
var theme = theme || {fontH:'', fontP:'', ink:'', bg:'', accent:''};
var bgs = bgs || {};   /* area -> {color, img, fit}; the whole page's color stays in theme.bg */
var UX_ON = true;
var ux = ux || {mode:'build', about:{}, checks:{}, flow:[]};
var BG_NAME = {page:'the page', header:'the title', section:'the feature', footer:'the end'};
function bgOf(key) { var b = bgs[key] || {}; return {color: key === 'page' ? theme.bg : (b.color || ''), img: b.img && piece(b.img) ? b.img : '', fit: b.fit || 'cover'}; }
function bgDecls(key, forExport) {
  var b = bgOf(key), d = [];
  if (b.color) d.push('background-color: ' + cssColor(b.color));
  if (b.img) {
    var p = piece(b.img);
    d.push('background-image: url("' + (forExport ? p.src : (p.file || p.id + '.jpg')) + '")');
    if (b.fit === 'repeat') { d.push('background-size: 160px'); d.push('background-repeat: repeat'); }
    else { d.push('background-size: ' + b.fit); d.push('background-repeat: no-repeat'); d.push('background-position: center'); }
  }
  return d;
}
function bgSteps(key) {
  var b = bgOf(key), l = [];
  if (b.color) l.push('Make the background ' + colorName(b.color));
  if (b.img) l.push('Put the picture ' + qt(piece(b.img).alt).replace(/\.\u201D$/, '\u201D') + ' behind it' + (b.fit === 'repeat' ? ', repeated like tiles' : b.fit === 'contain' ? ', fit inside' : ', covering the whole area'));
  return l;
}
/* the CSS a word carries by itself (not counting where it lines up) */
var SIZES = [['0.875', 'Small'], ['1', 'Normal'], ['1.25', 'Large'], ['1.5', 'Extra large'], ['2', 'Huge'], ['3', 'Giant']];
function sizeName(v) { v = String(v).replace(/rem$/, ''); for (var i = 0; i < SIZES.length; i++) if (SIZES[i][0] === v) return SIZES[i][1].toLowerCase(); return v + 'rem'; }
var LINES = [['1.1', 'Tight'], ['1.4', 'Normal'], ['1.8', 'Roomy'], ['2.2', 'Extra roomy']];
function lineName(v) { for (var i = 0; i < LINES.length; i++) if (LINES[i][0] === String(v)) return LINES[i][1].toLowerCase(); return String(v); }
var GAPS = [['0', 'None'], ['4', 'Small'], ['10', 'Medium'], ['18', 'Large'], ['28', 'Extra large']];
function gapName(v) { for (var i = 0; i < GAPS.length; i++) if (GAPS[i][0] === String(v)) return GAPS[i][1].toLowerCase(); return v + 'px'; }
function olStart(p) { return p.kind === 'ol' && +p.start > 1 ? +p.start : 1; }
function fillStarts(sel) { sel.innerHTML = ''; for (var k = 1; k <= 30; k++) { var o = el('option', '', 'Numbers start at ' + k); o.value = k; sel.appendChild(o); } }
function fillGaps(sel) { sel.innerHTML = ''; var d = el('option', '', 'Item spacing: automatic'); d.value = ''; sel.appendChild(d); GAPS.forEach(function (z) { var o = el('option', '', 'Item spacing: ' + z[1]); o.value = z[0]; sel.appendChild(o); }); }
function fillLines(sel) { sel.innerHTML = ''; var d = el('option', '', 'Line spacing: automatic'); d.value = ''; sel.appendChild(d); LINES.forEach(function (z) { var o = el('option', '', 'Line spacing: ' + z[1]); o.value = z[0]; sel.appendChild(o); }); }
function fillSizes(sel) { sel.innerHTML = ''; var d = el('option', '', 'Size: automatic'); d.value = ''; sel.appendChild(d); SIZES.forEach(function (z) { var o = el('option', '', z[1]); o.value = z[0]; sel.appendChild(o); }); }
function ownCss(p) { var d = []; if (p.color) d.push((p.kind === 'b' ? 'background: ' : 'color: ') + cssColor(p.color)); if (p.font) d.push('font-family: ' + fontOf(p.font).s); if (p.size) d.push('font-size: ' + p.size + 'rem'); if (p.lh) d.push('line-height: ' + p.lh); return d; }
function describeStyle(str) {
  if (!str) return ''; var parts = [];
  str.split(';').forEach(function (d) {
    var k = d.indexOf(':'); if (k < 0) return; var prop = d.slice(0, k).trim(), val = d.slice(k + 1).trim();
    if (prop === 'text-align') parts.push('lines it up ' + val);
    else if (prop === 'color') parts.push('makes the words ' + colorName(val));
    else if (prop === 'background') parts.push('makes it ' + colorName(val));
    else if (prop === 'font-size') parts.push('makes the letters ' + sizeName(val));
    else if (prop === 'line-height') parts.push('gives wrapped lines ' + lineName(val) + ' spacing');
    else if (prop === 'font-family') parts.push('uses the ' + fontByStack(val) + ' font');
  });
  if (!parts.length) return '';
  return ' The style ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
}
var KIND_NAME = {h:'Heading', s:'Subheading', p:'Sentence', b:'Button', a:'Link', ul:'Bullet list', ol:'Numbered list', nav:'Nav bar'};
var LIST_NAME = {ul:'bullet list', ol:'numbered list', nav:'nav bar'};
function isList(k) { return k === 'ul' || k === 'ol' || k === 'nav'; }
function navHref(t) { if (/^home$/i.test(t)) return 'index.html'; var x = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return (x || 'page') + '.html'; }
/* one item per line; a nav item can name its page after a comma: "About, about.html" */
function listItems(p) {
  return String(p.text || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
    var m = /^(.*?)\s*,\s*(https?:\/\/\S+|[^\s,]+\.[a-z]{2,5}|#\S*|\/\S*)$/i.exec(x);
    return m && m[1] ? {text: m[1], href: m[2]} : {text: x, href: navHref(x)};
  });
}
/* a video placeholder drawn like a real player: poster (or wireframe) + play button + control bar */
var VCTRL = '<svg viewBox="0 0 320 22" preserveAspectRatio="none" aria-hidden="true"><rect width="320" height="22" fill="rgba(0,0,0,.6)"/><path d="M9 5 L18 11 L9 17 Z" fill="#fff"/><rect x="28" y="9.5" width="190" height="3" rx="1.5" fill="rgba(255,255,255,.4)"/><rect x="28" y="9.5" width="38" height="3" rx="1.5" fill="#fff"/><circle cx="66" cy="11" r="4.5" fill="#fff"/><text x="226" y="15" font-family="Arial" font-size="9" fill="#fff">0:00 / 2:30</text><path d="M281 8 h4 l5 -4 v14 l-5 -4 h-4 Z" fill="#fff"/><path d="M300 6 h-4 v4 M314 6 h4 v4 M300 16 h-4 v-4 M314 16 h4 v-4" stroke="#fff" stroke-width="1.6" fill="none" transform="translate(-2 0)"/></svg>';
function videoFace(p) {
  var w = el('div', 'vid'), pic = p.poster && piece(p.poster);
  var i = el('img'); i.alt = ''; i.draggable = false; i.src = pic ? pic.src : p.src; if (pic) i.className = 'poster'; w.appendChild(i);
  var play = el('div', 'vplay'); play.innerHTML = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="28" fill="rgba(0,0,0,.55)"/><path d="M24 18 L42 30 L24 42 Z" fill="#fff"/></svg>'; w.appendChild(play);
  var bar = el('div', 'vbar'); bar.innerHTML = VCTRL; w.appendChild(bar);
  return w;
}
function makePiece(p) {
  var b = el('button', 'piece ' + p.type + (p.type === 'txt' ? ' ' + p.kind : '') + (selected === p.id ? ' selected' : ''));
  b.dataset.id = p.id;
  b.setAttribute('aria-label', p.alt + (selected === p.id ? ', picked up' : ''));
  if (p.type === 'img' && p.ph === 'video') b.appendChild(videoFace(p));
  else if (p.type === 'img') { var i = el('img'); i.src = p.src; i.alt = ''; i.draggable = false; b.appendChild(i); }
  else {
    b.textContent = p.text; if (p.align) b.style.textAlign = p.align; if (slotOf(p.id)) b.classList.add('on-page');
    if (p.kind === 'b') { b.style.marginLeft = p.align === 'center' || p.align === 'right' ? 'auto' : '0'; b.style.marginRight = p.align === 'center' ? 'auto' : '0'; }
    if (p.kind === 'a') b.title = 'Link to ' + (p.url || '(no address yet)');
    if (p.ph) b.classList.add('ph');
    if (p.size) b.style.setProperty('font-size', p.size + 'rem', 'important');
    if (p.lh) b.style.setProperty('line-height', p.lh, 'important');
    if (p.font) b.style.setProperty('font-family', fontOf(p.font).s, 'important');
    if (p.color) { if (p.kind === 'b') { b.style.setProperty('background', p.color, 'important'); b.style.setProperty('border-color', p.color, 'important'); } else b.style.setProperty('color', p.color, 'important'); }
    if (isList(p.kind)) {
      b.textContent = '';
      listItems(p).forEach(function (it, n) { var li = el('span', 'li', (p.kind === 'ul' ? '\u2022 ' : p.kind === 'ol' ? (n + olStart(p)) + '. ' : '') + it.text); if (p.color && p.kind === 'nav') li.style.color = p.color; if (p.gap !== undefined && p.gap !== '' && p.kind !== 'nav') li.style.marginBottom = p.gap + 'px'; b.appendChild(li); });
      if (!b.childNodes.length) b.appendChild(el('span', 'li', '(empty list)'));
      if (p.kind === 'nav') b.style.justifyContent = p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start';
    }
  }
  return b;
}
function placeFmt() {
  var bar = document.getElementById('fmtBar'); if (bar.hidden) return;
  var sel = document.querySelector('.cap .piece.selected, .slot:not(.cap) > .piece.txt.selected'); if (!sel) return;
  var box = sel.closest('.box.split') || sel.closest('.box') || sel, r = box.getBoundingClientRect(), wr = sel.getBoundingClientRect();
  var bw = bar.offsetWidth, bh = bar.offsetHeight, gap = 10, vw = document.documentElement.clientWidth, vh = window.innerHeight, left, top;
  if (r.right + gap + bw <= vw - 4) left = r.right + gap;            /* room on the right of the box */
  else if (r.left - gap - bw >= 4) left = r.left - gap - bw;         /* room on the left */
  else left = null;
  if (left !== null) top = Math.max(8, Math.min(wr.top - 6, vh - bh - 8));   /* beside it, level with the words, kept on screen */
  else { left = Math.min(Math.max(4, wr.left), vw - bw - 4); top = r.bottom + gap; }   /* no room beside it: just below the box */
  bar.style.left = (left + window.scrollX) + 'px'; bar.style.top = (top + window.scrollY) + 'px';
}
window.addEventListener('scroll', function () { placeFmt(); }, {passive: true});
function showFmt(q, p) {
  var bar = document.getElementById('fmtBar'), slot = document.getElementById('fmtSlot');
  var row = el('div', 'qrow'); q.querySelectorAll('[data-qalign]').forEach(function (b) { row.appendChild(b); }); q.insertBefore(row, q.firstChild);
  var qc = q.querySelector('.qcolor'); if (qc) qc.insertBefore(document.createTextNode('Color'), qc.firstChild);
  slot.innerHTML = ''; slot.appendChild(q);
  document.getElementById('fmtLabel').textContent = (KIND_NAME[p.kind] || 'Words') + ': ' + String(p.text).split('\n')[0];
  bar.hidden = false; placeFmt(); setTimeout(placeFmt, 0);
}
function hideFmt() { var bar = document.getElementById('fmtBar'); if (!bar.hidden) { bar.hidden = true; document.getElementById('fmtSlot').innerHTML = ''; } }
window.addEventListener('resize', placeFmt);
function makeSlot(id, cls) {
  var s = el('div', 'slot ' + (cls || '')); s.dataset.slot = id; s.tabIndex = 0; s.setAttribute('role', 'button');
  if (cls === 'art' && picFit[id] === 'cover') s.classList.add('fit-cover');
  if (cls === 'cap' && placed[id] && multi.indexOf(placed[id]) >= 0) s.classList.add('multi');
  var p = placed[id] && piece(placed[id]);
  if (p) {
    s.appendChild(makePiece(p)); s.setAttribute('aria-label', SLOTS[id].hint + ': ' + p.alt);
    if (p.type === 'img' && picFit[id] === 'cover' && picPos[id]) { var pim = s.querySelector('img'); if (pim) pim.style.objectPosition = picPos[id].x + '% ' + picPos[id].y + '%'; }
    if (cls === 'cap' && p.type === 'img') {
      s.classList.add('media'); s.style.setProperty('--mw', mw(id) + '%');
      if (selected === p.id && ux.mode === 'build' && !multiMode) {
        var mb = el('div', 'mbar'); mb.dataset.mbar = id; mb.setAttribute('role', 'group'); mb.setAttribute('aria-label', 'Width of the placeholder'); mb.appendChild(el('span', '', 'Width'));
        [[25, '1/4'], [33, '1/3'], [50, '1/2'], [67, '2/3'], [75, '3/4'], [100, 'Full']].forEach(function (x) { var b = el('button', '', x[1]); b.dataset.mw = x[0]; b.setAttribute('aria-pressed', mw(id) === x[0]); mb.appendChild(b); });
        if (p.ph === 'video') {
          var ps = el('select'); ps.dataset.poster = p.id; ps.setAttribute('aria-label', 'Poster picture: shows before the video plays'); ps.title = 'Poster: the picture that shows before the video plays';
          var po = el('option', '', 'Poster: none'); po.value = ''; ps.appendChild(po);
          allPieces().filter(function (x) { return x.type === 'img' && !x.ph; }).forEach(function (x) { var o = el('option', '', 'Poster: ' + x.alt); o.value = x.id; ps.appendChild(o); });
          ps.value = p.poster || ''; mb.appendChild(ps);
        }
        var mdup = el('button', '', '\u29C9 Duplicate'); mdup.dataset.dup = '1'; mdup.title = 'Make a copy (Ctrl+D)'; mb.appendChild(mdup);
        [['left', '\u21E4 Left'], ['center', 'Center'], ['right', 'Right \u21E5']].forEach(function (x) { var ab = el('button', '', x[1]); ab.dataset.malign = x[0]; ab.title = 'Line it up with the ' + x[0] + ' of the box'; mb.appendChild(ab); });
        var mrm = el('button', '', p.ph ? '\uD83D\uDDD1 Delete' : 'Remove'); mrm.dataset.rmPiece = p.id; mrm.title = p.ph ? 'Delete this placeholder' : 'Take it off the page (it goes back to your drawings)'; mb.appendChild(mrm);
        if (!p.ph) { var mfill = el('button', '', 'Fill the box'); mfill.dataset.mfill = id; mfill.title = 'Make the picture fill the whole box'; mb.appendChild(mfill); }
        var mdone = el('button', 'mdone', '\u2713 Done'); mdone.dataset.mdone = '1'; mb.appendChild(mdone);
        var mpos = capPos[id]; if (!mpos || mpos.y < 25) mb.classList.add('below');
        s.appendChild(mb);
      }
    }
    if (cls === 'art' && p.type === 'img' && ux.mode === 'build' && (picFocus === id || selected === p.id || panKey === id)) {
      var pb = el('div', 'pbar'); pb.dataset.pbar = id; pb.setAttribute('role', 'group'); pb.setAttribute('aria-label', 'Picture options');
      if (panKey === id) {
        s.classList.add('panning');
        var dn = el('button', 'pdone', '\u2713 Done moving'); dn.dataset.pact = 'done'; dn.title = 'Drag the picture to choose what shows, then tap here'; pb.appendChild(dn);
      } else {
        var cov = picFit[id] === 'cover';
        [['fit', 'Fit', !cov, 'Show the whole picture inside the box'], ['cover', 'Cover', cov, 'Fill the whole box with the picture']].forEach(function (x) { var b = el('button', '', x[1]); b.dataset.pact = x[0]; b.title = x[3]; b.setAttribute('aria-pressed', x[2]); pb.appendChild(b); });
        if (cov) { var mv = el('button', '', 'Move'); mv.dataset.pact = 'pan'; mv.title = 'Choose which part of the picture shows'; pb.appendChild(mv); }
        var prm = el('button', '', 'Remove'); prm.dataset.rmPiece = p.id; prm.title = 'Take it off the page (it goes back to your drawings)'; pb.appendChild(prm);
        var snp = el('button', '', 'Snap'); snp.dataset.pact = 'float'; snp.title = 'Make it a smaller piece you can snap to the grid'; pb.appendChild(snp);
        var bgb = el('button', '', 'Background'); bgb.dataset.pact = 'bg'; bgb.title = 'Make this picture the background of the box'; pb.appendChild(bgb);
      }
      s.appendChild(pb);
    }
    if (p.type === 'txt' && selected === p.id) {
      var q = el('div', 'qalign'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Line up the words');
      [['left','M1 2h16M1 7h10M1 12h13'],['center','M1 2h16M4 7h10M2.5 12h13'],['right','M1 2h16M7 7h10M4 12h13']].forEach(function (a) {
        var b = el('button'); b.dataset.qalign = a[0]; b.setAttribute('aria-label', 'Line up ' + a[0]); b.setAttribute('aria-pressed', (p.align || 'left') === a[0]);
        b.innerHTML = '<svg viewBox="0 0 18 14" aria-hidden="true"><path d="' + a[1] + '" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
        q.appendChild(b);
      });
      if (STYLE_ON) {
        var fs = el('select'); fs.dataset.qfont = '1'; fs.setAttribute('aria-label', 'Font for these words'); fs.title = 'Font';
        fillFonts(fs, 'Page font'); fs.value = p.font || ''; q.appendChild(fs);
        var zs = el('select'); zs.dataset.qsize = '1'; zs.setAttribute('aria-label', 'Size of these words'); zs.title = 'Size'; fillSizes(zs); zs.value = p.size || ''; q.appendChild(zs);
        var ls = el('select'); ls.dataset.qlines = '1'; ls.setAttribute('aria-label', 'Space between wrapped lines'); ls.title = 'Line spacing'; fillLines(ls); ls.value = p.lh || ''; q.appendChild(ls);
        if (p.kind === 'ol') { var ss = el('select'); ss.dataset.qstart = '1'; ss.setAttribute('aria-label', 'Numbers start at'); ss.title = 'Numbers start at'; fillStarts(ss); ss.value = olStart(p); q.appendChild(ss); }
        if (p.kind === 'ul' || p.kind === 'ol') { var gs = el('select'); gs.dataset.qgap = '1'; gs.setAttribute('aria-label', 'Space between list items'); gs.title = 'Space between items'; fillGaps(gs); gs.value = p.gap || ''; q.appendChild(gs); }
        var ci = el('button', 'qcolor'); ci.dataset.qcolorBtn = '1'; ci.setAttribute('aria-label', 'Color for these words'); ci.title = 'Color';
        var chip = el('span', 'cp-chip'); chip.style.background = p.color ? toHex(p.color) : (p.kind === 'b' ? '#4169e1' : '#1a1a1f'); ci.appendChild(chip); ci.appendChild(document.createTextNode('Color: ' + (p.color ? cssColor(p.color) : 'page color'))); q.appendChild(ci);
        if (p.kind === 'b' || p.kind === 'a') {
          var gw = el('select'); gw.dataset.qgo = '1'; gw.setAttribute('aria-label', 'When clicked, go to'); gw.title = 'When clicked, go to'; fillGo(gw, words.find(function (x) { return x.id === p.id; }) || p);
          gw.options[0].textContent = 'When clicked: nothing yet'; q.appendChild(gw);
          if (p.go && p.go !== '@url') { var tj = el('button', 'qreset', 'Try the jump'); tj.dataset.qtry = '1'; q.appendChild(tj); }
        }
        var dup = el('button', 'qreset', '\u29C9 Duplicate'); dup.dataset.dup = '1'; dup.title = 'Make a copy (Ctrl+D)'; q.appendChild(dup);
        if (p.font || p.color || p.size || p.lh || p.gap) { var rs2 = el('button', 'qreset', 'Reset'); rs2.dataset.qreset = '1'; rs2.title = 'Use the page font and color'; q.appendChild(rs2); }
      }
      showFmt(q, p);
    }
  }
  else { s.classList.add('empty'); s.appendChild(el('span', 'hint', SLOTS[id].hint)); s.setAttribute('aria-label', SLOTS[id].hint + ', empty'); }
  return s;
}
function chips(box, color, key, left) {
  [['start', openTag(key), realOpen(key, alsoShow)], ['stop', closeTag(key), realClose(key, alsoShow)]].forEach(function (c) {
    var ch = el('span', 'chip ' + c[0] + ' ' + color + (left ? ' left' : ''));
    if (hinting()) { ch.appendChild(el('span', 'w', c[1])); ch.appendChild(el('span', 'k', c[2])); ch.classList.add('two'); }
    else ch.textContent = c[1];
    box.appendChild(ch);
  });
}
function addCaps(box, base) {
  capIds(base).forEach(function (id, i) {
    if (i > 0 && !placed[id]) return;
    var cap = makeSlot(id, 'cap'), pos = capPos[id];
    if (pos && placed[id]) { cap.classList.add('placed'); cap.style.setProperty('--xf', pos.x / 100); cap.style.setProperty('--yf', pos.y / 100); }
    box.appendChild(cap);
  });
}
function cardBox(n, k) {
  var key = 'p' + n + 'c' + k, cb = el('div', 'box card'); cb.dataset.art = key; cb.dataset.key = key;
  var cart = makeSlot(key, 'art'); cb.appendChild(cart);
  var cpb = cart.querySelector('.pbar'); if (cpb) cb.appendChild(cpb);
  addCaps(cb, key); chips(cb, 'figure', key);
  cb.style.setProperty('--cw', cardW(key)); if (padOf(key) !== null) cb.style.setProperty('--pad', padOf(key) + 'px');
  if (padShow === key) cb.classList.add('show-pad');
  var rb = el('button', 'size-btn'); rb.dataset.cardSize = key; rb.title = 'Resize card';
  rb.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 10v4h-4M2 2l5 5M14 14l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  rb.setAttribute('aria-label', 'Resize card ' + k + ' of panel ' + n + '. Now ' + widthLabel(cardW(key)) + ' of the panel.');
  cb.appendChild(rb);
  return cb;
}
function artBox(imgId, capId, extraCls, tag, n) {
  var box = el('div', 'box ' + (extraCls || ''));
  box.dataset.key = n ? 'p' + n : 'section';
  var k = n ? cardsOf(n) : 0;
  if (k) {
    box.classList.add('split');
    var hd = makeSlot('p' + n + 'Head', 'group-head'); if (!placed['p' + n + 'Head']) hd.classList.add('empty'); box.appendChild(hd);
    var grid = el('div', 'cards'); grid.style.gridTemplateRows = rowTemplate(n);
    for (var q = 1; q <= k; q++) grid.appendChild(cardBox(n, q));
    box.appendChild(grid);
  } else {
    box.dataset.art = imgId;
    var art = makeSlot(imgId, 'art'); box.appendChild(art);
    var apb = art.querySelector('.pbar'); if (apb) box.appendChild(apb);
    addCaps(box, capBase(capId));
  }
  chips(box, tag, n ? 'p' + n : 'section');
  if (n) {
    var sz = sizes[n];
    if (padOf('p' + n) !== null) box.style.setProperty('--pad', padOf('p' + n) + 'px'); if (padShow === 'p' + n) box.classList.add('show-pad');
    box.style.setProperty('--c', sz.c); box.style.setProperty('--r', sz.r); box.style.setProperty('--cm', sz.c >= 7 ? 2 : 1);
    box.dataset.panel = n;
    var sb = el('button', 'size-btn'); sb.dataset.sizeOpen = n;
    sb.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 10v4h-4M2 2l5 5M14 14l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    sb.appendChild(el('span', '', 'Resize'));
    sb.setAttribute('aria-label', 'Resize panel ' + n + '. Now ' + widthLabel(sz.c) + ' wide and ' + hLabel(sz.r) + ' tall.');
    sb.title = 'Resize panel';
    box.appendChild(sb);
    var px = el('button', 'panel-x', '\u2715'); px.dataset.removePanel = n; px.title = 'Remove panel'; px.setAttribute('aria-label', 'Remove panel ' + n);
    box.appendChild(px);
  }
  return box;
}

function render() { delete placed.tagline; hidden = hidden.filter(function (h) { return CARDS.some(function (c) { return c.id === h; }); }); Object.keys(placed).forEach(function (k) { if (!piece(placed[k])) delete placed[k]; }); renderComic(); renderTrays(); renderCode(); save(); }
/* a placeholder never spills out of its box: if it is too tall, it gets narrower */
function fitMedia() {
  document.querySelectorAll('#comic .cap.media').forEach(function (cap) {
    var box = cap.closest('.box'); if (!box) return;
    var p = placed[cap.dataset.slot] && piece(placed[cap.dataset.slot]); if (!p) return;
    var pd = padPx(box), ratio = ratioOf(p);
    var top = cap.offsetTop - pd, avail = box.clientHeight - 2 * pd - Math.max(0, top) - 4;
    cap.style.maxWidth = Math.max(40, avail * ratio) + 'px';
  });
}
function renderComic() {
  var comic = document.getElementById('comic'); comic.innerHTML = ''; hideFmt();
  [['--theme-fh', theme.fontH && fontOf(theme.fontH).s], ['--theme-fp', theme.fontP && fontOf(theme.fontP).s], ['--theme-ink', theme.ink], ['--theme-bg', theme.bg], ['--theme-accent', theme.accent]].forEach(function (v) {
    if (v[1]) comic.style.setProperty(v[0], v[1]); else comic.style.removeProperty(v[0]);
  });
  comic.dataset.key = 'container';
  var head = el('div', 'box masthead'); head.dataset.key = 'header';
  head.appendChild(makeSlot('title', 'title-slot')); chips(head, 'header', 'header');
  comic.appendChild(head);
  comic.appendChild(artBox('cover', 'coverCap', 'cover', 'section'));
  var grid = el('div', 'panels'); grid.dataset.key = 'row';
  for (var n = 1; n <= panelCount; n++) grid.appendChild(artBox('p' + n, 'p' + n + 'Cap', '', 'figure', n));
  var ap = null;
  if (panelCount < MAX_PANELS) {
    ap = el('button', 'add-panel'); ap.id = 'addPanel';
    ap.appendChild(el('span', 'plus', '+')); ap.appendChild(el('span', '', 'Add a panel'));
  }
  comic.appendChild(grid);
  if (ap) { var apRow = el('div', 'add-panel-row'); apRow.appendChild(ap); comic.appendChild(apRow); }
  var foot = el('div', 'box footer-box'); foot.dataset.key = 'footer'; foot.appendChild(makeSlot('end')); chips(foot, 'footer', 'footer'); comic.appendChild(foot);
  chips(grid, 'wrap', 'row', true); chips(comic, 'wrap', 'container', true);
  ['header', 'section', 'footer'].forEach(function (k) {
    var bx = comic.querySelector('[data-key="' + k + '"]'); if (!bx) return;
    var rb = el('button', 'size-btn'); rb.dataset.areaSize = k; rb.title = 'Resize ' + AREA_NAME[k].toLowerCase();
    rb.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 10v4h-4M2 2l5 5M14 14l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    rb.appendChild(el('span', '', 'Resize')); rb.setAttribute('aria-label', 'Resize ' + AREA_NAME[k].toLowerCase()); bx.appendChild(rb);
    if (areaH[k]) { bx.style.height = areaH[k] + 'px'; bx.style.minHeight = '0'; }
    if (padOf(k) !== null) { bx.style.setProperty('--pad', padOf(k) + 'px'); if (k !== 'section') bx.style.padding = padOf(k) + 'px'; }
    if (padShow === k) bx.classList.add('show-pad');
  });
  var areas = ['page', 'header', 'section', 'footer']; for (var an = 1; an <= panelCount; an++) { areas.push('p' + an); for (var ac = 1; ac <= cardsOf(an); ac++) areas.push('p' + an + 'c' + ac); }
  areas.forEach(function (k) {
    var node = k === 'page' ? comic : comic.querySelector('[data-key="' + k + '"]'); if (!node) return;
    var b = bgOf(k), has = !!(b.color || b.img);
    if (k !== 'page' && b.color) node.style.backgroundColor = b.color;
    if (b.img) {
      node.style.backgroundImage = 'url("' + piece(b.img).src + '")';
      node.style.backgroundSize = b.fit === 'repeat' ? '160px' : b.fit; node.style.backgroundRepeat = b.fit === 'repeat' ? 'repeat' : 'no-repeat'; node.style.backgroundPosition = 'center';
    } else if (k === 'header' && b.color) node.style.backgroundImage = 'none';
    if (k !== 'page') node.classList.toggle('has-bg', has);
  });
  if (typeof drawFlow === 'function') { markFlowNodes(); drawFlow(); }
  fitMedia();
}
function renderTrays() {
  updateMaker();
  var td = document.getElementById('trayDraw'); td.innerHTML = '';
  var imgs = allPieces().filter(function (p) { return p.type === 'img' && !slotOf(p.id); });
  var add = el('label', 'add-tile'); add.htmlFor = 'file'; add.tabIndex = 0; add.id = 'addBtn';
  add.appendChild(el('span', 'plus', '+')); add.appendChild(el('span', '', 'Add a drawing'));
  td.appendChild(add);
  if (PLANNER) [['img', 'Image placeholder'], ['video', 'Video placeholder']].forEach(function (x) {
    var b = el('button', 'add-tile ph-tile'); b.dataset.newPh = x[0]; b.appendChild(el('span', 'plus', '+')); b.appendChild(el('span', '', x[1])); td.appendChild(b);
  });
  imgs.forEach(function (p) {
    var t = el('div', 'tile'); t.appendChild(makePiece(p));
    var x = el('button', 'img-del', '\u2715'); x.dataset.delImg = p.id; x.title = 'Delete drawing'; x.setAttribute('aria-label', 'Delete ' + p.alt);
    t.appendChild(x); td.appendChild(t);
  });
  if (!imgs.length && allPieces().some(function (p) { return p.type === 'img'; })) td.appendChild(el('p', 'tray-empty', 'All your drawings are on the page. Drag one back here to take it off.'));
  if (hidden.length) { var rb = el('button', 'restore', 'Bring back deleted drawings (' + hidden.length + ')'); rb.id = 'restoreImgs'; td.appendChild(rb); }

  var tw = document.getElementById('trayWords'); tw.innerHTML = '';
  words.forEach(function (w) {
    var p = piece(w.id), t = el('div', 'tile'); t.appendChild(makePiece(p));
    var x = el('button', 'img-del', '\u2715'); x.dataset.delWord = w.id; x.title = 'Delete'; x.setAttribute('aria-label', 'Delete ' + p.alt);
    t.appendChild(x); tw.appendChild(t);
  });
  if (!words.length) tw.appendChild(el('p', 'tray-empty', 'Write some words above, then drag them onto your comic.'));
}

function place(id, slotId) {
  var p = piece(id);
  if (!fits(p, slotId)) {
    var s = document.querySelector('[data-slot="' + slotId + '"]');
    if (s) { s.classList.add('nope'); setTimeout(function () { s.classList.remove('nope'); }, 600); }
    say(p.type === 'txt' ? 'Words go on a picture, the title, or the end.' : 'Drawings go in the picture boxes, the title, or the end.');
    return false;
  }
  var from = slotOf(id), there = placed[slotId];
  if (from === slotId) return true;
  if (from) { if (there && fits(piece(there), from)) placed[from] = there; else delete placed[from]; }
  placed[slotId] = id;
  if (from && from !== slotId && p.type === 'img') { if (picFit[from]) { picFit[slotId] = picFit[from]; delete picFit[from]; } if (picPos[from]) { picPos[slotId] = picPos[from]; delete picPos[from]; } }
  if (p.type === 'img' && SLOTS[slotId].accept === 'img') { picFocus = slotId; say(p.alt + ' placed. Picture options are on the picture.'); }
  else say(p.alt + ' placed.');
  return true;
}
function unplace(id) { var s = slotOf(id); if (s) { delete placed[s]; say(piece(id).alt + ' moved back.'); } }

/* ---------- code view ---------- */
function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function figAttr(n) {
  var sz = sizes[n], parts = [], a = function (t) { return ' <span class="a">' + esc(t) + '</span>'; };
  var rows = sz.r !== 6 ? 'grid-row: span ' + sz.r + ';' : '';
  if (notation === 'col') return a('class="col-' + sz.c + '"') + (rows ? a('style="' + rows + '"') : '');
  var w = notation === 'pct' ? 'width: ' + PCT[sz.c] + ';' : 'grid-column: span ' + sz.c + ';';
  return a('style="' + w + (rows ? ' ' + rows : '') + '"');
}
function cardAttr(key, forDiv) {
  var c = cardW(key), r = cardR(key), a = function (t) { return ' <span class="a">' + esc(t) + '</span>'; };
  var rows = '';
  if (notation === 'col') return (forDiv ? '' : a('class="col-' + c + '"')) + (rows ? a('style="' + rows + '"') : '');
  return a('style="' + (notation === 'pct' ? 'width: ' + PCT[c] + ';' : 'grid-column: span ' + c + ';') + (rows ? ' ' + rows : '') + '"');
}
/* all the word pieces in one box, in order; an empty box shows one reminder */
/* left/top for a word piece; with padding, calc() adds the padding so the words stay inside it */
function posDecls(base, cp) {
  var pd = padOf(base) || 0;
  if (!cp) return pd ? ['left: ' + (pd + 8) + 'px', 'top: ' + (pd + 8) + 'px'] : ['left: 8px', 'top: 8px'];
  if (!pd) return ['left: ' + cp.x + '%', 'top: ' + cp.y + '%'];
  var px = function (f) { var v = Math.round(pd * (1 - 2 * f / 100)); return v >= 0 ? ' + ' + v + 'px' : ' - ' + (-v) + 'px'; };
  return ['left: calc(' + cp.x + '%' + px(cp.x) + ')', 'top: calc(' + cp.y + '%' + px(cp.y) + ')'];
}
/* the id a part of the page gets when a button or link jumps to it */
function anchorId(key) {
  if (!key) return '';
  if (key.indexOf('w:') === 0) { var p = piece(key.slice(2)); var t = p ? String(p.text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''; return t || 'words'; }
  var m = /^p(\d+)c(\d)$/.exec(key); if (m) return 'panel-' + m[1] + '-card-' + m[2];
  return {header:'title', section:'feature', footer:'the-end'}[key] || ('panel-' + key.slice(1));
}
function jumpTargets() { var t = {}; Object.keys(placed).forEach(function (k) { var p = piece(placed[k]); if (p && p.type === 'txt' && (p.kind === 'b' || p.kind === 'a') && p.go && p.go !== '@url') t[p.go] = 1; }); return t; }
function idAttr(key) { return jumpTargets()[key] ? ' <span class="a">id="' + esc(anchorId(key)) + '"</span>' : ''; }
function goHref(p) { return p.go && p.go !== '@url' ? '#' + anchorId(p.go) : (p.url || '#'); }
function wlabel(p) { if (p.type === 'img') return 'the ' + (p.ph === 'video' ? 'video' : 'image') + ' placeholder'; if (isList(p.kind)) return 'the ' + LIST_NAME[p.kind]; return '\u201C' + String(p.text).split('\n')[0] + '\u201D'; }
function capsCode(base, i, h, item) { var u = capsUsed(base); return u.length ? u.map(function (id) { return item(id, i, h); }).join('') : item(base + 'Cap', i, h); }
function buildHTML() {
  var T = function (s) { return '<span class="t">' + esc(s) + '</span>'; };
  var L = function (i, s) { return '  '.repeat(i) + s + '\n'; };
  var C = function (i, s) { return L(i, '<span class="c">&lt;!-- ' + esc(s) + ' --&gt;</span>'); };
  /* K marks every line of a block with the part of the comic it belongs to (inner parts win) */
  var K = function (key, str) { return str.split('\n').map(function (ln) { return ln && ln.charAt(0) !== '\u0001' ? '\u0001' + key + '\u0002' + ln : ln; }).join('\n'); };
  var item = function (slotId, i, h) {
    var p = placed[slotId] && piece(placed[slotId]);
    if (!p) return C(i, SLOTS[slotId].hint.toLowerCase() + ' goes here');
    if (p.type === 'img' && p.ph === 'video') { var pp = p.poster && piece(p.poster); return L(i, T('<video') + ' <span class="a">src="video.mp4"' + (pp ? ' poster="' + esc(pp.file || pp.id + '.jpg') + '"' : '') + ' controls</span>' + T('>') + T('</video>')); }
    if (p.type === 'img') return L(i, T('<img') + ' <span class="a">src="' + esc(p.file || p.id + '.jpg') + '"</span>' + (picFit[slotId] === 'cover' ? ' <span class="a">style="object-fit: cover' + (picPos[slotId] ? '; object-position: ' + picPos[slotId].x + '% ' + picPos[slotId].y + '%' : '') + '"</span>' : '') + T('>'));
    var SA = function (d) { return d.length ? ' <span class="a">style="' + esc(d.join('; ')) + '"</span>' : ''; };
    var alignD = p.align ? ['text-align: ' + p.align] : [], own = ownCss(p);
    var st = SA(alignD.concat(own));
    if (isList(p.kind)) {
      var its = listItems(p), lt = p.kind === 'ol' ? 'ol' : 'ul', out = '';
      if (p.kind === 'nav') {
        out += L(i, T('<nav') + SA(alignD) + T('>')) + L(i + 1, T('<ul>'));
        its.forEach(function (it) { out += L(i + 2, T('<li>') + T('<a') + ' <span class="a">href="' + esc(it.href) + '"</span>' + SA(own) + T('>') + '<span class="x">' + esc(it.text) + '</span>' + T('</a>') + T('</li>')); });
        return out + L(i + 1, T('</ul>')) + L(i, T('</nav>'));
      }
      out += L(i, T('<' + lt) + (olStart(p) > 1 ? ' <span class="a">start="' + olStart(p) + '"</span>' : '') + st + T('>'));
      var liOpen = (p.gap !== undefined && p.gap !== '') ? T('<li') + ' <span class="a">style="margin-bottom: ' + p.gap + 'px"</span>' + T('>') : T('<li>');
      its.forEach(function (it) { out += L(i + 1, liOpen + '<span class="x">' + esc(it.text) + '</span>' + T('</li>')); });
      return out + L(i, T('</' + lt + '>'));
    }
    if (p.kind === 'b' || p.kind === 'a') {
      var onclk = p.go ? ' <span class="a">onclick="location.href=\'' + esc(goHref(p)) + '\'"</span>' : '';
      var inner = p.kind === 'b' ? T('<button') + onclk + SA(own) + T('>') + '<span class="x">' + esc(p.text) + '</span>' + T('</button>')
        : T('<a') + ' <span class="a">href="' + esc(goHref(p)) + '"</span>' + SA(own) + T('>') + '<span class="x">' + esc(p.text) + '</span>' + T('</a>');
      return L(i, p.align ? T('<p') + SA(alignD) + T('>') + inner + T('</p>') : inner);
    }
    var tag = p.kind === 'h' ? h : p.kind === 's' ? 'h3' : 'p';
    return L(i, T('<' + tag) + (p.kind === 'h' || p.kind === 's' ? idAttr('w:' + p.id) : '') + st + T('>') + '<span class="x">' + esc(p.text) + '</span>' + T('</' + tag + '>'));
  };
  var codeEl = document.getElementById('code'); codeEl.classList.toggle('pseudo', codeStyle === 'pseudo');
  document.getElementById('app').classList.toggle('pseudo-mode', codeStyle === 'pseudo');
  if (codeStyle === 'pseudo') {
    L = function (i, t) { return '\u2003\u2003'.repeat(i) + t + '\n'; };
    var S = function (t) { return '<span class="s">' + esc(t) + '</span>'; };
    var E = function (t) { return '<span class="e">' + esc(t) + '</span>'; };
    var X = function (t) { return '<span class="x">' + esc(t) + '</span>'; };
    var H = function (t) { return hinting() ? '<span class="h">' + esc(t) + '</span>' : ''; };
    var wordTag = function (slotId, kind) {
      if (kind === 's') return 'h3';
      if (kind !== 'h') return 'p';
      if (slotId === 'title') return 'h1';
      if (/^p\d+Cap$/.test(slotId) && alsoShow === 'div') return 'p';
      return 'h2';
    };
    var AL = {center:'centered', right:'lined up right'};
    var put = function (slotId, i, big) {
      var p = placed[slotId] && piece(placed[slotId]); if (!p) return '';
      if (p.type === 'img' && p.ph === 'video') return L(i, S('Start video: ') + X('placeholder' + (p.poster && piece(p.poster) ? ', with the poster ' + piece(p.poster).alt : '')) + H('<video src="video.mp4" controls>')) + L(i, E('Stop video') + H('</video>'));
      if (p.type === 'img') return L(i, S('Start picture' + (picFit[slotId] === 'cover' ? ' (covers the whole box)' : '') + ': ') + X(p.alt) + H('<img src="' + (p.file || p.id + '.jpg') + '">')) + L(i, E('Stop picture') + H('(no stop tag)'));
      var hw = []; if (p.align && AL[p.align]) hw.push(AL[p.align]); if (p.color) hw.push(colorName(p.color)); if (p.size) hw.push(sizeName(p.size)); if (p.lh) hw.push(lineName(p.lh) + ' line spacing'); if (p.gap) hw.push(gapName(p.gap) + ' space between items'); if (olStart(p) > 1) hw.push('numbers start at ' + olStart(p)); if (p.font) hw.push(fontOf(p.font).n + ' font');
      var how = hw.length ? ' (' + hw.join(', ') + ')' : '';
      if (isList(p.kind)) {
        var nm = LIST_NAME[p.kind], lo = p.kind === 'nav' ? '<nav> <ul>' : '<' + (p.kind === 'ol' ? 'ol' : 'ul') + '>', lc = p.kind === 'nav' ? '</ul> </nav>' : '</' + (p.kind === 'ol' ? 'ol' : 'ul') + '>';
        var body = listItems(p).map(function (it, n) {
          return p.kind === 'nav' ? L(i + 1, S('Link: ') + X(it.text) + ' <span class="c">' + esc('(goes to ' + it.href + ')') + '</span>' + H('<li><a href="' + it.href + '">' + it.text + '</a></li>'))
            : L(i + 1, S('Item' + (p.kind === 'ol' ? ' ' + (n + olStart(p)) : '') + ': ') + X(it.text) + H('<li' + (p.gap ? ' style="margin-bottom: ' + p.gap + 'px"' : '') + '>' + it.text + '</li>'));
        }).join('');
        return L(i, S('Start ' + nm + how) + H(lo)) + body + L(i, E('Stop ' + nm) + H(lc));
      }
      if (p.kind === 'b') return L(i, S('Start button' + how + ': ') + X(p.text) + (p.go ? ' <span class="c">' + esc('(when clicked, go to ' + (p.go === '@url' ? (p.url || 'another page') : nodeName(p.go)) + ')') + '</span>' : '') + H('<button>')) + L(i, E('Stop button') + H('</button>'));
      if (p.kind === 'a') return L(i, S('Start link' + how + ': ') + X(p.text) + ' <span class="c">' + esc('(goes to ' + (p.go && p.go !== '@url' ? nodeName(p.go) + ' on this page' : p.url || 'nowhere yet') + ')') + '</span>' + H('<a href="' + (p.url || '#') + '">')) + L(i, E('Stop link') + H('</a>'));
      var what = p.kind === 'h' ? (big ? 'big title' : 'heading') : p.kind === 's' ? 'subheading' : 'paragraph';
      var wt = wordTag(slotId, p.kind), stl = p.align ? ' style="text-align: ' + p.align + '"' : '';
      return L(i, S('Start ' + what + how + ': ') + X(p.text) + H('<' + wt + stl + '>')) + L(i, E('Stop ' + what) + H('</' + wt + '>'));
    };
    var group = function (key, i, inner, note) {
      return K(key, L(i, S('Start ' + pName(key)) + (note ? ' <span class="c">' + esc(note) + '</span>' : '') + H(realOpen(key, alsoShow))) + (inner || L(i + 1, '<span class="c">(nothing here yet)</span>')) + L(i, E('Stop ' + pName(key)) + H(realClose(key, alsoShow))));
    };
    var FR = {3:'1/4', 4:'1/3', 6:'1/2', 8:'2/3', 9:'3/4', 12:'full'};
    var ps = '';
    for (var q = 1; q <= panelCount; q++) {
      var z = sizes[q];
      var nk = cardsOf(q);
      if (nk) {
        var inner = put('p' + q + 'Head', 3);
        for (var cq = 1; cq <= nk; cq++) inner += group('p' + q + 'c' + cq, 3, put('p' + q + 'c' + cq, 4) + capsUsed('p' + q + 'c' + cq).map(function (id) { return put(id, 4); }).join(''), '(' + (cardW('p' + q + 'c' + cq) === 12 ? 'full width' : (FR[cardW('p' + q + 'c' + cq)] || '') + ' wide') + '' + ')');
        ps += group('p' + q, 2, inner, '(' + (FR[z.c] || z.c + '/12') + ' wide, ' + hLabel(z.r) + ' tall, ' + nk + ' cards inside)');
      } else ps += group('p' + q, 2, put('p' + q, 3) + capsUsed('p' + q).map(function (id) { return put(id, 3); }).join(''), '(' + (FR[z.c] || z.c + '/12') + ' wide, ' + hLabel(z.r) + ' tall)');
    }
    setHTML(group('container', 0,
      group('header', 1, put('title', 2, true)) +
      group('section', 1, put('cover', 2) + capsUsed('cover').map(function (id) { return put(id, 2); }).join('')) +
      group('row', 1, ps) +
      group('footer', 1, put('end', 2))));
    return;
  }
  if (codeStyle === 'div') {
    var D = function (k, extra) { return T('<div') + ' <span class="a">class="' + esc(cls(k) + (extra || '')) + '"</span>'; };
    var panels = '';
    for (var m = 1; m <= panelCount; m++) {
      var sz = sizes[m], rows = sz.r !== 6 ? 'grid-row: span ' + sz.r + ';' : '', head;
      if (notation === 'col') head = D('p' + m, ' col-' + sz.c) + (rows ? ' <span class="a">style="' + rows + '"</span>' : '');
      else head = D('p' + m) + ' <span class="a">style="' + (notation === 'pct' ? 'width: ' + PCT[sz.c] + ';' : 'grid-column: span ' + sz.c + ';') + (rows ? ' ' + rows : '') + '"</span>';
      var mk = cardsOf(m), body = '';
      if (mk) { body = item('p' + m + 'Head', 4, 'h2'); for (var cm = 1; cm <= mk; cm++) body += K('p' + m + 'c' + cm, L(4, D('card', notation === 'col' ? ' col-' + cardW('p' + m + 'c' + cm) : '') + idAttr('p' + m + 'c' + cm) + cardAttr('p' + m + 'c' + cm, true) + T('>')) + item('p' + m + 'c' + cm, 5) + capsCode('p' + m + 'c' + cm, 5, 'h2', item) + L(4, T('</div>'))); }
      else body = item('p' + m, 4) + capsCode('p' + m, 4, 'h2', item);
      panels += K('p' + m, L(3, head + idAttr('p' + m) + T('>')) + body + L(3, T('</div>')));
    }
    setHTML(L(0, T('\x3Cbody>')) + K('container',
      L(1, D('container') + T('>')) +
      K('header', L(2, D('header') + idAttr('header') + T('>')) + item('title', 3, 'h1') + L(2, T('</div>'))) +
      K('section', L(2, D('section') + idAttr('section') + T('>')) + item('cover', 3) + capsCode('cover', 3, 'h2', item) + L(2, T('</div>'))) +
      K('row', L(2, D('row') + T('>')) + panels + L(2, T('</div>'))) +
      K('footer', L(2, D('footer') + idAttr('footer') + T('>')) + item('end', 3, 'h2') + L(2, T('</div>'))) +
      L(1, T('</div>'))) + L(0, T('\x3C/body>')));
    return;
  }
  var figs = '';
  for (var n = 1; n <= panelCount; n++) {
    var fk = cardsOf(n);
    if (fk) {
      var arts = item('p' + n + 'Head', 3, 'h2');
      for (var cf = 1; cf <= fk; cf++) arts += K('p' + n + 'c' + cf, L(3, T('<article') + idAttr('p' + n + 'c' + cf) + cardAttr('p' + n + 'c' + cf) + T('>')) + item('p' + n + 'c' + cf, 4) + capsCode('p' + n + 'c' + cf, 4, 'h2', item) + L(3, T('</article>')));
      figs += K('p' + n, L(2, T('<section') + ' <span class="a">class="cards"</span>' + idAttr('p' + n) + figAttr(n) + T('>')) + arts + L(2, T('</section>')));
    } else
    figs += K('p' + n, L(2, T('<figure') + idAttr('p' + n) + figAttr(n) + T('>')) + item('p' + n, 3) + L(3, T('<figcaption>')) + capsCode('p' + n, 4, 'h2', item) + L(3, T('</figcaption>')) + L(2, T('</figure>')));
  }
  setHTML(K('container',
    L(0, T('\x3Cbody>')) +
    K('header', L(1, T('\x3Cheader') + idAttr('header') + T('>')) + item('title', 2, 'h1') + L(1, T('\x3C/header>'))) +
    K('section', L(1, T('<section') + idAttr('section') + T('>')) + item('cover', 2) + capsCode('cover', 2, 'h2', item) + L(1, T('</section>'))) +
    K('row', L(1, T('<main>')) + figs + L(1, T('</main>'))) +
    K('footer', L(1, T('<footer') + idAttr('footer') + T('>')) + item('end', 2, 'h2') + L(1, T('</footer>'))) +
    L(0, T('\x3C/body>'))));
}
var codeSrc = {html:'', css:''}, activeFile = 'html';
try { activeFile = localStorage.getItem(KEY + '-file') === 'css' ? 'css' : 'html'; } catch (e) {}
function renderCode() { buildHTML(); codeSrc.css = buildCSS(); paintCode(); }
function paintCode() {
  document.querySelectorAll('.ide-tab').forEach(function (t) { t.setAttribute('aria-selected', t.dataset.file === activeFile); });
  var pseudo = codeStyle === 'pseudo';
  document.getElementById('tabHtml').textContent = pseudo ? 'page steps' : 'index.html';
  document.getElementById('tabCss').textContent = pseudo ? 'style steps' : 'style.css';
  finishCode(activeFile === 'css' ? codeSrc.css : codeSrc.html);
}
/* wraps the body in a real page: doctype, html, and a head with a title and the style.css link */
function setHTML(str) {
  if (codeStyle === 'pseudo') { codeSrc.html = str; return; }
  var T = function (x) { return '<span class="t">' + esc(x) + '</span>'; };
  var A = function (x) { return '<span class="a">' + esc(x) + '</span>'; };
  var head = '\u0001head\u0002' + T('\x3C!DOCTYPE html>') + '\n'
    + '\u0001container\u0002' + T('\x3Chtml') + ' ' + A('lang="en"') + T('>') + '\n'
    + '\u0001head\u0002  ' + T('\x3Chead>') + '\n'
    + '\u0001head\u0002    ' + T('<title>') + '<span class="x">' + esc(titleText()) + '</span>' + T('</title>') + '\n'
    + (googleFonts().length ? ('\u0001head\u0002    ' + T('<link') + ' ' + A('rel="stylesheet" href="' + googleHref(googleFonts()) + '"') + T('>') + '\n') : '')
    + '\u0001head\u0002    ' + T('<link') + ' ' + A('rel="stylesheet" href="style.css"') + T('>') + '\n'
    + '\u0001head\u0002  ' + T('\x3C/head>') + '\n';
  var body = str.split('\n').map(function (ln) {
    if (!ln) return ln; var m = /^\u0001[^\u0002]+\u0002/.exec(ln);
    return m ? m[0] + '  ' + ln.slice(m[0].length) : '  ' + ln;
  }).join('\n');
  codeSrc.html = head + body + '\u0001container\u0002' + T('\x3C/html>') + '\n';
}
/* tag-name selectors have to count figures and card groups separately */
function tagSel(n) {
  var split = !!cardsOf(n), idx = 0;
  for (var q = 1; q <= n; q++) if (!!cardsOf(q) === split) idx++;
  return split ? 'section.cards:nth-of-type(' + idx + ')' : 'figure:nth-of-type(' + idx + ')';
}
function cssSel(k) {
  if (codeStyle === 'div') return k === 'container' ? '.' + cls('container') : '.' + cls(k);
  return {container:'body', header:'header', section:'section', row:'main', footer:'footer'}[k];
}
function buildCSS() {
  var K = function (key, str) { return str.split('\n').map(function (ln) { return ln && ln.charAt(0) !== '\u0001' ? '\u0001' + key + '\u0002' + ln : ln; }).join('\n'); };
  if (codeStyle === 'pseudo') {
    var S = function (t) { return '<span class="s">' + esc(t) + '</span>'; }, E = function (t) { return '<span class="e">' + esc(t) + '</span>'; };
    var I = function (t) { return '\u2003\u2003<span class="x">' + esc(t) + '</span>\n'; };
    var HS = function (key) {
      if (!hinting()) return '';
      var sel = isCardKey(key) ? (alsoShow === 'div' ? '.' + cls('card') : 'article') : alsoShow === 'div' ? '.' + cls(key) : /^p\d+$/.test(key) ? (cardsOf(+key.slice(1)) ? 'section.cards' : 'figure') : {container:'body', header:'header', section:'section', row:'main', footer:'footer'}[key];
      return '<span class="h">' + esc(sel + ' {') + '</span>';
    };
    var HE = hinting() ? '<span class="h">}</span>' : '';
    var st = function (key, name, lines) { return K(key, S('Start style for ' + name) + HS(key) + '\n' + lines.map(I).join('') + E('Stop style for ' + name) + HE + '\n'); };
    var FRW = {3:'1/4', 4:'1/3', 6:'1/2', 8:'2/3', 9:'3/4', 12:'full'};
    var pageLines = [theme.fontP ? 'Use the ' + fontOf(theme.fontP).n + ' font' : (PLANNER ? 'Use the Atkinson Hyperlegible font' : 'Use a comic-style font'), 'Keep the page from getting too wide'];
    if (theme.ink) pageLines.push('Make the words ' + colorName(theme.ink)); pageLines = pageLines.concat(bgSteps('page'));
    var out = st('container', 'the page', pageLines)
      + (theme.fontH ? K('header', S('Start style for headings') + (hinting() ? '<span class="h">h1, h2, h3 {</span>' : '') + '\n' + I('Use the ' + fontOf(theme.fontH).n + ' font') + E('Stop style for headings') + HE + '\n') : '')
      + st('header', 'the title', ['Draw a thick black border', 'Center everything'].concat(areaH.header ? ['Make it ' + areaH.header + ' pixels tall'] : [], padOf('header') !== null ? ['Add ' + padOf('header') + ' pixels of padding inside the edge'] : [], bgSteps('header')))
      + st('section', 'the feature', ['Make it ' + (areaH.section || 380) + ' pixels tall', 'Draw a thick black border'].concat(padOf('section') !== null ? ['Add ' + padOf('section') + ' pixels of padding inside the edge'] : [], bgSteps('section')))
      + st('row', 'the panels', ['Line them up on a grid 12 columns wide', 'Make each small row 35 pixels tall']);
    for (var n = 1; n <= panelCount; n++) {
      var z = sizes[n], lines = ['Make it ' + (FRW[z.c] || z.c + '/12') + ' wide and ' + hLabel(z.r) + ' tall', 'Draw a thick black border'];
      capsUsed('p' + n).forEach(function (id) { var pos = capPos[id], tx = ''; lines.push(pos ? 'Put ' + wlabel(piece(placed[id])) + ' ' + pos.x + '% from the left and ' + pos.y + '% from the top' : 'Put ' + wlabel(piece(placed[id])) + ' in the top-left corner'); });
      var sk = cardsOf(n);
      if (sk) {
        lines = [lines[0], 'Put ' + sk + ' cards inside it on a grid 12 columns wide', 'Draw a thick black border'];
        if (!sameShares(n)) cardLayout(n).forEach(function (r, ri) { lines.push('Make row ' + (ri + 1) + ' of cards ' + SHARE_NAME[rowShare(r)].toLowerCase()); });
      }
      if (padOf('p' + n) !== null) lines.push('Add ' + padOf('p' + n) + ' pixels of padding inside the edge');
      out += st('p' + n, 'panel ' + n, lines.concat(bgSteps('p' + n)));
      for (var sc = 1; sc <= sk; sc++) {
        var skey = 'p' + n + 'c' + sc, sl = [cardW(skey) === 12 ? 'Make it as wide as the panel' : 'Make it ' + (FRW[cardW(skey)] || '') + ' as wide as the panel', 'Draw a thin black border'], sp = capPos[skey + 'Cap'];
        capsUsed(skey).forEach(function (id) { var sp2 = capPos[id], tx2 = ''; sl.push(sp2 ? 'Put ' + wlabel(piece(placed[id])) + ' ' + sp2.x + '% from the left and ' + sp2.y + '% from the top' : 'Put ' + wlabel(piece(placed[id])) + ' in the top-left corner'); });
        if (padOf(skey) !== null) sl.push('Add ' + padOf(skey) + ' pixels of padding inside the edge');
        out += st(skey, 'card ' + sc + ' in panel ' + n, sl.concat(bgSteps(skey)));
      }
    }
    var uk = {}; Object.keys(placed).forEach(function (k) { var pp = piece(placed[k]); if (pp && pp.type === 'txt') uk[pp.kind] = 1; });
    if (uk.b) out += K('container', S('Start style for buttons') + (hinting() ? '<span class="h">button {</span>' : '') + '\n' + ['Make them ' + colorNamecssColor(theme.accent || '#4169E1') + ' with white words', 'Round the corners', 'Make the words bold'].map(I).join('') + E('Stop style for buttons') + HE + '\n');
    if (uk.nav) out += K('container', S('Start style for the nav bar') + (hinting() ? '<span class="h">nav ul {</span>' : '') + '\n' + ['Hide the bullets', 'Line the links up in a row', 'Put space between the links'].map(I).join('') + E('Stop style for the nav bar') + HE + '\n');
    if (uk.a) out += K('container', S('Start style for links') + (hinting() ? '<span class="h">a {</span>' : '') + '\n' + ['Make them ' + colorNamecssColor(theme.accent || '#4169E1'), 'Make the words bold'].map(I).join('') + E('Stop style for links') + HE + '\n');
    out += st('footer', 'the end', (bgOf('footer').color ? [] : ['Make the background black']).concat(areaH.footer ? ['Make it ' + areaH.footer + ' pixels tall'] : [], padOf('footer') !== null ? ['Add ' + padOf('footer') + ' pixels of padding inside the edge'] : [], bgSteps('footer'), ['Make the words white', 'Center everything']));
    return out;
  }
  var rule = function (key, selector, props, note) {
    var r = (note ? '<span class="c">/* ' + esc(note) + ' */</span>\n' : '') + '<span class="t">' + esc(selector) + '</span> {\n';
    props.forEach(function (p) { var k = p.indexOf(':'); r += '  <span class="p">' + esc(p.slice(0, k)) + '</span>: <span class="x">' + esc(p.slice(k + 1).trim()) + '</span>;\n'; });
    return K(key, r + '}\n') + '\n';
  };
  var div = codeStyle === 'div', css = '';
  var bodyFont = 'font-family: ' + (theme.fontP ? fontOf(theme.fontP).s : defaultBodyStack());
  var bodyColors = (theme.ink ? ['color: ' + cssColor(theme.ink)] : []).concat(bgDecls('page'));
  css += rule('container', 'body', (div ? ['margin: 0', bodyFont] : ['max-width: 1000px', 'margin: 0 auto', 'padding: 16px', bodyFont]).concat(bodyColors), 'The whole page');
  if (theme.fontH) css += rule('header', 'h1, h2, h3', ['font-family: ' + fontOf(theme.fontH).s], 'Headings');
  if (div) css += rule('container', cssSel('container'), ['max-width: 1000px', 'margin: 0 auto', 'padding: 16px']);
  css += rule('header', cssSel('header'), ['border: 4px solid black', 'padding: ' + (padOf('header') !== null ? padOf('header') : 16) + 'px', 'text-align: center'].concat(areaH.header ? ['height: ' + areaH.header + 'px'] : []).concat(bgDecls('header')), 'The title');
  css += rule('section', cssSel('section'), ['position: relative', 'height: ' + (areaH.section || 380) + 'px', 'border: 4px solid black'].concat(padOf('section') !== null ? ['padding: ' + padOf('section') + 'px'] : []).concat(bgDecls('section')), 'The feature');
  css += rule('row', cssSel('row'), ['display: grid', 'grid-template-columns: repeat(12, 1fr)', 'grid-auto-rows: 35px', 'column-gap: 14px'], 'The panels line up on a grid');
  var panelSel = div ? (function () { var a = []; for (var n = 1; n <= panelCount; n++) a.push('.' + cls('p' + n)); return a.join(',\n'); })() : 'figure';
  css += rule('row', panelSel, ['position: relative', 'margin: 0 0 14px', 'border: 4px solid black'], 'Every panel');
  css += rule('row', 'img', ['width: 100%', 'height: 100%', 'object-fit: contain'], 'Pictures fit inside their box');
  if (div && notation === 'col') {
    var used = {}; for (var c = 1; c <= panelCount; c++) { used[sizes[c].c] = 1; for (var uc = 1; uc <= cardsOf(c); uc++) used[cardW('p' + c + 'c' + uc)] = 1; }
    Object.keys(used).sort(function (a, b) { return a - b; }).forEach(function (w, i) { css += rule('row', '.col-' + w, ['grid-column: span ' + w], i === 0 ? 'Column widths' : ''); });
  }

  var anyCards = false;
  for (var g = 1; g <= panelCount; g++) {
    var gk = cardsOf(g); if (!gk) continue;
    if (!anyCards) { anyCards = true; var cs3 = div ? '.' + cls('card') : 'article'; css += rule('row', cs3, ['position: relative', 'border: 2px solid black', 'min-height: 120px'], 'Every card'); css += rule('row', cs3 + ' h2', ['font-size: 1.2rem', 'overflow-wrap: anywhere'], 'Headings shrink to fit inside cards'); css += rule('row', cs3 + ' h3', ['font-size: 1rem', 'overflow-wrap: anywhere']); }
    var gs = div ? '.' + cls('p' + g) : tagSel(g);
    css += rule('p' + g, gs, ['display: grid', 'grid-template-columns: repeat(12, 1fr)', placed['p' + g + 'Head'] ? 'grid-template-rows: auto ' + rowTemplate(g) : sameShares(g) ? 'grid-auto-rows: 1fr' : 'grid-template-rows: ' + rowTemplate(g), 'gap: 12px', 'padding: ' + (padOf('p' + g) !== null ? padOf('p' + g) : 12) + 'px'], 'Panel ' + g + ' holds ' + gk + ' cards on a 12-column grid');
    if (placed['p' + g + 'Head']) css += rule('p' + g, gs + ' h2', ['grid-column: 1 / -1'], 'The heading stretches across all the cards');
    for (var gc = 1; gc <= gk; gc++) {
      var ckey = 'p' + g + 'c' + gc, csel = gs + ' ' + (div ? '.' + cls('card') : 'article') + ':nth-of-type(' + gc + ')';
      capsUsed(ckey).forEach(function (id, wi) { var gp = capPos[id], nth = (placed[ckey] ? 1 : 0) + wi + 1; css += rule(ckey, csel + ' > :nth-child(' + nth + ')', ['position: absolute', piece(placed[id]).type === 'img' ? 'width: ' + mw(id) + '%' : 'max-width: ' + Math.max(10, Math.round(100 - (capPos[id] ? capPos[id].x : 0))) + '%'].concat(posDecls(ckey, gp)), 'Where ' + wlabel(piece(placed[id])) + ' sits in card ' + gc + ' of panel ' + g); });
      if (padOf(ckey) !== null) css += rule(ckey, csel, ['padding: ' + padOf(ckey) + 'px'], 'Card ' + gc + ' of panel ' + g + ' padding: space inside its edge');
      var cbd = bgDecls(ckey); if (cbd.length) css += rule(ckey, csel, cbd, 'Card ' + gc + ' of panel ' + g + ' background');
    }
  }
  for (var q = 1; q <= panelCount; q++) {
    if (cardsOf(q)) continue;
    capsUsed('p' + q).forEach(function (id, wi) {
      var cp = capPos[id], where = posDecls('p' + q, cp);
      var sel = div ? '.' + cls('p' + q) + ' > :nth-child(' + ((placed['p' + q] ? 1 : 0) + wi + 1) + ')' : tagSel(q) + ' figcaption > :nth-child(' + (wi + 1) + ')';
      css += rule('p' + q, sel, ['position: absolute', piece(placed[id]).type === 'img' ? 'width: ' + mw(id) + '%' : 'max-width: ' + Math.max(10, Math.round(100 - (capPos[id] ? capPos[id].x : 0))) + '%'].concat(where), 'Where ' + wlabel(piece(placed[id])) + ' sits in panel ' + q);
    });
  }
  for (var pq = 1; pq <= panelCount; pq++) if (!cardsOf(pq) && padOf('p' + pq) !== null) css += rule('p' + pq, div ? '.' + cls('p' + pq) : tagSel(pq), ['padding: ' + padOf('p' + pq) + 'px'], 'Panel ' + pq + ' padding: space inside its edge');
  for (var bq = 1; bq <= panelCount; bq++) { var bd = bgDecls('p' + bq); if (bd.length) css += rule('p' + bq, div ? '.' + cls('p' + bq) : tagSel(bq), bd, 'Panel ' + bq + ' background'); }
  var usedKinds = {}; Object.keys(placed).forEach(function (k) { var pp = piece(placed[k]); if (pp && pp.type === 'txt') usedKinds[pp.kind] = 1; });
  if (usedKinds.b) css += rule('container', 'button', ['background: ' + cssColor(theme.accent || '#4169E1'), 'color: white', 'border: none', 'border-radius: 999px', 'padding: 8px 18px', 'font-size: 16px', 'font-weight: bold'], 'Buttons');
  if (usedKinds.nav) { css += rule('container', 'nav ul', ['list-style: none', 'display: flex', 'gap: 16px', 'padding: 0', 'margin: 0'], 'The nav bar: links in a row'); css += rule('container', 'nav a', ['color: ' + cssColor(theme.accent || '#4169E1'), 'font-weight: bold', 'text-decoration: none']); }
  if (usedKinds.a) css += rule('container', 'a', ['color: ' + cssColor(theme.accent || '#4169E1'), 'font-weight: bold'], 'Links');
  var fb = bgDecls('footer'); if (!bgOf('footer').color) fb.unshift('background-color: black'); if (areaH.footer) fb.push('height: ' + areaH.footer + 'px');
  css += rule('footer', cssSel('footer'), fb.concat(['color: white', 'text-align: center', 'padding: ' + (padOf('footer') !== null ? padOf('footer') : 16) + 'px']), 'The end');
  return css;
}
/* turns the marked lines into numbered editor lines, and keeps a plain-text copy for sending */
var codePlain = '', hlKey = null;
function finishCode(str) {
  var tmp = document.createElement('div'), html = '', plain = [], hints = [];
  var parts = str.replace(/\n+$/, '').split('\n');
  parts.forEach(function (ln, i) {
    var m = /^\u0001([^\u0002]+)\u0002/.exec(ln), key = m ? m[1] : '', src = m ? ln.slice(m[0].length) : ln;
    tmp.innerHTML = src; var hEl = tmp.querySelector('.h'); hints.push(hEl ? hEl.textContent : ''); if (hEl) hEl.remove(); plain.push(tmp.textContent.replace(/\s+$/, ''));
    html += '<div class="ln' + (key && key === hlKey ? ' hl' : '') + '" data-k="' + key + '" data-i="' + (plain.length - 1) + '"><span class="num">' + plain.length + '</span><span class="src">' + src + '</span></div>';
  });
  codePlain = plain.join('\n') + '\n';
  codeLines = plain.map(function (t) { return t.replace(/^[\s\u2003]+/, ''); });
  codePairs = pairUp(codeLines); codeHints = hints;
  pinLine = null; hoverLine = null;
  document.getElementById('code').innerHTML = html;
  showNote(null);
}
/* match every start line with its stop line */
var codeLines = [], codePairs = {}, codeHints = [], pinLine = null, hoverLine = null;
var VOID = {img:1, br:1, input:1, hr:1, link:1, meta:1};
function pairUp(lines) {
  var stack = [], pairs = {};
  lines.forEach(function (t, i) {
    var close = /^<\/([a-z0-9]+)>/i.exec(t), open = /^<([a-z0-9]+)[\s>]/i.exec(t);
    var ps = /^Start ([^:(]+?)(?::| \(|$)/.exec(t), pe = /^Stop (.+)$/.exec(t);
    if (/\{$/.test(t)) { stack.push({name: '{', i: i}); return; }
    if (t === '}') { for (var b = stack.length - 1; b >= 0; b--) if (stack[b].name === '{') { pairs[i] = stack[b].i; pairs[stack[b].i] = i; stack.splice(b); break; } return; }
    if (close || pe) {
      var name = close ? close[1].toLowerCase() : pe[1].trim();
      for (var k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { pairs[i] = stack[k].i; pairs[stack[k].i] = i; stack.splice(k); break; }
    } else if (open && !VOID[open[1].toLowerCase()] && t.indexOf('</' + open[1]) < 0) stack.push({name: open[1].toLowerCase(), i: i});
    else if (ps) stack.push({name: ps[1].trim(), i: i});
  });
  return pairs;
}
var PART = {header:'the title area', section:'the feature', main:'the panels', figure:'a panel', figcaption:'the words for a panel', footer:'the footer, the end of the page', body:'the page body. Everything you can see goes inside it'};
function qt(t) { return '\u201C' + t + (/[.!?\u2026]$/.test(t) ? '' : '.') + '\u201D'; }
function annotate(i) {
  var base0 = annotate0(i), idm = activeFile !== 'css' && /^<[a-z0-9]+[^>]* id="([^"]+)"/.exec(codeLines[i] || '');
  return base0 + (idm && base0.indexOf('id=') < 0 ? ' Its id is \u201C' + idm[1] + '\u201D, so a button or link can jump here.' : '');
}
function annotate0(i) {
  var t = codeLines[i] || '', other = codePairs[i] !== undefined ? codePairs[i] + 1 : null, m;
  if (activeFile === 'css') return annotateCSS(t, other, i);
  if (t === '\x3C!DOCTYPE html>') return 'Tells the browser this is a modern web page. It always goes on the very first line.';
  if (t === '\x3Chtml lang="en">') return 'Start of the whole page. The lang part says the page is in English. It stops on line ' + other + '.';
  if (t === '\x3Chead>') return 'The head holds information about the page. Nothing in it shows on the page itself. It stops on line ' + other + '.';
  if ((m = /^<title>(.*)<\/title>$/.exec(t))) return 'The page\u2019s name. It shows on the browser tab: ' + qt(m[1]);
  if (/^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/.test(t)) { var fams = (t.match(/family=([^:&"]+)/g) || []).map(function (f) { return f.slice(7).replace(/\+/g, ' '); }); return 'Loads the ' + (fams.length > 1 ? fams.slice(0, -1).join(', ') + (fams.length > 2 ? ',' : '') + ' and ' + fams[fams.length - 1] : fams[0]) + ' font' + (fams.length > 1 ? 's' : '') + ' from Google Fonts, so every computer can show ' + (fams.length > 1 ? 'them' : 'it') + '. It has to come before style.css. Link tags stand alone, so there\u2019s no stop tag.'; }
  if (/^<link rel="stylesheet"/.test(t)) return 'Connects your style.css file, so your colors, borders, and sizes show up. Link tags stand alone, so there\u2019s no stop tag.';
  if (t === '\x3C/html>') return 'End of the whole page. Nothing goes after this.';
  if (t === '\x3C/head>') return 'Stop tag for the head. The body starts next.';
  if ((m = /^\x3C!--\s*(.*?)\s*--\x3E$/.exec(t))) return 'A comment is a note for people. The browser skips it. This one marks an empty spot you can fill.';
  if ((m = /^<video src="video\.mp4" poster="([^"]+)" controls><\/video>$/.exec(t))) return 'A video player. poster is the picture that shows before the video plays: here it is ' + m[1] + '. controls adds the play and pause buttons. Change video.mp4 to the name of a real video file.';
  if (/^<video src="video\.mp4" controls><\/video>$/.test(t)) return 'A video player. controls adds the play and pause buttons. This one is a placeholder: change video.mp4 to the name of a real video file.';
  if (/^<img src="image-goes-here\.jpg"/.test(t)) return 'A picture placeholder. It saves a spot for a picture. Change image-goes-here.jpg to the name of your real picture.';
  if ((m = /^<img src="([^"]+)" style="object-fit: cover(?:; object-position: (\d+)% (\d+)%)?">/.exec(t))) return 'Shows the picture ' + m[1] + '. object-fit: cover stretches it to fill the whole box, so some edges may be cut off.' + (m[2] ? ' object-position: ' + m[2] + '% ' + m[3] + '% chooses which part shows: ' + (+m[2] < 34 ? 'the left side' : +m[2] > 66 ? 'the right side' : 'the middle') + ', ' + (+m[3] < 34 ? 'toward the top' : +m[3] > 66 ? 'toward the bottom' : 'halfway down') + '.' : '') + ' A picture tag stands alone, so it has no stop tag.';
  if ((m = /^<img src="([^"]+)">/.exec(t))) return 'Shows the picture ' + m[1] + '. A picture tag stands alone, so it has no stop tag.';
  if (/^<section class="cards"/.test(t)) { var sp2 = /grid-column: span (\d+)/.exec(t); return 'Start a group of cards. This panel is the parent box, and each <article> inside is a child card. It stops on line ' + other + '.' + (sp2 ? ' It is ' + sp2[1] + ' of 12 columns wide.' : ''); }
  if (/^<article\b/.test(t)) {
    var acol = /col-(\d+)/.exec(t), aspan = /grid-column: span (\d+)/.exec(t), awid = /width: (\d+%)/.exec(t), arow = /grid-row: span (\d+)/.exec(t), ac = acol ? +acol[1] : aspan ? +aspan[1] : 0;
    return 'Start a card' + (ac === 12 ? ' that stretches across the full width of the panel' : ac ? ' that is ' + ac + ' of 12 columns wide (' + (FRAC[ac] || '') + ' of the panel)' : awid ? ' that is ' + awid[1] + ' as wide as the panel' : '') + '.' + (arow ? ' It is ' + arow[1] + ' card rows tall.' : '') + ' A card is a small box inside a bigger box. It stops on line ' + other + '.';
  }
  if (t === '<article>') return 'Start a card. A card is a small box inside a bigger box, like a recipe card in a row of recipes. It stops on line ' + other + '.';
  if ((m = /^<ol start="(\d+)"(?: style="([^"]*)")?>$/.exec(t))) return 'Start a numbered list. start="' + m[1] + '" makes the numbers begin at ' + m[1] + ' instead of 1, so this list can continue the steps from another one. It stops on line ' + other + '.' + describeStyle(m[2]);
  if ((m = /^<(ul|ol)(?: style="([^"]*)")?>$/.exec(t))) return (m[1] === 'ul' ? 'Start a bullet list. In code it\u2019s called an unordered list, <ul>.' : 'Start a numbered list. In code it\u2019s called an ordered list, <ol>. The numbers count up by themselves.') + ' Each <li> inside is one item. It stops on line ' + other + '.' + describeStyle(m[2]);
  if ((m = /^<nav(?: style="([^"]*)")?>$/.exec(t))) return 'Start the nav bar: the links people use to move around your site. Inside is a list of links. CSS turns it into a row. It stops on line ' + other + '.' + describeStyle(m[1]);
  if ((m = /^<li><a href="([^"]*)"(?: style="([^"]*)")?>(.*)<\/a><\/li>$/.exec(t))) return 'One link in the list: ' + qt(m[3]) + ' Clicking it goes to ' + m[1] + '. li means list item.' + describeStyle(m[2]);
  if ((m = /^<li(?: style="margin-bottom: (\d+)px")?>(.*)<\/li>$/.exec(t))) return 'One list item: ' + qt(m[2]) + ' li means list item.' + (m[1] !== undefined ? ' margin-bottom adds ' + m[1] + ' pixels of space after it, before the next item. That is the space between items, not between lines.' : '');
  if ((m = /^Start (bullet list|numbered list|nav bar)(?: \(([^)]+)\))?$/.exec(t))) return 'Start a ' + m[1] + '. Each line inside is one ' + (m[1] === 'nav bar' ? 'link' : 'item') + '.' + (m[2] ? ' It is ' + m[2] + '.' : '') + ' It stops on line ' + other + '.';
  if ((m = /^Item(?: (\d+))?: (.*)$/.exec(t))) return 'One item in the list: ' + qt(m[2]) + (m[1] ? ' It is number ' + m[1] + '.' : '');
  if ((m = /^Link: (.*) \(goes to (.*)\)$/.exec(t))) return 'One link in the nav bar: ' + qt(m[1]) + ' It goes to ' + m[2] + '.';
  if ((m = /<button(?: onclick="location\.href='([^']*)'")?(?: style="([^"]*)")?>(.*)<\/button>/.exec(t))) { var bw = /^<p style="text-align: (\w+)">/.exec(t); return 'A button that says ' + qt(m[3]) + (m[1] ? ' onclick is an event trigger: when someone clicks, the code inside runs. location.href = \'' + m[1] + '\' sends them to ' + (m[1].charAt(0) === '#' ? 'the part of this page with id="' + m[1].slice(1) + '".' : m[1] + '.') : ' People can click it.') + ' It starts and stops on the same line.' + describeStyle(m[2]) + (bw ? ' The <p> around it lines it up ' + bw[1] + '.' : ''); }
  if ((m = /<a href="([^"]*)"(?: style="([^"]*)")?>(.*)<\/a>/.exec(t))) { var al = /^<p style="text-align: (\w+)">/.exec(t); return 'A link that says ' + qt(m[3]) + ' Clicking it goes to ' + (m[1] === '#' ? 'nowhere yet. Choose where it goes in the Words tab.' : m[1].charAt(0) === '#' ? 'the part of this page with id="' + m[1].slice(1) + '". The # means a spot on this same page.' : m[1] + '.') + ' The href tells the browser where to go.' + describeStyle(m[2]) + (al ? ' The <p> around it lines it up ' + al[1] + '.' : ''); }
  if ((m = /^Start button(?: \(([^)]+)\))?: (.*)$/.exec(t))) return 'Start a button that says ' + qt(m[2]) + (m[1] ? ' It is ' + m[1] + '.' : '') + ' It stops on line ' + other + '.';
  if ((m = /^Start link(?: \(([^)]+)\))?: (.*?) \(goes to (.*)\)$/.exec(t))) return 'Start a link that says ' + qt(m[2]) + ' Clicking it goes to ' + m[3] + '.' + (m[1] ? ' It is ' + m[1] + '.' : '') + ' It stops on line ' + other + '.';
  if ((m = /^<(h1|h2|h3|p)(?: id="[^"]*")?(?: style="([^"]*)")?>(.*)<\/\1>$/.exec(t))) {
    var what = m[1] === 'h1' ? 'The biggest heading' : m[1] === 'h2' ? 'A heading' : m[1] === 'h3' ? 'A subheading, one size smaller than a heading,' : 'A paragraph';
    return what + ' that says ' + qt(m[3]) + ' It starts and stops on the same line.' + describeStyle(m[2]);
  }
  if ((m = /^<\/([a-z0-9]+)>$/.exec(t))) return 'Stop tag. It closes the <' + m[1] + '> that started on line ' + other + '.';
  if ((m = /^<div class="([^"]+)"(?: id="[^"]*")?(?: style="([^"]+)")?>/.exec(t))) {
    var classes = m[1].split(' '), name = classes[0], col = classes[1] && /^col-(\d+)$/.exec(classes[1]), extra = '';
    var span = m[2] && /grid-column: span (\d+)/.exec(m[2]), w = m[2] && /width: (\d+%)/.exec(m[2]), rows = m[2] && /grid-row: span (\d+)/.exec(m[2]);
    var c = col ? +col[1] : span ? +span[1] : null;
    if (c) extra += ' It is ' + c + ' of 12 columns wide (' + (FRAC[c] || '') + ').';
    if (w) extra += ' It is ' + w[1] + ' as wide as the row.';
    if (rows) extra += ' It is ' + hLabel(+rows[1]) + ' tall.';
    if (name === cls('card')) { var cc2 = col ? +col[1] : span ? +span[1] : null; return 'Start a card: a small box inside the panel around it. Its stop tag is on line ' + other + '.' + (rows ? ' It is ' + rows[1] + ' card rows tall.' : '') + (cc2 ? (cc2 === 12 ? ' It stretches across the full width of the panel.' : ' It is ' + cc2 + ' of 12 columns wide (' + (FRAC[cc2] || '') + ' of the panel).') : w ? ' It is ' + w[1] + ' as wide as the panel.' : ''); }
    return 'Start a box called ' + qt(name) + ' Its stop tag is on line ' + other + '.' + extra;
  }
  if ((m = /^<([a-z0-9]+)(.*)>$/.exec(t))) {
    var ex = '', sp = /grid-column: span (\d+)/.exec(m[2]), wd = /width: (\d+%)/.exec(m[2]), rw = /grid-row: span (\d+)/.exec(m[2]);
    if (sp) ex += ' It is ' + sp[1] + ' of 12 columns wide (' + (FRAC[+sp[1]] || '') + ').';
    if (wd) ex += ' It is ' + wd[1] + ' as wide as the row.';
    if (rw) ex += ' It is ' + hLabel(+rw[1]) + ' tall.';
    return 'Start tag for ' + (PART[m[1]] || 'a <' + m[1] + '>') + '. Its stop tag is on line ' + other + '.' + ex;
  }
  if ((m = /^Start picture \(covers the whole box\): (.*)$/.exec(t))) return 'Start showing your drawing ' + qt(m[1]) + ' It fills the whole box, so some edges may be cut off. It stops on line ' + other + '.';
  if ((m = /^Start picture: (.*)$/.exec(t))) return 'Start showing your drawing ' + qt(m[1]) + ' It stops on line ' + other + '.';
  if ((m = /^Start (big title|subheading|heading|paragraph)(?: \(([^)]+)\))?: (.*)$/.exec(t))) return 'Start the ' + m[1] + ' that says ' + qt(m[3]) + (m[2] ? ' It is ' + m[2] + '.' : '') + ' It stops on line ' + other + '.';
  if ((m = /^Start card (\d)(?: \((.+)\))?$/.exec(t))) return 'Start card ' + m[1] + (m[2] ? ' (' + m[2] + ')' : '') + '. It is a child inside the panel around it. Everything until line ' + other + ' is inside the card.';
  if ((m = /^Start ([^(]+?)(?: \((.+)\))?$/.exec(t))) return 'Start ' + m[1] + '. Everything until line ' + other + ' is inside it.' + (m[2] ? ' Size: ' + m[2] + '.' : '');
  if ((m = /^Stop (.+)$/.exec(t))) return 'Stop ' + m[1] + '. This ends what started on line ' + other + '.';
  if (/^\(nothing here yet\)$/.test(t)) return 'This part is empty. Drag a drawing or words into it on your comic.';
  return '';
}
var CSSPROP = {
  'margin': 'Space outside the box.', 'padding': 'Space inside the box, around what it holds.', 'font-family': 'Which font the words use.',
  'max-width': 'The page never gets wider than this.', 'border': 'Draws a line around the box: how thick, what kind, and what color.',
  'text-align': 'Lines up the words: left, center, or right.', 'height': 'How tall the box is.', 'width': 'How wide it is.',
  'display': 'How the box arranges what\u2019s inside. Grid lines things up in rows and columns.', 'grid-template-columns': 'Makes 12 columns that share the space equally.',
  'grid-auto-rows': 'Each small row is 35 pixels tall. Six of them make 1 comic row.', 'column-gap': 'Space between the columns.',
  'object-fit': 'Fits the whole picture inside its box without stretching it.', 'background': 'The color behind the box.', 'color': 'The color of the words.',
  'list-style': 'Hides the bullets, so the links look like a menu.', 'gap': 'Space between the items.', 'text-decoration': 'Lines under or through the words. None takes away the underline.',
  'background-color': 'The color behind this box.', 'background-image': 'A picture behind everything in this box. url() names the picture file.',
  'background-repeat': 'Whether the picture repeats. no-repeat shows it once.', 'background-position': 'Where the picture sits. center puts it in the middle.',
  'overflow-wrap': 'Lets a long word break onto the next line instead of spilling out of its box.',
  'line-height': 'The space between lines that wrap inside one paragraph or item. Bigger numbers spread those lines apart. Space between items is set separately.', 'margin-bottom': 'Space after this element, before the next one.',
  'border-radius': 'Rounds the corners.', 'font-size': 'How big the letters are.', 'font-weight': 'How thick the letters are. Bold makes them thick.',
  'left': 'How far from the left edge of the panel.', 'top': 'How far from the top edge of the panel.', 'grid-column': 'How many of the 12 columns it covers.'
};
function annotateCSS(t, other) {
  var m;
  if ((m = /^\/\*\s*(.*?)\s*\*\/$/.exec(t))) return 'A comment is a note for people. The browser skips it. This one says: ' + m[1] + '.';
  if (t === '}') return 'Closing brace. It ends the rule that started on line ' + other + '.';
  if ((m = /^([^{]+?)\s*\{$/.exec(t))) {
    var sel = m[1], what = sel === 'body' ? 'the whole page' : sel === 'img' ? 'every picture' : /^\./.test(sel) ? 'the box with class ' + qt(sel.slice(1).replace(/ p$/, '')).replace(/\.\u201D$/, '\u201D') + (/ p$/.test(sel) ? ', and the words inside it' : '') : 'every <' + sel.split(' ')[0].replace(/:.*/, '') + '>';
    return 'This rule styles ' + what + '. The rule ends on line ' + other + '.';
  }
  if ((m = /^\.([\w-]+),$/.exec(t))) return 'This rule styles more than one box. Commas separate each one.';
  if ((m = /^([\w-]+):\s*(.*);$/.exec(t))) {
    var why = CSSPROP[m[1]] || 'A style setting.';
    if (m[1] === 'position') why = m[2] === 'relative' ? 'Lets things inside this box be placed exactly where you want.' : 'Places this exactly, measured from its box.';
    if (m[1] === 'grid-column') why += ' This one covers ' + m[2].replace('span ', '') + ' of 12.';
    if (m[1] === 'display' && m[2] === 'flex') why = 'Lines the items up side by side in a row. This is what turns a list into a nav bar.';
    if (m[1] === 'grid-template-rows') { var hasAuto = /^auto /.test(m[2]), parts2 = m[2].replace(/^auto /, '').split(' '); why = 'How tall each row of cards is. ' + m[2] + ' means ' + parts2.map(function (p2, i2) { return 'card row ' + (i2 + 1) + ' gets ' + parseInt(p2, 10) + (parseInt(p2, 10) === 1 ? ' share' : ' shares'); }).join(' and ') + ' of the panel\u2019s height.' + (hasAuto ? ' auto comes first, so the heading row is only as tall as the heading.' : ''); }
    if (m[1] === 'grid-auto-rows' && m[2] === '1fr') why = 'How tall each row of cards is. 1fr means every row gets an equal share of the panel\u2019s height.';
    if (m[1] === 'font-size' && /rem$/.test(m[2])) why = 'How big the letters are. 1rem is the normal text size, so 1.2rem is a little bigger.';
    if ((m[1] === 'left' || m[1] === 'top') && /^calc/.test(m[2])) why = (m[1] === 'left' ? 'How far from the left edge.' : 'How far from the top edge.') + ' calc() adds the box\u2019s padding, so the words stay inside it.';
    if (m[1] === 'line-height') why = CSSPROP['line-height'];
    if (m[1] === 'padding') why = 'Padding: the space between the edge of the box and what\u2019s inside it.' + (m[2] === '0px' ? ' 0px means no space at all.' : '');
    if (m[1] === 'background-size') why = m[2] === 'cover' ? 'Stretches the picture to cover the whole box. Some edges may be cut off.' : m[2] === 'contain' ? 'Fits the whole picture inside the box, with space around it if needed.' : 'How big each copy of the picture is.';
    if (m[1] === 'background-repeat' && m[2] === 'repeat') why = 'Repeats the picture like tiles to fill the box.';
    if (m[1] === 'font-family') why = 'Which font the words use. This one is ' + fontByStack(m[2]) + '. The fonts after the commas are backups if a computer doesn\u2019t have the first one.';
    if ((m[1] === 'color' || m[1] === 'background' || m[1] === 'background-color') && /^#[0-9a-f]{6}$/i.test(m[2])) why += ' ' + m[2] + ' is a HEX code: two digits each for red, green, and blue, from 00 (none) to ff (all).';
    if ((m[1] === 'color' || m[1] === 'background' || m[1] === 'background-color') && /^rgb\(/.test(m[2])) why += ' rgb() mixes red, green, and blue light, each from 0 (none) to 255 (all).';
    if ((m[1] === 'color' || m[1] === 'background' || m[1] === 'background-color') && /^[a-z]+$/.test(m[2]) && m[2] !== 'none') why += ' ' + m[2] + ' is one of the color names CSS already knows. There are about 140 of them.';
    if (m[1] === 'margin' && m[2] === '0 auto') why = 'Centers the page by giving it equal space on the left and right.';
    return why + ' Here it is set to ' + m[2] + '.';
  }
  if ((m = /^Start style for (.+)$/.exec(t))) return 'Start the style rules for ' + m[1] + '. They stop on line ' + other + '.';
  if ((m = /^Stop style for (.+)$/.exec(t))) return 'Stop the style rules for ' + m[1] + '. They started on line ' + other + '.';
  if (!t) return '';
  return 'A style rule: ' + t.charAt(0).toLowerCase() + t.slice(1) + '.';
}
function showNote(i) {
  var f = document.getElementById('ideFoot');
  if (i === null || i === undefined) { f.classList.remove('note'); f.textContent = 'Point at your comic or at a line of code to learn what it does.'; return; }
  var n = annotate(i), hh = codeHints[i];
  if (hh) n += hh.charAt(0) === '(' ? ' In code, pictures have no stop tag.' : ' In code: ' + hh;
  f.classList.add('note'); f.innerHTML = '<span><b>Line ' + (i + 1) + '</b>' + esc(n || 'This line is part of your page.') + '</span>';
}
function markLine(i, cls) {
  document.querySelectorAll('#code .ln.' + cls + (cls === 'pin' ? ', #code .ln.pair' : '')).forEach(function (l) { l.classList.remove(cls); if (cls === 'pin') l.classList.remove('pair'); });
  document.querySelectorAll('[data-key].keyhl').forEach(function (e) { e.classList.remove('keyhl'); });
  var show = cls === 'hover' && i === null ? pinLine : i;
  if (i !== null) {
    var ln = document.querySelector('#code .ln[data-i="' + i + '"]'); if (ln) ln.classList.add(cls);
    if (cls === 'pin' && codePairs[i] !== undefined) { var pr = document.querySelector('#code .ln[data-i="' + codePairs[i] + '"]'); if (pr) pr.classList.add('pair'); }
  }
  var focusI = show !== null && show !== undefined ? show : null;
  if (focusI !== null) {
    var l2 = document.querySelector('#code .ln[data-i="' + focusI + '"]'), k = l2 && l2.dataset.k;
    var part = k && document.querySelector('#comic [data-key="' + k + '"], #comic[data-key="' + k + '"]');
    if (part && k !== 'container') part.classList.add('keyhl');
  }
  showNote(focusI);
}
var codeBox = document.getElementById('code');
document.querySelector('.ide-tabs').addEventListener('click', function (e) {
  var b = e.target.closest('.ide-tab'); if (!b || b.dataset.file === activeFile) return;
  activeFile = b.dataset.file; try { localStorage.setItem(KEY + '-file', activeFile); } catch (er) {}
  paintCode(); codeBox.scrollTop = 0; say(activeFile === 'css' ? 'Showing style.css.' : 'Showing index.html.');
});
document.querySelector('.ide-tabs').addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault(); var other = document.querySelector('.ide-tab[data-file="' + (activeFile === 'html' ? 'css' : 'html') + '"]'); other.focus(); other.click();
});
function plainOf(str) { var tmp = document.createElement('div'); return str.replace(/\n+$/, '').split('\n').map(function (ln) { tmp.innerHTML = ln.replace(/^\u0001[^\u0002]+\u0002/, ''); return tmp.textContent; }).join('\n'); }
codeBox.addEventListener('mouseover', function (e) {
  var ln = e.target.closest('.ln'); var i = ln ? +ln.dataset.i : null;
  if (i === hoverLine) return; hoverLine = i; markLine(i, 'hover');
});
codeBox.addEventListener('mouseleave', function () { hoverLine = null; markLine(null, 'hover'); });
codeBox.addEventListener('click', function (e) {
  var ln = e.target.closest('.ln'); if (!ln) { pinLine = null; markLine(null, 'pin'); return; }
  var i = +ln.dataset.i; pinLine = pinLine === i ? null : i; markLine(pinLine, 'pin'); revealPart(pinLine);
});
codeBox.addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
  var n = codeLines.length; if (!n) return;
  pinLine = pinLine === null ? 0 : Math.max(0, Math.min(n - 1, pinLine + (e.key === 'ArrowDown' ? 1 : -1)));
  markLine(pinLine, 'pin'); revealPart(pinLine);
  var ln = document.querySelector('#code .ln[data-i="' + pinLine + '"]');
  if (ln) { var top = ln.offsetTop - codeBox.scrollTop; if (top < 20 || top > codeBox.clientHeight - 40) codeBox.scrollTo({top: ln.offsetTop - codeBox.clientHeight / 2}); }
});
function revealPart(i) {
  if (i === null) return;
  var ln = document.querySelector('#code .ln[data-i="' + i + '"]'), k = ln && ln.dataset.k;
  var part = k && k !== 'container' && document.querySelector('#comic [data-key="' + k + '"]');
  if (part && !stage.classList.contains('code-only')) {
    var r = part.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) part.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
}
function highlight(key, scroll) {
  if (key === hlKey) return; hlKey = key;
  var lines = document.querySelectorAll('#code .ln'), first = null;
  lines.forEach(function (l) { var on = !!key && l.dataset.k === key; l.classList.toggle('hl', on); if (on && !first) first = l; });
  if (scroll && first && app.classList.contains('show-code')) {
    var box = document.getElementById('code'), top = first.offsetTop - 30;
    if (first.offsetTop < box.scrollTop || first.offsetTop > box.scrollTop + box.clientHeight - 40) box.scrollTo({top: top, behavior: 'smooth'});
  }
}
document.addEventListener('mouseover', function (e) {
  if (!app.classList.contains('show-code') || (e.target.closest && e.target.closest('.ide'))) return;
  var k = e.target.closest && e.target.closest('[data-key]');
  highlight(k ? k.dataset.key : null, true);
});
document.addEventListener('focusin', function (e) {
  if (!app.classList.contains('show-code')) return;
  var k = e.target.closest && e.target.closest('[data-key]'); if (k) highlight(k.dataset.key, true);
});

/* ---------- drag (mouse, pen, touch) ---------- */
var drag = null, suppress = false;
function targetAt(x, y) { var e = document.elementFromPoint(x, y); return e ? (e.closest('.slot') || e.closest('.tray')) : null; }
/* where dragged words would land inside a box: snapped to a 9 x 9 grid when Snap is on */
var SNAP_N = 9;
/* bigger boxes get a finer grid: about one snap line every 45 pixels, always a multiple of 3 (9 to 36) */
function snapCount(px) { return Math.max(9, Math.min(36, 3 * Math.round(px / 45 / 3))); }
/* where a piece sits now, as % of the inside of its box */
function domPos(slotId, box) {
  var c = document.querySelector('[data-slot="' + slotId + '"]'); if (!c || !box) return null;
  var br = box.getBoundingClientRect(), pd = padPx(box), cr = c.getBoundingClientRect(), W = box.clientWidth - 2 * pd, H = box.clientHeight - 2 * pd;
  return {x: Math.round((cr.left - br.left - box.clientLeft - pd) / W * 1000) / 10, y: Math.round((cr.top - br.top - box.clientTop - pd) / H * 1000) / 10};
}
function dropSpot(box, cx, cy, d) {
  var br = box.getBoundingClientRect(), card = box.classList.contains('card');
  var pd = padPx(box);
  var r = {left: br.left + box.clientLeft + pd, top: br.top + box.clientTop + pd, width: box.clientWidth - 2 * pd, height: box.clientHeight - 2 * pd};   /* inside the border, where words are placed */
  var dp = piece(d.id), w, h;
  if (d.capEl) { w = d.capEl.offsetWidth; h = d.capEl.offsetHeight; }
  else if (dp && dp.type === 'img') { w = r.width * 0.5; h = Math.min(w / ratioOf(dp), r.height); if (h === r.height) w = h * ratioOf(dp); }
  else if (dp && dp.type === 'txt') { var mc = el('div', 'slot cap placed'); mc.style.cssText = 'visibility:hidden;left:0;top:0'; mc.appendChild(makePiece(dp)); box.appendChild(mc); w = mc.offsetWidth; h = mc.offsetHeight; mc.remove(); }
  else { w = card ? r.width - 8 : Math.min(r.width * 0.66, 320); h = 36; }
  w = Math.min(w, r.width); h = Math.min(h, r.height);
  var x = cx - (d.capEl ? d.offX : 20) - r.left, y = cy - (d.capEl ? d.offY : 16) - r.top;
  x = Math.max(0, Math.min(r.width - w, x)); y = Math.max(0, Math.min(r.height - h, y));
  /* magnetic snapping: the piece moves freely, and pulls onto a line when it comes within a few pixels of one */
  var nx = snapCount(r.width), ny = snapCount(r.height), m = 6, T = 12;
  var lines = function (size, n) { var a = []; for (var k = 0; k < n; k++) a.push(m + (size - 2 * m) * k / (n - 1)); return a; };
  var gx = lines(r.width, nx), gy = lines(r.height, ny), guides = [];
  var cxs = [], cys = [];   /* candidate positions for the piece's left (x) and top (y), each with the guide it draws */
  var addX = function (v, kind, at) { if (v >= -0.5 && v <= r.width - w + 0.5) cxs.push({v: v, kind: kind, at: at}); };
  var addY = function (v, kind, at) { if (v >= -0.5 && v <= r.height - h + 0.5) cys.push({v: v, kind: kind, at: at}); };
  addX(m, 'edge', m); addX(r.width - w - m, 'edge', r.width - m); addX((r.width - w) / 2, 'center', r.width / 2);
  addY(m, 'edge', m); addY(r.height - h - m, 'edge', r.height - m); addY((r.height - h) / 2, 'center', r.height / 2);
  /* line up with the other pieces in this box: left edges, right edges, centers, tops, bottoms */
  var skip = {}; skip[d.id] = 1; if (multi.length > 1 && multi.indexOf(d.id) >= 0) multi.forEach(function (q) { skip[q] = 1; });
  box.querySelectorAll(':scope > .cap.placed, :scope > .cap:not(.empty)').forEach(function (c) {
    var pid = placed[c.dataset.slot]; if (!pid || skip[pid]) return;
    var cr = c.getBoundingClientRect(), L = cr.left - r.left, Tp = cr.top - r.top, W2 = cr.width, H2 = cr.height;
    addX(L, 'piece', L); addX(L + W2 - w, 'piece', L + W2); addX(L + W2 / 2 - w / 2, 'piece', L + W2 / 2);
    addY(Tp, 'piece', Tp); addY(Tp + H2 - h, 'piece', Tp + H2); addY(Tp + H2 / 2 - h / 2, 'piece', Tp + H2 / 2); addY(Tp + H2 + 12, 'piece', Tp + H2 + 6);
  });
  gx.forEach(function (v) { addX(v, 'grid', v); }); gy.forEach(function (v) { addY(v, 'grid', v); });
  var best = function (v, list) { var bb = null; list.forEach(function (c) { var dd = Math.abs(c.v - v); if (dd <= T && (!bb || dd < bb.d - 0.01 || (Math.abs(dd - bb.d) < 0.01 && c.kind !== 'grid'))) bb = {d: dd, c: c}; }); return bb && bb.c; };
  var sx = null, sy = null;
  if (snapOn) { sx = best(x, cxs); sy = best(y, cys); if (sx) { x = sx.v; guides.push({dir: 'v', at: sx.at, kind: sx.kind}); } if (sy) { y = sy.v; guides.push({dir: 'h', at: sy.at, kind: sy.kind}); } }
  return {x: x, y: y, w: w, h: h, r: r, gx: gx, gy: gy, pd: pd, nx: nx, ny: ny, guides: guides,
    col: sx && sx.kind === 'grid' ? gx.indexOf(sx.v) + 1 : 0, row: sy && sy.kind === 'grid' ? gy.indexOf(sy.v) + 1 : 0,
    xkind: sx ? sx.kind : '', ykind: sy ? sy.kind : ''};
}
function clearPreview() { document.querySelectorAll('.drop-ghost, .snap-dot, .snap-guide').forEach(function (n) { n.remove(); }); }
function showPreview(box, spot, text) {
  clearPreview();
  var g = el('div', 'drop-ghost', text); g.style.left = (spot.x + spot.pd) + 'px'; g.style.top = (spot.y + spot.pd) + 'px'; g.style.width = spot.w + 'px'; g.style.height = spot.h + 'px';
  /* faint dots mark the grid; colored lines show what the piece is lining up with */
  if (snapOn) spot.gx.forEach(function (sx) { spot.gy.forEach(function (sy) {
    var dot = el('div', 'snap-dot'); dot.style.left = (sx + spot.pd) + 'px'; dot.style.top = (sy + spot.pd) + 'px'; box.appendChild(dot);
  }); });
  (spot.guides || []).forEach(function (gd) {
    var ln = el('div', 'snap-guide ' + gd.dir + ' ' + gd.kind);
    if (gd.dir === 'v') ln.style.left = (gd.at + spot.pd) + 'px'; else ln.style.top = (gd.at + spot.pd) + 'px';
    box.appendChild(ln);
  });
  box.appendChild(g);
}
function wordBoxAt(t) {
  var box = t && t.closest('.box[data-art]');
  if (box && t.classList.contains('slot') && (t.classList.contains('art') || capBase(t.dataset.slot) === box.dataset.art)) return box;
  return null;
}
function clearOver() { document.querySelectorAll('.over').forEach(function (e) { e.classList.remove('over'); }); }
document.addEventListener('pointerdown', function (e) {
  if (ux.mode !== 'build') return;
  if (panKey && e.target.closest && e.target.closest('[data-slot="' + panKey + '"]') && !e.target.closest('.pbar')) {
    e.preventDefault(); var ps = document.querySelector('[data-slot="' + panKey + '"]'), r = ps.getBoundingClientRect(), cur = picPos[panKey] || {x: 50, y: 50};
    pan = {key: panKey, x: e.clientX, y: e.clientY, w: r.width, h: r.height, sx: cur.x, sy: cur.y, img: ps.querySelector('img')}; return;
  }
  if (e.target.closest && e.target.closest('.qalign')) return;
  var rh = e.target.closest('.resize'); if (rh && e.button <= 0) { startResize(e, rh); return; }
  if (anyModal()) return;
  var b = e.target.closest('.piece'); if (!b || e.button > 0) return;
  var cap = b.closest('.cap'), cr = cap && cap.getBoundingClientRect();
  drag = {id:b.dataset.id, el:b, x:e.clientX, y:e.clientY, moving:false, ghost:null,
          capEl:cap, offX:cr ? e.clientX - cr.left : 0, offY:cr ? e.clientY - cr.top : 0};
});
document.addEventListener('pointermove', function (e) {
  if (pan) {
    e.preventDefault();
    var nx = Math.max(0, Math.min(100, pan.sx - (e.clientX - pan.x) / pan.w * 150)), ny = Math.max(0, Math.min(100, pan.sy - (e.clientY - pan.y) / pan.h * 150));
    pan.nx = Math.round(nx); pan.ny = Math.round(ny); if (pan.img) pan.img.style.objectPosition = pan.nx + '% ' + pan.ny + '%'; return;
  }
  if (rs) { moveResize(e); return; }
  if (!drag) return;
  if (!drag.moving) {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
    drag.moving = true; drag.el.classList.add('lifted');
    var p = piece(drag.id), g = el('div', 'ghost ' + p.type);
    if (p.type === 'img') { var i = el('img'); i.src = p.src; i.alt = ''; g.appendChild(i); }
    else { g.textContent = p.text; g.style.fontFamily = p.kind === 'h' ? 'var(--comic)' : 'var(--hand)'; g.style.fontSize = p.kind === 'h' ? '24px' : '17px'; g.style.fontWeight = '700'; }
    document.body.appendChild(g); drag.ghost = g;
  }
  e.preventDefault();
  drag.cx = e.clientX; drag.cy = e.clientY;
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
  clearOver(); var t = targetAt(e.clientX, e.clientY); if (t) t.classList.add('over');
  var pv = piece(drag.id), wb = pv && floats(pv) && wordBoxAt(t);
  if (wb && multi.length > 1 && multi.indexOf(drag.id) >= 0) document.querySelectorAll('.cap.multi').forEach(function (c) { if (placed[c.dataset.slot] !== drag.id) c.style.opacity = '.45'; });
  if (wb) {
    var spotG = dropSpot(wb, e.clientX, e.clientY, drag); showPreview(wb, spotG, pv.type === 'txt' ? pv.text.split('\n')[0] : pv.alt);
    /* a picked group: show where every piece in it will land */
    if (multi.length > 1 && multi.indexOf(drag.id) >= 0 && drag.capEl && capBase(drag.capEl.dataset.slot) === wb.dataset.art) {
      var dc = drag.capEl.getBoundingClientRect(), dx9 = spotG.x - (dc.left - spotG.r.left), dy9 = spotG.y - (dc.top - spotG.r.top);
      multi.forEach(function (mid) {
        var ms = slotOf(mid); if (!ms || mid === drag.id) return; var ce = document.querySelector('[data-slot="' + ms + '"]'); if (!ce) return;
        var cr = ce.getBoundingClientRect(), gx = Math.max(0, Math.min(spotG.r.width - cr.width, cr.left - spotG.r.left + dx9)), gy = Math.max(0, Math.min(spotG.r.height - cr.height, cr.top - spotG.r.top + dy9));
        var gg = el('div', 'drop-ghost group'); gg.style.left = (gx + spotG.pd) + 'px'; gg.style.top = (gy + spotG.pd) + 'px'; gg.style.width = cr.width + 'px'; gg.style.height = cr.height + 'px'; wb.appendChild(gg);
      });
    }
  } else clearPreview();
  if (pv && floats(pv)) drag.ghost.classList.toggle('hide', !!wb);
  if (!drag.scrolling) { drag.scrolling = true; requestAnimationFrame(autoScroll); }
}, {passive:false});
/* scroll the page while dragging near the top or bottom edge */
function autoScroll() {
  if (!drag || !drag.moving) return;
  var edge = 80, y = drag.cy, h = window.innerHeight, dy = 0;
  if (y > h - edge) dy = Math.ceil((y - (h - edge)) / 4);
  else if (y < edge) dy = -Math.ceil((edge - y) / 4);
  if (dy) {
    window.scrollBy(0, dy);
    document.dispatchEvent(new PointerEvent('pointermove', {clientX: drag.cx, clientY: drag.cy, bubbles: true}));
  }
  requestAnimationFrame(autoScroll);
}
document.addEventListener('pointerup', function (e) {
  document.querySelectorAll('.cap.multi').forEach(function (c) { c.style.opacity = ''; });
  if (pan) { if (pan.nx !== undefined) { picPos[pan.key] = {x: pan.nx, y: pan.ny}; renderCode(); save(); } pan = null; suppress = true; setTimeout(function () { suppress = false; }, 0); return; }
  if (rs) { endResize(); return; }
  if (!drag) return; var d = drag; drag = null;
  if (!d.moving) return;
  d.ghost.remove(); clearOver(); clearPreview(); d.el.classList.remove('lifted');
  var t = targetAt(e.clientX, e.clientY), ok = true;
  var vcap = t && t.closest && t.closest('.cap.media'), vp = vcap && placed[vcap.dataset.slot] && piece(placed[vcap.dataset.slot]);
  if (vp && vp.ph === 'video' && piece(d.id).type === 'img' && !piece(d.id).ph) { selected = null; suppress = true; setTimeout(function () { suppress = false; }, 0); setPoster(vp.id, d.id); return; }
  var p = piece(d.id), box = floats(p) && wordBoxAt(t);
  if (box) {
    var capId = freeCap(box.dataset.art, d.id), spot = dropSpot(box, e.clientX, e.clientY, d);
    if (!capId) { ok = false; toast(fullMsg(box.dataset.art)); }
    else ok = place(d.id, capId);
    if (ok) {
      var old0 = capPos[capId] ? {x: capPos[capId].x, y: capPos[capId].y} : domPos(capId, box);
      capPos[capId] = {x: Math.round(spot.x / spot.r.width * 1000) / 10, y: Math.round(spot.y / spot.r.height * 1000) / 10};
      if (multi.length > 1 && multi.indexOf(d.id) >= 0 && old0) {
        var dx0 = capPos[capId].x - old0.x, dy0 = capPos[capId].y - old0.y;
        multi.forEach(function (mid) {
          var ms = slotOf(mid); if (!ms || mid === d.id || capBase(ms) !== box.dataset.art) return;
          if (!capPos[ms]) capPos[ms] = domPos(ms, box) || {x: 2, y: 2};
          var me = document.querySelector('[data-slot="' + ms + '"]'), wp = me ? me.offsetWidth / spot.r.width * 100 : 20, hp = me ? me.offsetHeight / spot.r.height * 100 : 10;
          capPos[ms] = {x: Math.round(Math.max(0, Math.min(100 - wp, capPos[ms].x + dx0)) * 10) / 10, y: Math.round(Math.max(0, Math.min(100 - hp, capPos[ms].y + dy0)) * 10) / 10};
        });
      }
      var kindWord = {grid:'a grid line', center:'the center', edge:'the edge', piece:'another piece'};
      say(p.alt + ' moved.' + (spot.xkind ? ' Lined up across with ' + kindWord[spot.xkind] + '.' : '') + (spot.ykind ? ' Lined up down with ' + kindWord[spot.ykind] + '.' : ''));
    }
  }
  else if (t && t.classList.contains('slot')) ok = place(d.id, t.dataset.slot);
  else if (t && t.classList.contains('tray')) unplace(d.id);
  selected = null; suppress = true; setTimeout(function () { suppress = false; }, 0);
  if (ok) render(); else setTimeout(render, 600);
});
document.addEventListener('pointercancel', function () { clearPreview(); if (drag) { if (drag.ghost) drag.ghost.remove(); drag.el.classList.remove('lifted'); } drag = null; clearOver(); });

/* where a word box sits inside its picture, as a percent of the panel */
function padPx(box) { return parseFloat(getComputedStyle(box).getPropertyValue('--pad')) || 0; }
function setCapPos(capId, box, left, top) {
  var br0 = box.getBoundingClientRect(), pd = padPx(box);
  var r = {left: br0.left + box.clientLeft + pd, top: br0.top + box.clientTop + pd, width: box.clientWidth - 2 * pd, height: box.clientHeight - 2 * pd};
  var cap = box.querySelector('.cap'), cw = cap ? cap.offsetWidth : 120, ch = cap ? cap.offsetHeight : 34;
  var x = Math.max(0, Math.min(r.width - cw, left - r.left)), y = Math.max(0, Math.min(r.height - ch, top - r.top));
  capPos[capId] = {x: Math.round(x / r.width * 1000) / 10, y: Math.round(y / r.height * 1000) / 10};
}
function nudgeCap(capId, dx, dy) {
  var box = document.querySelector('.box[data-art="' + capBase(capId) + '"]'); if (!box || !placed[capId]) return;
  var cur = capPos[capId] || {x: 0, y: 0}, r = box.getBoundingClientRect();
  setCapPos(capId, box, r.left + (cur.x + dx) / 100 * r.width, r.top + (cur.y + dy) / 100 * r.height);
  renderComic(); save();
  var c = document.querySelector('[data-slot="' + capId + '"]'); if (c) c.focus();
}

/* panel resizing: snaps to the grid, 1 to 6 columns wide and 1 to 3 rows tall */
var rs = null;
function startResize(e, handle) {
  e.preventDefault();
  var n = handle.dataset.resize, box = handle.closest('.box'), grid = box.parentNode;
  var gap = parseFloat(getComputedStyle(grid).columnGap) || 14, cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  var r = box.getBoundingClientRect(), sz = sizes[n];
  rs = {n: n, box: box, left: r.left, top: r.top, gap: gap, cols: cols,
        colW: (r.width + gap) / Math.min(sz.c, cols) - gap, rowH: (r.height + gap) / sz.r - gap};
  box.classList.add('resizing');
}
function moveResize(e) {
  e.preventDefault();
  var c = Math.round((e.clientX - rs.left + rs.gap) / (rs.colW + rs.gap));
  var r = Math.round((e.clientY - rs.top + rs.gap) / (rs.rowH + rs.gap));
  c = Math.max(1, Math.min(rs.cols === 2 ? 2 : 6, c)); r = Math.max(1, Math.min(3, r));
  var sz = sizes[rs.n];
  if (rs.cols === 2) { sz.c = c === 2 ? Math.max(sz.c, 2) : 1; } else sz.c = c;
  sz.r = r;
  rs.box.style.setProperty('--c', sz.c); rs.box.style.setProperty('--r', sz.r); rs.box.style.setProperty('--cm', Math.min(sz.c, 2));
}
function endResize() {
  var n = rs.n; rs.box.classList.remove('resizing'); rs = null;
  suppress = true; setTimeout(function () { suppress = false; }, 0);
  renderComic(); save(); say('Panel ' + n + ' is ' + sizes[n].c + ' wide and ' + sizes[n].r + ' tall.');
}
function keyResize(n, dc, dr) {
  var sz = sizes[n]; sz.c = Math.max(1, Math.min(6, sz.c + dc)); sz.r = Math.max(1, Math.min(3, sz.r + dr));
  renderComic(); save();
  var h = document.querySelector('[data-resize="' + n + '"]'); if (h) h.focus();
  say('Panel ' + n + ' is ' + sz.c + ' wide and ' + sz.r + ' tall.');
}

/* ---------- tap / keyboard ---------- */
document.addEventListener('click', function (e) {
  if (suppress) { suppress = false; return; }
  if (ux.mode !== 'build') return;
  if (anyModal()) return;
  if (e.target.closest('[data-fmt-done]')) { selected = null; render(); say('Done.'); return; }
  if (e.target.closest('[data-dup]')) { duplicateSelected(); return; }
  var smb = e.target.closest('[data-sel-many]'); if (smb) { startMulti(smb.dataset.selMany || slotOf(selected)); return; }
  if (e.target.closest('[data-sel-done]')) { endMulti(); say('Done.'); return; }
  if (e.target.closest('[data-sel-all]')) {
    var anyId = multi[0] && slotOf(multi[0]); if (anyId) { var base9 = capBase(anyId); multi = capsUsed(base9).map(function (k) { return placed[k]; }); multiMode = true; render(); groupBar(); say(multi.length + ' pieces picked.'); }
    return;
  }
  if (e.target.closest('#groupBar')) return;
  var rmb = e.target.closest('[data-rm-piece]'); if (rmb) { if (multi.length > 1 && multi.indexOf(rmb.dataset.rmPiece) >= 0) multi.slice().forEach(removePiece); else removePiece(rmb.dataset.rmPiece); return; }
  if (e.target.closest('#fmtBar') && !e.target.closest('[data-qalign], [data-qreset], [data-qtry], [data-qcolor-btn], [data-sel-many]')) return;
  var pa = e.target.closest('[data-pact]');
  if (pa) {
    var pkey = pa.closest('[data-pbar]').dataset.pbar, act = pa.dataset.pact, pid = placed[pkey];
    if (act === 'fit') { delete picFit[pkey]; delete picPos[pkey]; say('The picture fits inside its box.'); }
    else if (act === 'cover') { picFit[pkey] = 'cover'; say('The picture covers its whole box. Tap Move picture to choose what shows.'); }
    else if (act === 'pan') { panKey = pkey; say('Drag the picture to choose which part shows. Tap Done when you finish.'); }
    else if (act === 'done') { panKey = null; say('Picture position saved.'); }
    else if (act === 'float') {
      var fc = freeCap(pkey, pid); if (!fc) { toast(fullMsg(pkey)); return; }
      delete placed[pkey]; placed[fc] = pid; capPos[fc] = {x: 2, y: 2}; picFocus = null; selected = pid; selectedFrom = 'page'; panKey = null;
      render(); say('The picture is now a piece you can drag and snap. Use Width to size it.'); return;
    }
    else if (act === 'bg') {
      var area = areaOfSlot(pkey); bgs[area] = bgs[area] || {}; bgs[area].img = pid; bgs[area].fit = 'cover';
      delete placed[pkey]; delete picFit[pkey]; delete picPos[pkey]; picFocus = null; selected = null; panKey = null;
      render(); say('That picture is now the background of this box. To change it, use the box\u2019s Resize.'); return;
    }
    picFocus = pkey; selected = null; render();
    var again2 = document.querySelector('[data-pbar="' + pkey + '"] [data-pact="' + (act === 'pan' ? 'done' : act === 'done' ? 'pan' : act) + '"]'); if (again2) again2.focus();
    return;
  }
  if (panKey && !e.target.closest('[data-slot="' + panKey + '"]')) { panKey = null; }
  if (picFocus && !e.target.closest('[data-slot="' + picFocus + '"]')) { picFocus = null; if (!e.target.closest('.slot, .piece')) renderComic(); }
  if (e.target.closest('#addPanel')) { addPanel(); return; }
  var dx = e.target.closest('[data-del-img]');
  if (dx) {
    var id = dx.dataset.delImg, pc = piece(id);
    if (!ask('Delete this drawing? ' + ((pc.id.indexOf('add-') === 0 || pc.id.indexOf('ph-') === 0) ? 'You can add it again later.' : 'You can bring it back later.'), 'Delete', function () { dx.click(); })) return;
    var at = slotOf(id); if (at) delete placed[at];
    if ((id.indexOf('add-') === 0 || id.indexOf('ph-') === 0)) extra = extra.filter(function (c) { return c.id !== id; }); else hidden.push(id);
    if (selected === id) selected = null;
    render(); say('Drawing deleted.'); var a = document.getElementById('addBtn'); if (a) a.focus(); return;
  }
  var np = e.target.closest('[data-new-ph]');
  if (np) {
    var kindPh = np.dataset.newPh, count = extra.filter(function (c) { return c.ph === kindPh; }).length + 1;
    var svg = kindPh === 'video'
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#EEF0F4" stroke="#8A8A93" stroke-width="4" stroke-dasharray="12 8"/><circle cx="160" cy="92" r="40" fill="#fff" stroke="#6B7280" stroke-width="5"/><path d="M148 72 L180 92 L148 112 Z" fill="#6B7280"/><text x="160" y="170" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#6B7280">VIDEO</text></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#EEF0F4" stroke="#8A8A93" stroke-width="4" stroke-dasharray="12 8"/><path d="M0 0 L320 200 M320 0 L0 200" stroke="#C4C8D0" stroke-width="3"/><rect x="110" y="78" width="100" height="44" rx="8" fill="#fff" stroke="#6B7280" stroke-width="3"/><text x="160" y="108" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#6B7280">IMAGE</text></svg>';
    var nid = 'ph-' + kindPh + '-' + Date.now();
    extra.push({id: nid, alt: (kindPh === 'video' ? 'Video placeholder ' : 'Image placeholder ') + count, src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), file: kindPh === 'video' ? 'video.mp4' : 'image-goes-here.jpg', ph: kindPh});
    selected = nid; selectedFrom = 'tray'; render(); say((kindPh === 'video' ? 'Video' : 'Image') + ' placeholder made. Drag it into a box, or tap a box to place it.'); return;
  }
  var dw = e.target.closest('[data-del-word]');
  if (dw) {
    var wid = dw.dataset.delWord, wp = piece(wid), on = slotOf(wid);
    if (on && !ask('Delete ' + wp.alt + '? It will also come off your page.', 'Delete', function () { dw.click(); })) return;
    if (on) delete placed[on];
    words = words.filter(function (x) { return x.id !== wid; }); if (selected === wid) selected = null;
    render(); say(wp.alt + ' deleted.');
    var nx = document.querySelector('#trayWords [data-del-word]') || document.getElementById('wordInput'); if (nx) nx.focus();
    return;
  }
  if (e.target.id === 'restoreImgs') { hidden = []; render(); say('Your drawings are back.'); return; }
  var ma = e.target.closest('[data-malign]');
  if (ma) {
    var ms2 = ma.closest('[data-mbar]').dataset.mbar, ce = document.querySelector('[data-slot="' + ms2 + '"]'), bx2 = ce && ce.closest('.box');
    if (ce && bx2) {
      var W2 = bx2.clientWidth - 2 * padPx(bx2), wp2 = ce.offsetWidth / W2 * 100, cur2 = capPos[ms2] || domPos(ms2, bx2) || {x: 0, y: 2};
      var nx2 = ma.dataset.malign === 'left' ? 6 / W2 * 100 : ma.dataset.malign === 'right' ? 100 - wp2 - 6 / W2 * 100 : (100 - wp2) / 2;
      capPos[ms2] = {x: Math.round(Math.max(0, nx2) * 10) / 10, y: cur2.y}; render(); say('Lined up with the ' + ma.dataset.malign + ' of the box.');
    }
    return;
  }
  var mf = e.target.closest('[data-mfill]');
  if (mf) {
    var cs3 = mf.dataset.mfill, pid3 = placed[cs3], art3 = capBase(cs3);
    if (/^p\d+$/.test(art3) && cardsOf(+art3.slice(1))) { toast('This panel holds cards. Drop the picture into a card to fill it.'); return; }
    var old3 = placed[art3]; placed[art3] = pid3; if (old3) placed[cs3] = old3; else { delete placed[cs3]; delete capPos[cs3]; }
    selected = null; picFocus = art3; render(); say('The picture fills the box now.'); return;
  }
  if (e.target.closest('[data-mdone]')) { selected = null; render(); say('Done.'); return; }
  var mwb = e.target.closest('[data-mw]');
  if (mwb) { var mk = mwb.closest('[data-mbar]').dataset.mbar; mediaW[mk] = +mwb.dataset.mw; if (mediaW[mk] === 50) delete mediaW[mk]; render(); say('Width: ' + mwb.textContent + '.'); return; }
  if (e.target.closest('.mbar')) return;   /* clicks inside the width bar (like its Poster menu) keep it open */
  var qcb = e.target.closest('[data-qcolor-btn]'); if (qcb) { var wc = selWord(); if (wc) openPicker(qcb, wc.color || '', function (c) { wc.color = c; render(); say('Color: ' + cssColor(c) + '.'); }); return; }
  if (e.target.closest('[data-qtry]')) { var wq = selWord(); if (wq && wq.go) tryJump(wq.go); return; }
  if (e.target.closest('[data-qreset]')) { var wr = selWord(); if (wr) { wr.font = ''; wr.color = ''; wr.size = ''; wr.lh = ''; wr.gap = ''; render(); say('Back to the page font and color.'); } return; }
  if (e.target.closest('.qalign') && !e.target.closest('[data-qalign]')) return;   /* the font menu and color picker handle themselves */
  var qa = e.target.closest('[data-qalign]');
  if (qa) { var w = selWord(); if (w) { w.align = qa.dataset.qalign; render(); say('Words lined up ' + w.align + '.'); var nb = document.querySelector('[data-qalign="' + w.align + '"]'); if (nb) nb.focus(); } return; }
  var rp = e.target.closest('[data-remove-panel]'); if (rp) { removePanel(rp.dataset.removePanel); return; }
  var sa = e.target.closest('[data-area-size]'); if (sa) { sizeArea = sa.dataset.areaSize; sizeCard = null; sizeN = null; fillSize(); openModal('sizeModal'); return; }
  var sc2 = e.target.closest('[data-card-size]'); if (sc2) { sizeCard = sc2.dataset.cardSize; sizeN = null; fillSize(); openModal('sizeModal'); return; }
  var so = e.target.closest('.size-btn'); if (so) { sizeN = so.dataset.sizeOpen; fillSize(); openModal('sizeModal'); return; }
  var t = e.target;
  if (t.closest('.resize')) return;
  if (t.dataset && t.dataset.del) { var sl = slotOf(t.dataset.del); if (sl) delete placed[sl]; words = words.filter(function (x) { return x.id !== t.dataset.del; }); render(); say('Words deleted.'); return; }
  var b = t.closest('.piece'), slot = t.closest('.slot'), tray = t.closest('.tray');
  if (b && slot && e.shiftKey && slot.classList.contains('cap') && placed[slot.dataset.slot] === b.dataset.id) {
    var mb2 = capBase(slot.dataset.slot), id2 = b.dataset.id;
    if (multi.length && capBase(slotOf(multi[0])) !== mb2) multi = [];
    if (selected && !multi.length && slotOf(selected) && capBase(slotOf(selected)) === mb2 && selected !== id2) multi.push(selected);
    var at2 = multi.indexOf(id2); if (at2 >= 0) multi.splice(at2, 1); else multi.push(id2);
    selected = null; selectedFrom = 'page'; render();
    say(multi.length + (multi.length === 1 ? ' piece' : ' pieces') + ' picked. Drag one to move them all together. Shift-click a piece again to drop it from the group.'); return;
  }
  if (multi.length && !e.shiftKey && !multiMode) multi = [];
  var bothOnPage = b && slot && selected && slotOf(selected) && placed[slot.dataset.slot] === b.dataset.id;
  if (b && (!slot || !selected || selected === b.dataset.id || bothOnPage)) {
    if (bothOnPage && selected !== b.dataset.id && piece(selected).type !== piece(b.dataset.id).type) { selected = null; picFocus = null; render(); say('Done.'); return; }
    if (bothOnPage && selected !== b.dataset.id) { selected = b.dataset.id; selectedFrom = 'page'; picFocus = null; say(piece(selected).alt + ' selected.'); if (piece(selected).type === 'txt') showTab('words'); render(); return; }
    selected = selected === b.dataset.id ? null : b.dataset.id; selectedFrom = b.closest('.tray') ? 'tray' : 'page';
    if (selected) { say(piece(selected).alt + ' picked up. Choose a box, or change it in Words.'); if (piece(selected).type === 'txt') showTab('words'); }
    render(); return;
  }
  var tv = slot && placed[slot.dataset.slot] && piece(placed[slot.dataset.slot]);
  if (tv && tv.ph === 'video' && selected && selectedFrom === 'tray' && piece(selected).type === 'img' && !piece(selected).ph) { var pid2 = selected; selected = null; setPoster(tv.id, pid2); return; }
  if (slot && selected && selectedFrom === 'page') { selected = null; picFocus = null; render(); say('Done.'); return; }
  if (slot && selected) {
    var target = slot.dataset.slot, bx = slot.closest('.box[data-art]');
    if (floats(piece(selected)) && bx && (slot.classList.contains('art') || slot.classList.contains('cap'))) {
      target = freeCap(bx.dataset.art, selected);
      if (!target) { toast(fullMsg(bx.dataset.art)); return; }
      if (!capPos[target] && target !== bx.dataset.art + 'Cap') capPos[target] = {x: 2, y: Math.min(82, 4 + 22 * (capIds(bx.dataset.art).indexOf(target)))};
    }
    var ok = place(selected, target); if (ok) { selected = null; render(); } return;
  }
  if (tray && selected && !t.closest('.add-tile')) { unplace(selected); selected = null; render(); return; }
  if ((multi.length || multiMode) && !t.closest('.cap, .side, .modal, #fmtBar, .mbar, #groupBar')) { multi = []; multiMode = false; groupBar(); }
  if (selected && !t.closest('.side, .modal, .ide, .qalign, .pbar, .mbar, #fmtBar, button, select, input, textarea, label')) { selected = null; render(); }
});
document.addEventListener('keydown', function (e) {
  if (e.target.classList && e.target.classList.contains('slot') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
  if (e.target.id === 'addBtn' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById('file').click(); }
  if (e.target.id === 'wordInput' && e.key === 'Enter') { e.preventDefault(); if (selWord()) document.getElementById('doneWord').click(); else makeWord('p'); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !anyModal() && !/^(input|textarea|select)$/i.test((e.target.tagName || '')) && !e.target.isContentEditable && ux.mode === 'build') {
    var dels = multi.length ? multi.slice() : (selected && slotOf(selected) ? [selected] : []);
    if (dels.length) { e.preventDefault(); dels.forEach(removePiece); return; }
  }
  if (e.key === 'Escape' && (multi.length || multiMode) && !anyModal()) { endMulti(); return; }
  if (e.key === 'Escape' && anyModal()) { closeModal(document.querySelector('.modal.open').id); return; }
  if (panKey && (e.key === 'Escape' || e.key === 'Enter')) { panKey = null; render(); return; }
  var pk2 = {ArrowLeft:[-5,0], ArrowRight:[5,0], ArrowUp:[0,-5], ArrowDown:[0,5]}[e.key];
  if (panKey && pk2) { e.preventDefault(); var c0 = picPos[panKey] || {x: 50, y: 50}; picPos[panKey] = {x: Math.max(0, Math.min(100, c0.x + pk2[0])), y: Math.max(0, Math.min(100, c0.y + pk2[1]))}; renderComic(); renderCode(); save(); return; }
  if (e.key === 'Escape' && selected) { selected = null; render(); }
  var arrows = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[e.key];
  if (arrows && e.target.dataset && e.target.dataset.resize) { e.preventDefault(); keyResize(e.target.dataset.resize, arrows[0], arrows[1]); }
  else if (arrows && e.target.classList && e.target.classList.contains('cap')) { e.preventDefault(); nudgeCap(e.target.dataset.slot, arrows[0] * 5, arrows[1] * 5); }
});

document.addEventListener('input', function (e) {
  var id = e.target.dataset && e.target.dataset.word; if (!id) return;
  var w = words.find(function (x) { return x.id === id; }); if (!w) return;
  w.text = e.target.value;
  renderComic(); renderCode(); save();
});
document.addEventListener('change', function (e) {
  var id = e.target.dataset && e.target.dataset.word; if (!id) return;
  var w = words.find(function (x) { return x.id === id; });
  if (w && !w.text.trim()) { w.text = 'Words'; e.target.value = w.text; renderComic(); renderCode(); save(); }
});

document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.dataset && t.dataset.sizeW) { sizes[t.dataset.sizeW].c = +t.value; renderComic(); renderCode(); save(); say('Panel ' + t.dataset.sizeW + ' width is ' + widthLabel(+t.value) + '.'); focusSel('[data-size-w="' + t.dataset.sizeW + '"]'); }
  if (t.dataset && t.dataset.sizeH) { sizes[t.dataset.sizeH].r = +t.value; renderComic(); renderCode(); save(); focusSel('[data-size-h="' + t.dataset.sizeH + '"]'); }
});
function focusSel(q) { var x = document.querySelector(q); if (x) x.focus(); }
var notSel = document.getElementById('notation'); notSel.value = notation;
notSel.addEventListener('change', function () { notation = this.value; renderComic(); renderCode(); save(); if (sizeN) fillSize(); });

function addPanel() {
  if (panelCount >= MAX_PANELS) return;
  panelCount++; sizes[panelCount] = {c:6, r:6}; delete placed['p' + panelCount]; capIds('p' + panelCount).forEach(function (id) { delete placed[id]; delete capPos[id]; });
  render(); say('Panel ' + panelCount + ' added.');
  var b = document.querySelector('[data-size-open="' + panelCount + '"]'); if (b) { b.scrollIntoView({block:'nearest', behavior:'smooth'}); b.focus(); }
}
function removePanel(n) {
  n = +n; if (panelCount <= 1) { say('Your comic needs at least one panel.'); return; }
  var has = panelSufs().some(function (suf) { return placed['p' + n + suf]; });
  if (has && !ask('Remove panel ' + n + '? Its drawing and words go back to your trays.', 'Remove', function () { removePanel(n); })) return;
  for (var i = n; i < panelCount; i++) {
    var j = i + 1;
    var SUF = panelSufs();
    SUF.forEach(function (suf) {
      if (placed['p' + j + suf]) placed['p' + i + suf] = placed['p' + j + suf]; else delete placed['p' + i + suf];
      if (capPos['p' + j + suf]) capPos['p' + i + suf] = capPos['p' + j + suf]; else delete capPos['p' + i + suf];
      if (bgs['p' + j + suf]) bgs['p' + i + suf] = bgs['p' + j + suf]; else delete bgs['p' + i + suf];
      if (cardSizes['p' + j + suf]) cardSizes['p' + i + suf] = cardSizes['p' + j + suf]; else delete cardSizes['p' + i + suf];
      if (cardRows['p' + j + suf]) cardRows['p' + i + suf] = cardRows['p' + j + suf]; else delete cardRows['p' + i + suf];
      if (picFit['p' + j + suf]) picFit['p' + i + suf] = picFit['p' + j + suf]; else delete picFit['p' + i + suf];
      if (picPos['p' + j + suf]) picPos['p' + i + suf] = picPos['p' + j + suf]; else delete picPos['p' + i + suf];
      if (boxPad['p' + j + suf] !== undefined) boxPad['p' + i + suf] = boxPad['p' + j + suf]; else delete boxPad['p' + i + suf];
    });
    if (splits[j]) splits[i] = splits[j]; else delete splits[i];
    sizes[i] = sizes[j];
    classNames['p' + i] = classNames['p' + j] === 'panel-' + j ? 'panel-' + i : classNames['p' + j];
  }
  panelSufs().forEach(function (suf) { delete cardSizes['p' + panelCount + suf]; delete cardRows['p' + panelCount + suf]; delete placed['p' + panelCount + suf]; delete capPos['p' + panelCount + suf]; delete bgs['p' + panelCount + suf]; });
  delete splits[panelCount];
  delete sizes[panelCount]; classNames['p' + panelCount] = 'panel-' + panelCount;
  panelCount--; render(); say('Panel ' + n + ' removed.');
}
var sizeN = null, sizeCard = null, sizeArea = null, lastFocus = null;
function openModal(id) { lastFocus = document.activeElement; var m = document.getElementById(id); m.classList.add('open'); var f = m.querySelector('[aria-pressed="true"], input, button'); if (f) f.focus(); }
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'sizeModal' && padShow) { var was = padShow; setTimeout(function () { if (padShow === was) { padShow = null; renderComic(); } }, 1500); }
  if (id === 'sizeModal' && sizeArea) { var abt = document.querySelector('[data-area-size="' + sizeArea + '"]'); sizeArea = null; if (abt) { abt.focus(); return; } }
  if (id === 'sizeModal' && sizeCard) { var cbt = document.querySelector('[data-card-size="' + sizeCard + '"]'); sizeCard = null; sizeN = null; if (cbt) { cbt.focus(); return; } }
  if (id === 'sizeModal' && sizeN) { var b = document.querySelector('[data-size-open="' + sizeN + '"]'); sizeN = null; if (b) { b.focus(); return; } }
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
/* every pop-up box gets a close button that stays in its top corner */
document.querySelectorAll('.modal').forEach(function (m) {
  var box = m.querySelector('.modal-box'); if (!box || box.querySelector('.modal-x')) return;
  var x = el('button', 'modal-x', '\u2715'); x.setAttribute('aria-label', 'Close'); x.title = 'Close';
  x.addEventListener('click', function (e) { e.stopPropagation(); closeModal(m.id); });
  box.insertBefore(x, box.firstChild);
});
document.getElementById('fullBtn').addEventListener('click', function () {
  var done = function () { toast('If nothing opened, use the \u2197 button at the top right of the CodeHS output to open this page in its own tab.'); };
  var d = document.documentElement;
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  try {
    if (d.requestFullscreen) { d.requestFullscreen().catch(function () { var w = window.open(location.href, '_blank'); if (!w) done(); }); return; }
  } catch (er) {}
  var w2 = null; try { w2 = window.open(location.href, '_blank'); } catch (er2) {} if (!w2) done();
});
document.addEventListener('fullscreenchange', function () { document.getElementById('fullBtn').innerHTML = document.fullscreenElement ? '&#x2923; Exit full screen' : '&#x2922; Full screen'; });
function anyModal() { return !!document.querySelector('.modal.open'); }
function fillSplit() {
  document.querySelectorAll('.nest-only').forEach(function (e) { e.hidden = !NEST_ON; });
  if (!NEST_ON) return;
  var cc = document.getElementById('cChoices'); cc.innerHTML = ''; var cur = cardsOf(+sizeN) || 1;
  var o = el('div', 'opts');
  [[1, 'None'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']].forEach(function (x) { var b = el('button', 'choice', x[1]); b.dataset.split = x[0]; b.setAttribute('aria-pressed', x[0] === cur); o.appendChild(b); });
  cc.appendChild(o);
}
function moveCaps(fromBase, toBase) {
  capIds(fromBase).forEach(function (id, i) { var to = capIds(toBase)[i]; if (placed[id]) { placed[to] = placed[id]; if (capPos[id]) capPos[to] = capPos[id]; } else { delete placed[to]; delete capPos[to]; } delete placed[id]; delete capPos[id]; });
}
function removeCard(key) {
  var m = /^p(\d+)c(\d)$/.exec(key), n = +m[1], k = +m[2], cnt = cardsOf(n);
  if ((placed[key] || capsUsed(key).length) && !ask('Remove this card? Its picture and words go back to your trays.', 'Remove', function () { removeCard(key); })) return;
  delete placed[key]; capIds(key).forEach(function (id) { delete placed[id]; delete capPos[id]; });
  for (var i = k; i < cnt; i++) {
    var a = 'p' + n + 'c' + i, b = 'p' + n + 'c' + (i + 1);
    capIds('').forEach(function (cs) { [placed, capPos].forEach(function (o) { if (o[b + cs]) o[a + cs] = o[b + cs]; else delete o[a + cs]; }); });
    [['', placed], ['', bgs], ['', cardSizes], ['', cardRows], ['', picFit], ['', picPos], ['', boxPad]].forEach(function (x) { var o = x[1]; if (o[b + x[0]]) o[a + x[0]] = o[b + x[0]]; else delete o[a + x[0]]; });
  }
  var last = 'p' + n + 'c' + cnt; delete placed[last]; capIds(last).forEach(function (id) { delete placed[id]; delete capPos[id]; }); delete bgs[last]; delete cardSizes[last]; delete cardRows[last];
  if (cnt - 1 < 2) {
    if (placed['p' + n + 'c1']) { placed['p' + n] = placed['p' + n + 'c1']; delete placed['p' + n + 'c1']; }
    moveCaps('p' + n + 'c1', 'p' + n);
    delete placed['p' + n + 'Head']; delete splits[n]; delete cardSizes['p' + n + 'c1']; delete cardRows['p' + n + 'c1'];
  } else splits[n] = cnt - 1;
  render(); say('Card removed.');
}
function setCards(n, k) {
  n = +n; k = +k; var cur = cardsOf(n) || 1; if (k === cur) return;
  var lost = [];
  if (k === 1) { if (placed['p' + n + 'Head']) lost.push('p' + n + 'Head'); for (var a = 2; a <= cur; a++) [''].concat(capIds('')).forEach(function (s) { if (placed['p' + n + 'c' + a + s]) lost.push('p' + n + 'c' + a + s); }); }
  else for (var b = k + 1; b <= cur; b++) [''].concat(capIds('')).forEach(function (s) { if (placed['p' + n + 'c' + b + s]) lost.push('p' + n + 'c' + b + s); });
  if (lost.length && !ask('Some cards have pictures or words. They will go back to your trays. Keep going?', 'Keep going', function () { setCards(n, k); if (document.getElementById('sizeModal').classList.contains('open')) fillSplit(); })) return false;
  lost.forEach(function (key) { delete placed[key]; delete capPos[key]; });
  for (var z = (k === 1 ? 1 : k + 1); z <= 6; z++) { delete cardSizes['p' + n + 'c' + z]; delete cardRows['p' + n + 'c' + z]; }
  if (cur === 1 && k > 1) {      /* split: the panel's picture and words move into card 1 */
    if (placed['p' + n]) { placed['p' + n + 'c1'] = placed['p' + n]; delete placed['p' + n]; }
    moveCaps('p' + n, 'p' + n + 'c1');
  }
  if (k === 1) {                 /* join: card 1 becomes the whole panel again */
    if (placed['p' + n + 'c1']) { placed['p' + n] = placed['p' + n + 'c1']; delete placed['p' + n + 'c1']; }
    moveCaps('p' + n + 'c1', 'p' + n);
    delete splits[n];
  } else splits[n] = k;
  render(); say(k === 1 ? 'Panel ' + n + ' is one box again.' : 'Panel ' + n + ' now holds ' + k + ' cards.');
  return true;
}
/* picture fit + background for the panel or card in the Resize box */
function boxKey() { return sizeArea || sizeCard || ('p' + sizeN); }
function artKeyOf(key) { return key === 'section' ? 'cover' : key; }
function fillPad() {
  var key = boxKey(), wrap = document.getElementById('padChoices'), cur = padOf(key); wrap.innerHTML = '';
  var o = el('div', 'opts'); o.style.flexWrap = 'wrap';
  PADS.forEach(function (x) { var b = el('button', 'choice', x[1]); b.dataset.pad = x[0]; b.title = x[0] + ' pixels'; b.setAttribute('aria-pressed', cur === x[0]); o.appendChild(b); });
  wrap.appendChild(o);
  wrap.appendChild(el('p', 'help', 'Padding is the space between the edge of a box and what\u2019s inside it. It shows in green on your page.' + (cur === null ? ' Right now it uses the starting amount.' : ' Now: ' + cur + ' pixels.')));
}
function fillBoxStyle() {
  var key = boxKey(), wrap = document.getElementById('boxStyle'); wrap.innerHTML = '';
  var ak = artKeyOf(key), hasArt = key !== 'header' && key !== 'footer' && !(/^p\d+$/.test(key) && cardsOf(+key.slice(1))), pic = hasArt && placed[ak] && piece(placed[ak]);
  if (pic) {
    var r1 = el('div', 'kind-row'); r1.appendChild(document.createTextNode('Picture fit'));
    var o1 = el('div', 'opts'); o1.style.flex = '1';
    [['contain', 'Fit inside'], ['cover', 'Cover the whole box']].forEach(function (x) { var b = el('button', 'choice', x[1]); b.dataset.pfit = x[0]; b.setAttribute('aria-pressed', (picFit[ak] || 'contain') === x[0]); o1.appendChild(b); });
    r1.appendChild(o1); wrap.appendChild(r1);
  } else if (hasArt) wrap.appendChild(el('p', 'help', 'Drop a picture in this box to choose how it fits. Or set a background below.'));
  var b = bgs[key] || {};
  var r2 = el('div', 'kind-row'); r2.appendChild(document.createTextNode('Background color'));
  var sw = el('span', 'swatches'); r2.appendChild(sw); wrap.appendChild(r2);
  buildSwatches(sw, function (c) { bgs[key] = bgs[key] || {}; bgs[key].color = c; markSwatches(sw, c); renderComic(); renderCode(); save(); }, 'No background color');
  markSwatches(sw, b.color);
  if (!(b.img && piece(b.img))) { var upb = el('button', 'btn quiet', 'Upload a background picture\u2026'); upb.dataset.bgUpload = key; upb.style.alignSelf = 'flex-start'; wrap.appendChild(upb); }
  if (!(b.img && piece(b.img))) { wrap.appendChild(el('p', 'help', key === 'header' || key === 'footer' ? 'To put a picture behind this area, use Page style \u2192 Backgrounds and choose ' + AREA_NAME[key] + '.' : 'To use a picture as the background, drop it in the box, tap it, and choose Background.')); return; }
  var r3 = el('div', 'kind-row'); r3.appendChild(document.createTextNode('Background picture: ' + piece(b.img).alt));
  r3.style.flexWrap = 'wrap';
  var rmv = el('button', 'btn quiet', 'Remove'); rmv.dataset.bgRemove = '1'; rmv.style.padding = '4px 12px'; r3.appendChild(rmv); wrap.appendChild(r3);
  {
    var r4 = el('label', 'kind-row'); r4.appendChild(document.createTextNode('Background fit'));
    var fs = el('select'); fs.dataset.boxBgFit = '1';
    [['cover', 'cover the whole box'], ['contain', 'fit inside'], ['repeat', 'repeat like tiles']].forEach(function (x) { var op = el('option', '', x[1]); op.value = x[0]; fs.appendChild(op); });
    fs.value = b.fit || 'cover'; r4.appendChild(fs); wrap.appendChild(r4);
  }
}
document.getElementById('boxStyle').addEventListener('click', function (e) {
  var ub = e.target.closest('[data-bg-upload]'); if (ub) { pendingBg = ub.dataset.bgUpload; pendingAt = Date.now(); closeModal('sizeModal'); showTab('draw'); toast('Choose a picture. It will become the background of ' + (AREA_NAME[pendingBg] || nodeName(pendingBg)).toLowerCase() + '.'); document.getElementById('file').click(); return; }
  if (!e.target.closest('[data-bg-remove]')) return; var key = boxKey(); if (bgs[key]) { delete bgs[key].img; delete bgs[key].fit; }
  fillBoxStyle(); renderComic(); renderCode(); save(); say('Background picture removed. It\u2019s still in your drawings.');
});
document.getElementById('boxStyle').addEventListener('change', function (e) {
  var key = boxKey(), t = e.target; bgs[key] = bgs[key] || {};
  if (t.dataset.boxBgImg !== undefined) { bgs[key].img = t.value; if (t.value && !bgs[key].fit) bgs[key].fit = 'cover'; say(t.value ? 'Background picture added.' : 'Background picture removed.'); fillBoxStyle(); }
  else if (t.dataset.boxBgFit !== undefined) bgs[key].fit = t.value;
  renderComic(); renderCode(); save();
});
function fillSize() {
  var areaMode = !!sizeArea;
  ['wHead', 'wChoices', 'removePanel'].forEach(function (id) { document.getElementById(id).hidden = areaMode; });
  document.querySelector('#sizeModal .preview-bar').hidden = areaMode;
  if (areaMode) {
    fillBoxStyle(); fillPad(); padShow = sizeArea; renderComic();
    document.querySelectorAll('.nest-only').forEach(function (e) { e.hidden = true; });
    document.getElementById('sizeTitle').textContent = AREA_NAME[sizeArea] + ' size';
    document.getElementById('hHead').textContent = 'Height';
    var hc0 = document.getElementById('hChoices'); hc0.innerHTML = '';
    var row0 = el('div', 'opts'); row0.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    [[0, 'Automatic']].concat(AREA_H).forEach(function (x) { var b = el('button', 'choice', x[1] + (x[0] ? ' (' + x[0] + 'px)' : '')); b.dataset.ah = x[0]; b.setAttribute('aria-pressed', (areaH[sizeArea] || 0) === x[0]); b.style.flex = '1 1 30%'; row0.appendChild(b); });
    hc0.appendChild(row0);
    return;
  }
  fillBoxStyle(); fillPad(); padShow = boxKey(); renderComic();
  var cardMode = !!sizeCard, cm2 = cardMode && /^p(\d+)c(\d)$/.exec(sizeCard);
  document.getElementById('hHead').textContent = cardMode ? 'Height inside the panel' : 'Height';
  document.getElementById('removePanel').textContent = cardMode ? 'Remove this card' : 'Remove this panel';
  document.getElementById('wHead').textContent = cardMode ? 'Width inside the panel' : 'Width';
  if (cardMode) document.querySelectorAll('.nest-only').forEach(function (e) { e.hidden = true; }); else fillSplit();
  var sz = cardMode ? {c: cardW(sizeCard), r: 6} : sizes[sizeN];
  document.getElementById('sizeTitle').textContent = cardMode ? 'Panel ' + cm2[1] + ', card ' + cm2[2] : 'Panel ' + sizeN + ' size';
  document.getElementById('wBar').style.width = (sz.c / 12 * 100) + '%';
  var wc = document.getElementById('wChoices'); wc.innerHTML = '';
  WGROUPS.forEach(function (g) {
    var row = el('div', 'cgroup'); row.appendChild(el('span', '', g[0])); var o = el('div', 'opts');
    g[1].forEach(function (c) { var b = el('button', 'choice', widthLabel(c)); b.dataset.w = c; b.setAttribute('aria-pressed', c === sz.c); b.setAttribute('aria-label', g[0] + ': ' + widthLabel(c)); o.appendChild(b); });
    row.appendChild(o); wc.appendChild(row);
  });
  var hc = document.getElementById('hChoices'); hc.innerHTML = '';
  if (cardMode) {
    var pn = +cm2[1], ro = rowOf(pn, sizeCard), share = rowShare(ro.row);
    var crow = el('div', 'cgroup'); crow.appendChild(el('span', '', 'This row')); var co = el('div', 'opts');
    [1, 2, 3].forEach(function (u) { var b = el('button', 'choice', SHARE_NAME[u]); b.dataset.ch = u; b.setAttribute('aria-pressed', u === share); b.disabled = ro.count === 1; co.appendChild(b); });
    crow.appendChild(co); hc.appendChild(crow);
    var others = ro.row.filter(function (k) { return k !== sizeCard; }).map(function (k) { return 'card ' + k.split('c')[1]; });
    var msg = ro.count === 1 ? 'This is the only row of cards, so it already fills the whole panel. To make it taller, close this box and use the panel\u2019s Resize.'
      : 'Card ' + cm2[2] + ' is in row ' + (ro.i + 1) + ' of ' + ro.count + '. ' + (others.length ? 'Cards side by side share a row, so ' + others.join(' and ') + ' will change too. ' : '') + 'Taller rows get more of the panel\u2019s height.';
    hc.appendChild(el('p', 'help', msg));
    return;
  }
  HGROUPS.forEach(function (g) {
    var row = el('div', 'cgroup'); row.appendChild(el('span', '', g[0])); var o = el('div', 'opts');
    g[1].forEach(function (u) { var b = el('button', 'choice', hLabel(u)); b.dataset.h = u; b.setAttribute('aria-pressed', u === sz.r); o.appendChild(b); });
    row.appendChild(o); hc.appendChild(row);
  });
}
document.getElementById('sizeModal').addEventListener('click', function (e) {
  if (e.target === this || e.target.id === 'sizeDone') { closeModal('sizeModal'); return; }
  if (e.target.id === 'removePanel') { if (sizeCard) { var rc = sizeCard; closeModal('sizeModal'); removeCard(rc); return; } var rn = sizeN; closeModal('sizeModal'); removePanel(rn); return; }
  var b = e.target.closest('.choice'); if (!b || (!sizeN && !sizeCard && !sizeArea)) return;
  if (sizeArea && b.dataset.ah !== undefined) { var hv = +b.dataset.ah; if (hv) areaH[sizeArea] = hv; else delete areaH[sizeArea]; fillSize(); renderComic(); renderCode(); save(); var ah2 = document.querySelector('#sizeModal [data-ah="' + b.dataset.ah + '"]'); if (ah2) ah2.focus(); say(AREA_NAME[sizeArea] + ' height: ' + (hv ? hv + ' pixels.' : 'automatic.')); return; }
  if (b.dataset.pad !== undefined) { var pk2 = boxKey(); boxPad[pk2] = +b.dataset.pad; padShow = pk2; fillPad(); renderComic(); renderCode(); save(); var pb2 = document.querySelector('#padChoices [data-pad="' + b.dataset.pad + '"]'); if (pb2) pb2.focus(); say('Padding: ' + b.dataset.pad + ' pixels.'); return; }
  if (b.dataset.pfit) { var pk = artKeyOf(boxKey()); if (b.dataset.pfit === 'cover') picFit[pk] = 'cover'; else { delete picFit[pk]; delete picPos[pk]; } fillBoxStyle(); renderComic(); renderCode(); save(); var pf = document.querySelector('[data-pfit="' + b.dataset.pfit + '"]'); if (pf) pf.focus(); say(b.dataset.pfit === 'cover' ? 'The picture now covers the whole box.' : 'The picture fits inside the box.'); return; }
  if (sizeCard && b.dataset.ch) {
    var rr = rowOf(+/^p(\d+)/.exec(sizeCard)[1], sizeCard), v = +b.dataset.ch;
    rr.row.forEach(function (k) { if (v === 1) delete cardRows[k]; else cardRows[k] = v; });
    fillSize(); renderComic(); renderCode(); save();
    var ah = document.querySelector('#sizeModal [data-ch="' + b.dataset.ch + '"]'); if (ah) ah.focus();
    say('Row ' + (rr.i + 1) + ' of cards is now ' + SHARE_NAME[v].toLowerCase() + '.'); return;
  }
  if (sizeCard && b.dataset.w) {
    cardSizes[sizeCard] = +b.dataset.w;
    (function (pn) { cardLayout(pn).forEach(function (r) { var sh = rowShare(r); r.forEach(function (k) { if (sh === 1) delete cardRows[k]; else cardRows[k] = sh; }); }); })(+/^p(\d+)/.exec(sizeCard)[1]); fillSize(); renderComic(); renderCode(); save();
    var ag = document.querySelector('#sizeModal [data-w="' + b.dataset.w + '"]'); if (ag) ag.focus();
    say('This card is ' + widthLabel(+b.dataset.w) + ' as wide as its panel.'); return;
  }
  if (b.dataset.split) { setCards(sizeN, b.dataset.split); fillSplit(); var fb = document.querySelector('#cChoices [data-split="' + b.dataset.split + '"]'); if (fb) fb.focus(); return; }
  if (b.dataset.w) sizes[sizeN].c = +b.dataset.w; else sizes[sizeN].r = +b.dataset.h;
  var keep = b.dataset.w ? '[data-w="' + b.dataset.w + '"]' : '[data-h="' + b.dataset.h + '"]';
  fillSize(); renderComic(); renderCode(); save();
  var again = document.querySelector('#sizeModal ' + keep); if (again) again.focus();
  say('Panel ' + sizeN + ' is ' + widthLabel(sizes[sizeN].c) + ' wide and ' + hLabel(sizes[sizeN].r) + ' tall.');
});
function fillNames() {
  var list = document.getElementById('namesList'); list.innerHTML = '';
  classKeys().forEach(function (k) {
    var lab = el('label', '', k[1]); lab.htmlFor = 'cn-' + k[0];
    var inp = el('input'); inp.id = 'cn-' + k[0]; inp.value = cls(k[0]); inp.dataset.cn = k[0]; inp.maxLength = 30; inp.spellcheck = false;
    list.appendChild(lab); list.appendChild(inp);
  });
}
document.getElementById('namesList').addEventListener('input', function (e) {
  var k = e.target.dataset.cn; if (!k) return;
  var v = cleanName(e.target.value); if (v !== e.target.value) e.target.value = v;
  classNames[k] = v || defaultNames()[k]; renderComic(); renderCode(); save();
});
document.getElementById('namesBtn').addEventListener('click', function () { fillNames(); openModal('namesModal'); });
document.getElementById('namesDone').addEventListener('click', function () { closeModal('namesModal'); });
document.getElementById('namesReset').addEventListener('click', function () { classNames = defaultNames(); fillNames(); renderComic(); renderCode(); save(); say('Class names reset.'); });
document.getElementById('namesModal').addEventListener('click', function (e) { if (e.target === this) closeModal('namesModal'); });
var csSel = document.getElementById('codeStyle'); csSel.value = codeStyle;
function syncCodeStyle() { document.getElementById('namesBtn').hidden = codeStyle !== 'div' && !(codeStyle === 'pseudo' && alsoShow === 'div'); document.getElementById('alsoRow').hidden = codeStyle !== 'pseudo'; }
var alsoSel = document.getElementById('alsoShow'); alsoSel.value = alsoShow;
alsoSel.addEventListener('change', function () { alsoShow = this.value; syncCodeStyle(); renderComic(); renderCode(); save(); });
syncCodeStyle();
csSel.addEventListener('change', function () { codeStyle = this.value; syncCodeStyle(); renderComic(); renderCode(); save(); });

/* ---------- tabs, words, tools ---------- */
function showTab(which) {
  var d = which === 'draw';
  document.getElementById('tabDraw').setAttribute('aria-selected', d);
  document.getElementById('tabWords').setAttribute('aria-selected', !d);
  document.getElementById('trayDraw').hidden = !d;
  document.getElementById('wordsPanel').hidden = d;
}
document.getElementById('tabDraw').addEventListener('click', function () { showTab('draw'); });
document.getElementById('tabWords').addEventListener('click', function () { showTab('words'); });
function selWord() { return selected && words.find(function (x) { return x.id === selected; }); }
function updateMaker() {
  var w = selWord(), m = document.querySelector('.maker'), inp = document.getElementById('wordInput');
  m.classList.toggle('editing', !!w);
  document.getElementById('newRow').hidden = !!w;
  document.getElementById('editRow').hidden = !w;
  document.getElementById('wordLabel').textContent = w ? (isList(w.kind) ? 'Change this ' + LIST_NAME[w.kind] : 'Change these words') : 'Write new words';
  if (!w) { inp.hidden = false; document.getElementById('listRow').hidden = true; }
  if (w) {
    var lst = isList(w.kind), la = document.getElementById('listInput');
    inp.hidden = lst; document.getElementById('listRow').hidden = !lst;
    if (lst && document.activeElement !== la) la.value = w.text;
    document.getElementById('listHint').textContent = w.kind === 'nav' ? 'One link per line. To pick its page, add a comma: About, about.html' : 'One item per line.';
    if (!lst && document.activeElement !== inp) inp.value = w.text;
    document.querySelectorAll('[data-align]').forEach(function (b) { b.setAttribute('aria-pressed', (w.align || 'left') === b.dataset.align); });
    document.getElementById('kindSel').value = w.kind;
    document.getElementById('wordStyleRow').hidden = !STYLE_ON;
    if (STYLE_ON) { document.getElementById('sizeSel').value = w.size || ''; document.getElementById('linesSel').value = w.lh || ''; document.getElementById('gapSel').value = w.gap || ''; document.getElementById('startRow').hidden = w.kind !== 'ol'; document.getElementById('startSel').value = olStart(w); document.getElementById('gapRow').hidden = !(w.kind === 'ul' || w.kind === 'ol'); document.getElementById('fontSel').value = w.font || ''; markSwatches(document.getElementById('colorSw'), w.color); }
    var isBL = w.kind === 'a' || w.kind === 'b';
    document.getElementById('goRow').hidden = !isBL; document.getElementById('tryGo').hidden = !(isBL && w.go && w.go !== '@url');
    if (isBL) fillGo(document.getElementById('goSel'), w);
    document.getElementById('urlRow').hidden = !(w.kind === 'a' && (!w.go || w.go === '@url')) && !(w.kind === 'b' && w.go === '@url');
    var ui = document.getElementById('urlInput'); if (document.activeElement !== ui) ui.value = w.url || '';
  } else if (m.dataset.was) inp.value = '';
  m.dataset.was = w ? '1' : '';
}
document.getElementById('wordInput').addEventListener('input', function () {
  var w = selWord(); if (!w) return; delete w.ph;
  w.text = this.value; renderComic(); renderTrays(); renderCode(); save();
});
document.querySelectorAll('[data-align]').forEach(function (b) {
  b.addEventListener('click', function () { var w = selWord(); if (!w) return; w.align = b.dataset.align; render(); say('Words lined up ' + w.align + '.'); });
});
/* ---------- fonts and colors ---------- */
function setPoster(vidId, picId) { var v = extra.find(function (c) { return c.id === vidId; }); if (!v) return; if (picId) v.poster = picId; else delete v.poster; render(); say(picId ? 'Poster set. It shows before the video plays.' : 'Poster removed.'); }
document.addEventListener('change', function (e) {
  if (e.target.dataset && e.target.dataset.poster !== undefined) { setPoster(e.target.dataset.poster, e.target.value); return; }
  var t = e.target, w = selWord(); if (!w || !t.dataset) return;
  if (t.dataset.qfont) { w.font = t.value; render(); say(t.value ? 'Font: ' + fontOf(t.value).n + '.' : 'Back to the page font.'); var nf = document.querySelector('[data-qfont]'); if (nf) nf.focus(); }
  else if (t.dataset.qgo) { w.go = t.value; render(); say(t.value ? (t.value === '@url' ? 'Type the address in the Words tab.' : 'When clicked, it goes to ' + nodeName(t.value) + '.') : 'It doesn\u2019t go anywhere yet.'); if (t.value === '@url') { showTab('words'); document.getElementById('urlInput').focus(); } }
  else if (t.dataset.qstart) { w.start = +t.value; if (w.start === 1) delete w.start; render(); say('Numbers start at ' + t.value + '.'); var nst = document.querySelector('[data-qstart]'); if (nst) nst.focus(); }
  else if (t.dataset.qgap) { w.gap = t.value; render(); say(t.value ? 'Item spacing: ' + gapName(t.value) + '.' : 'Automatic item spacing.'); var ng = document.querySelector('[data-qgap]'); if (ng) ng.focus(); }
  else if (t.dataset.qlines) { w.lh = t.value; render(); say(t.value ? 'Line spacing: ' + lineName(t.value) + '.' : 'Automatic line spacing.'); var nl = document.querySelector('[data-qlines]'); if (nl) nl.focus(); }
  else if (t.dataset.qsize) { w.size = t.value; render(); say(t.value ? 'Size: ' + sizeName(t.value) + '.' : 'Automatic size.'); var nz = document.querySelector('[data-qsize]'); if (nz) nz.focus(); }
  else if (t.dataset.qcolor) { w.color = t.value ? t.value.toUpperCase() : ''; render(); say(t.value ? 'Color: ' + colorName(w.color) + '.' : 'Back to the page color.'); }
});
function fillFonts(sel, firstLabel) {
  sel.innerHTML = '';
  var d0 = el('option', '', firstLabel); d0.value = ''; sel.appendChild(d0);
  FONT_GROUPS.forEach(function (g) {
    var og = el('optgroup'); og.label = g;
    FONTS.forEach(function (f) { if (f.g !== g) return; var o = el('option', '', f.n + ' (' + f.d + ')'); o.value = f.k; o.style.fontFamily = f.s; og.appendChild(o); });
    sel.appendChild(og);
  });
}
/* ---------- color picker: spectrum, hue, eyedropper, and CSS name / HEX / RGB ---------- */
function hexToRgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
function rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }
function hsvToRgb(h, s0, v) { var c = v * s0, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }
/* any stored color as a #hex for the picker */
function toHex(c) { c = String(c || ''); if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); var m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c); if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  for (var h in CSS_NAMES) if (CSS_NAMES[h] === c) return h.toLowerCase(); return '#1a1a1f'; }
var cpState = null;
function openPicker(anchor, current, onPick) {
  closePicker();
  var hex = toHex(current), rgb = hexToRgb(hex), hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  var fmt0 = /^rgb/.test(String(current)) ? 'rgb' : /^#[0-9a-f]{6}$/.test(String(current)) ? 'hex' : 'name';
  var p = el('div', 'cpick'); p.id = 'cpick'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Pick a color');
  p.innerHTML = '<div class="cp-head"><b>Pick a color</b><button class="cp-x" aria-label="Close">\u2715</button></div>' +
    '<div class="cp-sv" tabindex="0" aria-label="Color shade: use arrow keys"><div class="cp-white"></div><div class="cp-black"></div><div class="cp-dot"></div></div>' +
    '<input class="cp-hue" type="range" min="0" max="359" aria-label="Hue">' +
    '<div class="cp-row"><span class="cp-prev"></span><select class="cp-fmt" aria-label="Color format"><option value="name">CSS name</option><option value="hex">HEX</option><option value="rgb">RGB</option></select>' +
    (window.EyeDropper ? '<button class="cp-eye" title="Eyedropper: pick a color from the screen" aria-label="Eyedropper">\uD83D\uDCA7</button>' : '') + '</div>' +
    '<div class="cp-val"></div><div class="cp-btns"><button class="btn quiet cp-cancel">Cancel</button><button class="btn cp-done">Use this color</button></div>';
  document.body.appendChild(p);
  var st = cpState = {h: hsv[0], s: hsv[1], v: hsv[2], fmt: fmt0, name: CSS_NAMES[hex.toUpperCase()] || cssColor(hex.toUpperCase()), onPick: onPick, anchor: anchor};
  var sv = p.querySelector('.cp-sv'), dot = p.querySelector('.cp-dot'), hue = p.querySelector('.cp-hue'), prev = p.querySelector('.cp-prev'), val = p.querySelector('.cp-val'), fmt = p.querySelector('.cp-fmt');
  fmt.value = st.fmt;
  function cur() { var c = hsvToRgb(st.h, st.s, st.v); return {r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), hex: rgbToHex(c[0], c[1], c[2])}; }
  function paint(skipField) {
    var c = cur(); sv.style.background = 'hsl(' + st.h + ',100%,50%)'; dot.style.left = (st.s * 100) + '%'; dot.style.top = ((1 - st.v) * 100) + '%'; hue.value = Math.round(st.h);
    prev.style.background = st.fmt === 'name' ? toHex(st.name) : c.hex;
    if (skipField) return;
    if (st.fmt === 'name') {
      st.name = cssColor(c.hex.toUpperCase());
      val.innerHTML = ''; var sel = el('select', 'cp-names'); sel.setAttribute('aria-label', 'CSS color name'); fillColorNames(sel, 'Choose a name'); sel.value = toHex(st.name).toUpperCase(); val.appendChild(sel);
      val.appendChild(el('small', '', 'Closest CSS color name. CSS knows about 140 of them.'));
      prev.style.background = toHex(st.name);
    } else if (st.fmt === 'hex') { val.innerHTML = '<input class="cp-text" aria-label="HEX code" value="' + c.hex + '">'; }
    else { val.innerHTML = '<input class="cp-text" aria-label="RGB color" value="rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')">'; }
  }
  function setFromHex(h) { var c = hexToRgb(h), v2 = rgbToHsv(c[0], c[1], c[2]); st.h = v2[0]; st.s = v2[1]; st.v = v2[2]; }
  function svAt(e) { var r = sv.getBoundingClientRect(); st.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); st.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); paint(); }
  sv.addEventListener('pointerdown', function (e) { e.preventDefault(); sv.setPointerCapture(e.pointerId); svAt(e); sv.onpointermove = svAt; });
  sv.addEventListener('pointerup', function () { sv.onpointermove = null; });
  sv.addEventListener('keydown', function (e) { var k = {ArrowLeft:[-0.05,0], ArrowRight:[0.05,0], ArrowUp:[0,0.05], ArrowDown:[0,-0.05]}[e.key]; if (!k) return; e.preventDefault(); st.s = Math.max(0, Math.min(1, st.s + k[0])); st.v = Math.max(0, Math.min(1, st.v + k[1])); paint(); });
  hue.addEventListener('input', function () { st.h = +this.value; paint(); });
  fmt.addEventListener('change', function () { st.fmt = this.value; paint(); });
  val.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('cp-names') && t.value) { st.name = CSS_NAMES[t.value]; setFromHex(t.value); paint(true); prev.style.background = t.value; }
    else if (t.classList.contains('cp-text')) {
      var v3 = t.value.trim(), m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(v3);
      if (/^#?[0-9a-f]{6}$/i.test(v3)) setFromHex(v3.replace('#', '')); else if (m) setFromHex(rgbToHex(+m[1], +m[2], +m[3]).slice(1)); else { toast('That color code doesn\u2019t look right. Try #ff6347 or rgb(255, 99, 71).'); return; }
      paint();
    }
  });
  var eye = p.querySelector('.cp-eye'); if (eye) eye.addEventListener('click', function () { new window.EyeDropper().open().then(function (r) { setFromHex(r.sRGBHex.replace('#', '')); paint(); }).catch(function () {}); });
  p.querySelector('.cp-x').addEventListener('click', closePicker);
  p.querySelector('.cp-cancel').addEventListener('click', closePicker);
  p.querySelector('.cp-done').addEventListener('click', function () {
    var c = cur(), out = st.fmt === 'name' ? toHex(st.name).toUpperCase() : st.fmt === 'hex' ? c.hex : 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')';
    if (st.fmt === 'hex' && /^#[0-9]{6}$/.test(out)) cpHex[out] = 1;
    var f = st.onPick; closePicker(); f(out);
  });
  paint();
  var ar = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
  var left = Math.min(Math.max(8, ar.left), window.innerWidth - pw - 8), top = ar.bottom + 8; if (top + ph > window.innerHeight - 8) top = Math.max(8, ar.top - ph - 8);
  p.style.left = left + 'px'; p.style.top = top + 'px'; sv.focus();
}
function closePicker() { var p = document.getElementById('cpick'); if (p) { p.remove(); if (cpState && cpState.anchor && document.contains(cpState.anchor)) cpState.anchor.focus(); } cpState = null; }
document.addEventListener('pointerdown', function (e) { if (cpState && !e.target.closest('#cpick') && e.target !== cpState.anchor) closePicker(); }, true);
document.addEventListener('keydown', function (e) { if (cpState && e.key === 'Escape') { e.stopPropagation(); closePicker(); } }, true);
function fillColorNames(sel, firstLabel) {
  sel.innerHTML = ''; var d = el('option', '', firstLabel || 'More colors\u2026'); d.value = ''; sel.appendChild(d);
  Object.keys(CSS_NAMES).map(function (h) { return [h, CSS_NAMES[h]]; }).sort(function (a, b) { return a[1] < b[1] ? -1 : 1; }).forEach(function (c) {
    var o = el('option', '', c[1]); o.value = c[0];
    var r = parseInt(c[0].substr(1, 2), 16), g = parseInt(c[0].substr(3, 2), 16), b = parseInt(c[0].substr(5, 2), 16);
    o.style.background = c[0]; o.style.color = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff'; sel.appendChild(o);
  });
}
function buildSwatches(box, onPick, noneLabel) {
  box.innerHTML = '';
  var none = el('button', 'sw none'); none.dataset.color = ''; none.title = noneLabel; none.setAttribute('aria-label', noneLabel); box.appendChild(none);
  COLORS.forEach(function (c) { var b = el('button', 'sw'); b.style.background = c[0]; b.dataset.color = c[0]; b.title = c[1]; b.setAttribute('aria-label', c[1]); box.appendChild(b); });
  var pick = el('button', 'sw-custom'); pick.title = 'More colors: spectrum, eyedropper, names, HEX, RGB'; pick.setAttribute('aria-label', 'More colors'); box.appendChild(pick);
  box.addEventListener('click', function (e) { var b = e.target.closest('.sw'); if (b) onPick(b.dataset.color); });
  pick.addEventListener('click', function () { openPicker(pick, box.dataset.cur || '', function (c) { onPick(c); }); });
}
function markSwatches(box, val) {
  val = String(val || '').toUpperCase(); var hit = false;
  box.querySelectorAll('.sw').forEach(function (b) { var on = b.dataset.color === val; if (on) hit = true; b.setAttribute('aria-pressed', on); });
  box.dataset.cur = val || ''; var pk = box.querySelector('.sw-custom'); if (pk) pk.style.boxShadow = val && !hit ? '0 0 0 2px #fff, 0 0 0 4px var(--blue)' : '';
}
fillFonts(document.getElementById('fontSel'), 'Page font');
fillSizes(document.getElementById('sizeSel'));
fillLines(document.getElementById('linesSel'));
fillGaps(document.getElementById('gapSel'));
fillStarts(document.getElementById('startSel'));
document.getElementById('startSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.start = +this.value; if (w.start === 1) delete w.start; render(); say('Numbers start at ' + this.value + '.'); });
document.getElementById('gapSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.gap = this.value; render(); say(this.value ? 'Item spacing: ' + gapName(this.value) + '.' : 'Automatic item spacing.'); });
document.getElementById('linesSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.lh = this.value; render(); say(this.value ? 'Line spacing: ' + lineName(this.value) + '.' : 'Automatic line spacing.'); });
document.getElementById('sizeSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.size = this.value; render(); say(this.value ? 'Size: ' + sizeName(this.value) + '.' : 'Automatic size.'); });
document.getElementById('fontSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.font = this.value; render(); say(this.value ? 'Font: ' + fontOf(this.value).n + '.' : 'Back to the page font.'); });
buildSwatches(document.getElementById('colorSw'), function (c, live) {
  var w = selWord(); if (!w) return; w.color = c;
  if (live) { renderComic(); renderTrays(); renderCode(); save(); } else { render(); say(c ? 'Color: ' + colorName(c) + '.' : 'Back to the page color.'); }
}, 'Page color');
var TH = [['thFontH', 'fontH'], ['thFontP', 'fontP']];
TH.forEach(function (t) {
  var sel = document.getElementById(t[0]); fillFonts(sel, 'Default'); sel.value = theme[t[1]] || '';
  sel.addEventListener('change', function () { theme[t[1]] = this.value; renderComic(); renderTrays(); renderCode(); save(); });
});
[['thInk', 'ink', 'Default words color'], ['thAccent', 'accent', 'Default blue']].forEach(function (t) {
  var box = document.getElementById(t[0]);
  buildSwatches(box, function (c) { theme[t[1]] = c; markSwatches(box, c); renderComic(); renderTrays(); renderCode(); save(); }, t[2]);
});
function syncTheme() {
  document.getElementById('thFontH').value = theme.fontH || ''; document.getElementById('thFontP').value = theme.fontP || '';
  markSwatches(document.getElementById('thInk'), theme.ink); syncBg(); markSwatches(document.getElementById('thAccent'), theme.accent);
}
var bgArea = 'page';
function setBg(field, val) {
  if (bgArea === 'page' && field === 'color') theme.bg = val;
  else { bgs[bgArea] = bgs[bgArea] || {}; bgs[bgArea][field] = val; }
  renderComic(); renderTrays(); renderCode(); save();
}
function syncBg() {
  var as = document.getElementById('bgArea'), keep = bgArea; as.innerHTML = '';
  [['page', 'Whole page'], ['header', 'Title area'], ['section', 'Feature'], ['footer', 'The end']].concat((function () { var a = []; for (var q = 1; q <= panelCount; q++) { a.push(['p' + q, 'Panel ' + q]); for (var c = 1; c <= cardsOf(q); c++) a.push(['p' + q + 'c' + c, 'Panel ' + q + ', card ' + c]); } return a; })())
    .forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; as.appendChild(op); });
  if (!as.querySelector('option[value="' + keep + '"]')) keep = 'page';
  as.value = bgArea = keep;
  var b = bgOf(bgArea), is = document.getElementById('bgImg'); is.innerHTML = '';
  var none = el('option', '', 'No picture'); none.value = ''; is.appendChild(none);
  allPieces().filter(function (p) { return p.type === 'img'; }).forEach(function (p) { var op = el('option', '', p.alt); op.value = p.id; is.appendChild(op); });
  is.value = b.img; document.getElementById('bgFit').value = b.fit; document.getElementById('bgFitRow').hidden = !b.img;
  markSwatches(document.getElementById('thBg'), b.color);
}
buildSwatches(document.getElementById('thBg'), function (c) { setBg('color', c); syncBg(); }, 'No background color');
document.getElementById('bgArea').addEventListener('change', function () { bgArea = this.value; syncBg(); });
document.getElementById('bgImg').addEventListener('change', function () { setBg('img', this.value); syncBg(); say(this.value ? 'Background picture added.' : 'Background picture removed.'); });
document.getElementById('bgFit').addEventListener('change', function () { setBg('fit', this.value); });
document.getElementById('styleBtn').addEventListener('click', function () { syncTheme(); openModal('themeModal'); });
document.getElementById('themeDone').addEventListener('click', function () { closeModal('themeModal'); });
document.getElementById('themeReset').addEventListener('click', function () { theme = {fontH:'', fontP:'', ink:'', bg:'', accent:''}; bgs = {}; syncTheme(); renderComic(); renderTrays(); renderCode(); save(); say('Page style reset.'); });
document.getElementById('themeModal').addEventListener('click', function (e) { if (e.target === this) closeModal('themeModal'); });
if (STYLE_ON) { document.getElementById('styleBtn').hidden = false; }
document.getElementById('kindSel').addEventListener('change', function () { var w = selWord(); if (!w) return; var was = isList(w.kind), now = isList(this.value);
  if (!was && now) w.text = String(w.text).split(/\s*,\s*/).join('\n'); if (was && !now) w.text = String(w.text).split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join(', ');
  w.kind = this.value; render(); if (now) document.getElementById('listInput').focus(); say('Now it is a ' + KIND_NAME[w.kind].toLowerCase() + '.'); if (w.kind === 'a') document.getElementById('urlInput').focus(); });
document.getElementById('listInput').addEventListener('input', function () { var w = selWord(); if (!w) return; delete w.ph; w.text = this.value; renderComic(); renderTrays(); renderCode(); save(); });
function fillGo(sel, w) {
  sel.innerHTML = ''; var add = function (parent, v, t) { var o = el('option', '', t); o.value = v; parent.appendChild(o); };
  add(sel, '', 'Nothing yet');
  var g1 = el('optgroup'); g1.label = 'A part of this page';
  ['header', 'section'].concat((function () { var a = []; for (var q = 1; q <= panelCount; q++) { a.push('p' + q); for (var c = 1; c <= cardsOf(q); c++) a.push('p' + q + 'c' + c); } return a; })(), ['footer']).forEach(function (k) { add(g1, k, nodeName(k)); });
  Object.keys(placed).forEach(function (k) { var p = piece(placed[k]); if (p && p.type === 'txt' && (p.kind === 'h' || p.kind === 's') && p.id !== w.id) add(g1, 'w:' + p.id, (p.kind === 'h' ? 'Heading: ' : 'Subheading: ') + String(p.text).slice(0, 30)); });
  sel.appendChild(g1); add(sel, '@url', 'Another page or website');
  sel.value = w.go || (w.kind === 'a' && w.url ? '@url' : '');
}
function tryJump(key) {
  var n = nodeEl(key); if (!n) { say('That part isn\u2019t on the page.'); return; }
  n.scrollIntoView({block: 'center', behavior: 'smooth'}); n.classList.add('jump-flash'); setTimeout(function () { n.classList.remove('jump-flash'); }, 1600);
  say('This is where the button or link jumps to: ' + nodeName(key) + '.');
}
document.getElementById('goSel').addEventListener('change', function () { var w = selWord(); if (!w) return; w.go = this.value; render(); say(this.value ? (this.value === '@url' ? 'Type the address of the page.' : 'When clicked, it goes to ' + nodeName(this.value) + '.') : 'It doesn\u2019t go anywhere yet.'); if (this.value === '@url') document.getElementById('urlInput').focus(); });
document.getElementById('tryGo').addEventListener('click', function () { var w = selWord(); if (w && w.go && w.go !== '@url') tryJump(w.go); });
document.getElementById('urlInput').addEventListener('input', function () { var w = selWord(); if (!w) return; w.url = this.value.trim(); renderComic(); renderCode(); save(); });
document.getElementById('delWord').addEventListener('click', function () {
  var w = selWord(); if (!w) return; var sl = slotOf(w.id); if (sl) delete placed[sl];
  words = words.filter(function (x) { return x.id !== w.id; }); selected = null; render(); say('Words deleted.');
});
document.getElementById('doneWord').addEventListener('click', function () {
  var w = selWord(); if (w && !String(w.text).trim()) w.text = isList(w.kind) ? 'Item' : 'Words'; selected = null; render();
});
document.getElementById('phRow').addEventListener('click', function (e) {
  var b = e.target.closest('[data-ph-text]'); if (!b) return;
  var k = b.dataset.phText, txt = k === 'h' ? 'Heading goes here' : k === 'ul' ? 'First item\nSecond item\nThird item' : 'Paragraph text goes here. Write two or three sentences that tell visitors what this part is about.';
  var nw = {id: 'w' + Date.now(), kind: k, text: txt, ph: true}; words.push(nw);
  selected = nw.id; selectedFrom = 'tray'; render(); say('Placeholder ' + (k === 'h' ? 'heading' : k === 'ul' ? 'list' : 'paragraph') + ' made. Drag it onto your page, or tap a box.');
});
function makeWord(kind) {
  var inp = document.getElementById('wordInput'), v = inp.value.trim();
  if (isList(kind)) {
    var nl = {id:'w' + Date.now(), kind:kind, text:v ? v.split(/\s*,\s*/).join('\n') : 'Home\nAbout\nContact'};
    words.push(nl); inp.value = ''; selected = nl.id; render(); showTab('words');
    var la = document.getElementById('listInput'); la.focus(); la.setSelectionRange(la.value.length, la.value.length);
    say('List made. Type one item per line, then drag it onto your page.'); return;
  }
  if (!v) { inp.focus(); say('Type your words first.'); return; }
  var nw = {id:'w' + Date.now(), kind:kind, text:v}; if (kind === 'a') nw.url = '';
  words.push(nw); inp.value = '';
  if (kind === 'a') { selected = nw.id; render(); document.getElementById('urlInput').focus(); say('Link made. Type where it goes, then drag it onto your page.'); return; }
  render(); say(KIND_NAME[kind] + ' made. Drag it onto your page.');
}
document.getElementById('makeH').addEventListener('click', function () { makeWord('h'); });
document.getElementById('makeS').addEventListener('click', function () { makeWord('s'); });
if (PLANNER) { document.getElementById('makeS').hidden = false; document.getElementById('phRow').hidden = false; } else document.querySelectorAll('#kindSel option[data-sub]').forEach(function (o) { o.remove(); });
document.getElementById('makeP').addEventListener('click', function () { makeWord('p'); });
document.getElementById('makeB').addEventListener('click', function () { makeWord('b'); });
document.getElementById('makeA').addEventListener('click', function () { makeWord('a'); });
document.getElementById('makeL').addEventListener('click', function () { makeWord('ul'); });
if (LISTS_ON) document.getElementById('makeL').hidden = false;
else document.querySelectorAll('#kindSel option[data-list]').forEach(function (o) { o.remove(); });

/* ---------- send to teacher ---------- */
var TEACHER_EMAIL = 'monica@missionbit.org';
var studentName = '';
try { studentName = localStorage.getItem(KEY + '-name') || ''; } catch (e) {}
function codeText() { var p = codeStyle === 'pseudo'; return (p ? 'PAGE STEPS' : 'index.html') + '\n\n' + plainOf(codeSrc.html) + '\n\n' + (p ? 'STYLE STEPS' : 'style.css') + '\n\n' + plainOf(codeSrc.css) + '\n'; }
function titleText() { var p = placed.title && piece(placed.title); return p && p.type === 'txt' ? p.text : (PLANNER ? 'My website' : 'My web comic'); }
function mailParts() {
  var who = studentName.trim() || 'a student';
  var subject = (PLANNER ? 'Website plan from ' : 'Web comic from ') + who;
  var body = (PLANNER ? 'Hi! Here is my website plan. My index.html file is attached.\n\n' : 'Hi! Here is my web comic. The comic file is attached.\n\n') + (UX_ON ? uxText() + '\n' : '') + 'My code:\n\n' + codeText();
  if (body.length > 9000) body = body.slice(0, 9000) + '\n...';
  return {subject: subject, body: body};
}
function updateSendLinks() { document.querySelectorAll('.teacherAddr2').forEach(function (e) { e.textContent = TEACHER_EMAIL; }); }
function attr(t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
/* builds a stand-alone web page of the comic, pictures included */
function exportHTML() {
  var img = function (p, key) { return '<img src="' + p.src + '" alt="' + attr(p.alt) + '"' + (key && picFit[key] === 'cover' ? ' style="object-fit:cover;inset:0;width:100%;height:100%' + (picPos[key] ? ';object-position:' + picPos[key].x + '% ' + picPos[key].y + '%' : '') + '"' : '') + '>'; };
  var words = function (p, tag, extra) {
    var st = 'margin:0;' + (p.align ? 'text-align:' + p.align + ';' : '') + (extra || ''), acc = theme.accent || '#2F6FB5';
    var own = (p.lh ? 'line-height:' + p.lh + ';' : '') + (p.size ? 'font-size:' + p.size + 'rem;' : '') + (p.font ? 'font-family:' + fontOf(p.font).s + ';' : '') + (p.color && p.kind !== 'b' ? 'color:' + p.color + ';' : '');
    if (isList(p.kind)) {
      var li = listItems(p);
      if (p.kind === 'nav') return '<nav style="' + st + '"><ul style="list-style:none;display:flex;flex-wrap:wrap;gap:16px;padding:0;margin:0;justify-content:' + (p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start') + '">' + li.map(function (it) { return '<li><a href="' + attr(it.href) + '" style="color:#2F6FB5;font-weight:bold;text-decoration:none">' + esc(it.text) + '</a></li>'; }).join('') + '</ul></nav>';
      var lt = p.kind === 'ol' ? 'ol' : 'ul';
      return '<' + lt + (olStart(p) > 1 ? ' start="' + olStart(p) + '"' : '') + ' style="' + st + own + 'padding-left:1.4em">' + li.map(function (it) { return '<li' + (p.gap ? ' style="margin-bottom:' + p.gap + 'px"' : '') + '>' + esc(it.text) + '</li>'; }).join('') + '</' + lt + '>';
    }
    if (p.kind === 'b') return '<p style="' + st + '"><button' + (p.go ? ' onclick="location.href=\'' + attr(goHref(p)) + '\'"' : '') + ' style="background:' + (p.color || acc) + ';color:#fff;border:none;border-radius:999px;padding:8px 18px;font:inherit;font-weight:bold;' + (p.font ? 'font-family:' + fontOf(p.font).s : '') + '">' + esc(p.text) + '</button></p>';
    if (p.kind === 'a') return '<p style="' + st + '"><a href="' + attr(goHref(p)) + '" style="color:' + acc + ';font-weight:bold;' + own + '">' + esc(p.text) + '</a></p>';
    return '<' + tag + ' style="' + st + own + '">' + esc(p.text) + '</' + tag + '>';
  };
  var at = function (id) { return placed[id] && piece(placed[id]); };
  var wordBox = function (capId, isCover) {
    var p = at(capId); if (!p) return '';
    var pos = capPos[capId], where = (isCover && !pos ? 'left:8px;bottom:8px;' : posDecls(capBase(capId), pos).join(';').replace(/: /g, ':') + ';') + (pos ? 'max-width:' + Math.max(10, Math.round(100 - pos.x)) + '%;' : '');
    if (p.type === 'img' && p.ph === 'video') { var ep = p.poster && piece(p.poster); return '<div class="words" style="' + where + 'width:' + mw(capId) + '%;max-width:none"><video controls' + (ep ? ' poster="' + ep.src + '"' : '') + ' style="width:100%;aspect-ratio:16/9;background:#1A1A1F;display:block"></video></div>'; }
    if (p.type === 'img') return '<div class="words" style="' + where + 'width:' + mw(capId) + '%;max-width:none">' + '<img src="' + p.src + '" alt="' + attr(p.alt) + '" style="width:100%;height:auto;display:block">' + '</div>';
    return '<div class="words" style="' + where + '">' + words(p, p.kind === 'h' ? 'h2' : p.kind === 's' ? 'h3' : 'p') + '</div>';
  };
  var c = function (k) { return attr(cls(k)); };
  var h = '\x3C!doctype html>\n\x3Chtml lang="en">\n\x3Chead>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(titleText()) + '</title>\n' + (googleFonts().length ? '<link rel="stylesheet" href="' + googleHref(googleFonts()) + '">\n' : '') + '<style>\n'
    + 'body{margin:0;background:' + (theme.bg || '#fff') + ';color:' + (theme.ink || '#1A1A1F') + ';font-family:' + (theme.fontP ? fontOf(theme.fontP).s : (PLANNER ? defaultBodyStack() : '"Comic Neue","Comic Sans MS","Chalkboard SE",sans-serif')) + '}\n'
    + (theme.fontH ? 'h1,h2,h3{font-family:' + fontOf(theme.fontH).s + '}\n' : '')
    + '.' + c('card') + ' h2{font-size:1.2rem;overflow-wrap:anywhere}.' + c('card') + ' h3{font-size:1rem;overflow-wrap:anywhere}\n'
    + '.' + c('container') + '{max-width:1000px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:14px}\n'
    + '.' + c('header') + '{border:4px solid #1A1A1F;padding:16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}\n'
    + '.' + c('header') + ' img{height:130px;width:auto;max-width:100%}\n'
    + '.' + c('header') + ' h1{font-size:48px;margin:0}\n'
    + '.' + c('section') + '{position:relative;border:4px solid #1A1A1F;height:380px}\n'
    + '.' + c('row') + '{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:35px;column-gap:14px}\n'
    + '.panel{position:relative;border:4px solid #1A1A1F;margin-bottom:14px}\n'
    + '.' + c('section') + ' > img, .panel > img{position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);object-fit:contain}\n'
    + '.words{position:absolute;width:max-content;max-width:calc(100% - 16px);font-weight:700;font-size:16px;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff}\n'
    + '.words h2{font-size:22px}\n'
    + '.' + c('card') + '{position:relative;border:2px solid #1A1A1F;min-height:100px}\n.' + c('card') + ' > img{position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain}\n'
    + '.' + c('footer') + '{background:#1A1A1F;color:#fff;text-align:center;padding:16px}\n'
    + '.' + c('footer') + ' img{height:90px;width:auto;background:#fff}\n'
    + '@media (max-width:640px){.' + c('row') + '{grid-template-columns:repeat(2,minmax(0,1fr))}.panel{grid-column:span 2 !important}}\n'
    + (function () {
        var x = '', sel = {page:'body', header:'.' + c('header'), section:'.' + c('section'), footer:'.' + c('footer')};
        for (var q = 1; q <= panelCount; q++) { sel['p' + q] = '.' + c('p' + q); for (var qc = 1; qc <= cardsOf(q); qc++) sel['p' + q + 'c' + qc] = '.' + c('p' + q) + ' .' + c('card') + ':nth-of-type(' + qc + ')'; }
        Object.keys(sel).forEach(function (k) { var d = bgDecls(k, true); if (d.length) x += sel[k] + '{' + d.join(';') + '}\n'; });
        return x;
      })()
    + '</style>\n\x3C/head>\n\x3Cbody>\n<div class="' + c('container') + '">\n';
  var t = at('title');
  h += '<div class="' + c('header') + '">' + (t ? (t.type === 'img' ? img(t) : words(t, 'h1')) : '') + '</div>\n';
  var cv = at('cover');
  if (cv || capsUsed('cover').length) h += '<div class="' + c('section') + '">' + (cv ? img(cv, 'cover') : '') + capIds('cover').map(function (id) { return wordBox(id, true); }).join('') + '</div>\n';
  h += '<div class="' + c('row') + '">\n';
  for (var n = 1; n <= panelCount; n++) {
    var sz = sizes[n], pi = at('p' + n);
    var ek = cardsOf(n);
    if (ek) {
      var hdw = at('p' + n + 'Head'), inner2 = hdw ? '<div style="grid-column:1/-1">' + words(hdw, hdw.kind === 'h' ? 'h2' : hdw.kind === 's' ? 'h3' : 'p') + '</div>' : '';
      for (var ec = 1; ec <= ek; ec++) { var ci = at('p' + n + 'c' + ec); inner2 += '<div class="' + c('card') + '" style="grid-column:span ' + cardW('p' + n + 'c' + ec) + (padOf('p' + n + 'c' + ec) !== null ? ';padding:' + padOf('p' + n + 'c' + ec) + 'px' : '') + '">' + (ci ? img(ci, 'p' + n + 'c' + ec) : '') + capIds('p' + n + 'c' + ec).map(function (id) { return wordBox(id); }).join('') + '</div>'; }
      h += '<div class="panel ' + c('p' + n) + '" style="grid-column:span ' + sz.c + ';grid-row:span ' + sz.r + ';display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:' + (hdw ? 'auto ' : '') + rowTemplate(n) + ';gap:8px;padding:' + (padOf('p' + n) !== null ? padOf('p' + n) : 8) + 'px">' + inner2 + '</div>\n';
    } else
    h += '<div class="panel ' + c('p' + n) + '" style="grid-column:span ' + sz.c + ';grid-row:span ' + sz.r + '">' + (pi ? img(pi, 'p' + n) : '') + capIds('p' + n).map(function (id) { return wordBox(id); }).join('') + '</div>\n';
  }
  h += '</div>\n';
  var en = at('end');
  if (en) h += '<div class="' + c('footer') + '">' + (en.type === 'img' ? img(en) : words(en, 'h2', 'font-size:40px')) + '</div>\n';
  /* the planner can open this file again: everything about the work, kept in a script tag the browser does not run */
  var keep = JSON.stringify({planner: KEY, version: 1, state: saveState()}).replace(/</g, '\\u003c');
  h += '</div>\n\x3Cscript type="application/json" id="planner-save">' + keep + '\x3C/script>\n\x3C/body>\n\x3C/html>\n';
  return h;
}
function fileName() { var n = (studentName.trim() || 'my').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return PLANNER ? 'index.html' : (n || 'my') + '-web-comic.html'; }
document.getElementById('sendBtn').addEventListener('click', function () {
  document.getElementById('sendName').value = studentName; updateSendLinks(); document.querySelectorAll('.teacherAddr2').forEach(function (e) { e.textContent = TEACHER_EMAIL; }); openModal('sendModal');
  document.getElementById('sendName').focus();
});
document.getElementById('sendName').addEventListener('input', function () {
  studentName = this.value; try { localStorage.setItem(KEY + '-name', studentName); } catch (e) {} updateSendLinks();
});
function shareableFile() { try { return new File([exportHTML()], fileName(), {type: 'text/html'}); } catch (e) { return null; } }
(function () {
  var b = document.getElementById('shareFile'), f = null;
  try { f = new File(['x'], 'index.html', {type: 'text/html'}); } catch (e) {}
  if (b && f && navigator.canShare && navigator.canShare({files: [f]})) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var file = shareableFile(); if (!file) return;
      navigator.share({files: [file], title: mailParts().subject, text: 'For ' + TEACHER_EMAIL + ': ' + mailParts().subject})
        .then(function () { document.getElementById('dlNote').textContent = 'Shared. If you picked Google Drive, share the file with ' + TEACHER_EMAIL + ' there.'; })
        .catch(function (err) { if (!err || err.name !== 'AbortError') document.getElementById('dlNote').textContent = 'Sharing didn\u2019t work here. Use Download my index.html file instead.'; });
    });
  }
})();
function setOS(os) {
  document.querySelectorAll('[data-os]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.os === os); });
  document.querySelectorAll('[data-for]').forEach(function (l) { l.hidden = l.dataset.for !== os; });
  try { localStorage.setItem(KEY + '-os', os); } catch (e) {}
}
function guessOS() {
  var saved = null; try { saved = localStorage.getItem(KEY + '-os'); } catch (e) {}
  if (saved) return saved;
  var ua = navigator.userAgent || '';
  return /CrOS/.test(ua) ? 'cros' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : 'cros';
}
document.getElementById('sendModal').addEventListener('click', function (e) { var b = e.target.closest('[data-os]'); if (b) setOS(b.dataset.os); });
(function () { var c = document.getElementById('checkpoint'); try { c.value = localStorage.getItem(KEY + '-checkpoint') || ''; if (c.selectedIndex < 0) c.value = ''; } catch (e) {}
  c.addEventListener('change', function () { try { localStorage.setItem(KEY + '-checkpoint', c.value); } catch (e) {} }); })();
setOS(guessOS());
/* save the work as index.html, and open it again later */
function downloadWork() {
  var blob = new Blob([exportHTML()], {type: 'text/html'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
document.getElementById('saveWork').addEventListener('click', function () {
  downloadWork(); toast('Saved as ' + fileName() + ' in your Downloads folder. Use Open my work to load it again.');
});
document.getElementById('openWork').addEventListener('click', function () { document.getElementById('openFile').click(); });
document.getElementById('openFile').addEventListener('change', function () {
  var f = this.files && this.files[0]; this.value = ''; if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var txt = String(rd.result), m = /<script type="application\/json" id="planner-save">([\s\S]*?)<\/script>/.exec(txt), data = null;
    try { data = m && JSON.parse(m[1]); } catch (e) { data = null; }
    if (!data || !data.state) { toast('That file doesn\u2019t have saved planner work in it. Choose an index.html made with Save my work.'); return; }
    var go = function () {
      try { localStorage.setItem(KEY, JSON.stringify(data.state)); location.reload(); }
      catch (e) { toast('This browser can\u2019t load saved work here. Open the planner in its own tab and try again.'); }
    };
    if (ask('Open this saved work? It replaces what is on your page now. (You can save your current work first with Save my work.)', 'Open it', go)) go();
  };
  rd.readAsText(f);
});
function fillPrintSheet() {
  var ps = document.getElementById('printSheet'), who = studentName.trim() || 'A student', d = new Date();
  ps.innerHTML = '';
  var ph = document.getElementById('printHead'); ph.innerHTML = '';
  var cpl = document.getElementById('checkpoint').value, head = el('div', 'ps-head');
  if (cpl) head.appendChild(el('p', 'ps-cp', cpl));
  head.appendChild(el('h1', '', (PLANNER ? 'Website plan: ' : 'Web comic: ') + titleText()));
  head.appendChild(el('p', '', who + ' \u2014 ' + d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}))); ph.appendChild(head);
  if (UX_ON) { ps.appendChild(el('h2', '', 'My reflections and user flow')); ps.appendChild(el('pre', '', uxText())); }
  var p = codeStyle === 'pseudo';
  ps.appendChild(el('h2', '', p ? 'Page steps' : 'index.html')); ps.appendChild(el('pre', '', plainOf(codeSrc.html)));
  ps.appendChild(el('h2', '', p ? 'Style steps' : 'style.css')); ps.appendChild(el('pre', '', plainOf(codeSrc.css)));
}
document.getElementById('makePdf').addEventListener('click', function () {
  if (!studentName.trim()) { toast('Type your name first, so your teacher knows whose work this is.'); document.getElementById('sendName').focus(); return; }
  var cpv = document.getElementById('checkpoint').value;
  if (!cpv) { toast('Pick which checkpoint this is first.'); document.getElementById('checkpoint').focus(); return; }
  var undoPrint = [];
  if (/User flow/.test(cpv)) {
    var pm = ux.mode; if (pm !== 'flow') { setMode('flow'); undoPrint.push(function () { setMode(pm); }); }
    document.body.classList.add('print-flow'); undoPrint.push(function () { document.body.classList.remove('print-flow'); });
  }
  if (/Tags/.test(cpv)) {
    if (!app.classList.contains('show-tags')) { document.getElementById('tagsBtn').click(); undoPrint.push(function () { document.getElementById('tagsBtn').click(); }); }
    document.body.classList.add('print-tags'); undoPrint.push(function () { document.body.classList.remove('print-tags'); });
  }
  window.addEventListener('afterprint', function backP() { undoPrint.forEach(function (f) { f(); }); window.removeEventListener('afterprint', backP); });
  renderCode(); fillPrintSheet();
  /* the page goes at the top of the PDF: put the comic in view and close this box before printing */
  var prevMode = ux.mode, wasTags = document.querySelector('.show-tags'); selected = null; multi = []; render();
  closeModal('sendModal');
  var oldTitle = document.title; document.title = (PLANNER ? 'Website plan - ' : 'Web comic - ') + (cpv ? cpv.replace(':', '') + ' - ' : '') + studentName.trim();   /* becomes the PDF file name */
  window.addEventListener('afterprint', function back() { document.title = oldTitle; window.removeEventListener('afterprint', back); });
  setTimeout(function () {
    var ok = true; try { window.print(); } catch (e) { ok = false; }
    if (!ok) toast('Printing is blocked here. Use the \u2197 button at the top right of the CodeHS output to open the planner in its own tab, then try again.');
  }, 150);
});
document.getElementById('dlComic').addEventListener('click', function () {
  try {
    var blob = new Blob([exportHTML()], {type: 'text/html'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    document.getElementById('dlNote').textContent = 'Saved as ' + fileName() + '. Look in your Downloads folder.';
    say((PLANNER ? 'Website' : 'Comic') + ' saved as ' + fileName() + '.');
  } catch (err) { document.getElementById('dlNote').textContent = 'Saving didn\u2019t work here. Use Copy my code instead.'; }
});
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  return new Promise(function (ok, no) {
    var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); } ta.remove();
  });
}
document.getElementById('copyCode').addEventListener('click', function () {
  var b = this; copyText(codeText()).then(function () { b.textContent = 'Copied!'; say('Code copied.'); setTimeout(function () { b.textContent = 'Copy my code'; }, 2000); },
    function () { b.textContent = 'Copy didn\u2019t work'; });
});
document.getElementById('sendDone').addEventListener('click', function () { closeModal('sendModal'); });
document.getElementById('sendModal').addEventListener('click', function (e) { if (e.target === this) closeModal('sendModal'); });

var app = document.getElementById('app');
var snapChk = document.getElementById('snapChk'); snapChk.checked = snapOn;
snapChk.addEventListener('change', function () { snapOn = this.checked; save(); say(snapOn ? 'Words will snap to a grid.' : 'Words go exactly where you drop them.'); });
app.classList.add('mode-build');
if (PLANNER) {
  app.classList.add('planner');
  if (STYLE_ON) { var gl = document.createElement('link'); gl.rel = 'stylesheet'; gl.href = googleHref(FONTS.filter(function (f) { return f.gf; })); document.head.appendChild(gl); }
}
/* ================= UX: Reflect and User flow ================= */
var ABOUT_QS = [
  ['aud', 'Who is your website for?', 'Your target audience. Example: kids who love comics, teens looking for concert tickets.'],
  ['goal', 'What do you want them to do on your page?', 'Example: read the story, click Read more, contact the artist.'],
  ['brand', 'Use 3 words to describe the personality of your website, or what you want the people who use it to feel.', 'Example: familiar or comfortable, high-status, considerate, funny, awe-inspiring.'],
  ['first', 'What should visitors notice first?', 'The most important thing on the page.']
];
var CHECKS = [
  ['hier', 'Visual hierarchy', 'Which UI elements help visitors tell what\u2019s most important right away?',
    ['Big heading', 'Large picture', 'Bold color', 'Placed at the top', 'Bigger text', 'Empty space around it', 'Button']],
  ['nav', 'Navigation', 'Which UI elements and actions help visitors find their way around?',
    ['Nav bar', 'Links', 'Buttons', 'Menu button (\u2630)', 'Search bar', 'Tabs', 'Header that stays on screen', 'Clear headings', 'Panels in order', 'Home link', 'Back to top link'],
    ['Ways visitors move', ['Scrolling', 'Close button (\u2715)', 'Pinch to zoom', 'Tapping or clicking', 'Back button', 'Done button']]],
  ['read', 'Readability', 'Which UI elements make your text easy to read?',
    ['Easy-to-read font', 'Strong contrast', 'Bigger text', 'Short sentences', 'Space between lines', 'Lists']],
  ['cons', 'Consistency', 'Which UI elements repeat in a pattern across your page?',
    ['Same fonts', 'Same colors', 'Same button style', 'Same heading style', 'Panels that line up', 'Same alignment']],
  ['feed', 'Feedback', 'Which UI elements show visitors something happened when they click?',
    ['Button changes color', 'Link changes color', 'Something changes when you point at or click it', 'Something changes when I click Done', 'A message appears', 'A new page opens', 'A picture changes']],
  ['brand', 'Brand fit', 'Which UI elements show your website\u2019s personality?',
    ['Colors', 'Fonts', 'Pictures and drawings', 'Words and tone', 'Background', 'Button shapes']]
];
var WHO = [['me', 'I tested it'], ['aud', 'Someone from my audience tested it']];
var RATE = [['yes', 'Yes'], ['almost', 'Partly'], ['not', 'Not yet']];
var HELPS = ['Big heading', 'Picture', 'Button', 'Link or nav bar', 'Color', 'Where it sits on the page', 'Words that explain'];
function uxSave() { save(); }
function nodeName(id) {
  if (!id) return '?';
  if (id.indexOf('w:') === 0) { var p = piece(id.slice(2)); return p ? (KIND_NAME[p.kind] || 'Words') + ' \u201C' + String(p.text).split('\n')[0].slice(0, 28) + '\u201D' : 'Words'; }
  var cm = /^p(\d+)c(\d)$/.exec(id); if (cm) return 'Panel ' + cm[1] + ', card ' + cm[2];
  return {header:'Title area', section:'Feature', footer:'The end'}[id] || ('Panel ' + id.slice(1));
}
function nodeEl(id) {
  var comic = document.getElementById('comic');
  if (id.indexOf('w:') === 0) return comic.querySelector('.piece[data-id="' + id.slice(2) + '"]');
  return comic.querySelector('[data-key="' + id + '"]');
}
function flowNodeList() {
  var a = ['header', 'section']; for (var q = 1; q <= panelCount; q++) { a.push('p' + q); for (var c = 1; c <= cardsOf(q); c++) a.push('p' + q + 'c' + c); } a.push('footer');
  Object.keys(placed).forEach(function (k) { var p = piece(placed[k]); if (p && p.type === 'txt' && /^(b|a|nav|h|s)$/.test(p.kind)) a.push('w:' + p.id); });
  return a;
}
function nodeSelect(cur, step, end) {
  var sel = el('select'); sel.dataset.stepNode = step; sel.dataset.end = end; sel.setAttribute('aria-label', 'Step ' + (step + 1) + (end === 'from' ? ': starts at' : ': goes to'));
  var list = flowNodeList(); if (list.indexOf(cur) < 0) list.unshift(cur);
  list.forEach(function (k) { var o = el('option', '', nodeName(k)); o.value = k; sel.appendChild(o); }); sel.value = cur; return sel;
}
function markFlowNodes() {
  var comic = document.getElementById('comic');
  comic.querySelectorAll('[data-flow-node]').forEach(function (n) { n.removeAttribute('data-flow-node'); n.classList.remove('flow-pending'); });
  if (ux.mode !== 'flow') return;
  ['header', 'section', 'footer'].concat((function () { var a = []; for (var q = 1; q <= panelCount; q++) { a.push('p' + q); for (var c = 1; c <= cardsOf(q); c++) a.push('p' + q + 'c' + c); } return a; })()).forEach(function (k) { var n = comic.querySelector('[data-key="' + k + '"]'); if (n) n.setAttribute('data-flow-node', k); });
  comic.querySelectorAll('.piece.txt').forEach(function (b) { var p = piece(b.dataset.id); if (p && /^(b|a|nav|h|s)$/.test(p.kind)) b.setAttribute('data-flow-node', 'w:' + p.id); });
  if (flowPending) { var pn = nodeEl(flowPending); if (pn) pn.classList.add('flow-pending'); }
}
var flowPending = null, flowDrag = null;
function edgePoint(r, tx, ty) {
  var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return {x: cx, y: cy};
  var sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity, k = Math.min(sx, sy);
  return {x: cx + dx * k, y: cy + dy * k};
}
function relRect(el, base) { var a = el.getBoundingClientRect(); return {x: a.left - base.left, y: a.top - base.top, w: a.width, h: a.height}; }
function drawFlow() {
  var comic = document.getElementById('comic'), old = comic.querySelector('.flow-layer'); if (old) old.remove();
  if (ux.mode !== 'flow') return;
  var base = comic.getBoundingClientRect(), NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'flow-layer'); svg.setAttribute('width', comic.scrollWidth); svg.setAttribute('height', comic.scrollHeight); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs><marker id="fArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#E8731A"/></marker></defs>';
  var pairCount = {};
  ux.flow.forEach(function (st, i) {
    var a = nodeEl(st.from), b = nodeEl(st.to); if (!a || !b) return;
    var ra = relRect(a, base), rb = relRect(b, base);
    var e1 = edgePoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2), e2 = edgePoint(rb, ra.x + ra.w / 2, ra.y + ra.h / 2);
    var inward = function (e, r, f) { var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = cx - e.x, dy = cy - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(f, d * 0.6) / d; return {x: e.x + dx * k, y: e.y + dy * k}; };
    var p1 = inward(e1, ra, 46), p2 = inward(e2, rb, 34);
    var key = [st.from, st.to].sort().join('|'); pairCount[key] = (pairCount[key] || 0) + 1;
    var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bend = Math.min(40, len * 0.35) + 26 * (pairCount[key] - 1), cx = mx - dy / len * bend, cy = my + dx / len * bend;
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M' + p1.x + ' ' + p1.y + ' Q' + cx + ' ' + cy + ' ' + p2.x + ' ' + p2.y);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#E8731A'); path.setAttribute('stroke-width', '4'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('marker-end', 'url(#fArrow)');
    if (i === flowActive) path.setAttribute('stroke-width', '6');
    svg.appendChild(path);
    var bx = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x, by = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;
    var g = document.createElementNS(NS, 'g');
    g.innerHTML = '<circle cx="' + bx + '" cy="' + by + '" r="15" fill="#E8731A" stroke="#fff" stroke-width="3"/><text x="' + bx + '" y="' + (by + 5) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" font-family="Arial, sans-serif">' + (i + 1) + '</text>';
    svg.appendChild(g);
  });
  if (flowDrag && flowDrag.moved) {
    var fa = nodeEl(flowDrag.from); if (fa) {
      var r0 = relRect(fa, base), q = edgePoint(r0, flowDrag.x - base.left, flowDrag.y - base.top), ln = document.createElementNS(NS, 'path');
      ln.setAttribute('d', 'M' + q.x + ' ' + q.y + ' L' + (flowDrag.x - base.left) + ' ' + (flowDrag.y - base.top));
      ln.setAttribute('stroke', '#E8731A'); ln.setAttribute('stroke-width', '4'); ln.setAttribute('stroke-dasharray', '8 6'); ln.setAttribute('marker-end', 'url(#fArrow)'); ln.setAttribute('fill', 'none');
      svg.appendChild(ln);
    }
  }
  comic.appendChild(svg);
}
var flowActive = -1;
function addStep(from, to) {
  if (!from || !to || from === to) return;
  ux.flow.push({from: from, to: to, act: '', helps: []}); flowActive = ux.flow.length - 1;
  flowPending = to; uxSave(); renderFlowPanel(); markFlowNodes(); drawFlow();
  say('Step ' + ux.flow.length + ': ' + nodeName(from) + ' to ' + nodeName(to) + '. Tap where they go next, or describe this step.');
}
function flowNodeAt(x, y) { var e = document.elementFromPoint(x, y); var n = e && e.closest && e.closest('[data-flow-node]'); return n ? n.getAttribute('data-flow-node') : null; }
document.getElementById('comic').addEventListener('pointerdown', function (e) {
  if (ux.mode !== 'flow') return;
  var n = e.target.closest('[data-flow-node]'); if (!n) return;  /* the innermost part wins, so a card beats its panel */
  e.preventDefault(); flowDrag = {from: n.getAttribute('data-flow-node'), x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false};
});
document.addEventListener('pointermove', function (e) {
  if (!flowDrag) return; flowDrag.x = e.clientX; flowDrag.y = e.clientY;
  if (Math.abs(e.clientX - flowDrag.sx) + Math.abs(e.clientY - flowDrag.sy) > 10) flowDrag.moved = true;
  if (flowDrag.moved) drawFlow();
});
document.addEventListener('pointerup', function (e) {
  if (!flowDrag) return; var d = flowDrag; flowDrag = null;
  if (d.moved) { var to = flowNodeAt(e.clientX, e.clientY); if (to && to !== d.from) addStep(d.from, to); else drawFlow(); return; }
  /* a tap: first tap picks the start, the next tap draws the arrow */
  if (!flowPending) { flowPending = d.from; markFlowNodes(); say(nodeName(d.from) + ' picked. Now tap where the visitor goes next.'); }
  else if (flowPending === d.from) { flowPending = null; markFlowNodes(); say('Start cleared.'); }
  else addStep(flowPending, d.from);
});
document.getElementById('comic').addEventListener('click', function (e) { if (ux.mode !== 'build') { e.preventDefault(); } }, true);
window.addEventListener('resize', function () { if (ux.mode === 'flow') drawFlow(); });
if (window.ResizeObserver) new ResizeObserver(function () { if (ux.mode === 'flow') drawFlow(); }).observe(document.getElementById('comic'));

function ta(id, val, rows) { var t = el('textarea'); t.id = id; t.rows = rows || 2; t.value = val || ''; return t; }
function renderReflectPanel() {
  var P = document.getElementById('reflectPanel'); P.innerHTML = '';
  var intro = el('div', 'ux-card'); intro.appendChild(el('h2', '', 'Think before you map')); intro.appendChild(el('p', '', 'Answer these about your page. Then use User flow to show how a visitor moves through it.')); P.appendChild(intro);
  var c1 = el('div', 'ux-card'); c1.appendChild(el('h2', '', 'About your visitors'));
  ABOUT_QS.forEach(function (q) {
    var w = el('div', 'ux-q'), lab = el('label', '', q[1]); lab.htmlFor = 'ab-' + q[0];
    var t = ta('ab-' + q[0], ux.about[q[0]]); t.placeholder = q[2]; t.dataset.about = q[0];
    w.appendChild(lab); w.appendChild(t); c1.appendChild(w);
  });
  P.appendChild(c1);
  var c2 = el('div', 'ux-card'); c2.appendChild(el('h2', '', 'Check your design'));
  c2.appendChild(el('p', '', 'For each one, pick the UI elements on your page that do the job. Then test your page yourself or with someone from your audience.'));
  CHECKS.forEach(function (c) {
    var cur = ux.checks[c[0]] || {}, els = cur.els || [], who = cur.who || [], w = el('div', 'ux-q'), q = el('div', 'q', c[1]); q.id = 'ck-' + c[0];
    var qq = c[2]; if (c[0] === 'brand' && ux.about.brand) qq += ' (Your words: ' + ux.about.brand + ')';
    q.appendChild(el('small', '', qq)); w.appendChild(q);
    var ch = el('div', 'chips'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-labelledby', 'ck-' + c[0]);
    c[3].forEach(function (e) { var bt = el('button', '', e); bt.dataset.checkEl = c[0]; bt.dataset.el = e; bt.setAttribute('aria-pressed', els.indexOf(e) >= 0); ch.appendChild(bt); });
    if (c[4]) { var l1 = el('div', 'q', 'On the page'); l1.style.cssText = 'font-size:13px;color:var(--muted)'; w.appendChild(l1); }
    w.appendChild(ch);
    if (c[4]) {
      w.appendChild(el('div', 'q', c[4][0])).style.cssText = 'font-size:13px;margin-top:2px;color:var(--muted)';
      var ch2 = el('div', 'chips'); ch2.setAttribute('role', 'group'); ch2.setAttribute('aria-label', c[1] + ': ' + c[4][0]);
      c[4][1].forEach(function (e) { var bt = el('button', '', e); bt.dataset.checkEl = c[0]; bt.dataset.el = e; bt.setAttribute('aria-pressed', els.indexOf(e) >= 0); ch2.appendChild(bt); });
      w.appendChild(ch2);
    }
    var tq = el('div', 'q', 'Did it work when you tested it?'); tq.id = 'ct-' + c[0]; tq.style.fontSize = '14px'; tq.style.marginTop = '4px'; w.appendChild(tq);
    var r = el('div', 'rate'); r.setAttribute('role', 'group'); r.setAttribute('aria-labelledby', 'ct-' + c[0]);
    RATE.forEach(function (o) { var bt = el('button', '', o[1]); bt.dataset.check = c[0]; bt.dataset.r = o[0]; bt.setAttribute('aria-pressed', cur.r === o[0]); r.appendChild(bt); });
    w.appendChild(r);
    var wc = el('div', 'chips'); wc.setAttribute('role', 'group'); wc.setAttribute('aria-label', c[1] + ': who tested it?');
    WHO.forEach(function (o) { var bt = el('button', '', o[1]); bt.dataset.checkWho = c[0]; bt.dataset.who = o[0]; bt.setAttribute('aria-pressed', who.indexOf(o[0]) >= 0); wc.appendChild(bt); });
    w.appendChild(wc); c2.appendChild(w);
  });
  P.appendChild(c2);
  var nx = el('button', 'btn send', 'Next: map the user flow'); nx.dataset.goMode = 'flow'; P.appendChild(nx);
}
function renderFlowPanel() {
  var P = document.getElementById('flowPanel'); P.innerHTML = '';
  var ur = el('div', 'undo-row'); ur.innerHTML = '<button class="btn quiet" data-undo title="Undo (Ctrl+Z)"><span aria-hidden="true">&#x21B6;</span> Undo</button><button class="btn quiet" data-redo title="Redo (Ctrl+Shift+Z)">Redo <span aria-hidden="true">&#x21B7;</span></button>';
  P.appendChild(ur); if (typeof updateUndoBtns === 'function' && lastSnap !== null) updateUndoBtns();
  var rm = el('div', 'ux-remind');
  rm.innerHTML = '<b>Your visitor</b>' + esc(ux.about.aud || 'Not named yet. Answer the questions in Reflect first.') + (ux.about.goal ? '<b style="margin-top:6px">What they should do</b>' + esc(ux.about.goal) : '');
  P.appendChild(rm);
  var how = el('div', 'ux-card'); how.appendChild(el('h2', '', 'Map their visit'));
  how.appendChild(el('p', '', 'Tap where your visitor looks first. Then tap where they go next. An arrow appears. Keep tapping to show their whole visit. You can also drag from one part to another.'));
  how.appendChild(el('p', '', 'You can tap a box, a heading, a button, a link, or a nav bar.'));
  P.appendChild(how);
  var ns = el('div', 'ux-remind'); ns.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#FFF3E8;border-color:#F0B27A';
  ns.appendChild(el('span', '', flowPending ? 'Next arrow starts at: ' : 'Next arrow: tap where it starts.'));
  if (flowPending) { ns.lastChild.appendChild(el('b', '', nodeName(flowPending))); var cs = el('button', 'btn quiet', 'Clear start'); cs.dataset.clearStart = '1'; cs.style.padding = '3px 10px'; ns.appendChild(cs); }
  P.appendChild(ns);
  if (!ux.flow.length) P.appendChild(el('p', 'help', 'No arrows yet.'));
  ux.flow.forEach(function (st, i) {
    var c = el('div', 'step' + (i === flowActive ? ' active' : '')); c.dataset.step = i;
    var h = el('div', 'step-head'); h.appendChild(el('span', 'step-num', String(i + 1))); h.appendChild(el('span', '', nodeName(st.from) + ' \u2192 ' + nodeName(st.to)));
    var x = el('button', 'img-del x', '\u2715'); x.style.position = 'static'; x.dataset.delStep = i; x.setAttribute('aria-label', 'Delete step ' + (i + 1)); h.appendChild(x);
    c.appendChild(h);
    var fx = el('div', 'kind-row'); fx.style.cssText = 'flex-wrap:wrap;font-size:13px;gap:6px';
    fx.appendChild(document.createTextNode('From')); fx.appendChild(nodeSelect(st.from, i, 'from')); fx.appendChild(document.createTextNode('to')); fx.appendChild(nodeSelect(st.to, i, 'to'));
    c.appendChild(fx);
    var t = ta('st-' + i, st.act); t.placeholder = 'What does the visitor do here? Example: reads the title, clicks Read more.'; t.dataset.stepAct = i; t.setAttribute('aria-label', 'Step ' + (i + 1) + ': what does the visitor do?');
    c.appendChild(t);
    var hl = el('div', 'q', 'What helps them here?'); hl.style.fontSize = '14px'; hl.style.fontWeight = '700'; c.appendChild(hl);
    var ch = el('div', 'chips'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', 'Step ' + (i + 1) + ': what helps them?');
    HELPS.forEach(function (hp) { var b = el('button', '', hp); b.dataset.stepHelp = i; b.dataset.help = hp; b.setAttribute('aria-pressed', (st.helps || []).indexOf(hp) >= 0); ch.appendChild(b); });
    c.appendChild(ch); P.appendChild(c);
  });
  if (ux.flow.length) {
    var end = el('div', 'ux-card'); end.appendChild(el('h2', '', 'Look at your whole path'));
    end.appendChild(el('p', '', 'Does it reach what you want visitors to do' + (ux.about.goal ? ' (' + ux.about.goal + ')' : '') + '? Is anything in the way? Fix your page in Build, then come back.'));
    P.appendChild(end);
    var cl = el('button', 'btn quiet', 'Clear all arrows'); cl.id = 'clearFlow'; P.appendChild(cl);
  }
}
function setMode(m) {
  if (!UX_ON) m = 'build';
  if (m !== 'build' && app.classList.contains('show-code')) document.getElementById('codeBtn').click();
  ux.mode = m; flowPending = null; selected = null;
  ['build', 'reflect', 'flow'].forEach(function (k) { app.classList.toggle('mode-' + k, k === m); });
  document.querySelectorAll('.mode').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.mode === m); });
  document.getElementById('buildSide').hidden = m !== 'build';
  document.getElementById('reflectPanel').hidden = m !== 'reflect';
  document.getElementById('flowPanel').hidden = m !== 'flow';
  if (m === 'reflect') renderReflectPanel();
  if (m === 'flow') renderFlowPanel();
  renderComic(); uxSave();
  say(m === 'build' ? 'Build mode.' : m === 'reflect' ? 'Reflect mode. Building is paused.' : 'User flow mode. Tap parts of your page to draw arrows.');
}
document.getElementById('modeSwitch').addEventListener('click', function (e) { var b = e.target.closest('.mode'); if (b) setMode(b.dataset.mode); });
document.querySelector('.side').addEventListener('input', function (e) {
  var t = e.target, d = t.dataset || {};
  if (d.about) {
    ux.about[d.about] = t.value; uxSave();
    if (d.about === 'brand') { var sm = document.querySelector('#ck-brand small'); if (sm) sm.textContent = CHECKS[5][2] + (t.value.trim() ? ' (Your words: ' + t.value.trim() + ')' : ''); }
  }
  else if (d.checkNote) { ux.checks[d.checkNote] = ux.checks[d.checkNote] || {}; ux.checks[d.checkNote].note = t.value; uxSave(); }
  else if (d.stepAct !== undefined) { ux.flow[+d.stepAct].act = t.value; uxSave(); }
});
document.querySelector('.side').addEventListener('click', function (e) {
  var t = e.target.closest('button'); if (!t) return; var d = t.dataset;
  if (d.check) { ux.checks[d.check] = ux.checks[d.check] || {}; ux.checks[d.check].r = ux.checks[d.check].r === d.r ? '' : d.r; uxSave();
    t.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.r === ux.checks[d.check].r); }); }
  else if (d.checkEl || d.checkWho) {
    var key = d.checkEl || d.checkWho, field = d.checkEl ? 'els' : 'who', val = d.checkEl ? d.el : d.who;
    var ck = ux.checks[key] = ux.checks[key] || {}; ck[field] = ck[field] || [];
    var at = ck[field].indexOf(val); if (at >= 0) ck[field].splice(at, 1); else ck[field].push(val);
    t.setAttribute('aria-pressed', at < 0); uxSave();
  }
  else if (d.goMode) setMode(d.goMode);
  else if (d.clearStart) { flowPending = null; markFlowNodes(); renderFlowPanel(); say('Start cleared. Tap where the next arrow should start.'); }
  else if (d.delStep !== undefined) { ux.flow.splice(+d.delStep, 1); flowActive = -1; flowPending = ux.flow.length ? ux.flow[ux.flow.length - 1].to : null; markFlowNodes(); uxSave(); renderFlowPanel(); drawFlow(); say('Step deleted.'); }
  else if (d.stepHelp !== undefined) { var st = ux.flow[+d.stepHelp]; st.helps = st.helps || []; var k = st.helps.indexOf(d.help); if (k >= 0) st.helps.splice(k, 1); else st.helps.push(d.help); t.setAttribute('aria-pressed', k < 0); uxSave(); }
  else if (t.id === 'clearFlow') { if (ask('Clear all your arrows?', 'Clear', function () { document.getElementById('clearFlow').click(); })) { ux.flow = []; flowPending = null; flowActive = -1; uxSave(); renderFlowPanel(); markFlowNodes(); drawFlow(); } }
});
document.getElementById('flowPanel').addEventListener('change', function (e) {
  var t = e.target; if (t.dataset.stepNode === undefined) return;
  var st = ux.flow[+t.dataset.stepNode]; if (!st) return;
  st[t.dataset.end] = t.value; if (st.from === st.to) say('That arrow starts and ends in the same place. Pick a different part.');
  if (+t.dataset.stepNode === ux.flow.length - 1 && t.dataset.end === 'to') flowPending = t.value;
  uxSave(); renderFlowPanel(); markFlowNodes(); drawFlow(); say('Step ' + (+t.dataset.stepNode + 1) + ' now goes from ' + nodeName(st.from) + ' to ' + nodeName(st.to) + '.');
});
document.getElementById('flowPanel').addEventListener('focusin', function (e) { var c = e.target.closest('.step'); if (c && +c.dataset.step !== flowActive) { flowActive = +c.dataset.step; document.querySelectorAll('.step').forEach(function (s) { s.classList.toggle('active', +s.dataset.step === flowActive); }); drawFlow(); } });
function uxText() {
  var o = 'ABOUT MY VISITORS\n';
  ABOUT_QS.forEach(function (q) { o += '- ' + q[1] + ' ' + (ux.about[q[0]] || '(not answered)') + '\n'; });
  o += '\nDESIGN CHECK (UI elements I used, and whether they worked when tested)\n';
  CHECKS.forEach(function (c) {
    var r = ux.checks[c[0]] || {}, nm = {yes:'Yes', almost:'Partly', not:'Not yet'}[r.r] || '(not tested yet)';
    var who = (r.who || []).map(function (w) { return w === 'me' ? 'me' : 'someone from my audience'; });
    o += '- ' + c[1] + ': ' + ((r.els || []).length ? r.els.join(', ') : '(no UI elements picked)') + '. Worked when tested: ' + nm + (who.length ? ' (tested by ' + who.join(' and ') + ')' : '') + '\n';
  });
  o += '\nUSER FLOW\n';
  if (!ux.flow.length) o += '(no arrows yet)\n';
  ux.flow.forEach(function (st, i) { o += (i + 1) + '. ' + nodeName(st.from) + ' -> ' + nodeName(st.to) + (st.act ? ': ' + st.act : '') + ((st.helps || []).length ? ' (helped by: ' + st.helps.join(', ') + ')' : '') + '\n'; });
  return o;
}
if (UX_ON) document.getElementById('modeSwitch').hidden = false;
if (UX_ON && ux.mode && ux.mode !== 'build') setTimeout(function () { setMode(ux.mode); }, 0); else ux.mode = 'build';
/* ---------- comic / code slider ---------- */
var stage = document.getElementById('stage'), splitter = document.getElementById('splitter');
var codeSplit = 45;
try { var cs0 = +localStorage.getItem(KEY + '-split'); if (cs0 >= 0 && cs0 <= 100 && localStorage.getItem(KEY + '-split') !== null) codeSplit = cs0; } catch (e) {}
function setSplit(v, announce) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (v > 0 && v < 20) v = v < 10 ? 0 : 20;          /* snap: a sliver of code isn't useful */
  if (v < 100 && v > 80) v = v > 90 ? 100 : 80;
  codeSplit = v;
  stage.style.setProperty('--codew', v);
  stage.classList.toggle('ui-only', v === 0); stage.classList.toggle('code-only', v === 100);
  splitter.setAttribute('aria-valuenow', v);
  splitter.setAttribute('aria-valuetext', v === 0 ? 'Only the comic' : v === 100 ? 'Only the code' : v + ' percent code');
  try { localStorage.setItem(KEY + '-split', v); } catch (e) {}
  if (announce) say(v === 0 ? 'Showing only your comic.' : v === 100 ? 'Showing only your code.' : 'Comic and code side by side.');
}
setSplit(codeSplit);
var sd = null;
splitter.addEventListener('pointerdown', function (e) {
  if (e.target.closest('button')) return;
  e.preventDefault(); splitter.setPointerCapture(e.pointerId); sd = true; splitter.classList.add('dragging');
});
splitter.addEventListener('pointermove', function (e) {
  if (!sd) return; var r = stage.getBoundingClientRect();
  var v = (r.right - e.clientX) / r.width * 100;
  stage.style.setProperty('--codew', Math.max(0, Math.min(100, v)));
  stage.classList.toggle('ui-only', v < 10); stage.classList.toggle('code-only', v > 90);
});
function endSplit(e) {
  if (!sd) return; sd = null; splitter.classList.remove('dragging');
  var r = stage.getBoundingClientRect(); setSplit((r.right - e.clientX) / r.width * 100, true);
}
splitter.addEventListener('pointerup', endSplit); splitter.addEventListener('pointercancel', endSplit);
var STEPS = [0, 20, 35, 45, 55, 65, 80, 100];
function step(dir) {
  var i = 0; while (i < STEPS.length && STEPS[i] < codeSplit + (dir > 0 ? 0.5 : -0.5)) i++;
  var next = dir > 0 ? STEPS.find(function (v) { return v > codeSplit; }) : STEPS.slice().reverse().find(function (v) { return v < codeSplit; });
  if (next !== undefined) setSplit(next, true);
}
document.getElementById('moreCode').addEventListener('click', function () { step(1); });
document.getElementById('moreComic').addEventListener('click', function () { step(-1); });
splitter.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); }
  else if (e.key === 'Home') { e.preventDefault(); setSplit(100, true); }
  else if (e.key === 'End') { e.preventDefault(); setSplit(0, true); }
});
document.getElementById('ideClose').addEventListener('click', function () { document.getElementById('codeBtn').click(); });
document.getElementById('codeBtn').addEventListener('click', function () { if (!app.classList.contains('show-code') && codeSplit === 0) setSplit(45); });
document.getElementById('tagsBtn').addEventListener('click', function () {
  var on = app.classList.toggle('show-tags'); this.setAttribute('aria-pressed', on); this.textContent = on ? 'Hide tags' : 'Show tags';
});
document.getElementById('codeBtn').addEventListener('click', function () {
  var on = app.classList.toggle('show-code'); this.setAttribute('aria-pressed', on); this.textContent = on ? 'Hide my code' : 'Show my code';

});
document.getElementById('clearBtn').addEventListener('click', function () {
  if (!Object.keys(placed).length && panelCount === 6 && JSON.stringify(sizes) === JSON.stringify(DEFAULT_SIZES)) return;
  if (ask('Take everything off the page and go back to 6 panels?', 'Clear page', function () { document.getElementById('clearBtn').click(); })) { placed = {}; capPos = {}; panelCount = 6; sizes = JSON.parse(JSON.stringify(DEFAULT_SIZES)); selected = null; say('Page cleared.'); render(); }
});
document.getElementById('file').addEventListener('change', function () {
  Array.prototype.forEach.call(this.files, function (f) {
    var r = new FileReader();
    r.onload = function () {
      var name = f.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'drawing';
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, 800 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        var keepClear = /png|gif|webp|svg/i.test(f.type || f.name);   /* these can be see-through: keep the transparency */
        var g = c.getContext('2d'); if (!keepClear) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(im, 0, 0, c.width, c.height);
        var newId = 'add-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        extra.push({id:newId, alt:'My drawing ' + (extra.length + 1), src:keepClear ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85), file:name + (keepClear ? '.png' : '.jpg')});
        if (pendingBg && Date.now() - pendingAt > 120000) pendingBg = null;   /* a cancelled upload from long ago does not count */
        if (pendingBg) { bgs[pendingBg] = bgs[pendingBg] || {}; bgs[pendingBg].img = newId; bgs[pendingBg].fit = 'cover'; toast('Background picture added. Change it any time in Resize.'); pendingBg = null; }
        showTab('draw'); render(); say('Drawing added.');
      };
      im.onerror = function () { say('That file is not a picture. Try a JPG or PNG.'); };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  });
  this.value = '';
});
/* ---------- undo and redo ---------- */
function undoState() {
  return JSON.stringify({placed:placed, words:words, capPos:capPos, sizes:sizes, theme:theme, bgs:bgs, splits:splits, boxPad:boxPad, picFit:picFit, picPos:picPos,
    mediaW:mediaW, areaH:areaH, cardSizes:cardSizes, cardRows:cardRows, classNames:classNames, panelCount:panelCount, hidden:hidden, flow:ux.flow});
}
var past = [], future = [], lastSnap = null, pendingPrev = null, histTimer = null, restoring = false;
function trackHistory() {
  if (restoring || lastSnap === null) return;
  var cur = undoState(); if (cur === lastSnap) return;
  if (pendingPrev === null) pendingPrev = lastSnap;
  lastSnap = cur; future = [];
  clearTimeout(histTimer); histTimer = setTimeout(commitHistory, 600);
  updateUndoBtns();
}
function commitHistory() {
  clearTimeout(histTimer);
  if (pendingPrev !== null) { past.push(pendingPrev); if (past.length > 80) past.shift(); pendingPrev = null; }
  updateUndoBtns();
}
function applyState(js) {
  var o = JSON.parse(js); restoring = true;
  placed = o.placed; words = o.words; mediaW = o.mediaW || {}; areaH = o.areaH || {}; capPos = o.capPos; sizes = o.sizes; theme = o.theme; bgs = o.bgs; splits = o.splits; boxPad = o.boxPad; picFit = o.picFit; picPos = o.picPos;
  cardSizes = o.cardSizes; cardRows = o.cardRows; classNames = o.classNames; panelCount = o.panelCount; hidden = o.hidden; ux.flow = o.flow || [];
  selected = null; picFocus = null; panKey = null; padShow = null;
  if (typeof flowPending !== 'undefined') { flowPending = ux.flow.length ? ux.flow[ux.flow.length - 1].to : null; flowActive = ux.flow.length - 1; }
  render(); if (ux.mode === 'flow' && typeof renderFlowPanel === 'function') renderFlowPanel();
  restoring = false; lastSnap = js; updateUndoBtns();
}
function undo() { commitHistory(); if (!past.length) { say('Nothing to undo.'); return; } future.push(lastSnap); applyState(past.pop()); say('Undone.'); }
function redo() { commitHistory(); if (!future.length) { say('Nothing to redo.'); return; } past.push(lastSnap); applyState(future.pop()); say('Redone.'); }
function updateUndoBtns() {
  var canU = !!(past.length || pendingPrev !== null), canR = !!future.length;
  document.querySelectorAll('[data-undo]').forEach(function (b) { b.disabled = !canU; });
  document.querySelectorAll('[data-redo]').forEach(function (b) { b.disabled = !canR; });
}
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-undo]')) { undo(); var u = document.querySelector('.ux-panel:not([hidden]) [data-undo], #undoBtn'); if (u && !u.disabled) u.focus(); }
  else if (e.target.closest('[data-redo]')) { redo(); var r = document.querySelector('.ux-panel:not([hidden]) [data-redo], #redoBtn'); if (r && !r.disabled) r.focus(); }
});
document.addEventListener('keydown', function (e) {
  if (!(e.ctrlKey || e.metaKey) || anyModal()) return;
  if (e.key.toLowerCase() === 'd' && selected && slotOf(selected) && !/^(input|textarea|select)$/i.test(e.target.tagName || '')) { e.preventDefault(); duplicateSelected(); return; }
  var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  var k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});

render();
lastSnap = undoState(); updateUndoBtns();
allPieces().forEach(function (p) { if (p.type === 'img' && !p.ph) { var im = new Image(); im.onload = function () { imgRatio[p.id] = im.naturalWidth / im.naturalHeight || 1.33; fitMedia(); }; im.src = p.src; } });
window.__plannerReady = true;
(function () { var b = document.getElementById('bootMsg'); if (b && !b.dataset.err) b.style.display = 'none'; })();
