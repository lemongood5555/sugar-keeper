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

  async function ocr(file, onProgress) {
    await loadScript(CDN);
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('kor+eng', 1, {
        logger: m => onProgress && onProgress(m)
      }).catch(e => { workerPromise = null; throw e; });
    }
    const worker = await workerPromise;
    const img = await preprocess(file);
    // 표 형태 사진은 읽기 방식에 따라 결과 차이가 커서, 항목을 적게 읽으면 다른 방식으로 한 번 더 시도
    let best = '', bestFound = -1;
    for (const psm of ['6', '4', '11']) {
      await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
      const r = await worker.recognize(img);
      const text = r.data.text || '', f = parse(text).found;
      if (f > bestFound) { best = text; bestFound = f; }
      if (bestFound >= 5) break;
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
    // 말이 안 되는 값은 단위 오인식으로 보고 보정 (열량으로 가능한 최대값을 넘는 경우 등)
    if (v.kcal != null) {
      v.carb = stripUnitDigit(v.carb, v.kcal / 4 * 1.2 + 2);
      v.protein = stripUnitDigit(v.protein, v.kcal / 4 * 1.2 + 2);
      v.fat = stripUnitDigit(v.fat, v.kcal / 9 * 1.2 + 2);
    } else {
      ['carb', 'protein', 'fat'].forEach(k => { v[k] = stripUnitDigit(v[k], 100); });   // 열량을 못 읽었을 때: 한 번 분량에 100g을 넘기 어려움
    }
    if (v.carb != null) v.sugar = stripUnitDigit(v.sugar, v.carb);
    Object.keys(v).forEach(k => { if (v[k] != null && !isNaN(v[k])) { out.values[k] = v[k]; out.found++; } });

    // 기준량
    let m;
    if ((m = t.match(new RegExp(NUM + '(g|ml)당(?!류)')))) out.basis = { amount: toNum(m[1]), unit: m[2], kind: m[1] === '100' ? '100' + m[2] + '당' : m[1] + m[2] + '당' };
    else if ((m = t.match(new RegExp('1회(?:제공|섭취)(?:기준)?량[^\\d]{0,3}' + NUM + '(g|ml)'))))
      out.basis = { amount: toNum(m[1]), unit: m[2], kind: '1회 제공량 ' + m[1] + m[2] };
    else if ((m = t.match(new RegExp('총내용량[^\\d]{0,3}' + NUM + '(g|ml)'))))
      out.basis = { amount: toNum(m[1]), unit: m[2], kind: '총 내용량 ' + m[1] + m[2] };
    // 총 내용량(한 병·한 캔 전체) — 기준량과 따로 찾음. 예: 표는 '100ml당'인데 병은 500ml
    if ((m = t.match(new RegExp('(?:총)?내용량[^\\d]{0,3}' + NUM + '(ml|g|l)')))) {
      let amt = toNum(m[1]), unit = m[2];
      if (unit === 'l') { amt *= 1000; unit = 'ml'; }
      out.volume = { amount: amt, unit };
    }
    return out;
  }

  return { ocr, parse, normalize };
})();
