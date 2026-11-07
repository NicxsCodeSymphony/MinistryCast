import { expect, test, type Page } from "@playwright/test";
import { requestLog } from "./support/supabaseMock";
import { goTo, openSection, signIn } from "./support/helpers";

/**
 * Network audit: counts every backend request the real client makes while
 * signing in, visiting each page, revisiting pages, and sitting idle.
 * Fails on polling (requests while idle) and on duplicate identical calls.
 *
 * Run with `pnpm test:network` (production build). Under the dev server React
 * StrictMode runs effects twice, so the duplicate check is skipped there.
 * AUDIT_REPORT=1 prints the full per-phase breakdown.
 */

/** The Vite dev server (port 1420) runs React StrictMode, which doubles effects. */
function underDevServer(page: Page) {
  return new URL(page.url()).port === "1420";
}

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

type Entry = (typeof requestLog)[number];

/** Realtime websockets / auth token refreshes are not data calls. */
function isDataCall(entry: Entry) {
  return entry.path.startsWith("/rest/v1") || entry.path.startsWith("/functions/v1") || entry.path.startsWith("/storage/v1");
}

function key(entry: Entry) {
  const rpc = entry.path.startsWith("/rest/v1/rpc/");
  // RPC args live in the body; table reads live in the query string.
  const detail = rpc ? entry.body : decodeURIComponent(entry.search);
  return `${entry.method} ${entry.path}${detail ? ` ${detail}` : ""}`;
}

function summarize(entries: Entry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries.filter(isDataCall)) {
    counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1);
  }
  return counts;
}

function duplicates(entries: Entry[]) {
  // Writes may legitimately repeat (different rows share a path), so only flag reads.
  const reads = entries.filter(
    (entry) => isDataCall(entry) && (entry.method === "GET" || entry.path.startsWith("/rest/v1/rpc/")),
  );
  return [...summarize(reads)].filter(([, n]) => n > 1);
}

const phases: { name: string; entries: Entry[] }[] = [];
let mark = 0;

function phase(name: string) {
  const entries = requestLog.slice(mark);
  mark = requestLog.length;
  phases.push({ name, entries });
  return entries;
}

async function settle(page: Page, ms = 2_500) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

function report() {
  const lines: string[] = [];
  for (const { name, entries } of phases) {
    const data = entries.filter(isDataCall);
    lines.push(`\n## ${name}: ${data.length} data calls`);
    for (const [k, n] of [...summarize(entries)].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${n}x  ${k.slice(0, 220)}`);
    }
  }
  return lines.join("\n");
}

test("network audit: no polling, no duplicate reads", async ({ page }) => {
  requestLog.length = 0;
  mark = 0;
  phases.length = 0;

  await signIn(page, { role: "admin" });
  await settle(page, 5_000);
  phase("sign-in + first dashboard");

  for (const section of ["Setlists", "Songs", "Sermon", "Categories", "Chat", "Settings"]) {
    await openSection(page, section);
    await settle(page);
    phase(`open ${section}`);
  }

  for (const section of ["Dashboard", "Songs", "Setlists"]) {
    await openSection(page, section);
    await settle(page);
    phase(`revisit ${section}`);
  }

  await openSection(page, "Dashboard");
  await settle(page);
  phase("back to Dashboard");

  await page.waitForTimeout(45_000);
  const idle = phase("idle 45s on Dashboard");

  await openSection(page, "Presentation");
  await settle(page);
  phase("open Presentation");
  await page.waitForTimeout(20_000);
  const idleLive = phase("idle 20s on Presentation");

  const text = report();
  await test.info().attach("network-report.txt", { body: text, contentType: "text/plain" });
  if (process.env.AUDIT_REPORT) console.log(text);

  const dupes = phases.flatMap(({ name, entries }) =>
    duplicates(entries).map(([k, n]) => `${name}: ${n}x ${k.slice(0, 200)}`),
  );

  expect.soft(idle.filter(isDataCall).map(key), "polling while idle on Dashboard").toEqual([]);
  expect.soft(idleLive.filter(isDataCall).map(key), "polling while idle on Presentation").toEqual([]);
  if (!underDevServer(page)) {
    expect.soft(dupes, "duplicate identical reads within one phase").toEqual([]);
  }
});

test("network audit: superadmin console", async ({ page }) => {
  requestLog.length = 0;
  mark = 0;
  phases.length = 0;

  await signIn(page, { role: "superadmin" });
  await settle(page, 5_000);
  phase("superadmin sign-in + overview");

  for (const path of ["/admin/churches", "/admin/accounts", "/admin/audit", "/admin", "/admin/churches"]) {
    await goTo(page, path);
    await settle(page);
    phase(`open ${path}`);
  }

  await page.waitForTimeout(30_000);
  const idle = phase("idle 30s on /admin/churches");

  const text = report();
  await test.info().attach("network-report-superadmin.txt", { body: text, contentType: "text/plain" });
  if (process.env.AUDIT_REPORT) console.log(text);

  const dupes = phases.flatMap(({ name, entries }) =>
    duplicates(entries).map(([k, n]) => `${name}: ${n}x ${k.slice(0, 200)}`),
  );
  expect.soft(idle.filter(isDataCall).map(key), "polling while idle on admin").toEqual([]);
  if (!underDevServer(page)) {
    expect.soft(dupes, "duplicate identical reads within one phase").toEqual([]);
  }
});
