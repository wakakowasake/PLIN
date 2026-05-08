// 국제공항 데이터
const airportEntries = [
    ['ICN', '인천국제공항', '서울', 'KR', 'Asia/Seoul'],
    ['GMP', '김포국제공항', '서울', 'KR', 'Asia/Seoul'],
    ['PUS', '김해국제공항', '부산', 'KR', 'Asia/Seoul'],
    ['CJU', '제주국제공항', '제주', 'KR', 'Asia/Seoul'],
    ['NRT', '나리타국제공항', '도쿄', 'JP', 'Asia/Tokyo'],
    ['HND', '하네다공항', '도쿄', 'JP', 'Asia/Tokyo'],
    ['KIX', '간사이국제공항', '오사카', 'JP', 'Asia/Tokyo'],
    ['NGO', '주부국제공항', '나고야', 'JP', 'Asia/Tokyo'],
    ['FUK', '후쿠오카공항', '후쿠오카', 'JP', 'Asia/Tokyo'],
    ['CTS', '신치토세공항', '삿포로', 'JP', 'Asia/Tokyo'],
    ['OKA', '나하공항', '오키나와', 'JP', 'Asia/Tokyo'],
    ['SDJ', '센다이공항', '센다이', 'JP', 'Asia/Tokyo'],
    ['HIJ', '히로시마공항', '히로시마', 'JP', 'Asia/Tokyo'],
    ['PEK', '베이징 서우두 국제공항', '베이징', 'CN', 'Asia/Shanghai'],
    ['PKX', '베이징 다싱 국제공항', '베이징', 'CN', 'Asia/Shanghai'],
    ['PVG', '상하이 푸둥 국제공항', '상하이', 'CN', 'Asia/Shanghai'],
    ['SHA', '상하이 훙차오 국제공항', '상하이', 'CN', 'Asia/Shanghai'],
    ['CAN', '광저우 바이윈 국제공항', '광저우', 'CN', 'Asia/Shanghai'],
    ['SZX', '선전 바오안 국제공항', '선전', 'CN', 'Asia/Shanghai'],
    ['CTU', '청두 솽류 국제공항', '청두', 'CN', 'Asia/Shanghai'],
    ['TFU', '청두 톈푸 국제공항', '청두', 'CN', 'Asia/Shanghai'],
    ['XIY', '시안 셴양 국제공항', '시안', 'CN', 'Asia/Shanghai'],
    ['XMN', '샤먼 가오치 국제공항', '샤먼', 'CN', 'Asia/Shanghai'],
    ['TAO', '칭다오 자오둥 국제공항', '칭다오', 'CN', 'Asia/Shanghai'],
    ['KMG', '쿤밍 창수이 국제공항', '쿤밍', 'CN', 'Asia/Shanghai'],
    ['HGH', '항저우 샤오산 국제공항', '항저우', 'CN', 'Asia/Shanghai'],
    ['BKK', '수완나품 국제공항', '방콕', 'TH', 'Asia/Bangkok'],
    ['DMK', '돈므앙 국제공항', '방콕', 'TH', 'Asia/Bangkok'],
    ['CNX', '치앙마이 국제공항', '치앙마이', 'TH', 'Asia/Bangkok'],
    ['HKT', '푸켓 국제공항', '푸켓', 'TH', 'Asia/Bangkok'],
    ['KBV', '끄라비 공항', '끄라비', 'TH', 'Asia/Bangkok'],
    ['SIN', '싱가포르 창이 국제공항', '싱가포르', 'SG', 'Asia/Singapore'],
    ['HKG', '홍콩 국제공항', '홍콩', 'HK', 'Asia/Hong_Kong'],
    ['TPE', '타오위안 국제공항', '타이베이', 'TW', 'Asia/Taipei'],
    ['TSA', '타이베이 쑹산공항', '타이베이', 'TW', 'Asia/Taipei'],
    ['KHH', '가오슝 국제공항', '가오슝', 'TW', 'Asia/Taipei'],
    ['MFM', '마카오 국제공항', '마카오', 'MO', 'Asia/Macau'],
    ['HAN', '노이바이 국제공항', '하노이', 'VN', 'Asia/Ho_Chi_Minh'],
    ['SGN', '탄손누트 국제공항', '호찌민시', 'VN', 'Asia/Ho_Chi_Minh'],
    ['DAD', '다낭 국제공항', '다낭', 'VN', 'Asia/Ho_Chi_Minh'],
    ['CXR', '깜라인 국제공항', '냐짱', 'VN', 'Asia/Ho_Chi_Minh'],
    ['PQC', '푸꾸옥 국제공항', '푸꾸옥', 'VN', 'Asia/Ho_Chi_Minh'],
    ['KUL', '쿠알라룸푸르 국제공항', '쿠알라룸푸르', 'MY', 'Asia/Kuala_Lumpur'],
    ['PEN', '페낭 국제공항', '페낭', 'MY', 'Asia/Kuala_Lumpur'],
    ['BKI', '코타키나발루 국제공항', '코타키나발루', 'MY', 'Asia/Kuala_Lumpur'],
    ['JHB', '세나이 국제공항', '조호르바루', 'MY', 'Asia/Kuala_Lumpur'],
    ['MNL', '니노이 아키노 국제공항', '마닐라', 'PH', 'Asia/Manila'],
    ['CEB', '막탄 세부 국제공항', '세부', 'PH', 'Asia/Manila'],
    ['CRK', '클라크 국제공항', '앙헬레스', 'PH', 'Asia/Manila'],
    ['CGK', '수카르노하타 국제공항', '자카르타', 'ID', 'Asia/Jakarta'],
    ['DPS', '응우라라이 국제공항', '발리', 'ID', 'Asia/Makassar'],
    ['SUB', '주안다 국제공항', '수라바야', 'ID', 'Asia/Jakarta'],
    ['YIA', '욕야카르타 국제공항', '욕야카르타', 'ID', 'Asia/Jakarta'],
    ['PNH', '프놈펜 국제공항', '프놈펜', 'KH', 'Asia/Phnom_Penh'],
    ['SAI', '씨엠립 앙코르 국제공항', '씨엠립', 'KH', 'Asia/Phnom_Penh'],
    ['VTE', '와타이 국제공항', '비엔티안', 'LA', 'Asia/Vientiane'],
    ['LPQ', '루앙프라방 국제공항', '루앙프라방', 'LA', 'Asia/Vientiane'],
    ['RGN', '양곤 국제공항', '양곤', 'MM', 'Asia/Yangon'],
    ['BWN', '브루나이 국제공항', '반다르스리브가완', 'BN', 'Asia/Brunei'],
    ['DEL', '인디라 간디 국제공항', '델리', 'IN', 'Asia/Kolkata'],
    ['BOM', '차트라파티 시바지 마하라지 국제공항', '뭄바이', 'IN', 'Asia/Kolkata'],
    ['BLR', '켐페고우다 국제공항', '벵갈루루', 'IN', 'Asia/Kolkata'],
    ['MAA', '첸나이 국제공항', '첸나이', 'IN', 'Asia/Kolkata'],
    ['HYD', '라지브 간디 국제공항', '하이데라바드', 'IN', 'Asia/Kolkata'],
    ['CCU', '네타지 수바스 찬드라 보스 국제공항', '콜카타', 'IN', 'Asia/Kolkata'],
    ['CMB', '반다라나이케 국제공항', '콜롬보', 'LK', 'Asia/Colombo'],
    ['KTM', '트리부반 국제공항', '카트만두', 'NP', 'Asia/Kathmandu'],
    ['DAC', '샤잘랄 국제공항', '다카', 'BD', 'Asia/Dhaka'],
    ['MLE', '벨라나 국제공항', '말레', 'MV', 'Indian/Maldives'],
    ['UBN', '칭기즈 칸 국제공항', '울란바토르', 'MN', 'Asia/Ulaanbaatar'],
    ['SYD', '시드니 킹스포드 스미스 국제공항', '시드니', 'AU', 'Australia/Sydney'],
    ['MEL', '멜버른 공항', '멜버른', 'AU', 'Australia/Melbourne'],
    ['BNE', '브리즈번 공항', '브리즈번', 'AU', 'Australia/Brisbane'],
    ['PER', '퍼스 공항', '퍼스', 'AU', 'Australia/Perth'],
    ['CNS', '케언스 공항', '케언스', 'AU', 'Australia/Brisbane'],
    ['AKL', '오클랜드 공항', '오클랜드', 'NZ', 'Pacific/Auckland'],
    ['CHC', '크라이스트처치 국제공항', '크라이스트처치', 'NZ', 'Pacific/Auckland'],
    ['ZQN', '퀸스타운 공항', '퀸스타운', 'NZ', 'Pacific/Auckland'],
    ['GUM', '안토니오 B. 원 팻 국제공항', '괌', 'GU', 'Pacific/Guam'],
    ['SPN', '사이판 국제공항', '사이판', 'MP', 'Pacific/Saipan'],
    ['DXB', '두바이 국제공항', '두바이', 'AE', 'Asia/Dubai'],
    ['AUH', '자이드 국제공항', '아부다비', 'AE', 'Asia/Dubai'],
    ['DOH', '하마드 국제공항', '도하', 'QA', 'Asia/Qatar'],
    ['JED', '킹 압둘아지즈 국제공항', '제다', 'SA', 'Asia/Riyadh'],
    ['RUH', '킹 칼리드 국제공항', '리야드', 'SA', 'Asia/Riyadh'],
    ['IST', '이스탄불 공항', '이스탄불', 'TR', 'Europe/Istanbul'],
    ['SAW', '사비하 괵첸 국제공항', '이스탄불', 'TR', 'Europe/Istanbul'],
    ['CAI', '카이로 국제공항', '카이로', 'EG', 'Africa/Cairo'],
    ['JNB', 'OR 탐보 국제공항', '요하네스버그', 'ZA', 'Africa/Johannesburg'],
    ['CPT', '케이프타운 국제공항', '케이프타운', 'ZA', 'Africa/Johannesburg'],
    ['ADD', '볼레 국제공항', '아디스아바바', 'ET', 'Africa/Addis_Ababa'],
    ['NBO', '조모 케냐타 국제공항', '나이로비', 'KE', 'Africa/Nairobi'],
    ['CMN', '모하메드 V 국제공항', '카사블랑카', 'MA', 'Africa/Casablanca'],
    ['LHR', '런던 히드로 공항', '런던', 'GB', 'Europe/London'],
    ['LGW', '런던 개트윅 공항', '런던', 'GB', 'Europe/London'],
    ['MAN', '맨체스터 공항', '맨체스터', 'GB', 'Europe/London'],
    ['CDG', '샤를 드 골 공항', '파리', 'FR', 'Europe/Paris'],
    ['ORY', '파리 오를리 공항', '파리', 'FR', 'Europe/Paris'],
    ['NCE', '니스 코트다쥐르 공항', '니스', 'FR', 'Europe/Paris'],
    ['FRA', '프랑크푸르트 국제공항', '프랑크푸르트', 'DE', 'Europe/Berlin'],
    ['MUC', '뮌헨 국제공항', '뮌헨', 'DE', 'Europe/Berlin'],
    ['AMS', '암스테르담 스키폴 공항', '암스테르담', 'NL', 'Europe/Amsterdam'],
    ['BRU', '브뤼셀 공항', '브뤼셀', 'BE', 'Europe/Brussels'],
    ['ZRH', '취리히 공항', '취리히', 'CH', 'Europe/Zurich'],
    ['GVA', '제네바 공항', '제네바', 'CH', 'Europe/Zurich'],
    ['VIE', '빈 국제공항', '빈', 'AT', 'Europe/Vienna'],
    ['PRG', '바츨라프 하벨 프라하 공항', '프라하', 'CZ', 'Europe/Prague'],
    ['BUD', '부다페스트 리스트 페렌츠 국제공항', '부다페스트', 'HU', 'Europe/Budapest'],
    ['WAW', '바르샤바 쇼팽 공항', '바르샤바', 'PL', 'Europe/Warsaw'],
    ['LIS', '움베르투 델가두 공항', '리스본', 'PT', 'Europe/Lisbon'],
    ['OPO', '프란시스쿠 사 카르네이루 공항', '포르투', 'PT', 'Europe/Lisbon'],
    ['MAD', '아돌포 수아레스 마드리드 바라하스 공항', '마드리드', 'ES', 'Europe/Madrid'],
    ['BCN', '바르셀로나 엘프라트 공항', '바르셀로나', 'ES', 'Europe/Madrid'],
    ['PMI', '팔마 데 마요르카 공항', '팔마', 'ES', 'Europe/Madrid'],
    ['FCO', '레오나르도 다 빈치 국제공항', '로마', 'IT', 'Europe/Rome'],
    ['MXP', '밀라노 말펜사 공항', '밀라노', 'IT', 'Europe/Rome'],
    ['VCE', '베네치아 마르코 폴로 공항', '베네치아', 'IT', 'Europe/Rome'],
    ['ATH', '아테네 국제공항', '아테네', 'GR', 'Europe/Athens'],
    ['DUB', '더블린 공항', '더블린', 'IE', 'Europe/Dublin'],
    ['CPH', '코펜하겐 공항', '코펜하겐', 'DK', 'Europe/Copenhagen'],
    ['ARN', '스톡홀름 알란다 공항', '스톡홀름', 'SE', 'Europe/Stockholm'],
    ['OSL', '오슬로 공항', '오슬로', 'NO', 'Europe/Oslo'],
    ['HEL', '헬싱키 반타 공항', '헬싱키', 'FI', 'Europe/Helsinki'],
    ['KEF', '케플라비크 국제공항', '레이캬비크', 'IS', 'Atlantic/Reykjavik'],
    ['LAX', '로스앤젤레스 국제공항', '로스앤젤레스', 'US', 'America/Los_Angeles'],
    ['JFK', '존 F. 케네디 국제공항', '뉴욕', 'US', 'America/New_York'],
    ['EWR', '뉴어크 리버티 국제공항', '뉴어크', 'US', 'America/New_York'],
    ['IAD', '워싱턴 덜레스 국제공항', '워싱턴 D.C.', 'US', 'America/New_York'],
    ['BOS', '보스턴 로건 국제공항', '보스턴', 'US', 'America/New_York'],
    ['SFO', '샌프란시스코 국제공항', '샌프란시스코', 'US', 'America/Los_Angeles'],
    ['SEA', '시애틀 터코마 국제공항', '시애틀', 'US', 'America/Los_Angeles'],
    ['LAS', '해리 리드 국제공항', '라스베이거스', 'US', 'America/Los_Angeles'],
    ['HNL', '다니엘 K. 이노우에 국제공항', '호놀룰루', 'US', 'Pacific/Honolulu'],
    ['ORD', '오헤어 국제공항', '시카고', 'US', 'America/Chicago'],
    ['ATL', '하츠필드 잭슨 애틀랜타 국제공항', '애틀랜타', 'US', 'America/New_York'],
    ['DFW', '댈러스 포트워스 국제공항', '댈러스', 'US', 'America/Chicago'],
    ['DEN', '덴버 국제공항', '덴버', 'US', 'America/Denver'],
    ['MIA', '마이애미 국제공항', '마이애미', 'US', 'America/New_York'],
    ['YYZ', '토론토 피어슨 국제공항', '토론토', 'CA', 'America/Toronto'],
    ['YVR', '밴쿠버 국제공항', '밴쿠버', 'CA', 'America/Vancouver'],
    ['YUL', '몬트리올 피에르 엘리오트 트뤼도 국제공항', '몬트리올', 'CA', 'America/Montreal'],
    ['MEX', '멕시코시티 국제공항', '멕시코시티', 'MX', 'America/Mexico_City'],
    ['CUN', '칸쿤 국제공항', '칸쿤', 'MX', 'America/Cancun'],
    ['GRU', '상파울루 과룰류스 국제공항', '상파울루', 'BR', 'America/Sao_Paulo'],
    ['GIG', '리우데자네이루 갈레앙 국제공항', '리우데자네이루', 'BR', 'America/Sao_Paulo'],
    ['EZE', '에세이사 국제공항', '부에노스아이레스', 'AR', 'America/Argentina/Buenos_Aires'],
    ['SCL', '아르투로 메리노 베니테스 국제공항', '산티아고', 'CL', 'America/Santiago'],
    ['BOG', '엘도라도 국제공항', '보고타', 'CO', 'America/Bogota'],
    ['LIM', '호르헤 차베스 국제공항', '리마', 'PE', 'America/Lima'],
    ['PTY', '토쿠멘 국제공항', '파나마시티', 'PA', 'America/Panama'],
    ['KMQ', '고마쓰공항', '가나자와', 'JP', 'Asia/Tokyo'],
    ['KOJ', '가고시마공항', '가고시마', 'JP', 'Asia/Tokyo'],
    ['NGS', '나가사키공항', '나가사키', 'JP', 'Asia/Tokyo'],
    ['KMI', '미야자키공항', '미야자키', 'JP', 'Asia/Tokyo'],
    ['OIT', '오이타공항', '오이타', 'JP', 'Asia/Tokyo'],
    ['CJJ', '청주국제공항', '청주', 'KR', 'Asia/Seoul'],
    ['TAE', '대구국제공항', '대구', 'KR', 'Asia/Seoul'],
    ['YNY', '양양국제공항', '양양', 'KR', 'Asia/Seoul'],
    ['MWX', '무안국제공항', '무안', 'KR', 'Asia/Seoul'],
    ['RMQ', '타이중 국제공항', '타이중', 'TW', 'Asia/Taipei'],
    ['WUH', '우한 톈허 국제공항', '우한', 'CN', 'Asia/Shanghai'],
    ['CKG', '충칭 장베이 국제공항', '충칭', 'CN', 'Asia/Shanghai'],
    ['NKG', '난징 루커우 국제공항', '난징', 'CN', 'Asia/Shanghai'],
    ['DLC', '다롄 저우수이쯔 국제공항', '다롄', 'CN', 'Asia/Shanghai'],
    ['HAK', '하이커우 메이란 국제공항', '하이커우', 'CN', 'Asia/Shanghai'],
    ['SYX', '싼야 펑황 국제공항', '싼야', 'CN', 'Asia/Shanghai'],
    ['URC', '우루무치 톈산 국제공항', '우루무치', 'CN', 'Asia/Shanghai'],
    ['TSN', '톈진 빈하이 국제공항', '톈진', 'CN', 'Asia/Shanghai'],
    ['ZUH', '주하이 진완 공항', '주하이', 'CN', 'Asia/Shanghai'],
    ['USM', '사무이 국제공항', '코사무이', 'TH', 'Asia/Bangkok'],
    ['HUI', '푸바이 국제공항', '후에', 'VN', 'Asia/Ho_Chi_Minh'],
    ['HPH', '캇비 국제공항', '하이퐁', 'VN', 'Asia/Ho_Chi_Minh'],
    ['KCH', '쿠칭 국제공항', '쿠칭', 'MY', 'Asia/Kuala_Lumpur'],
    ['LGK', '랑카위 국제공항', '랑카위', 'MY', 'Asia/Kuala_Lumpur'],
    ['TAG', '보홀 팡라오 국제공항', '보홀', 'PH', 'Asia/Manila'],
    ['PPS', '푸에르토프린세사 국제공항', '푸에르토프린세사', 'PH', 'Asia/Manila'],
    ['DVO', '프란시스코 방고이 국제공항', '다바오', 'PH', 'Asia/Manila'],
    ['LBJ', '코모도 공항', '라부안바조', 'ID', 'Asia/Makassar'],
    ['LOP', '롬복 국제공항', '롬복', 'ID', 'Asia/Makassar'],
    ['GOX', '마노하르 국제공항', '고아', 'IN', 'Asia/Kolkata'],
    ['GOI', '다볼림 공항', '고아', 'IN', 'Asia/Kolkata'],
    ['AMD', '사르다르 발라바이 파텔 국제공항', '아메다바드', 'IN', 'Asia/Kolkata'],
    ['COK', '코친 국제공항', '코치', 'IN', 'Asia/Kolkata'],
    ['TRV', '티루바난타푸람 국제공항', '티루바난타푸람', 'IN', 'Asia/Kolkata'],
    ['PNQ', '푸네 공항', '푸네', 'IN', 'Asia/Kolkata'],
    ['KHI', '진나 국제공항', '카라치', 'PK', 'Asia/Karachi'],
    ['ISB', '이슬라마바드 국제공항', '이슬라마바드', 'PK', 'Asia/Karachi'],
    ['LHE', '알라마 이크발 국제공항', '라호르', 'PK', 'Asia/Karachi'],
    ['TLV', '벤구리온 국제공항', '텔아비브', 'IL', 'Asia/Jerusalem'],
    ['AMM', '퀸 알리아 국제공항', '암만', 'JO', 'Asia/Amman'],
    ['BAH', '바레인 국제공항', '마나마', 'BH', 'Asia/Bahrain'],
    ['MCT', '무스카트 국제공항', '무스카트', 'OM', 'Asia/Muscat'],
    ['KWI', '쿠웨이트 국제공항', '쿠웨이트시티', 'KW', 'Asia/Kuwait'],
    ['SHJ', '샤르자 국제공항', '샤르자', 'AE', 'Asia/Dubai'],
    ['DMM', '킹 파드 국제공항', '담맘', 'SA', 'Asia/Riyadh'],
    ['MED', '프린스 모하마드 빈 압둘아지즈 국제공항', '메디나', 'SA', 'Asia/Riyadh'],
    ['AYT', '안탈리아 공항', '안탈리아', 'TR', 'Europe/Istanbul'],
    ['ALA', '알마티 국제공항', '알마티', 'KZ', 'Asia/Almaty'],
    ['NQZ', '누르술탄 나자르바예프 국제공항', '아스타나', 'KZ', 'Asia/Almaty'],
    ['TBS', '트빌리시 국제공항', '트빌리시', 'GE', 'Asia/Tbilisi'],
    ['EVN', '즈바르트노츠 국제공항', '예레반', 'AM', 'Asia/Yerevan'],
    ['TAS', '타슈켄트 국제공항', '타슈켄트', 'UZ', 'Asia/Tashkent'],
    ['TUN', '튀니스 카르타고 국제공항', '튀니스', 'TN', 'Africa/Tunis'],
    ['ALG', '우아리 부메디엔 공항', '알제', 'DZ', 'Africa/Algiers'],
    ['MRU', '서시우사가르 람굴람 국제공항', '모리셔스', 'MU', 'Indian/Mauritius'],
    ['SEZ', '세이셸 국제공항', '마헤', 'SC', 'Indian/Mahe'],
    ['RAK', '마라케시 메나라 공항', '마라케시', 'MA', 'Africa/Casablanca'],
    ['LOS', '무르탈라 무하메드 국제공항', '라고스', 'NG', 'Africa/Lagos'],
    ['ACC', '코토카 국제공항', '아크라', 'GH', 'Africa/Accra'],
    ['DAR', '줄리어스 니에레레 국제공항', '다르에스살람', 'TZ', 'Africa/Dar_es_Salaam'],
    ['ZNZ', '아베이드 아마니 카루메 국제공항', '잔지바르', 'TZ', 'Africa/Dar_es_Salaam'],
    ['BER', '베를린 브란덴부르크 공항', '베를린', 'DE', 'Europe/Berlin'],
    ['DUS', '뒤셀도르프 공항', '뒤셀도르프', 'DE', 'Europe/Berlin'],
    ['HAM', '함부르크 공항', '함부르크', 'DE', 'Europe/Berlin'],
    ['EDI', '에든버러 공항', '에든버러', 'GB', 'Europe/London'],
    ['STN', '런던 스탠스테드 공항', '런던', 'GB', 'Europe/London'],
    ['ALC', '알리칸테 엘체 공항', '알리칸테', 'ES', 'Europe/Madrid'],
    ['AGP', '말라가 코스타델솔 공항', '말라가', 'ES', 'Europe/Madrid'],
    ['VLC', '발렌시아 공항', '발렌시아', 'ES', 'Europe/Madrid'],
    ['OTP', '앙리 코안더 국제공항', '부쿠레슈티', 'RO', 'Europe/Bucharest'],
    ['SOF', '소피아 공항', '소피아', 'BG', 'Europe/Sofia'],
    ['BEG', '베오그라드 니콜라 테슬라 공항', '베오그라드', 'RS', 'Europe/Belgrade'],
    ['KRK', '요한 바오로 2세 크라쿠프 공항', '크라쿠프', 'PL', 'Europe/Warsaw'],
    ['YYC', '캘거리 국제공항', '캘거리', 'CA', 'America/Edmonton'],
    ['YEG', '에드먼턴 국제공항', '에드먼턴', 'CA', 'America/Edmonton'],
    ['IAH', '조지 부시 인터콘티넨털 공항', '휴스턴', 'US', 'America/Chicago'],
    ['SAN', '샌디에이고 국제공항', '샌디에이고', 'US', 'America/Los_Angeles'],
    ['PDX', '포틀랜드 국제공항', '포틀랜드', 'US', 'America/Los_Angeles'],
    ['DTW', '디트로이트 메트로폴리탄 공항', '디트로이트', 'US', 'America/New_York'],
    ['MSP', '미니애폴리스-세인트폴 국제공항', '미니애폴리스', 'US', 'America/Chicago'],
    ['PHX', '피닉스 스카이하버 국제공항', '피닉스', 'US', 'America/Phoenix'],
    ['MCO', '올랜도 국제공항', '올랜도', 'US', 'America/New_York'],
    ['OGG', '카훌루이 공항', '마우이', 'US', 'Pacific/Honolulu'],
    ['SJU', '루이스 무뇨스 마린 국제공항', '산후안', 'PR', 'America/Puerto_Rico'],
    ['PUJ', '푼타카나 국제공항', '푼타카나', 'DO', 'America/Santo_Domingo'],
    ['MBJ', '상스터 국제공항', '몬테고베이', 'JM', 'America/Jamaica'],
    ['AUA', '퀸 베아트릭스 국제공항', '아루바', 'AW', 'America/Aruba'],
    ['SAL', '몬세뇨르 오스카르 아르눌포 로메로 국제공항', '산살바도르', 'SV', 'America/El_Salvador'],
    ['GUA', '라 아우로라 국제공항', '과테말라시티', 'GT', 'America/Guatemala'],
    ['SJO', '후안 산타마리아 국제공항', '산호세', 'CR', 'America/Costa_Rica'],
    ['UIO', '마리스칼 수크레 국제공항', '키토', 'EC', 'America/Guayaquil'],
    ['GYE', '호세 호아킨 데 올메도 국제공항', '과야킬', 'EC', 'America/Guayaquil'],
    ['MDE', '호세 마리아 코르도바 국제공항', '메데인', 'CO', 'America/Bogota'],
    ['CTG', '라파엘 누녜스 국제공항', '카르타헤나', 'CO', 'America/Bogota'],
    ['COR', '인헤니에로 암브로시오 타라베야 공항', '코르도바', 'AR', 'America/Argentina/Cordoba'],
    ['AEP', '호르헤 뉴베리 공항', '부에노스아이레스', 'AR', 'America/Argentina/Buenos_Aires'],
];

