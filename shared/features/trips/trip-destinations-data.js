import { airports } from '../transit/airports-data.js';
import { getTripDestinationCenterById } from './trip-destination-centers.js';

/**
 * @typedef {'international' | 'domestic'} DestinationScope
 */

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   subtitle: string;
 *   scope: DestinationScope;
 *   categoryId: string;
 *   imageUrl: string | null;
 *   keywords: string[];
 *   latitude: number | null;
 *   longitude: number | null;
 *   countryCode: string;
 * }} PopularTripDestination
 */

function normalizeSearchText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"`’.,()\-_/|]+/g, '')
        .replace(/\s+/g, '');
}

function uniqueStrings(values) {
    return Array.from(new Set(
        values
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    ));
}

const POPULAR_TRIP_DESTINATION_IMAGE_BASE_URL = 'https://plin-db93d.web.app/images/trip-destinations';
const POPULAR_TRIP_DESTINATION_IMAGE_ASSET_VERSION = '2026-04-20';
const defaultPopularTripDestinationImageUrl = (
    `${POPULAR_TRIP_DESTINATION_IMAGE_BASE_URL}/default.jpg?v=${POPULAR_TRIP_DESTINATION_IMAGE_ASSET_VERSION}`
);

function createImageUrl(id) {
    const safeId = String(id || 'trip-destination').trim() || 'trip-destination';
    return (
        `${POPULAR_TRIP_DESTINATION_IMAGE_BASE_URL}/${safeId}.jpg?v=${POPULAR_TRIP_DESTINATION_IMAGE_ASSET_VERSION}`
    );
}

function buildSubtitle(name, highlights = [], fallbackText = '') {
    const terms = uniqueStrings([name, ...highlights]);
    if (terms.length >= 2) {
        return terms.slice(0, 4).join(', ');
    }

    return fallbackText || `${name} 대표 여행지`;
}

function buildDestinationKey(scope, name, countryCode = '') {
    return [scope, String(countryCode || '').trim().toUpperCase(), normalizeSearchText(name)].join('|');
}

function isKoreanText(value) {
    return /[가-힣]/.test(String(value || ''));
}

function buildCountryFallbackText(name, countryName) {
    if (!countryName || countryName === name) {
        return `${name} 대표 여행지`;
    }

    return `${countryName} 대표 여행지`;
}

function buildTripDestination({
    id,
    name,
    subtitle,
    scope,
    categoryId,
    imageUrl,
    keywords,
    countryCode = ''
}) {
    const destinationId = String(id || '').trim();
    const centerPoint = getTripDestinationCenterById(destinationId);
    const resolvedCountryCode = String(centerPoint?.countryCode || countryCode || '').trim().toUpperCase();

    return {
        id: destinationId,
        name: String(name || '').trim(),
        subtitle: String(subtitle || '').trim(),
        scope,
        categoryId: String(categoryId || '').trim(),
        imageUrl: imageUrl || defaultPopularTripDestinationImageUrl,
        keywords: uniqueStrings([name, ...(keywords || [])]),
        latitude: Number.isFinite(centerPoint?.latitude) ? centerPoint.latitude : null,
        longitude: Number.isFinite(centerPoint?.longitude) ? centerPoint.longitude : null,
        countryCode: resolvedCountryCode
    };
}

const destinationScopeOptions = [
    { id: 'international', label: '해외도시' },
    { id: 'domestic', label: '국내도시' }
];

const destinationCategoryOptions = {
    international: [
        { id: 'all', label: '전체' },
        { id: 'japan', label: '일본' },
        { id: 'southeast-asia', label: '동남아시아' },
        { id: 'china-greater', label: '중화권' },
        { id: 'europe', label: '유럽' },
        { id: 'americas-oceania', label: '미주/오세아니아' },
        { id: 'south-asia', label: '남아시아' },
        { id: 'middle-east-central-asia', label: '중동/중앙아시아' },
        { id: 'africa', label: '아프리카' }
    ],
    domestic: [
        { id: 'all', label: '전체' },
        { id: 'capital', label: '서울/수도권' },
        { id: 'gangwon', label: '강원' },
        { id: 'chungcheong', label: '충청' },
        { id: 'gyeongsang', label: '부산/경상' },
        { id: 'jeolla', label: '전라' },
        { id: 'jeju', label: '제주' }
    ]
};

