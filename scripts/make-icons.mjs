// Generates the PWA icons (a small ghost: unsynced data waiting for the network)
// as PNG files, with no image library. Run: node scripts/make-icons.mjs

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel((x + 0.5) / size, (y + 0.5) / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Ghost inside the central 60 % (safe zone for maskable icons). */
function ghost(accent) {
  const bg = hex("#0e0f13");
  const fg = hex(accent);
  return (x, y) => {
    const cx = 0.5;
    const top = 0.27;
    const r = 0.21;
    const bottom = 0.74;
    const inHead = (x - cx) ** 2 + (y - (top + r)) ** 2 <= r * r;
    const wave = 0.035 * Math.cos(((x - (cx - r)) / (2 * r)) * Math.PI * 6);
    const inBody = x >= cx - r && x <= cx + r && y >= top + r && y <= bottom + wave;
    const eye = (ex) => (x - ex) ** 2 / 0.0011 + (y - 0.46) ** 2 / 0.0025 <= 1;
    if ((inHead || inBody) && !eye(0.43) && !eye(0.57)) return fg;
    return bg;
  };
}

// Every app folder that declares "rezote": { "accent": "#rrggbb" } in its package.json.
const appsDir = new URL("../apps/", import.meta.url);
const apps = {};
for (const name of readdirSync(appsDir)) {
  const pkg = new URL(`${name}/package.json`, appsDir);
  if (!existsSync(pkg)) continue;
  const accent = JSON.parse(readFileSync(pkg, "utf8")).rezote?.accent;
  if (/^#[0-9a-f]{6}$/i.test(accent ?? "")) apps[name] = accent;
}
for (const [name, accent] of Object.entries(apps)) {
  const dir = new URL(`../apps/${name}/public/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const size of [192, 512]) writeFileSync(new URL(`icon-${size}.png`, dir), png(size, ghost(accent)));
  writeFileSync(
    new URL("icon.svg", dir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#0e0f13"/><path d="M29 48a21 21 0 0 1 42 0v26l-7-4-7 4-7-4-7 4-7-4-7 4z" fill="${accent}"/><ellipse cx="43" cy="46" rx="3.3" ry="5" fill="#0e0f13"/><ellipse cx="57" cy="46" rx="3.3" ry="5" fill="#0e0f13"/></svg>\n`,
  );
}
console.log(`Icons written for: ${Object.keys(apps).join(", ")}`);
