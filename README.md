# work-with-tony

일하면서 반복되는 일을 대화 한 줄로 끝내려고 만든 개인 플러그인 모음입니다. **Claude Code**와 **Codex** 양쪽에서 같은 플러그인을 그대로 쓸 수 있습니다.

> **English:** A personal catalog of Claude Code and Codex plugins by Tony (Eunjae Lee): LinkedIn publishing, Instagram carousels, PRD review, file explanations with practice lessons, Suno form prep, plugin releases, and everyday work follow-through. Every plugin has its own English README under `plugins/<name>/`. Add the marketplace with `/plugin marketplace add ej-rarus/work-with-tony` (Claude Code) or `codex plugin marketplace add ej-rarus/work-with-tony` (Codex).

## 한눈에 보기

| 플러그인 | 하는 일 | 이럴 때 쓰세요 |
|---|---|---|
| [**linkedin-post**](plugins/linkedin-post/) | 대화로 LinkedIn 글을 다듬고 공식 API로 내 프로필에 발행 | 매일 글을 올리는데 초안 작성과 게시가 번거로울 때 |
| [**instagram-carousel**](plugins/instagram-carousel/) | 메모나 주제로 인스타 카드뉴스를 기획하고, 수정 가능한 HTML과 1080×1350 PNG로 만들기 | 교육용·정보형 카드뉴스를 일정한 디자인으로 꾸준히 만들고 싶을 때 |
| [**explain-this**](plugins/explain-this/) | 로컬 Markdown·HTML·JSON 파일을 쉬운 말로 설명하고, 원하면 오프라인 연습 화면까지 만들기 | 받은 설정 파일이나 문서가 무슨 뜻인지 직접 만져 보며 이해하고 싶을 때 |
| [**prd-check**](plugins/prd-check/) | Markdown PRD를 팀 표준 양식과 비교해 줄 번호가 달린 점검표 작성 | PRD를 리뷰에 올리기 전에 빠진 절이나 형식 오류를 잡고 싶을 때 |
| [**suno-music**](plugins/suno-music/) | 확정한 가사와 스타일을 Suno Advanced 입력창에 채워 두기 (생성 버튼은 누르지 않음) | 가사를 여러 번 옮겨 붙이다 실수하는 게 싫을 때 |
| [**plugin-release**](plugins/plugin-release/) | 플러그인 패키지 검증, 마켓플레이스 정보 동기화, 릴리스 커밋과 푸시 확인 | 직접 만든 플러그인의 버전을 올리고 배포할 때 |
| [**tony-workmate**](plugins/tony-workmate/) | 요청 정리, 양식 유지 문서 수정, 회의 후속, 캘린더 등록, 전달, 비용 청구, 미응답 확인 | 흩어진 업무 요청을 끝까지 마무리하고 싶을 때 |

## 빠른 시작

### 1. 마켓플레이스 추가 (처음 한 번만)

**Claude Code**

```text
/plugin marketplace add ej-rarus/work-with-tony
```

**Codex**

```text
codex plugin marketplace add ej-rarus/work-with-tony
```

### 2. 필요한 플러그인만 설치

**Claude Code**

```text
/plugin install linkedin-post@work-with-tony
```

**Codex**

```text
codex plugin add linkedin-post@work-with-tony
```

`linkedin-post` 자리에 원하는 플러그인 이름을 넣으면 됩니다.

### 3. 새 세션에서 사용

설치한 뒤에는 **새 Claude Code 세션이나 새 Codex 작업을 여세요.** 이미 열려 있는 세션에는 새 스킬이 바로 로드되지 않을 수 있습니다.

명령어 형식은 호스트마다 다릅니다.

| | 형식 | 예시 |
|---|---|---|
| Claude Code | `/플러그인:스킬` | `/linkedin-post:post` |
| Codex | `$플러그인:스킬` | `$linkedin-post:post` |

명령어를 외우지 않아도 됩니다. "링크드인에 글 써줘"처럼 평소 말투로 요청해도 알맞은 스킬이 실행됩니다.

## 준비물

