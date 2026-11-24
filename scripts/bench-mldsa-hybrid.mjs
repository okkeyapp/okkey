/**
 * Measure ML-DSA-65 keygen/sign/verify in a browser page and in an MV3 service worker.
 *
 * Usage (from the repo root, after `yarn build:wasm`):
 *   node scripts/bench-mldsa-hybrid.mjs
 *
 * Browser: headless Chrome page.evaluate over the wasm-pack web bundle.
 * MV3: the same bundle loaded by a temporary extension service worker.
 * Branded Chrome may ignore --load-extension; set EXTENSION_CHROME_BIN to
 * Chrome for Testing or Playwright's Chromium when that happens.
 * Prints JSON with medians over a small sample.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = join(repoRoot, "packages/crypto/dist");
const chromeBin = process.env.CHROME_BIN || "google-chrome";
const extensionChromeBin = process.env.EXTENSION_CHROME_BIN || chromeBin;
const iterations = Number(process.env.MLDSA_BENCH_ITERS || 5);

const benchSource = `
  const enc = new TextEncoder();
  const message = enc.encode("okkey-mldsa65-bench");
  async function once() {
    const keygenStart = performance.now();
    const material = mldsa65_keypair();
    const keygenMs = performance.now() - keygenStart;
    const seed = material.slice(0, mldsa65_seed_len());
    const publicKey = material.slice(mldsa65_seed_len());
    const signStart = performance.now();
    const signature = mldsa65_sign(seed, message);
    const signMs = performance.now() - signStart;
    const verifyStart = performance.now();
    const ok = mldsa65_verify(publicKey, message, signature);
    const verifyMs = performance.now() - verifyStart;
    if (!ok) throw new Error("verify failed");
    return { keygenMs, signMs, verifyMs };
  }
  const samples = [];
  for (let i = 0; i < ${iterations}; i++) samples.push(await once());
  const median = (name) => {
    const values = samples.map((sample) => sample[name]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return {
    iterations: samples.length,
    medianMs: { keygen: median("keygenMs"), sign: median("signMs"), verify: median("verifyMs") },
  };
`;

function startChrome(binary, args, userDataDir) {
  const child = spawn(binary, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    ...args,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  const port = new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error(`chrome did not open a debugging port\n${stderr}`)), 20000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`chrome exited ${code}\n${stderr}`));
    });
  });
  return { child, port };
}

async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen);
    ws.addEventListener("error", () => reject(new Error("cdp websocket failed")));
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params) => {
    const next = ++id;
    ws.send(JSON.stringify({ id: next, method, params }));
    return new Promise((resolveSend) => pending.set(next, resolveSend));
  };
  await send("Runtime.enable");
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  ws.close();
  if (result.result?.exceptionDetails) {
    throw new Error(JSON.stringify(result.result.exceptionDetails));
  }
  return result.result?.result?.value;
}

function serveWasm(dir) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/") {
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><script type="module">
        import init, * as wasm from "/okkey_crypto_engine.js";
        await init("/okkey_crypto_engine_bg.wasm");
        Object.assign(globalThis, wasm);
        globalThis.__bench = (async () => { ${benchSource} })();
      </script>`);
      return;
    }
    const file = join(dir, path.slice(1));
    try {
      const body = readFileSync(file);
      res.setHeader("content-type", file.endsWith(".wasm") ? "application/wasm" : "text/javascript");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("missing");
    }
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen(server));
  });
}

async function benchBrowser() {
  const server = await serveWasm(wasmDir);
  const { port: httpPort } = server.address();
  const userData = mkdtempSync(join(tmpdir(), "okkey-mldsa-page-"));
  const { child, port } = startChrome(chromeBin, [`http://127.0.0.1:${httpPort}/`], userData);
  try {
    const debugPort = await port;
    const deadline = Date.now() + 20000;
    let page;
    while (!page && Date.now() < deadline) {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      page = targets.find((target) => target.type === "page");
      if (!page) await new Promise((r) => setTimeout(r, 200));
    }
    if (!page) throw new Error("browser page target missing");
    await new Promise((r) => setTimeout(r, 500));
    return await evaluate(page.webSocketDebuggerUrl, "globalThis.__bench");
  } finally {
    child.kill("SIGKILL");
    server.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

async function benchExtension() {
  const dir = mkdtempSync(join(tmpdir(), "okkey-mldsa-bench-"));
  cpSync(join(wasmDir, "okkey_crypto_engine.js"), join(dir, "okkey_crypto_engine.js"));
  cpSync(join(wasmDir, "okkey_crypto_engine_bg.wasm"), join(dir, "okkey_crypto_engine_bg.wasm"));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "Okkey ML-DSA bench",
    version: "0.0.1",
    background: { service_worker: "okkey-mldsa-bench-sw.js", type: "module" },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  }));
  writeFileSync(join(dir, "okkey-mldsa-bench-sw.js"), `
    import init, * as wasm from "./okkey_crypto_engine.js";
    globalThis.__bench = (async () => {
      await init(chrome.runtime.getURL("okkey_crypto_engine_bg.wasm"));
      Object.assign(globalThis, wasm);
      ${benchSource}
    })();
  `);
  const userData = mkdtempSync(join(tmpdir(), "okkey-mldsa-chrome-"));
  const { child, port } = startChrome(extensionChromeBin, [
    `--disable-extensions-except=${dir}`,
    `--load-extension=${dir}`,
    "about:blank",
  ], userData);
  try {
    const debugPort = await port;
    const deadline = Date.now() + 20000;
    let worker;
    while (!worker && Date.now() < deadline) {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      worker = targets.find((target) => target.type === "service_worker" && String(target.url).includes("okkey-mldsa-bench-sw.js"));
      if (!worker) await new Promise((r) => setTimeout(r, 250));
    }
    if (!worker) {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      throw new Error(`mv3 service worker target missing: ${JSON.stringify(targets.map((target) => target.url))}`);
    }
    await new Promise((r) => setTimeout(r, 300));
    return await evaluate(worker.webSocketDebuggerUrl, `(async () => {
      const start = Date.now();
      while (!globalThis.__bench && Date.now() - start < 15000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!globalThis.__bench) {
        return { error: "benchmark did not start" };
      }
      return await globalThis.__bench;
    })()`);
  } finally {
    child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
}

const browser = await benchBrowser();
const extension = await benchExtension();
console.log(JSON.stringify({
  iterations,
  browserChrome: chromeBin,
  extensionChrome: extensionChromeBin,
  browser,
  mv3ServiceWorker: extension,
}, null, 2));
