# CONTRIBUTING.md

## 기여 가이드

PLIN 프로젝트에 기여해주셔서 감사합니다! 🎉

### 개발 환경 설정

1. **저장소 포크 및 클론**
   ```bash
   git clone https://github.com/your-username/plin.git
   cd plin
   ```

2. **의존성 설치**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

3. **환경 변수 설정**
   ```bash
   cd functions
   cp .env.example .env
   # .env 파일을 열어 실제 API 키로 변경
   ```

4. **Firebase Emulator 실행**
   ```bash
   npm run dev
   ```

### 코드 스타일

이 프로젝트는 다음 도구들을 사용합니다:

- **ESLint**: JavaScript 코드 품질 검사
- **Prettier**: 코드 포맷팅
- **EditorConfig**: 일관된 코드 스타일

코드를 커밋하기 전에 다음을 확인하세요:

```bash
# (향후) ESLint 체크
npx eslint public/js/**/*.js

# (향후) Prettier 포맷팅
npx prettier --write public/js/**/*.js
```

### 커밋 컨벤션

[Conventional Commits](https://www.conventionalcommits.org/) 스타일을 따릅니다:

- `feat:` - 새로운 기능
- `fix:` - 버그 수정
- `docs:` - 문서 변경
- `style:` - 코드 포맷팅 (기능 변경 없음)
- `refactor:` - 코드 리팩토링
- `perf:` - 성능 개선
- `test:` - 테스트 추가/수정
- `chore:` - 빌드 설정, 도구 변경 등

예시:
```
feat: add weather forecast for next 7 days
fix: resolve timezone issue in trip dates
docs: update README with new API endpoints
```

### Pull Request 프로세스

1. **브랜치 생성**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **변경 사항 커밋**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. **포크된 저장소에 푸시**
   ```bash
   git push origin feat/your-feature-name
   ```

4. **Pull Request 생성**
   - 명확한 제목과 설명 작성
   - 관련 이슈 번호 언급 (예: `Closes #123`)
   - 스크린샷 첨부 (UI 변경의 경우)

### 개발 가이드라인

#### JavaScript

- ES6+ 모듈 시스템 사용 (`import/export`)
- `logger` 유틸리티 사용 (프로덕션 환경 고려)
- `const`와 `let` 사용 (`var` 지양)
- 함수는 화살표 함수 또는 function 선언 사용

#### CSS

- Tailwind CSS 유틸리티 클래스 우선 사용
- 커스텀 색상은 `tailwind.config.js`에 정의
- 다크모드 지원 (`dark:` prefix 사용)

#### 성능

- 이미지는 lazy loading 사용
- 큰 파일은 동적 import 고려
- Firebase 쿼리 최적화 (필요한 필드만 가져오기)

#### 보안

- API 키는 절대 커밋하지 않기
- Firebase 보안 규칙 업데이트 시 신중하게 검토
- 사용자 입력은 항상 검증

### 테스트

(향후 추가 예정)

현재는 수동 테스트를 권장합니다:

1. Firebase Emulator에서 로컬 테스트
2. 다양한 브라우저에서 확인 (Chrome, Firefox, Safari)
3. 모바일 디바이스에서 테스트
4. 다크모드/라이트모드 전환 테스트

### 이슈 보고

버그를 발견하셨나요? 이슈를 등록해주세요:

- **명확한 제목**: "로그인 후 화면이 멈춤"
- **재현 단계**: 버그를 재현하는 명확한 단계
- **예상 동작**: 원래 어떻게 동작해야 하는지
- **실제 동작**: 실제로 어떻게 동작하는지
- **환경 정보**: 브라우저, OS, 기기 정보
- **스크린샷**: 가능하면 첨부

### 질문

질문이 있으시면 다음 방법으로 연락해주세요:

- GitHub Issues
- (이메일 주소 또는 커뮤니티 링크)

### 라이선스

이 프로젝트에 기여하면 MIT 라이선스를 동의한 것으로 간주됩니다.

---

**감사합니다!** 여러분의 기여가 PLIN을 더 좋게 만듭니다. 🙏