- **Node.js 20 이상**. 스크립트가 있는 플러그인은 모두 Node 20 이상에서 동작하고, 그보다 낮으면 실행하지 않고 안내 메시지를 보여줍니다.
- npm 패키지 설치는 필요 없습니다. 모든 플러그인이 외부 의존성 없이 동작합니다.
- 플러그인별 추가 준비물은 아래 표를 참고하세요.

| 플러그인 | 처음 한 번 해 둘 일 |
|---|---|
| linkedin-post | 무료 LinkedIn 개발자 앱을 만들고 로그인 (약 5분, 첫 실행 때 스킬이 단계별로 안내) |
| instagram-carousel | PNG로 내보낼 때만 Chrome 또는 Chromium 필요 |
| explain-this | 없음 |
| prd-check | 팀 PRD 양식 파일 경로를 `~/.prd-check/config.json`에 등록 |
| suno-music | 호스트의 브라우저 제어 기능을 켜고, 그 브라우저에서 Suno에 로그인 |
| plugin-release | 없음 |
| tony-workmate | 없음 (Slack, 캘린더 같은 연동은 호스트에 이미 연결된 도구를 그대로 사용) |

## 플러그인 소개

### linkedin-post: 대화로 쓰고, 확인 후 바로 발행

```text
/linkedin-post:post 이번 주 Claude Code 스킬 만들면서 배운 점
/linkedin-post:post ~/notes/retro.md
/linkedin-post:doctor
```

- 주제 한 줄이나 메모 파일만 주면 초안을 씁니다. 글자 수, "더 보기" 전에 보이는 두 줄, 발행 전 점검 결과를 함께 보여줍니다.
- 최근에 쓴 글과 같은 구성이 반복되지 않도록 여섯 가지 글 구조를 번갈아 씁니다.
- **"올려", "발행"처럼 분명히 말하기 전에는 절대 게시하지 않습니다.**
- 좋아요, 댓글 수를 붙여 넣으면 게시물 기록에 저장되고, 다음 글을 쓸 때 참고 자료로 씁니다.
- `/linkedin-post:doctor`는 로그인이 만료되기 전이나 LinkedIn API 버전이 바뀌기 전에 미리 알려줍니다. 새 버전으로 바꿀 방법도 함께 알려줍니다.

설치: `/plugin install linkedin-post@work-with-tony` (Claude Code) · `codex plugin add linkedin-post@work-with-tony` (Codex)

[자세히 보기](plugins/linkedin-post/)

### instagram-carousel: 카드뉴스 기획부터 PNG까지

```text
/instagram-carousel:create MD 파일이 뭔지 PM 초보자용 7장 카드뉴스로 기획해줘. 파일은 만들지 마.
/instagram-carousel:create 이 메모를 Tony Editorial Blue HTML 카드뉴스와 PNG로 만들어줘.
```

- 주제, 붙여 넣은 메모, 기존 초안, 로컬 Markdown 파일 중 무엇이든 받아 슬라이드 구성을 먼저 제안합니다. 파일 없이 기획만 할 수도 있어요.
- 만들기를 요청하면 `deck.json`(내용), 미리보기 HTML, 캡션, 대체 텍스트가 든 프로젝트 폴더를 만들고, 정확히 1080×1350 크기의 PNG와 한눈에 보는 목록 이미지를 뽑습니다.
- 표지, 설명, 비교, 체크리스트, 실습, 한 문장, 마무리까지 7가지 레이아웃과 2가지 디자인(사진 중심의 Editorial Blue, 글자 중심의 Digital Field Notes)을 씁니다.
- 글자는 이미지가 아닌 실제 텍스트라서 `deck.json`만 고치고 다시 만들면 됩니다.
- **인스타그램에 게시하지 않습니다.** 로그인, 업로드, 스톡 이미지 다운로드도 하지 않고 모든 파일은 내 컴퓨터에만 만들어집니다.

설치: `/plugin install instagram-carousel@work-with-tony` (Claude Code) · `codex plugin add instagram-carousel@work-with-tony` (Codex)

[자세히 보기](plugins/instagram-carousel/)

### explain-this: 파일을 읽고, 직접 만져 보며 이해하기

