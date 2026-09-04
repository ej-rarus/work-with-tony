# linkedin-post 플러그인 설계

작성일: 2026-09-04
상태: 설계 승인 대기
마켓플레이스: work-with-tony (레포 ej-rarus/work-with-tony, 초기 private)

## 1. 목적

Claude Code 대화 안에서 LinkedIn 개인 프로필 게시글을 작성하고, 사용자가 확정하면 LinkedIn 공식 API로 즉시 발행하는 스킬. 본인 사용을 우선하되, 공개 전환과 커뮤니티 마켓플레이스 등록이 가능한 플러그인 구조로 만든다.

## 2. 범위

포함
- 개인 프로필 텍스트 게시 (즉시 발행)
- 입력: 주제 한 줄 또는 자료 파일 경로
- 한국어 기본, `--en` 옵션 또는 요청 시 영어
- 스타일: 레포 내 기본 가이드 + 개인 참고 글·게시 이력 축적
- OAuth 로그인 스크립트, 발행 스크립트
- 최초 1회 설정 안내 (개발자 앱 생성, client 정보 입력)

제외 (이번 범위 아님)
- 이미지·문서 첨부, 캐러셀
- 예약 발행, 큐
- 회사 페이지 게시
- 게시글 수정·삭제, 성과 지표 조회
- 커뮤니티 마켓플레이스 신청 (public 전환 이후 별도 작업)

## 3. 레포 구조

```
work-with-tony/                          ej-rarus/work-with-tony
├── .claude-plugin/
│   └── marketplace.json                 name: work-with-tony
├── plugins/
│   └── linkedin-post/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       │   └── linkedin-post/
│       │       ├── SKILL.md
│       │       └── references/
│       │           ├── style-guide.md   일반 스타일 원칙 (공개용)
│       │           └── post-types.md    주제 4종별 구조 템플릿
│       ├── scripts/
│       │   ├── auth.mjs
│       │   ├── publish.mjs
│       │   └── lib/
│       │       ├── config.mjs
│       │       ├── linkedin-api.mjs
│       │       └── text-format.mjs
│       ├── tests/
│       ├── package.json                 의존성 0, Node 20+
│       └── README.md
├── docs/superpowers/specs/
└── README.md                            카탈로그 소개, 설치 명령
```

개인 데이터 (레포 밖)

```
~/.linkedin-post/
├── config.json        client_id, client_secret
├── token.json         access_token, expires_at, person_urn, name  (권한 600)
├── references/        참고하고 싶은 타인 글 (.md)
├── drafts/            발행 대기 임시 본문
├── published/         게시 사본 YYYY-MM-DD-slug.md (frontmatter: date, url, type, lang)
└── my-style.md        사용자가 명시적으로 준 스타일 피드백 축적
```

경로는 환경변수 `LINKEDIN_POST_HOME`으로 재지정 가능. 기본값 `~/.linkedin-post`.

## 4. 책임 분리

- SKILL.md: 글쓰기와 대화 흐름만. 컨텍스트 로딩, 초안, 수정 반복, 확정 감지, 스크립트 호출, 결과 정리.
- scripts/: LinkedIn API만. 글 내용을 판단하지 않는다. 표준 출력은 JSON 한 줄.
- references/: 누구나 쓸 수 있는 일반 원칙. 개인 취향은 `~/.linkedin-post/`에만 둔다.

## 5. 사용 흐름

진입
- `/linkedin-post <주제 한 줄>`
- `/linkedin-post <파일 경로>`
- `/linkedin-post` (인자 없음) → 무엇에 대해 쓸지 한 번 질문
- `--en` 플래그 → 영어 작성

1단계 컨텍스트 로딩
- style-guide.md, post-types.md 읽기
- `~/.linkedin-post/references/` 전체, `published/` 최근 5개, my-style.md (있으면)
- 파일 입력이면 내용을 재료로, 주제 입력이면 필요한 최소 질문 (핵심 경험 하나, 구체 사례·숫자 유무)

2단계 초안
- 주제 유형 판단: ai-tools / philosophy / side-project / pm-insight
- 유형별 구조 템플릿 적용
- 초안과 함께 표시: 글자 수, 첫 두 줄 미리보기(더보기 접힘 전 구간), 해시태그 3~5개
- 수정 요청은 대화로 반복. 이 단계에서 스크립트 실행 없음

3단계 확정·발행
- "올려", "발행", "게시" 등 명시적 확정에만 진행. 자동 발행 금지
- 본문을 `drafts/<timestamp>-<slug>.md`에 저장
- `node scripts/publish.mjs <draft path> [--visibility public|connections]` 실행
- 성공 시 draft를 `published/YYYY-MM-DD-<slug>.md`로 이동, frontmatter 기록, URL 표시
- 실패 시 draft 유지, 에러 메시지와 조치 안내

4단계 스타일 축적 (사용자 요청 시에만)
- 스타일 피드백 → my-style.md에 한 줄 규칙 추가
- 타인 참고 글 → references/에 저장

최초 설정
- config.json 없으면: 개발자 앱 생성 절차 안내 (앱 생성, Sign In with LinkedIn using OpenID Connect + Share on LinkedIn 제품 추가, redirect URL `http://localhost:8585/callback` 등록), client_id/secret 입력받아 저장
- token.json 없으면: `node scripts/auth.mjs` 실행 안내

## 6. 스크립트 상세

