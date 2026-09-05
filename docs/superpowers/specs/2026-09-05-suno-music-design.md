# suno-music 플러그인 설계

작성일: 2026-09-05  
상태: 설계 승인됨  
마켓플레이스: `work-with-tony` (`ej-rarus/work-with-tony`)

## 1. 목적

Claude Code와 Codex 대화 안에서 Suno 공식 REST API로 음악 생성을 요청하고, 비동기 생성 상태를 확인한 뒤 완성 음원을 로컬 파일로 내려받는 플러그인을 만든다. 기존 `linkedin-post`와 같은 듀얼 호스트 패키징 규칙을 따르며, 유료 크레딧을 쓰는 생성 작업과 읽기 전용 상태 확인을 명확히 분리한다.

## 2. 범위

포함:

- 사용자 가사, 스타일, 제목을 사용한 커스텀 곡 생성
- 보컬 성별과 모델 등 Suno 공식 API가 허용하는 생성 옵션 전달
- 생성 작업 상태 조회
- 완료된 음원의 로컬 다운로드
- API 키 최초 설정 및 연결 확인
- Claude Code와 Codex용 플러그인 매니페스트
- 저장소 마켓플레이스와 루트 카탈로그 등록
- API 호출을 모킹한 자동 테스트

제외:

- Suno 웹 UI 자동조작
- 곡 공개, 리믹스, 커버, 페르소나, 스템 분리
- 무제한 자동 재시도 또는 장시간 백그라운드 폴링
- 생성 결과의 자동 선곡, 배포 또는 YouTube 업로드
- API 키나 생성 음원의 Git 저장

## 3. 저장소 구조

```text
work-with-tony/
├── .claude-plugin/
│   └── marketplace.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── plugins/
│   └── suno-music/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── .codex-plugin/
│       │   └── plugin.json
│       ├── .mcp.json
│       ├── mcp/
│       │   ├── server.bundle.mjs
│       │   └── src/
│       │       ├── server.mjs
│       │       ├── suno-client.mjs
│       │       ├── config.mjs
│       │       ├── download.mjs
│       │       └── errors.mjs
│       ├── scripts/
│       │   ├── configure.mjs
│       │   └── build.mjs
│       ├── skills/
│       │   └── create/
│       │       └── SKILL.md
│       ├── tests/
│       ├── package.json
│       └── README.md
└── README.md
```

`server.bundle.mjs`는 설치 후 의존성 설치 없이 실행 가능한 배포 산출물이다. `mcp/src/`는 유지보수 가능한 원본이며 테스트는 원본 모듈을 대상으로 한다.

## 4. MCP 도구

### `create_song`

입력:

- `title`: 곡 제목
- `lyrics`: 전체 가사
- `style`: Suno 스타일 프롬프트
- `vocalGender`: `male`, `female`, 또는 생략
- `model`: Suno 계정에서 사용할 수 있는 모델명 또는 생략
- `confirmCreditSpend`: 반드시 `true`

동작:

1. 필수값과 문자열 길이를 로컬에서 검증한다.
2. `confirmCreditSpend`가 `true`가 아니면 API를 호출하지 않는다.
3. 공식 API의 생성 엔드포인트를 한 번 호출한다.
4. 작업 ID와 제출된 옵션 요약만 반환한다.
5. 자동 재요청하지 않는다. 네트워크 결과가 불확실하면 중복 생성 위험을 알리고 작업 목록 확인을 안내한다.

### `get_generation`

입력:

- `generationId`: `create_song`이 반환한 작업 ID

동작:

- 현재 상태, 진행 메시지, 결과 트랙 목록, 공식 결과 URL을 반환한다.
- 읽기 전용이며 크레딧을 소비하는 재생성 요청을 하지 않는다.
- 서버 오류 시 짧은 지수 백오프로 최대 2회 재시도한다.

### `download_song`

입력:

- `generationId`: 완료된 작업 ID
- `outputDirectory`: 사용자가 지정한 절대 경로
- `trackIndex`: 결과가 복수일 때 선택할 0 기반 인덱스
- `fileName`: 선택적 파일명

동작:

1. 작업 상태를 다시 조회해 완료 여부와 Suno가 반환한 음원 URL을 확인한다.
2. 임의 URL은 입력받지 않는다.
3. HTTPS만 허용하고, 실제 API 응답에서 확인된 Suno CDN 호스트만 허용한다.
4. 임시 파일에 저장한 뒤 다운로드가 끝나면 최종 파일명으로 원자적 이동한다.
5. 기존 파일은 덮어쓰지 않고 충돌 없는 이름을 선택한다.
6. 최종 절대 경로, 바이트 크기, 콘텐츠 유형을 반환한다.

## 5. API 계약과 호환 계층

Suno Platform 로그인 후 보이는 공식 문서를 구현 시점의 기준 계약으로 사용한다. 외부 API 필드와 MCP 공개 인터페이스를 직접 결합하지 않고 `suno-client.mjs`에서 변환한다. 따라서 Suno의 엔드포인트명이나 응답 필드가 바뀌어도 MCP 도구의 이름과 기본 입력은 유지할 수 있다.

- 기본 URL과 인증 헤더는 공식 문서 값으로 고정한다.
- 테스트에서는 실제 API 키나 네트워크를 사용하지 않는다.
- 지원 모델과 선택 옵션은 문서 또는 계정 응답에서 확인된 값만 전달한다.
- 알 수 없는 응답 필드는 보존하되 사용자 출력에는 비밀값과 내부 헤더를 포함하지 않는다.

