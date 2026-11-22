/* 영양성분표(라벨) 사진 → 영양성분 자동 입력
 * - OCR: Tesseract.js (브라우저 안에서 실행, 사진이 서버로 전송되지 않음). 처음 사용할 때만 CDN에서 불러옵니다.
 * - parse(): OCR로 읽은 글자에서 기준량(100g당/1회 제공량/총 내용량)과 영양성분을 찾아냅니다.
 */
const LABEL = (function () {
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let workerPromise = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('OCR 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
      document.head.appendChild(s);
    });
  }

  /* 사진을 키우거나 줄이고 흑백·대비를 높여 인식률을 올림 */
  function preprocess(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const target = 1800, s = Math.min(2, target / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
        let min = 255, max = 0;
        for (let i = 0; i < p.length; i += 4) {
          const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          p[i] = p[i + 1] = p[i + 2] = g;
          if (g < min) min = g; if (g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for (let i = 0; i < p.length; i += 4) {
          const v = Math.max(0, Math.min(255, ((p[i] - min) / range - 0.5) * 1.4 * 255 + 128));
          p[i] = p[i + 1] = p[i + 2] = v;
        }
        ctx.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('사진을 처리하지 못했어요.')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('사진을 열 수 없어요.')); };
      img.src = url;
    });
  }

  /* 어두운 칸(예: 초록 표 안의 흰 글자)과 밝은 칸을 칸마다 따로 판단해 '흰 바탕·검은 글자'로 바꿈 */
  function preprocessAdaptive(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const sc = 1700 / Math.max(img.width, img.height), W = Math.round(img.width * sc), H = Math.round(img.height * sc);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H), p = d.data, n = W * H, g = new Uint8Array(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * p[j] + 0.587 * p[j + 1] + 0.114 * p[j + 2];
        const S = new Float64Array((W + 1) * (H + 1));            // 적분 이미지
        for (let y = 1; y <= H; y++) { let row = 0; for (let x = 1; x <= W; x++) { row += g[(y - 1) * W + x - 1]; S[y * (W + 1) + x] = S[(y - 1) * (W + 1) + x] + row; } }
        const mean = (x, y, r) => { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
          return (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
        const r1 = Math.max(9, Math.round(Math.max(W, H) / 70)), r2 = Math.round(Math.max(W, H) / 12);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, v = g[i], m1 = mean(x, y, r1), dark = mean(x, y, r2) < 115;
          const text = dark ? v > m1 + 14 : v < m1 - 14;
          const o = text ? 0 : 255, j = i * 4; p[j] = p[j + 1] = p[j + 2] = o; p[j + 3] = 255;
        }
        ctx.putImageData(d, 0, 0); URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('사진을 처리하지 못했어요.')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('사진을 열 수 없어요.')); };
      img.src = url;
    });
  }

  async function ocr(file, onProgress) {
    await loadScript(CDN);
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('kor+eng', 1, {
        logger: m => onProgress && onProgress(m)
      }).catch(e => { workerPromise = null; throw e; });
    }
    const worker = await workerPromise;
    const img = await preprocess(file);
    // 사진·읽기 방식마다 결과가 크게 달라서, 가장 그럴듯하게(항목 수 + 열량과 영양소가 맞는지) 읽힌 결과를 고름
    const variants = [['gray', '6'], ['adaptive', '6'], ['gray', '4'], ['adaptive', '11']];
    const imgs = { gray: img };
    let best = '', bestScore = -1;
    for (const [kind, psm] of variants) {
      if (!imgs[kind]) imgs[kind] = await (kind === 'adaptive' ? preprocessAdaptive(file) : preprocess(file));
      await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
      const r = await worker.recognize(imgs[kind]);
      const text = r.data.text || '', sc = quality(parse(text));
      if (sc > bestScore) { best = text; bestScore = sc; }
      if (bestScore >= 8) break;
    }
    return best;
  }

  /* ---------- 글자 해석 ---------- */
  const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
  const toNum = s => parseFloat(String(s).replace(',', '.'));

  function normalize(text) {
    return String(text)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[ｇＧ]/g, 'g').replace(/[ｍＭ]/g, 'm').replace(/[ｌＬ]/g, 'l')
      .replace(/㎉/g, 'kcal').replace(/㎎/g, 'mg').replace(/㎖/g, 'ml')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/(\d)\s+(?=g|mg|ml|kcal|%)/g, '$1')                // '10.6 g' → '10.6g', '11 %' → '11%'
      .replace(/\s+(?=[가-힣])|(?<=[가-힣])\s+/g, '')                // 한글 옆 공백만 제거. 값과 값 사이 공백은 남겨서 숫자가 붙지 않게 함
      .replace(/(\d)(?:m[1il|]|rnl|ni)(?![a-z])/g, '$1ml')      // 500mI, 500m1 → 500ml
      .replace(/(\d)(?:rng|m9|mq)(?![a-z])/g, '$1mg')           // 5rng → 5mg
      .replace(/kca[1il|]|kral|kcai/g, 'kcal')
      .replace(/(^|[^a-z0-9])o(?=g(?![a-z]))/g, '$10');         // Og → 0g
  }

  /* label 뒤 가까운 곳의 첫 숫자. exclude 접두어(포화·트랜스)가 앞에 붙은 경우는 건너뜀 */
  function findAfter(t, labelRe, opts = {}) {
    const re = new RegExp(labelRe.source, 'g');
    let m;
    while ((m = re.exec(t))) {
      if (opts.notAfter && opts.notAfter.test(t.slice(Math.max(0, m.index - 3), m.index))) continue;
      const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
      const n = tail.match(/^[^\d]{0,5}(\d{1,4})(?:[.,](\d+))?/);
      if (!n) continue;
      // 숫자 바로 뒤가 %이면 (g 값이 아니라 기준치 %) 이 항목의 값이 아님
      if (t[m.index + m[0].length + n[0].length] === '%') continue;
      let ip = n[1], dp = n[2] || '';
      if (opts.gram) {
        // 'g'가 숫자(9·8·6)로 읽혀 소수점 뒤에 붙은 경우: 10.6g → 10.69 → 10.6
        if (dp.length > 1) dp = dp[0];
        // 0g가 09·00으로 읽힌 경우
        if (!dp && ip.length === 2 && ip[0] === '0') ip = '0';
      }
      return toNum(ip + (dp ? '.' + dp : ''));
    }
    return null;
  }

  /* 앞뒤 값이 서로 맞지 않을 때, 끝에 붙은 단위 오인식(9·8·6)을 떼어 봄 */
  function stripUnitDigit(v, limit) {
    if (v == null || !Number.isInteger(v) || v < 10 || !(v > limit)) return v;
    if ([0, 9, 8, 6, 5].includes(v % 10)) { const v2 = Math.floor(v / 10); if (v2 <= limit) return v2; }
    return v;
  }

  /* 영양소 숫자 보정: 단위 g가 숫자(0·9·8·6·5)로 붙거나 소수점이 사라진 값을 후보로 만들고,
   * '열량 ≈ 탄수화물×4 + 단백질×4 + 지방×9', '당류·식이섬유 ≤ 탄수화물'이 가장 잘 맞는 조합을 고름 */
  function candidates(x) {
    if (x == null || isNaN(x)) return [null];
    const c = [{ v: x, cost: 0 }];
    if (Number.isInteger(x) && x >= 10) {
      c.push({ v: Math.floor(x / 10), cost: 1 });
      c.push({ v: x / 10, cost: 1.5 });
      if (x >= 100) c.push({ v: Math.round(x) / 100, cost: 2 });
    }
    return c;
  }
  function energyErr(v) {
    if (v.kcal == null || !(v.kcal > 0) || v.carb == null || v.fat == null || v.protein == null) return null;
    return Math.abs(4 * v.carb + 4 * v.protein + 9 * v.fat - v.kcal) / v.kcal;
  }
  function repair(v) {
    const keys = ['carb', 'sugar', 'protein', 'fat', 'fiber'], opts = keys.map(k => candidates(v[k]));
    let best = null;
    const pick = (i, cur, cost) => {
      if (i === keys.length) {
        const t = {}; keys.forEach((k, j) => { t[k] = cur[j] ? cur[j].v : null; }); t.kcal = v.kcal;
        let pen = cost;
        if (t.carb != null && t.sugar != null && t.sugar > t.carb * 1.02 + 0.2) pen += 8;
        if (t.carb != null && t.fiber != null && t.fiber > t.carb * 1.02 + 0.2) pen += 8;
        keys.forEach(k => { if (t[k] != null && t[k] > 100) pen += 8; });
        const e = energyErr(t);
        if (e != null) pen += 10 * Math.max(0, e - 0.25);
        else if (v.kcal > 0) {                       // 일부 항목을 못 읽었으면 '넘치는지'만 확인
          const part = 4 * (t.carb || 0) + 4 * (t.protein || 0) + 9 * (t.fat || 0);
          if (part > v.kcal * 1.25 + 5) pen += 8;
        }
        if (!best || pen < best.pen) best = { pen, t };
        return;
      }
      for (const o of opts[i]) pick(i + 1, cur.concat([o]), cost + (o ? o.cost : 0));
    };
    pick(0, [], 0);
    if (best) keys.forEach(k => { if (v[k] != null) v[k] = best.t[k]; });
  }
  /* 읽은 결과가 얼마나 믿을 만한지: 읽은 항목 수 + 열량이 영양소와 맞으면 가산점 */
  function quality(r) {
    const e = energyErr(r.values);
    return r.found + (r.values.kcal != null ? 2 : 0) + (e != null && e <= 0.25 ? 3 : 0) + (r.values.sugar != null && r.values.carb != null && r.values.sugar <= r.values.carb ? 1 : 0);
  }

  function parse(raw) {
    const t = normalize(raw);
    const out = { values: {}, basis: null, found: 0 };

    // 영양성분 (g 단위)
    const kcalDirect = t.match(new RegExp(NUM + '(?:kcal|kca1|kcaI)'));
    let kcal = findAfter(t, /열[량랑럄]/);
    if (kcal == null && kcalDirect) kcal = toNum(kcalDirect[1]);
    const v = {
      kcal,
      carb: findAfter(t, /탄수화[물불몰]?/, { gram: true }),
      sugar: findAfter(t, /당류/, { gram: true }),
      protein: findAfter(t, /단백[질잘]/, { gram: true }),
      fat: findAfter(t, /지방/, { notAfter: /포화|트랜스|화|랜스/, gram: true }),
      fiber: findAfter(t, /식이섬유/, { gram: true })
    };
    repair(v);
    Object.keys(v).forEach(k => { if (v[k] != null && !isNaN(v[k])) { out.values[k] = v[k]; out.found++; } });

    // 기준량
    let m;
    if ((m = t.match(/(\d*[가-힣]{1,4})\((\d{1,4}(?:\.\d+)?)(g|ml)\)당(?!류)/)))
      out.basis = { amount: toNum(m[2]), unit: m[3], kind: m[1] + ' ' + m[2] + m[3] + '당' };
    else if ((m = t.match(new RegExp(NUM + '(g|ml)당(?!류)')))) out.basis = { amount: toNum(m[1]), unit: m[2], kind: m[1] === '100' ? '100' + m[2] + '당' : m[1] + m[2] + '당' };
    else if ((m = t.match(new RegExp('1회(?:제공|섭취)(?:기준)?량[^\\d]{0,3}' + NUM + '(g|ml)'))))
      out.basis = { amount: toNum(m[1]), unit: m[2], kind: '1회 제공량 ' + m[1] + m[2] };
    else if ((m = t.match(new RegExp('총내용량[^\\d]{0,3}' + NUM + '(g|ml)'))) && !/,\d{3}/.test(m[0]))
      out.basis = { amount: toNum(m[1]), unit: m[2], kind: '총 내용량 ' + m[1] + m[2] };
    // 총 내용량(한 병·한 캔 전체) — 기준량과 따로 찾음. 예: 표는 '100ml당'인데 병은 500ml
    const VOL = '(\\d{1,3}(?:,\\d{3})+|\\d{1,4}(?:\\.\\d{1,2})?)';
    const toVol = x => parseFloat(String(x).replace(/,/g, ''));
    if ((m = t.match(new RegExp('(?:총)?내용량[^\\d]{0,3}' + VOL + '(ml|g|l)[^\\d]{0,3}\\(' + '(\\d{1,4}(?:\\.\\d+)?)(ml|g)\\s?[x×*]\\s?\\d+')))) {
      out.volume = { amount: toNum(m[3]), unit: m[4] };               // '3,040ml(190ml x 16팩)' → 한 팩 190ml
    } else if ((m = t.match(new RegExp('(?:총)?내용량[^\\d]{0,3}' + VOL + '(ml|g|l)')))) {
      let amt = toVol(m[1]), unit = m[2];
      if (unit === 'l') { amt *= 1000; unit = 'ml'; }
      out.volume = { amount: amt, unit };
    }
    return out;
  }

  return { ocr, parse, normalize };
})();
