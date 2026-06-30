// Drive a real headless Chrome via CDP, visit each NPCI product circulars page,
// and capture the /api/circulars/* XHR the SPA fires — this is how the real
// file-listing endpoint and its query params were discovered. Re-run if NPCI changes.
// Usage: node scripts/capture-npci-endpoint.mjs   (prints product -> request URLs as JSON)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const PRODUCTS = ["upi", "imps", "rupay", "nach", "netc", "aeps", "others"];
const WAIT_MS = 12000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDataDir = mkdtempSync(join(tmpdir(), "npci-cdp-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-blink-features=AutomationControlled",
  `--user-agent=${UA}`,
  "--window-size=1280,900",
  "about:blank",
]);
chrome.on("error", (e) => { console.error("chrome spawn error", e); process.exit(1); });

async function getJson(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return r.json();
}

// Wait for the debugging endpoint.
let version;
for (let i = 0; i < 40; i++) {
  try { version = await getJson("/json/version"); break; } catch { await sleep(250); }
}
if (!version) { console.error("CDP endpoint never came up"); chrome.kill(); process.exit(1); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});

let msgId = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method) {
    for (const l of listeners) l(m);
  }
});
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Network.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);

const captured = [];
listeners.push((m) => {
  if (m.method === "Network.requestWillBeSent" && m.sessionId === sessionId) {
    const url = m.params.request.url;
    if (url.includes("/api/circulars")) captured.push(url);
  }
});

const results = {};
for (const product of PRODUCTS) {
  captured.length = 0;
  const pageUrl = `https://www.npci.org.in/circulars/${product}`;
  await send("Page.navigate", { url: pageUrl }, sessionId);
  await sleep(WAIT_MS);
  const searchHits = captured.filter((u) => u.includes("searchByName"));
  let slug = null;
  for (const u of searchHits) {
    const s = new URL(u).searchParams.get("slug");
    if (s) { slug = s; break; }
  }
  results[product] = { slug, searchByName: searchHits, allCircularReqs: [...new Set(captured)] };
  console.error(`[${product}] slug=${slug ?? "(none)"}  (${searchHits.length} searchByName req)`);
}

console.log("\n===JSON===");
console.log(JSON.stringify(results, null, 2));

ws.close();
chrome.kill();
process.exit(0);
