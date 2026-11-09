import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../scripts/config.mjs";

const example = JSON.parse(readFileSync(new URL("../config.example.json", import.meta.url), "utf8"));
const script = fileURLToPath(new URL("../scripts/config.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "video-journal-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  mkdirSync(cwd);
  return { cwd, homeDir: root, env: {} };
}

function writeConfig(path, config = example) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config));
}

test("selects the explicit path, environment path, and home file in that order", (t) => {
  const options = fixture(t);
  const home = join(options.homeDir, ".config", "work-with-tony", "video-journal.json");
  writeConfig(home, { ...example, channelName: "Home" });
  assert.equal(loadConfig(undefined, options).channelName, "Home");

  writeConfig(join(options.cwd, "env.json"), { ...example, channelName: "Environment" });
  options.env.VIDEO_JOURNAL_CONFIG = "env.json";
  assert.equal(loadConfig(undefined, options).channelName, "Environment");

  writeConfig(join(options.cwd, "manual.json"), { ...example, channelName: "Explicit" });
  assert.equal(loadConfig("manual.json", options).channelName, "Explicit");
});

test("working-directory config cannot redirect the default account or folder", (t) => {
  const options = fixture(t);
  const project = {
    ...example,
    driveAccountEmail: "another-account@example.com",
    channelFolderUrl: "https://drive.google.com/drive/folders/ANOTHER_FOLDER_ID",
  };
  writeConfig(join(options.cwd, ".video-journal.json"), project);
  assert.throws(() => loadConfig(undefined, options), /Cannot read the selected config/);
  writeConfig(join(options.homeDir, ".config", "work-with-tony", "video-journal.json"));
  assert.deepEqual(loadConfig(undefined, options), example);
  assert.deepEqual(loadConfig(".video-journal.json", options), project);
});

test("never falls back when a selected higher-priority file is missing or malformed", (t) => {
  const options = fixture(t);
  writeConfig(join(options.homeDir, ".config", "work-with-tony", "video-journal.json"));
  writeFileSync(join(options.cwd, "broken.json"), "{broken");
  assert.throws(() => loadConfig("broken.json", options), /not valid JSON/);
  assert.throws(() => loadConfig("missing.json", options), /Cannot read the selected config/);
  options.env.VIDEO_JOURNAL_CONFIG = "missing.json";
  assert.throws(() => loadConfig(undefined, options), /Cannot read the selected config/);
});

test("normalizes account and Google links, removing account selectors and tracking parameters", (t) => {
  const options = fixture(t);
  writeConfig(join(options.cwd, ".video-journal.json"), {
    ...example,
    channelName: "  Example Video Diary  ",
    driveAccountEmail: "Creator@Example.com",
    channelFolderUrl: "https://drive.google.com/drive/u/0/folders/YOUR_CHANNEL_FOLDER_ID?usp=drive_link",
    topicInboxUrl: "https://docs.google.com/document/d/YOUR_TOPIC_INBOX_DOC_ID?tab=t.0",
  });
  assert.deepEqual(loadConfig(".video-journal.json", options), example);
});

test("rejects malformed account values, wrong Google resource types, and unsafe URLs", (t) => {
  const options = fixture(t);
  const path = join(options.cwd, ".video-journal.json");
  for (const [field, value] of [
    ["driveAccountEmail", 42],
    ["driveAccountEmail", "Creator <creator@example.com>"],
    ["channelFolderUrl", example.topicInboxUrl],
    ["topicInboxUrl", example.channelFolderUrl],
    ["episodeTemplateUrl", "https://docs.google.com.example.net/document/d/demo/edit"],
    ["channelFolderUrl", "http://drive.google.com/drive/folders/demo"],
    ["channelFolderUrl", "https://creds:private@drive.google.com/drive/folders/demo"],
    ["topicInboxUrl", "https://docs.google.com/document/d/demo/edit?access_token=private"],
    ["episodeTemplateUrl", "https://docs.google.com/document/d/"],
  ]) {
    writeConfig(path, { ...example, [field]: value });
    assert.throws(() => loadConfig(path, options), (error) => {
      assert.ok(error.message.includes(field));
      assert.ok(!error.message.includes("private"));
      return true;
    });
  }
});

test("rejects using the topic inbox as the episode template even with different link formatting", (t) => {
  const options = fixture(t);
  writeConfig(join(options.cwd, ".video-journal.json"), {
    ...example,
    episodeTemplateUrl: example.topicInboxUrl + "?usp=sharing",
  });
  assert.throws(() => loadConfig(".video-journal.json", options), /must refer to separate Google Docs/);
});

test("accepts exactly 16 KiB and rejects larger configs and directories", (t) => {
  const options = fixture(t);
  const path = join(options.cwd, "bounded.json");
  const content = JSON.stringify(example);
  const padded = content + " ".repeat(16 * 1024 - Buffer.byteLength(content));
  writeFileSync(path, padded);
  assert.deepEqual(loadConfig(path, options), example);
  writeFileSync(path, padded + " ");
  assert.throws(() => loadConfig(path, options), /regular JSON file no larger than 16 KiB/);
  assert.throws(() => loadConfig(options.cwd, options), /regular JSON file no larger than 16 KiB/);
});

test("CLI rejects a named pipe without blocking", { skip: process.platform === "win32" }, (t) => {
  const { cwd } = fixture(t);
  const pipe = join(cwd, "config-pipe");
  const created = spawnSync("mkfifo", [pipe], { cwd, encoding: "utf8" });
  assert.ifError(created.error);
  assert.equal(created.status, 0, created.stderr);
  const result = spawnSync(process.execPath, [script, pipe], { cwd, encoding: "utf8", timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /regular JSON file no larger than 16 KiB/);
});

test("CLI errors do not print raw config content or extra field names", (t) => {
  const { cwd } = fixture(t);
  const path = join(cwd, "private.json");
  writeFileSync(path, '{"access_token":"very-sensitive-value"');
  let result = spawnSync(process.execPath, [script, path], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /not valid JSON/);
  assert.doesNotMatch(result.stderr, /very-sensitive-value|access_token/);

  writeConfig(path, { ...example, access_token: "very-sensitive-value" });
  result = spawnSync(process.execPath, [script, path], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unsupported fields/);
  assert.doesNotMatch(result.stderr, /very-sensitive-value|access_token/);
});

test("CLI emits only validated JSON on success", (t) => {
  const { cwd } = fixture(t);
  writeConfig(join(cwd, "example.json"));
  const result = spawnSync(process.execPath, [script, "example.json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), example);
});
