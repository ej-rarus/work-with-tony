#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { ConfigError, getHome, loadConfig, saveToken } from "./lib/config.mjs";
import { createClient } from "./lib/linkedin-api.mjs";
import {
  CALLBACK_PORT, CALLBACK_TIMEOUT_MS, OAuthError, buildAuthorizeUrl, exchangeCode, generateState, parseCallback,
} from "./lib/oauth.mjs";
import { redact } from "./lib/redact.mjs";

const SUCCESS_HTML = "<html><body style='font-family:sans-serif;padding:2rem'><h2>Signed in.</h2><p>You can close this tab and return to the terminal.</p></body></html>";
const FAILURE_HTML = (msg) => `<html><body style='font-family:sans-serif;padding:2rem'><h2>Sign-in failed</h2><p>${msg}</p></body></html>`;

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    process.stderr.write(`Open this URL in your browser:\n${url}\n`);
  }
}

function waitForCallback(state) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url.startsWith("/callback")) { res.writeHead(404).end(); return; }
      try {
        const { code } = parseCallback(req.url, state);
        res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);
        finish(() => resolve(code));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(FAILURE_HTML(error.message));
        finish(() => reject(error));
      }
    });
    const timer = setTimeout(() => finish(() => reject(new OAuthError("TIMEOUT", "No login callback within 120 seconds."))), CALLBACK_TIMEOUT_MS);
    function finish(done) { clearTimeout(timer); server.close(); done(); }
    server.on("error", (error) => finish(() => reject(new OAuthError("TIMEOUT", `Could not listen on port ${CALLBACK_PORT}: ${error.message}`))));
    server.listen(CALLBACK_PORT, "127.0.0.1");
  });
}

export async function runAuth(deps = {}) {
  const { env = process.env, fetchImpl = fetch, stdout = (l) => process.stdout.write(`${l}\n`), stderr = (l) => process.stderr.write(`${l}\n`) } = deps;
  const secrets = [];
  try {
    const home = getHome(env);
    const { clientId, clientSecret } = loadConfig(home);
    secrets.push(clientSecret);
    const state = generateState();
    const url = buildAuthorizeUrl({ clientId, state });
    stderr("Opening LinkedIn sign-in in your browser...");
    openBrowser(url);
    const code = await waitForCallback(state);
    const { accessToken, expiresAt } = await exchangeCode({ clientId, clientSecret, code, fetchImpl });
    secrets.push(accessToken);
    const { sub, name } = await createClient({ accessToken, fetchImpl }).getUserInfo();
    const token = { accessToken, expiresAt, personUrn: `urn:li:person:${sub}`, name };
    saveToken(home, token);
    stdout(JSON.stringify({ ok: true, name, personUrn: token.personUrn, expiresAt }));
    return 0;
  } catch (error) {
    stdout(JSON.stringify({ ok: false, code: error.code ?? "UNKNOWN", message: redact(error.message, secrets), hint: error.hint ?? "" }));
    return error instanceof ConfigError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAuth().then((code) => process.exit(code));
}
