import assert from "node:assert/strict";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { isEntry } from "../scripts/lib/entry.mjs";
import { makeTempHome } from "./helpers.mjs";

test("isEntry matches the running script even when it was launched through a symlink", () => {
  const { home, cleanup } = makeTempHome();
  try {
    const real = join(home, "script.mjs");
    writeFileSync(real, "");
    const link = join(home, "link.mjs");
    symlinkSync(real, link);
    assert.equal(isEntry(pathToFileURL(real).href, real), true);
    assert.equal(isEntry(pathToFileURL(real).href, link), true);
    assert.equal(isEntry(pathToFileURL(real).href, join(home, "other.mjs")), false);
    assert.equal(isEntry(pathToFileURL(real).href, undefined), false);
  } finally {
    cleanup();
  }
});
