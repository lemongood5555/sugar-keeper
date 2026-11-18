/* 1인분 영양성분
 * - src가 있는 항목: 식품의약품안전처 「전국통합식품영양성분정보(음식)표준데이터」의
 *   100g(또는 100ml)당 값 × 1회 분량(g). src = 식품코드, origin = 식품기원명
 *   우선순위: 가정식(분석) > 외식(분석) > 외식·급식(재료량 기반 산출) > 프랜차이즈
 * - 과일·채소 등: 식약처 식품영양성분DB(원재료성), 가공식품은 같은 대표식품 중앙값(origin/src 참고)
 * 필드: g(1인분 중량), kcal, carb(탄수화물), sugar(당류), protein, fat, fiber(식이섬유) — 단위 g
 */
const FOODS = [
  // 밥류
  { id: 'rice', name: '쌀밥', cat: '밥류', unit: '1공기', g: 210, kcal: 349, carb: 78.4, sugar: 0.0, protein: 7.1, fat: 0.7, fiber: 0.2, src: 'D301-022000000-0001', origin: '외식(분석함량)' },
  { id: 'brown_rice', name: '현미밥', cat: '밥류', unit: '1공기', g: 210, kcal: 361, carb: 81.7, sugar: 0.0, protein: 6.5, fat: 1.0, fiber: 4.2, src: 'D101-050000000-0001', origin: '가정식(분석 함량)' },
  { id: 'multigrain_rice', name: '잡곡밥', cat: '밥류', unit: '1공기', g: 210, kcal: 307, carb: 61.6, sugar: 0.7, protein: 11.1, fat: 1.8, fiber: 12.8, src: 'D101-032000000-0001', origin: '가정식(분석 함량)' },
  { id: 'gimbap', name: '김밥', cat: '밥류', unit: '1줄', g: 250, kcal: 350, carb: 50.0, sugar: 0.0, protein: 12.1, fat: 11.4, fiber: 3.5, src: 'D101-007000000-0001', origin: '가정식(분석 함량)' },
  { id: 'bibimbap', name: '비빔밥', cat: '밥류', unit: '1그릇', g: 400, kcal: 568, carb: 75.4, sugar: 0.2, protein: 27.4, fat: 17.3, fiber: 8.0, src: 'D101-018000000-0001', origin: '가정식(분석 함량)' },
  { id: 'fried_rice', name: '볶음밥', cat: '밥류', unit: '1접시', g: 350, kcal: 640, carb: 118.9, sugar: 0.0, protein: 19.5, fat: 9.7, fiber: 6.0, src: 'D101-017000000-0001', origin: '가정식(분석 함량)' },
  { id: 'curry_rice', name: '카레라이스', cat: '밥류', unit: '1접시', g: 450, kcal: 486, carb: 93.3, sugar: 0.7, protein: 14.0, fat: 6.3, fiber: 2.2, src: 'D101-044000000-0001', origin: '가정식(분석 함량)' },
  { id: 'wholewheat_bread', name: '통밀식빵', cat: '빵·곡류', unit: '2장', g: 70, kcal: 195, carb: 34.0, sugar: 3.1, protein: 6.5, fat: 3.7, fiber: 3.5, src: 'D302-100380000-0001', origin: '외식(분석함량)' },
  { id: 'white_bread', name: '식빵', cat: '빵·곡류', unit: '2장', g: 70, kcal: 185, carb: 35.6, sugar: 1.1, protein: 6.5, fat: 1.8, fiber: 2.4, src: 'D102-100000000-0001', origin: '가정식(분석 함량)' },

  // 국·찌개
  { id: 'doenjang', name: '된장찌개', cat: '국·찌개', unit: '1그릇', g: 250, kcal: 115, carb: 11.1, sugar: 0.0, protein: 8.4, fat: 4.1, fiber: 4.0, src: 'D106-275000000-0001', origin: '가정식(분석 함량)' },
  { id: 'kimchi_stew', name: '김치찌개', cat: '국·찌개', unit: '1그릇', g: 250, kcal: 152, carb: 7.5, sugar: 1.9, protein: 9.4, fat: 9.4, fiber: 5.2, src: 'D306-266000000-0001', origin: '외식(분석함량)' },
  { id: 'miyeokguk', name: '미역국', cat: '국·찌개', unit: '1그릇', g: 250, kcal: 30, carb: 2.2, sugar: 0.7, protein: 1.6, fat: 1.5, fiber: 1.0, src: 'D105-223000000-0001', origin: '가정식(분석 함량)' },
  { id: 'beef_radish', name: '소고기무국', cat: '국·찌개', unit: '1그릇', g: 250, kcal: 58, carb: 1.3, sugar: 0.4, protein: 4.0, fat: 3.7, fiber: 0.2, src: 'D605-300000000-0001', origin: '중고등학교급식(재료량 기반 산출함량)' },
  { id: 'sundubu', name: '순두부찌개', cat: '국·찌개', unit: '1그릇', g: 300, kcal: 105, carb: 6.5, sugar: 1.0, protein: 8.9, fat: 4.8, fiber: 3.0, src: 'D106-291030000-0001', origin: '가정식(분석 함량)' },
  { id: 'seolleongtang', name: '설렁탕(국물·고기)', cat: '국·찌개', unit: '1그릇', g: 600, kcal: 144, carb: 2.2, sugar: 0.0, protein: 25.6, fat: 3.5, fiber: 6.0, src: 'D105-231000000-0001', origin: '가정식(분석 함량)' },

  // 반찬
  { id: 'kimchi', name: '배추김치', cat: '반찬', unit: '1접시', g: 50, kcal: 19, carb: 3.2, sugar: 1.2, protein: 1.0, fat: 0.2, fiber: 1.2, src: 'D315-670000000-0001', origin: '외식(분석함량)' },
  { id: 'kkakdugi', name: '깍두기', cat: '반찬', unit: '1접시', g: 50, kcal: 16, carb: 2.1, sugar: 1.3, protein: 0.8, fat: 0.5, fiber: 1.1, src: 'D115-665000000-0001', origin: '가정식(분석 함량)' },
  { id: 'spinach', name: '시금치나물', cat: '반찬', unit: '1접시', g: 70, kcal: 48, carb: 2.4, sugar: 0.1, protein: 2.6, fat: 3.1, fiber: 1.4, src: 'D113-586000000-0001', origin: '가정식(분석 함량)' },
  { id: 'bean_sprout', name: '콩나물무침', cat: '반찬', unit: '1접시', g: 70, kcal: 48, carb: 2.2, sugar: 0.3, protein: 2.7, fat: 3.2, fiber: 1.2, src: 'D113-597000000-0001', origin: '가정식(분석 함량)' },
  { id: 'anchovy', name: '멸치볶음(물엿)', cat: '반찬', unit: '1접시', g: 30, kcal: 83, carb: 4.1, sugar: 3.5, protein: 11.8, fat: 2.1, fiber: 3.0, src: 'D110-472000000-0001', origin: '가정식(분석 함량)' },
  { id: 'bulgogi', name: '소불고기', cat: '반찬', unit: '1인분', g: 150, kcal: 255, carb: 6.4, sugar: 4.9, protein: 24.6, fat: 14.5, fiber: 5.2, src: 'D108-386000000-0001', origin: '가정식(분석 함량)' },
  { id: 'jeyuk', name: '제육볶음', cat: '반찬', unit: '1인분', g: 150, kcal: 226, carb: 8.6, sugar: 4.4, protein: 18.3, fat: 12.6, fiber: 1.2, src: 'D410-529000000-0001', origin: '외식(재료량 기반 산출함량)' },
  { id: 'mackerel', name: '고등어구이', cat: '반찬', unit: '1토막', g: 100, kcal: 142, carb: 2.7, sugar: 0.0, protein: 9.5, fat: 10.0, fiber: 0.0, src: 'D408-357000000-0001', origin: '외식(재료량 기반 산출함량)' },
  { id: 'egg_roll', name: '계란말이', cat: '반찬', unit: '1접시', g: 80, kcal: 154, carb: 1.2, sugar: 0.0, protein: 13.8, fat: 10.6, fiber: 1.0, src: 'D109-416000000-0001', origin: '가정식(분석 함량)' },
  { id: 'tofu_braise', name: '두부조림', cat: '반찬', unit: '1접시', g: 100, kcal: 143, carb: 4.4, sugar: 3.6, protein: 9.6, fat: 9.7, fiber: 0.8, src: 'D111-517000000-0001', origin: '가정식(분석 함량)' },
  { id: 'potato_braise', name: '감자조림', cat: '반찬', unit: '1접시', g: 80, kcal: 91, carb: 14.5, sugar: 6.1, protein: 1.9, fat: 2.8, fiber: 1.4, src: 'D111-508000000-0001', origin: '가정식(분석 함량)' },
  { id: 'lotus_braise', name: '연근조림', cat: '반찬', unit: '1접시', g: 60, kcal: 104, carb: 17.7, sugar: 1.7, protein: 1.6, fat: 3.1, fiber: 1.6, src: 'D111-528000000-0001', origin: '가정식(분석 함량)' },
  { id: 'japchae', name: '잡채', cat: '반찬', unit: '1접시', g: 150, kcal: 219, carb: 36.4, sugar: 1.1, protein: 7.1, fat: 4.9, fiber: 5.6, src: 'D110-492000000-0001', origin: '가정식(분석 함량)' },
  { id: 'chicken_breast', name: '닭가슴살구이', cat: '반찬', unit: '1인분', g: 100, kcal: 164, carb: 0.0, sugar: 0.0, protein: 35.5, fat: 1.5, fiber: 0.0, src: 'R209-008000551-0000', origin: '국가표준식품성분표(원재료성)' },

  // 면·일품
  { id: 'ramen', name: '라면', cat: '면·일품', unit: '1개', g: 550, kcal: 451, carb: 75.1, sugar: 0.0, protein: 9.5, fat: 12.5, fiber: 5.5, src: 'D103-148000000-0001', origin: '가정식(분석 함량)' },
  { id: 'jjajang', name: '짜장면', cat: '면·일품', unit: '1그릇', g: 650, kcal: 994, carb: 189.4, sugar: 18.8, protein: 34.4, fat: 16.7, fiber: 20.8, src: 'D403-197000000-0001', origin: '외식(재료량 기반 산출함량)' },
  { id: 'naengmyeon', name: '물냉면', cat: '면·일품', unit: '1그릇', g: 800, kcal: 768, carb: 145.8, sugar: 3.4, protein: 28.8, fat: 5.7, fiber: 6.4, src: 'D403-187000000-0001', origin: '외식(재료량 기반 산출함량)' },
  { id: 'tteokbokki', name: '떡볶이', cat: '면·일품', unit: '1인분', g: 300, kcal: 432, carb: 77.9, sugar: 13.2, protein: 10.5, fat: 8.9, fiber: 3.0, src: 'D110-467000000-0001', origin: '가정식(분석 함량)' },
  { id: 'kalguksu', name: '칼국수', cat: '면·일품', unit: '1그릇', g: 700, kcal: 539, carb: 104.3, sugar: 0.0, protein: 23.1, fat: 3.4, fiber: 11.2, src: 'D103-174000000-0001', origin: '가정식(분석 함량)' },

  // 간식
  { id: 'chocopie', name: '초코파이', cat: '간식', unit: '1개', g: 35, kcal: 154, carb: 22.5, sugar: 12.5, protein: 1.2, fat: 6.6, fiber: 0.5, src: '가공식품 중앙값 n=7', origin: '식약처 가공식품DB' },
  { id: 'garaetteok', name: '가래떡', cat: '간식', unit: '1줄', g: 100, kcal: 195, carb: 43.7, sugar: 0.0, protein: 3.9, fat: 0.5, fiber: 0.6, src: 'D102-053000000-0001', origin: '가정식(분석 함량)' },
  { id: 'honey_tteok', name: '꿀떡', cat: '간식', unit: '5개', g: 100, kcal: 228, carb: 49.5, sugar: 0.3, protein: 3.7, fat: 1.7, fiber: 0.8, src: 'D102-057000000-0001', origin: '가정식(분석 함량)' },
  { id: 'icecream', name: '아이스크림(바)', cat: '간식', unit: '1개', g: 75, kcal: 138, carb: 15.8, sugar: 12.5, protein: 2.2, fat: 7.0, fiber: 0, src: '가공식품 중앙값 n=291', origin: '식약처 가공식품DB' },
  { id: 'cookie', name: '쿠키', cat: '간식', unit: '2개', g: 30, kcal: 132, carb: 15.7, sugar: 3.5, protein: 2.1, fat: 6.7, fiber: 0.4, src: 'D302-131000000-0001', origin: '외식(분석함량)' },
  { id: 'redbean_bread', name: '단팥빵', cat: '간식', unit: '1개', g: 100, kcal: 280, carb: 50.5, sugar: 15.8, protein: 7.6, fat: 5.2, fiber: 1.5, src: '가공식품 중앙값 n=50', origin: '식약처 가공식품DB' },
  { id: 'sweet_potato', name: '찐고구마', cat: '간식', unit: '1개(중)', g: 150, kcal: 208, carb: 48.7, sugar: 24.5, protein: 2.5, fat: 0.4, fiber: 4.3, src: 'D107-128180000-0001', origin: '가정식(분석 함량)' },
  { id: 'potato', name: '찐감자', cat: '간식', unit: '1개(중)', g: 150, kcal: 105, carb: 22.5, sugar: 1.3, protein: 3.2, fat: 0.2, fiber: 2.5, src: 'D107-307170000-0001', origin: '가정식(분석 함량)' },
  { id: 'nuts', name: '견과류(볶은 아몬드)', cat: '간식', unit: '1봉', g: 25, kcal: 148, carb: 5.1, sugar: 1.0, protein: 5.9, fat: 12.8, fiber: 2.8, src: 'R105-020000058-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'boiled_egg', name: '삶은 달걀', cat: '간식', unit: '1개', g: 50, kcal: 75, carb: 0.3, sugar: 0.3, protein: 6.4, fat: 5.3, fiber: 0.0, src: 'D327-758010000-0001', origin: '외식(분석함량)' },
  { id: 'cherry_tomato', name: '방울토마토', cat: '간식', unit: '10개', g: 150, kcal: 38, carb: 9.0, sugar: 5.8, protein: 1.5, fat: 0.2, fiber: 3.1, src: 'R106-186010001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'cucumber', name: '오이 스틱', cat: '간식', unit: '1개', g: 100, kcal: 13, carb: 2.8, sugar: 1.5, protein: 1.1, fat: 0.0, fiber: 0.5, src: 'R106-148050001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'carrot', name: '당근 스틱', cat: '간식', unit: '1개', g: 100, kcal: 31, carb: 7.0, sugar: 6.2, protein: 1.0, fat: 0.1, fiber: 3.1, src: 'R106-041007601-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'cheese', name: '슬라이스치즈', cat: '유제품', unit: '1장', g: 20, kcal: 64, carb: 0.1, sugar: 0.1, protein: 4.6, fat: 5.2, fiber: 0, src: '가공식품 중앙값 n=23', origin: '식약처 가공식품DB' },
  { id: 'greek_yogurt', name: '그릭요거트(무가당)', cat: '유제품', unit: '1컵', g: 100, kcal: 124, carb: 6.5, sugar: 3.0, protein: 7.5, fat: 5.6, fiber: 0.3, src: '가공식품 중앙값 n=17', origin: '식약처 가공식품DB' },
  { id: 'sweet_yogurt', name: '떠먹는 요거트(가당)', cat: '유제품', unit: '1개', g: 150, kcal: 124, carb: 18.1, sugar: 13.5, protein: 5.0, fat: 4.2, fiber: 7.5, src: '가공식품 중앙값 n=73', origin: '식약처 가공식품DB' },
  { id: 'milk', name: '우유', cat: '유제품', unit: '1팩', g: 200, kcal: 130, carb: 9.3, sugar: 9.2, protein: 6.0, fat: 7.2, fiber: 0, src: '가공식품 중앙값 n=63', origin: '식약처 가공식품DB' },
  { id: 'lowfat_milk', name: '저지방우유', cat: '유제품', unit: '1팩', g: 200, kcal: 96, carb: 9.2, sugar: 9.2, protein: 6.0, fat: 4.0, fiber: 0.0, src: '가공식품 중앙값 n=11', origin: '식약처 가공식품DB' },

  // 과일
  { id: 'apple', name: '사과', cat: '과일', unit: '1/2개', g: 150, kcal: 86, carb: 21.2, sugar: 16.4, protein: 0.3, fat: 1.0, fiber: 3.0, src: 'R108-050000001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'banana', name: '바나나', cat: '과일', unit: '1개', g: 100, kcal: 77, carb: 20.0, sugar: 14.4, protein: 1.1, fat: 0.2, fiber: 2.2, src: 'R108-037000001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'tangerine', name: '귤', cat: '과일', unit: '2개', g: 150, kcal: 58, carb: 15.1, sugar: 12.0, protein: 0.8, fat: 0.1, fiber: 2.4, src: 'R108-010020001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'strawberry', name: '딸기', cat: '과일', unit: '10알', g: 150, kcal: 50, carb: 12.2, sugar: 9.2, protein: 1.1, fat: 0.2, fiber: 2.2, src: 'R108-019010001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'grape', name: '포도', cat: '과일', unit: '1/2송이', g: 100, kcal: 57, carb: 15.1, sugar: 11.9, protein: 0.5, fat: 0.1, fiber: 1.4, src: 'R108-098070001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'watermelon', name: '수박', cat: '과일', unit: '2쪽', g: 200, kcal: 62, carb: 15.7, sugar: 10.1, protein: 1.6, fat: 0.1, fiber: 0.4, src: 'R108-061030001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'pear', name: '배', cat: '과일', unit: '1/2개', g: 200, kcal: 90, carb: 24.5, sugar: 16.6, protein: 0.6, fat: 0.1, fiber: 2.2, src: 'R108-038000001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'blueberry', name: '블루베리', cat: '과일', unit: '1컵', g: 100, kcal: 48, carb: 12.6, sugar: 10.0, protein: 0.6, fat: 0.1, fiber: 3.0, src: 'R108-047000001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'kiwi', name: '키위', cat: '과일', unit: '1개', g: 100, kcal: 66, carb: 16.1, sugar: 6.7, protein: 0.9, fat: 0.6, fiber: 2.6, src: 'R108-090020001-0000', origin: '국가표준식품성분표(원재료성)' },
  { id: 'persimmon', name: '단감', cat: '과일', unit: '1개', g: 150, kcal: 86, carb: 22.7, sugar: 17.1, protein: 0.6, fat: 0.2, fiber: 2.9, src: 'R108-001010001-0000', origin: '국가표준식품성분표(원재료성)' },

  // 음료
  { id: 'cola', name: '콜라', cat: '음료', unit: '1캔', g: 250, kcal: 106, carb: 26.8, sugar: 25.1, protein: 0.0, fat: 0.0, fiber: 0, src: '가공식품 중앙값 n=8', origin: '식약처 가공식품DB' },
  { id: 'zero_cola', name: '제로콜라', cat: '음료', unit: '1캔', g: 250, kcal: 0, carb: 0.0, sugar: 0.0, protein: 0.0, fat: 0.0, fiber: 0, src: '가공식품 중앙값 n=3', origin: '식약처 가공식품DB' },
  { id: 'orange_juice', name: '오렌지주스', cat: '음료', unit: '1컵', g: 200, kcal: 94, carb: 20.8, sugar: 18.0, protein: 1.5, fat: 0.0, fiber: 0.8, src: '가공식품 중앙값 n=53', origin: '식약처 가공식품DB' },
  { id: 'mix_coffee', name: '믹스커피', cat: '음료', unit: '1잔(1봉+물)', g: 112, kcal: 57, carb: 11.3, sugar: 6.7, protein: 0.5, fat: 1.2, fiber: 0.1, src: 'D320-741142904-0001', origin: '외식(분석함량)' },
  { id: 'americano', name: '아메리카노', cat: '음료', unit: '1잔', g: 355, kcal: 11, carb: 1.2, sugar: 0.0, protein: 0.8, fat: 0.5, fiber: 0.0, src: 'D320-748080000-0002', origin: '외식(분석함량)' },
  { id: 'latte', name: '카페라떼', cat: '음료', unit: '1잔', g: 355, kcal: 135, carb: 12.7, sugar: 8.0, protein: 6.0, fat: 6.5, fiber: 0.0, src: 'D420-762000000-0001', origin: '외식(재료량 기반 산출함량)' },
  { id: 'vanilla_latte', name: '바닐라라떼', cat: '음료', unit: '1잔', g: 355, kcal: 156, carb: 19.6, sugar: 17.7, protein: 4.5, fat: 6.0, fiber: 0, src: 'D220-723050000-0002', origin: '외식(프랜차이즈 등 업체 제공 영양정보)' },
  { id: 'sikhye', name: '식혜', cat: '음료', unit: '1캔', g: 240, kcal: 209, carb: 38.9, sugar: 27.3, protein: 3.7, fat: 4.2, fiber: 0.7, src: 'D320-738000000-0001', origin: '외식(분석함량)' },
  { id: 'sweet_soymilk', name: '두유(가당)', cat: '음료', unit: '1팩', g: 190, kcal: 112, carb: 13.8, sugar: 10.0, protein: 4.8, fat: 4.0, fiber: 1.3, src: '가공식품 중앙값 n=86', origin: '식약처 가공식품DB' },
  { id: 'unsweet_soymilk', name: '두유(무가당)', cat: '음료', unit: '1팩', g: 190, kcal: 70, carb: 4.7, sugar: 0.8, protein: 6.1, fat: 3.3, fiber: 3.4, src: '가공식품 중앙값 n=10', origin: '식약처 가공식품DB' },
  { id: 'barley_tea', name: '보리차·탄산수', cat: '음료', unit: '1컵', g: 200, kcal: 2, carb: 0.4, sugar: 0.0, protein: 0.0, fat: 0.0, fiber: 0, src: '가공식품 중앙값 n=7', origin: '식약처 가공식품DB' }
];

/* 당이 많은 음식 → 대체 추천 (id 목록) */
const ALTERNATIVES = {
  chocopie: ['nuts', 'boiled_egg', 'greek_yogurt'],
  honey_tteok: ['nuts', 'cherry_tomato', 'boiled_egg'],
  icecream: ['greek_yogurt', 'strawberry'],
  cookie: ['nuts', 'cheese'],
  redbean_bread: ['wholewheat_bread', 'boiled_egg'],
  sweet_potato: ['potato', 'cucumber'],
  sweet_yogurt: ['greek_yogurt'],
  milk: ['unsweet_soymilk'],
  lowfat_milk: ['unsweet_soymilk'],
  cola: ['zero_cola', 'barley_tea'],
  orange_juice: ['tangerine', 'barley_tea'],
  mix_coffee: ['americano'],
  latte: ['americano'],
  vanilla_latte: ['americano', 'latte'],
  sikhye: ['barley_tea'],
  sweet_soymilk: ['unsweet_soymilk'],
  apple: ['strawberry', 'cherry_tomato'],
  banana: ['strawberry', 'kiwi'],
  grape: ['strawberry', 'blueberry'],
  persimmon: ['strawberry', 'cherry_tomato'],
  pear: ['strawberry', 'cherry_tomato'],
  watermelon: ['strawberry', 'cucumber'],
  tangerine: ['strawberry', 'cherry_tomato'],
  blueberry: ['strawberry'],
  anchovy: ['mackerel', 'egg_roll'],
  bulgogi: ['chicken_breast', 'mackerel'],
  jeyuk: ['chicken_breast', 'mackerel'],
  potato_braise: ['spinach', 'bean_sprout'],
  lotus_braise: ['spinach', 'bean_sprout'],
  japchae: ['spinach', 'bean_sprout'],
  tteokbokki: ['sundubu', 'multigrain_rice'],
  jjajang: ['multigrain_rice', 'doenjang', 'chicken_breast'],
  naengmyeon: ['kalguksu', 'bibimbap'],
  curry_rice: ['multigrain_rice', 'doenjang'],
  gimbap: ['multigrain_rice', 'egg_roll']
};

/* 탄수화물(전분)이 많은 음식 → 대체·보완 추천
 * 당류가 0g이어도 밥·면·떡·빵은 소화되면 포도당이 되어 혈당을 올립니다 */
const CARB_ALT = {
  rice: ['multigrain_rice', 'brown_rice'],
  white_bread: ['wholewheat_bread'],
  fried_rice: ['multigrain_rice', 'egg_roll', 'spinach'],
  gimbap: ['multigrain_rice', 'egg_roll'],
  bibimbap: ['multigrain_rice', 'spinach', 'bean_sprout'],
  curry_rice: ['multigrain_rice', 'doenjang'],
  ramen: ['multigrain_rice', 'sundubu', 'boiled_egg'],
  jjajang: ['multigrain_rice', 'doenjang', 'mackerel'],
  naengmyeon: ['multigrain_rice', 'boiled_egg', 'bean_sprout'],
  kalguksu: ['multigrain_rice', 'boiled_egg', 'bean_sprout'],
  tteokbokki: ['boiled_egg', 'nuts', 'sundubu'],
  garaetteok: ['boiled_egg', 'nuts', 'greek_yogurt'],
  honey_tteok: ['boiled_egg', 'nuts'],
  sweet_potato: ['boiled_egg', 'cucumber'],
  potato: ['boiled_egg', 'cucumber'],
  redbean_bread: ['boiled_egg', 'wholewheat_bread']
};

/* 혈당지수(GI) 구분 — 참고값
 * 낮음 ≤55, 중간 56~69, 높음 ≥70. 시드니대학 GI 데이터베이스 등 문헌의 대표값을 구분만 옮긴 것으로,
 * 품종·조리·함께 먹는 음식에 따라 달라집니다. 목록에 없는 음식은 구분을 표시하지 않습니다.
 * 탄수화물이 거의 없는 음식(고기·생선·달걀·나물)은 '낮음(탄수화물 거의 없음)'으로 둡니다. */
const GI = {
  rice: 'high', brown_rice: 'mid', multigrain_rice: 'mid', gimbap: 'high', fried_rice: 'high',
  white_bread: 'high', ramen: 'high', kalguksu: 'mid',
  garaetteok: 'high', honey_tteok: 'high', tteokbokki: 'high',
  sweet_potato: 'mid', potato: 'high',
  apple: 'low', pear: 'low', strawberry: 'low', blueberry: 'low', tangerine: 'low', grape: 'low', kiwi: 'low',
  banana: 'mid', watermelon: 'high', orange_juice: 'mid', cola: 'mid',
  milk: 'low', lowfat_milk: 'low', greek_yogurt: 'low', cheese: 'low', unsweet_soymilk: 'low', nuts: 'low',
  boiled_egg: 'low', egg_roll: 'low', mackerel: 'low', chicken_breast: 'low', bulgogi: 'low', jeyuk: 'low',
  spinach: 'low', bean_sprout: 'low', kimchi: 'low', kkakdugi: 'low', cucumber: 'low', carrot: 'low', cherry_tomato: 'low',
  tofu_braise: 'low', miyeokguk: 'low', doenjang: 'low', americano: 'low', zero_cola: 'low'
};
const GI_LABEL = { low: '낮음', mid: '중간', high: '높음' };

/* 끼니별 예시 식단 템플릿 — 첫 번째 항목(주식)의 양을 조절해 목표 열량에 맞춤 */
const MEAL_TEMPLATES = {
  breakfast: [
    ['multigrain_rice', 'miyeokguk', 'egg_roll', 'spinach', 'kimchi'],
    ['wholewheat_bread', 'boiled_egg', 'greek_yogurt', 'cherry_tomato'],
    ['brown_rice', 'beef_radish', 'tofu_braise', 'kimchi']
  ],
  lunch: [
    ['multigrain_rice', 'doenjang', 'mackerel', 'bean_sprout', 'kimchi'],
    ['brown_rice', 'beef_radish', 'egg_roll', 'spinach', 'kkakdugi'],
    ['multigrain_rice', 'seolleongtang', 'kimchi', 'bean_sprout']
  ],
  dinner: [
    ['brown_rice', 'sundubu', 'spinach', 'bean_sprout', 'kimchi'],
    ['multigrain_rice', 'kimchi_stew', 'tofu_braise', 'spinach'],
    ['brown_rice', 'miyeokguk', 'mackerel', 'spinach', 'kimchi']
  ],
  snack: [
    ['nuts', 'cherry_tomato'],
    ['greek_yogurt', 'strawberry'],
    ['unsweet_soymilk', 'boiled_egg'],
    ['boiled_egg', 'cucumber']
  ]
};
