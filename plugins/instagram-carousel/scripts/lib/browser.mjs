import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BROWSER_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

export class BrowserError extends Error {
  constructor(message, code = "BROWSER_ERROR") {
    super(message);
    this.name = "BrowserError";
    this.code = code;
  }
}

async function executable(candidate) {
  try {
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveBrowser(explicitPath) {
  if (explicitPath !== undefined) {
    const resolved = path.resolve(explicitPath);
    if (!(await executable(resolved))) throw new BrowserError(`Browser executable is missing, not a regular file, symlinked, or not executable: ${resolved}`, "BROWSER_NOT_FOUND");
    return resolved;
  }
  for (const candidate of BROWSER_CANDIDATES) {
    if (await executable(candidate)) return candidate;
  }
  throw new BrowserError("Chrome or Chromium was not found. Pass its executable with --browser.", "BROWSER_NOT_FOUND");
}

function collect(child, { kind, output, timeoutMs, outputLimit }) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    let size = 0;
    let settled = false;
    let lastScreenshotSize = -1;
    let stableScreenshotChecks = 0;
    const terminateChild = () => {
      try {
        if (process.platform === "win32") child.kill("SIGTERM");
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, 500).unref();
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(completionPoll);
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateChild();
      if (error) reject(error);
      else resolve(result);
    };
    const result = (code = 0) => ({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), code });
    const timer = setTimeout(() => finish(null, new BrowserError(`Browser timed out: ${result().stderr.slice(0, 500)}`, "BROWSER_TIMEOUT")), timeoutMs);
    const append = (target, chunk) => {
      size += chunk.length;
      if (size > outputLimit) {
        finish(null, new BrowserError("Browser output exceeded the safety limit.", "BROWSER_OUTPUT_LIMIT"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk) => append(stdout, chunk));
    child.stderr.on("data", (chunk) => append(stderr, chunk));
    child.on("error", (error) => finish(null, new BrowserError(`Browser failed to start: ${error.message}`)));
    const completionPoll = setInterval(async () => {
      if (settled) return;
      if (kind === "dump" && Buffer.concat(stdout).includes(Buffer.from("</html>"))) {
        finish(result());
        return;
      }
      if (kind === "screenshot") {
        try {
          const stat = await lstat(output);
          if (!stat.isFile() || stat.size <= 24) return;
          if (stat.size === lastScreenshotSize) stableScreenshotChecks += 1;
          else stableScreenshotChecks = 0;
          lastScreenshotSize = stat.size;
          if (stableScreenshotChecks >= 1) finish(result());
        } catch (error) {
          if (error.code !== "ENOENT") finish(null, new BrowserError(`Screenshot could not be checked: ${error.message}`));
        }
      }
    }, 100);
    child.on("exit", (code) => {
      if (settled) return;
      setTimeout(() => {
        if (settled) return;
        if (code !== 0) {
          finish(null, new BrowserError(`Browser exited with code ${code}: ${result(code).stderr.slice(0, 500)}`, "BROWSER_EXIT"));
          return;
        }
        finish(result(code));
      }, 100);
    });
  });
}

async function removeProfile(profile) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!new Set(["EBUSY", "ENOTEMPTY", "EPERM"]).has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

export async function runChrome({ browserPath, kind, url, output, width = 1080, height = 1350, timeoutMs = 30000 }) {
  if (!new Set(["dump", "screenshot"]).has(kind)) throw new BrowserError(`Unsupported browser operation: ${kind}.`);
  const profile = await mkdtemp(path.join(tmpdir(), "instagram-carousel-chrome-"));
  try {
    const args = [
      "--headless=new",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-extensions",
      "--disable-features=AutofillServerCommunication,MediaRouter,OptimizationHints",
      "--disable-gpu",
      "--disable-sync",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--no-first-run",
      "--run-all-compositor-stages-before-draw",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=3000",
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`
    ];
    if (kind === "dump") args.push("--dump-dom");
    if (kind === "screenshot") args.push(`--screenshot=${output}`);
    args.push(url);
    const child = spawn(browserPath, args, { shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    return await collect(child, { kind, output, timeoutMs, outputLimit: 2 * 1024 * 1024 });
  } finally {
    await removeProfile(profile);
  }
}

export const browserCandidates = Object.freeze([...BROWSER_CANDIDATES]);
