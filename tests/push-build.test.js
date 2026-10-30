const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const FILES = ["tools/build-push.mjs", "js/messages.js", "js/reminders.js", "js/push-logic.js",
  "supabase/functions/push/template.ts", "supabase/functions/push/index.ts"];
const run = (root, ...args) => spawnSync(process.execPath, [path.join(root, "tools/build-push.mjs"), ...args], { encoding: "utf8" });

function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oila-push-"));
  for (const f of FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  return dir;
}

test("committed index.ts is up to date (--check exits 0)", () => {
  const r = run(ROOT, "--check");
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test("--check fails when index.ts is stale, and the generator fixes it", () => {
  const dir = copyRepo();
  try {
    fs.appendFileSync(path.join(dir, "js/messages.js"), "\n// changed\n");
    assert.notStrictEqual(run(dir, "--check").status, 0);
    assert.strictEqual(run(dir).status, 0);
    assert.strictEqual(run(dir, "--check").status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("generated function is one self-contained file", () => {
  const src = fs.readFileSync(path.join(ROOT, "supabase/functions/push/index.ts"), "utf8");
  assert.match(src, /from "npm:web-push@3\.6\.7"/);
  assert.match(src, /from "npm:@supabase\/supabase-js@2\.117\.0"/);
  assert.match(src, /root\.Messages = /);
  assert.match(src, /root\.Reminders = /);
  assert.match(src, /root\.PushLogic = /);
  assert.doesNotMatch(src, /\brequire\(|from "\.\.?\//);
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(src, /SUPABASE_SECRET_KEY/);
  assert.match(src, /Access-Control-Allow-Origin/);
});

test("generated function parses as JavaScript", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oila-push-"));
  try {
    const f = path.join(dir, "index.mjs");
    fs.copyFileSync(path.join(ROOT, "supabase/functions/push/index.ts"), f);
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    assert.strictEqual(r.status, 0, r.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