```text
/explain-this:explain /absolute/path/to/notes.md 파일 내용만 쉽게 설명해줘. 파일은 만들지 마.
/explain-this:explain /absolute/path/to/config.json 을 설명하고 연습 화면도 만들어줘.
```

- 파일의 실제 문장을 짚어 가며 쉬운 말로 설명합니다. 대상은 128KB 이하의 `.md`, `.html`, `.json` 파일이에요.
- 연습을 요청하면 작은 예제를 고쳐 보면서 바뀌기 전과 후를 나란히 비교하는 오프라인 학습 페이지를 새 폴더에 만듭니다. 계정, 서버, 네트워크 없이 브라우저에서 바로 열립니다.
- **원본 파일은 바꾸거나 복사하지 않습니다.** 파일 안의 코드를 실행하거나 링크를 열지도 않고, 파일 내용은 지시가 아닌 데이터로만 다룹니다.

설치: `/plugin install explain-this@work-with-tony` (Claude Code) · `codex plugin add explain-this@work-with-tony` (Codex)

[자세히 보기](plugins/explain-this/)

### prd-check: 리뷰 전에 PRD 형식 점검

```text
/prd-check:check ~/docs/shop-prd.md
```

- PRD 옆에 `<파일명>.check.md` 점검표를 만듭니다. 항목마다 줄 번호, 규칙 이름, 한 줄짜리 고칠 방법이 붙습니다.
- 빠지거나 순서가 바뀐 절, 양식과 다른 표 헤더, 남아 있는 `[placeholder]`처럼 기계적으로 잡을 수 있는 **오류**와, 사람이 판단해야 하는 **검토 항목**을 나눠서 보여줍니다.
- 원본 PRD는 건드리지 않습니다. 회사 양식은 저장소에 들어 있지 않으니 각자 자기 양식을 연결해서 쓰세요.

설치: `/plugin install prd-check@work-with-tony` (Claude Code) · `codex plugin add prd-check@work-with-tony` (Codex)

[자세히 보기](plugins/prd-check/)

### suno-music: 생성 직전까지만 채워 두기

```text
/suno-music:prepare 제목: 다시 송신 / 가사: ... / 스타일: ...
```

- 이미 로그인된 Suno 탭의 Advanced 입력창에 제목, 가사, 스타일을 글자 그대로 채우고, 들어간 값을 하나하나 다시 확인합니다.
- **`Create song`은 누르지 않습니다.** 크레딧이 쓰이지 않고, 마지막 확인과 생성은 직접 하시면 됩니다.
- 입력창에 이미 내용이 있으면 덮어쓰기 전에 먼저 물어봅니다.

설치: `/plugin install suno-music@work-with-tony` (Claude Code) · `codex plugin add suno-music@work-with-tony` (Codex)

[자세히 보기](plugins/suno-music/)

### plugin-release: 플러그인 배포를 빠짐없이

```text
/plugin-release:release /path/to/repo의 플러그인을 모두 검증해줘
/plugin-release:release /path/to/repo의 suno-music을 0.2.0으로 올리고 커밋과 푸시까지 해줘
```

- 매니페스트, 버전, 두 마켓플레이스(Claude Code, Codex) 등록 정보가 서로 맞는지 검사합니다.
- 메타데이터를 바꿀 때는 먼저 무엇이 바뀌는지 보여주고, 요청할 때만 실제로 씁니다.
- 커밋과 푸시는 요청한 경우에만 하고, 끝난 뒤 원격 저장소에 제대로 반영됐는지까지 확인합니다.

설치: `/plugin install plugin-release@work-with-tony` (Claude Code) · `codex plugin add plugin-release@work-with-tony` (Codex)

[자세히 보기](plugins/plugin-release/)

### tony-workmate: 업무를 끝까지 마무리하는 7가지 스킬

| 스킬 | 하는 일 |
|---|---|
| `request-to-action` | 고객 요청을 담당자에게 보낼 확인 요청으로 정리 |
| `document-revise` | 기존 양식을 그대로 두고 지정한 부분만 수정 |
| `meeting-followup` | 회의 기록에서 결정사항, 미결정, 후속 업무 분리 |
| `calendar-entry` | 합의한 일정을 Apple 캘린더에 등록하거나 시간 변경 |
| `deliver` | 발신자, 본문, 첨부를 확인한 뒤 전달 |
| `expense-claim` | 영수증을 검증하고 비용 청구 요청으로 정리 |
| `followup-tracker` | 답을 받지 못한 요청이나 결정이 안 난 일 찾기 |

