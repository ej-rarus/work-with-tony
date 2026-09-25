# Tony Workmate

흩어진 요청을 정리하고, 문서·일정·전달까지 마무리하는 업무 파트너. Codex와 Claude Code에서 쓰는 8개 스킬을 묶었습니다.

## 스킬

| 이름 | 역할 | 예시 |
|---|---|---|
| `request-to-action` | 고객 요청 → 담당자 확인 요청 | 이 메일을 개발 가능 일정 확인 요청으로 정리해줘 |
| `draft-message` | Teams·이메일·Slack 말투에 맞춘 초안 (보내지 않음) | 담당자께 연동 규격 확인을 요청하는 슬랙 메시지 써줘 |
| `document-revise` | 기존 양식 유지 문서 수정 | 이 견적서에서 지정 항목만 바꾸고 PDF로 만들어줘 |
| `meeting-followup` | 회의록·미결정·후속 업무 | 녹취에서 결정사항과 고객사에 물어볼 내용을 분리해줘 |
| `calendar-entry` | Apple 캘린더 등록·시간 변경 | 이 대화에서 최종 합의한 회의를 애플 캘린더에 등록해줘 |
| `deliver` | 발신자·본문·첨부 확인 후 전달 | 이 문안과 파일 두 개를 지정 슬랙 스레드에 올려줘 |
| `expense-claim` | 영수증 검증·비용 청구 | 택시 영수증 두 장을 정산 요청으로 정리해줘 |
| `followup-tracker` | 미응답·미결정 확인 | 최근 일주일 이 채널에서 답변이 필요한 내 요청을 찾아줘 |

Codex: `$tony-workmate:expense-claim` / Claude Code: `/tony-workmate:expense-claim`처럼 호출합니다. 자동 선택도 가능하며 스킬 설명의 작업 범위에 맞춰 적용됩니다.

## 동작 원칙

기존 맥락을 유지하고 실제 완료까지 확인합니다. 초안과 전송, 제안과 확정, 파일 생성과 첨부 완료를 구분합니다. 이미 받은 승인은 다시 요구하지 않으며, 명시적인 전송 요청이 없는 초안은 보내지 않습니다. 외부 쓰기 전 발신 계정과 수신 대상을 확인합니다.

외부 연동은 호스트에서 연결된 도구/CLI/앱을 사용합니다. 이 패키지는 별도 Slack 토큰, OAuth 서버, Apple Calendar 권한, 상시 감시나 예약을 설치하지 않습니다. 도구가 없으면 완료했다고 주장하지 않고 가능한 결과와 미완료 부분을 알려줍니다.

회사 공식 이슈 접수는 환경에 이미 있는 PM 워크플로우 스킬로, 개인 할 일은 사용자가 사용하는 업무 앱 스킬로 연결합니다. 기존 스레드/회의록 스킬이 있으면 재사용하며 없는 환경에서도 초안 작성은 가능합니다. 특정 개인 폴더나 직원 계정을 하드코딩하지 않았습니다.

## 설치

이 소스 체크아웃의 `.agents/plugins/marketplace.json`과 `.claude-plugin/marketplace.json`에 등록됩니다. GitHub에서 설치하려면 이 변경이 먼저 원격 저장소에 배포되어 있어야 합니다. 로컬에 파일을 만들었다고 원격 게시 또는 설치된 호스트의 갱신이 완료된 것은 아닙니다.

원격 배포 후:

```text
# Codex
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add tony-workmate@work-with-tony

# Claude Code
/plugin marketplace add ej-rarus/work-with-tony
/plugin install tony-workmate@work-with-tony
```

이미 마켓플레이스가 있으면 중복 추가할 필요가 없습니다. 설치/업데이트 후 새 작업에서 스킬 로드를 확인합니다. 원격에 배포하지 않은 개발 버전은 로컬 마켓플레이스를 통해 설치할 수 있습니다.

## 비용 계산 도구

Node.js 20 이상에서 실행합니다. 런타임 패키지 설치는 필요하지 않습니다.

```sh
node /absolute/path/to/tony-workmate/scripts/expense-check.mjs /absolute/path/to/receipts.json
```

[입력 규격](references/expense-format.md)을 따릅니다. 수수료 포함 여부가 불명확하거나 증빙이 중복되면 최종 합계를 반환하지 않습니다. 통화별 정수 최소 단위로 계산하며 OCR·환급 정책·송금 기능은 아닙니다.

## 검증

```sh
npm test
```

산술/입력 오류/CLI 동작과 패키지의 스킬·참조 경로를 검사합니다. 테스트 통과는 실제 Slack 업로드, Calendar 등록, 예약 실행 성공을 보장하지 않습니다. [동작 검토 사례](references/acceptance-cases.md)는 외부 쓰기 없이 스킬의 판단을 점검할 때 사용합니다.
