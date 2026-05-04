import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const OUT = "/tmp/remi-shots";
await mkdir(OUT, { recursive: true });

const targets = [
  { name: "01-login-light", url: "http://localhost:3000/", colorScheme: "light" },
  { name: "02-login-dark", url: "http://localhost:3000/", colorScheme: "dark" },
  {
    name: "03-login-filled-light",
    url: "http://localhost:3000/",
    colorScheme: "light",
    actions: async (page) => {
      await page.locator('input[type="email"]').fill("aftab@example.com");
      await page.locator("body").click({ position: { x: 1, y: 1 } });
    },
  },
];

const errors = [];
const browser = await chromium.launch();
try {
  for (const t of targets) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: t.colorScheme,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${t.name}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${t.name} console: ${m.text()}`);
    });
    const resp = await page.goto(t.url, { waitUntil: "networkidle", timeout: 20_000 });
    if (t.actions) await t.actions(page);
    console.log(`${t.name} -> ${resp?.status()} ${resp?.url()}`);
    await page.screenshot({
      path: `${OUT}/${t.name}.png`,
      fullPage: true,
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.log("\n--- ERRORS ---");
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log("\nNo runtime errors.");
}