## 6. 인증과 개인 데이터

인증 우선순위:

1. 프로세스 환경변수 `SUNO_API_KEY`
2. `~/.suno-music/config.json`의 `apiKey`

`scripts/configure.mjs`는 터미널에서 키를 입력받아 `~/.suno-music/config.json`을 만들고 권한을 `0600`으로 설정한다. 키는 stdout, 오류 메시지, MCP 응답에 출력하지 않는다. 설정 파일과 다운로드된 음원은 저장소 밖에 두며 Git에 추가하지 않는다.

연결 확인은 크레딧을 쓰지 않는 계정 또는 API 상태 엔드포인트가 공식 문서에 있으면 그것을 사용한다. 없다면 키 형식만 로컬 검증하고 실제 생성 전까지 유효성 확정을 보류한다.

## 7. 사용자 흐름

1. 플러그인을 설치한다.
2. `node scripts/configure.mjs`를 실행하거나 `SUNO_API_KEY`를 설정한다.
3. 대화에서 가사와 스타일을 다듬는다.
4. 생성 직전 플러그인이 제목, 모델, 보컬 성별, 크레딧 소비 여부를 요약한다.
5. 사용자가 명시적으로 생성하라고 하면 `confirmCreditSpend: true`로 `create_song`을 호출한다.
6. `get_generation`으로 상태를 확인한다.
7. 완료 후 사용자가 요청한 폴더에 `download_song`으로 저장한다.

## 8. 실패 처리

| 상황 | 처리 |
|---|---|
| 키 없음 | 설정 명령을 안내하고 API 호출 없이 종료 |
| 인증 실패 | 키 재발급 또는 재설정을 안내 |
| 잔여 크레딧 부족 | Suno 응답을 요약하고 재시도하지 않음 |
| 요청 검증 실패 | 잘못된 필드와 허용값을 표시 |
| 429 | 서버가 제공한 재시도 시각을 반환하고 자동 생성 재시도 금지 |
| 생성 API 네트워크 불확실 | 중복 과금 가능성을 경고하고 상태/작업 목록부터 확인 |
| 생성 실패 | Suno 작업 ID와 오류를 반환하고 자동 재생성 금지 |
| 다운로드 실패 | 임시 파일을 정리하고 기존 파일은 보존 |

## 9. 보안과 비용 통제

- 생성은 `confirmCreditSpend: true`가 없으면 실행되지 않는다.
- 생성 요청은 네트워크 오류에도 자동 재시도하지 않는다.
- API 키와 인증 헤더는 모든 로그와 오류에서 마스킹한다.
- MCP 입력으로 임의 다운로드 URL을 받지 않아 SSRF 경로를 차단한다.
- 다운로드 경로는 명시적 절대 경로만 허용하고 저장소나 홈 전체를 대상으로 한 삭제·정리 기능은 제공하지 않는다.
- 테스트와 설치 검증은 크레딧을 소비하지 않는다.

## 10. 테스트와 검증

Node 내장 test runner와 모킹된 `fetch`를 사용한다.

- 설정 우선순위, 잘못된 JSON, 파일 권한
- 키와 인증 헤더 비노출
- 생성 입력 검증과 확인 플래그 강제
- 생성 요청 본문과 공식 API 응답 변환
- 생성 요청 비재시도
- 상태 조회의 제한된 재시도와 오류 매핑
- 완료 전 다운로드 거부
- HTTPS 및 CDN 호스트 검증
- 파일명 충돌, 임시 파일 정리, 원자적 저장
- 듀얼 플러그인 매니페스트와 `.mcp.json` 검증
- 마켓플레이스 필수 필드와 비밀 패턴 검사

검증 명령:

```text
npm test
npm run build
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/suno-music
claude plugin validate ./plugins/suno-music --strict
```

로컬 설치 후 새 Codex 작업에서 MCP 도구 세 개가 노출되는지 확인한다. 실제 생성 테스트는 사용자의 별도 명시적 확인 후 한 번만 수행한다.

## 11. 패키징과 마켓플레이스

- 플러그인 식별자: `suno-music`
- 초기 버전: `0.1.0`
- 카테고리: `Creative`
- 인증 시점: 설치 후 최초 사용 전
- `.claude-plugin/marketplace.json`에 기존 순서를 유지한 채 항목을 추가한다.
- Codex용 저장소 마켓플레이스인 `.agents/plugins/marketplace.json`을 만들고 기존 `linkedin-post`와 새 `suno-music` 항목을 함께 등록한다.
- Codex용 매니페스트는 `mcpServers: "./.mcp.json"`와 `skills: "./skills/"`를 선언한다.
- 루트 README에 설명과 설치 명령을 추가한다.
- 구현과 검증이 끝나면 하나의 기능 커밋으로 `origin/main`에 푸시한다.

## 12. 결정 사항

- 공식 Suno REST API만 사용하고 웹 UI 자동화는 사용하지 않는다.
- 사용자 대화 흐름은 스킬, 네트워크 호출과 파일 저장은 MCP 서버가 담당한다.
- 첫 버전은 생성, 상태 확인, 다운로드 세 도구만 제공한다.
- 유료 생성과 읽기 전용 상태 확인을 분리한다.
- 비밀값과 음원은 저장소 밖에 둔다.
- Claude Code와 Codex를 모두 지원하며 `work-with-tony` 마켓플레이스에 배포한다.