const internationalCategoryByCountryCode = {
    JP: 'japan',
    CN: 'china-greater',
    HK: 'china-greater',
    TW: 'china-greater',
    MO: 'china-greater',
    TH: 'southeast-asia',
    SG: 'southeast-asia',
    VN: 'southeast-asia',
    MY: 'southeast-asia',
    PH: 'southeast-asia',
    ID: 'southeast-asia',
    KH: 'southeast-asia',
    LA: 'southeast-asia',
    MM: 'southeast-asia',
    BN: 'southeast-asia',
    IN: 'south-asia',
    LK: 'south-asia',
    NP: 'south-asia',
    BD: 'south-asia',
    MV: 'south-asia',
    PK: 'south-asia',
    AE: 'middle-east-central-asia',
    QA: 'middle-east-central-asia',
    SA: 'middle-east-central-asia',
    TR: 'middle-east-central-asia',
    IL: 'middle-east-central-asia',
    JO: 'middle-east-central-asia',
    BH: 'middle-east-central-asia',
    OM: 'middle-east-central-asia',
    KW: 'middle-east-central-asia',
    KZ: 'middle-east-central-asia',
    GE: 'middle-east-central-asia',
    AM: 'middle-east-central-asia',
    UZ: 'middle-east-central-asia',
    MN: 'middle-east-central-asia',
    EG: 'africa',
    ZA: 'africa',
    ET: 'africa',
    KE: 'africa',
    MA: 'africa',
    TN: 'africa',
    DZ: 'africa',
    MU: 'africa',
    SC: 'africa',
    NG: 'africa',
    GH: 'africa',
    TZ: 'africa',
    GB: 'europe',
    FR: 'europe',
    DE: 'europe',
    NL: 'europe',
    BE: 'europe',
    CH: 'europe',
    AT: 'europe',
    CZ: 'europe',
    HU: 'europe',
    PL: 'europe',
    PT: 'europe',
    ES: 'europe',
    IT: 'europe',
    GR: 'europe',
    IE: 'europe',
    DK: 'europe',
    SE: 'europe',
    NO: 'europe',
    FI: 'europe',
    IS: 'europe',
    RO: 'europe',
    BG: 'europe',
    RS: 'europe',
    AU: 'americas-oceania',
    NZ: 'americas-oceania',
    GU: 'americas-oceania',
    MP: 'americas-oceania',
    US: 'americas-oceania',
    CA: 'americas-oceania',
    MX: 'americas-oceania',
    BR: 'americas-oceania',
    AR: 'americas-oceania',
    CL: 'americas-oceania',
    CO: 'americas-oceania',
    PE: 'americas-oceania',
    PA: 'americas-oceania',
    PR: 'americas-oceania',
    DO: 'americas-oceania',
    JM: 'americas-oceania',
    AW: 'americas-oceania',
    SV: 'americas-oceania',
    GT: 'americas-oceania',
    CR: 'americas-oceania',
    EC: 'americas-oceania'
};

const internationalCountryPriority = [
    'JP',
    'VN',
    'TH',
    'TW',
    'HK',
    'SG',
    'PH',
    'MY',
    'ID',
    'MO',
    'GU',
    'MP',
    'CN',
    'US',
    'AU',
    'NZ',
    'FR',
    'IT',
    'GB',
    'ES',
    'DE',
    'CH',
    'AT',
    'CZ',
    'HU',
    'PT',
    'NL',
    'BE',
    'PL',
    'GR',
    'IE',
    'DK',
    'SE',
    'NO',
    'FI',
    'IS',
    'AE',
    'QA',
    'TR',
    'SA',
    'IL',
    'JO',
    'BH',
    'OM',
    'KW',
    'KZ',
    'GE',
    'AM',
    'UZ',
    'MN',
    'IN',
    'LK',
    'NP',
    'BD',
    'MV',
    'PK',
    'EG',
    'MA',
    'ZA',
    'KE',
    'TZ',
    'MU',
    'SC',
    'ET',
    'TN',
    'DZ',
    'NG',
    'GH',
    'CA',
    'MX',
    'BR',
    'AR',
    'CL',
    'CO',
    'PE',
    'PA',
    'PR',
    'DO',
    'JM',
    'AW',
    'SV',
    'GT',
    'CR',
    'EC'
];