const airportAliasEntries = [
    ['ICN', 'Seoul', 'Incheon International Airport'],
    ['GMP', 'Seoul', 'Gimpo International Airport'],
    ['PUS', 'Busan', 'Gimhae International Airport'],
    ['CJU', 'Cheju', 'Jeju International Airport'],
    ['NRT', 'Tokyo', 'Narita International Airport'],
    ['HND', 'Tokyo', 'Tokyo Haneda International Airport'],
    ['KIX', 'Osaka', 'Kansai International Airport'],
    ['NGO', 'Nagoya', 'Chubu Centrair International Airport'],
    ['FUK', 'Fukuoka', 'Fukuoka Airport'],
    ['CTS', 'Sapporo', 'New Chitose Airport'],
    ['OKA', 'Okinawa', 'Naha Airport'],
    ['SDJ', 'Sendai', 'Sendai Airport'],
    ['HIJ', 'Hiroshima', 'Hiroshima Airport'],
    ['PEK', 'Beijing', 'Beijing Capital International Airport'],
    ['PKX', 'Beijing', 'Beijing Daxing International Airport'],
    ['PVG', 'Shanghai', 'Shanghai Pudong International Airport'],
    ['SHA', 'Shanghai', 'Shanghai Hongqiao International Airport'],
    ['CAN', 'Guangzhou', 'Guangzhou Baiyun International Airport'],
    ['SZX', 'Shenzhen', "Shenzhen Bao'an International Airport"],
    ['CTU', 'Chengdu', 'Chengdu Shuangliu International Airport'],
    ['TFU', 'Chengdu', 'Chengdu Tianfu International Airport'],
    ['XIY', "Xi'an", "Xi'an Xianyang International Airport"],
    ['XMN', 'Xiamen', 'Xiamen Gaoqi International Airport'],
    ['TAO', 'Qingdao', 'Liuting Airport'],
    ['KMG', 'Kunming', 'Kunming Changshui International Airport'],
    ['HGH', 'Hangzhou', 'Hangzhou Xiaoshan International Airport'],
    ['BKK', 'Bangkok', 'Suvarnabhumi Airport'],
    ['DMK', 'Bangkok', 'Don Mueang International Airport'],
    ['CNX', 'Chiang Mai', 'Chiang Mai International Airport'],
    ['HKT', 'Phuket', 'Phuket International Airport'],
    ['KBV', 'Krabi', 'Krabi Airport'],
    ['SIN', 'Singapore', 'Singapore Changi Airport'],
    ['HKG', 'Hong Kong', 'Hong Kong International Airport'],
    ['TPE', 'Taipei', 'Taiwan Taoyuan International Airport'],
    ['TSA', 'Taipei', 'Taipei Songshan Airport'],
    ['KHH', 'Kaohsiung', 'Kaohsiung International Airport'],
    ['MFM', 'Macau', 'Macau International Airport'],
    ['HAN', 'Hanoi', 'Noi Bai International Airport'],
    ['SGN', 'Ho Chi Minh City', 'Tan Son Nhat International Airport'],
    ['DAD', 'Danang', 'Da Nang International Airport'],
    ['CXR', 'Nha Trang', 'Cam Ranh Airport'],
    ['PQC', 'Phuquoc', 'Phu Quoc International Airport'],
    ['KUL', 'Kuala Lumpur', 'Kuala Lumpur International Airport'],
    ['PEN', 'Penang', 'Penang International Airport'],
    ['BKI', 'Kota Kinabalu', 'Kota Kinabalu International Airport'],
    ['JHB', 'Johor Bahru', 'Senai International Airport'],
    ['MNL', 'Manila', 'Ninoy Aquino International Airport'],
    ['CEB', 'Cebu', 'Mactan Cebu International Airport'],
    ['CRK', 'Angeles City', 'Diosdado Macapagal International Airport'],
    ['CGK', 'Jakarta', 'Soekarno-Hatta International Airport'],
    ['DPS', 'Denpasar', 'Ngurah Rai (Bali) International Airport'],
    ['SUB', 'Surabaya', 'Juanda International Airport'],
    ['YIA', 'Yogyakarta', 'Yogyakarta International Airport'],
    ['PNH', 'Phnom-penh', 'Phnom Penh International Airport'],
    ['SAI', 'Siem Reap', 'Siem Reap Angkor International Airport'],
    ['VTE', 'Vientiane', 'Wattay International Airport'],
    ['LPQ', 'Luang Prabang', 'Luang Phabang International Airport'],
    ['RGN', 'Yangon', 'Yangon International Airport'],
    ['BWN', 'Bandar Seri Begawan', 'Brunei International Airport'],
    ['DEL', 'Delhi', 'Indira Gandhi International Airport'],
    ['BOM', 'Mumbai', 'Chhatrapati Shivaji International Airport'],
    ['BLR', 'Bangalore', 'Kempegowda International Airport'],
    ['MAA', 'Madras', 'Chennai International Airport'],
    ['HYD', 'Hyderabad', 'Rajiv Gandhi International Airport'],
    ['CCU', 'Kolkata', 'Netaji Subhash Chandra Bose International Airport'],
    ['CMB', 'Colombo', 'Bandaranaike International Colombo Airport'],
    ['KTM', 'Kathmandu', 'Tribhuvan International Airport'],
    ['DAC', 'Dhaka', 'Hazrat Shahjalal International Airport'],
    ['MLE', 'Male', 'Male International Airport'],
    ['UBN', 'Ulaanbaatar', 'Chinggis Khaan International Airport'],
    ['SYD', 'Sydney', 'Sydney Kingsford Smith International Airport'],
    ['MEL', 'Melbourne', 'Melbourne International Airport'],
    ['BNE', 'Brisbane', 'Brisbane International Airport'],
    ['PER', 'Perth', 'Perth International Airport'],
    ['CNS', 'Cairns', 'Cairns International Airport'],
    ['AKL', 'Auckland', 'Auckland International Airport'],
    ['CHC', 'Christchurch', 'Christchurch International Airport'],
    ['ZQN', 'Queenstown International', 'Queenstown International Airport'],
    ['GUM', 'Agana', 'Antonio B. Won Pat International Airport'],
    ['SPN', 'Saipan', 'Saipan International Airport'],
    ['DXB', 'Dubai', 'Dubai International Airport'],
    ['AUH', 'Abu Dhabi', 'Abu Dhabi International Airport'],
    ['DOH', 'Doha', 'Hamad International Airport'],
    ['JED', 'Jeddah', 'King Abdulaziz International Airport'],
    ['RUH', 'Riyadh', 'King Khaled International Airport'],
    ['IST', 'Istanbul', 'Istanbul Airport'],
    ['SAW', 'Istanbul', 'Sabiha Gokcen International Airport'],
    ['CAI', 'Cairo', 'Cairo International Airport'],
    ['JNB', 'Johannesburg', 'OR Tambo International Airport'],
    ['CPT', 'Cape Town', 'Cape Town International Airport'],
    ['ADD', 'Addis Ababa', 'Addis Ababa Bole International Airport'],
    ['NBO', 'Nairobi', 'Jomo Kenyatta International Airport'],
    ['CMN', 'Casablanca', 'Mohammed V International Airport'],
    ['LHR', 'London', 'London Heathrow Airport'],
    ['LGW', 'London', 'London Gatwick Airport'],
    ['MAN', 'Manchester', 'Manchester Airport'],
    ['CDG', 'Paris', 'Charles de Gaulle International Airport'],
    ['ORY', 'Paris', 'Paris-Orly Airport'],
    ['NCE', 'Nice', "Nice-Cote d'Azur Airport"],
    ['FRA', 'Frankfurt', 'Frankfurt am Main Airport'],
    ['MUC', 'Munich', 'Munich Airport'],
    ['AMS', 'Amsterdam', 'Amsterdam Airport Schiphol'],
    ['BRU', 'Brussels', 'Brussels Airport'],
    ['ZRH', 'Zurich', 'Zurich Airport'],
    ['GVA', 'Geneva', 'Geneva Cointrin International Airport'],
    ['VIE', 'Vienna', 'Vienna International Airport'],
    ['PRG', 'Prague', 'Vaclav Havel Airport Prague'],
    ['BUD', 'Budapest', 'Budapest Liszt Ferenc International Airport'],
    ['WAW', 'Warsaw', 'Warsaw Chopin Airport'],
    ['LIS', 'Lisbon', 'Humberto Delgado Airport'],
    ['OPO', 'Porto', 'Francisco de Sa Carneiro Airport'],
    ['MAD', 'Madrid', 'Adolfo Suarez Madrid-Barajas Airport'],
    ['BCN', 'Barcelona', 'Barcelona International Airport'],
    ['PMI', 'Palma de Mallorca', 'Palma De Mallorca Airport'],
    ['FCO', 'Rome', 'Leonardo da Vinci-Fiumicino Airport'],
    ['MXP', 'Milano', 'Malpensa International Airport'],
    ['VCE', 'Venice', 'Venice Marco Polo Airport'],
    ['ATH', 'Athens', 'Eleftherios Venizelos International Airport'],
    ['DUB', 'Dublin', 'Dublin Airport'],
    ['CPH', 'Copenhagen', 'Copenhagen Kastrup Airport'],
    ['ARN', 'Stockholm', 'Stockholm-Arlanda Airport'],
    ['OSL', 'Oslo', 'Oslo Lufthavn'],
    ['HEL', 'Helsinki', 'Helsinki Vantaa Airport'],
    ['KEF', 'Keflavik', 'Keflavik International Airport'],
    ['LAX', 'Los Angeles', 'Los Angeles International Airport'],
    ['JFK', 'New York', 'John F Kennedy International Airport'],
    ['EWR', 'Newark', 'Newark Liberty International Airport'],
    ['IAD', 'Washington', 'Washington Dulles International Airport'],
    ['BOS', 'Boston', 'General Edward Lawrence Logan International Airport'],
    ['SFO', 'San Francisco', 'San Francisco International Airport'],
    ['SEA', 'Seattle', 'Seattle Tacoma International Airport'],
    ['LAS', 'Las Vegas', 'McCarran International Airport'],
    ['HNL', 'Honolulu', 'Daniel K Inouye International Airport'],
    ['ORD', 'Chicago', "Chicago O'Hare International Airport"],
    ['ATL', 'Atlanta', 'Hartsfield Jackson Atlanta International Airport'],
    ['DFW', 'Dallas-Fort Worth', 'Dallas Fort Worth International Airport'],
    ['DEN', 'Denver', 'Denver International Airport'],
    ['MIA', 'Miami', 'Miami International Airport'],
    ['YYZ', 'Toronto', 'Lester B. Pearson International Airport'],
    ['YVR', 'Vancouver', 'Vancouver International Airport'],
    ['YUL', 'Montreal', 'Montreal Pierre Elliott Trudeau International Airport'],
    ['MEX', 'Mexico City', 'Licenciado Benito Juarez International Airport'],
    ['CUN', 'Cancun', 'Cancun International Airport'],
    ['GRU', 'Sao Paulo', 'Guarulhos International Airport'],
    ['GIG', 'Rio De Janeiro', 'Rio Galeao Tom Jobim International Airport'],
    ['EZE', 'Buenos Aires', 'Ministro Pistarini International Airport'],
    ['SCL', 'Santiago', 'Comodoro Arturo Merino Benitez International Airport'],
    ['BOG', 'Bogota', 'El Dorado International Airport'],
    ['LIM', 'Lima', 'Jorge Chavez International Airport'],
    ['PTY', 'Panama City', 'Tocumen International Airport'],
    ['KMQ', 'Kanazawa', 'Komatsu Airport'],
    ['KOJ', 'Kagoshima', 'Kagoshima Airport'],
    ['NGS', 'Nagasaki', 'Nagasaki Airport'],
    ['KMI', 'Miyazaki', 'Miyazaki Airport'],
    ['OIT', 'Oita', 'Oita Airport'],
    ['CJJ', 'Chongju', 'Cheongju International Airport'],
    ['TAE', 'Taegu', 'Daegu Airport'],
    ['YNY', 'Sokcho / Gangneung', 'Yangyang International Airport'],
    ['MWX', 'Muan', 'Muan International Airport'],
    ['RMQ', 'Taichung', 'Taichung International Airport'],
    ['WUH', 'Wuhan', 'Wuhan Tianhe International Airport'],
    ['CKG', 'Chongqing', 'Chongqing Jiangbei International Airport'],
    ['NKG', 'Nanjing', 'Nanjing Lukou Airport'],
    ['DLC', 'Dalian', 'Dalian Zhoushuizi International Airport'],
    ['HAK', 'Haikou', 'Haikou Meilan International Airport'],
    ['SYX', 'Sanya', 'Sanya Phoenix International Airport'],
    ['URC', 'Urumqi', 'Urumqi Diwopu International Airport'],
    ['TSN', 'Tianjin', 'Tianjin Binhai International Airport'],
    ['ZUH', 'Zhuhai', 'Zhuhai Jinwan Airport'],
    ['USM', 'Ko Samui', 'Samui Airport'],
    ['HUI', 'Hue', 'Phu Bai Airport'],
    ['HPH', 'Haiphong', 'Cat Bi International Airport'],
    ['KCH', 'Kuching', 'Kuching International Airport'],
    ['LGK', 'Langkawi', 'Langkawi International Airport'],
    ['TAG', 'Tagbilaran', 'Bohol Panglao International Airport'],
    ['PPS', 'Puerto Princesa', 'Puerto Princesa Airport'],
    ['DVO', 'Davao', 'Francisco Bangoy International Airport'],
    ['LBJ', 'Labuan Bajo', 'Komodo Airport'],
    ['LOP', 'Praya', 'Lombok International Airport'],
    ['GOX', 'Goa', 'Manohar International Airport'],
    ['GOI', 'Goa', 'Dabolim Airport'],
    ['AMD', 'Ahmedabad', 'Sardar Vallabhbhai Patel International Airport'],
    ['COK', 'Kochi', 'Cochin International Airport'],
    ['TRV', 'Trivandrum', 'Trivandrum International Airport'],
    ['PNQ', 'Pune', 'Pune Airport'],
    ['KHI', 'Karachi', 'Jinnah International Airport'],
    ['ISB', 'Islamabad', 'Islamabad International Airport'],
    ['LHE', 'Lahore', 'Allama Iqbal International Airport'],
    ['TLV', 'Tel Aviv', 'Ben Gurion International Airport'],
    ['AMM', 'Amman', 'Queen Alia International Airport'],
    ['BAH', 'Bahrain', 'Bahrain International Airport'],
    ['MCT', 'Muscat', 'Muscat International Airport'],
    ['KWI', 'Kuwait', 'Kuwait International Airport'],
    ['SHJ', 'Sharjah', 'Sharjah International Airport'],
    ['DMM', 'Dammam', 'King Fahd International Airport'],
    ['MED', 'Madinah', 'Prince Mohammad Bin Abdulaziz Airport'],
    ['AYT', 'Antalya', 'Antalya International Airport'],
    ['ALA', 'Alma Ata', 'Almaty Airport'],
    ['NQZ', 'Astana', 'Nursultan Nazarbayev International Airport'],
    ['TBS', 'Tbilisi', 'Tbilisi International Airport'],
    ['EVN', 'Yerevan', 'Zvartnots International Airport'],
    ['TAS', 'Tashkent', 'Tashkent International Airport'],
    ['TUN', 'Tunis', 'Tunis Carthage International Airport'],
    ['ALG', 'Algier', 'Houari Boumediene Airport'],
    ['MRU', 'Mauritius', 'Sir Seewoosagur Ramgoolam International Airport'],
    ['SEZ', 'Mahe', 'Seychelles International Airport'],
    ['RAK', 'Marrakech', 'Menara Airport'],
    ['LOS', 'Lagos', 'Murtala Muhammed International Airport'],
    ['ACC', 'Accra', 'Kotoka International Airport'],
    ['DAR', 'Dar Es Salaam', 'Julius Nyerere International Airport'],
    ['ZNZ', 'Zanzibar', 'Abeid Amani Karume International Airport'],
    ['BER', 'Berlin', 'Berlin Brandenburg Airport'],
    ['DUS', 'Duesseldorf', 'Dusseldorf Airport'],
    ['HAM', 'Hamburg', 'Hamburg Airport'],
    ['EDI', 'Edinburgh', 'Edinburgh Airport'],
    ['STN', 'London', 'London Stansted Airport'],
    ['ALC', 'Alicante', 'Alicante International Airport'],
    ['AGP', 'Malaga', 'Malaga Airport'],
    ['VLC', 'Valencia', 'Valencia Airport'],
    ['OTP', 'Bucharest', 'Henri Coanda International Airport'],
    ['SOF', 'Sofia', 'Sofia Airport'],
    ['BEG', 'Belgrade', 'Belgrade Nikola Tesla Airport'],
    ['KRK', 'Krakow', 'Krakow John Paul II International Airport'],
    ['YYC', 'Calgary', 'Calgary International Airport'],
    ['YEG', 'Edmonton', 'Edmonton International Airport'],
    ['IAH', 'Houston', 'George Bush Intercontinental Airport'],
    ['SAN', 'San Diego', 'San Diego International Airport'],
    ['PDX', 'Portland', 'Portland International Airport'],
    ['DTW', 'Detroit', 'Detroit Metropolitan Airport'],
    ['MSP', 'Minneapolis', 'Minneapolis Saint Paul International Airport'],
    ['PHX', 'Phoenix', 'Phoenix Sky Harbor International Airport'],
    ['MCO', 'Orlando', 'Orlando International Airport'],
    ['OGG', 'Kahului', 'Kahului Airport'],
    ['SJU', 'San Juan', 'Luis Munoz Marin International Airport'],
    ['PUJ', 'Punta Cana', 'Punta Cana International Airport'],
    ['MBJ', 'Montego Bay', 'Sangster International Airport'],
    ['AUA', 'Oranjestad', 'Queen Beatrix International Airport'],
    ['SAL', 'San Salvador', 'Monseñor Oscar Arnulfo Romero International Airport'],
    ['GUA', 'Guatemala City', 'La Aurora International Airport'],
    ['SJO', 'San Jose', 'Juan Santamaria International Airport'],
    ['UIO', 'Quito', 'Mariscal Sucre International Airport'],
    ['GYE', 'Guayaquil', 'Jose Joaquin de Olmedo International Airport'],
    ['MDE', 'Medellin', 'Jose Maria Cordova International Airport'],
    ['CTG', 'Cartagena', 'Rafael Nunez International Airport'],
    ['COR', 'Cordoba', 'Ingeniero Ambrosio Taravella Airport'],
    ['AEP', 'Buenos Aires', 'Jorge Newbery Airpark'],
];

