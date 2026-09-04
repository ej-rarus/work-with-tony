#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

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
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const FAILURE_HTML = (msg) => `<html><body style='font-family:sans-serif;padding:2rem'><h2>Sign-in failed</h2><p>${escapeHtml(msg)}</p></body></html>`;

function openBrowser(url, stderr) {
  const fallback = () => stderr(`Open this URL in your browser:\n${url}`);
  const [cmd, args, opts] =
    process.platform === "darwin" ? ["open", [url], {}]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url], {}]
    : ["xdg-open", [url], {}];
  try {
    const child = spawn(cmd, args, { ...opts, stdio: "ignore", detached: true });
    child.on("error", fallback);
    child.unref();
  } catch {
    fallback();
  }
}

// LinkedIn's redirect uses "localhost", which can resolve to either loopback
// address depending on the machine's resolver order. Listen on both IPv4 and
// IPv6 loopback so the callback lands regardless of which one the browser
// picks. A missing IPv6 stack is not an error - just skip that listener.
function waitForCallback(state) {
  return new Promise((resolve, reject) => {
    const servers = [];
    let settled = false;

    function finish(done) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const server of servers) server.close();
      done();
    }

    const handler = (req, res) => {
      if (!req.url.startsWith("/callback")) { res.writeHead(404).end(); return; }
      try {
        const { code } = parseCallback(req.url, state);
        res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);
        finish(() => resolve(code));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(FAILURE_HTML(error.message));
        finish(() => reject(error));
      }
    };

    const timer = setTimeout(() => finish(() => reject(new OAuthError("TIMEOUT", "No login callback within 120 seconds."))), CALLBACK_TIMEOUT_MS);

    function listenOn(address, { optional }) {
      const server = createServer(handler);
      server.on("error", (error) => {
        if (optional && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) return;
        if (error.code === "EADDRINUSE") {
          finish(() => reject(new OAuthError("PORT_IN_USE", `Port ${CALLBACK_PORT} is already in use.`)));
          return;
        }
        finish(() => reject(new OAuthError("LISTEN_FAILED", `Could not listen on port ${CALLBACK_PORT}: ${error.message}`)));
      });
      server.listen(CALLBACK_PORT, address);
      servers.push(server);
    }

    listenOn("127.0.0.1", { optional: false });
    listenOn("::1", { optional: true });
  });
}

export async function runAuth(deps = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    stdout = (l) => process.stdout.write(`${l}\n`),
    stderr = (l) => process.stderr.write(`${l}\n`),
    waitForCallback: waitForCallbackImpl = waitForCallback,
    openBrowser: openBrowserImpl = openBrowser,
  } = deps;
  const secrets = [];
  try {
    const home = getHome(env);
    const { clientId, clientSecret } = loadConfig(home);
    secrets.push(clientSecret);
    const state = generateState();
    const url = buildAuthorizeUrl({ clientId, state });
    stderr("Opening LinkedIn sign-in in your browser...");
    openBrowserImpl(url, stderr);
    const code = await waitForCallbackImpl(state);
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
  runAuth()
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