const internationalCountryPriorityIndex = new Map(
    internationalCountryPriority.map((countryCode, index) => [countryCode, index])
);

const countryAliasesByCode = new Map();
for (const airport of airports) {
    if (!countryAliasesByCode.has(airport.country)) {
        countryAliasesByCode.set(airport.country, uniqueStrings(airport.countryAliases || []));
    }
}

function getCountryAliases(countryCode) {
    return countryAliasesByCode.get(String(countryCode || '').trim().toUpperCase()) || [];
}

function getDisplayCountryName(countryCode) {
    const aliases = getCountryAliases(countryCode);
    return aliases.find((alias) => isKoreanText(alias)) || aliases[0] || String(countryCode || '').trim().toUpperCase();
}

function getInternationalCategoryId(countryCode) {
    return internationalCategoryByCountryCode[String(countryCode || '').trim().toUpperCase()] || 'americas-oceania';
}

function buildManualInternationalDestination([
    id,
    name,
    countryCode,
    highlights = [],
    keywords = [],
    categoryId
]) {
    const displayCountryName = getDisplayCountryName(countryCode);
    const countryAliases = getCountryAliases(countryCode);

    return buildTripDestination({
        id,
        name,
        subtitle: buildSubtitle(name, highlights, buildCountryFallbackText(name, displayCountryName)),
        scope: 'international',
        categoryId: categoryId || getInternationalCategoryId(countryCode),
        imageUrl: createImageUrl(id),
        countryCode,
        keywords: [
            displayCountryName,
            ...countryAliases,
            ...keywords
        ]
    });
}

function buildManualDomesticDestination([
    id,
    name,
    categoryId,
    highlights = [],
    keywords = []
]) {
    return buildTripDestination({
        id,
        name,
        subtitle: buildSubtitle(name, highlights, `${name} 국내 여행지`),
        scope: 'domestic',
        categoryId,
        imageUrl: createImageUrl(id),
        countryCode: 'KR',
        keywords: ['한국', '대한민국', ...keywords]
    });
}

