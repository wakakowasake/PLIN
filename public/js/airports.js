// 국제공항 데이터
export const airports = [
    { code: 'ICN', name: '인천국제공항', city: '서울', country: 'KR' },
    { code: 'GMP', name: '김포국제공항', city: '서울', country: 'KR' },
    { code: 'PUS', name: '김해국제공항', city: '부산', country: 'KR' },
    { code: 'CJU', name: '제주국제공항', city: '제주', country: 'KR' },
    
    { code: 'NRT', name: '나리타국제공항', city: '도쿄', country: 'JP' },
    { code: 'HND', name: '하네다공항', city: '도쿄', country: 'JP' },
    { code: 'KIX', name: '간사이국제공항', city: '오사카', country: 'JP' },
    { code: 'NGO', name: '주부국제공항', city: '나고야', country: 'JP' },
    { code: 'FUK', name: '후쿠오카공항', city: '후쿠오카', country: 'JP' },
    { code: 'CTS', name: '신치토세공항', city: '삿포로', country: 'JP' },
    
    { code: 'PEK', name: '베이징 서우두 국제공항', city: '베이징', country: 'CN' },
    { code: 'PVG', name: '상하이 푸둥 국제공항', city: '상하이', country: 'CN' },
    { code: 'CAN', name: '광저우 바이윈 국제공항', city: '광저우', country: 'CN' },
    
    { code: 'BKK', name: '수완나품 국제공항', city: '방콕', country: 'TH' },
    { code: 'SIN', name: '싱가포르 창이 국제공항', city: '싱가포르', country: 'SG' },
    { code: 'HKG', name: '홍콩 국제공항', city: '홍콩', country: 'HK' },
    { code: 'TPE', name: '타오위안 국제공항', city: '타이베이', country: 'TW' },
    
    { code: 'LAX', name: '로스앤젤레스 국제공항', city: '로스앤젤레스', country: 'US' },
    { code: 'JFK', name: '존 F. 케네디 국제공항', city: '뉴욕', country: 'US' },
    { code: 'SFO', name: '샌프란시스코 국제공항', city: '샌프란시스코', country: 'US' },
    
    { code: 'LHR', name: '런던 히드로 공항', city: '런던', country: 'GB' },
    { code: 'CDG', name: '샤를 드 골 공항', city: '파리', country: 'FR' },
    { code: 'FRA', name: '프랑크푸르트 국제공항', city: '프랑크푸르트', country: 'DE' },
    
    { code: 'SYD', name: '시드니 킹스포드 스미스 국제공항', city: '시드니', country: 'AU' },
    { code: 'DXB', name: '두바이 국제공항', city: '두바이', country: 'AE' },
];

// 공항 검색 함수
export function searchAirports(query) {
    if (!query) return [];
    const q = query.toLowerCase();
    return airports.filter(airport => 
        airport.code.toLowerCase().includes(q) ||
        airport.name.toLowerCase().includes(q) ||
        airport.city.toLowerCase().includes(q)
    );
}

// 공항 코드로 찾기
export function getAirportByCode(code) {
    return airports.find(a => a.code.toUpperCase() === code.toUpperCase());
}

// 공항 포맷팅 (코드 | 이름)
export function formatAirport(airport) {
    if (typeof airport === 'string') {
        const found = getAirportByCode(airport);
        return found ? `${found.code} | ${found.name}` : airport;
    }
    return `${airport.code} | ${airport.name}`;
}
