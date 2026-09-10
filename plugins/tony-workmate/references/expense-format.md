# 비용 계산기

설치된 플러그인 루트를 기준으로 `node <plugin-root>/scripts/expense-check.mjs /absolute/path/input.json`을 실행한다. `-`는 stdin이다. Node.js 20 이상이며 외부 의존성·네트워크·파일 쓰기가 없다. 입력은 작업 폴더에 만들고 증빙이나 개인 데이터를 플러그인 소스에 저장하지 않는다.

다음은 가상 데이터다.

```json
{
  "receipts": [
    {
      "id": "trip-a",
      "evidenceId": "transaction-a",
      "date": "2026-09-01",
      "currency": "KRW",
      "paymentTotalMinor": 10000,
      "additionalFees": [
        { "id": "call-fee", "amountMinor": 1000, "includedInPaymentTotal": null }
      ]
    }
  ]
}
```

- `paymentTotalMinor`: 실제 결제 금액. 최소 통화 단위의 음이 아닌 정수. KRW 10,000원은 10000, USD $10.00은 1000이다. 도구는 통화별 소수 자릿수를 자동 추론하지 않는다.
- `id`: 정규화한 영수증별 고유 ID. 같은 증빙을 다른 ID로 만들지 않는다.
- `evidenceId`: 확인된 결제/영수증 식별자(선택). 영수증 여러 개가 들어 있는 파일 이름을 결제 ID로 사용하지 않는다. 없으면 사진·거래내역으로 중복을 직접 확인한다.
- `date`: 실제 유효한 YYYY-MM-DD 날짜.
- `additionalFees`: 보이는 수수료 목록. 없으면 생략 가능. 각 `id`는 영수증 안에서 고유해야 한다.
- `includedInPaymentTotal: true`: 결제 총액에 이미 포함. 추가 합산하지 않는다.
- `false`: 별도 결제를 확인한 경우만 사용. 근거를 가리키는 짧은 `separatePaymentEvidence` 문자열이 필수다. API 키나 계좌번호 대신 원본의 페이지/행/결제 확인 위치를 적는다.
- `null`/미입력: 포함 여부 미확인. 항목을 지우거나 `false`로 임의 변경하지 않는다.

`status: ready`는 **산술과 입력 관계 검증만 통과**했다는 뜻이다. 영수증 진위, OCR 정확성, 별도 결제 증거의 신뢰성, 회사 비용 인정 여부를 보장하지 않는다.

`needs_review`이면 `totalsMinor`는 null이다. `receipts[].confirmedAmountMinor`는 각 건에서 확인된 부분만 보여주며 최종 청구액이 아니다. 중복 ID/결제 ID/수수료 또는 포함 여부를 확인한 후 다시 계산한다. 서로 다른 통화는 하나로 합산하지 않는다.

종료 코드: 0 산술 검증 통과 / 2 확인 필요 / 1 잘못된 입력. 반품·취소·환불과 외화 환산은 이 양수 지출 계산기의 범위 밖이며 별도 증빙으로 검토한다.