const manualInternationalDestinationEntries = [
    ['tokyo', '도쿄', 'JP', ['하코네', '요코하마', '가마쿠라'], ['tokyo', '시부야', '긴자']],
    ['osaka', '오사카', 'JP', ['교토', '고베', '나라'], ['osaka', '난바', '우메다']],
    ['fukuoka', '후쿠오카', 'JP', ['유후인', '벳푸', '기타큐슈'], ['fukuoka', '하카타', '텐진']],
    ['sapporo', '삿포로', 'JP', ['오타루', '비에이', '조잔케이'], ['sapporo', '홋카이도']],
    ['okinawa', '오키나와', 'JP', ['나하', '차탄', '온나손'], ['okinawa', 'naha', '류큐']],
    ['kyoto', '교토', 'JP', ['아라시야마', '우지', '오쓰'], ['kyoto', '기온']],
    ['yokohama', '요코하마', 'JP', ['미나토미라이', '차이나타운', '가마쿠라'], ['yokohama']],
    ['hakone', '하코네', 'JP', ['고라', '아시노호', '오다와라'], ['hakone', '온천']],
    ['kobe', '고베', 'JP', ['산노미야', '아리마온천', '하버랜드'], ['kobe']],
    ['nara', '나라', 'JP', ['도다이지', '사슴공원', '이카루가'], ['nara']],
    ['yufuin', '유후인', 'JP', ['긴린코', '유노츠보거리', '벳푸'], ['yufuin']],
    ['beppu', '벳푸', 'JP', ['지옥온천', '유후인', '오이타'], ['beppu']],
    ['taipei', '타이베이', 'TW', ['예스진지', '단수이', '지우펀'], ['taipei', 'taiwan', '시먼딩']],
    ['hongkong', '홍콩', 'HK', ['침사추이', '몽콕', '디즈니랜드'], ['hong kong', '중화권']],
    ['bangkok', '방콕', 'TH', ['아유타야', '파타야', '후아힌'], ['bangkok', 'thailand']],
    ['danang', '다낭', 'VN', ['호이안', '바나힐', '후에'], ['danang', 'da nang']],
    ['nhatrang', '나트랑', 'VN', ['혼뗌', '깜란', '담시장'], ['nha trang', '나짱']],
    ['singapore', '싱가포르', 'SG', ['마리나베이', '센토사', '클락키'], ['singapore']],
    ['hanoi', '하노이', 'VN', ['호안끼엠', '하롱베이 연계', '서호'], ['hanoi']],
    ['hochiminh', '호찌민시', 'VN', ['벤탄시장', '동코이', '꾸찌'], ['ho chi minh city', 'saigon', '호치민']],
    ['phuket', '푸켓', 'TH', ['빠통', '카타', '피피섬'], ['phuket']],
    ['chiangmai', '치앙마이', 'TH', ['님만해민', '도이수텝', '올드시티'], ['chiang mai']],
    ['krabi', '끄라비', 'TH', ['아오낭', '라일레이', '홍섬'], ['krabi']],
    ['pattaya', '파타야', 'TH', ['워킹스트리트', '산호섬', '좀티엔'], ['pattaya']],
    ['ayutthaya', '아유타야', 'TH', ['유적공원', '방빠인', '방콕 근교'], ['ayutthaya']],
    ['hoian', '호이안', 'VN', ['올드타운', '안방비치', '다낭 근교'], ['hoi an']],
    ['phuquoc', '푸꾸옥', 'VN', ['사오비치', '선셋타운', '빈원더스'], ['phu quoc']],
    ['macau', '마카오', 'MO', ['세나도광장', '코타이', '타이파'], ['macao', 'macau']],
    ['cebu', '세부', 'PH', ['막탄', '모알보알', '보홀 연계'], ['cebu']],
    ['bohol', '보홀', 'PH', ['초콜릿힐', '알로나비치', '타르시어'], ['bohol']],
    ['boracay', '보라카이', 'PH', ['화이트비치', '스테이션', '호핑투어'], ['boracay']],
    ['manila', '마닐라', 'PH', ['인트라무로스', 'BGC', '마카티'], ['manila']],
    ['kualalumpur', '쿠알라룸푸르', 'MY', ['페트로나스', '부킷빈탕', '바투동굴'], ['kuala lumpur']],
    ['kotakinabalu', '코타키나발루', 'MY', ['탄중아루', '마누칸섬', '반딧불'], ['kota kinabalu']],
    ['penang', '페낭', 'MY', ['조지타운', '스트리트아트', '바투페링기'], ['penang']],
    ['langkawi', '랑카위', 'MY', ['체낭비치', '스카이브리지', '맹그로브'], ['langkawi']],
    ['bali', '발리', 'ID', ['스미냑', '우붓', '울루와뚜'], ['bali']],
    ['ubud', '우붓', 'ID', ['뜨갈랄랑', '몽키포레스트', '발리 중부'], ['ubud']],
    ['jakarta', '자카르타', 'ID', ['PIK', '코타투아', '자바 관문'], ['jakarta']],
    ['lombok', '롬복', 'ID', ['쿠타롬복', '길리섬', '린자니'], ['lombok']],
    ['labuanbajo', '라부안바조', 'ID', ['코모도', '파다르섬', '핑크비치'], ['labuan bajo']],
    ['siemreap', '씨엠립', 'KH', ['앙코르와트', '펍스트리트', '톤레삽'], ['siem reap']],
    ['luangprabang', '루앙프라방', 'LA', ['꽝시폭포', '푸시산', '야시장'], ['luang prabang']],
    ['vientiane', '비엔티안', 'LA', ['빠뚜사이', '탓루앙', '메콩변'], ['vientiane']],
    ['dubai', '두바이', 'AE', ['다운타운', '마리나', '사막투어'], ['dubai', 'uae']],
    ['istanbul', '이스탄불', 'TR', ['술탄아흐메트', '갈라타', '보스포루스'], ['istanbul']],
    ['paris', '파리', 'FR', ['베르사유', '지베르니', '몽생미셸'], ['paris', 'france']],
    ['rome', '로마', 'IT', ['피렌체', '나폴리', '바티칸'], ['rome', 'italy']],
    ['london', '런던', 'GB', ['소호', '캠든', '윈저'], ['london', 'uk']],
    ['barcelona', '바르셀로나', 'ES', ['고딕지구', '바르셀로네타', '구엘공원'], ['barcelona']],
    ['madrid', '마드리드', 'ES', ['솔', '프라도', '톨레도 연계'], ['madrid']],
    ['prague', '프라하', 'CZ', ['카를교', '프라하성', '말라스트라나'], ['prague']],
    ['vienna', '빈', 'AT', ['쇤브룬', '벨베데레', '카페'], ['vienna']],
    ['budapest', '부다페스트', 'HU', ['국회의사당', '온천', '다뉴브'], ['budapest']],
    ['amsterdam', '암스테르담', 'NL', ['운하', '뮤지엄플레인', '잔세스칸스'], ['amsterdam']],
    ['zurich', '취리히', 'CH', ['반호프슈트라세', '루체른 연계', '취리히호'], ['zurich']],
    ['lisbon', '리스본', 'PT', ['알파마', '벨렝', '신트라 연계'], ['lisbon']],
    ['athens', '아테네', 'GR', ['아크로폴리스', '플라카', '에게해 관문'], ['athens']],
    ['berlin', '베를린', 'DE', ['박물관섬', '미테', '이스트사이드'], ['berlin']],
    ['venice', '베네치아', 'IT', ['산마르코', '부라노', '무라노'], ['venice']],
    ['guam', '괌', 'GU', ['투몬', '이파오', '사랑의절벽'], ['guam']],
    ['saipan', '사이판', 'MP', ['마나가하', '그로토', '마이크로비치'], ['saipan']],
    ['honolulu', '호놀룰루', 'US', ['와이키키', '오아후', '노스쇼어'], ['hawaii', 'honolulu']],
    ['newyork', '뉴욕', 'US', ['맨해튼', '브루클린', '브로드웨이'], ['new york', 'nyc']],
    ['losangeles', '로스앤젤레스', 'US', ['할리우드', '산타모니카', '그리피스'], ['los angeles', 'la']],
    ['sanfrancisco', '샌프란시스코', 'US', ['금문교', '피셔맨즈워프', '소살리토'], ['san francisco']],
    ['lasvegas', '라스베이거스', 'US', ['스트립', '쇼', '그랜드캐니언'], ['las vegas']],
    ['orlando', '올랜도', 'US', ['디즈니월드', '유니버설', '리조트'], ['orlando']],
    ['toronto', '토론토', 'CA', ['CN타워', '디스틸러리', '나이아가라 연계'], ['toronto']],
    ['vancouver', '밴쿠버', 'CA', ['스탠리파크', '개스타운', '휘슬러 연계'], ['vancouver']],
    ['mexicocity', '멕시코시티', 'MX', ['소칼로', '코요아칸', '차풀테펙'], ['mexico city']],
    ['cancun', '칸쿤', 'MX', ['호텔존', '세노테', '치첸이차'], ['cancun']],
    ['riodejaneiro', '리우데자네이루', 'BR', ['코파카바나', '예수상', '이파네마'], ['rio de janeiro']],
    ['sydney', '시드니', 'AU', ['오페라하우스', '본다이', '달링하버'], ['sydney']],
    ['melbourne', '멜버른', 'AU', ['호시어레인', '카페', '그레이트오션로드'], ['melbourne']],
    ['brisbane', '브리즈번', 'AU', ['사우스뱅크', '강변', '골드코스트 연계'], ['brisbane']],
    ['perth', '퍼스', 'AU', ['킹스파크', '프리맨틀', '로트네스트'], ['perth']],
    ['auckland', '오클랜드', 'NZ', ['와이헤케', '하버', '북섬 관문'], ['auckland']],
    ['queenstown', '퀸스타운', 'NZ', ['와카티푸', '밀포드사운드', '와이너리'], ['queenstown']],
    ['cairo', '카이로', 'EG', ['피라미드', '칸엘칼릴리', '나일강'], ['cairo']],
    ['capetown', '케이프타운', 'ZA', ['테이블마운틴', '워터프론트', '희망봉'], ['cape town']],
    ['marrakech', '마라케시', 'MA', ['제마엘프나', '마조렐', '사하라 투어'], ['marrakech']],
    ['mauritius', '모리셔스', 'MU', ['그랑베이', '르모른', '샤마렐'], ['mauritius']],
    ['seychelles', '세이셸', 'SC', ['보발롱', '라디그', '프랄린'], ['seychelles']]
];