### auth.mjs
1. config.json 로드. 없으면 안내 후 종료 (exit 2)
2. 랜덤 state 생성, 인가 URL 조립 (scope: `openid profile w_member_social`)
3. `localhost:8585/callback` 임시 HTTP 서버, 브라우저 오픈 (`open` 명령, 실패 시 URL 출력)
4. 콜백 코드 → 토큰 교환 → `GET https://api.linkedin.com/v2/userinfo`로 sub, name
5. token.json 저장 (`{access_token, expires_at, person_urn: "urn:li:person:<sub>", name}`), chmod 600
6. 실패 분기: state 불일치, 120초 타임아웃, 토큰 교환 실패 → 각각 다른 메시지, exit 1

### publish.mjs
1. 인자: 본문 파일 경로, `--visibility` (기본 PUBLIC), `--dry-run` (API 호출 없이 요청 본문만 출력)
2. 사전 검증: 파일 존재, 빈 본문, 3000자 초과 → exit 2
3. token.json 로드. 만료 → auth 안내 exit 2. 7일 이내 만료 → stderr 경고 후 진행
4. text-format으로 예약 문자 이스케이프
5. `POST https://api.linkedin.com/rest/posts`
   - 헤더: `Authorization: Bearer`, `LinkedIn-Version: 202508`, `X-Restli-Protocol-Version: 2.0.0`, `Content-Type: application/json`
   - 본문: `{author, commentary, visibility, distribution:{feedDistribution:"MAIN_FEED", targetEntities:[], thirdPartyDistributionChannels:[]}, lifecycleState:"PUBLISHED", isReshareDisabledByAuthor:false}`
6. 201 응답 헤더 `x-restli-id` → `https://www.linkedin.com/feed/update/<id>`
7. stdout JSON 한 줄: `{"ok":true,"url":...,"id":...}` 또는 `{"ok":false,"code":...,"message":...,"hint":...}`

### text-format.mjs
- LinkedIn 예약 문자 `\ | { } @ [ ] ( ) < > # * _ ~` 를 백슬래시로 이스케이프
- 이미 이스케이프된 문자는 중복 처리하지 않음
- 줄바꿈, 한국어, 이모지 보존

### 에러 매핑
| 상태 | 원인 | 조치 안내 |
|---|---|---|
| 401 | 토큰 무효 | auth 재실행 |
| 403 | 권한 부족 | 개발자 앱에 Share on LinkedIn 제품 추가 확인 |
| 400/422 | 본문 형식 | 이스케이프 누락 가능성, 원문 응답 출력 |
| 429 | 게시 한도 | 재시도 없음, 다음 날 시도 |
| 네트워크 | 연결 실패 | 3초 후 1회 재시도 |
| 5xx | 서버 오류 | 재시도 없음 (중복 게시 방지) |

### 보안
- secret, token은 로그·stdout·대화에 출력 금지. 에러 출력 시 마스킹
- 레포에 secret 패턴 없음을 테스트로 검증
- token.json 권한 600

## 7. 스타일 가이드 초안 방향 (style-guide.md)

- 첫 두 줄에 결론 또는 긴장감 있는 한 문장. 더보기 전에 클릭 이유를 준다
- 문단은 1~3문장, 문단 사이 빈 줄. 모바일 가독성 우선
- 경험 → 관찰 → 일반화 순서. 추상 주장만 있는 글 금지
- 숫자·고유명사·구체 상황 최소 하나
- 마무리는 질문 또는 다음 행동 한 줄
- 해시태그 3~5개, 본문 끝에 분리
- 이모지는 문단 표지로 최대 3개, 문장 안에는 사용하지 않음
- 존댓말 기본 (사용자 피드백으로 변경 가능)

post-types.md 유형별 골격
- ai-tools: 문제 → 시도한 도구/방법 → 결과 수치 → 재현 가능한 팁
- philosophy: 일상 장면 → 철학 개념 연결 → 일·기술에 대한 재해석 → 열린 질문
- side-project: 만든 것 → 배운 것 하나 → 실패·숫자 → 다음 단계
- pm-insight: 현장 상황 → 판단 근거 → 결과 → 다른 PM에게 주는 한 줄

## 8. 테스트

Node 내장 test runner (`node --test`), 의존성 0.

- text-format.test.mjs: 이스케이프, 중복 이스케이프 금지, 한국어·이모지·줄바꿈 보존
- config.test.mjs: 경로 해석, 환경변수 재지정, 파일 없음·잘못된 JSON
- linkedin-api.test.mjs: fetch 모킹으로 요청 본문·헤더 검증, 상태 코드별 에러 매핑
- publish.test.mjs: 사전 검증, 만료·임박 분기, 성공 JSON 형태, 5xx 비재시도, dry-run
- plugin-package.test.mjs: plugin.json/marketplace.json 필수 필드, SKILL.md frontmatter, secret 패턴 없음
- auth 브라우저 흐름: 수동 1회 검증

실사용 검증
- `claude --plugin-dir ./plugins/linkedin-post`로 첫 글 실제 발행
- `claude plugin validate ./plugins/linkedin-post --strict` 통과

## 9. 마켓플레이스

marketplace.json
```json
{
  "name": "work-with-tony",
  "owner": { "name": "Tony (Eunjae Lee)" },
  "plugins": [
    { "name": "linkedin-post", "source": "./plugins/linkedin-post", "description": "...", "version": "0.1.0" }
  ]
}
```

설치 (public 전환 후)
```
/plugin marketplace add ej-rarus/work-with-tony
/plugin install linkedin-post@work-with-tony
```

## 10. 결정 사항 요약

- 형태: 스킬 + Node 스크립트 (MCP·웹앱 아님)
- 발행: 공식 API, 즉시 발행만, 명시적 확정 필수
- 개인 데이터: `~/.linkedin-post/`, 레포와 완전 분리
- 레포: ej-rarus/work-with-tony, private 시작, 카탈로그 구조
- 브랜딩: 개인 (LUKUKU 브랜딩 없음)
