export function redact(text, secrets) {
  return secrets
    .filter((s) => typeof s === "string" && s.length > 0)
    .reduce((acc, s) => acc.split(s).join("***"), String(text));
}