const manualDomesticDestinationEntries = [
    ['jeju', '제주', 'jeju', ['애월', '협재', '성산'], ['jeju', '제주도']],
    ['busan', '부산', 'gyeongsang', ['해운대', '광안리', '영도'], ['busan']],
    ['seoul', '서울', 'capital', ['성수', '익선동', '한남'], ['seoul', '명동']],
    ['gangneung', '강릉', 'gangwon', ['안목', '경포', '주문진'], ['gangneung']],
    ['sokcho', '속초', 'gangwon', ['영랑호', '설악산', '고성'], ['sokcho']],
    ['gyeongju', '경주', 'gyeongsang', ['황리단길', '보문단지', '불국사'], ['gyeongju']],
    ['yeosu', '여수', 'jeolla', ['돌산', '오동도', '여수밤바다'], ['yeosu']],
    ['jeonju', '전주', 'jeolla', ['한옥마을', '남부시장', '객리단길'], ['jeonju']],
    ['suncheon', '순천', 'jeolla', ['순천만국가정원', '와온해변', '선암사'], ['suncheon']],
    ['yangyang', '양양', 'gangwon', ['서피비치', '죽도해변', '낙산사'], ['yangyang']],
    ['danyang', '단양', 'chungcheong', ['도담삼봉', '만천하스카이워크', '구인사'], ['danyang']],
    ['tongyeong', '통영', 'gyeongsang', ['동피랑', '미륵산', '소매물도'], ['tongyeong']],
    ['geoje', '거제', 'gyeongsang', ['바람의언덕', '구조라', '외도'], ['geoje']],
    ['incheon', '인천', 'capital', ['송도', '차이나타운', '월미도'], ['incheon']],
    ['chuncheon', '춘천', 'gangwon', ['소양강', '레고랜드', '구봉산'], ['chuncheon']],
    ['gapyeong', '가평', 'capital', ['남이섬', '자라섬', '아침고요수목원'], ['gapyeong']],
    ['yangpyeong', '양평', 'capital', ['두물머리', '서종', '용문산'], ['yangpyeong']],
    ['daegu', '대구', 'gyeongsang', ['동성로', '앞산', '수성못'], ['daegu']],
    ['ulleungdo', '울릉도', 'gyeongsang', ['도동', '나리분지', '행남해안산책로'], ['울릉']],
    ['pohang', '포항', 'gyeongsang', ['영일대', '호미곶', '구룡포'], ['pohang']],
    ['andong', '안동', 'gyeongsang', ['하회마을', '월영교', '도산서원'], ['andong']],
    ['namhae', '남해', 'gyeongsang', ['독일마을', '다랭이마을', '상주은모래비치'], ['namhae']],
    ['ulsan', '울산', 'gyeongsang', ['간절곶', '대왕암', '태화강'], ['ulsan']],
    ['suwon', '수원', 'capital', ['광교', '화성행궁', '행궁동'], ['suwon']],
    ['paju', '파주', 'capital', ['헤이리', '출판도시', '임진각'], ['paju']],
    ['yongin', '용인', 'capital', ['에버랜드', '한국민속촌', '기흥'], ['yongin']],
    ['goyang', '고양', 'capital', ['일산호수공원', '킨텍스', '행주산성'], ['goyang']],
    ['ganghwa', '강화', 'capital', ['동막해변', '석모도', '전등사'], ['ganghwa']],
    ['pocheon', '포천', 'capital', ['허브아일랜드', '산정호수', '아트밸리'], ['pocheon']],
    ['wonju', '원주', 'gangwon', ['뮤지엄산', '행구동', '간현'], ['wonju']],
    ['donghae', '동해', 'gangwon', ['묵호', '망상', '추암'], ['donghae']],
    ['samcheok', '삼척', 'gangwon', ['장호항', '환선굴', '맹방'], ['samcheok']],
    ['pyeongchang', '평창', 'gangwon', ['대관령', '봉평', '월정사'], ['pyeongchang']],
    ['jeongseon', '정선', 'gangwon', ['정선아리랑시장', '하이원', '화암동굴'], ['jeongseon']],
    ['hongcheon', '홍천', 'gangwon', ['비발디파크', '오션월드', '팔봉산'], ['hongcheon']],
    ['inje', '인제', 'gangwon', ['백담사', '자작나무숲', '방태산'], ['inje']],
    ['goseong', '고성', 'gangwon', ['아야진', '화진포', '통일전망대'], ['goseong']],
    ['taebaek', '태백', 'gangwon', ['매봉산', '검룡소', '황지연못'], ['taebaek']],
    ['daejeon', '대전', 'chungcheong', ['성심당', '한밭수목원', '유성'], ['daejeon']],
    ['sejong', '세종', 'chungcheong', ['호수공원', '국립세종수목원', '조치원'], ['sejong']],
    ['cheongju', '청주', 'chungcheong', ['상당산성', '성안길', '청남대'], ['cheongju']],
    ['chungju', '충주', 'chungcheong', ['중앙탑', '탄금대', '수안보'], ['chungju']],
    ['jecheon', '제천', 'chungcheong', ['의림지', '청풍호', '케이블카'], ['jecheon']],
    ['boryeong', '보령', 'chungcheong', ['대천해수욕장', '무창포', '오서산'], ['boryeong']],
    ['taean', '태안', 'chungcheong', ['안면도', '꽃지해수욕장', '천리포수목원'], ['taean']],
    ['gongju', '공주', 'chungcheong', ['공산성', '무령왕릉', '제민천'], ['gongju']],
    ['buyeo', '부여', 'chungcheong', ['궁남지', '백제문화단지', '부소산성'], ['buyeo']],
    ['cheonan', '천안', 'chungcheong', ['독립기념관', '천호지', '병천'], ['cheonan']],
    ['asan', '아산', 'chungcheong', ['온양온천', '외암민속마을', '신정호'], ['asan']],
    ['seosan', '서산', 'chungcheong', ['해미읍성', '간월암', '삼길포'], ['seosan']],
    ['gwangju', '광주', 'jeolla', ['양림동', '무등산', '충장로'], ['gwangju']],
    ['gunsan', '군산', 'jeolla', ['경암동', '초원사진관', '선유도'], ['gunsan']],
    ['mokpo', '목포', 'jeolla', ['유달산', '해상케이블카', '북항'], ['mokpo']],
    ['damyang', '담양', 'jeolla', ['메타세쿼이아길', '죽녹원', '관방제림'], ['damyang']],
    ['namwon', '남원', 'jeolla', ['광한루원', '춘향테마파크', '지리산'], ['namwon']],
    ['wanju', '완주', 'jeolla', ['아원고택', '오성한옥마을', '삼례문화예술촌'], ['wanju']],
    ['gochang', '고창', 'jeolla', ['청보리밭', '선운사', '읍성'], ['gochang']],
    ['muju', '무주', 'jeolla', ['덕유산', '무주리조트', '반디랜드'], ['muju']],
    ['naju', '나주', 'jeolla', ['영산포', '빛가람호수공원', '금성관'], ['naju']],
    ['haenam', '해남', 'jeolla', ['땅끝마을', '대흥사', '달마산'], ['haenam']],
    ['boseong', '보성', 'jeolla', ['녹차밭', '율포해변', '대한다원'], ['boseong']],
    ['sinan', '신안', 'jeolla', ['퍼플섬', '천사대교', '자은도'], ['sinan']],
    ['changwon', '창원', 'gyeongsang', ['진해', '마산어시장', '주남저수지'], ['changwon']],
    ['gimhae', '김해', 'gyeongsang', ['가야테마파크', '연지공원', '수로왕릉'], ['gimhae']],
    ['jinju', '진주', 'gyeongsang', ['진주성', '남강', '촉석루'], ['jinju']],
    ['mungyeong', '문경', 'gyeongsang', ['문경새재', '에코월드', '진남교반'], ['mungyeong']],
    ['yeongju', '영주', 'gyeongsang', ['부석사', '소수서원', '무섬마을'], ['yeongju']],
    ['sacheon', '사천', 'gyeongsang', ['삼천포', '케이블카', '비토섬'], ['sacheon']],
    ['seogwipo', '서귀포', 'jeju', ['중문', '쇠소깍', '천지연'], ['seogwipo']],
    ['aewol', '애월', 'jeju', ['한담해변', '곽지', '새별오름'], ['aewol']],
    ['seongsan', '성산', 'jeju', ['성산일출봉', '섭지코지', '광치기해변'], ['seongsan']],
    ['hyeopjae', '협재', 'jeju', ['협재해수욕장', '금능해변', '비양도'], ['hyeopjae']],
    ['udo', '우도', 'jeju', ['서빈백사', '검멀레', '우도봉'], ['udo']],
    ['pyoseon', '표선', 'jeju', ['표선해수욕장', '제주민속촌', '따라비오름'], ['pyoseon']],
    ['hallim', '한림', 'jeju', ['한림공원', '금능', '협재'], ['hallim']]
];

