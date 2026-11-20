# salary-meter

薪水跳表機: a taxi-meter style page that shows how much of today's pay has been earned, second by second, with overtime, days off, leave, shifts and labor/health insurance. A static PWA, no build and no npm for the page itself (`package.json` is only for the tests): `index.html` (all HTML, CSS and JS), `sw.js` (offline), `manifest.webmanifest`, `icons/`. GitHub Pages publishes `main` to https://kelvinlifu.github.io/salary-meter/. Not one of the seven personal apps (no hub, no SQLite, no PIN): settings live in the browser's `localStorage` only.

## Working with the user

- Reply in Traditional Chinese; UI text is Traditional Chinese.
- When a decision is the user's to make, ask with the AskUserQuestion tool (clickable options) — the user often replies from a phone.
- Once a change is done and checked, commit, push, open a PR and merge it without asking first (the user's standing permission). Merging publishes it: Pages redeploys `main` within a minute or two.

## Writing code (Karpathy guidelines)

- **Think first**: state assumptions; if a request reads two ways, ask (AskUserQuestion) instead of picking silently; say so when a simpler approach exists.
- **Simplest thing that works**: no features, abstractions or configurability beyond what was asked.
- **Surgical changes**: every changed line traces to the request; match the surrounding style (ES5 `var` and `function`, one IIFE, `$()` for `getElementById`).
- **Verifiable goals**: reproduce a bug first, then show it fixed.

## Testing

`test/meter.test.mjs` (node:test + Playwright, the only npm package, a devDependency - the page itself still has no build and no npm) serves the folder on a free port, opens it in Chromium in Asia/Taipei with service workers blocked, and checks a workday, lunch, weekday / rest-day / holiday pay, a night shift past midnight, a day off, the start date, leave, the new-day reset and the payday:

```bash
npm install --ignore-scripts   # once; Playwright's Chromium must be installed (npx playwright install chromium)
npm test
```

Each test seeds `localStorage` with `addInitScript`, installs the fake clock before `goto` (`page.clock.install`), lets the 200 ms tick run (`runFor`), jumps with `setSystemTime` (past midnight, into a new day), and reads `#status`, `#split` (not `#earned`, which rolls toward its figure), `#pdDate` and the log in `localStorage`. Add a test for a change's edges (night shifts, the new-day reset, month change, days off, the start date); reproduce a bug as a failing test first. Cloud sessions can't reach kelvinlifu.github.io: confirm a deploy from the `pages build and deployment` workflow run instead.

## Design

- `localStorage`: `salary-meter-v1` holds `cfg` (salary, days, shifts, `today`, `ins`, `numStyle`, `cycle`, `payDay`, `saveGoal`, `lastBackup`...), `salary-meter-extra-log` the per-day log of extra pay and leave deductions. Old saved shapes are migrated where `cfg` is loaded; keep that working when changing them. The settings' 備份 buttons export both as one JSON file (`{ app: "salary-meter", cfg, log }`) and restore from it (`validBackup` checks the file first); `cfg.lastBackup` drives the 該備份了 reminder after 30 days.
- `tick()` writes text through `put(id, text, html)`, which skips the write when nothing changed. An element written with `put` must not also be written directly elsewhere (that is why `#rule` is not).
- 存錢目標 (`cfg.saveGoal`, 0 = off) compares the month card's take-home so far with the goal and says when it will be reached at the calendar accrual rate. 今年戰績 (`yearStats`, worked out only while its card is open) is salary at the current rate month by month plus the log's extras, overtime hours and leave. The month card also shows the whole-month estimate and the month's overtime hours against the 46-hour limit (勞基法 §32).
- A new shift-day starts from `planned(key)`: the shift rotation when `cfg.cycle` is set (`days[i]` is a shift index or -1 for a day off, day 1 falls on `start`), else the `cfg.workDays` weekday rule. Only `tick()`'s new-day step moves `cfg.today.date`, and it first settles the day that ended into the log with `dayRec` (the log is otherwise written only while the page is open, so confirmed overtime would be lost when the app is closed before punching out). `currentShift` keeps last night's shift on the meter until it is punched out or 4 hours past its end, so the 下班了嗎？ question also shows after a night shift; once `cfg.today.date` is today it never goes back.
- `tick()` runs every 200 ms (skipped while the page is hidden) and updates everything but the big number; `frame()` (requestAnimationFrame) rolls the big number toward `earnedAt(...)` and redraws only when it moved. `currentShift` picks yesterday's shift while a night shift is still running; a new shift-day resets `today` to a normal workday, or to 放假 (`off`) when its weekday isn't in `cfg.workDays` (`getDay()` numbers, default Mon-Fri, ticked in the settings).
- The meter shows today only, at 月薪 ÷ 30 a day (`monthInfo().daily`): spread over the shift's paid hours on workdays and days off alike. The month card (本月薪水) accrues the month's salary (first month prorated 在職日數 ÷ 30), insurance and 職工福利金 (`cfg.welfare` %) / 勞退自提 (`cfg.selfPension` %) by calendar time from the month's start (or the start date) to its end, days off included - 月薪 ÷ 30 a day in a 30-day month, a little less or more in others, the whole salary by the month's end; it adds the log's extras for the overtime cycle (`otCycle`: the day after `cfg.otCut` last month to `otCut` this month, paid on the next payday, the month's last workday) and this month's deductions. The meter's day-off share is display only and never logged. `cfg.workDays` only picks which days start as 放假. `PAY_HOLIDAYS` is only for the payday: day `cfg.payDay` of the month, or its last day when 0, moved back over weekends and holidays. It lists weekday holidays through 2027; add the next year when 人事行政總處 publishes its calendar.
- This repo merged the claude.ai artifact version (薪水跳表機, which had grown the payday, overtime cycle, 福利金 and 勞退自提) on 2026-11-07; GitHub Pages is the one to use from then on.
- Pay rules follow 勞基法: weekday overtime ×4/3 then ×5/3 (§24), rest day ×4/3, ×5/3, ×8/3, holiday one extra day's wage (月薪 ÷ 30) for up to 8 hours (§39) - accrued over the first 8 hours on the meter, the whole day once punched out however early; the overtime hourly rate is 月薪 ÷ 240; overtime counts in whole `otUnit` minutes, capped at 4 hours past the scheduled end when not punched out. Leave pay ratios are in `LEAVES` (勞工請假規則). Insurance: labor 12.5 % × 20 %, health 5.17 % × 30 % per person (up to 3 dependents), pension 6 % by the employer, with the yearly grade tables `LABOR_GRADES` / `HEALTH_GRADES` - update them (and the year in `renderIns`'s text) when the government publishes new ones.
- Fonts: only IBM Plex Mono and Oswald come from Google Fonts (numbers); Chinese uses the phone's own font. Don't add a CJK web font back - it was 13 files on first load.

## Releasing

`sw.js` serves the app network-first, so a merged change shows on the next open; when the network hasn't answered in 3 seconds it serves the cached copy and the fresh one shows on the open after that. `index.html` registers it in the last `<script>`. Bump `CACHE` in `sw.js` when the cached files or fonts change, so old caches are dropped.