const airportAliasOverrideEntries = [
    ['DLC', '대련'],
    ['PEK', '북경'],
    ['PKX', '북경', '다싱'],
    ['PVG', '상해'],
    ['SHA', '상해'],
    ['XIY', '서안', 'Xian'],
    ['TAO', '청도'],
    ['TPE', '타이페이'],
    ['TSA', '타이페이', '쑹산', '송산'],
    ['KHH', '카오슝'],
    ['SGN', '호치민', '사이공', 'Saigon'],
    ['DAD', 'Da Nang'],
    ['CXR', '나트랑', '나짱'],
    ['PQC', '푸국'],
    ['DPS', 'Bali'],
    ['MFM', 'Macao'],
    ['NQZ', 'Nur-Sultan', 'Nur Sultan'],
    ['SAW', 'Sabiha'],
    ['BER', 'Brandenburg'],
    ['GUM', 'Guam'],
    ['SPN', 'Saipan'],
];

const countrySearchEntries = [
    ['AE', '아랍에미리트', 'United Arab Emirates'],
    ['AM', '아르메니아', 'Armenia'],
    ['AR', '아르헨티나', 'Argentina'],
    ['AT', '오스트리아', 'Austria'],
    ['AU', '오스트레일리아', 'Australia'],
    ['AW', '아루바', 'Aruba'],
    ['BD', '방글라데시', 'Bangladesh'],
    ['BE', '벨기에', 'Belgium'],
    ['BG', '불가리아', 'Bulgaria'],
    ['BH', '바레인', 'Bahrain'],
    ['BN', '브루나이', 'Brunei'],
    ['BR', '브라질', 'Brazil'],
    ['CA', '캐나다', 'Canada'],
    ['CH', '스위스', 'Switzerland'],
    ['CL', '칠레', 'Chile'],
    ['CN', '중국', 'China'],
    ['CO', '콜롬비아', 'Colombia'],
    ['CR', '코스타리카', 'Costa Rica'],
    ['CZ', '체코', 'Czechia'],
    ['DE', '독일', 'Germany'],
    ['DK', '덴마크', 'Denmark'],
    ['DO', '도미니카 공화국', 'Dominican Republic'],
    ['DZ', '알제리', 'Algeria'],
    ['EC', '에콰도르', 'Ecuador'],
    ['EG', '이집트', 'Egypt'],
    ['ES', '스페인', 'Spain'],
    ['ET', '에티오피아', 'Ethiopia'],
    ['FI', '핀란드', 'Finland'],
    ['FR', '프랑스', 'France'],
    ['GB', '영국', 'United Kingdom'],
    ['GE', '조지아', 'Georgia'],
    ['GH', '가나', 'Ghana'],
    ['GR', '그리스', 'Greece'],
    ['GT', '과테말라', 'Guatemala'],
    ['GU', '괌', 'Guam'],
    ['HK', '홍콩', 'Hong Kong'],
    ['HU', '헝가리', 'Hungary'],
    ['ID', '인도네시아', 'Indonesia'],
    ['IE', '아일랜드', 'Ireland'],
    ['IL', '이스라엘', 'Israel'],
    ['IN', '인도', 'India'],
    ['IS', '아이슬란드', 'Iceland'],
    ['IT', '이탈리아', 'Italy'],
    ['JM', '자메이카', 'Jamaica'],
    ['JO', '요르단', 'Jordan'],
    ['JP', '일본', 'Japan'],
    ['KE', '케냐', 'Kenya'],
    ['KH', '캄보디아', 'Cambodia'],
    ['KR', '대한민국', 'South Korea'],
    ['KW', '쿠웨이트', 'Kuwait'],
    ['KZ', '카자흐스탄', 'Kazakhstan'],
    ['LA', '라오스', 'Laos'],
    ['LK', '스리랑카', 'Sri Lanka'],
    ['MA', '모로코', 'Morocco'],
    ['MM', '미얀마', 'Myanmar'],
    ['MN', '몽골', 'Mongolia'],
    ['MO', '마카오', 'Macao'],
    ['MP', '북마리아나제도', 'Northern Mariana Islands'],
    ['MU', '모리셔스', 'Mauritius'],
    ['MV', '몰디브', 'Maldives'],
    ['MX', '멕시코', 'Mexico'],
    ['MY', '말레이시아', 'Malaysia'],
    ['NG', '나이지리아', 'Nigeria'],
    ['NL', '네덜란드', 'Netherlands'],
    ['NO', '노르웨이', 'Norway'],
    ['NP', '네팔', 'Nepal'],
    ['NZ', '뉴질랜드', 'New Zealand'],
    ['OM', '오만', 'Oman'],
    ['PA', '파나마', 'Panama'],
    ['PE', '페루', 'Peru'],
    ['PH', '필리핀', 'Philippines'],
    ['PK', '파키스탄', 'Pakistan'],
    ['PL', '폴란드', 'Poland'],
    ['PR', '푸에르토리코', 'Puerto Rico'],
    ['PT', '포르투갈', 'Portugal'],
    ['QA', '카타르', 'Qatar'],
    ['RO', '루마니아', 'Romania'],
    ['RS', '세르비아', 'Serbia'],
    ['SA', '사우디아라비아', 'Saudi Arabia'],
    ['SC', '세이셸', 'Seychelles'],
    ['SE', '스웨덴', 'Sweden'],
    ['SG', '싱가포르', 'Singapore'],
    ['SV', '엘살바도르', 'El Salvador'],
    ['TH', '태국', 'Thailand'],
    ['TN', '튀니지', 'Tunisia'],
    ['TR', '튀르키예', 'Turkiye'],
    ['TW', '대만', 'Taiwan'],
    ['TZ', '탄자니아', 'Tanzania'],
    ['US', '미국', 'United States'],
    ['UZ', '우즈베키스탄', 'Uzbekistan'],
    ['VN', '베트남', 'Vietnam'],
    ['ZA', '남아프리카', 'South Africa'],
];

