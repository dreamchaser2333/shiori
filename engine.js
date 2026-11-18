/* 時の栞・運算核心：日期、行程展開、作息壓縮、提醒。不碰畫面，可單獨測試。 */
(function (G) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const today = () => ds(new Date());
  const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
  const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5); // b - a
  const dow = s => { const w = pd(s).getDay(); return w === 0 ? 7 : w; }; // 一=1 … 日=7
  const tm = t => { if (t == null || t === '') return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const WK = ['', '一', '二', '三', '四', '五', '六', '日'];

  const DEFAULT_CATS = {
    '睡眠': { prio: 99, sleep: true, color: 'sleep' },
    '用餐': { prio: 50, fixed: true, color: 'meal' },
    '自媒體': { prio: 3, color: 'media' },
    '學習': { prio: 2, color: 'study' },
    '娛樂': { prio: 1, color: 'play' }
  };
  const WORK_KINDS = ['打工'];
  const BUFFER_EVENT_KINDS = ['換班']; // 換班仍是自己的固定工作，一樣預留準備與出發
  const MIN_KEEP = 30;   // 壓縮時每段最短保留
  const MIN_PIECE = 15;  // 少於這個長度的空檔不拿來排

  function cats(st) { return Object.assign({}, DEFAULT_CATS, (st.plans && st.plans.cats) || {}); }

  /* ---------- 行程展開 ---------- */
  function seriesOn(s, d) {
    if (s.from && d < s.from) return false;
    if (s.to && d > s.to) return false;
    return (s.weekdays || []).includes(dow(d));
  }

  function itemsForDate(st, d) {
    const out = [];
    for (const s of st.series || []) {
      if (!seriesOn(s, d)) continue;
      const ex = (st.exceptions || []).find(e => e.seriesId === s.id && e.date === d);
      const it = {
        key: 's:' + s.id + ':' + d, src: 'series', ref: s.id, kind: s.kind || '其他', title: s.title,
        start: tm(s.start), end: tm(s.end), place: s.place || '', note: s.note || '', link: s.link || '',
        cancelled: false, changed: false, ex: ex || null
      };
      if (ex) {
        if (ex.type === 'cancel') { it.cancelled = true; it.reason = ex.reason || '取消'; it.cover = ex.cover || ''; }
        else if (ex.type === 'modify') {
          it.changed = true;
          if (ex.start) it.start = tm(ex.start);
          if (ex.end) it.end = tm(ex.end);
          if (ex.place) it.place = ex.place;
          if (ex.note) it.note = ex.note;
          it.reason = ex.reason || '變動';
        }
      }
      out.push(it);
    }
    for (const e of st.events || []) {
      if (e.date !== d) continue;
      out.push({
        key: 'e:' + e.id, src: 'event', ref: e.id, kind: e.kind || '其他', title: e.title,
        start: tm(e.start), end: tm(e.end) ?? tm(e.start), place: e.place || '', note: e.note || '', link: e.link || '',
        cancelled: false, changed: false, work: !!e.work
      });
    }
    out.sort((a, b) => a.start - b.start || a.end - b.end);
    return out;
  }

  function needsBuffer(it) {
    return !it.cancelled && ((it.src === 'series' && WORK_KINDS.includes(it.kind)) || (it.src === 'event' && BUFFER_EVENT_KINDS.includes(it.kind)));
  }

  function buffersFor(st, items) {
    const set = st.settings || {};
    const prep = set.prep ?? 30, go = set.depart ?? 15;
    const out = [];
    for (const it of items) {
      if (!needsBuffer(it)) continue;
      const s0 = Math.max(0, it.start - prep), s1 = Math.max(0, it.start - go);
      if (s1 > s0) out.push({ key: 'b1:' + it.key, buffer: true, title: '準備', for: it.title, start: s0, end: s1 });
      if (it.start > s1) out.push({ key: 'b2:' + it.key, buffer: true, title: '出發', for: it.title, start: s1, end: it.start });
    }
    return out;
  }

  /* ---------- 區間工具 ---------- */
  function merge(iv) {
    const a = iv.filter(x => x[1] > x[0]).map(x => [x[0], x[1]]).sort((p, q) => p[0] - q[0]);
    const r = [];
    for (const x of a) { if (r.length && x[0] <= r[r.length - 1][1]) r[r.length - 1][1] = Math.max(r[r.length - 1][1], x[1]); else r.push(x); }
    return r;
  }
  function subtract(base, cut) { // base、cut 皆為已合併區間
    let res = base.map(x => [x[0], x[1]]);
    for (const c of cut) {
      const nx = [];
      for (const b of res) {
        if (c[1] <= b[0] || c[0] >= b[1]) { nx.push(b); continue; }
        if (c[0] > b[0]) nx.push([b[0], c[0]]);
        if (c[1] < b[1]) nx.push([c[1], b[1]]);
      }
      res = nx;
    }
    return res;
  }
  const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
  const total = iv => iv.reduce((s, x) => s + x[1] - x[0], 0);

  /* ---------- 作息規劃 ---------- */
  function templateFor(st, d) {
    const P = st.plans || {};
    const rule = (P.rules || []).filter(r => (!r.from || d >= r.from) && (!r.to || d <= r.to) && (r.weekdays || []).includes(dow(d))).pop();
    if (!rule) return null;
    return (P.templates || []).find(t => t.id === rule.templateId) || null;
  }

  function planBlocks(st, d) {
    const t = templateFor(st, d);
    if (!t) return [];
    const off = (st.planSkip && st.planSkip[d]) || [];
    const out = [];
    (t.blocks || []).forEach((b, i) => {
      const s = tm(b.start), e = tm(b.end);
      const base = { cat: b.cat, label: b.label || b.cat, tpl: t.id, idx: i };
      const parts = e > s ? [[s, e]] : [[s, 1440], [0, e]]; // 跨午夜的時段拆成晚上與清晨兩段
      parts.forEach((p, j) => { if (p[1] > p[0]) out.push(Object.assign({}, base, { key: t.id + ':' + i + ':' + j, start: p[0], end: p[1], skipped: off.includes(t.id + ':' + i) })); });
    });
    return out;
  }

  /* 壓縮規則：
     1. 課、打工、臨時安排（含打工前的準備與出發）最優先；睡眠與用餐不讓給規劃。
     2. 規劃時段被佔走時，先保留原位置剩下的部分，不夠的移到當天其他空檔（找離原時間最近的）。
     3. 當天空檔放不下全部規劃時，各段平均減少同樣分鐘數，每段最少留 30 分鐘。
     4. 都到 30 分鐘還放不下，依序取消：娛樂 → 學習 → 自媒體，取消後其餘時段恢復原長再重算。
     5. 只在當天內調整，不挪到隔天。 */
  function waterfill(blocks, cap) {
    const L = blocks.map(b => b.len), f = L.map(x => Math.min(x, MIN_KEEP));
    const sum = L.reduce((a, b) => a + b, 0);
    if (sum <= cap) return L.slice();
    if (f.reduce((a, b) => a + b, 0) > cap) return null;
    let lo = 0, hi = Math.max(...L);
    for (let k = 0; k < 40; k++) {
      const x = (lo + hi) / 2;
      const s = L.reduce((a, l, i) => a + Math.max(f[i], l - x), 0);
      if (s > cap) lo = x; else hi = x;
    }
    return L.map((l, i) => Math.max(f[i], Math.floor((l - hi) / 5) * 5));
  }

  function nearestPlace(gaps, len, pref) {
    let best = null;
    for (let i = 0; i < gaps.length; i++) {
      const [a, b] = gaps[i];
      if (b - a < len) continue;
      const s = Math.min(Math.max(pref, a), b - len);
      const dist = Math.abs(s - pref);
      if (!best || dist < best.dist) best = { i, s, dist };
    }
    return best;
  }
  function take(gaps, s, e) { return merge(subtract(gaps, [[s, e]])).filter(g => g[1] - g[0] > 0); }

  function layout(st, d) {
    const C = cats(st);
    const items = itemsForDate(st, d);
    const live = items.filter(i => !i.cancelled);
    const bufs = buffersFor(st, live);
    const hard = merge(live.map(i => [i.start, Math.max(i.end, i.start + 1)]).concat(bufs.map(b => [b.start, b.end])));
    const blocks = planBlocks(st, d).filter(b => !b.skipped);
    const skipped = planBlocks(st, d).filter(b => b.skipped);
    const fixed = [], soft = [];
    for (const b of blocks) { const c = C[b.cat] || { prio: 2 }; (c.sleep || c.fixed ? fixed : soft).push(Object.assign({ prio: c.prio ?? 2, sleep: !!c.sleep }, b)); }

    // 睡眠、用餐：不移動；被硬性行程壓到的部分標示出來
    const fixedOut = fixed.map(b => {
      const lost = hard.filter(h => overlaps(h, [b.start, b.end])).map(h => [Math.max(h[0], b.start), Math.min(h[1], b.end)]);
      return Object.assign({}, b, { conflict: lost.length > 0, lost });
    });
    const blocked = merge(hard.concat(fixed.map(b => [b.start, b.end])));
    // 可用範圍：早上起床（清晨睡眠結束）到晚上就寢；午夜到起床前屬於前一晚，不排規劃
    const sl = fixed.filter(b => b.sleep);
    const wake = Math.max(0, ...sl.filter(b => b.start < 720).map(b => b.end));
    const bed = Math.min(1440, ...sl.filter(b => b.start >= 720).map(b => b.start));
    let gaps = subtract([[wake, bed]], blocked).filter(g => g[1] - g[0] >= MIN_PIECE);
    const cap = total(gaps);

    // 決定每段的目標長度
    let pool = soft.map(b => Object.assign({ len: b.end - b.start }, b));
    const cancelled = [];
    let lens;
    while (pool.length) {
      lens = waterfill(pool, cap);
      if (lens) break;
      // 取消最低優先、同優先取時間較晚的一段
      let k = 0;
      pool.forEach((b, i) => { if (b.prio < pool[k].prio || (b.prio === pool[k].prio && b.start > pool[k].start)) k = i; });
      cancelled.push(Object.assign({ status: 'cancel' }, pool[k]));
      pool.splice(k, 1);
    }
    pool.forEach((b, i) => { b.target = lens[i]; b.pieces = []; });

    // 第一輪：原位置還能用的部分先保留
    for (const b of pool) {
      let need = b.target;
      const here = subtract([[b.start, b.end]], subtract([[0, 1440]], gaps)).filter(g => g[1] - g[0] >= Math.min(MIN_PIECE, need));
      for (const g of here) {
        if (need <= 0) break;
        const e = Math.min(g[1], g[0] + need);
        b.pieces.push([g[0], e]); need -= e - g[0]; gaps = take(gaps, g[0], e);
      }
      b.rest = need;
    }
    // 第二輪：不夠的部分移到最近的空檔（優先度高的先挑）
    const order = pool.slice().sort((p, q) => q.prio - p.prio || p.start - q.start);
    for (const b of order) {
      let need = b.rest, guard = 0;
      while (need > 0 && guard++ < 20) {
        const pref = b.pieces.length ? b.pieces[b.pieces.length - 1][1] : b.start;
        let spot = nearestPlace(gaps, need, b.start);
        if (spot) { b.pieces.push([spot.s, spot.s + need]); gaps = take(gaps, spot.s, spot.s + need); need = 0; break; }
        // 沒有一整段放得下：拿離原時間最近、夠長的空檔切一塊
        const usable = gaps.filter(g => g[1] - g[0] >= Math.min(MIN_PIECE, need));
        if (!usable.length) break;
        usable.sort((p, q) => Math.abs(p[0] - pref) - Math.abs(q[0] - pref));
        const g = usable[0], e = Math.min(g[1], g[0] + need);
        b.pieces.push([g[0], e]); gaps = take(gaps, g[0], e); need -= e - g[0];
      }
      b.lostMin = need;
    }

    const softOut = [];
    for (const b of pool) {
      const got = b.pieces.reduce((s, p) => s + p[1] - p[0], 0);
      const inPlace = b.pieces.every(p => p[0] >= b.start && p[1] <= b.end);
      let status = 'keep';
      if (got < b.len) status = 'shrunk';
      if (!inPlace) status = got < b.len ? 'moved-shrunk' : 'moved';
      if (got === 0) { cancelled.push(Object.assign({}, b, { status: 'cancel' })); continue; }
      const ps = merge(b.pieces);
      const split = ps.some(p => p[0] < b.start || p[1] > b.end);
      ps.forEach((p, j) => {
        const here = p[0] >= b.start && p[1] <= b.end;
        softOut.push({
          key: b.key + '#' + j, cat: b.cat, label: b.label, tpl: b.tpl, idx: b.idx, prio: b.prio,
          start: p[0], end: p[1], orig: [b.start, b.end], status, origLen: b.len, got,
          moved: !here, partial: here && split, shrunk: got < b.len
        });
      });
    }

    const timeline = [];
    items.forEach(i => timeline.push(Object.assign({ type: i.cancelled ? 'cancelled' : 'hard' }, i)));
    bufs.forEach(b => timeline.push(Object.assign({ type: 'buffer' }, b)));
    fixedOut.forEach(b => timeline.push(Object.assign({ type: b.sleep ? 'sleep' : 'fixed' }, b)));
    softOut.forEach(b => timeline.push(Object.assign({ type: 'plan' }, b)));
    timeline.sort((a, b) => a.start - b.start || (a.type === 'hard' ? -1 : 1));

    const planned = {};
    softOut.forEach(b => { planned[b.cat] = (planned[b.cat] || 0) + b.end - b.start; });
    const wanted = {};
    soft.forEach(b => { wanted[b.cat] = (wanted[b.cat] || 0) + b.end - b.start; });
    return { date: d, items, buffers: bufs, fixed: fixedOut, plan: softOut, cancelled, skipped, timeline, planned, wanted, hasTemplate: !!templateFor(st, d), wake, bed };
  }

  /* ---------- 紀念日 ---------- */
  function annivNext(a, from) {
    const y = pd(from).getFullYear();
    const mk = yy => {
      let m = a.month, d = a.day;
      if (m === 2 && d === 29 && !((yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0)) d = 28;
      return yy + '-' + pad(m) + '-' + pad(d);
    };
    let date = mk(y);
    if (date < from) date = mk(y + 1);
    const years = a.year ? pd(date).getFullYear() - a.year : null;
    return { date, days: diffDays(from, date), years };
  }

  /* ---------- 提醒區 ---------- */
  function reminders(st, d) {
    const tmr = addDays(d, 1);
    const special = [];
    for (const day of [d, tmr]) {
      for (const it of itemsForDate(st, day)) {
        const isSpecial = it.src === 'event' || it.ex;
        if (!isSpecial) continue;
        special.push(Object.assign({ day, when: day === d ? '今天' : '明天' }, it));
      }
    }
    const dl = [];
    for (const x of st.deadlines || []) {
      if (x.status === 'submitted') continue;
      const left = diffDays(d, x.due);
      const lead = x.lead ?? 10;
      if (left < 0) { dl.push(Object.assign({ left, state: 'overdue' }, x)); continue; }
      if (left === 0) { dl.push(Object.assign({ left, state: 'dueToday' }, x)); continue; }
      if (x.status === 'done') continue; // 已完成：每日提醒停止，只在截止當天提醒繳交
      if (left <= lead) dl.push(Object.assign({ left, state: 'soon' }, x));
    }
    dl.sort((a, b) => a.left - b.left);
    const an = [];
    for (const a of st.annivs || []) {
      const n = annivNext(a, d);
      if (n.days <= (a.lead ?? 3)) an.push(Object.assign({}, a, n));
    }
    an.sort((a, b) => a.days - b.days);
    return { special, deadlines: dl, annivs: an };
  }

  function upcoming(st, d, days) {
    const out = [];
    for (let i = 2; i <= days; i++) {
      const day = addDays(d, i);
      for (const it of itemsForDate(st, day)) if (it.src === 'event' || it.ex) out.push(Object.assign({ day, kind2: 'item' }, it));
      for (const x of st.deadlines || []) if (x.due === day && x.status !== 'submitted') out.push({ day, kind2: 'deadline', title: x.title, kind: x.kind, ref: x.id });
      for (const a of st.annivs || []) { const n = annivNext(a, d); if (n.date === day) out.push({ day, kind2: 'anniv', title: a.name, kind: a.kind, years: n.years, ref: a.id }); }
      for (const t of st.todos || []) if (!t.done && t.date === day) out.push({ day, kind2: 'todo', title: t.title, kind: '待辦', ref: t.id });
    }
    return out.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : (a.start || 0) - (b.start || 0));
  }

  /* ---------- 打工時數 ---------- */
  function workHours(st, ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = y + '-' + pad(m) + '-01';
    const days = new Date(y, m, 0).getDate();
    const rows = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(first, i);
      for (const it of itemsForDate(st, d)) {
        if (it.cancelled) continue;
        const isWork = (it.src === 'series' && WORK_KINDS.includes(it.kind)) || (it.src === 'event' && it.work);
        if (isWork) rows.push({ date: d, title: it.title, kind: it.src === 'series' ? (it.changed ? '固定班（有變動）' : '固定班') : it.kind, min: Math.max(0, it.end - it.start), start: it.start, end: it.end });
      }
    }
    return { rows, total: rows.reduce((s, r) => s + r.min, 0) };
  }

  const Engine = { pad, ds, pd, today, addDays, diffDays, dow, tm, hm, WK, DEFAULT_CATS, cats, itemsForDate, buffersFor, layout, planBlocks, templateFor, annivNext, reminders, upcoming, workHours, merge, subtract };
  G.Engine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