초안과 실제 전송을 구분합니다. 보내 달라고 분명히 요청하기 전에는 아무것도 보내지 않습니다.

설치: `/plugin install tony-workmate@work-with-tony` (Claude Code) · `codex plugin add tony-workmate@work-with-tony` (Codex)

[자세히 보기](plugins/tony-workmate/)

## 모든 플러그인이 지키는 약속

- **바깥으로 내보내기 전에 확인합니다.** 게시, 전송, 푸시처럼 되돌리기 어려운 일은 분명한 요청이 있을 때만 합니다.
- **개인 정보는 플러그인 밖에 둡니다.** 토큰이나 설정 같은 개인 데이터는 `~/.linkedin-post/`, `~/.prd-check/`처럼 홈 폴더에 저장하고, 플러그인 폴더나 이 저장소에는 넣지 않습니다.
- **비밀값은 화면에 보여주지 않습니다.** 토큰과 client secret은 대화나 출력에 나오지 않습니다.
- **된 것과 안 된 것을 구분해서 알려줍니다.** 필요한 도구가 없거나 일이 끝나지 않았으면 완료했다고 말하지 않습니다.

## 업데이트와 삭제

새 버전이 나오면 마켓플레이스를 새로 고친 뒤 플러그인을 다시 설치하세요.

**Claude Code**

```text
/plugin marketplace update work-with-tony
/plugin uninstall linkedin-post@work-with-tony
/plugin install linkedin-post@work-with-tony
```

**Codex**

```text
codex plugin marketplace upgrade
codex plugin remove linkedin-post@work-with-tony
codex plugin add linkedin-post@work-with-tony
```

삭제만 하려면 uninstall(Claude Code)이나 remove(Codex) 줄만 실행하면 됩니다. 홈 폴더의 개인 데이터(`~/.linkedin-post/` 등)는 지워지지 않으니, 필요 없으면 직접 지우세요.

## 자주 묻는 질문

**설치했는데 명령어가 안 보여요.**
새 세션이나 새 작업을 여세요. 그래도 안 보이면 Claude Code는 `/plugin`에서 설치 목록을 확인하세요. Codex는 `codex plugin list`에 플러그인이 보이는지 확인한 뒤 `codex plugin add`를 다시 실행하세요.

**업데이트했는데 예전처럼 동작해요.**
마켓플레이스만 새로 고치면 이미 설치된 플러그인은 바뀌지 않습니다. 위의 "업데이트와 삭제" 순서대로 다시 설치한 뒤 새 세션을 여세요.

**LinkedIn 발행이 갑자기 실패해요.**
`/linkedin-post:doctor`를 실행하세요. 로그인이 만료됐는지, API 버전이 폐기됐는지 확인하고 해결 방법을 알려줍니다.

**`NODE_TOO_OLD` 오류가 나요.**
Node.js를 20 이상으로 올리세요. `node -v`로 버전을 확인할 수 있습니다.

## 저장소 구조

```text
work-with-tony/
├── .claude-plugin/marketplace.json   # Claude Code 마켓플레이스 목록
├── .agents/plugins/marketplace.json  # Codex 마켓플레이스 목록
└── plugins/
    └── <이름>/
        ├── .claude-plugin/plugin.json  # Claude Code 매니페스트
        ├── .codex-plugin/plugin.json   # Codex 매니페스트
        ├── skills/                     # 스킬 설명서 (SKILL.md)
        ├── scripts/                    # 스킬이 실행하는 Node 스크립트
        ├── tests/
        └── README.md
```

플러그인을 수정했다면 해당 플러그인 폴더에서 아래 명령으로 확인하세요.

```text
npm test
claude plugin validate . --strict
```

버그 제보나 아이디어는 [Issues](https://github.com/ej-rarus/work-with-tony/issues)에 남겨 주세요.

## 라이선스

[MIT](LICENSE)