const countryAliasOverrideEntries = [
    ['AE', 'UAE', 'Emirates'],
    ['CZ', 'Czech Republic'],
    ['GB', 'UK', 'Britain', 'Great Britain', 'England'],
    ['HK', 'Hong Kong SAR'],
    ['KR', '한국', 'Korea', 'South Korea'],
    ['MM', 'Myanmar (Burma)', 'Burma'],
    ['MO', 'Macau', 'Macao SAR'],
    ['TR', 'Turkey'],
    ['US', 'USA', 'U.S.', 'America', 'United States of America'],
];

const airportAliasesByCode = new Map(airportAliasEntries.map(([code, ...aliases]) => [code, aliases]));
const airportAliasOverridesByCode = new Map(airportAliasOverrideEntries.map(([code, ...aliases]) => [code, aliases]));
const countryAliasesByCode = new Map(countrySearchEntries.map(([code, ...aliases]) => [code, aliases]));
const countryAliasOverridesByCode = new Map(countryAliasOverrideEntries.map(([code, ...aliases]) => [code, aliases]));

export const airports = airportEntries.map(([code, name, city, country, timeZone]) => {
    const aliases = Array.from(new Set([
        ...(airportAliasesByCode.get(code) || []),
        ...(airportAliasOverridesByCode.get(code) || [])
    ].filter(Boolean)));
    const countryAliases = Array.from(new Set([
        ...(countryAliasesByCode.get(country) || []),
        ...(countryAliasOverridesByCode.get(country) || [])
    ].filter(Boolean)));

    return {
        code,
        name,
        city,
        country,
        countryAliases,
        timeZone,
        aliases
    };
});

