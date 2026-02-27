# Tistory Auto Posting System

문서 기반으로 티스토리 글을 자동 입력하는 Playwright + Chrome CDP 기반 자동화 시스템입니다.

---

# 📁 프로젝트 구조

```
tistory-auto/
│
├─ post_tistory_from_doc.js
├─ save_auth_kakao.js
├─ post.txt
├─ auth_kakao.json        ← 최초 로그인 후 생성
├─ package.json
└─ node_modules/
```

---

# 1️⃣ 사전 준비 (antigravity 내부)

## 1. Node / npm 확인

```
node -v
npm -v
```

## 2. Playwright 설치

프로젝트 폴더에서:

```
npm init -y
npm i playwright
```

---

# 2️⃣ Chrome 원격 디버깅 설정 (바탕화면 바로가기 수정)

이 시스템은 원격 디버깅 모드로 실행된 Chrome에 attach하는 방식입니다.

## 바탕화면 Chrome 아이콘 → 우클릭 → 속성 → 대상(Target) 수정

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-playwright-profile"
```

### 옵션 설명

- `--remote-debugging-port=9222` : Playwright가 attach할 포트
- `--user-data-dir` : 로그인 세션 유지용 전용 프로필

⚠️ 반드시 이 바로가기 아이콘으로 Chrome을 실행하세요.

---

# 3️⃣ 최초 1회 로그인 (필수)

## 1. Chrome 실행
수정된 바로가기 아이콘으로 실행

## 2. 인증 스크립트 실행

```
node save_auth_kakao.js
```

## 3. 카카오 로그인 수동 진행

로그인이 완료되면:

```
auth_kakao.json
```

파일이 생성됩니다.

이 파일이 인증 세션 파일입니다.

로그아웃/쿠키 삭제 시 다시 실행해야 합니다.

---

# 4️⃣ post.txt 작성 규칙

```
[제목: 글 제목]
[카테고리: ESP32]
[태그: #BLE, #WiFi, #자동화]

여기부터 본문 내용입니다.
줄바꿈은 그대로 유지됩니다.
```

### 메타 정보

| 항목 | 필수 여부 |
|------|-----------|
| 제목 | 선택 |
| 카테고리 | 선택 |
| 태그 | 선택 |

카테고리가 존재하지 않으면 자동으로 "카테고리 없음"을 선택합니다.

---

# 5️⃣ 포스팅 실행 방법

## 1. Chrome 실행 (원격 디버깅 포함)

## 2. 필요 시 로그인 재인증

```
node save_auth_kakao.js
```

## 3. 자동 포스팅 실행

```
node post_tistory_from_doc.js ./post.txt
```

---

# 6️⃣ 자동 동작 흐름

실행 시 다음이 자동 수행됩니다:

1. Chrome(9222)에 attach
2. 글쓰기 페이지 이동
3. 제목 입력
4. TinyMCE 본문 삽입
5. 카테고리 선택 (없으면 "카테고리 없음")
6. 태그 입력 (Enter로 확정)
7. 하단 완료/미리보기 바 표시 (클릭은 하지 않음)

---

# 7️⃣ 운영 원칙

✔ `auth_kakao.json` 삭제 금지
✔ `user-data-dir` 경로 변경 금지
✔ Chrome은 항상 수정된 바로가기 사용
✔ 로그인 문제 발생 시 `save_auth_kakao.js` 재실행

---

# 🚀 확장 가능 영역

- 자동 발행
- 예약 발행 자동화
- 발행 URL 자동 수집
- SNS 자동 배포 연동
- Git 기반 문서 관리 후 자동 업로드

---

이 시스템은 로컬 기반 티스토리 자동 CMS 구조입니다.
확장 설계가 필요하면 언제든지 이어서 진행할 수 있습니다.

