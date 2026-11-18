/* 당지킴 — 화면과 흐름 (기록은 이 기기의 브라우저 localStorage에만 저장)
 * 처음: 질문 마법사 → 목표 결과 → 첫 끼니 기록
 * 평소: 오늘(식판 게이지) → 기록(음식 → 양 → 하나 더/다음 끼니) → 식단 → 내 정보 → 알아두기
 */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = n => Math.round(n * 10) / 10;
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const NUT_KEYS = ['kcal', 'carb', 'sugar', 'protein', 'fat', 'fiber'];

  /* ---------- 저장소 ---------- */
  const store = {
    load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    save(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { toast('저장 공간이 부족해요. 오래된 기록의 사진을 지워 주세요.'); return false; }
    }
  };
  let profile = store.load('dk_profile', null);
  let logs = store.load('dk_logs', {});
  let customFoods = store.load('dk_custom', []);

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const autoMeal = () => { const h = new Date().getHours(); return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snack'; };

  const S = {
    route: profile ? 'today' : 'wizard',
    date: todayStr(),
    meal: autoMeal(),
    wiz: { step: 0, d: {} },
    picker: null,
    justFinished: false,
    planIdx: {},
    planDay: (new Date().getDay() + 6) % 7
  };

  /* ---------- 영양 계산 ---------- */
  // 기본 목록(가격·혈당지수·식단 예시 있음) + 직접 추가 + 식약처 DB 검색용
  const DBF = typeof DB_FOODS !== 'undefined' ? DB_FOODS : [];
  const allFoods = () => FOODS.concat(customFoods);
  let byId = null;
  const foodById = id => {
    if (!byId || byId.size !== FOODS.length + DBF.length + customFoods.length) byId = new Map(DBF.concat(FOODS, customFoods).map(f => [f.id, f]));
    return byId.get(id);
  };
  function entryNut(e) {
    const f = e.food || foodById(e.foodId);
    const o = {}; NUT_KEYS.forEach(k => o[k] = (f ? f[k] || 0 : 0) * e.ratio); return o;
  }
  function sumNut(entries) {
    const t = Object.fromEntries(NUT_KEYS.map(k => [k, 0]));
    entries.forEach(e => { const n = entryNut(e); NUT_KEYS.forEach(k => t[k] += n[k]); }); return t;
  }
  const dayEntries = d => logs[d] || [];
  const getT = () => profile ? NUTRI.targets(profile) : null;
  const fmtRatio = r => ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1: '1', 1.25: '1¼', 1.5: '1½', 2: '2' }[r] || r);
  const scaleUnit = (u, r) => r === 1 ? u : /^1[^0-9/]/.test(u) ? fmtRatio(r) + u.slice(1) : `${u} × ${fmtRatio(r)}`;
  const sugarLevel = g => { const T = getT(), base = T ? T.sugar : 50; return g >= base * 0.2 ? 'bad' : g >= base * 0.1 ? 'warn' : ''; };
  const carbLevel = c => { const T = getT(), base = T ? T.carb : 300; return c >= base * 0.3 ? 'bad' : c >= base * 0.15 ? 'warn' : ''; };
  const worse = (a, b) => (a === 'bad' || b === 'bad') ? 'bad' : (a === 'warn' || b === 'warn') ? 'warn' : '';
  const giTag = id => GI[id] ? `<span class="gi ${GI[id]}">혈당지수 ${GI_LABEL[GI[id]]}</span>` : '';

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- 아이콘 ---------- */
  const ICON = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
    log: '<svg viewBox="0 0 24 24"><path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
    me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-4 3.6-6 7-6s6.200 2 7 6"/></svg>',
    learn: '<svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 20a3 3 0 0 1-3-3"/><path d="M9 9h5"/></svg>'
  };
  const NAV = [['today', '오늘'], ['log', '기록'], ['plan', '식단'], ['me', '내 정보'], ['learn', '알아두기']];

  /* ---------- 공통 조각 ---------- */
  function dateBar(title) {
    const d = new Date(S.date + 'T00:00:00');
    const isToday = S.date === todayStr();
    const wd = '일월화수목금토'[d.getDay()];
    const label = isToday ? '오늘' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `<div class="top"><h1>${title}</h1>
      <div class="datepick"><button data-act="shift" data-v="-1" aria-label="전날">‹</button>
        <button class="d" data-act="pickdate" aria-label="날짜 선택">${label} <span class="sm muted">(${wd})</span></button>
        <button data-act="shift" data-v="1" aria-label="다음날">›</button>
        <input type="date" id="dateInput" value="${S.date}" /></div></div>`;
  }

  function meter(label, val, target, unit, mode) {
    const pct = target ? Math.min(100, (val / target) * 100) : 0;
    let cls = '';
    if (mode === 'min') cls = '';
    else cls = val > target * 1.2 ? 'bad' : val > target ? 'warn' : '';
    return `<div class="meter"><div class="h"><b>${label}</b><span class="num"><b>${r1(val)}</b> / ${target}${unit}</span></div>
      <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
  }

  /* ---------- 대체 추천 ---------- */
  function itemFlags(e, T) {
    const n = entryNut(e);
    return { n, sugarHigh: n.sugar > T.sugar * 0.2 || n.sugar >= 10, carbHigh: n.carb > T.carb * 0.3 };
  }
  function swapHtml(e, T) {
    const f = e.food || foodById(e.foodId); if (!f) return '';
    const { n, sugarHigh, carbHigh } = itemFlags(e, T);
    if (!sugarHigh && !carbHigh) return '';
    const why = [];
    if (carbHigh) why.push(`탄수화물 ${r1(n.carb)}g`);
    if (sugarHigh) why.push(`당류 ${r1(n.sugar)}g`);
    let ids = [...new Set([...(ALTERNATIVES[f.id] || []), ...(carbHigh ? CARB_ALT[f.id] || [] : [])])];
    let alts = ids.map(foodById).filter(Boolean);
    if (!alts.length && sugarHigh) alts = FOODS.filter(x => x.cat === f.cat && x.sugar < f.sugar * 0.5).slice(0, 2);
    const cands = [];
    if (sugarHigh) cands.push(NUTRI.recommendRatio(f.sugar, T.sugar));
    if (carbHigh && f.carb > 0) cands.push(Math.max(0.25, Math.min(1, Math.floor((T.carb * 0.25 / f.carb) * 4) / 4)));
    const rec = cands.length ? Math.min(...cands) : 1;
    return `<div class="swap"><div class="t">${esc(f.name)} · ${why.join(' · ')}</div><ul>
      ${alts.map(a => `<li>${esc(a.name)} ${esc(a.unit)} <span class="muted sm">탄수화물 ${a.carb}g · 당류 ${a.sugar}g</span></li>`).join('')}
      ${rec < 1 ? `<li>그대로 드신다면 <b>${fmtRatio(rec)}인분</b>까지만 (탄수화물 ${r1(f.carb * rec)}g)</li>` : ''}
      ${carbHigh ? '<li>채소·단백질 반찬을 먼저, 밥·면은 나중에 천천히 드세요.</li>' : ''}</ul></div>`;
  }
  function mealCarbAlerts(entries, T) {
    const out = [];
    MEALS.forEach(m => {
      const es = entries.filter(e => e.meal === m); if (!es.length) return;
      const c = sumNut(es).carb, goal = T.carb * MEAL_SPLIT[m];
      if (c > goal * 1.2) out.push({ m, c, goal });
    });
    return out;
  }

  /* ---------- 식단 예시 (선호 음식 · 주간 식비 반영) ---------- */
  const won = n => Math.round(n / 100) * 100 >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString('ko-KR') + '만원' : (Math.round(n / 100) * 100).toLocaleString('ko-KR') + '원';
  const DAY_NAME = ['월', '화', '수', '목', '금', '토', '일'];
  const dayOf = ds => (new Date(ds + 'T00:00:00').getDay() + 6) % 7;
  const SEED = { breakfast: 0, lunch: 3, dinner: 6, snack: 1 };

  // 첫 항목(주식)을 0.5~1.5배로 맞추고, 그래도 15% 넘게 많으면 가장 열량이 큰 반찬을 줄임
  function buildMeal(ids, target) {
    const items = ids.map(id => ({ f: foodById(id), r: 1 })).filter(x => x.f);
    const tot = () => items.reduce((s, x) => s + x.f.kcal * x.r, 0);
    const base = items[0];
    base.r = Math.max(0.5, Math.min(1.5, Math.round(((target - (tot() - base.f.kcal)) / base.f.kcal) * 4) / 4));
    if (tot() > target * 1.15 && items.length > 1) {
      const big = items.slice(1).sort((x, y) => y.f.kcal - x.f.kcal)[0];
      const r = (target - (tot() - big.f.kcal * big.r)) / big.f.kcal;
      big.r = Math.max(0.5, Math.min(1, Math.round(r * 4) / 4));
    }
    return items;
  }
  const mealCost = items => items.reduce((s, x) => s + (x.f.price || 0) * x.r, 0);

  // 선호 종류가 있으면 해당 템플릿만, 2개 미만이면 나머지도 뒤에 붙임
  function candidates(m) {
    const all = MEAL_TEMPLATES[m], pref = (profile && profile.cuisines) || [];
    if (!pref.length || m === 'snack') return all;
    const hit = all.filter(t => t.t.some(x => pref.includes(x)));
    return hit.length >= 2 ? hit : hit.concat(all.filter(t => !hit.includes(t)));
  }

  let weekCache = null;
  function weekPlan(T) {
    const key = JSON.stringify([T.meals, profile.cuisines, profile.budget, S.planIdx]);
    if (weekCache && weekCache.key === key) return weekCache.v;
    const C = Object.fromEntries(MEALS.map(m => [m, candidates(m)]));
    const built = {}; // 템플릿별 계산 결과 캐시
    const get = (m, i) => { const k = m + i; return built[k] || (built[k] = (() => { const items = buildMeal(C[m][i].ids, T.meals[m]); return { items, cost: mealCost(items) }; })()); };
    const days = DAY_NAME.map((_, d) => Object.fromEntries(MEALS.map(m => {
      const n = C[m].length, user = S.planIdx[d + '-' + m] || 0;
      return [m, { i: (d + SEED[m] + user) % n, user: !!user }];
    })));
    const total = () => days.reduce((s, day) => s + MEALS.reduce((t, m) => t + get(m, day[m].i).cost, 0), 0);
    const budget = profile.budget > 0 ? profile.budget : 0;
    // 예산을 넘으면 가장 비싼 끼니부터 한 단계 싼 예시로 바꿈 (직접 고른 예시는 유지)
    for (let guard = 0; budget && total() > budget && guard < 300; guard++) {
      let best = null;
      days.forEach((day, d) => MEALS.forEach(m => {
        if (day[m].user) return;
        const cur = get(m, day[m].i).cost;
        let cheaper = null;
        C[m].forEach((_, i) => { const c = get(m, i).cost; if (c < cur && (!cheaper || c > cheaper.c)) cheaper = { i, c }; });
        if (cheaper && (!best || cur > best.cur)) best = { d, m, i: cheaper.i, cur };
      }));
      if (!best) break;
      days[best.d][best.m].i = best.i;
    }
    // 가장 싼 조합으로도 예산을 넘으면, 같은 메뉴만 반복되지 않게 싼 예시 3개를 요일별로 돌려 씀
    if (budget && total() > budget) MEALS.forEach(m => {
      const cheap = C[m].map((_, i) => i).sort((a, b) => get(m, a).cost - get(m, b).cost).slice(0, 3);
      days.forEach((day, d) => { if (!day[m].user) day[m].i = cheap[(d + SEED[m]) % cheap.length]; });
    });
    const v = {
      days: days.map(day => Object.fromEntries(MEALS.map(m => [m, get(m, day[m].i)]))),
      total: total(), budget
    };
    weekCache = { key, v };
    return v;
  }
  function planFor(m, T, day) { return weekPlan(T).days[day ?? dayOf(S.date)][m].items; }
  function addPlan(m, day) {
    const T = getT(); if (!T) return;
    const items = planFor(m, T, day);
    const list = (logs[S.date] = logs[S.date] || []);
    items.forEach((x, i) => list.push({ id: Date.now().toString(36) + i, meal: m, foodId: x.f.id, ratio: x.r, photoBefore: null, photoAfter: null }));
    store.save('dk_logs', logs);
    toast(`${MEAL_NAME[m]} 식단을 기록했어요`);
  }
  const menuList = items => `<ul class="menu">${items.map(x => `<li><span>${esc(x.f.name)}</span><span>${esc(scaleUnit(x.f.unit, x.r))}</span></li>`).join('')}</ul>`;

  /* =====================================================
     오늘
     ===================================================== */
  function viewToday() {
    const T = getT(), entries = dayEntries(S.date), t = sumNut(entries);
    const sc = NUTRI.sugarScore(t.sugar, T.sugar), cs = NUTRI.carbScore(t.carb, T.carb);
    const gs = NUTRI.glycemicScore(sc.score, cs.score);
    const rem = Math.round(T.carb - t.carb);
    const name = profile.name ? `${esc(profile.name)}님` : '오늘';

    const slots = MEALS.map(m => {
      const c = sumNut(entries.filter(e => e.meal === m)).carb, goal = T.carb * MEAL_SPLIT[m];
      const ratio = goal ? c / goal : 0;
      const cls = ratio > 1.2 ? 'bad' : ratio > 1 ? 'warn' : '';
      return `<div class="slot" style="flex:${MEAL_SPLIT[m] * 100}"><div class="well"><div class="fill ${cls}" style="height:${Math.min(100, ratio * 100)}%"></div></div>
        <b>${MEAL_NAME[m]}</b><span class="num">${Math.round(c)}/${Math.round(goal)}g</span></div>`;
    }).join('');

    const lead = !entries.length ? '오늘 드실 수 있는 탄수화물'
      : rem >= 0 ? '오늘 탄수화물이' : '오늘 탄수화물이';
    const bigHtml = !entries.length ? `${T.carb}<small>g까지</small>`
      : rem >= 0 ? `${rem}<small>g 남았어요</small>` : `<span>${-rem}<small>g 넘었어요</small></span>`;

    // 다음 끼니
    const unlogged = m => !entries.some(e => e.meal === m);
    const nextMeal = (S.date === todayStr() ? MEALS.slice(MEALS.indexOf(autoMeal())).find(unlogged) : null) || MEALS.find(unlogged);
    let nextHtml;
    if (nextMeal) {
      const items = planFor(nextMeal, T);
      nextHtml = `<section class="next"><h2>${MEAL_NAME[nextMeal]}, 이렇게 드셔 보세요</h2>
        <p>${T.meals[nextMeal]}kcal · 탄수화물 ${Math.round(T.carb * MEAL_SPLIT[nextMeal])}g 안팎에 맞춘 예시예요.</p>
        ${menuList(items)}
        <div class="stack"><button class="btn" data-act="planadd" data-m="${nextMeal}">이대로 먹었어요 — 기록하기</button>
        <div class="row"><button class="btn alt" data-act="plannext" data-m="${nextMeal}" data-back="today">다른 예시</button>
        <button class="btn alt" data-act="startlog" data-m="${nextMeal}">직접 고르기</button></div></div></section>`;
    } else {
      nextHtml = `<div class="done">오늘 네 끼니를 모두 기록했어요. 아래에서 결과를 확인해 보세요.</div>`;
    }

    const alerts = mealCarbAlerts(entries, T);
    let giKnown = 0, giHigh = 0;
    entries.forEach(e => { const c = entryNut(e).carb, g = GI[e.foodId]; if (g && c > 0) { giKnown += c; if (g === 'high') giHigh += c; } });
    const giShare = giKnown >= 30 ? Math.round(giHigh / giKnown * 100) : null;
    const highs = entries.filter(e => { const x = itemFlags(e, T); return x.sugarHigh || x.carbHigh; });

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(S.date + 'T00:00:00'); d.setDate(d.getDate() - i);
      const s = ymd(d); days.push({ s, label: `${d.getMonth() + 1}/${d.getDate()}`, v: sumNut(dayEntries(s)).carb });
    }
    const maxV = Math.max(T.carb * 1.3, ...days.map(d => d.v));

    const notes = [
      ...alerts.map(a => `<div class="note bad"><b>${MEAL_NAME[a.m]}</b> 탄수화물이 ${Math.round(a.c)}g으로 한 끼 목표(${Math.round(a.goal)}g)보다 많아요. 한 끼에 몰리면 식후 혈당이 크게 오르니 밥·면을 줄이거나 다음 끼니로 나눠 드세요.</div>`),
      giShare !== null && giShare >= 50 ? `<div class="note">오늘 탄수화물의 ${giShare}%가 혈당지수 높은 음식(흰밥·떡·면·감자 등)에서 왔어요. 잡곡밥·현미로 바꾸면 식후 혈당 상승이 완만해져요.</div>` : ''
    ].join('');

    return `${dateBar('하루 기록')}
      <section class="tray"><p class="lead">${lead}</p><div class="big ${entries.length && rem < 0 ? 'over' : ''}">${bigHtml}</div>
        <p class="sub num">당류는 ${T.sugar}g까지 · 지금까지 ${r1(t.sugar)}g</p>
        <div class="slots" aria-label="끼니별 탄수화물">${slots}</div>
        <div class="gl"><div><b class="stars" aria-label="혈당 관리 ${gs}점">${[1, 2, 3, 4, 5].map(i => `<span class="${entries.length && i <= gs ? '' : 'off'}">★</span>`).join('')}</b><span>${entries.length ? `혈당 관리 ${gs}점 / 5점` : '아직 기록이 없어요'}</span></div>
        <div><b class="num">${Math.round(t.kcal)}</b><span>kcal · 목표 ${T.kcal}</span></div></div>
      </section>
      ${nextHtml}
      ${entries.length ? `<section class="sec"><h2>오늘의 평가</h2>
        <p style="margin:0">탄수화물 <b>${cs.score}점</b> · 당류 <b>${sc.score}점</b></p>
        <p class="muted" style="margin:4px 0 0">${cs.score <= sc.score ? cs.msg : sc.msg}</p>${notes}
        ${highs.length ? `<h3>이렇게 바꿔 보세요</h3>${highs.map(e => swapHtml(e, T)).join('')}` : ''}</section>
      <section class="sec"><h2>영양성분</h2>
        ${meter('탄수화물 (전분 포함)', t.carb, T.carb, 'g')}${meter('당류 (단순당)', t.sugar, T.sugar, 'g')}
        ${meter('열량', t.kcal, T.kcal, 'kcal')}${meter('단백질', t.protein, T.protein, 'g', 'min')}
        ${meter('식이섬유', t.fiber, T.fiber, 'g', 'min')}${meter('지방', t.fat, T.fat, 'g')}</section>` : ''}
      <section class="sec"><h2>최근 7일 탄수화물</h2><div class="week">
        <div class="lim" style="bottom:calc(${(T.carb / maxV) * 100}% * .8 + 22px)"></div>
        ${days.map(d => `<div class="col"><span class="num">${d.v ? Math.round(d.v) : ''}</span><i class="${d.v > T.carb ? 'bad' : ''}" style="height:${(d.v / maxV) * 80}%"></i>${d.label}</div>`).join('')}
      </div><p class="muted sm" style="margin:8px 0 0">점선은 하루 목표(${T.carb}g)예요.</p></section>`;
  }

  /* =====================================================
     기록
     ===================================================== */
  function viewLog() {
    const T = getT(), entries = dayEntries(S.date);
    const m = S.meal, es = entries.filter(e => e.meal === m), s = sumNut(es);
    const goalC = Math.round(T.carb * MEAL_SPLIT[m]);
    const tabs = MEALS.map(k => `<button class="${k === m ? 'on' : ''}" data-act="setmeal" data-m="${k}">${MEAL_NAME[k]}${entries.some(e => e.meal === k) ? '<i class="dot"></i>' : ''}</button>`).join('');
    const over = s.carb > goalC * 1.2 ? 'bad' : s.carb > goalC ? 'warn' : '';
    const list = es.length ? es.map(e => {
      const f = foodById(e.foodId) || { name: '(삭제된 음식)' }, n = entryNut(e), img = e.photoAfter || e.photoBefore;
      return `<div class="entry">${img ? `<img src="${img}" alt="">` : ''}<div class="i"><div class="n">${esc(f.name)} <span class="muted">${fmtRatio(e.ratio)}인분</span> ${giTag(e.foodId)}</div>
        <div class="s num">탄수화물 ${r1(n.carb)}g · 당류 ${r1(n.sugar)}g · ${Math.round(n.kcal)}kcal</div></div>
        <button class="x" data-act="del" data-id="${e.id}" aria-label="삭제">×</button></div>`;
    }).join('') : `<div class="empty">${MEAL_NAME[m]} 기록이 아직 없어요.</div>`;

    const items = planFor(m, T);
    const nextMeal = MEALS[MEALS.indexOf(m) + 1];
    return `${dateBar('기록')}
      <div class="mealtabs">${tabs}</div>
      <div class="mealhead"><div class="t"><span>${MEAL_NAME[m]} 탄수화물</span><span class="num"><b>${Math.round(s.carb)}</b> / ${goalC}g</span></div>
        <div class="meter" style="margin:8px 0 0"><div class="bar"><i class="${over}" style="width:${Math.min(100, goalC ? s.carb / goalC * 100 : 0)}%"></i></div></div></div>
      <div style="margin-top:12px;border-top:1px solid var(--line)">${list}</div>
      <div class="after stack">
        <button class="btn" data-act="openpicker">${MEAL_NAME[m]}에 음식 ${es.length ? '더 ' : ''}추가</button>
        ${!es.length ? `<div class="sec" style="padding:18px 0 0;border:0"><h3 style="margin-top:0">고르기 귀찮다면</h3>${menuList(items)}
          <div class="row"><button class="btn alt" data-act="plannext" data-m="${m}" data-back="log">다른 예시</button><button class="btn dark" data-act="planadd" data-m="${m}">이대로 기록</button></div></div>` : ''}
        ${es.length ? (nextMeal ? `<button class="btn alt" data-act="setmeal" data-m="${nextMeal}">${MEAL_NAME[m]} 끝 — ${MEAL_NAME[nextMeal]} 기록하기</button>` : '') : ''}
        ${es.length ? `<button class="btn quiet" data-act="nav" data-v="today">오늘 결과 보기</button>` : ''}
      </div>`;
  }

  /* ---------- 음식 고르기 오버레이 ---------- */
  function openPicker() { S.picker = { mode: 'list', q: '', cat: S.meal === 'snack' ? '과일' : '전체', food: null, ratio: 1, pb: null, pa: null }; showOverlay(); }
  function closePicker() { S.picker = null; $('#overlay').classList.add('hidden'); document.body.style.overflow = ''; render(); }
  function showOverlay() { $('#overlay').classList.remove('hidden'); document.body.style.overflow = 'hidden'; renderPicker(); }

  const norm = t => t.replace(/[\s·_]/g, '');
  const DB_LIMIT = 60;
  function foodRow(f) {
    return `<button class="food" data-act="pickfood" data-id="${esc(f.id)}"><span><span class="n">${esc(f.name)}</span><br><span class="u">${esc(f.unit)} · ${f.kcal}kcal${f.db ? ` · ${esc(f.origin.replace('식약처 DB · ', ''))}` : ''}</span></span>
      <span class="r">${giTag(f.id)}<span class="c tag ${worse(carbLevel(f.carb), sugarLevel(f.sugar))}">탄수화물 ${f.carb}g</span><span class="u num">당류 ${f.sugar}g</span></span></button>`;
  }
  function foodRows() {
    const P = S.picker, q = norm(P.q || '');
    const inCat = f => P.cat === '전체' || f.cat === P.cat;
    const hit = f => !q || norm(f.name).includes(q);
    const base = allFoods().filter(f => inCat(f) && hit(f));
    // DB 음식은 검색어가 있거나 '식재료' 분류일 때만 보여줌 (전체 목록이 수천 개라 느려지지 않게)
    let more = '';
    if (q || P.cat === '식재료') {
      const db = DBF.filter(f => inCat(f) && hit(f));
      // 이름이 검색어로 시작하는 것을 먼저
      if (q) db.sort((a, b) => (norm(a.name).startsWith(q) ? 0 : 1) - (norm(b.name).startsWith(q) ? 0 : 1) || a.name.length - b.name.length);
      if (db.length) more = `<div class="dbhead">식약처 DB에서 ${db.length.toLocaleString('ko-KR')}가지${db.length > DB_LIMIT ? ` · 앞의 ${DB_LIMIT}개만 보여요. 검색어를 더 자세히 써 보세요` : ''}</div>` + db.slice(0, DB_LIMIT).map(foodRow).join('');
    } else {
      more = `<div class="dbhead">찾는 음식이 없으면 이름으로 검색하세요. 식약처 DB 음식과 식재료 ${DBF.length.toLocaleString('ko-KR')}가지에서 찾아요.</div>`;
    }
    if (!base.length && !more.includes('food')) return '<div class="empty">찾는 음식이 없어요.<br>아래에서 직접 추가할 수 있어요.</div>';
    return base.map(foodRow).join('') + more;
  }
  function chipRow() {
    const cats = ['전체', ...new Set(allFoods().map(f => f.cat).concat('식재료'))];
    return cats.map(c => `<button class="chip ${c === S.picker.cat ? 'on' : ''}" data-act="pickcat" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  }

  function renderPicker() {
    const P = S.picker, ov = $('#overlay'); if (!P) return;
    const T = getT();
    if (P.mode === 'list') {
      ov.innerHTML = `<div class="in"><div class="ovhead"><button data-act="closepicker" aria-label="닫기">✕</button><h2>${MEAL_NAME[S.meal]}에 추가할 음식</h2></div>
        <div class="search"><input id="q" type="search" placeholder="음식 이름 (예: 잡곡밥, 사과)" value="${esc(P.q)}" autocomplete="off" /></div>
        <div class="chips" id="chips">${chipRow()}</div>
        <div id="foodlist">${foodRows()}</div>
        <div class="addown"><button class="btn alt" data-act="opencustom">찾는 음식이 없어요 — 직접 추가</button></div></div>`;
    } else if (P.mode === 'amount') {
      const f = P.food, n = entryNut({ food: f, ratio: P.ratio });
      const already = sumNut(dayEntries(S.date)).carb, mealC = sumNut(dayEntries(S.date).filter(e => e.meal === S.meal)).carb;
      const fl = itemFlags({ food: f, ratio: P.ratio }, T);
      const mealGoal = T.carb * MEAL_SPLIT[S.meal];
      let notes = '';
      if (mealC + n.carb > mealGoal * 1.2) notes += `<div class="note bad">이걸 더하면 ${MEAL_NAME[S.meal]} 탄수화물이 <b>${Math.round(mealC + n.carb)}g</b>이 돼요. 한 끼 목표는 ${Math.round(mealGoal)}g이에요.</div>`;
      if (GI[f.id] === 'high' && n.carb >= 25) notes += `<div class="note">혈당지수가 높은 음식이라 식후 혈당이 빨리 올라요. 채소·단백질 반찬을 먼저 드세요.</div>`;
      let swaps = '';
      if (fl.sugarHigh || fl.carbHigh) {
        const ids = [...new Set([...(ALTERNATIVES[f.id] || []), ...(fl.carbHigh ? CARB_ALT[f.id] || [] : [])])];
        const alts = ids.map(foodById).filter(Boolean);
        const rec = NUTRI.recommendRatio(f.sugar, T.sugar);
        swaps = `<div class="pad"><div class="note bad">${fl.carbHigh ? `탄수화물이 하루 목표의 ${Math.round(n.carb / T.carb * 100)}%예요.` : `당류가 하루 기준의 ${Math.round(n.sugar / T.sugar * 100)}%예요.`}
          ${alts.length ? ' 이걸로 바꿔 보시겠어요?' : ' 양을 줄여 보세요.'}</div>
          ${alts.length ? `<div class="stack" style="margin-top:10px">${alts.slice(0, 3).map(a => `<button class="btn alt" data-act="pickfood" data-id="${esc(a.id)}">${esc(a.name)} <span class="muted sm">탄수화물 ${a.carb}g · 당류 ${a.sugar}g</span></button>`).join('')}</div>` : ''}</div>`;
      }
      ov.innerHTML = `<div class="in"><div class="ovhead"><button data-act="backlist" aria-label="뒤로">‹</button><h2>얼마나 드셨어요?</h2></div>
        <div class="pickhead"><h3>${esc(f.name)}</h3><div class="u">1인분 = ${esc(f.unit)}${f.g ? ` (${f.g}g)` : ''} ${giTag(f.id)}</div></div>
        <div class="facts"><div class="lead ${mealC + n.carb > mealGoal * 1.2 ? 'bad' : ''}"><b class="num">${r1(n.carb)}g</b><span>탄수화물</span></div>
          <div class="lead ${fl.sugarHigh ? 'bad' : ''}"><b class="num">${r1(n.sugar)}g</b><span>당류</span></div>
          <div><b class="num">${Math.round(n.kcal)}</b><span>kcal</span></div><div><b class="num">${r1(n.protein)}g</b><span>단백질</span></div></div>
        <p class="pad muted sm" style="margin:8px 20px 0;padding:0">기록하면 오늘 탄수화물 ${Math.round(already + n.carb)} / ${T.carb}g</p>
        <span class="lbl">먹은 양 (1인분 기준)</span>
        <div class="ratios">${[0.25, 0.5, 0.75, 1, 1.5, 2].map(r => `<button class="${r === P.ratio ? 'on' : ''}" data-act="ratio" data-r="${r}">${fmtRatio(r)}</button>`).join('')}</div>
        <div class="pad" style="margin-top:14px">${notes}</div>${swaps}
        <div style="margin-top:18px"><details class="fold"><summary>사진으로 먹은 양 확인 (선택)</summary><div>
          <div class="photos" style="padding:0"><label class="photo">${P.pb ? `<img src="${P.pb}" alt="">` : '식사 전'}<input type="file" accept="image/*" capture="environment" id="photoBefore" hidden></label>
          <label class="photo">${P.pa ? `<img src="${P.pa}" alt="">` : '식사 후'}<input type="file" accept="image/*" capture="environment" id="photoAfter" hidden></label></div>
          <p class="muted sm" style="margin:8px 0 0">식사 전·후 사진을 비교해 먹은 양을 골라 주세요.</p></div></details></div>
        <div class="stickybar"><div class="w"><button class="btn" data-act="addentry">${MEAL_NAME[S.meal]}에 기록하기</button></div></div></div>`;
    } else if (P.mode === 'custom') {
      ov.innerHTML = `<div class="in"><div class="ovhead"><button data-act="backlist" aria-label="뒤로">‹</button><h2>음식 직접 추가</h2></div>
        <div style="margin-top:18px"><label class="labelbtn">📷 영양성분표 사진으로 자동 입력<input type="file" accept="image/*" id="labelPhoto" hidden></label>
        <p id="labelStatus" class="muted sm" style="margin:8px 20px 0"></p><div id="labelBasis" class="note hidden" style="margin:10px 20px 0"></div></div>
        <div class="pad" style="margin-top:20px">
          <div class="field"><label for="cName">음식 이름</label><div class="inp"><input id="cName" placeholder="예: 통밀 크래커" /></div></div>
          <div class="pair"><div class="field"><label for="cKcal">열량</label><div class="inp"><input id="cKcal" type="number" inputmode="decimal" /><span class="u">kcal</span></div></div>
          <div class="field"><label for="cCarb">탄수화물</label><div class="inp"><input id="cCarb" type="number" inputmode="decimal" /><span class="u">g</span></div></div>
          <div class="field"><label for="cSugar">당류</label><div class="inp"><input id="cSugar" type="number" inputmode="decimal" /><span class="u">g</span></div></div>
          <div class="field"><label for="cProt">단백질</label><div class="inp"><input id="cProt" type="number" inputmode="decimal" /><span class="u">g</span></div></div>
          <div class="field"><label for="cFat">지방</label><div class="inp"><input id="cFat" type="number" inputmode="decimal" /><span class="u">g</span></div></div>
          <div class="field"><label for="cFiber">식이섬유</label><div class="inp"><input id="cFiber" type="number" inputmode="decimal" /><span class="u">g</span></div></div></div>
          <div class="field"><label for="cUnit">1인분 표시</label><div class="inp"><input id="cUnit" placeholder="예: 1봉, 1개" /></div></div>
          <div id="eatRow" class="field hidden"><label for="cEat">내가 먹는 양 <span class="muted" id="eatUnit"></span></label><div class="inp"><input id="cEat" type="number" inputmode="decimal" /></div>
            <p class="muted sm" style="margin:6px 0 0">위 값이 이 양으로 환산돼요.</p></div>
          <details id="rawBox" class="hidden"><summary class="muted">인식된 글자 보기</summary><pre class="raw" id="rawText"></pre></details>
          <p class="muted sm">포장지 영양성분표의 숫자를 그대로 적어 주세요.</p></div>
        <div class="stickybar"><div class="w"><button class="btn" data-act="savecustom">저장하고 양 정하기</button></div></div></div>`;
    }
    ov.scrollTop = 0;
  }

  /* ----- 라벨 사진 ----- */
  let labelBasis = null;
  async function onLabelPhoto(file) {
    const st = $('#labelStatus');
    st.textContent = '글자를 읽는 중이에요. 처음 한 번은 인식 데이터를 받느라 조금 걸려요.';
    try {
      const text = await LABEL.ocr(file, m => { if (m && m.status && m.progress != null) st.textContent = `글자 인식 중… ${Math.round(m.progress * 100)}%`; });
      applyLabel(text);
    } catch (err) { st.textContent = '인식하지 못했어요. ' + err.message + ' 값을 직접 입력해 주세요.'; }
  }
  function applyLabel(text) {
    const r = LABEL.parse(text), st = $('#labelStatus');
    $('#rawText').textContent = text || '(글자를 찾지 못했어요)'; $('#rawBox').classList.remove('hidden');
    const map = { kcal: '#cKcal', carb: '#cCarb', sugar: '#cSugar', protein: '#cProt', fat: '#cFat', fiber: '#cFiber' };
    Object.keys(map).forEach(k => $(map[k]).value = r.values[k] != null ? r.values[k] : '');
    labelBasis = r.basis;
    const box = $('#labelBasis'), eat = $('#eatRow');
    if (!r.found) { st.textContent = '영양성분을 찾지 못했어요. 표가 정면으로 선명하게 나오게 다시 찍어 보세요.'; box.classList.add('hidden'); eat.classList.add('hidden'); return; }
    const names = { kcal: '열량', carb: '탄수화물', sugar: '당류', protein: '단백질', fat: '지방' };
    const miss = Object.keys(names).filter(k => r.values[k] == null).map(k => names[k]);
    st.textContent = `${r.found}개 항목을 읽었어요. 숫자가 맞는지 꼭 확인해 주세요.` + (miss.length ? ` 못 읽은 항목: ${miss.join(', ')}` : '');
    if (r.basis) {
      box.innerHTML = `읽은 값의 기준은 <b>${esc(r.basis.kind)}</b>이에요. 일부만 드시면 아래에 먹은 양을 적어 주세요.`; box.classList.remove('hidden');
      $('#eatUnit').textContent = `(${r.basis.unit})`; $('#cEat').value = r.basis.amount; eat.classList.remove('hidden');
      if (!$('#cUnit').value) $('#cUnit').value = r.basis.kind.includes('1회') ? '1회 제공량' : r.basis.kind.includes('총') ? '1개(전체)' : '';
    } else { box.innerHTML = '기준량(100g당·1회 제공량)을 찾지 못했어요. 읽은 값이 어느 기준인지 확인해 주세요.'; box.classList.remove('hidden'); eat.classList.add('hidden'); }
  }
  function saveCustom() {
    const name = $('#cName').value.trim();
    if (!name) return toast('음식 이름을 입력해 주세요');
    let scale = 1, g = 0, unit = $('#cUnit').value.trim() || '1인분';
    if (labelBasis && !$('#eatRow').classList.contains('hidden')) {
      const eat = parseFloat($('#cEat').value);
      if (eat > 0) { scale = eat / labelBasis.amount; g = eat; if (scale !== 1) unit = `${eat}${labelBasis.unit}`; }
    }
    const v = id => Math.round((parseFloat($(id).value) || 0) * scale * 10) / 10;
    const f = { id: 'c_' + Date.now().toString(36), name, cat: '내 음식', unit, g, kcal: Math.round(v('#cKcal')), carb: v('#cCarb'), sugar: v('#cSugar'), protein: v('#cProt'), fat: v('#cFat'), fiber: v('#cFiber') };
    customFoods.push(f); store.save('dk_custom', customFoods);
    labelBasis = null; toast('내 음식으로 저장했어요');
    S.picker.mode = 'amount'; S.picker.food = f; S.picker.ratio = 1; renderPicker();
  }

  function readPhoto(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 360 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.7));
      }; img.src = reader.result;
    }; reader.readAsDataURL(file);
  }

  /* =====================================================
     식단 / 내 정보 / 알아두기
     ===================================================== */
  function viewPlan() {
    const T = getT(), W = weekPlan(T), d = S.planDay, day = W.days[d];
    let tot = Object.fromEntries(NUT_KEYS.map(k => [k, 0]));
    const dayCost = x => MEALS.reduce((s, m) => s + x[m].cost, 0);
    const blocks = MEALS.map(m => {
      const { items, cost } = day[m], s = sumNut(items.map(x => ({ food: x.f, ratio: x.r })));
      NUT_KEYS.forEach(k => tot[k] += s[k]);
      return `<div class="pm"><div class="h"><h3>${MEAL_NAME[m]}</h3><span class="muted sm num">목표 ${T.meals[m]}kcal · 약 ${won(cost)}</span></div>
        ${menuList(items)}<div class="sum num">${Math.round(s.kcal)}kcal · 탄수화물 ${Math.round(s.carb)}g · 당류 ${r1(s.sugar)}g · 단백질 ${r1(s.protein)}g</div>
        <div class="row"><button class="btn alt sm" data-act="plannext" data-m="${m}" data-day="${d}">다른 예시</button><button class="btn sm" data-act="planadd" data-m="${m}" data-day="${d}">이 끼니 기록</button></div></div>`;
    }).join('');
    const pref = (profile.cuisines || []).map(c => (CUISINES.find(x => x[0] === c) || [])[1]).filter(Boolean);
    const over = W.budget && W.total > W.budget;
    const budgetHtml = W.budget
      ? `<div class="note ${over ? 'bad' : 'good'}">이번 주 식단 약 <b class="num">${won(W.total)}</b> · 예산 ${won(W.budget)}${over ? `<br>예산보다 약 ${won(W.total - W.budget)} 많아요. 외식 일품요리 대신 집밥 예시를 고르거나 예산을 다시 정해 보세요.` : ' 안에 맞췄어요.'}</div>`
      : `<p class="muted sm" style="margin:0">이번 주 식단 약 <b class="num">${won(W.total)}</b>이에요. 내 정보에서 주간 식비를 정하면 그 안에 맞춰 드려요.</p>`;
    const qs = [...new Set(['저당 식단', ...(profile.cuisines || []).map(c => MAP_QUERY[c]).filter(Boolean)])].slice(0, 4);
    const enc = encodeURIComponent;
    return `<div class="top"><h1>일주일 식단</h1></div>
      <section class="sec" style="padding-top:6px">
        <p class="muted" style="margin:0 0 10px">하루 ${T.kcal}kcal를 아침 25% · 점심 30% · 저녁 30% · 간식 15%로 나눴어요.${pref.length ? ` 좋아하는 <b>${esc(pref.join(', '))}</b> 위주로 골랐어요.` : ''}</p>
        ${budgetHtml}
        <div class="mealtabs days" role="tablist">${W.days.map((x, i) => `<button role="tab" aria-selected="${i === d}" class="${i === d ? 'on' : ''}" data-act="planday" data-v="${i}">${DAY_NAME[i]}<small class="num">${won(dayCost(x))}</small></button>`).join('')}</div>
        ${blocks}</section>
      <section class="sec"><h2>${DAY_NAME[d]}요일 합계</h2>${meter('열량', tot.kcal, T.kcal, 'kcal')}${meter('탄수화물', tot.carb, T.carb, 'g')}${meter('당류', tot.sugar, T.sugar, 'g')}${meter('단백질', tot.protein, T.protein, 'g', 'min')}</section>
      <section class="sec"><h2>밖에서 먹을 때</h2>
        <p class="muted" style="margin:0 0 10px">지금 위치 근처에서 지도 앱으로 찾아봐요. 당뇨 식단 인증 식당 목록은 없어서, 고르기 쉬운 메뉴로 검색해요.</p>
        <div class="maps">${qs.map(q => `<div class="mq"><span>${esc(q)}</span><a class="btn alt sm" href="https://map.naver.com/p/search/${enc(q)}" target="_blank" rel="noopener">네이버지도</a><a class="btn alt sm" href="https://map.kakao.com/link/search/${enc(q)}" target="_blank" rel="noopener">카카오맵</a></div>`).join('')}</div>
        <ul class="tips"><li>밥은 반 공기 먼저 덜어 두고, 잡곡밥이 있으면 바꿔 달라고 하세요.</li><li>구이·찜·샤브샤브처럼 양념이 적은 메뉴가 고르기 쉬워요. 양념갈비·찜닭·탕수육은 당이 많아요.</li><li>회덮밥·초밥은 밥 양이 많아요. 초고추장과 초밥 밥에도 설탕이 들어가요.</li><li>음료는 물이나 보리차로 주문하세요.</li></ul></section>
      <section class="sec"><h2>당류 기준</h2><p class="muted" style="margin:0 0 6px">한국인 영양소 섭취기준은 총당류 20% 이내, 첨가당 10% 이내이고 가당 음료는 가능한 줄이도록 해요. 20%는 넘으면 안 되는 한계선이라, 이 앱은 모두에게 에너지의 10%를 상한으로 잡아요. 2,000kcal라면 50g이에요.</p></section>
      <section class="sec"><h2>양 가늠하기</h2><p class="muted" style="margin:0">밥 1공기(210g)는 일반 밥공기에 평평하게 담은 양이에요. 고기·생선 1인분은 손바닥 크기, 견과류 한 줌은 약 25g이에요.</p>
        <p class="fine">가격은 공공데이터에 없어 앱이 정한 추정치예요. 밥·국·반찬은 집밥 재료비, 덮밥·초밥·탕 같은 일품요리는 외식 1인분 기준이라 지역과 가게마다 달라요.</p></section>`;
  }

  function planNote(T, p) {
    const P = T.plan; if (!P) return '';
    if (P.mismatch) return `<div class="note">목표 체중이 고른 목표와 반대 방향이라 기본값(${p.goal === 'diet' ? '−500' : '+300'}kcal)으로 계산했어요.</div>`;
    const dir = P.delta > 0 ? '늘리기' : '줄이기', wk = Math.abs(P.rate).toFixed(2).replace(/0$/, '');
    const head = `목표 ${p.targetWeight}kg까지 ${Math.abs(P.delta).toFixed(1)}kg ${dir} · ${p.targetWeeks}주 (주당 ${wk}kg)`;
    if (P.fast) return `<div class="note bad"><b>${head}</b><br>이 속도는 하루 ${P.raw > 0 ? '+' : ''}${P.raw}kcal가 필요해 무리예요. ${P.delta > 0 ? '근육은 주 0.25~0.5kg 정도 느는 게 현실적이라' : '주 1kg보다 빨리 빼면 근육이 빠지기 쉬워'} 하루 ${P.adj > 0 ? '+' : ''}${P.adj}kcal로 잡았어요. 이 속도면 약 ${P.weeksNeeded}주가 걸려요.</div>`;
    return `<div class="note good"><b>${head}</b><br>하루 ${P.adj > 0 ? '+' : ''}${P.adj}kcal를 반영했어요. (지방 1kg ≈ 7,700kcal로 계산)</div>`;
  }

  function viewMe() {
    const T = getT(), rows = NUTRI.assess(profile), p = profile;
    const goalTxt = { diet: '다이어트', maintain: '체중 유지', muscle: '근육 증가' }[p.goal];
    const dot = { ok: '', warn: 'warn', bad: 'bad' };
    const lab = { ok: '정상', warn: '주의', bad: '관리 필요' };
    const groups = [...new Set(rows.map(r => r.grp))];
    return `<div class="top"><h1>${S.justFinished ? '목표가 정해졌어요' : '내 정보'}</h1></div>
      <section class="sec" style="padding-top:6px"><p class="muted" style="margin:0 0 12px">${esc(p.name || '')} · ${p.sex === 'M' ? '남' : '여'} ${p.age}세 · ${p.height}cm · ${p.weight}kg${p.bodyFat ? ` · 체지방 ${p.bodyFat}%` : ''} · 목표 ${goalTxt}</p>
        <div class="kpis"><div><b class="num">${T.kcal}</b><span>하루 열량 (kcal)</span></div><div><b class="num">${T.carb}g</b><span>탄수화물 · 열량의 ${Math.round(T.carb * 4 / T.kcal * 100)}%</span></div>
          <div><b class="num">${T.sugar}g</b><span>당류 상한 (에너지의 ${Math.round(T.sugarPct * 100)}%)</span></div><div><b class="num">${T.protein}g</b><span>단백질 (${esc(T.protBasis)})</span></div>
          <div><b class="num">${T.fat}g</b><span>지방 (25%)</span></div><div><b class="num">${T.fiber}g</b><span>식이섬유</span></div></div>
        <p class="muted sm" style="margin:10px 0 0">에너지필요추정량 ${T.eer}kcal 기준이에요. 의사나 영양사가 정해 준 목표가 있다면 그 값을 따르세요.</p>
        ${planNote(T, p)}
        ${p.cuisines && p.cuisines.length || p.budget ? `<p class="muted sm" style="margin:8px 0 0">식단 예시: ${p.cuisines && p.cuisines.length ? esc(p.cuisines.map(c => (CUISINES.find(x => x[0] === c) || [])[1]).join(', ')) + ' 위주' : '골고루'}${p.budget ? ` · 일주일 식비 ${won(p.budget)}` : ''}</p>` : ''}
        ${T.kidney ? '<div class="note">신장질환이 있어 단백질을 0.8g/kg으로 낮췄어요. 처방량이 있다면 그 값을 따르세요.</div>' : ''}
        ${T.protCapped ? '<div class="note">당뇨가 있어 단백질은 체중 1kg당 1.3g을 넘지 않게 잡았어요. 고단백식은 당뇨로 약해진 신장에 부담이 될 수 있어요.</div>' : ''}</section>
      ${S.justFinished ? `<section class="sec"><button class="btn" data-act="startlog" data-m="${autoMeal()}">첫 끼니 기록하기</button></section>` : ''}
      <section class="sec"><h2>영양판정</h2>${groups.map(g => `<h3>${g}</h3>${rows.filter(r => r.grp === g).map(r => `<div class="judge"><div class="a">${r.name}<small>${esc(r.note)}</small></div><div class="b"><b>${esc(r.val)}</b>${r.lv === 'info' ? '' : `<span class="tag ${dot[r.lv]}">${lab[r.lv]}</span>`}</div></div>`).join('')}`).join('')}</section>
      <section class="sec"><button class="btn alt" data-act="wizedit">정보 수정하기</button></section>`;
  }

  function viewLearn() {
    return `<div class="top"><h1>알아두기</h1></div><div class="learn">
      <section class="sec" style="padding-top:6px"><h2>당류 0g인데 왜 혈당이 오를까요?</h2>
        <p>영양성분표의 <b>당류</b>는 설탕·과당·유당 같은 단순당만 세요. 밥·면·빵·떡의 <b>전분</b>은 탄수화물로 따로 표시되고, 소화되면 모두 포도당이 되어 혈당을 올려요. 쌀밥 한 공기는 당류가 0g이어도 탄수화물이 약 70~80g이에요.</p>
        <p>그래서 이 앱은 당류와 <b>탄수화물</b>을 함께 보고, 한 끼에 몰리지 않았는지도 확인해요.</p></section>
      <section class="sec"><h2>식사요법 핵심 5가지</h2><ol>
        <li><b>규칙적으로, 골고루</b> — 세 끼를 비슷한 시간에, 비슷한 양으로 드세요. 끼니를 거르면 다음 식사 후 혈당이 크게 올라요.</li>
        <li><b>밥은 잡곡으로, 양은 일정하게</b> — 현미·보리 등 통곡물은 식이섬유가 많아 혈당이 천천히 올라요.</li>
        <li><b>채소 → 단백질 → 밥 순서로</b> — 채소와 반찬을 먼저 먹으면 식후 혈당 상승을 줄이는 데 도움이 돼요.</li>
        <li><b>단 음료부터 줄이기</b> — 액체로 마시는 당은 흡수가 빨라요. 물·보리차·무가당 음료로 바꾸세요.</li>
        <li><b>과일은 한 번에 조금</b> — 사과 ⅓개, 귤 1개, 딸기 7알 정도가 1회분이에요. 주스 대신 생과일로 드세요.</li></ol></section>
      <section class="sec"><h2>혈당지수(GI)란?</h2><p>같은 탄수화물이라도 혈당을 올리는 속도가 달라요. 흰밥·떡·감자·식빵은 <b>높음</b>, 현미·잡곡밥·고구마는 <b>중간</b>, 채소·콩·대부분의 생과일·우유는 <b>낮음</b>에 가까워요.</p>
        <p class="muted sm">표시는 문헌의 대표값을 나눈 참고용이에요. 혈당 관리는 지수보다 <b>총 탄수화물 양</b>이 먼저예요.</p></section>
      <section class="sec"><h2>숨은 당 찾기</h2><p>조림·볶음 반찬(멸치볶음, 불고기, 연근조림)에는 물엿·설탕이 들어가 당이 의외로 많아요. 양념을 절반으로 줄이고 양파·무로 단맛을 내 보세요. 믹스커피 1봉에는 각설탕 2개쯤의 당이 있어요.</p></section>
      <section class="sec"><h2>저혈당이 의심될 때</h2><p>식은땀, 떨림, 어지러움이 있으면 혈당부터 재세요. 70mg/dL 미만이면 당 15g(주스 ½컵, 사탕 3~4개)을 먹고 15분 뒤 다시 재요. 이때는 점수보다 안전이 먼저예요.</p></section>
      <p class="fine">영양 정보는 식약처·농촌진흥청 공공 데이터에서 가져왔고 제품과 조리법에 따라 달라질 수 있어요. 이 앱은 진단·처방을 대신하지 않아요. 약 조절이나 식사 계획은 담당 의사·임상영양사와 상의하세요.</p></div>`;
  }

  /* =====================================================
     처음 시작 마법사
     ===================================================== */
  const WIZ = [
    { t: '누구의 식단을 관리할까요?', s: '기본 정보로 하루에 필요한 열량을 계산해요.', f: [
      { k: 'name', type: 'text', label: '이름 또는 부르는 말', ph: '예: 아버지' },
      { k: 'sex', type: 'seg', label: '성별', opts: [['M', '남자'], ['F', '여자']] },
      { k: 'age', type: 'num', label: '나이', unit: '세', req: '나이를 입력해 주세요' }] },
    { t: '몸 상태를 알려 주세요', s: '키와 체중은 꼭 필요해요. 나머지는 모르면 비워 두세요.', f: [
      { k: 'height', type: 'num', label: '키', unit: 'cm', step: '0.1', req: '키를 입력해 주세요' },
      { k: 'weight', type: 'num', label: '체중', unit: 'kg', step: '0.1', req: '체중을 입력해 주세요' },
      { k: 'waist', type: 'num', label: '허리둘레 (선택)', unit: 'cm', step: '0.1' }] },
    { t: '인바디 결과가 있나요?', s: '체지방률을 알면 BMI로는 안 보이는 "마른 비만"이나 근육형 체형을 구분할 수 있어요.', skip: true, f: [
      { k: 'bodyFat', type: 'num', label: '체지방률', unit: '%', step: '0.1' },
      { k: 'smm', type: 'num', label: '골격근량', unit: 'kg', step: '0.1' }] },
    { t: '최근 혈당 검사 결과가 있나요?', s: '검진표에 있는 것만 적어도 돼요. 없으면 건너뛰세요.', skip: true, f: [
      { k: 'fbs', type: 'num', label: '공복혈당', unit: 'mg/dL' },
      { k: 'ppg', type: 'num', label: '식후 2시간 혈당', unit: 'mg/dL' },
      { k: 'hba1c', type: 'num', label: '당화혈색소', unit: '%', step: '0.1' }] },
    { t: '혈압과 콜레스테롤도 있나요?', s: '이것도 모르면 건너뛰세요.', skip: true, f: [
      { k: 'sbp', type: 'num', label: '혈압 (수축기, 위 숫자)', unit: 'mmHg' },
      { k: 'dbp', type: 'num', label: '혈압 (이완기, 아래 숫자)', unit: 'mmHg' },
      { k: 'tc', type: 'num', label: '총콜레스테롤', unit: 'mg/dL' },
      { k: 'tg', type: 'num', label: '중성지방', unit: 'mg/dL' },
      { k: 'ldl', type: 'num', label: 'LDL 콜레스테롤', unit: 'mg/dL' },
      { k: 'hdl', type: 'num', label: 'HDL 콜레스테롤', unit: 'mg/dL' }] },
    { t: '평소 생활은 어떤가요?', s: '직업과 활동량으로 하루 소비 열량을 정해요.', f: [
      { k: 'job', type: 'opts', label: '하는 일', opts: [['office', '앉아서 하는 일', '사무직, 운전 등'], ['service', '서서 하는 일', '판매, 서비스 등'], ['labor', '몸을 쓰는 일', '현장, 농사 등'], ['heavy', '매우 힘든 일', '고강도 육체노동'], ['retired', '쉬고 계세요', '은퇴, 무직']] },
      { k: 'pa', type: 'opts', label: '운동·활동량', opts: [['1', '거의 앉아서 지내요', ''], ['2', '가볍게 걷는 정도', ''], ['3', '주 3~5회 운동해요', ''], ['4', '매일 힘들게 움직여요', '']] },
      { k: 'conditions', type: 'multi', label: '해당하는 건강 상태 (모두 선택)', opts: [['diabetes', '당뇨병'], ['htn', '고혈압'], ['dyslipid', '이상지질혈증'], ['kidney', '신장질환']] }] },
    { t: '식단 목표는 무엇인가요?', s: '목표에 따라 하루 열량이 달라져요.', f: [
      { k: 'goal', type: 'opts', label: '', opts: [['maintain', '지금 체중 유지', '필요한 열량만큼 드세요'], ['diet', '체중 줄이기', '기본은 필요 열량보다 500kcal 적게'], ['muscle', '근육 늘리기', '기본은 필요 열량보다 300kcal 많게, 단백질 높게']] },
      { k: 'targetWeight', type: 'num', label: '목표 체중 (선택)', unit: 'kg', step: '0.1', when: d => d.goal !== 'maintain' },
      { k: 'targetWeeks', type: 'num', label: '목표 기간 (선택)', unit: '주', when: d => d.goal !== 'maintain' }] },
    { t: '좋아하는 음식과 식비', s: '식단 예시를 좋아하는 종류로, 일주일 식비 안에서 짜 드려요. 정하지 않으면 골고루 보여 드려요.', skip: true, f: [
      { k: 'cuisines', type: 'multi', label: '좋아하는 음식 (여러 개 선택)', opts: CUISINES },
      { k: 'budget', type: 'num', label: '일주일 식비 (1인, 간식 포함)', unit: '만원', step: '0.5' }] }
  ];
  const DEF = { sex: 'M', job: 'office', pa: '1', goal: 'maintain', conditions: [] };

  function startWizard(prefill) {
    S.wiz = { step: 0, d: Object.assign({}, DEF, prefill ? Object.assign({}, prefill, { pa: String(prefill.pa), conditions: [...(prefill.conditions || [])], cuisines: [...(prefill.cuisines || [])], budget: prefill.budget ? prefill.budget / 10000 : '' }) : {}) };
    S.route = 'wizard'; render();
  }
  function wizField(f, d) {
    const val = d[f.k] ?? '';
    if (f.type === 'text') return `<div class="field"><label for="w_${f.k}">${f.label}</label><div class="inp"><input id="w_${f.k}" data-w="${f.k}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" /></div></div>`;
    if (f.type === 'num') return `<div class="field"><label for="w_${f.k}">${f.label}</label><div class="inp"><input id="w_${f.k}" data-w="${f.k}" type="number" inputmode="decimal" step="${f.step || 1}" value="${esc(val)}" /><span class="u">${f.unit}</span></div></div>`;
    if (f.type === 'seg') return `<div class="field"><span class="fl">${f.label}</span><div class="seg2">${f.opts.map(o => `<button class="opt ${d[f.k] === o[0] ? 'on' : ''}" data-act="wset" data-k="${f.k}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
    if (f.type === 'opts') return `<div class="field">${f.label ? `<span class="fl">${f.label}</span>` : ''}<div class="opts">${f.opts.map(o => `<button class="opt ${String(d[f.k]) === o[0] ? 'on' : ''}" data-act="wset" data-k="${f.k}" data-v="${o[0]}">${o[1]}${o[2] ? `<small>${o[2]}</small>` : ''}</button>`).join('')}</div></div>`;
    if (f.type === 'multi') return `<div class="field"><span class="fl">${f.label}</span><div class="opts two">${f.opts.map(o => `<button class="opt ${(d[f.k] || []).includes(o[0]) ? 'on' : ''}" data-act="wmulti" data-k="${f.k}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
    return '';
  }
  function viewWizard() {
    const W = S.wiz, st = WIZ[W.step], last = W.step === WIZ.length - 1;
    return `<div class="wiz"><div class="progress" aria-label="${W.step + 1}단계 / ${WIZ.length}단계">${WIZ.map((_, i) => `<i class="${i <= W.step ? 'on' : ''}"></i>`).join('')}</div>
      <h1>${st.t}</h1><p class="sub">${st.s}</p>${st.f.filter(f => !f.when || f.when(W.d)).map(f => wizField(f, W.d)).join('')}
      ${st.f.some(f => f.k === 'targetWeight') && W.d.goal !== 'maintain' ? '<p class="muted sm">목표 체중과 기간을 넣으면 하루 열량을 그 속도에 맞춰요. 건강한 속도를 넘으면 안전한 범위로 줄여요.</p>' : ''}
      ${st.skip ? '<div class="skip"><button class="btn quiet" data-act="wnext" data-skip="1">모르겠어요 · 건너뛰기</button></div>' : ''}</div>
      <div class="stickybar"><div class="w row">${W.step > 0 ? '<button class="btn alt" style="flex:0 0 96px" data-act="wback">이전</button>' : ''}<button class="btn" data-act="wnext">${last ? '목표 계산하기' : '다음'}</button></div></div>`;
  }
  function finishWizard() {
    const d = S.wiz.d, num = k => { const v = parseFloat(d[k]); return isNaN(v) ? null : v; };
    profile = { name: (d.name || '').trim(), sex: d.sex, age: num('age'), height: num('height'), weight: num('weight'), waist: num('waist'),
      fbs: num('fbs'), ppg: num('ppg'), hba1c: num('hba1c'), tc: num('tc'), tg: num('tg'), ldl: num('ldl'), hdl: num('hdl'), sbp: num('sbp'), dbp: num('dbp'),
      job: d.job, pa: Number(d.pa), conditions: d.conditions || [], memo: '', goal: d.goal,
      bodyFat: num('bodyFat'), smm: num('smm'),
      targetWeight: d.goal !== 'maintain' ? num('targetWeight') : null, targetWeeks: d.goal !== 'maintain' ? num('targetWeeks') : null,
      cuisines: d.cuisines || [], budget: num('budget') ? Math.round(num('budget') * 10000) : null };
    store.save('dk_profile', profile);
    S.justFinished = true; S.route = 'me'; render();
  }

  /* =====================================================
     렌더 · 이벤트
     ===================================================== */
  function render() {
    const view = $('#view'), nav = $('#nav');
    if (!profile && S.route !== 'wizard') S.route = 'wizard';
    if (S.route === 'wizard') { if (!S.wiz.d.sex) startWizardInit(); view.innerHTML = viewWizard(); nav.classList.add('off'); window.scrollTo(0, 0); return; }
    nav.classList.remove('off');
    nav.innerHTML = `<div class="in">${NAV.map(([k, n]) => `<button class="${S.route === k ? 'on' : ''}" data-act="nav" data-v="${k}" aria-label="${n}">${ICON[k === 'today' ? 'today' : k]}${n}</button>`).join('')}</div>`;
    const fn = { today: viewToday, log: viewLog, plan: viewPlan, me: viewMe, learn: viewLearn }[S.route] || viewToday;
    view.innerHTML = fn();
  }
  function startWizardInit() { S.wiz.d = Object.assign({}, DEF, S.wiz.d); }

  function goto(route) { S.route = route; if (route !== 'me') S.justFinished = false; render(); window.scrollTo(0, 0); }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, d = el.dataset;
    switch (a) {
      case 'nav': goto(d.v); break;
      case 'shift': { const x = new Date(S.date + 'T00:00:00'); x.setDate(x.getDate() + Number(d.v)); S.date = ymd(x); render(); break; }
      case 'pickdate': { const i = $('#dateInput'); try { i.showPicker(); } catch (_) { i.focus(); i.click(); } break; }
      case 'setmeal': S.meal = d.m; if (S.route !== 'log') S.route = 'log'; render(); window.scrollTo(0, 0); break;
      case 'startlog': S.meal = d.m; S.justFinished = false; S.date = todayStr(); S.route = 'log'; render(); window.scrollTo(0, 0); break;
      case 'planadd': addPlan(d.m, d.day ? Number(d.day) : undefined); S.meal = d.m; S.route = 'log'; render(); window.scrollTo(0, 0); break;
      case 'plannext': { const day = d.day ? Number(d.day) : dayOf(S.date), k = day + '-' + d.m; S.planIdx[k] = (S.planIdx[k] || 0) + 1; render(); break; }
      case 'planday': S.planDay = Number(d.v); render(); break;
      case 'del': if (confirm('이 기록을 지울까요?')) { logs[S.date] = dayEntries(S.date).filter(x => x.id !== d.id); store.save('dk_logs', logs); render(); } break;
      case 'openpicker': openPicker(); break;
      case 'closepicker': closePicker(); break;
      case 'backlist': S.picker.mode = 'list'; renderPicker(); break;
      case 'opencustom': S.picker.mode = 'custom'; labelBasis = null; renderPicker(); break;
      case 'pickcat': S.picker.cat = d.c; $('#chips').innerHTML = chipRow(); $('#foodlist').innerHTML = foodRows(); break;
      case 'pickfood': S.picker.mode = 'amount'; S.picker.food = foodById(d.id); S.picker.ratio = 1; S.picker.pb = S.picker.pa = null; renderPicker(); break;
      case 'ratio': S.picker.ratio = Number(d.r); { const sc = $('#overlay').scrollTop; renderPicker(); $('#overlay').scrollTop = sc; } break;
      case 'addentry': {
        const P = S.picker, list = (logs[S.date] = logs[S.date] || []);
        list.push({ id: Date.now().toString(36), meal: S.meal, foodId: P.food.id, ratio: P.ratio, photoBefore: P.pb, photoAfter: P.pa });
        if (store.save('dk_logs', logs)) toast(`${MEAL_NAME[S.meal]}에 ${P.food.name}을(를) 기록했어요`);
        closePicker(); window.scrollTo(0, 0); break;
      }
      case 'savecustom': saveCustom(); break;
      case 'wset': S.wiz.d[d.k] = d.v; if (d.k === 'job') S.wiz.d.pa = String(JOB_PA[d.v]); viewWizardKeep(); break;
      case 'wmulti': { const arr = S.wiz.d[d.k] = S.wiz.d[d.k] || []; const i = arr.indexOf(d.v); i >= 0 ? arr.splice(i, 1) : arr.push(d.v); viewWizardKeep(); break; }
      case 'wback': S.wiz.step--; render(); break;
      case 'wnext': wizNext(!!d.skip); break;
      case 'wizedit': startWizard(profile); break;
    }
  });
  function viewWizardKeep() { const sc = window.scrollY; render(); window.scrollTo(0, sc); }

  function wizNext(skip) {
    const W = S.wiz, st = WIZ[W.step];
    if (!skip) for (const f of st.f) if (f.req && !(parseFloat(W.d[f.k]) > 0)) { toast(f.req); const i = $('#w_' + f.k); i && i.focus(); return; }
    if (W.step === 0 && W.d.age && parseFloat(W.d.age) < 19) return toast('이 계산식은 19세 이상 성인 기준이에요');
    if (!skip && st.f.some(f => f.k === 'bodyFat') && W.d.bodyFat && !(parseFloat(W.d.bodyFat) > 2 && parseFloat(W.d.bodyFat) < 70)) return toast('체지방률은 % 값으로 입력해 주세요 (예: 22.5)');
    if (st.f.some(f => f.k === 'targetWeight') && W.d.goal !== 'maintain') {
      const tw = parseFloat(W.d.targetWeight), wk = parseFloat(W.d.targetWeeks), cw = parseFloat(W.d.weight);
      if (tw > 0 && !(wk > 0)) return toast('목표 기간도 입력해 주세요');
      if (W.d.goal === 'diet' && tw >= cw) return toast('체중 줄이기인데 목표 체중이 지금보다 높아요');
      if (W.d.goal === 'muscle' && tw > 0 && tw <= cw) return toast('근육 늘리기인데 목표 체중이 지금보다 낮아요');
    }
    if (W.step === WIZ.length - 1) return finishWizard();
    W.step++; render();
  }

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.w) S.wiz.d[t.dataset.w] = t.value;
    else if (t.id === 'q') { S.picker.q = t.value.trim(); $('#foodlist').innerHTML = foodRows(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'dateInput' && t.value) { S.date = t.value; render(); }
    else if (t.id === 'photoBefore' || t.id === 'photoAfter') {
      const f = t.files[0]; if (!f) return;
      readPhoto(f, data => { if (t.id === 'photoBefore') S.picker.pb = data; else S.picker.pa = data; const sc = $('#overlay').scrollTop; renderPicker(); $('#overlay').scrollTop = sc; const dd = $('details.fold'); if (dd) dd.open = true; });
    } else if (t.id === 'labelPhoto') { const f = t.files[0]; if (f) onLabelPhoto(f); t.value = ''; }
  });

  render();
})();