function normalizeAirportQuery(value) {
    return String(value || '').trim();
}

function normalizeAirportSearchText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"`’.,()\-_/|]+/g, '')
        .replace(/\s+/g, '');
}

function normalizeAirportSearchPhrase(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"`’.,()\-_/|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getAirportSearchTerms(airport) {
    return [
        airport.code,
        airport.name,
        airport.city,
        airport.country,
        ...(Array.isArray(airport.countryAliases) ? airport.countryAliases : []),
        ...(Array.isArray(airport.aliases) ? airport.aliases : [])
    ].filter(Boolean);
}

function getAirportMatchScore(airport, normalizedQuery) {
    if (!normalizedQuery.compact) {
        return 0;
    }

    const matchRules = [
        { values: [airport.code], exact: 500, startsWith: 320, includes: 180 },
        { values: [airport.name], exact: 420, startsWith: 260, includes: 140 },
        { values: [airport.city], exact: 360, startsWith: 220, includes: 120 },
        { values: [airport.country, ...(airport.countryAliases || [])], exact: 300, startsWith: 170, includes: 90 },
        { values: airport.aliases || [], exact: 340, startsWith: 200, includes: 110 }
    ];

    let bestScore = 0;

    for (const rule of matchRules) {
        for (const value of rule.values) {
            const normalizedValueCompact = normalizeAirportSearchText(value);
            if (!normalizedValueCompact) {
                continue;
            }

            if (normalizedValueCompact === normalizedQuery.compact) {
                bestScore = Math.max(bestScore, rule.exact);
                continue;
            }

            if (normalizedValueCompact.startsWith(normalizedQuery.compact)) {
                bestScore = Math.max(bestScore, rule.startsWith);
                continue;
            }

            const normalizedValuePhrase = normalizeAirportSearchPhrase(value);
            if (normalizedValuePhrase && normalizedQuery.phrase && normalizedValuePhrase.includes(normalizedQuery.phrase)) {
                bestScore = Math.max(bestScore, rule.includes);
            }
        }
    }

    return bestScore;
}

