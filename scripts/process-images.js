/**
 * scripts/process-images.js
 * Обработка изображений: лого → несколько размеров, фото → WebP
 * Запуск: node scripts/process-images.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC_IMAGE = path.resolve(__dirname, "..", "src", "image");
const ASSETS = path.resolve(__dirname, "..", "src", "assets", "images");
const BRAND_DIR = path.join(ASSETS, "brand");
const UPLOADS_DIR = path.join(ASSETS, "uploads");

fs.mkdirSync(BRAND_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

(async () => {
  // ── 1. Лого: квадратные версии разных размеров (для CSS border-radius: 50%) ──
  const logoPath = path.join(SRC_IMAGE, "logo.png");
  if (fs.existsSync(logoPath)) {
    const sizes = [32, 64, 128, 256, 512];
    for (const s of sizes) {
      const out = path.join(BRAND_DIR, `logo-${s}.png`);
      await sharp(logoPath).resize(s, s, { fit: "cover" }).png().toFile(out);
      console.log(`✓ logo-${s}.png  (${s}x${s})`);
    }
    // favicon — WebP не поддерживается favicon, нужен .ico/.png
    // 32x32 .ico формат не сделаем через sharp, но 32x32 png — ок для современных браузеров
    const faviconPath = path.resolve(__dirname, "..", "src", "favicon.png");
    await sharp(logoPath)
      .resize(32, 32, { fit: "cover" })
      .png()
      .toFile(faviconPath);
    console.log("✓ src/favicon.png  (32x32)");
  } else {
    console.warn("⚠ src/image/logo.png не найден");
  }

  // ── 2. Все фото → WebP, положить в src/assets/images/uploads/ ──
  const files = fs.readdirSync(SRC_IMAGE).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
  for (const f of files) {
    if (/^logo\.png$/i.test(f)) continue; // лого отдельно обработали
    const src = path.join(SRC_IMAGE, f);
    const stat = fs.statSync(src);
    const base = path.basename(f, path.extname(f));
    const out = path.join(UPLOADS_DIR, `${base}.webp`);

    const meta = await sharp(src).metadata();
    await sharp(src)
      .rotate() // авто-поворот по EXIF
      .webp({ quality: 85, effort: 4 })
      .toFile(out);
    const newStat = fs.statSync(out);
    const saved = ((1 - newStat.size / stat.size) * 100).toFixed(0);
    console.log(`✓ ${base}.webp  (${meta.width}x${meta.height}, ${(stat.size / 1024).toFixed(0)}KB → ${(newStat.size / 1024).toFixed(0)}KB, −${saved}%)`);
  }

  // ── 3. Удалить src/image/ ──
  fs.rmSync(SRC_IMAGE, { recursive: true, force: true });
  console.log("\n✓ src/image/ удалён");

  // ── 4. Итог ──
  console.log("\n=== Готово ===");
  console.log(`Лого: src/assets/images/brand/logo-{32,64,128,256,512}.png + src/favicon.png`);
  console.log(`Фото: src/assets/images/uploads/*.webp`);
})();