const manualInternationalDestinationKeySet = new Set(
    manualInternationalDestinationEntries.map(([, name, countryCode]) => (
        buildDestinationKey('international', name, countryCode)
    ))
);
const curatedPopularTripDestinationImageIds = uniqueStrings([
    ...manualInternationalDestinationEntries.map(([id]) => id),
    ...manualDomesticDestinationEntries.map(([id]) => id)
]);

const curatedInternationalDestinations = manualInternationalDestinationEntries.map(buildManualInternationalDestination);
const curatedDomesticDestinations = manualDomesticDestinationEntries.map(buildManualDomesticDestination);

const internationalAirportGroupMap = new Map();
for (const [index, airport] of airports.entries()) {
    if (airport.country === 'KR') {
        continue;
    }

    const key = buildDestinationKey('international', airport.city, airport.country);
    const categoryId = getInternationalCategoryId(airport.country);

    if (!internationalAirportGroupMap.has(key)) {
        internationalAirportGroupMap.set(key, {
            key,
            city: airport.city,
            countryCode: airport.country,
            categoryId,
            orderIndex: index,
            primaryCode: airport.code,
            codes: [],
            aliases: [],
            countryAliases: []
        });
    }

    const group = internationalAirportGroupMap.get(key);
    group.codes.push(airport.code);
    group.aliases.push(...(airport.aliases || []));
    group.countryAliases.push(...(airport.countryAliases || []));
}

