// Drives index.html in Chromium with a fake clock (Asia/Taipei) and seeded localStorage, and reads
// what the page shows: the status chip, the split line under the big number, the payday and the
// per-day log. Run with `npm test` (installs nothing but Playwright; see CLAUDE.md, Testing).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(file, (err, data) => {
      res.writeHead(err ? 404 : 200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// 月薪 64,000: 2,133.33 a day, 266.67 an overtime hour. Insurance off, so the figures are gross.
const SALARY = 64000;
const cfgWith = (today, extra = {}) => ({
  salary: SALARY,
  startDate: "2026-11-01",
  rota: 1,
  lastBackup: "2026-11-19",
  ins: { labor: 0, health: 0, dependents: 0, net: false },
  today: { type: "normal", shift: 0, punch: 0, dutyPay: 1500, leave: { kind: "", from: "", to: "" }, ...today },
  ...extra,
});
const at = (local) => new Date(`${local}+08:00`);

/** Opens the page at `time` with `cfg` saved; returns the page and a reader for the shown text. */
async function open(cfg, time) {
  const context = await browser.newContext({ serviceWorkers: "block", timezoneId: "Asia/Taipei" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((c) => localStorage.setItem("salary-meter-v1", JSON.stringify(c)), cfg);
  await page.clock.install({ time: at(time) });
  await page.goto(base);
  await page.clock.runFor(1000);
  const read = async () => ({
    status: await page.textContent("#status"),
    split: (await page.innerText("#split")).replace(/\s+/g, " "),
    payday: await page.textContent("#pdDate"),
  });
  const log = () => page.evaluate(() => JSON.parse(localStorage.getItem("salary-meter-extra-log") || "{}"));
  return { page, read, log, errors, close: () => context.close() };
}

test("a workday at 15:00 has 3 of its 8 paid hours left", async () => {
  const p = await open(cfgWith({ date: "2026-11-18" }), "2026-11-18T15:00:00");
  const shown = await p.read();
  assert.equal(shown.status, "跳表中");
  assert.match(shown.split, /到 18:00 還會再入帳 800/); // 3 of 8 hours left, so 1,333 earned
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("lunch doesn't count, and before the shift nothing has", async () => {
  const lunch = await open(cfgWith({ date: "2026-11-18" }), "2026-11-18T12:30:00");
  assert.equal((await lunch.read()).status, "休息中");
  assert.match((await lunch.read()).split, /到 18:00 還會再入帳 1,333/); // 3 of 8 hours done, 5 left
  await lunch.close();
  const early = await open(cfgWith({ date: "2026-11-18" }), "2026-11-18T08:00:00");
  assert.equal((await early.read()).status, "上班前");
  await early.close();
});

test("weekday overtime: punched out at 20:00 is 2 hours at ×4/3, logged the next day", async () => {
  const punch = +at("2026-11-18T20:00:00");
  const p = await open(cfgWith({ date: "2026-11-18", punch }), "2026-11-18T21:00:00");
  assert.equal((await p.read()).status, "已下班");
  assert.match((await p.read()).split, /加班費 711/); // 2 × 266.67 × 4/3
  await p.page.clock.setSystemTime(at("2026-11-19T09:30:00"));
  await p.page.clock.runFor(1000);
  const rec = (await p.log())["2026-11-18"];
  assert.equal(rec.extra, 711);
  assert.equal(rec.ot, 2 * 3600e3);
  await p.close();
});

test("rest day: every hour is extra, the first 2 at ×4/3 and the next at ×5/3", async () => {
  const punch = +at("2026-11-21T13:00:00"); // 09:00-13:00 less lunch from 12:00 = 3 hours
  const p = await open(cfgWith({ date: "2026-11-21", type: "rest", punch }), "2026-11-21T14:00:00");
  // 2 × 266.67 × 4/3 + 1 × 266.67 × 5/3 = 711.11 + 444.44
  assert.match((await p.read()).split, /休息日加班費 1,156/);
  await p.close();
});

test("holiday: punched out after 3 hours still earns the whole extra day", async () => {
  const punch = +at("2026-11-20T13:00:00");
  const p = await open(cfgWith({ date: "2026-11-20", type: "holiday", punch }), "2026-11-20T15:00:00");
  assert.match((await p.read()).split, /假日加發工資 2,133/);
  await p.close();
});

test("a night shift past midnight stays on the meter until its end", async () => {
  // 夜輪 19:30-07:30, break 00:00-01:00
  const p = await open(cfgWith({ date: "2026-11-18", shift: 2 }), "2026-11-19T02:00:00");
  const shown = await p.read();
  assert.equal(shown.status, "跳表中");
  // 19:30-02:00 less the break = 5.5 of 11 paid hours, 5.5 left
  assert.match(shown.split, /到 07:30 還會再入帳 1,067/);
  await p.close();
});

test("a day off says so; a day before the start date earns nothing", async () => {
  const off = await open(cfgWith({ date: "2026-11-22", type: "off" }), "2026-11-22T11:00:00");
  assert.equal((await off.read()).status, "放假中");
  await off.close();
  const before = await open(cfgWith({ date: "2026-10-30" }, { startDate: "2026-11-02" }), "2026-10-30T11:00:00");
  assert.equal((await before.read()).status, "還沒到職");
  await before.close();
});

test("事假 13:00-18:00 deducts 5 hours at 月薪 ÷ 240, logged the next day", async () => {
  const p = await open(cfgWith({ date: "2026-11-18", leave: { kind: "personal", from: "13:00", to: "18:00" } }), "2026-11-18T19:00:00");
  await p.page.clock.setSystemTime(at("2026-11-19T09:30:00"));
  await p.page.clock.runFor(1000);
  assert.equal((await p.log())["2026-11-18"].deduct, 1333); // 5 × 266.67
  await p.close();
});

test("a new day starts as the weekday rule says: Saturday is a day off", async () => {
  const p = await open(cfgWith({ date: "2026-11-20" }), "2026-11-20T20:00:00");
  await p.page.clock.setSystemTime(at("2026-11-21T10:00:00"));
  await p.page.clock.runFor(1000);
  assert.equal((await p.read()).status, "放假中");
  await p.close();
});

test("payday on the month's last day moves back over the weekend", async () => {
  // 2027-02-28 is a Sunday: paid Friday 2/26
  const p = await open(cfgWith({ date: "2027-02-10" }, { payDay: 0 }), "2027-02-10T10:00:00");
  assert.match((await p.read()).payday, /^2\/26（五）/);
  await p.close();
});
