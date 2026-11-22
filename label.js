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
    const r = await worker.recognize(img);
    return r.data.text || '';
  }

  /* ---------- 글자 해석 ---------- */
  const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
  const toNum = s => parseFloat(String(s).replace(',', '.'));

  function normalize(text) {
    return String(text)
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[ｇＧ]/g, 'g').replace(/[ｍＭ]/g, 'm').replace(/[ｌＬ]/g, 'l')
      .replace(/㎉/g, 'kcal').replace(/㎎/g, 'mg').replace(/㎖/g, 'ml')
      .replace(/\s+/g, '')           // OCR이 한글 사이에 넣는 공백 제거
      .toLowerCase();
  }

  /* label 뒤 가까운 곳의 첫 숫자. exclude 접두어(포화·트랜스)가 앞에 붙은 경우는 건너뜀 */
  function findAfter(t, labelRe, opts = {}) {
    const re = new RegExp(labelRe.source, 'g');
    let m;
    while ((m = re.exec(t))) {
      if (opts.notAfter && opts.notAfter.test(t.slice(Math.max(0, m.index - 3), m.index))) continue;
      const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
      const n = tail.match(new RegExp('^[^\\d]{0,5}' + NUM));
      if (n) return toNum(n[1]);
    }
    return null;
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
      carb: findAfter(t, /탄수화[물불몰]?/),
      sugar: findAfter(t, /당류/),
      protein: findAfter(t, /단백[질잘]/),
      fat: findAfter(t, /지방/, { notAfter: /포화|트랜스|화|랜스/ }),
      fiber: findAfter(t, /식이섬유/)
    };
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