const expandedInternationalDestinations = Array.from(internationalAirportGroupMap.values())
    .filter((group) => !manualInternationalDestinationKeySet.has(group.key))
    .sort((left, right) => {
        const leftCountryPriority = internationalCountryPriorityIndex.get(left.countryCode) ?? Number.MAX_SAFE_INTEGER;
        const rightCountryPriority = internationalCountryPriorityIndex.get(right.countryCode) ?? Number.MAX_SAFE_INTEGER;

        if (leftCountryPriority !== rightCountryPriority) {
            return leftCountryPriority - rightCountryPriority;
        }

        return left.orderIndex - right.orderIndex;
    })
    .map((group) => {
        const displayCountryName = (
            uniqueStrings(group.countryAliases).find((alias) => isKoreanText(alias))
            || uniqueStrings(group.countryAliases)[0]
            || getDisplayCountryName(group.countryCode)
        );
        const destinationId = String(group.primaryCode || '').trim().toLowerCase();

        return buildTripDestination({
            id: destinationId,
            name: group.city,
            subtitle: buildSubtitle(
                group.city,
                [displayCountryName],
                buildCountryFallbackText(group.city, displayCountryName)
            ),
            scope: 'international',
            categoryId: group.categoryId,
            imageUrl: createImageUrl(destinationId),
            countryCode: group.countryCode,
            keywords: [
                displayCountryName,
                ...group.codes,
                ...group.aliases,
                ...group.countryAliases
            ]
        });
    });

const popularTripDestinations = [
    ...curatedInternationalDestinations,
    ...expandedInternationalDestinations,
    ...curatedDomesticDestinations
];

function getPopularTripDestinationById(destinationId) {
    const normalizedId = String(destinationId || '').trim();
    if (!normalizedId) {
        return null;
    }

    return popularTripDestinations.find((destination) => destination.id === normalizedId) || null;
}

export {
    destinationScopeOptions,
    destinationCategoryOptions,
    defaultPopularTripDestinationImageUrl,
    popularTripDestinations,
    curatedPopularTripDestinationImageIds,
    getPopularTripDestinationById
};
