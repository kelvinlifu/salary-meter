# salary-meter

薪水跳表機: a taxi-meter style page that shows how much of today's pay has been earned, second by second, with overtime, days off, leave, shifts and labor/health insurance. A static PWA, no build and no npm: `index.html` (all HTML, CSS and JS), `sw.js` (offline), `manifest.webmanifest`, `icons/`. GitHub Pages publishes `main` to https://kelvinlifu.github.io/salary-meter/. Not one of the seven personal apps (no hub, no SQLite, no PIN): settings live in the browser's `localStorage` only.

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

There is no test suite. Serve the folder and drive it with Playwright (pre-installed in cloud sessions), using its fake clock to pick the moment:

```bash
python3 -m http.server 8765        # from the repo root, in the background
TZ=Asia/Taipei node check.js       # a throwaway script in the scratchpad, not in the repo
```

In the script: `page.clock.install({ time: new Date('2026-11-06T15:00:00+08:00') })` before `goto`, `page.clock.runFor(ms)` to let the 200 ms tick run, `page.clock.setSystemTime(...)` to jump (past midnight, into a new month), `addInitScript` to seed `localStorage`. Read `#status`, `#earned`'s `aria-label`, `#split`, `#logList`, the month card (`#mBase`, `#mExtra`...). Check the edges a change can touch: night shifts crossing midnight, the new-day reset, month change, days off, the start date. Cloud sessions can't reach kelvinlifu.github.io: confirm a deploy from the `pages build and deployment` workflow run instead.

## Design

- `localStorage`: `salary-meter-v1` holds `cfg` (salary, days, shifts, `today`, `ins`, `numStyle`, `cycle`, `items`...), `salary-meter-extra-log` the per-day log of extra pay and leave deductions. Old saved shapes are migrated where `cfg` is loaded; keep that working when changing them. The settings' 備份 buttons export both as one JSON file (`{ app: "salary-meter", cfg, log }`) and restore from it.
- A new shift-day starts from `planned(key)`: the shift rotation when `cfg.cycle` is set (`days[i]` is a shift index or -1 for a day off, day 1 falls on `start`), else the `cfg.workDays` weekday rule. Only `tick()`'s new-day step moves `cfg.today.date`, and it first settles the day that ended into the log with `dayRec` (the log is otherwise written only while the page is open, so confirmed overtime would be lost when the app is closed before punching out). `currentShift` keeps last night's shift on the meter until it is punched out or 4 hours past its end, so the 下班了嗎？ question also shows after a night shift; once `cfg.today.date` is today it never goes back.
- `tick()` runs every 200 ms (skipped while the page is hidden) and updates everything but the big number; `frame()` (requestAnimationFrame) rolls the big number toward `earnedAt(...)` and redraws only when it moved. `currentShift` picks yesterday's shift while a night shift is still running; a new shift-day resets `today` to a normal workday, or to 放假 (`off`) when its weekday isn't in `cfg.workDays` (`getDay()` numbers, default Mon-Fri, ticked in the settings).
- The meter shows today only, at 月薪 ÷ 30 a day (`monthInfo().daily`): spread over the shift's paid hours on workdays and days off alike. The month card (本月薪水) accrues the month's salary (first month prorated 在職日數 ÷ 30), insurance and 職工福利金 (`cfg.welfare` %) / 勞退自提 (`cfg.selfPension` %) by calendar time from the month's start (or the start date) to its end, days off included - 月薪 ÷ 30 a day in a 30-day month, a little less or more in others, the whole salary by the month's end; it adds the log's extras for the overtime cycle (`otCycle`: the day after `cfg.otCut` last month to `otCut` this month, paid on the next payday, the month's last workday) and this month's deductions. The meter's day-off share is display only and never logged. `cfg.workDays` only picks which days start as 放假. `PAY_HOLIDAYS` is only for the payday (the month's last workday).
- This repo merged the claude.ai artifact version (薪水跳表機, which had grown the payday, overtime cycle, 福利金 and 勞退自提) on 2026-11-07; GitHub Pages is the one to use from then on.
- Pay rules follow 勞基法: weekday overtime ×4/3 then ×5/3 (§24), rest day ×4/3, ×5/3, ×8/3, holiday one extra day's wage (月薪 ÷ 30) for up to 8 hours (§39); the overtime hourly rate is 月薪 ÷ 240; overtime counts in whole `otUnit` minutes, capped at 4 hours past the scheduled end when not punched out. Leave pay ratios are in `LEAVES` (勞工請假規則). Insurance: labor 12.5 % × 20 %, health 5.17 % × 30 % per person (up to 3 dependents), pension 6 % by the employer, with the yearly grade tables `LABOR_GRADES` / `HEALTH_GRADES` - update them (and the year in `renderIns`'s text) when the government publishes new ones.
- Fonts: only IBM Plex Mono and Oswald come from Google Fonts (numbers); Chinese uses the phone's own font. Don't add a CJK web font back - it was 13 files on first load.

## Releasing

`sw.js` serves the app network-first, so a merged change shows on the next open; when the network hasn't answered in 3 seconds it serves the cached copy and the fresh one shows on the open after that. `index.html` registers it in the last `<script>`. Bump `CACHE` in `sw.js` when the cached files or fonts change, so old caches are dropped.
