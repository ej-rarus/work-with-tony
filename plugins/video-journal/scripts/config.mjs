import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fields = ["channelName", "driveAccountEmail", "channelFolderUrl", "topicInboxUrl", "episodeTemplateUrl"];
const maxConfigBytes = 16 * 1024;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const googlePaths = {
  channelFolderUrl: { host: "drive.google.com", path: /^\/drive(?:\/u\/\d+)?\/folders\/([A-Za-z0-9_-]+)\/?$/, base: "/drive/folders/" },
  topicInboxUrl: { host: "docs.google.com", path: /^\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)(?:\/(?:edit|view))?\/?$/, base: "/document/d/" },
  episodeTemplateUrl: { host: "docs.google.com", path: /^\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)(?:\/(?:edit|view))?\/?$/, base: "/document/d/" },
};

function selectPath(explicitPath, env, cwd, homeDir) {
  const configuredPath = explicitPath ?? env.VIDEO_JOURNAL_CONFIG;
  if (configuredPath !== undefined) {
    if (!configuredPath.trim()) throw new Error("The selected config path is empty.");
    return resolve(cwd, configuredPath);
  }

  return join(homeDir, ".config", "work-with-tony", "video-journal.json");
}

function readConfigText(path) {
  // Check the open descriptor so a replaced path cannot turn the read into a blocking FIFO.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxConfigBytes) throw new Error();

    // The extra byte detects growth after fstat without reading an unbounded file.
    const buffer = Buffer.alloc(maxConfigBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > maxConfigBytes) throw new Error();
    return buffer.toString("utf8", 0, length);
  } finally {
    closeSync(fd);
  }
}

function requireText(config, field) {
  const value = typeof config[field] === "string" ? config[field].trim() : "";
  if (!value || controlCharacters.test(value)) throw new Error(field + " must be a nonempty single-line string.");
  return value;
}

function normalizeGoogleUrl(value, field) {
  const { host, path, base } = googlePaths[field];
  const error = new Error(field + " must be an HTTPS link to the expected Google Drive folder or Google Doc.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw error;
  }
  const match = path.exec(url.pathname);
  const hasCredentialQuery = [...url.searchParams.keys()].some((key) => /token|secret|password|credential|^api[_-]?key$|^key$/i.test(key));
  if (!/^https:\/\//i.test(value) || url.hostname !== host || url.port || url.username || url.password || hasCredentialQuery || !match) {
    throw error;
  }
  const id = match[1];
  return "https://" + host + base + id + (host === "docs.google.com" ? "/edit" : "");
}

export function loadConfig(explicitPath, { env = process.env, cwd = process.cwd(), homeDir = homedir() } = {}) {
  const path = selectPath(explicitPath, env, cwd, homeDir);
  let contents;
  try {
    contents = readConfigText(path);
  } catch {
    throw new Error("Cannot read the selected config. Use a regular JSON file no larger than 16 KiB. See config.example.json.");
  }

  let raw;
  try {
    raw = JSON.parse(contents);
  } catch {
    throw new Error("The selected config is not valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The selected config must be a JSON object.");
  }
  if (Object.keys(raw).some((field) => !fields.includes(field))) {
    throw new Error("The selected config has unsupported fields. Use the five fields in config.example.json.");
  }

  const config = Object.fromEntries(fields.map((field) => [field, requireText(raw, field)]));
  const account = config.driveAccountEmail;
  if (!/^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(account)) {
    throw new Error("driveAccountEmail must be the Google account's email address.");
  }
  config.driveAccountEmail = account.toLowerCase();
  for (const field of Object.keys(googlePaths)) config[field] = normalizeGoogleUrl(config[field], field);
  if (config.topicInboxUrl === config.episodeTemplateUrl) {
    throw new Error("topicInboxUrl and episodeTemplateUrl must refer to separate Google Docs.");
  }
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error("Usage: node scripts/config.mjs [config-path]");
    process.stdout.write(JSON.stringify(loadConfig(process.argv[2]), null, 2) + "\n");
  } catch (error) {
    process.stderr.write("video-journal: " + error.message + "\n");
    process.exitCode = 1;
  }
}
