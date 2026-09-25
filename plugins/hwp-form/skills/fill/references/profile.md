# Profile

`$HWP_FORM_HOME/profile.md` (default `~/.hwp-form/profile.md`) holds the facts that recur across forms. It is plain Markdown the user can edit by hand. Only facts the user has confirmed belong here.

## Suggested layout

```markdown
# 기본 정보
- 성명: 
- 영문 성명: 
- 생년월일: YYYY-MM-DD
- 휴대폰: 
- 비상연락처: 
- 이메일: 
- 주소: 

# 사업자
- 상호: 
- 대표자: 
- 사업자등록번호: 
- 개업일: 
- 업태/종목: 
- 사업장 주소: 

# 경력
| 입사연월 | 퇴사연월 | 근무처 | 업무분야 |
|---|---|---|---|

# 기술/자격증/입상실적
| 취득연월 | 명칭 | 시행처 |
|---|---|---|

# 지원사업 참여이력
| 연/월 | 지원사업 | 지원내역 |
|---|---|---|

# 지식재산권
| 권리구분 | 명칭 | 번호 | 권리자 |
|---|---|---|---|
```

Sections can be left out or added. A form's label rarely matches a heading word for word; map by meaning (for example 성 명(대표자) → 성명, 연락처 > 휴대폰 → 휴대폰).

## Rules

- Create or change the profile only with the user's confirmation, and show the lines you are adding.
- Keep sensitive identifiers (주민등록번호, 계좌번호) out unless the user explicitly asks to store them; the file is private to this machine and should be mode 600.
- Dates in forms follow the form's own pattern (`2026.05`, `2026년 5월`, `26.05`); convert from the profile's value rather than storing several formats.
