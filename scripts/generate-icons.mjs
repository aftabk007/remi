import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

// Simple "R" mark on a dark rounded-square. Inner element ~60% so it works
// as a maskable icon (Android adaptive shapes won't crop the letter).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0a"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="300" font-weight="700" fill="#ffffff">R</text>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
await sharp(buf).resize(32, 32).png().toFile("public/favicon-32.png");

console.log("✓ Icons generated in public/");
