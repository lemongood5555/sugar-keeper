/* 영양판정 및 목표 설정 로직
 * - 에너지필요추정량(EER): 2020 한국인 영양소 섭취기준 성인(19세 이상) 공식
 * - 당류 기준: KDRI 총당류 20% 이내·첨가당 10% 이내 → 앱은 총당류 10%를 권장(초록), 20%를 공식 상한(빨강)으로 두 단계로 표시
 * - 임상 기준: 대한당뇨병학회 진료지침, 대한비만학회(BMI 23/25, 허리둘레 90/85cm)
 */
const PA_COEF = {
  M: { 1: 1.0, 2: 1.11, 3: 1.25, 4: 1.48 },
  F: { 1: 1.0, 2: 1.12, 3: 1.27, 4: 1.45 }
};

const PA_LABEL = {
  1: '비활동적 (거의 앉아서 생활)',
  2: '저활동적 (가벼운 걷기·집안일)',
  3: '활동적 (주 3~5회 운동 또는 서서 일함)',
  4: '매우 활동적 (매일 고강도 운동·육체노동)'
};

const JOB_PA = { office: 1, service: 2, labor: 3, retired: 1, heavy: 4 };

const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.30, dinner: 0.30, snack: 0.15 };
const MEAL_NAME = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };

const NUTRI = {
  bmi(p) { const h = p.height / 100; return p.weight / (h * h); },

  ibw(p) { const h = p.height / 100; return h * h * (p.sex === 'M' ? 22 : 21); },

  eer(p) {
    const h = p.height / 100;
    const pa = PA_COEF[p.sex][p.pa];
    if (p.sex === 'M') return 662 - 9.53 * p.age + pa * (15.91 * p.weight + 539.6 * h);
    return 354 - 6.91 * p.age + pa * (9.36 * p.weight + 726 * h);
  },

  hasCond(p, c) { return (p.conditions || []).includes(c); },

  /* 제지방량: 체지방률이 있으면 체중 × (1 − 체지방률) */
  lbm(p) { return p.bodyFat > 0 && p.bodyFat < 70 ? p.weight * (1 - p.bodyFat / 100) : null; },

  /* 목표 체중·기간 → 하루 열량 조정 (지방 1kg ≈ 7,700kcal)
   * 안전 범위: 감량 하루 −250~−1,000kcal(주 0.25~1kg), 증량 +200~+500kcal(근육은 주 0.25~0.5kg 정도가 현실적) */
  weightPlan(p, eer) {
    if (p.goal === 'maintain' || !(p.targetWeight > 0) || !(p.targetWeeks > 0)) return null;
    const delta = p.targetWeight - p.weight;
    if ((p.goal === 'diet' && delta >= 0) || (p.goal === 'muscle' && delta <= 0)) return { mismatch: true, delta };
    const raw = delta * 7700 / (p.targetWeeks * 7);
    const lo = p.goal === 'diet' ? -1000 : 200, hi = p.goal === 'diet' ? -250 : 500;
    const adj = Math.max(lo, Math.min(hi, raw));
    const rate = delta / p.targetWeeks;
    const weeksNeeded = Math.ceil(Math.abs(delta) * 7700 / (Math.abs(adj) * 7));
    return { delta, rate, raw: Math.round(raw), adj: Math.round(adj), clamped: Math.round(raw) !== Math.round(adj), fast: raw < lo || raw > hi, weeksNeeded };
  },

  targets(p) {
    const eer = this.eer(p);
    const bmi = this.bmi(p);
    const plan = this.weightPlan(p, eer);
    let kcal = eer;
    if (plan && !plan.mismatch) kcal = eer + plan.adj;
    else if (p.goal === 'diet') kcal = eer - 500;
    else if (p.goal === 'muscle') kcal = eer + 300;
    if (p.goal === 'diet') kcal = Math.max(kcal, p.sex === 'M' ? 1500 : 1200);
    kcal = Math.round(kcal / 50) * 50;

    // 단백질(체중 기준): 유지 0.91(KDRI), 감량 1.2, 근육 증가 1.6 g/kg(ISSN 1.4~2.0 범위의 중간). 비만이면 표준체중 기준
    // 당뇨: 1.3 g/kg 이하(KDIGO·당뇨병성 신증 진행 우려), 신장질환: 0.8 g/kg(대한당뇨병학회)
    const refWt = bmi >= 25 ? this.ibw(p) : p.weight;
    let protPerKg = { diet: 1.2, maintain: 0.91, muscle: 1.6 }[p.goal] || 0.91;
    const kidney = this.hasCond(p, 'kidney');
    const dm = this.hasCond(p, 'diabetes');
    const protCapped = !kidney && dm && protPerKg > 1.3;
    if (protCapped) protPerKg = 1.3;
    if (kidney) protPerKg = 0.8;
    const lbm = this.lbm(p);
    let protein = protPerKg * refWt, protBasis = `${protPerKg}g × ${Math.round(refWt * 10) / 10}kg`;
    protein = Math.round(protein);

    const fat = Math.round((kcal * 0.25) / 9);
    const carb = Math.round((kcal - protein * 4 - fat * 9) / 4);

    // 모든 사용자 10%: KDRI 총당류 상한(20%)은 '넘지 말 것'이지 목표가 아니며, 첨가당 상한 10%를 고려해 보수적으로 적용
    const sugarPct = 0.10;
    const sugar = Math.round((kcal * sugarPct) / 4);
    const sugarMax = Math.round((kcal * 0.20) / 4); // KDRI 2025 총당류 20% 이내(공식 상한)

    const fiber = p.sex === 'M' ? (p.age >= 65 ? 25 : 30) : 20;

    const meals = {};
    for (const m in MEAL_SPLIT) meals[m] = Math.round(kcal * MEAL_SPLIT[m]);

    return { eer: Math.round(eer), kcal, protein, protPerKg, protBasis, protCapped, refWt, lbm, plan, fat, carb, sugar, sugarMax, sugarPct, fiber, meals, kidney };
  },

  /* 영양판정 (ABCD 중 A·B·C 일부) */
  assess(p) {
    const out = [];
    const bmi = this.bmi(p);
    let bmiCls = '정상', lv = 'ok';
    if (bmi < 18.5) { bmiCls = '저체중'; lv = 'warn'; }
    else if (bmi < 23) { bmiCls = '정상'; }
    else if (bmi < 25) { bmiCls = '비만 전단계(과체중)'; lv = 'warn'; }
    else if (bmi < 30) { bmiCls = '1단계 비만'; lv = 'bad'; }
    else if (bmi < 35) { bmiCls = '2단계 비만'; lv = 'bad'; }
    else { bmiCls = '3단계 비만'; lv = 'bad'; }
    out.push({ grp: '신체계측', name: 'BMI', val: bmi.toFixed(1) + ' kg/m²', note: bmiCls, lv });

    const ibw = this.ibw(p);
    const pibw = (p.weight / ibw) * 100;
    out.push({ grp: '신체계측', name: '표준체중 대비', val: pibw.toFixed(0) + '%', note: `표준체중 ${ibw.toFixed(1)}kg`, lv: pibw > 120 ? 'bad' : pibw > 110 || pibw < 90 ? 'warn' : 'ok' });

    if (p.waist) {
      const cut = p.sex === 'M' ? 90 : 85;
      out.push({ grp: '신체계측', name: '허리둘레', val: p.waist + ' cm', note: p.waist >= cut ? `복부비만 (기준 ${cut}cm 이상)` : '정상', lv: p.waist >= cut ? 'bad' : 'ok' });
    }

    if (p.bodyFat) {
      const hi = p.sex === 'M' ? 25 : 30, mid = p.sex === 'M' ? 20 : 28;
      const lv = p.bodyFat >= hi ? 'bad' : p.bodyFat >= mid ? 'warn' : 'ok';
      let note = lv === 'bad' ? `체지방 과다 (흔히 쓰는 기준 ${hi}% 이상)` : lv === 'warn' ? '경계' : '정상 범위';
      if (lv === 'bad' && bmi < 23) note += ' · BMI는 정상이라 "마른 비만"일 수 있어요';
      if (lv === 'ok' && bmi >= 25) note += ' · BMI가 높은 건 근육량 때문일 수 있어요';
      out.push({ grp: '신체계측', name: '체지방률', val: p.bodyFat + '%', note, lv });
      const lbm = this.lbm(p);
      out.push({ grp: '신체계측', name: '제지방량', val: lbm.toFixed(1) + ' kg', note: `체지방량 ${(p.weight - lbm).toFixed(1)}kg`, lv: 'info' });
    }
    if (p.smm) {
      const r = p.smm / p.weight * 100;
      out.push({ grp: '신체계측', name: '골격근량', val: p.smm + ' kg', note: `체중의 ${r.toFixed(0)}% · 표준 범위는 인바디 결과지를 참고하세요`, lv: 'info' });
    }

    const lab = (name, v, unit, fn) => { if (v || v === 0) { const [note, lv] = fn(v); out.push({ grp: '생화학적', name, val: v + ' ' + unit, note, lv }); } };
    const dm = this.hasCond(p, 'diabetes');
    lab('공복혈당', p.fbs, 'mg/dL', v => dm
      ? (v >= 80 && v <= 130 ? ['당뇨 조절 목표(80~130) 범위', 'ok'] : ['조절 목표(80~130) 벗어남', 'bad'])
      : (v < 100 ? ['정상', 'ok'] : v < 126 ? ['공복혈당장애', 'warn'] : ['당뇨병 범위', 'bad']));
    lab('식후 2시간 혈당', p.ppg, 'mg/dL', v => dm
      ? (v < 180 ? ['조절 목표(<180) 범위', 'ok'] : ['조절 목표(<180) 초과', 'bad'])
      : (v < 140 ? ['정상', 'ok'] : v < 200 ? ['내당능장애', 'warn'] : ['당뇨병 범위', 'bad']));
    lab('당화혈색소', p.hba1c, '%', v => dm
      ? (v < 6.5 ? ['조절 목표(<6.5%) 달성', 'ok'] : v < 7 ? ['목표 근접(개인 목표 7% 미만 가능)', 'warn'] : ['조절 필요', 'bad'])
      : (v < 5.7 ? ['정상', 'ok'] : v < 6.5 ? ['당뇨병 전단계', 'warn'] : ['당뇨병 범위', 'bad']));
    lab('총콜레스테롤', p.tc, 'mg/dL', v => v < 200 ? ['정상', 'ok'] : v < 240 ? ['경계', 'warn'] : ['높음', 'bad']);
    lab('중성지방', p.tg, 'mg/dL', v => v < 150 ? ['정상', 'ok'] : v < 200 ? ['경계', 'warn'] : ['높음', 'bad']);
    lab('LDL 콜레스테롤', p.ldl, 'mg/dL', v => dm
      ? (v < 100 ? ['당뇨 목표(<100) 달성', 'ok'] : ['당뇨 목표(<100) 초과', 'bad'])
      : (v < 130 ? ['정상', 'ok'] : v < 160 ? ['경계', 'warn'] : ['높음', 'bad']));
    lab('HDL 콜레스테롤', p.hdl, 'mg/dL', v => {
      const cut = p.sex === 'M' ? 40 : 50; return v >= cut ? ['정상', 'ok'] : [`낮음 (기준 ${cut} 이상)`, 'bad'];
    });
    if (p.sbp && p.dbp) {
      const ok = dm ? (p.sbp < 140 && p.dbp < 85) : (p.sbp < 130 && p.dbp < 85);
      out.push({ grp: '임상', name: '혈압', val: `${p.sbp}/${p.dbp} mmHg`, note: ok ? '목표 범위' : (dm ? '당뇨 혈압 목표(<140/85) 초과' : '높음'), lv: ok ? 'ok' : 'bad' });
    }
    return out;
  },

  /* 하루 당류 점수 (5점 만점) */
  sugarScore(total, limit, max) {
    const r = total / limit, rmax = (max || limit * 2) / limit;
    if (r <= 0.5) return { score: 5, msg: '아주 잘 지키셨어요! 권장량의 절반 이하입니다.' };
    if (r <= 0.75) return { score: 4, msg: '양호합니다. 지금처럼 유지해 주세요.' };
    if (r <= 1.0) return { score: 3, msg: '권장량 안이지만 여유가 거의 없어요. 간식·음료를 점검해 보세요.' };
    if (r <= rmax) return { score: 2, msg: '앱 권장(열량의 10%)은 넘었지만 공식 상한(총당류 20%) 안이에요. 아래 대체 식품을 참고해 주세요.' };
    return { score: 1, msg: '공식 상한(총당류 20%)도 넘었어요. 단 음료·간식부터 줄여 보세요.' };
  },

  /* 하루 탄수화물 점수 (5점 만점) — 전분 포함 총 탄수화물이 목표를 넘을수록 감점 */
  carbScore(total, target) {
    const r = total / target;
    if (r <= 1.0) return { score: 5, msg: '탄수화물이 목표 안에 있어요.' };
    if (r <= 1.1) return { score: 4, msg: '탄수화물이 조금 많아요. 밥·면 양을 약간 줄여 보세요.' };
    if (r <= 1.2) return { score: 3, msg: '탄수화물이 목표를 넘었어요. 밥·면·떡·빵 양을 점검해 보세요.' };
    if (r <= 1.35) return { score: 2, msg: '탄수화물이 많아요. 다음 끼니에서 밥·면을 줄이고 채소·단백질을 늘려 보세요.' };
    return { score: 1, msg: '탄수화물 섭취가 많습니다. 혈당이 크게 오를 수 있어요.' };
  },

  /* 당류·탄수화물 종합 (둘 중 나쁜 쪽에 가깝게: 평균을 내림) */
  glycemicScore(sugarSc, carbSc) { return Math.floor((sugarSc + carbSc) / 2); },

  /* 한 항목당 허용 당류 (하루 기준의 20%) → 권장 섭취 비율 */
  recommendRatio(sugarPerServing, dailyLimit) {
    if (sugarPerServing <= 0) return 1;
    const cap = dailyLimit * 0.2;
    const r = Math.floor((cap / sugarPerServing) * 4) / 4;
    return Math.max(0.25, Math.min(1, r));
  }
};
