/**
 * 여행 데이터 기본값 (canonical source)
 * Phase 1.5부터 core/state 기준 경로를 source of truth로 사용
 */

export default {
    meta: {
        userImage: "/images/basic-profile.png",
        dayCount: "2박 3일",
        title: "아라시야마 탐방",
        subInfo: "교토 봄 여행 • 2024년 4월 12일",
        mapImage: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop",
        defaultMapImage: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop",
        lat: 35.0116,
        lng: 135.6688,
        weather: { temp: "22°C", minTemp: "15°C", maxTemp: "25°C", desc: "맑음, 쾌청" },
        timezone: "Asia/Tokyo",
        budget: "₩60,000",
        note: "대나무 숲은 사람이 붐비기 전 이른 아침에 사진 찍기 좋음.",
        memoryLocked: false,
        viewMode: 'planner'
    },
    shoppingList: [],
    checklist: [],
    days: [
        {
            date: "2024-04-12",
            timeline: [
                {
                    time: "오전 08:00 - 09:00",
                    title: "호텔 조식",
                    location: "교토 센추리 호텔",
                    icon: "restaurant",
                    tag: "포함됨",
                    tagColor: "green",
                    image: null
                },
                {
                    time: "오전 09:30",
                    title: "대나무 숲으로 이동 (기차)",
                    location: "산인선 • 3번 승강장 • JR 패스 사용",
                    icon: "train",
                    tag: null,
                    isTransit: true,
                    image: null
                },
                {
                    time: "오전 10:30",
                    title: "대나무 숲 산책",
                    location: "필수 사진 명소",
                    icon: "directions_walk",
                    tag: null,
                    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&h=300&fit=crop"
                },
                {
                    time: "오후 01:00",
                    title: "점심 식사 (% 아라비카)",
                    location: "아라시야마 강변",
                    icon: "local_cafe",
                    tag: "약 1,500엔",
                    tagColor: "gray",
                    image: null
                }
            ]
        }
    ]
};
