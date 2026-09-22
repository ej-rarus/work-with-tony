# Review guide

The script reports every structural violation. The skill adds the four judgment items below, using only the rows and line numbers in the script's `structure` JSON. Each item becomes a row `| line | rule | message | reason |` appended under `<!-- skill-review -->` in the report. Quote PRD cells sparingly (one short phrase), never whole rows.

## review.criteria
For each row in `structure.requirements`: does `criteria` state a condition and an observable result?
- Pass: "상태를 선택하면 해당 상태의 주문만 표시되고, 해제하면 전체 목록으로 돌아간다."
- Review: "빠르게 동작한다", "오류 없이 처리된다", a restatement of the requirement, or a criteria that names no visible outcome.
Message: `<id> 완료 기준에 확인 가능한 조건과 결과가 없습니다.` Reason: what is missing (condition, result, or both).

## review.scope
Compare `structure.scope.excluded[].area` with `structure.requirements[]`: an excluded area that has a requirement with status 확정 is a contradiction. Compare `structure.scope.included[].area` with requirements: an included area that no requirement mentions is a gap. Match by meaning, not exact words.
Message: `제외 범위 "<area>"에 해당하는 <id>가 확정으로 들어 있습니다.` or `포함 범위 "<area>"에 해당하는 요구사항이 없습니다.` Line: the scope row's line.

## review.asserted
For each requirement whose status is not 확정: search the PRD text under sections 4.2 and 5.2 (use the `sections` lines to bound the search; you may read those sections of the file) for the requirement's subject described as delivered ("~한다", "~제공한다", "~처리된다") without a qualifier such as "확정 시" or "확인 필요".
Message: `<id>는 <status>인데 <section>에서 확정된 기능처럼 서술됩니다.` Line: the line of the asserting sentence.

## review.openItems
For each row in `structure.openItems`: `owner` empty, or `due` empty or not a date. Message: `미확정 사항 "<question>"에 확인 담당 또는 예정일이 없습니다.` Line: the row's line.

## What not to do
- Do not re-derive line numbers by counting; use the numbers the script gave.
- Do not add findings the script already reported.
- Do not rewrite the PRD or suggest full rewrites; one-line fixes only.