export function extractAirportCodeFromInput(value) {
    const normalized = normalizeAirportQuery(value).toUpperCase();
    if (!normalized) {
        return '';
    }

    const directMatch = normalized.match(/^[A-Z]{3}(?=\b|\s|\||·|-|$)/);
    if (directMatch) {
        return directMatch[0];
    }

    if (/^[A-Z]{3}$/.test(normalized)) {
        return normalized;
    }

    return '';
}

export function searchAirports(query) {
    const normalizedQuery = {
        compact: normalizeAirportSearchText(query),
        phrase: normalizeAirportSearchPhrase(query)
    };
    if (!normalizedQuery.compact) return [];

    return airports
        .map((airport, index) => ({
            airport,
            score: getAirportMatchScore(airport, normalizedQuery),
            index
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return left.index - right.index;
        })
        .map((entry) => entry.airport);
}

export function getAirportByCode(code) {
    const normalizedCode = normalizeAirportQuery(code).toUpperCase();
    if (!normalizedCode) {
        return null;
    }

    return airports.find((airport) => airport.code.toUpperCase() === normalizedCode) || null;
}

export function resolveAirport(value) {
    const normalized = normalizeAirportQuery(value);
    if (!normalized) {
        return null;
    }

    const byCode = getAirportByCode(extractAirportCodeFromInput(normalized));
    if (byCode) {
        return byCode;
    }

    const normalizedSearchValue = normalizeAirportSearchText(normalized);
    const exactMatch = airports.find((airport) => (
        getAirportSearchTerms(airport).some((term) => normalizeAirportSearchText(term) === normalizedSearchValue)
        || normalizeAirportSearchText(formatAirportSelectionValue(airport.code, airport.name)) === normalizedSearchValue
    ));

    if (exactMatch) {
        return exactMatch;
    }

    return searchAirports(normalized)[0] || null;
}

export function getAirportSuggestions(query, limit = 10) {
    if (!query) {
        return [];
    }

    return searchAirports(query).slice(0, Math.max(1, limit));
}

export function formatAirportSelectionValue(code, name) {
    const safeCode = normalizeAirportQuery(code).toUpperCase();
    const safeName = normalizeAirportQuery(name);

    if (safeCode && safeName) {
        return `${safeCode} | ${safeName}`;
    }

    return safeCode || safeName;
}

export function formatAirport(airport) {
    if (typeof airport === 'string') {
        const found = getAirportByCode(airport);
        return found ? formatAirportSelectionValue(found.code, found.name) : airport;
    }

    return formatAirportSelectionValue(airport.code, airport.name);
}
