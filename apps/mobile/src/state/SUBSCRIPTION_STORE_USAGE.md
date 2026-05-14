# Subscription Store 사용 가이드

## 개요

Zustand 기반 구독 상태 저장소입니다. 사용자의 프리미엄 구독 상태를 관리하며, 백엔드와 자동 동기화됩니다.

## 설정

### 1. 앱 시작 시 초기화

루트 네비게이션 또는 앱 시작 지점에서 `useSubscriptionInit` 훅을 호출합니다:

```tsx
import { useSubscriptionInit } from '@/hooks/useSubscription';

function RootNavigator() {
  useSubscriptionInit({ enabled: true });

  return (
    // 네비게이션 구조
  );
}
```

## 사용법

### 1. 구독 상태 읽기

```tsx
import { useSubscription } from '@/hooks/useSubscription';

function SubscriptionStatus() {
  const { isPremium, currentPlan, expiryDate, isLoading, error } = useSubscription();

  if (isLoading) return <Text>로딩 중...</Text>;
  if (error) return <Text>오류: {error}</Text>;

  return (
    <View>
      <Text>프리미엄: {isPremium ? '활성' : '비활성'}</Text>
      {currentPlan && <Text>요금제: {currentPlan}</Text>}
      {expiryDate && <Text>만료: {expiryDate.toLocaleDateString('ko-KR')}</Text>}
    </View>
  );
}
```

### 2. 액션 호출

```tsx
import { useSubscriptionActions } from '@/hooks/useSubscription';

function SubscriptionManager() {
  const { setPremium, syncFromBackend, reset } = useSubscriptionActions();

  return (
    <View>
      <Button
        title="구독 정보 새로고침"
        onPress={() => syncFromBackend()}
      />
      <Button
        title="프리미엠 활성화"
        onPress={() => setPremium(true, 'monthly', new Date('2025-12-31'))}
      />
      <Button
        title="초기화"
        onPress={() => reset()}
      />
    </View>
  );
}
```

### 3. 직접 저장소 접근 (선택사항)

```tsx
import { useSubscriptionStore } from '@/state/subscription-store';

const isPremium = useSubscriptionStore((state) => state.isPremium);
```

## 상태 구조

```typescript
{
  isPremium: boolean;           // 현재 구독 활성 여부 (expiryDate > now)
  currentPlan: 'monthly' | 'annual' | null;  // 현재 요금제
  expiryDate: Date | null;      // 만료 날짜
  isLoading: boolean;           // 동기화 진행 중
  error: string | null;         // 에러 메시지
}
```

## 동기화 동작

### 자동 동기화
- **앱 시작 시**: `useSubscriptionInit` 호출 → `syncFromBackend()` 실행
- **포그라운드 복귀 시**: `useForegroundResumeRefresh`가 15초 throttle로 `syncFromBackend()` 호출

### 백엔드 응답 포맷
```json
{
  "isPremium": boolean,
  "currentPlan": "monthly" | "annual" | null,
  "expiryDate": "2025-12-31T00:00:00Z" | null
}
```

### 에러 처리
- **네트워크 오류**: 로컬 상태 유지, `error` 초기화
- **기타 오류**: 에러 메시지 저장

## 주의사항

1. **expiryDate 유효성**: `isPremium`은 자동으로 `expiryDate > now` 기준으로 계산됩니다.
2. **초기값**: 모든 상태는 초기에 로드 상태입니다. 필요시 `isLoading` 확인 후 사용.
3. **웹훅 연동**: 서버 구독 상태 변경 시 웹훅으로 업데이트되며, 클라이언트는 정기적으로 동기화합니다.
4. **Throttle**: 포그라운드 복귀 동기화는 15초 throttle로 과도한 API 호출 방지.

## 타입 정의

```typescript
type PlanType = 'monthly' | 'annual';

type SubscriptionState = {
  isPremium: boolean;
  currentPlan: PlanType | null;
  expiryDate: Date | null;
  isLoading: boolean;
  error: string | null;
};

type SubscriptionActions = {
  setPremium(isPremium, currentPlan, expiryDate): void;
  setLoading(isLoading): void;
  setError(error): void;
  reset(): void;
  syncFromBackend(): Promise<void>;
};
```
