# GitHub Actions 자동 배포 설정

GitHub Actions를 사용하여 `main` 브랜치에 푸시할 때 자동으로 Firebase에 배포되도록 설정했습니다.

## 설정 단계

### 1. Firebase 토큰 생성
```bash
firebase login:ci
```
이 명령어를 실행하면 브라우저에서 Google 로그인을 하고, Firebase 토큰을 얻을 수 있습니다.

### 2. GitHub Secrets 추가
1. 레포지토리의 Settings > Secrets and variables > Actions로 이동
2. "New repository secret" 버튼 클릭
3. 이름: `FIREBASE_TOKEN`
4. 값: 위에서 복사한 Firebase 토큰 붙여넣기
5. "Add secret" 클릭

### 3. 동작 확인
```bash
git push origin main
```
`main` 브랜치에 푸시하면 GitHub Actions가 자동으로:
1. 코드 체크아웃
2. Node.js 18 설정
3. Firebase CLI 설치
4. Firebase Hosting에 배포

## 배포 상태 확인
GitHub 레포지토리 > Actions 탭에서 배포 진행 상황을 확인할 수 있습니다.

## 문제 해결
- 배포 실패 시 Actions 탭에서 로그를 확인하세요
- Firebase 토큰이 만료된 경우 다시 생성하고 업데이트하세요
