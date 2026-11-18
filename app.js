/* 時の栞・畫面與操作。資料只存在這支手機的瀏覽器裡（localStorage: shiori）。 */
(function () {
  'use strict';
  const E = window.Engine;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const KEY = 'shiori';
  const SKINS = [
    { id: 'hiiro', name: '緋刻', sw: 'linear-gradient(135deg,#0f0a0d 40%,#c8323f 40% 70%,#c9a45c 70%)', dark: true, theme: '#0f0a0d', fx: 'star' },
    { id: 'tsukuyo', name: '月詠', sw: 'linear-gradient(135deg,#0a0c18 40%,#8d7cf2 40% 70%,#c8cde6 70%)', dark: true, theme: '#0a0c18', fx: 'star' },
    { id: 'sakura', name: '櫻花', sw: 'linear-gradient(135deg,#fff4f6 40%,#ee6c92 40% 70%,#f9a8c0 70%)', theme: '#ffe9ee', fx: 'petal' },
    { id: 'ajisai', name: '紫陽花', sw: 'linear-gradient(135deg,#f3f4fc 40%,#7a7fd6 40% 70%,#c4b6f0 70%)', theme: '#e9ebfa', fx: 'petal' },
    { id: 'yuki', name: '初雪', sw: 'linear-gradient(135deg,#f2f6fa 40%,#5b83c4 40% 70%,#ffffff 70%)', theme: '#e4ecf5', fx: 'snow' }
  ];
  const VERSES = ['光陰者，百代之過客', '寸陰是競', '一寸光陰一寸金', '日月逝矣，歲不我與', '盛年不重來，一日難再晨', '及時當勉勵，歲月不待人'];
  const KIND_COLOR = { '課程': 'var(--c-course)', '打工': 'var(--c-work)', '換班': 'var(--c-work)', '代班': 'var(--c-work)', '臨時工作': 'var(--c-temp)', '會議': 'var(--c-temp)', '活動': 'var(--c-temp)', '其他': 'var(--c-temp)' };
  const CAT_COLOR = { '學習': 'var(--c-study)', '自媒體': 'var(--c-media)', '娛樂': 'var(--c-play)', '睡眠': 'var(--c-sleep)', '用餐': 'var(--c-meal)' };
  const FOCUS_CATS = ['學習', '論文', '寫作', '自媒體'];
  const FOCUS_TO_PLAN = { '學習': '學習', '論文': '學習', '自媒體': '自媒體' };

  /* ---------- 資料 ---------- */
  function blank() {
    return {
      v: 1, settings: { skin: 'hiiro', prep: 30, depart: 15 },
      series: [], exceptions: [], events: [], deadlines: [], annivs: [],
      plans: { cats: {}, templates: [], rules: [] }, planSkip: {},
      sleep: [], focus: [], packs: { applied: [], later: null }, welcomed: false
    };
  }
  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.v) return Object.assign(blank(), j); } catch (e) { }
    return blank();
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('儲存失敗：手機空間可能不足'); } }

  /* ---------- 小工具 ---------- */
  const T = E.today;
  const fmtMD = d => { const p = E.pd(d); return (p.getMonth() + 1) + '/' + p.getDate(); };
  const fmtDay = d => fmtMD(d) + '（' + E.WK[E.dow(d)] + '）';
  const hm = E.hm;
  const dur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? h + ' 小時 ' + r + ' 分' : h + ' 小時') : r + ' 分'; };
  const durS = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? h + 'h' + r + 'm' : h + 'h') : r + 'm'; };
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const monday = d => E.addDays(d, 1 - E.dow(d));
  const isoLocal = dt => { const p = E.pad; return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + 'T' + p(dt.getHours()) + ':' + p(dt.getMinutes()); };
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }
  const ORN = '<svg class="orn" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6"/><path d="M8 3.5v4.5l3 1.6"/></svg>';

  /* ---------- 外觀 ---------- */
  function skin() { return SKINS.find(s => s.id === S.settings.skin) || SKINS[0]; }
  function applySkin() {
    const k = skin();
    document.documentElement.dataset.skin = k.id;
    document.querySelector('meta[name=theme-color]').setAttribute('content', k.theme);
  }

  /* ---------- 狀態 ---------- */
  let view = 'day', viewDate = T(), weekStart = monday(T()), monthYM = T().slice(0, 7);
  let lastLayout = null;

  /* ---------- 首頁：今日 ---------- */
  function sleepState() {
    const last = S.sleep[S.sleep.length - 1];
    return last && !last.w ? { asleep: true, rec: last } : { asleep: false, rec: last };
  }
  function heroHtml() {
    const d = T(), p = E.pd(d);
    const ss = sleepState();
    const verse = VERSES[(p.getDate() + p.getMonth()) % VERSES.length];
    const btn = ss.asleep
      ? `<button class="sleepbtn" data-act="wake">☀ 起床了<small>${new Date(ss.rec.s).getHours()}:${E.pad(new Date(ss.rec.s).getMinutes())} 入睡</small></button>`
      : `<button class="sleepbtn" data-act="sleep">☾ 要睡了</button>`;
    return `<section class="hero"><canvas id="clock"></canvas><div class="hero-in">
      <div class="date">${p.getFullYear()}年${p.getMonth() + 1}月${p.getDate()}日・星期${E.WK[E.dow(d)]}</div>
      <h1>時の栞</h1><div class="verse">${verse}</div>${btn}</div></section>`;
  }

  function remindersHtml() {
    const d = T();
    const R = E.reminders(S, d);
    let h = '';
    // 今日・明日的特別事項
    if (R.special.length) {
      h += `<section class="card"><div class="head"><h2>${ORN}今明兩日</h2><span class="sub">變動與臨時安排</span></div><ul class="rem">`;
      for (const it of R.special) {
        let what = it.kind, sub = [];
        if (it.src === 'series' && it.ex) {
          what = it.reason || (it.cancelled ? '取消' : '變動');
          if (it.ex.reason === '換班') { if (it.ex.note) sub.push(it.ex.note); if (it.cover) sub.push('和 ' + it.cover + ' 換'); }
          else if (it.cover) sub.push(it.cover + ' 代班');
          else if (it.ex.note) sub.push(it.ex.note);
        }
        sub.unshift(it.cancelled ? '原 ' + hm(it.start) + '–' + hm(it.end) : hm(it.start) + '–' + hm(it.end));
        if (it.place) sub.push(it.place);
        const link = it.link ? `<a class="btn sm" href="${esc(it.link)}" target="_blank" rel="noopener">開啟連結</a>` : '';
        h += `<li class="tap" data-act="item" data-key="${esc(it.key)}" data-date="${it.day}"><span class="badge ${it.when === '今天' ? 'hot' : ''}">${it.when}</span>
          <span class="t"><b>${esc(it.title)}<span class="tag">${esc(what)}</span></b><span>${esc(sub.join('・'))}</span></span>${link}</li>`;
      }
      h += '</ul></section>';
    }
    if (R.deadlines.length) {
      h += `<section class="card"><div class="head"><h2>${ORN}截止倒數</h2><span class="sub">10 天內每天提醒</span></div><ul class="rem">`;
      for (const x of R.deadlines) {
        let badge, hot = false, sub;
        if (x.state === 'overdue') { badge = `逾期<b>${-x.left}</b>`; hot = true; sub = '已過截止日 ' + fmtDay(x.due); }
        else if (x.state === 'dueToday') { badge = '<b>今天</b>'; hot = true; sub = x.status === 'done' ? '已完成，記得繳交' : '今天截止，要繳交'; }
        else { badge = `還有<b>${x.left}</b>天`; hot = x.left <= 2; sub = fmtDay(x.due) + (x.time ? ' ' + x.time : '') + ' 截止'; }
        const act = x.status === 'done' || x.state === 'dueToday' || x.state === 'overdue'
          ? `<button class="btn sm" data-act="dl-sub" data-id="${x.id}">已繳交</button>`
          : `<button class="btn sm ghost" data-act="dl-done" data-id="${x.id}">完成</button>`;
        h += `<li><span class="badge ${hot ? 'hot' : ''}">${badge}</span><span class="t tap" data-act="dl-edit" data-id="${x.id}"><b>${esc(x.title)}<span class="tag">${esc(x.kind)}</span></b><span>${esc(sub)}</span></span>${act}</li>`;
      }
      h += '</ul></section>';
    }
    if (R.annivs.length) {
      h += `<section class="card"><div class="head"><h2>${ORN}紀念日</h2></div><ul class="rem">`;
      for (const a of R.annivs) {
        const badge = a.days === 0 ? '<b>今天</b>' : `還有<b>${a.days}</b>天`;
        const yrs = a.years ? (a.kind === '生日' ? a.years + ' 歲' : a.years + ' 週年') : '';
        h += `<li class="tap" data-act="anniv-edit" data-id="${a.id}"><span class="badge ${a.days === 0 ? 'hot' : ''}">${badge}</span><span class="t"><b>${esc(a.name)}<span class="tag">${esc(a.kind)}</span></b><span>${fmtDay(a.date)}${yrs ? '・' + yrs : ''}${a.note ? '・' + esc(a.note) : ''}</span></span><span></span></li>`;
      }
      h += '</ul></section>';
    }
    return h;
  }

  function timelineHtml(d) {
    const L = E.layout(S, d);
    lastLayout = L;
    const isToday = d === T();
    let h = `<section class="card"><div class="daynav"><button class="arr" data-act="dprev" aria-label="前一天">‹</button>
      <div class="d">${fmtDay(d)}<small>${isToday ? '今天' : E.diffDays(T(), d) > 0 ? E.diffDays(T(), d) + ' 天後' : -E.diffDays(T(), d) + ' 天前'}</small></div>
      <button class="arr" data-act="dnext" aria-label="後一天">›</button></div>`;
    if (!isToday) h += `<div style="text-align:center;margin-bottom:4px"><button class="lnk" data-act="dtoday">回到今天</button></div>`;
    // 規劃摘要
    const cats = Object.keys(L.wanted);
    if (cats.length) {
      h += '<div class="chips">';
      for (const c of cats) {
        const got = L.planned[c] || 0, want = L.wanted[c];
        h += `<span class="chip">${esc(c)} <i>${got ? durS(got) : '取消'}</i>${got < want ? '／原 ' + durS(want) : ''}</span>`;
      }
      h += '</div>';
    }
    if (!L.timeline.length) {
      h += `<p class="muted" style="padding:10px 0">這天沒有任何行程。</p></section>`;
      return h;
    }
    h += '<ul class="tl">';
    const nm = nowMin();
    for (const t of L.timeline) {
      let cls = t.type, color, title, sub = [], tags = '';
      if (t.type === 'hard' || t.type === 'cancelled') {
        color = KIND_COLOR[t.kind] || 'var(--c-temp)';
        title = esc(t.title);
        tags += `<span class="tag">${esc(t.kind)}</span>`;
        if (t.cancelled) tags += `<span class="tag warn">${esc(t.reason)}</span>`;
        else if (t.changed) tags += `<span class="tag warn">${esc(t.reason)}</span>`;
        if (t.ex && t.ex.reason === '換班') { if (t.ex.note) sub.push(t.ex.note); if (t.cover) sub.push('和 ' + t.cover + ' 換'); }
        else if (t.cover) sub.push(t.cover + ' 代班');
        else if (t.ex && t.ex.note) sub.push(t.ex.note);
        if (t.place) sub.push(t.place);
        if (t.note) sub.push(t.note);
        if (t.link) sub.push('有會議連結');
      } else if (t.type === 'buffer') {
        color = 'var(--c-buffer)'; title = t.title + '<span class="tag">' + esc(t.for) + '</span>';
      } else if (t.type === 'sleep' || t.type === 'fixed') {
        color = CAT_COLOR[t.cat] || 'var(--c-meal)'; title = esc(t.label);
        if (t.conflict) tags += `<span class="tag warn">被行程佔用</span>`;
      } else {
        color = CAT_COLOR[t.cat] || 'var(--c-study)'; title = esc(t.label);
        if (t.moved) sub.push('原 ' + hm(t.orig[0]) + '–' + hm(t.orig[1]) + '，移到這裡');
        else if (t.partial) sub.push('原時段剩下的部分，其餘移到別處');
        if (t.shrunk) sub.push('縮短為 ' + dur(t.got) + '（原 ' + dur(t.origLen) + '）');
      }
      const act = t.type === 'hard' || t.type === 'cancelled' ? `data-act="item" data-key="${esc(t.key)}" data-date="${d}"` : t.type === 'plan' || t.type === 'fixed' || t.type === 'sleep' ? `data-act="plan" data-tpl="${t.tpl}" data-idx="${t.idx}" data-date="${d}"` : '';
      const nowCls = isToday && nm >= t.start && nm < t.end && t.type !== 'cancelled' ? ' style="background:var(--soft);border-radius:10px"' : '';
      h += `<li class="${cls} ${act ? 'tap' : ''}" ${act}${nowCls}><span class="tm"><b>${hm(t.start)}</b>${hm(t.end)}</span><span class="cb" style="--c:${color}"></span>
        <span class="bd"><b>${title}${tags}</b>${sub.length ? `<span>${esc(sub.join('・'))}</span>` : ''}</span></li>`;
    }
    h += '</ul>';
    const gone = L.cancelled.concat(L.skipped.map(b => Object.assign({ skip: true }, b)));
    if (gone.length) {
      h += '<ul class="lost">';
      for (const b of gone) h += `<li class="tap" data-act="plan" data-tpl="${b.tpl}" data-idx="${b.idx}" data-date="${d}">✕ ${esc(b.label)} ${hm(b.start)}–${hm(b.end)}　${b.skip ? '今天手動跳過' : '時間不夠，今日取消'}</li>`;
      h += '</ul>';
    }
    return h + '</section>';
  }

  function upcomingHtml() {
    const U = E.upcoming(S, T(), 14);
    if (!U.length) return '';
    let h = `<section class="card"><div class="head"><h2>${ORN}未來兩週</h2><span class="sub">只列特別事項</span></div><ul class="rem">`;
    for (const u of U) {
      let t = esc(u.title), sub = '';
      if (u.kind2 === 'item') { sub = u.cancelled ? (u.reason || '取消') : (hm(u.start) + '–' + hm(u.end) + (u.ex ? '・' + (u.reason || '變動') : '・' + u.kind)); }
      else if (u.kind2 === 'deadline') sub = u.kind + ' 截止';
      else sub = u.kind + (u.years ? '・' + u.years + (u.kind === '生日' ? ' 歲' : ' 週年') : '');
      h += `<li class="tap" data-act="goto" data-date="${u.day}"><span class="badge">${fmtMD(u.day)}<b style="font-size:13px">${E.WK[E.dow(u.day)]}</b></span><span class="t"><b>${t}</b><span>${esc(sub)}</span></span><span></span></li>`;
    }
    return h + '</ul></section>';
  }

  function isEmpty() { return !S.series.length && !S.events.length && !S.deadlines.length && !S.annivs.length && !(S.plans.templates || []).length; }

  function renderDay() {
    const isToday = viewDate === T();
    let h = isToday ? heroHtml() : `<div class="bar"><h1>時の栞</h1><span class="sub">${E.pd(viewDate).getFullYear()} 年</span></div>`;
    h += '<main>';
    if (pendingPack) h += `<section class="card banner"><span>有新的學期安排：<b>${esc(pendingPack.title || '學期資料')}</b></span><span class="row-btns"><button class="btn sm" data-act="pack-apply">看看</button><button class="btn sm ghost" data-act="pack-later">稍後</button></span></section>`;
    if (isEmpty() && !S.welcomed) h += `<section class="card"><h2>${ORN}初次見面</h2><p class="muted" style="margin:8px 0 12px">目前還沒有任何行程。可以先載入一組示範資料，看看提醒、時間軸和壓縮規則的效果；之後在「更多」裡一鍵清除。</p><div class="row-btns"><button class="btn" data-act="demo">載入示範資料</button><button class="btn ghost" data-act="welcome-skip">直接開始</button></div></section>`;
    if (isToday) h += remindersHtml();
    h += timelineHtml(viewDate);
    if (isToday) h += upcomingHtml();
    h += '</main>';
    $('#app').innerHTML = h;
    if (isToday) startClock();
  }

  /* ---------- 週 ---------- */
  function renderWeek() {
    const days = [...Array(7)].map((_, i) => E.addDays(weekStart, i));
    const Ls = days.map(d => E.layout(S, d));
    let lo = 7 * 60, hi = 24 * 60;
    Ls.forEach(L => L.timeline.forEach(t => { if (t.type !== 'sleep' && t.type !== 'buffer') { lo = Math.min(lo, Math.floor(t.start / 60) * 60); } }));
    const PX = 0.6; // 每分鐘 0.6px → 每小時 36px
    const H = (hi - lo) * PX;
    const end = E.addDays(weekStart, 6);
    let h = `<div class="bar"><h1>週</h1><span class="sub">${fmtMD(weekStart)} – ${fmtMD(end)}</span></div><main><section class="card">
      <div class="daynav"><button class="arr" data-act="wprev">‹</button><div class="d">第 ${weekNo(weekStart)} 週<small>${E.pd(weekStart).getFullYear()}</small></div><button class="arr" data-act="wnext">›</button></div>
      ${weekStart !== monday(T()) ? '<div style="text-align:center;margin-bottom:6px"><button class="lnk" data-act="wtoday">回到本週</button></div>' : ''}
      <div class="wk"><span></span>`;
    days.forEach(d => { h += `<div class="hd ${d === T() ? 'now' : ''}" data-act="goto" data-date="${d}">${E.WK[E.dow(d)]}<b>${E.pd(d).getDate()}</b></div>`; });
    h += `<div class="hrs" style="height:${H}px">`;
    for (let m = lo; m <= hi; m += 120) h += `<span style="top:${(m - lo) * PX}px">${m / 60}</span>`;
    h += '</div>';
    days.forEach((d, i) => {
      h += `<div class="col" style="height:${H}px" data-act="goto" data-date="${d}">`;
      for (let m = lo + 60; m < hi; m += 60) h += `<span class="ln" style="top:${(m - lo) * PX}px"></span>`;
      for (const t of Ls[i].timeline) {
        const s = Math.max(t.start, lo), e = Math.min(t.end, hi);
        if (e <= s) continue;
        let cls = t.type, c, lb = '';
        if (t.type === 'hard' || t.type === 'cancelled') { c = KIND_COLOR[t.kind] || 'var(--c-temp)'; lb = t.title; }
        else if (t.type === 'buffer') c = 'var(--c-buffer)';
        else { c = CAT_COLOR[t.cat] || 'var(--c-study)'; lb = (e - s) * PX > 22 ? t.label : ''; }
        if (t.type === 'fixed') { cls = 'plan'; lb = ''; }
        h += `<div class="blk ${cls}" style="--c:${c};top:${(s - lo) * PX}px;height:${Math.max(3, (e - s) * PX - 1)}px">${(e - s) * PX > 14 ? esc(lb) : ''}</div>`;
      }
      if (d === T()) { const nm = nowMin(); if (nm > lo && nm < hi) h += `<span class="now-ln" style="top:${(nm - lo) * PX}px"></span>`; }
      h += '</div>';
    });
    h += `</div><div class="legend"><span><i style="--c:var(--c-course)"></i>課程</span><span><i style="--c:var(--c-work)"></i>打工</span><span><i style="--c:var(--c-temp)"></i>臨時</span><span><i style="--c:var(--c-study)"></i>學習</span><span><i style="--c:var(--c-media)"></i>自媒體</span><span><i style="--c:var(--c-play)"></i>娛樂</span></div>
      <p class="muted" style="margin-top:8px">點任一天看當天詳細時間軸與操作。</p></section></main>`;
    $('#app').innerHTML = h;
  }
  function weekNo(d) { const p = E.pd(d); const j = new Date(p.getFullYear(), 0, 1, 12); return Math.ceil(((p - j) / 864e5 + (j.getDay() || 7)) / 7); }

  /* ---------- 月 ---------- */
  function renderMonth() {
    const [y, m] = monthYM.split('-').map(Number);
    const first = monthYM + '-01';
    const start = monday(first);
    let h = `<div class="bar"><h1>月</h1><span class="sub">${y} 年</span></div><main><section class="card">
      <div class="daynav"><button class="arr" data-act="mprev">‹</button><div class="d">${m} 月</div><button class="arr" data-act="mnext">›</button></div>
      ${monthYM !== T().slice(0, 7) ? '<div style="text-align:center;margin-bottom:6px"><button class="lnk" data-act="mtoday">回到本月</button></div>' : ''}
      <div class="mo">${['一', '二', '三', '四', '五', '六', '日'].map(w => `<div class="wd">${w}</div>`).join('')}`;
    const list = [];
    for (let i = 0; i < 42; i++) {
      const d = E.addDays(start, i);
      if (i >= 35 && d.slice(0, 7) !== monthYM) break;
      const items = E.itemsForDate(S, d).filter(it => it.src === 'event' || it.ex);
      const dls = S.deadlines.filter(x => x.due === d && x.status !== 'submitted');
      const ans = S.annivs.filter(a => a.month === E.pd(d).getMonth() + 1 && a.day === E.pd(d).getDate());
      let dots = '';
      items.slice(0, 3).forEach(() => dots += '<i style="--c:var(--c-temp)"></i>');
      dls.slice(0, 2).forEach(() => dots += '<i style="--c:var(--acc)"></i>');
      ans.slice(0, 2).forEach(() => dots += '<i style="--c:var(--gold)"></i>');
      const lb = (ans[0] && ans[0].name) || (dls[0] && dls[0].title) || (items[0] && items[0].title) || '';
      h += `<div class="c ${d.slice(0, 7) !== monthYM ? 'out' : ''} ${d === T() ? 'now' : ''}" data-act="goto" data-date="${d}"><span class="n">${E.pd(d).getDate()}</span><span class="lb">${esc(lb)}</span><span class="dots">${dots}</span></div>`;
      if (d.slice(0, 7) === monthYM) {
        items.forEach(it => list.push({ d, t: it.title, s: it.cancelled ? it.reason : (it.ex ? (it.reason || '變動') : it.kind) + ' ' + hm(it.start) }));
        dls.forEach(x => list.push({ d, t: x.title, s: x.kind + ' 截止' }));
        ans.forEach(a => list.push({ d, t: a.name, s: a.kind }));
      }
    }
    h += `</div><div class="legend"><span><i style="--c:var(--c-temp)"></i>臨時／變動</span><span><i style="--c:var(--acc)"></i>截止</span><span><i style="--c:var(--gold)"></i>紀念日</span></div></section>`;
    if (list.length) {
      h += `<section class="card"><div class="head"><h2>${ORN}本月特別事項</h2></div><ul class="rem">`;
      list.forEach(x => h += `<li class="tap" data-act="goto" data-date="${x.d}"><span class="badge">${fmtMD(x.d)}<b style="font-size:13px">${E.WK[E.dow(x.d)]}</b></span><span class="t"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></span><span></span></li>`);
      h += '</ul></section>';
    }
    $('#app').innerHTML = h + '</main>';
  }

  /* ---------- 專注（試用） ---------- */
  const RUNKEY = 'shiori-focus-run';
  let run = null; try { run = JSON.parse(localStorage.getItem(RUNKEY) || 'null'); } catch (e) { }
  let focusPick = { cat: '學習', mode: 'pomo', mins: 25, dl: '' };
  try { Object.assign(focusPick, JSON.parse(localStorage.getItem('shiori-focus-pick') || '{}')); } catch (e) { }
  let wakeLock = null, tick = null;
  function saveRun() { try { run ? localStorage.setItem(RUNKEY, JSON.stringify(run)) : localStorage.removeItem(RUNKEY); } catch (e) { } }
  function elapsed() { if (!run) return 0; return (run.acc || 0) + (run.pausedAt ? 0 : Date.now() - run.start); }
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { }
  }
  function focusMinutes(d, cat) { return S.focus.filter(f => f.date === d && (!cat || f.cat === cat)).reduce((s, f) => s + f.min, 0); }
  function renderFocus() {
    const d = T();
    const L = E.layout(S, d);
    const running = !!run;
    const el = elapsed();
    const target = run ? (run.mode === 'pomo' ? run.mins * 60000 : 0) : focusPick.mins * 60000;
    const showMs = run ? (run.mode === 'pomo' ? Math.max(0, target - el) : el) : (focusPick.mode === 'pomo' ? target : 0);
    const over = run && run.mode === 'pomo' && el > target ? el - target : 0;
    const shown = over || showMs;
    const mm = Math.floor(shown / 60000), ss = Math.floor(shown / 1000) % 60;
    const dls = S.deadlines.filter(x => x.status === 'doing');
    let h = `<div class="bar"><h1>專注</h1><span class="sub">試用版</span></div><main><section class="card">
      <div class="ring"><canvas id="ring" width="440" height="440"></canvas><div class="in"><b id="rt">${over ? '+' : ''}${E.pad(mm)}:${E.pad(ss)}</b><span>${running ? (run.pausedAt ? '暫停中' : esc(run.cat) + '・專注中') : (focusPick.mode === 'pomo' ? '番茄鐘' : '正計時')}</span></div></div>`;
    if (!running) {
      h += `<div class="f"><span class="lb">項目</span><div class="pick">${FOCUS_CATS.map(c => `<button class="${focusPick.cat === c ? 'on' : ''}" data-act="fcat" data-v="${c}">${c}</button>`).join('')}</div></div>
        <div class="f"><span class="lb">方式</span><div class="seg"><button class="${focusPick.mode === 'pomo' ? 'on' : ''}" data-act="fmode" data-v="pomo">番茄鐘</button><button class="${focusPick.mode === 'up' ? 'on' : ''}" data-act="fmode" data-v="up">正計時</button></div></div>
        ${focusPick.mode === 'pomo' ? `<div class="f"><span class="lb">長度</span><div class="pick">${[25, 40, 50, 60, 90].map(n => `<button class="${focusPick.mins === n ? 'on' : ''}" data-act="fmins" data-v="${n}">${n} 分</button>`).join('')}</div></div>` : ''}
        ${dls.length ? `<div class="f"><label for="fdl">這段在做哪件事（選填）</label><select id="fdl"><option value="">（不指定）</option>${dls.map(x => `<option value="${x.id}" ${focusPick.dl === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div>` : ''}
        <button class="btn wide" data-act="fstart">開始</button>`;
    } else {
      h += `<div class="row-btns" style="justify-content:center">${run.pausedAt ? '<button class="btn" data-act="fresume">繼續</button>' : '<button class="btn ghost" data-act="fpause">暫停</button>'}<button class="btn" data-act="fstop">結束並記錄</button><button class="btn ghost" data-act="fcancel">放棄</button></div>
        <p class="muted" style="text-align:center;margin-top:8px">計時期間螢幕保持亮著。鎖屏或切走後回來，時間一樣準，但時間到的那一刻不會響。</p>`;
    }
    h += `</section>`;
    // 今日對照
    const rows = ['學習', '自媒體'].map(c => {
      const plan = L.planned[c] || 0;
      const act = S.focus.filter(f => f.date === d && FOCUS_TO_PLAN[f.cat] === c).reduce((s, f) => s + f.min, 0);
      return { c, plan, act };
    });
    h += `<section class="card"><div class="head"><h2>${ORN}今天</h2><button class="lnk" data-act="fmanual">＋ 補登</button></div>`;
    rows.forEach(r => {
      const pct = r.plan ? Math.min(100, r.act / r.plan * 100) : (r.act ? 100 : 0);
      h += `<div style="margin:6px 0 10px"><div style="display:flex;justify-content:space-between;font-size:14px"><span>${r.c}</span><span class="muted">${dur(r.act)}／規劃 ${r.plan ? dur(r.plan) : '—'}</span></div><div class="prog"><i style="--c:${CAT_COLOR[r.c]};width:${pct}%"></i></div></div>`;
    });
    const other = FOCUS_CATS.filter(c => !FOCUS_TO_PLAN[c]).map(c => [c, focusMinutes(d, c)]).filter(x => x[1]);
    if (other.length) h += `<p class="muted">${other.map(x => x[0] + ' ' + dur(x[1])).join('・')}</p>`;
    h += `<p class="muted" style="margin-top:6px">「論文」算進學習；「寫作」單獨統計。</p></section>`;
    // 本週
    const ws = monday(d);
    const wk = [...Array(7)].map((_, i) => { const dd = E.addDays(ws, i); return { dd, m: focusMinutes(dd) }; });
    const mx = Math.max(60, ...wk.map(x => x.m));
    const wsum = wk.reduce((s, x) => s + x.m, 0);
    h += `<section class="card"><div class="head"><h2>${ORN}本週</h2><span class="sub">共 ${dur(wsum)}</span></div><div class="bars">${wk.map(x => `<div><span>${x.m ? durS(x.m) : ''}</span><i style="height:${x.m / mx * 80}%"></i><span>${E.WK[E.dow(x.dd)]}</span></div>`).join('')}</div>`;
    const byCat = FOCUS_CATS.map(c => [c, S.focus.filter(f => f.date >= ws && f.date <= E.addDays(ws, 6) && f.cat === c).reduce((s, f) => s + f.min, 0)]).filter(x => x[1]);
    if (byCat.length) h += `<p class="muted" style="margin-top:8px">${byCat.map(x => x[0] + ' ' + dur(x[1])).join('・')}</p>`;
    const streak = (() => { let n = 0, dd = d; if (!focusMinutes(dd)) dd = E.addDays(dd, -1); while (focusMinutes(dd) > 0) { n++; dd = E.addDays(dd, -1); } return n; })();
    if (streak) h += `<p class="muted">已連續 ${streak} 天有專注紀錄</p>`;
    h += '</section>';
    // 紀錄
    const recent = S.focus.slice(-8).reverse();
    if (recent.length) {
      h += `<section class="card"><div class="head"><h2>${ORN}最近紀錄</h2></div><ul class="list">`;
      recent.forEach(f => { const dl = S.deadlines.find(x => x.id === f.dl); h += `<li><button class="it" data-act="fdel" data-id="${f.id}"><span><b>${esc(f.cat)} ${dur(f.min)}</b><span>${fmtDay(f.date)}${f.at ? ' ' + f.at : ''}${f.manual ? '・補登' : ''}${dl ? '・' + esc(dl.title) : ''}</span></span><span class="muted">刪除</span></button></li>`; });
      h += '</ul></section>';
    }
    $('#app').innerHTML = h + '</main>';
    drawRing(run ? (run.mode === 'pomo' ? el / target : (el % 3600000) / 3600000) : 0);
    clearInterval(tick);
    if (run && !run.pausedAt) {
      keepAwake(true);
      tick = setInterval(() => {
        if (view !== 'focus') return;
        const e2 = elapsed();
        const tg = run.mins * 60000, ov = run.mode === 'pomo' && e2 > tg;
        const t2 = run.mode === 'pomo' ? (ov ? e2 - tg : tg - e2) : e2;
        const r = $('#rt'); if (r) r.textContent = (ov ? '+' : '') + E.pad(Math.floor(t2 / 60000)) + ':' + E.pad(Math.floor(t2 / 1000) % 60);
        drawRing(run.mode === 'pomo' ? e2 / (run.mins * 60000) : (e2 % 3600000) / 3600000);
        if (run.mode === 'pomo' && e2 >= run.mins * 60000 && !run.rang) { run.rang = true; saveRun(); chime(); toast('時間到，記得結束並記錄'); }
      }, 1000);
    } else keepAwake(false);
  }
  function chime() {
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, .35].forEach((t, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = i ? 660 : 880; g.gain.setValueAtTime(.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, ac.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .6); o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .7); });
    } catch (e) { }
  }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function drawRing(p) {
    const c = $('#ring'); if (!c) return;
    const x = c.getContext('2d'), W = 440, R = 190;
    x.clearRect(0, 0, W, W);
    x.save(); x.translate(W / 2, W / 2);
    x.strokeStyle = cssv('--line'); x.lineWidth = 10; x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; x.strokeStyle = cssv('--gold'); x.globalAlpha = i % 5 ? .35 : .9; x.lineWidth = i % 5 ? 2 : 4; x.beginPath(); x.moveTo(Math.sin(a) * (R - 22), -Math.cos(a) * (R - 22)); x.lineTo(Math.sin(a) * (R - (i % 5 ? 30 : 38)), -Math.cos(a) * (R - (i % 5 ? 30 : 38))); x.stroke(); }
    x.globalAlpha = 1;
    if (p > 0) { x.strokeStyle = cssv('--acc'); x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p) * Math.PI * 2); x.stroke(); }
    x.restore();
  }

  /* ---------- 更多 ---------- */
  function renderMore() {
    const live = S.deadlines.filter(x => x.status !== 'submitted').length;
    const ss = sleepState();
    let h = `<div class="bar"><h1>更多</h1></div><main>
    <section class="card"><ul class="menu">
      <li><button data-act="m-deadlines">截止事項<span>${live} 件未繳交 ›</span></button></li>
      <li><button data-act="m-annivs">紀念日<span>${S.annivs.length} 個 ›</span></button></li>
      <li><button data-act="m-series">常規行程（課程、打工）<span>${S.series.length} 條 ›</span></button></li>
      <li><button data-act="m-events">臨時安排<span>${S.events.filter(e => e.date >= T()).length} 個未到 ›</span></button></li>
      <li><button data-act="m-batch">批次停課／取消<span>放假、校慶、考試週 ›</span></button></li>
    </ul></section>
    <section class="card"><ul class="menu">
      <li><button data-act="m-plan">作息規劃<span>${(S.plans.templates || []).length} 套 ›</span></button></li>
      <li><button data-act="m-sleep">睡眠紀錄<span>${ss.asleep ? '睡眠中' : S.sleep.length + ' 筆'} ›</span></button></li>
      <li><button data-act="m-work">打工時數<span>本月 ${dur(E.workHours(S, T().slice(0, 7)).total)} ›</span></button></li>
    </ul></section>
    <section class="card"><ul class="menu">
      <li><button data-act="m-skin">外觀<span>${skin().name} ›</span></button></li>
      <li><button data-act="m-pack">學期資料（加密匯入）<span>${S.packs.applied.length ? '已套用 ' + S.packs.applied.length + ' 次' : '尚未套用'} ›</span></button></li>
      <li><button data-act="m-backup">備份與還原<span>匯出到電腦 ›</span></button></li>
      <li><button data-act="m-demo">示範資料<span>${hasDemo() ? '已載入' : '未載入'} ›</span></button></li>
      <li><button data-act="m-settings">其他設定<span>打工準備時間等 ›</span></button></li>
    </ul></section>
    <p class="muted" style="text-align:center;padding:6px 0 10px">時の栞・資料只存在這支手機裡</p></main>`;
    $('#app').innerHTML = h;
  }

  /* ---------- 面板 ---------- */
  let sheetClose = null;
  function openSheet(html, onMount) {
    $('#sheet-in').innerHTML = html;
    $('#veil').classList.add('on'); $('#sheet').classList.add('on');
    $('#sheet').scrollTop = 0;
    if (onMount) onMount($('#sheet-in'));
  }
  function closeSheet() { $('#veil').classList.remove('on'); $('#sheet').classList.remove('on'); if (sheetClose) { const f = sheetClose; sheetClose = null; f(); } }
  $('#veil').addEventListener('click', closeSheet);
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const chk = id => { const el = document.getElementById(id); return !!(el && el.checked); };
  const fld = (label, inner, id) => `<div class="f">${label ? `<label ${id ? `for="${id}"` : ''}>${label}</label>` : ''}${inner}</div>`;
  const inp = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${esc(v ?? '')}" ${extra}>`;
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(o => { const [k, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  const wkPick = (sel0) => `<div class="pick" id="wkp">${[1, 2, 3, 4, 5, 6, 7].map(i => `<button type="button" class="${(sel0 || []).includes(i) ? 'on' : ''}" data-w="${i}">${E.WK[i]}</button>`).join('')}</div>`;
  function bindWk(root) { root.querySelectorAll('#wkp button').forEach(b => b.onclick = () => b.classList.toggle('on')); }
  const wkVal = () => [...document.querySelectorAll('#wkp button.on')].map(b => +b.dataset.w);

  /* 新增選單 */
  function openAdd() {
    openSheet(`<h3>新增</h3><div class="acts">
      <button data-act="new-event">臨時安排<small>臨時工作、線上會議、活動</small></button>
      <button data-act="new-cover">幫人代班<small>多一班，計入打工時數</small></button>
      <button data-act="new-deadline">截止事項<small>作業、報告、投稿</small></button>
      <button data-act="new-anniv">紀念日<small>生日、紀念日（每年）</small></button>
      <button data-act="new-series">常規行程<small>每週固定的課或班（大量排程建議交給學期匯入）</small></button>
    </div><p class="muted" style="margin-top:12px">換班、停課、請人代班：在時間軸上點那堂課或那一班。</p>`);
  }

  /* 臨時安排 */
  function eventForm(e, preset) {
    e = e || Object.assign({ date: viewDate, start: '', end: '', kind: '臨時工作', title: '', place: '', link: '', note: '', work: false }, preset || {});
    const isNew = !e.id;
    openSheet(`<h3>${isNew ? '新增' : '編輯'}${e.kind === '代班' ? '代班' : '臨時安排'}</h3>
      ${fld('類型', sel('ev-kind', ['臨時工作', '會議', '活動', '代班', '換班', '其他'], e.kind), 'ev-kind')}
      ${fld('名稱', inp('ev-title', e.title, 'text', 'placeholder="例如：書店臨時班、指導教授會議"'), 'ev-title')}
      ${fld('日期', inp('ev-date', e.date, 'date'), 'ev-date')}
      <div class="f2">${fld('開始', inp('ev-start', e.start, 'time'), 'ev-start')}${fld('結束', inp('ev-end', e.end, 'time'), 'ev-end')}</div>
      ${fld('地點（選填）', inp('ev-place', e.place), 'ev-place')}
      ${fld('會議連結（選填）', inp('ev-link', e.link, 'url', 'placeholder="https://"'), 'ev-link')}
      ${fld('備註（選填）', `<textarea id="ev-note">${esc(e.note)}</textarea>`, 'ev-note')}
      <label class="ck"><input type="checkbox" id="ev-work" ${e.work ? 'checked' : ''}>計入打工時數</label>
      <p class="note">臨時打工不會自動預留準備與出發時間，請把通勤算進開始時間。</p>
      <div class="row-btns"><button class="btn" id="ev-save">儲存</button>${isNew ? '' : '<button class="btn ghost" id="ev-del">刪除</button>'}</div>`, root => {
      const k = root.querySelector('#ev-kind');
      k.onchange = () => { if (['代班', '換班'].includes(k.value)) document.getElementById('ev-work').checked = true; };
      root.querySelector('#ev-save').onclick = () => {
        const o = { kind: val('ev-kind'), title: val('ev-title'), date: val('ev-date'), start: val('ev-start'), end: val('ev-end'), place: val('ev-place'), link: val('ev-link'), note: val('ev-note'), work: chk('ev-work') };
        if (!o.title) o.title = o.kind;
        if (!o.date || !o.start) return toast('請填日期與開始時間');
        if (o.end && o.end <= o.start) return toast('結束時間要晚於開始時間');
        if (!o.end) o.end = E.hm(Math.min(1440, E.tm(o.start) + 60));
        if (o.link && !/^https?:\/\//i.test(o.link)) o.link = 'https://' + o.link;
        const clash = E.layout(S, o.date).items.filter(i => !i.cancelled && i.ref !== e.id && i.start < E.tm(o.end) && E.tm(o.start) < i.end);
        if (isNew) S.events.push(Object.assign({ id: uid() }, o)); else Object.assign(S.events.find(x => x.id === e.id), o);
        save(); closeSheet(); viewDate = o.date; view = 'day'; render();
        toast(clash.length ? '已儲存。注意：和「' + clash[0].title + '」時間重疊' : '已儲存');
      };
      const del = root.querySelector('#ev-del');
      if (del) del.onclick = () => {
        if (e.swapOf) { S.exceptions = S.exceptions.filter(x => !(x.swapTo === e.id)); }
        S.events = S.events.filter(x => x.id !== e.id); save(); closeSheet(); render(); toast('已刪除');
      };
    });
  }

  /* 截止事項 */
  function deadlineForm(x) {
    x = x || { title: '', kind: '作業', due: E.addDays(T(), 7), time: '', lead: 10, note: '', status: 'doing' };
    const isNew = !x.id;
    openSheet(`<h3>${isNew ? '新增' : '編輯'}截止事項</h3>
      ${fld('名稱', inp('dl-title', x.title, 'text', 'placeholder="例如：小爾雅口頭報告"'), 'dl-title')}
      <div class="f2">${fld('類型', sel('dl-kind', ['作業', '報告', '投稿', '論文', '其他'], x.kind), 'dl-kind')}${fld('提前幾天開始提醒', inp('dl-lead', x.lead, 'number', 'min="1" max="60"'), 'dl-lead')}</div>
      <div class="f2">${fld('截止日', inp('dl-due', x.due, 'date'), 'dl-due')}${fld('時間（選填）', inp('dl-time', x.time, 'time'), 'dl-time')}</div>
      ${fld('備註（選填）', `<textarea id="dl-note">${esc(x.note)}</textarea>`, 'dl-note')}
      ${isNew ? '' : fld('狀態', sel('dl-status', [['doing', '進行中'], ['done', '已完成，待繳交'], ['submitted', '已繳交']], x.status), 'dl-status')}
      <p class="note">截止前 ${x.lead} 天起每天出現在首頁；按「完成」後每日提醒停止，截止當天仍會提醒你繳交；按「已繳交」才完全結束。</p>
      <div class="row-btns"><button class="btn" id="dl-save">儲存</button>${isNew ? '' : '<button class="btn ghost" id="dl-del">刪除</button>'}</div>`, root => {
      root.querySelector('#dl-save').onclick = () => {
        const o = { title: val('dl-title'), kind: val('dl-kind'), due: val('dl-due'), time: val('dl-time'), lead: Math.max(1, +val('dl-lead') || 10), note: val('dl-note') };
        if (!isNew) o.status = val('dl-status');
        if (!o.title || !o.due) return toast('請填名稱與截止日');
        if (isNew) S.deadlines.push(Object.assign({ id: uid(), status: 'doing', created: T() }, o)); else Object.assign(S.deadlines.find(d => d.id === x.id), o);
        save(); closeSheet(); render(); toast('已儲存');
      };
      const del = root.querySelector('#dl-del'); if (del) del.onclick = () => { S.deadlines = S.deadlines.filter(d => d.id !== x.id); save(); closeSheet(); render(); toast('已刪除'); };
    });
  }
  function setDl(id, status) { const x = S.deadlines.find(d => d.id === id); if (!x) return; x.status = status; x[status + 'At'] = new Date().toISOString(); save(); render(); toast(status === 'done' ? '已完成，截止當天會提醒你繳交' : '已繳交，辛苦了'); }

  /* 紀念日 */
  function annivForm(a) {
    a = a || { name: '', kind: '生日', month: E.pd(T()).getMonth() + 1, day: E.pd(T()).getDate(), year: '', lead: 3, note: '' };
    const isNew = !a.id;
    openSheet(`<h3>${isNew ? '新增' : '編輯'}紀念日</h3>
      ${fld('名稱', inp('an-name', a.name, 'text', 'placeholder="例如：媽媽生日"'), 'an-name')}
      ${fld('類型', sel('an-kind', ['生日', '紀念日', '其他'], a.kind), 'an-kind')}
      <div class="f3">${fld('月', sel('an-m', [...Array(12)].map((_, i) => i + 1), a.month), 'an-m')}${fld('日', sel('an-d', [...Array(31)].map((_, i) => i + 1), a.day), 'an-d')}${fld('年（選填）', inp('an-y', a.year, 'number', 'placeholder="出生年"'), 'an-y')}</div>
      ${fld('提前幾天提醒', sel('an-lead', [[1, '1 天'], [2, '2 天'], [3, '3 天']], a.lead), 'an-lead')}
      ${fld('備註（選填）', inp('an-note', a.note, 'text', 'placeholder="禮物點子、要打電話等"'), 'an-note')}
      <p class="note">填了年份會顯示第幾歲／第幾週年。提醒會從提前的那天開始每天出現，當天再特別標示。</p>
      <div class="row-btns"><button class="btn" id="an-save">儲存</button>${isNew ? '' : '<button class="btn ghost" id="an-del">刪除</button>'}</div>`, root => {
      root.querySelector('#an-save').onclick = () => {
        const o = { name: val('an-name'), kind: val('an-kind'), month: +val('an-m'), day: +val('an-d'), year: val('an-y') ? +val('an-y') : '', lead: +val('an-lead'), note: val('an-note') };
        if (!o.name) return toast('請填名稱');
        if (o.day > new Date(2024, o.month, 0).getDate()) return toast(o.month + ' 月沒有 ' + o.day + ' 日');
        if (isNew) S.annivs.push(Object.assign({ id: uid() }, o)); else Object.assign(S.annivs.find(x => x.id === a.id), o);
        save(); closeSheet(); render(); toast('已儲存');
      };
      const del = root.querySelector('#an-del'); if (del) del.onclick = () => { S.annivs = S.annivs.filter(x => x.id !== a.id); save(); closeSheet(); render(); toast('已刪除'); };
    });
  }

  /* 常規行程 */
  function seriesForm(s) {
    s = s || { title: '', kind: '課程', weekdays: [E.dow(viewDate)], start: '', end: '', place: '', from: T(), to: E.addDays(T(), 120), note: '' };
    const isNew = !s.id;
    openSheet(`<h3>${isNew ? '新增' : '編輯'}常規行程</h3>
      ${s.src && s.src !== 'demo' ? '<p class="note">這條來自學期匯入。在這裡修改會被下次同一學期的匯入覆蓋；只改某一天，請在時間軸上點它。</p>' : ''}
      ${fld('名稱', inp('se-title', s.title, 'text', 'placeholder="例如：文字學、書店晚班"'), 'se-title')}
      ${fld('類型', sel('se-kind', ['課程', '打工', '其他'], s.kind), 'se-kind')}
      <div class="f"><span class="lb">每週哪幾天</span>${wkPick(s.weekdays)}</div>
      <div class="f2">${fld('開始', inp('se-start', s.start, 'time'), 'se-start')}${fld('結束', inp('se-end', s.end, 'time'), 'se-end')}</div>
      ${fld('地點（選填）', inp('se-place', s.place), 'se-place')}
      <div class="f2">${fld('從', inp('se-from', s.from, 'date'), 'se-from')}${fld('到', inp('se-to', s.to, 'date'), 'se-to')}</div>
      ${fld('備註（選填）', inp('se-note', s.note), 'se-note')}
      <p class="note">打工類會自動在班前 ${S.settings.prep} 分鐘開始「準備」、班前 ${S.settings.depart} 分鐘「出發」。常規行程不進提醒區，只有變動才會提醒。</p>
      <div class="row-btns"><button class="btn" id="se-save">儲存</button>${isNew ? '' : '<button class="btn ghost" id="se-del">刪除整條</button>'}</div>`, root => {
      bindWk(root);
      root.querySelector('#se-save').onclick = () => {
        const o = { title: val('se-title'), kind: val('se-kind'), weekdays: wkVal(), start: val('se-start'), end: val('se-end'), place: val('se-place'), from: val('se-from'), to: val('se-to'), note: val('se-note') };
        if (!o.title || !o.start || !o.end || !o.weekdays.length) return toast('請填名稱、星期與時間');
        if (o.end <= o.start) return toast('結束時間要晚於開始時間');
        if (isNew) S.series.push(Object.assign({ id: uid(), src: 'local' }, o)); else Object.assign(S.series.find(x => x.id === s.id), o);
        save(); closeSheet(); render(); toast('已儲存');
      };
      const del = root.querySelector('#se-del'); if (del) del.onclick = () => {
        if (!confirmTwice(del, '再按一次刪除整條（含所有變動紀錄）')) return;
        S.series = S.series.filter(x => x.id !== s.id); S.exceptions = S.exceptions.filter(x => x.seriesId !== s.id); save(); closeSheet(); render(); toast('已刪除');
      };
    });
  }
  function confirmTwice(btn, msg) { if (btn.dataset.armed) return true; btn.dataset.armed = 1; btn.textContent = msg; return false; }

  /* 點時間軸上的課或班 */
  function openItem(key, d) {
    const L = E.layout(S, d);
    const it = L.items.find(i => i.key === key);
    if (!it) return;
    if (it.src === 'event') { const e = S.events.find(x => x.id === it.ref); if (e) eventForm(e); return; }
    const s = S.series.find(x => x.id === it.ref);
    const ex = it.ex;
    const isWork = s.kind === '打工';
    let acts = '';
    if (ex) {
      acts += `<button data-act="ex-restore">還原成原本的行程<small>目前：${esc(ex.reason || (ex.type === 'cancel' ? '取消' : '變動'))}${ex.swapTo ? '（會一併刪除換過去的那一班）' : ''}</small></button>`;
    } else {
      acts += `<button data-act="ex-cancel">這天取消<small>${isWork ? '請假、店休' : '放假、停課、請假'}</small></button>`;
      if (isWork) acts += `<button data-act="ex-cover">請人代班<small>這天由別人上，你空出來</small></button><button data-act="ex-swap">換班<small>這班取消，改到另一天或另一個時段</small></button>`;
      acts += `<button data-act="ex-modify">只改這天的時間或地點<small>${isWork ? '提早、延後' : '校外教學、調課、換教室'}</small></button>`;
    }
    acts += `<button data-act="se-edit">修改整條規則<small>每週都適用</small></button>`;
    openSheet(`<h3>${esc(s.title)}</h3><p class="muted" style="margin:-4px 0 12px">${fmtDay(d)}　${hm(it.start)}–${hm(it.end)}${it.place ? '・' + esc(it.place) : ''}</p><div class="acts">${acts}</div>`, root => {
      root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'ex-restore') {
          if (ex.swapTo) S.events = S.events.filter(e => e.id !== ex.swapTo);
          S.exceptions = S.exceptions.filter(x => x !== ex && x.id !== ex.id); save(); closeSheet(); render(); toast('已還原');
        } else if (a === 'ex-cancel') cancelForm(s, d, isWork ? ['請假', '店休', '其他'] : ['放假', '停課', '請假', '其他']);
        else if (a === 'ex-cover') coverForm(s, d);
        else if (a === 'ex-swap') swapForm(s, d, it);
        else if (a === 'ex-modify') modifyForm(s, d, it);
        else if (a === 'se-edit') seriesForm(s);
      });
    });
  }
  function cancelForm(s, d, reasons) {
    openSheet(`<h3>${esc(s.title)}・這天取消</h3><p class="muted" style="margin:-4px 0 10px">${fmtDay(d)}</p>
      ${fld('原因', `<div class="pick" id="rs">${reasons.map((r, i) => `<button type="button" class="${i ? '' : 'on'}" data-v="${r}">${r}</button>`).join('')}</div>`)}
      ${fld('備註（選填）', inp('cx-note', ''), 'cx-note')}
      <button class="btn wide" id="cx-save">確定取消這天</button>`, root => {
      root.querySelectorAll('#rs button').forEach(b => b.onclick = () => { root.querySelectorAll('#rs button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
      root.querySelector('#cx-save').onclick = () => {
        S.exceptions.push({ id: uid(), seriesId: s.id, date: d, type: 'cancel', reason: root.querySelector('#rs .on').dataset.v, note: val('cx-note') });
        save(); closeSheet(); render(); toast('已取消這天');
      };
    });
  }
  function coverForm(s, d) {
    openSheet(`<h3>請人代班</h3><p class="muted" style="margin:-4px 0 10px">${esc(s.title)}・${fmtDay(d)}</p>
      ${fld('誰代你上（選填）', inp('cv-who', '', 'text', 'placeholder="同事名字"'), 'cv-who')}
      <button class="btn wide" id="cv-save">確定</button>`, root => {
      root.querySelector('#cv-save').onclick = () => {
        S.exceptions.push({ id: uid(), seriesId: s.id, date: d, type: 'cancel', reason: '請人代班', cover: val('cv-who') });
        save(); closeSheet(); render(); toast('已登記，這天不計入你的打工時數');
      };
    });
  }
  function swapForm(s, d, it) {
    openSheet(`<h3>換班</h3><p class="muted" style="margin:-4px 0 10px">原班：${fmtDay(d)} ${hm(it.start)}–${hm(it.end)}</p>
      ${fld('換到哪天', inp('sw-date', d, 'date'), 'sw-date')}
      <div class="f2">${fld('開始', inp('sw-start', hm(it.start), 'time'), 'sw-start')}${fld('結束', inp('sw-end', hm(it.end), 'time'), 'sw-end')}</div>
      ${fld('和誰換（選填）', inp('sw-who', ''), 'sw-who')}
      <p class="note">原班會標示「換班」並取消，新的那班一樣會預留準備與出發時間。前一天和當天都會出現在首頁提醒。</p>
      <button class="btn wide" id="sw-save">確定換班</button>`, root => {
      root.querySelector('#sw-save').onclick = () => {
        const nd = val('sw-date'), ns = val('sw-start'), ne = val('sw-end'), who = val('sw-who');
        if (!nd || !ns || !ne || ne <= ns) return toast('請確認日期與時間');
        const evId = uid();
        S.events.push({ id: evId, kind: '換班', title: s.title, date: nd, start: ns, end: ne, place: s.place || '', note: '由 ' + fmtDay(d) + ' 換來' + (who ? '（和 ' + who + '）' : ''), work: true, swapOf: s.id });
        S.exceptions.push({ id: uid(), seriesId: s.id, date: d, type: 'cancel', reason: '換班', cover: who, swapTo: evId, note: '換到 ' + fmtDay(nd) + ' ' + ns });
        save(); closeSheet(); render(); toast('已換班');
      };
    });
  }
  function modifyForm(s, d, it) {
    openSheet(`<h3>只改這天</h3><p class="muted" style="margin:-4px 0 10px">${esc(s.title)}・${fmtDay(d)}</p>
      ${fld('原因', sel('md-r', s.kind === '打工' ? ['調整時間', '其他'] : ['校外教學', '調課', '換教室', '其他']), 'md-r')}
      <div class="f2">${fld('開始', inp('md-start', hm(it.start), 'time'), 'md-start')}${fld('結束', inp('md-end', hm(it.end), 'time'), 'md-end')}</div>
      ${fld('地點', inp('md-place', it.place), 'md-place')}
      ${fld('備註（選填）', inp('md-note', ''), 'md-note')}
      <button class="btn wide" id="md-save">儲存</button>`, root => {
      root.querySelector('#md-save').onclick = () => {
        const o = { id: uid(), seriesId: s.id, date: d, type: 'modify', reason: val('md-r'), start: val('md-start'), end: val('md-end'), place: val('md-place'), note: val('md-note') };
        if (o.end <= o.start) return toast('結束時間要晚於開始時間');
        S.exceptions.push(o); save(); closeSheet(); render(); toast('已修改這天');
      };
    });
  }

  /* 規劃時段：今天跳過／恢復 */
  function openPlan(tpl, idx, d) {
    const t = (S.plans.templates || []).find(x => x.id === tpl); if (!t) return;
    const b = t.blocks[idx]; const k = tpl + ':' + idx;
    const off = (S.planSkip[d] || []).includes(k);
    openSheet(`<h3>${esc(b.label || b.cat)}</h3><p class="muted" style="margin:-4px 0 12px">模板「${esc(t.name)}」原定 ${b.start}–${b.end}</p><div class="acts">
      ${off ? '<button data-act="un">恢復這段<small>今天照常安排</small></button>' : '<button data-act="skip">今天跳過這段<small>只影響這一天，空出來的時間可讓給其他規劃</small></button>'}
      <button data-act="all">今天整天不套用規劃<small>例如出遊、生病休息</small></button></div>
      <p class="note">作息規劃每學期由我們商量後匯入；要長期修改，告訴我即可。</p>`, root => {
      root.querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
        const a = btn.dataset.act; const arr = S.planSkip[d] = S.planSkip[d] || [];
        if (a === 'skip') arr.push(k);
        if (a === 'un') S.planSkip[d] = arr.filter(x => x !== k);
        if (a === 'all') t.blocks.forEach((bb, i) => { const c = E.cats(S)[bb.cat] || {}; if (!c.sleep && !arr.includes(tpl + ':' + i)) arr.push(tpl + ':' + i); });
        if (!S.planSkip[d].length) delete S.planSkip[d];
        save(); closeSheet(); render();
      });
    });
  }

  /* ---------- 更多：各分頁 ---------- */
  function listDeadlines() {
    const live = S.deadlines.filter(x => x.status !== 'submitted').sort((a, b) => a.due < b.due ? -1 : 1);
    const doneL = S.deadlines.filter(x => x.status === 'submitted').sort((a, b) => a.due > b.due ? -1 : 1).slice(0, 10);
    const st = { doing: '進行中', done: '已完成・待繳交', submitted: '已繳交' };
    const row = x => `<li><button class="it" data-id="${x.id}"><span><b>${esc(x.title)}<span class="tag">${esc(x.kind)}</span></b><span>${fmtDay(x.due)} 截止・${st[x.status]}・還有 ${E.diffDays(T(), x.due)} 天</span></span><span class="muted">›</span></button></li>`;
    openSheet(`<h3>截止事項</h3><button class="btn wide" id="add">＋ 新增截止事項</button>
      <ul class="list" style="margin-top:8px">${live.map(row).join('') || '<li class="muted" style="padding:10px 0">沒有未繳交的事項</li>'}</ul>
      ${doneL.length ? `<p class="muted" style="margin-top:14px">最近已繳交</p><ul class="list">${doneL.map(row).join('')}</ul>` : ''}`, root => {
      root.querySelector('#add').onclick = () => deadlineForm();
      root.querySelectorAll('.it').forEach(b => b.onclick = () => deadlineForm(S.deadlines.find(x => x.id === b.dataset.id)));
    });
  }
  function listAnnivs() {
    const arr = S.annivs.map(a => Object.assign({}, a, E.annivNext(a, T()))).sort((a, b) => a.days - b.days);
    openSheet(`<h3>紀念日</h3><button class="btn wide" id="add">＋ 新增紀念日</button><ul class="list" style="margin-top:8px">${arr.map(a => `<li><button class="it" data-id="${a.id}"><span><b>${esc(a.name)}<span class="tag">${esc(a.kind)}</span></b><span>${a.month}/${a.day}・${a.days === 0 ? '今天' : '還有 ' + a.days + ' 天'}・提前 ${a.lead} 天提醒</span></span><span class="muted">›</span></button></li>`).join('') || '<li class="muted" style="padding:10px 0">還沒有紀念日</li>'}</ul>
      <p class="note">紀念日只存在手機裡，不會經過 GitHub。</p>`, root => {
      root.querySelector('#add').onclick = () => annivForm();
      root.querySelectorAll('.it').forEach(b => b.onclick = () => annivForm(S.annivs.find(x => x.id === b.dataset.id)));
    });
  }
  function listSeries() {
    const arr = S.series.slice().sort((a, b) => (a.kind > b.kind ? 1 : -1) || ((a.weekdays[0] || 0) - (b.weekdays[0] || 0)));
    openSheet(`<h3>常規行程</h3><button class="btn wide" id="add">＋ 新增常規行程</button><ul class="list" style="margin-top:8px">${arr.map(s => `<li><button class="it" data-id="${s.id}"><span><b>${esc(s.title)}<span class="tag">${esc(s.kind)}</span>${s.src && s.src !== 'local' ? `<span class="tag">${s.src === 'demo' ? '示範' : '匯入'}</span>` : ''}</b><span>每週${s.weekdays.map(w => E.WK[w]).join('、')} ${s.start}–${s.end}${s.place ? '・' + esc(s.place) : ''}<br>${s.from || ''} ~ ${s.to || ''}</span></span><span class="muted">›</span></button></li>`).join('') || '<li class="muted" style="padding:10px 0">還沒有常規行程</li>'}</ul>`, root => {
      root.querySelector('#add').onclick = () => seriesForm();
      root.querySelectorAll('.it').forEach(b => b.onclick = () => seriesForm(S.series.find(x => x.id === b.dataset.id)));
    });
  }
  function listEvents() {
    const arr = S.events.filter(e => e.date >= E.addDays(T(), -7)).sort((a, b) => (a.date + a.start) < (b.date + b.start) ? -1 : 1);
    openSheet(`<h3>臨時安排</h3><button class="btn wide" id="add">＋ 新增臨時安排</button><ul class="list" style="margin-top:8px">${arr.map(e => `<li><button class="it" data-id="${e.id}"><span><b>${esc(e.title)}<span class="tag">${esc(e.kind)}</span></b><span>${fmtDay(e.date)} ${e.start}–${e.end}${e.place ? '・' + esc(e.place) : ''}</span></span><span class="muted">›</span></button></li>`).join('') || '<li class="muted" style="padding:10px 0">近期沒有臨時安排</li>'}</ul>`, root => {
      root.querySelector('#add').onclick = () => eventForm();
      root.querySelectorAll('.it').forEach(b => b.onclick = () => eventForm(S.events.find(x => x.id === b.dataset.id)));
    });
  }
  function batchForm() {
    if (!S.series.length) return toast('還沒有常規行程');
    openSheet(`<h3>批次停課／取消</h3>
      <div class="f2">${fld('從', inp('bt-from', T(), 'date'), 'bt-from')}${fld('到', inp('bt-to', T(), 'date'), 'bt-to')}</div>
      ${fld('原因', sel('bt-r', ['放假', '停課', '考試週', '請假', '其他']), 'bt-r')}
      <div class="f"><span class="lb">要取消哪些（預設只選課程）</span><div class="acts" id="bt-list">${S.series.map(s => `<label class="ck" style="margin:0"><input type="checkbox" data-id="${s.id}" ${s.kind === '課程' ? 'checked' : ''}>${esc(s.title)}<span class="tag">${esc(s.kind)}</span></label>`).join('')}</div></div>
      <button class="btn wide" id="bt-go">套用</button>`, root => {
      root.querySelector('#bt-go').onclick = () => {
        const f = val('bt-from'), t = val('bt-to'), r = val('bt-r');
        if (!f || !t || t < f) return toast('請確認日期範圍');
        const ids = [...root.querySelectorAll('#bt-list input:checked')].map(i => i.dataset.id);
        let n = 0;
        for (let d = f; d <= t; d = E.addDays(d, 1)) {
          for (const s of S.series) {
            if (!ids.includes(s.id) || !(s.weekdays || []).includes(E.dow(d)) || (s.from && d < s.from) || (s.to && d > s.to)) continue;
            if (S.exceptions.some(x => x.seriesId === s.id && x.date === d)) continue;
            S.exceptions.push({ id: uid(), seriesId: s.id, date: d, type: 'cancel', reason: r }); n++;
          }
        }
        save(); closeSheet(); render(); toast(n ? '已取消 ' + n + ' 堂／班' : '這段期間沒有符合的行程');
      };
    });
  }
  function planView() {
    const P = S.plans; const C = E.cats(S);
    const tpls = P.templates || [];
    let h = `<h3>作息規劃</h3>`;
    if (!tpls.length) h += '<p class="muted">還沒有作息規劃。每學期我們商量好後，我會做成加密的學期資料推送給你，你在 app 裡按「套用」即可。</p>';
    tpls.forEach(t => {
      const rules = (P.rules || []).filter(r => r.templateId === t.id);
      h += `<div class="card" style="box-shadow:none;margin-bottom:10px"><div class="head"><h2>${esc(t.name)}</h2><span class="sub">${rules.map(r => (r.weekdays || []).map(w => E.WK[w]).join('') + (r.from ? '　' + r.from + '~' + (r.to || '') : '')).join('；')}</span></div><ul class="tl">`;
      t.blocks.slice().sort((a, b) => a.start < b.start ? -1 : 1).forEach(b => h += `<li class="${(C[b.cat] || {}).sleep ? 'sleep' : (C[b.cat] || {}).fixed ? 'fixed' : 'plan'}"><span class="tm"><b>${b.start}</b>${b.end}</span><span class="cb" style="--c:${CAT_COLOR[b.cat] || 'var(--c-study)'}"></span><span class="bd"><b>${esc(b.label || b.cat)}</b></span></li>`);
      h += '</ul></div>';
    });
    h += `<p class="note">壓縮規則：課、打工、臨時安排優先，睡眠與用餐不讓給規劃。被佔走的規劃先移到當天其他空檔；放不下時各段平均縮短，每段最少留 30 分鐘；仍放不下就依序取消娛樂、學習、自媒體。只在當天內調整。</p>`;
    openSheet(h);
  }
  function sleepView() {
    const recs = S.sleep.slice(-14).reverse();
    const done = S.sleep.filter(r => r.w).slice(-7);
    let avg = '';
    if (done.length) {
      const durA = done.reduce((s, r) => s + (new Date(r.w) - new Date(r.s)) / 60000, 0) / done.length;
      const bedA = done.reduce((s, r) => { const d = new Date(r.s); let m = d.getHours() * 60 + d.getMinutes(); if (m < 720) m += 1440; return s + m; }, 0) / done.length;
      const wakeA = done.reduce((s, r) => { const d = new Date(r.w); return s + d.getHours() * 60 + d.getMinutes(); }, 0) / done.length;
      avg = `<div class="stat" style="margin-bottom:12px"><div><div class="k">平均入睡</div><div class="v">${hm(Math.round(bedA) % 1440)}</div></div><div><div class="k">平均起床</div><div class="v">${hm(Math.round(wakeA))}</div></div><div><div class="k">平均睡眠</div><div class="v">${durS(durA)}</div></div></div>`;
      const sl = E.layout(S, T()).fixed.filter(b => b.sleep);
      if (sl.length) avg += `<p class="muted" style="text-align:center;margin:-4px 0 10px">今天規劃的睡眠：${sl.map(b => hm(b.start) + '–' + hm(b.end)).join('、')}</p>`;
    }
    openSheet(`<h3>睡眠紀錄</h3>${avg || '<p class="muted">還沒有完整的紀錄。睡前在首頁按「要睡了」，起床按「起床了」。</p>'}
      <ul class="list">${recs.map(r => { const s = new Date(r.s), w = r.w ? new Date(r.w) : null; return `<li><button class="it" data-id="${r.id}"><span><b>${(s.getMonth() + 1) + '/' + s.getDate()} ${E.pad(s.getHours())}:${E.pad(s.getMinutes())} → ${w ? E.pad(w.getHours()) + ':' + E.pad(w.getMinutes()) : '睡眠中'}</b><span>${w ? dur((w - s) / 60000) : ''}</span></span><span class="muted">修改</span></button></li>`; }).join('')}</ul>
      <button class="btn ghost wide" id="sl-add" style="margin-top:10px">＋ 補登一晚</button>`, root => {
      root.querySelectorAll('.it').forEach(b => b.onclick = () => sleepEdit(S.sleep.find(x => x.id === b.dataset.id)));
      root.querySelector('#sl-add').onclick = () => sleepEdit(null);
    });
  }
  function sleepEdit(r) {
    const isNew = !r;
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(0, 30, 0, 0);
    const w = new Date(); w.setHours(8, 0, 0, 0);
    r = r || { s: y.toISOString(), w: w.toISOString() };
    openSheet(`<h3>${isNew ? '補登睡眠' : '修改睡眠'}</h3>
      ${fld('入睡', inp('sl-s', isoLocal(new Date(r.s)), 'datetime-local'), 'sl-s')}
      ${fld('起床', inp('sl-w', r.w ? isoLocal(new Date(r.w)) : '', 'datetime-local'), 'sl-w')}
      <div class="row-btns"><button class="btn" id="sl-save">儲存</button>${isNew ? '' : '<button class="btn ghost" id="sl-del">刪除</button>'}</div>`, root => {
      root.querySelector('#sl-save').onclick = () => {
        const s = val('sl-s'), ww = val('sl-w');
        if (!s) return toast('請填入睡時間');
        const o = { s: new Date(s).toISOString(), w: ww ? new Date(ww).toISOString() : null };
        if (o.w && o.w <= o.s) return toast('起床要晚於入睡');
        if (isNew) S.sleep.push(Object.assign({ id: uid() }, o)); else Object.assign(S.sleep.find(x => x.id === r.id), o);
        S.sleep.sort((a, b) => a.s < b.s ? -1 : 1);
        save(); sleepView(); render();
      };
      const del = root.querySelector('#sl-del'); if (del) del.onclick = () => { S.sleep = S.sleep.filter(x => x.id !== r.id); save(); sleepView(); render(); };
    });
  }
  function workView(ym) {
    ym = ym || T().slice(0, 7);
    const W = E.workHours(S, ym);
    const [y, m] = ym.split('-').map(Number);
    const prev = m === 1 ? (y - 1) + '-12' : y + '-' + E.pad(m - 1), next = m === 12 ? (y + 1) + '-01' : y + '-' + E.pad(m + 1);
    openSheet(`<h3>打工時數</h3><div class="daynav"><button class="arr" id="wp">‹</button><div class="d">${y} 年 ${m} 月<small>共 ${dur(W.total)}・${W.rows.length} 班</small></div><button class="arr" id="wn">›</button></div>
      <ul class="list">${W.rows.map(r => `<li class="it" style="display:grid"><span><b>${fmtDay(r.date)} ${hm(r.start)}–${hm(r.end)}</b><span>${esc(r.title)}・${esc(r.kind)}</span></span><span>${dur(r.min)}</span></li>`).join('') || '<li class="muted" style="padding:10px 0">這個月沒有打工紀錄</li>'}</ul>
      <p class="note">固定班扣掉請假、請人代班與換出去的班；換來的班、幫人代班、勾選「計入打工時數」的臨時安排會算進來。準備與通勤時間不算。</p>`, root => {
      root.querySelector('#wp').onclick = () => workView(prev);
      root.querySelector('#wn').onclick = () => workView(next);
    });
  }
  function skinView() {
    openSheet(`<h3>外觀</h3><div class="skins">${SKINS.map(k => `<button class="${k.id === S.settings.skin ? 'on' : ''}" data-id="${k.id}"><i style="background:${k.sw}"></i>${k.name}</button>`).join('')}</div>
      <p class="note" style="margin-top:12px">緋刻、月詠是神秘的深色鐘面；櫻花、紫陽花、初雪是明亮的日系風格。</p>`, root => {
      root.querySelectorAll('.skins button').forEach(b => b.onclick = () => { S.settings.skin = b.dataset.id; save(); applySkin(); skinView(); render(); });
    });
  }
  function settingsView() {
    openSheet(`<h3>其他設定</h3>
      <div class="f2">${fld('打工前幾分鐘開始準備', inp('st-prep', S.settings.prep, 'number', 'min="0" max="180"'), 'st-prep')}${fld('打工前幾分鐘出發', inp('st-go', S.settings.depart, 'number', 'min="0" max="180"'), 'st-go')}</div>
      <p class="note">只套用在固定打工與換班。臨時打工、代班不會自動預留。</p>
      <button class="btn wide" id="st-save">儲存</button>
      <div style="margin-top:22px"><button class="btn ghost wide" id="st-wipe" style="color:var(--acc)">清空所有資料</button></div>`, root => {
      root.querySelector('#st-save').onclick = () => {
        const p = Math.max(0, +val('st-prep') || 0), g = Math.max(0, +val('st-go') || 0);
        if (g > p) return toast('出發時間應在準備之後（數字要比較小）');
        S.settings.prep = p; S.settings.depart = g; save(); closeSheet(); render(); toast('已儲存');
      };
      const w = root.querySelector('#st-wipe');
      w.onclick = () => { if (!confirmTwice(w, '再按一次：清空全部（無法復原）')) return; const sk = S.settings.skin; S = blank(); S.settings.skin = sk; S.welcomed = true; save(); closeSheet(); render(); toast('已清空'); };
    });
  }

  /* 備份 */
  function backupView() {
    openSheet(`<h3>備份與還原</h3>
      <button class="btn wide" id="bk-out">匯出備份檔</button>
      <p class="note" style="margin-top:8px">匯出一個 .json 檔，存到電腦或雲端。換手機或清除瀏覽器資料前務必先匯出。</p>
      <div class="f"><label for="bk-in">從備份檔還原（會覆蓋目前所有資料）</label><input id="bk-in" type="file" accept=".json,application/json"></div>`, root => {
      root.querySelector('#bk-out').onclick = () => {
        const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shiori-備份-' + T() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      };
      root.querySelector('#bk-in').onchange = ev => {
        const f = ev.target.files[0]; if (!f) return;
        f.text().then(t => {
          const j = JSON.parse(t);
          if (j && j.v && j.iv && j.data) return toast('這是加密的學期資料，請到「學期資料」匯入');
          if (!j || !j.v || !Array.isArray(j.series)) throw 0;
          S = Object.assign(blank(), j); save(); applySkin(); closeSheet(); render(); toast('已還原');
        }).catch(() => toast('檔案格式不對'));
      };
    });
  }

  /* ---------- 加密學期資料 ---------- */
  let pendingPack = null;
  const PWKEY = 'shiori-pw';
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decryptPack(pack, pw) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(pack.salt), iterations: pack.iter || 200000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(pack.iv) }, key, b64d(pack.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function checkPack(manual) {
    try {
      const r = await fetch('./data/pack.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) { if (manual) toast('目前沒有新的學期資料'); return; }
      const p = await r.json();
      if (S.packs.applied.some(a => a.id === p.id)) { if (manual) toast('最新的學期資料已經套用過了'); pendingPack = null; return; }
      if (!manual && S.packs.later === p.id) return;
      pendingPack = p; if (view === 'day') render();
      if (manual) packApply();
    } catch (e) { if (manual) toast('連不上，請確認有網路'); }
  }
  function packApply(fromFile) {
    const p = fromFile || pendingPack; if (!p) return;
    let saved = ''; try { saved = localStorage.getItem(PWKEY) || ''; } catch (e) { }
    openSheet(`<h3>${esc(p.title || '學期資料')}</h3><p class="muted" style="margin:-4px 0 10px">${esc(p.note || '')}${p.created ? '　（' + esc(p.created.slice(0, 10)) + ' 製作）' : ''}</p>
      ${fld('密碼', inp('pk-pw', saved, 'password', 'autocomplete="off"'), 'pk-pw')}
      <label class="ck"><input type="checkbox" id="pk-keep" ${saved ? 'checked' : ''}>在這支手機記住密碼</label>
      <p class="note">套用後，這份資料涵蓋的課程、班表與作息規劃會被更新；你自己登記的停課、換班、臨時安排、截止事項與紀念日都不會被動到。</p>
      <div class="row-btns"><button class="btn" id="pk-go">解開並預覽</button></div><div id="pk-prev"></div>`, root => {
      root.querySelector('#pk-go').onclick = async () => {
        const pw = val('pk-pw'); if (!pw) return toast('請輸入密碼');
        let data;
        try { data = await decryptPack(p, pw); } catch (e) { return toast('密碼不對，或檔案損壞'); }
        try { chk('pk-keep') ? localStorage.setItem(PWKEY, pw) : localStorage.removeItem(PWKEY); } catch (e) { }
        const scope = data.scope || p.id;
        const ns = (data.series || []).length, nt = ((data.plans || {}).templates || []).length, ne = (data.events || []).length, nd = (data.deadlines || []).length;
        root.querySelector('#pk-prev').innerHTML = `<div class="note" style="margin-top:12px">範圍：${esc(scope)}<br>常規行程 ${ns} 條・作息模板 ${nt} 套${ne ? '・臨時安排 ' + ne + ' 個' : ''}${nd ? '・截止事項 ' + nd + ' 件' : ''}${data.message ? '<br>' + esc(data.message) : ''}</div><button class="btn wide" id="pk-apply">套用</button>`;
        root.querySelector('#pk-apply').onclick = () => { applyData(data, scope); S.packs.applied.push({ id: p.id, at: new Date().toISOString(), title: p.title }); S.packs.later = null; S.welcomed = true; save(); pendingPack = null; closeSheet(); render(); toast('已套用'); };
      };
    });
  }
  function applyData(data, scope) {
    const keepOther = arr => arr.filter(x => x.src !== scope);
    if (data.series) S.series = keepOther(S.series).concat(data.series.map(s => Object.assign({}, s, { src: scope })));
    if (data.plans) {
      S.plans.cats = Object.assign({}, S.plans.cats, data.plans.cats || {});
      if (data.plans.templates) S.plans.templates = keepOther(S.plans.templates || []).concat(data.plans.templates.map(t => Object.assign({}, t, { src: scope })));
      if (data.plans.rules) S.plans.rules = keepOther(S.plans.rules || []).concat(data.plans.rules.map(r => Object.assign({}, r, { src: scope })));
    }
    // 臨時安排、截止事項、紀念日：只新增尚未有的（以 id 判斷），不覆蓋你改過的
    for (const k of ['events', 'deadlines', 'annivs']) for (const x of data[k] || []) if (!S[k].some(y => y.id === x.id)) S[k].push(Object.assign({ status: k === 'deadlines' ? 'doing' : undefined }, x, { src: scope }));
    for (const x of data.exceptions || []) if (!S.exceptions.some(y => y.seriesId === x.seriesId && y.date === x.date)) S.exceptions.push(Object.assign({ id: uid() }, x, { src: scope }));
  }
  function packView() {
    const ap = S.packs.applied.slice(-5).reverse();
    openSheet(`<h3>學期資料</h3>
      <p class="muted" style="margin:-4px 0 10px">每學期我們商量好課表、班表與作息規劃後，我會把它加密放到 GitHub。app 打開時會自動檢查，有新的就在首頁提示，你輸入密碼、按「套用」即可。</p>
      <button class="btn wide" id="pk-check">現在檢查</button>
      <div class="f" style="margin-top:12px"><label for="pk-file">或從檔案匯入加密資料</label><input id="pk-file" type="file" accept=".json,application/json"></div>
      ${ap.length ? `<p class="muted" style="margin-top:6px">套用紀錄</p><ul class="list">${ap.map(a => `<li class="it" style="display:grid"><span><b>${esc(a.title || a.id)}</b><span>${esc(a.at.slice(0, 10))}</span></span><span></span></li>`).join('')}</ul>` : ''}
      <button class="btn ghost wide" id="pk-forget" style="margin-top:12px">忘記已儲存的密碼</button>`, root => {
      root.querySelector('#pk-check').onclick = () => checkPack(true);
      root.querySelector('#pk-file').onchange = ev => { const f = ev.target.files[0]; if (!f) return; f.text().then(t => { const p = JSON.parse(t); if (!p.iv || !p.data) throw 0; packApply(p); }).catch(() => toast('不是加密的學期資料檔')); };
      root.querySelector('#pk-forget').onclick = () => { try { localStorage.removeItem(PWKEY); } catch (e) { } toast('已忘記密碼'); };
    });
  }

  /* ---------- 示範資料 ---------- */
  function hasDemo() { return S.series.some(s => s.src === 'demo') || S.events.some(s => s.src === 'demo'); }
  function loadDemo() {
    clearDemo(true);
    const t = T(), ws = monday(t), from = E.addDays(ws, -14), to = E.addDays(ws, 70);
    const D = 'demo', p = E.pd(t);
    S.series.push(
      { id: 'demo-c1', src: D, kind: '課程', title: '文字學', weekdays: [1], start: '10:10', end: '12:00', place: '文學院 212', from, to },
      { id: 'demo-c2', src: D, kind: '課程', title: '專題研究', weekdays: [2, 4], start: '13:10', end: '15:00', place: '文學院 305', from, to },
      { id: 'demo-c3', src: D, kind: '課程', title: '詩選', weekdays: [3], start: '13:10', end: '16:00', place: '共同教室 101', from, to },
      { id: 'demo-w1', src: D, kind: '打工', title: '書店晚班', weekdays: [2, 4], start: '18:00', end: '22:00', place: '民雄', from, to },
      { id: 'demo-w2', src: D, kind: '打工', title: '書店早班', weekdays: [6], start: '10:00', end: '16:00', place: '民雄', from, to }
    );
    S.plans.templates = (S.plans.templates || []).filter(x => x.src !== D).concat([
      { id: 'demo-wkday', src: D, name: '學期平日', blocks: [
        { cat: '睡眠', start: '00:30', end: '08:00' }, { cat: '用餐', start: '12:00', end: '13:00', label: '午餐' }, { cat: '用餐', start: '17:30', end: '18:00', label: '晚餐' },
        { cat: '學習', start: '08:30', end: '10:00', label: '讀書' }, { cat: '學習', start: '15:00', end: '17:00', label: '寫報告' }, { cat: '學習', start: '19:00', end: '21:00', label: '讀書' },
        { cat: '自媒體', start: '21:00', end: '22:00', label: '自媒體經營' }, { cat: '娛樂', start: '22:00', end: '23:30', label: '休息娛樂' }] },
      { id: 'demo-wkend', src: D, name: '學期週末', blocks: [
        { cat: '睡眠', start: '01:00', end: '09:00' }, { cat: '用餐', start: '12:00', end: '13:00', label: '午餐' }, { cat: '用餐', start: '18:00', end: '19:00', label: '晚餐' },
        { cat: '學習', start: '09:30', end: '12:00', label: '論文' }, { cat: '自媒體', start: '14:00', end: '16:00', label: '自媒體經營' }, { cat: '學習', start: '16:00', end: '18:00', label: '讀書' }, { cat: '娛樂', start: '19:00', end: '23:00', label: '休息娛樂' }] }
    ]);
    S.plans.rules = (S.plans.rules || []).filter(x => x.src !== D).concat([
      { id: 'demo-r1', src: D, templateId: 'demo-wkday', weekdays: [1, 2, 3, 4, 5], from, to },
      { id: 'demo-r2', src: D, templateId: 'demo-wkend', weekdays: [6, 7], from, to }
    ]);
    const tm1 = E.addDays(t, 1);
    S.events.push(
      { id: 'demo-e1', src: D, kind: '會議', title: '指導教授線上會議', date: tm1, start: '20:00', end: '21:00', link: 'https://meet.google.com/', note: '帶研究計畫第二章' },
      { id: 'demo-e2', src: D, kind: '臨時工作', title: '文案臨時案', date: t, start: '19:00', end: '22:00', work: false, note: '示範：看規劃怎麼被壓縮' }
    );
    const thu = E.addDays(ws, 3) >= t ? E.addDays(ws, 3) : E.addDays(ws, 10);
    const sat = E.addDays(thu, 2);
    S.exceptions.push({ id: 'demo-x1', src: D, seriesId: 'demo-w1', date: thu, type: 'cancel', reason: '換班', cover: '小林', swapTo: 'demo-e3', note: '換到 ' + fmtDay(sat) });
    S.events.push({ id: 'demo-e3', src: D, kind: '換班', title: '書店晚班', date: sat, start: '17:00', end: '21:00', place: '民雄', work: true, swapOf: 'demo-w1', note: '由 ' + fmtDay(thu) + ' 換來' });
    S.deadlines.push(
      { id: 'demo-d1', src: D, title: '小爾雅口頭報告', kind: '報告', due: E.addDays(t, 4), lead: 10, status: 'doing' },
      { id: 'demo-d2', src: D, title: '詩選期中作業', kind: '作業', due: E.addDays(t, 9), lead: 10, status: 'doing' },
      { id: 'demo-d3', src: D, title: '文學獎投稿', kind: '投稿', due: E.addDays(t, 25), lead: 10, status: 'doing' }
    );
    const b = E.pd(E.addDays(t, 2));
    S.annivs.push({ id: 'demo-a1', src: D, name: '媽媽生日（示範）', kind: '生日', month: b.getMonth() + 1, day: b.getDate(), year: 1972, lead: 3, note: '記得打電話' });
    S.welcomed = true; save(); render(); toast('已載入示範資料');
  }
  function clearDemo(silent) {
    const nd = x => x.src !== 'demo';
    S.series = S.series.filter(nd); S.events = S.events.filter(nd); S.deadlines = S.deadlines.filter(nd); S.annivs = S.annivs.filter(nd);
    S.exceptions = S.exceptions.filter(x => nd(x) && !String(x.seriesId).startsWith('demo-'));
    S.plans.templates = (S.plans.templates || []).filter(nd); S.plans.rules = (S.plans.rules || []).filter(nd);
    if (!silent) { save(); render(); toast('已清除示範資料'); }
  }
  function demoView() {
    openSheet(`<h3>示範資料</h3><p class="muted" style="margin:-4px 0 12px">一組虛構的課表、打工、換班、會議、截止事項與作息規劃，用來看效果。清除時只會刪掉示範的部分，你自己新增的不受影響。</p>
      <div class="row-btns"><button class="btn" id="dm-load">${hasDemo() ? '重新載入' : '載入'}</button>${hasDemo() ? '<button class="btn ghost" id="dm-clear">清除示範資料</button>' : ''}</div>`, root => {
      root.querySelector('#dm-load').onclick = () => { closeSheet(); loadDemo(); };
      const c = root.querySelector('#dm-clear'); if (c) c.onclick = () => { closeSheet(); clearDemo(); };
    });
  }

  /* ---------- 首頁鐘面畫 ---------- */
  let clockTimer = null, fx = [];
  function startClock() {
    const c = $('#clock'); if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const k = skin();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fx.length || fx.W !== W) {
      fx = [...Array(k.fx === 'star' ? 40 : 18)].map(() => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random(), v: .3 + Math.random() * .7, p: Math.random() * 6.28 }));
      fx.W = W;
    }
    const gold = cssv('--gold'), acc = cssv('--acc'), ink2 = cssv('--ink2');
    const cx = W - 70, cy = 92, R = 118;
    function frame() {
      if (!document.body.contains(c)) { clearInterval(clockTimer); return; }
      const now = new Date(), t = now.getTime() / 1000;
      x.clearRect(0, 0, W, H);
      // 背景點綴
      for (const s of fx) {
        if (k.fx === 'star') { x.globalAlpha = .25 + .55 * Math.abs(Math.sin(t * s.v + s.p)); x.fillStyle = gold; x.beginPath(); x.arc(s.x, s.y, .6 + s.r * 1.1, 0, 7); x.fill(); }
        else {
          const yy = (s.y + t * 14 * s.v) % (H + 20) - 10, xx = (s.x - t * 6 * s.v + W * 2) % W;
          x.globalAlpha = .55; x.fillStyle = k.fx === 'snow' ? '#ffffff' : acc;
          x.beginPath(); if (k.fx === 'snow') x.arc(xx, yy, 1.5 + s.r * 2, 0, 7); else x.ellipse(xx, yy, 3 + s.r * 3, 2 + s.r * 2, t * s.v + s.p, 0, 7); x.fill();
        }
      }
      x.globalAlpha = 1;
      // 齒輪
      gear(x, cx - 96, cy + 66, 30, 12, t * .15, gold, .22);
      gear(x, cx + 40, cy + 92, 22, 10, -t * .2, gold, .18);
      // 鐘面
      x.save(); x.translate(cx, cy);
      x.globalAlpha = .9; x.strokeStyle = gold; x.lineWidth = 1.4;
      x.beginPath(); x.arc(0, 0, R, 0, 7); x.stroke();
      x.globalAlpha = .45; x.beginPath(); x.arc(0, 0, R - 8, 0, 7); x.stroke();
      x.beginPath(); x.arc(0, 0, R - 40, 0, 7); x.stroke();
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2; const big = i % 5 === 0;
        x.globalAlpha = big ? .85 : .35; x.lineWidth = big ? 1.6 : 1;
        x.beginPath(); x.moveTo(Math.sin(a) * (R - 8), -Math.cos(a) * (R - 8)); x.lineTo(Math.sin(a) * (R - (big ? 18 : 13)), -Math.cos(a) * (R - (big ? 18 : 13))); x.stroke();
      }
      x.globalAlpha = .9; x.fillStyle = gold; x.font = '600 13px Cinzel, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const a = i / 12 * Math.PI * 2; x.fillText(n, Math.sin(a) * (R - 29), -Math.cos(a) * (R - 29)); });
      // 指針
      const hh = now.getHours() % 12 + now.getMinutes() / 60, mm = now.getMinutes() + now.getSeconds() / 60, sc = now.getSeconds() + (reduce ? 0 : now.getMilliseconds() / 1000);
      hand(x, hh / 12, R - 62, 3.2, gold, 1);
      hand(x, mm / 60, R - 30, 2, gold, 1);
      hand(x, sc / 60, R - 20, 1, acc, .95);
      x.fillStyle = acc; x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fill();
      x.restore();
      // 讓文字可讀的遮罩
      const g = x.createLinearGradient(0, 0, W * .7, 0); g.addColorStop(0, cssv('--bg2')); g.addColorStop(.75, 'transparent');
      x.globalAlpha = .55; x.fillStyle = g; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    }
    clearInterval(clockTimer); frame();
    if (!reduce) clockTimer = setInterval(frame, 120);
  }
  function hand(x, f, len, w, col, al) { const a = f * Math.PI * 2; x.save(); x.globalAlpha = al; x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(-Math.sin(a) * 12, Math.cos(a) * 12); x.lineTo(Math.sin(a) * len, -Math.cos(a) * len); x.stroke(); x.restore(); }
  function gear(x, cx, cy, r, n, rot, col, al) {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.globalAlpha = al; x.strokeStyle = col; x.lineWidth = 1.3; x.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, rr = i % 2 ? r : r + 5; const a2 = (i + 1) / (n * 2) * Math.PI * 2; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); x.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr); }
    x.closePath(); x.stroke(); x.beginPath(); x.arc(0, 0, r * .45, 0, 7); x.stroke(); x.restore();
  }

  /* ---------- 繪製與事件 ---------- */
  function render() {
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
    if (view !== 'day') clearInterval(clockTimer);
    $('#fab').hidden = !['day', 'week', 'month'].includes(view);
    if (view === 'day') renderDay(); else if (view === 'week') renderWeek(); else if (view === 'month') renderMonth(); else if (view === 'focus') renderFocus(); else renderMore();
  }
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => {
    view = b.dataset.tab;
    if (view === 'day') viewDate = T();
    if (view === 'week') weekStart = monday(viewDate);
    if (view === 'month') monthYM = viewDate.slice(0, 7);
    window.scrollTo(0, 0); render();
  });
  $('#fab').onclick = openAdd;

  document.addEventListener('click', ev => {
    if (ev.target.closest('a[href]')) return;
    const el = ev.target.closest('[data-act]'); if (!el) return;
    if (el.closest('#sheet') && !['new-event', 'new-cover', 'new-deadline', 'new-anniv', 'new-series'].includes(el.dataset.act)) return; // 面板內的按鈕各自處理
    const a = el.dataset.act, d = el.dataset.date, id = el.dataset.id;
    switch (a) {
      case 'dprev': viewDate = E.addDays(viewDate, -1); render(); break;
      case 'dnext': viewDate = E.addDays(viewDate, 1); render(); break;
      case 'dtoday': viewDate = T(); render(); break;
      case 'goto': viewDate = d; view = 'day'; window.scrollTo(0, 0); render(); break;
      case 'wprev': weekStart = E.addDays(weekStart, -7); render(); break;
      case 'wnext': weekStart = E.addDays(weekStart, 7); render(); break;
      case 'wtoday': weekStart = monday(T()); render(); break;
      case 'mprev': case 'mnext': { const [y, m] = monthYM.split('-').map(Number); const dd = new Date(y, m - 1 + (a === 'mnext' ? 1 : -1), 1); monthYM = dd.getFullYear() + '-' + E.pad(dd.getMonth() + 1); render(); break; }
      case 'mtoday': monthYM = T().slice(0, 7); render(); break;
      case 'item': openItem(el.dataset.key, d); break;
      case 'plan': openPlan(el.dataset.tpl, +el.dataset.idx, d); break;
      case 'dl-done': setDl(id, 'done'); break;
      case 'dl-sub': setDl(id, 'submitted'); break;
      case 'dl-edit': deadlineForm(S.deadlines.find(x => x.id === id)); break;
      case 'anniv-edit': annivForm(S.annivs.find(x => x.id === id)); break;
      case 'sleep': S.sleep.push({ id: uid(), s: new Date().toISOString(), w: null }); save(); render(); toast('晚安'); break;
      case 'wake': { const r = sleepState().rec; r.w = new Date().toISOString(); save(); render(); toast('早安，睡了 ' + dur((new Date(r.w) - new Date(r.s)) / 60000)); break; }
      case 'demo': loadDemo(); break;
      case 'welcome-skip': S.welcomed = true; save(); render(); break;
      case 'pack-apply': packApply(); break;
      case 'pack-later': S.packs.later = pendingPack && pendingPack.id; pendingPack = null; save(); render(); break;
      case 'new-event': eventForm(); break;
      case 'new-cover': eventForm(null, { kind: '代班', title: '代班', work: true }); break;
      case 'new-deadline': deadlineForm(); break;
      case 'new-anniv': annivForm(); break;
      case 'new-series': seriesForm(); break;
      case 'fcat': focusPick.cat = el.dataset.v; savePick(); render(); break;
      case 'fmode': focusPick.mode = el.dataset.v; savePick(); render(); break;
      case 'fmins': focusPick.mins = +el.dataset.v; savePick(); render(); break;
      case 'fstart': { const s = $('#fdl'); focusPick.dl = s ? s.value : ''; savePick(); run = { start: Date.now(), acc: 0, mode: focusPick.mode, mins: focusPick.mins, cat: focusPick.cat, dl: focusPick.dl, began: new Date().toISOString() }; saveRun(); render(); break; }
      case 'fpause': run.acc = elapsed(); run.pausedAt = Date.now(); saveRun(); render(); break;
      case 'fresume': run.start = Date.now(); run.pausedAt = null; saveRun(); render(); break;
      case 'fstop': {
        const min = Math.round(elapsed() / 60000);
        if (min >= 1) { const b = new Date(run.began); S.focus.push({ id: uid(), date: E.ds(b), at: E.pad(b.getHours()) + ':' + E.pad(b.getMinutes()), min, cat: run.cat, dl: run.dl || '' }); save(); toast('記下 ' + dur(min)); } else toast('不到 1 分鐘，不記錄');
        run = null; saveRun(); render(); break;
      }
      case 'fcancel': run = null; saveRun(); render(); toast('已放棄這次計時'); break;
      case 'fmanual': manualFocus(); break;
      case 'fdel': S.focus = S.focus.filter(f => f.id !== id); save(); render(); toast('已刪除'); break;
      case 'm-deadlines': listDeadlines(); break;
      case 'm-annivs': listAnnivs(); break;
      case 'm-series': listSeries(); break;
      case 'm-events': listEvents(); break;
      case 'm-batch': batchForm(); break;
      case 'm-plan': planView(); break;
      case 'm-sleep': sleepView(); break;
      case 'm-work': workView(); break;
      case 'm-skin': skinView(); break;
      case 'm-pack': packView(); break;
      case 'm-backup': backupView(); break;
      case 'm-demo': demoView(); break;
      case 'm-settings': settingsView(); break;
    }
  });
  function savePick() { try { localStorage.setItem('shiori-focus-pick', JSON.stringify(focusPick)); } catch (e) { } }
  function manualFocus() {
    openSheet(`<h3>補登專注時數</h3><p class="muted" style="margin:-4px 0 10px">例如用電腦開 Chill with You 讀書之後，在這裡記一筆。</p>
      <div class="f"><span class="lb">項目</span><div class="pick" id="mf-c">${FOCUS_CATS.map((c, i) => `<button type="button" class="${i ? '' : 'on'}" data-v="${c}">${c}</button>`).join('')}</div></div>
      <div class="f2">${fld('日期', inp('mf-d', T(), 'date'), 'mf-d')}${fld('分鐘', inp('mf-m', 60, 'number', 'min="1" max="900"'), 'mf-m')}</div>
      <button class="btn wide" id="mf-save">記下</button>`, root => {
      root.querySelectorAll('#mf-c button').forEach(b => b.onclick = () => { root.querySelectorAll('#mf-c button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
      root.querySelector('#mf-save').onclick = () => {
        const m = +val('mf-m'); if (!m || m < 1) return toast('請填分鐘數');
        S.focus.push({ id: uid(), date: val('mf-d') || T(), min: Math.round(m), cat: root.querySelector('#mf-c .on').dataset.v, manual: true });
        save(); closeSheet(); render(); toast('已補登');
      };
    });
  }

  // 跨日、回到前景時重畫
  let lastDay = T();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (T() !== lastDay) { if (viewDate === lastDay) viewDate = T(); lastDay = T(); }
    render(); checkPack(false);
  });
  setInterval(() => { if (view === 'day' && T() !== lastDay) { viewDate = T(); lastDay = T(); render(); } }, 60000);

  applySkin(); render(); checkPack(false);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
  window.__shiori = { get S() { return S; }, render, loadDemo };
})();
