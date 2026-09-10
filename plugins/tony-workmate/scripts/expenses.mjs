/** All amounts are nonnegative integer minor units; no OCR, FX, or policy inference. */
export function checkExpenses(input) {
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const amount = (v, label) => {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${label}: expected nonnegative safe integer minor units`);
    return v;
  };
  const text = (v, label) => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${label}: expected nonempty string`);
    return v.trim();
  };
  const add = (a, b) => amount(a + b, 'sum');
  if (!plain(input) || !Array.isArray(input.receipts) || !input.receipts.length) {
    throw new Error('receipts: expected nonempty array');
  }
  const issues = [], ids = new Set(), evidenceIds = new Set(), totals = {};
  const receipts = input.receipts.map((r, index) => {
    if (!plain(r)) throw new Error(`receipts[${index}]: expected object`);
    const id = text(r.id, 'id');
    if (ids.has(id)) issues.push({ code: 'DUPLICATE_ID', id });
    ids.add(id);
    if (r.evidenceId !== undefined) {
      const evidence = text(r.evidenceId, 'evidenceId');
      if (evidenceIds.has(evidence)) issues.push({ code: 'DUPLICATE_EVIDENCE', id });
      evidenceIds.add(evidence);
    }
    if (typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency)) throw new Error('currency: expected three uppercase letters');
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error('date: expected YYYY-MM-DD');
    const date = new Date(`${r.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== r.date) throw new Error('date: invalid calendar date');
    let confirmed = amount(r.paymentTotalMinor, 'paymentTotalMinor');
    const fees = r.additionalFees ?? [];
    if (!Array.isArray(fees)) throw new Error('additionalFees: expected array');
    const feeIds = new Set();
    for (const f of fees) {
      if (!plain(f)) throw new Error('fee: expected object');
      const feeId = text(f.id, 'fee.id');
      if (feeIds.has(feeId)) issues.push({ code: 'DUPLICATE_FEE', id, feeId });
      feeIds.add(feeId);
      const fee = amount(f.amountMinor, 'fee.amountMinor');
      if (f.includedInPaymentTotal === true) {
        // Already included in the charged total. Do not add it again.
      } else if (f.includedInPaymentTotal === false) {
        text(f.separatePaymentEvidence, 'fee.separatePaymentEvidence');
        confirmed = add(confirmed, fee);
      } else if (f.includedInPaymentTotal === null || f.includedInPaymentTotal === undefined) {
        issues.push({ code: 'FEE_INCLUSION_UNKNOWN', id, feeId });
      } else {
        throw new Error('fee.includedInPaymentTotal: expected boolean or null');
      }
    }
    totals[r.currency] = add(totals[r.currency] ?? 0, confirmed);
    return { id, date: r.date, currency: r.currency, confirmedAmountMinor: confirmed };
  });
  return {
    status: issues.length ? 'needs_review' : 'ready',
    totalsMinor: issues.length ? null : totals,
    receipts,
    issues,
  };
}
