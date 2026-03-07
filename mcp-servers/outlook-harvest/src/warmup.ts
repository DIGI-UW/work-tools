#!/usr/bin/env node
/**
 * Warmup — captures auth tokens for Outlook + Harvest.
 * Run before each session: npm run warmup
 *
 * Harvest: skips browser if HARVEST_ACCESS_TOKEN + HARVEST_ACCOUNT_ID are set.
 */
import { chromium } from "playwright";
import { captureToken as captureOutlookToken, listEmails, listEvents } from "./outlook-api.js";
import {
  isHarvestConfigured,
  captureHarvestToken,
  listProjects,
  getWeeklySummary,
} from "./harvest-api.js";

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? "";
const PROFILE_DIR = process.env.WORK_MCP_PROFILE ?? `${HOME_DIR}/.work-mcp-profile`;

const harvestNeedsBrowser =
  !process.env.HARVEST_ACCESS_TOKEN || !process.env.HARVEST_ACCOUNT_ID;

try {
  if (harvestNeedsBrowser) {
    // Shared browser: one Chrome instance, two tabs (Outlook + Harvest)
    process.stderr.write("[warmup] Opening browser for Outlook + Harvest auth...\n");

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    });

    try {
      // Capture both in parallel — two tabs in the same browser window
      const [outlookResult, harvestResult] = await Promise.allSettled([
        captureOutlookToken(context),
        captureHarvestToken(context),
      ]);

      if (outlookResult.status === "rejected") {
        console.error(`✗ Outlook: ${outlookResult.reason}`);
      }
      if (harvestResult.status === "rejected") {
        console.error(`✗ Harvest: ${harvestResult.reason}`);
      }
    } finally {
      await context.close();
    }
  } else {
    // Harvest has env vars — only need browser for Outlook
    process.stderr.write("[warmup] Harvest configured via env vars. Opening browser for Outlook...\n");
    await captureOutlookToken();
  }

  // Verify Outlook
  try {
    const emails = await listEmails("inbox", 3);
    console.error(`\n✓ Outlook: ${emails.length} emails`);
    emails.forEach((e, i) =>
      console.error(`  ${i + 1}. ${e.Subject} (${e.From.EmailAddress.Address})`),
    );

    const events = await listEvents();
    const active = events.filter((e) => !e.IsCancelled);
    console.error(`✓ Outlook: ${active.length} upcoming events`);
    active.slice(0, 3).forEach((e, i) =>
      console.error(`  ${i + 1}. ${e.Subject} (${e.Start.DateTime})`),
    );
  } catch (err) {
    console.error(`⚠ Outlook verification failed: ${(err as Error).message}`);
  }

  // Verify Harvest
  if (isHarvestConfigured()) {
    try {
      const projects = await listProjects();
      console.error(`\n✓ Harvest: ${projects.length} projects`);
      const summary = await getWeeklySummary(new Date().toISOString().slice(0, 10));
      console.error(`✓ Harvest: ${summary.total_hours}h this week`);
    } catch (err) {
      console.error(`⚠ Harvest verification failed: ${(err as Error).message}`);
    }
  } else {
    console.error("\n⚠ Harvest not configured (set env vars or sign in via browser next time)");
  }

  console.error("\n✓ Ready. Open Claude Desktop or run: npm start");
} catch (err) {
  console.error("Warmup failed:", (err as Error).message);
  process.exit(1);
}

process.exit(0);
