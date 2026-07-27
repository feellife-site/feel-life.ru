/**
 * Build script для проекта MIA IRE (feellife)
 *
 * Запуск: `node src/build.js`
 *
 * Читает:
 *   src/_partials/   — повторяющиеся фрагменты HTML
 *   src/pages/       — HTML-страницы
 *   src/data/        — статические данные (навигация, направления, seo, fallback-сайта)
 *   src/content/     — управляемый через Decap CMS контент (Markdown/JSON)
 *   src/admin/       — админка Decap CMS (копируется в dist/admin/)
 *   src/assets/      — статика (CSS, шрифты, изображения)
 *
 * Пишет:
 *   dist/            — финальный статический сайт
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const PARTIALS_DIR = path.join(SRC, "_partials");
const PAGES_DIR = path.join(SRC, "pages");
const DATA_DIR = path.join(SRC, "data");
const CONTENT_DIR = path.join(SRC, "content");
const ADMIN_DIR = path.join(SRC, "admin");
const ASSETS_DIR = path.join(SRC, "assets");

// ───────── Утилиты ─────────

function readFile(p) {
  return fs.readFileSync(p, "utf-8");
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const full = path.join(dir, f);
    const data = JSON.parse(readFile(full));
    if (data && (data.slug || path.basename(f, ".json"))) {
      const slug = data.slug || path.basename(f, ".json");
      out[slug] = data;
    }
  }
  return out;
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const full = path.join(dir, f);
    const raw = readFile(full);
    const { data, body } = parseFrontmatter(raw);
    if (data.draft) continue;
    data.body = body;
    data.slug = data.slug || path.basename(f, ".md");
    items.push(data);
  }
  // По дате убывания
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items;
}

// Минимальный парсер YAML frontmatter (без зависимостей)
function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = parseSimpleYaml(m[1]);
  return { data, body: m[2] };
}

function parseSimpleYaml(text) {
  const out = {};
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    let val = m[2];
    // Пустое значение → многострочный блок
    if (val === "" || val === "|" || val === ">") {
      const block = [];
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) {
        block.push(lines[i].replace(/^ {2}/, ""));
        i++;
      }
      out[key] = block.join("\n").trim();
      continue;
    }
    if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (val === "null" || val === "~") val = null;
    else if (/^["'].*["']$/.test(val)) val = val.slice(1, -1);
    else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
    out[key] = val;
    i++;
  }
  return out;
}

// Минимальный Markdown → HTML (без зависимостей)
function mdToHtml(md) {
  let html = md.replace(/\r\n/g, "\n");
  // Нормализуем переносы строк
  html = html.trim();

  // Блоки кода (```) — оставляем как <pre><code>
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`);

  // Цитаты
  html = html.replace(/^>\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "<br>");

  // Заголовки
  html = html.replace(/^####\s+(.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");

  // Списки (последовательные строки)
  html = html.replace(/(^|\n)((?:- .*(?:\n|$))+)/g, (_, pre, block) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^-\s+/, "")).map((l) => `<li>${inline(l)}</li>`).join("");
    return `${pre}<ul>${items}</ul>`;
  });
  html = html.replace(/(^|\n)((?:\d+\. .*(?:\n|$))+)/g, (_, pre, block) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^\d+\.\s+/, "")).map((l) => `<li>${inline(l)}</li>`).join("");
    return `${pre}<ol>${items}</ol>`;
  });

  // Параграфы: всё что осталось отдельными строками
  html = html.split(/\n{2,}/).map((chunk) => {
    chunk = chunk.trim();
    if (!chunk) return "";
    if (/^<(h\d|ul|ol|pre|blockquote|figure|p|img|hr)/.test(chunk)) return chunk;
    return `<p>${inline(chunk)}</p>`;
  }).join("\n");

  return html;
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatPrice(n) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function relativeHref(p) {
  // p — абсолютный путь вида "/blog/foo/"
  return p;
}

// ───────── Загрузка данных ─────────

function loadData() {
  // Site — приоритет CMS (content/settings/site.json), fallback в data/site.js
  let site = {};
  const cmsSite = path.join(CONTENT_DIR, "settings", "site.json");
  if (fs.existsSync(cmsSite)) site = JSON.parse(readFile(cmsSite));
  // дополняем из JS (там есть brand.shortName и пр.)
  Object.assign(site, require(path.join(DATA_DIR, "site.js")));

  const navigation = require(path.join(DATA_DIR, "navigation.js"));
  const directions = require(path.join(DATA_DIR, "directions.js"));
  const seo = require(path.join(DATA_DIR, "seo.js"));

  const posts = listMarkdown(path.join(CONTENT_DIR, "posts"));
  const tours = listJson(path.join(CONTENT_DIR, "tours"));
  const products = listJson(path.join(CONTENT_DIR, "products"));
  const testimonials = listJson(path.join(CONTENT_DIR, "testimonials"));
  const events = listJson(path.join(CONTENT_DIR, "events"));

  return { site, navigation, directions, seo, posts, tours, products, testimonials, events };
}

// ───────── Рендеринг секций ─────────

function renderToursList(tours) {
  const items = Object.values(tours).map((t, i) => {
    const cover = t.cover
      ? `<div class="tour-card__media"><img src="${t.cover}" alt="${escapeHtml(t.coverAlt || t.title)}" loading="lazy" decoding="async"></div>`
      : `<div class="tour-card__media tour-card__media--empty" aria-hidden="true"></div>`;
    const programHtml = (t.program || []).map((p) =>
      `<li class="tour-card__program-item"><span class="tour-card__program-day">${escapeHtml(p.day)}</span><span>${escapeHtml(p.text)}</span></li>`
    ).join("");
    return `
          <article class="tour-card reveal" data-delay="${(i % 3) * 100}">
            ${cover}
            <div class="tour-card__body">
              <h2 class="tour-card__title">${escapeHtml(t.title)}</h2>
              <p class="tour-card__region">${escapeHtml(t.region || "")}</p>
              <p class="tour-card__desc">${escapeHtml(t.desc || "")}</p>
              <ul class="tour-card__program">${programHtml}</ul>
              <div class="tour-card__row">
                <span class="tour-card__price">${formatPrice(t.price)}<span class="tour-card__price-unit"> · ${escapeHtml(t.priceUnit || "с человека")}</span></span>
                <a class="btn btn--primary" href="/contacts/?tour=${encodeURIComponent(t.slug)}"><span>Записаться</span></a>
              </div>
            </div>
          </article>`;
  }).join("");
  return `<div style="display: flex; flex-direction: column; gap: var(--space-8);">${items}</div>`;
}

function renderProductsGrid(products) {
  const items = Object.values(products).map((p, i) => {
    const tag = p.tag ? `<span class="product-card__media-tag">${escapeHtml(p.tag)}</span>` : "";
    const cover = p.cover
      ? `<img src="${p.cover}" alt="${escapeHtml(p.coverAlt || p.title)}" width="800" height="800" loading="lazy" decoding="async">`
      : "";
    return `
          <article class="product-card reveal" data-delay="${(i % 4) * 100}">
            <div class="product-card__media">
              ${tag}
              ${cover}
            </div>
            <div class="product-card__body">
              <h3 class="product-card__title">${escapeHtml(p.title)}</h3>
              <p class="product-card__meta">${escapeHtml(p.meta || "")}</p>
              <div class="product-card__row">
                <span class="product-card__price">${formatPrice(p.price)}</span>
                <button class="product-card__btn" type="button" data-product="${escapeHtml(p.slug)}">Узнать</button>
              </div>
            </div>
          </article>`;
  }).join("");
  return `<div class="grid grid-4">${items}</div>`;
}

function renderBlogList(posts) {
  const items = posts.map((p, i) => {
    const cover = p.cover
      ? `<div class="blog-list__media"><img src="${p.cover}" alt="${escapeHtml(p.coverAlt || p.title)}" loading="lazy" decoding="async"></div>`
      : `<div class="blog-list__media blog-list__media--empty" aria-hidden="true"></div>`;
    return `
          <article class="blog-list__item reveal" data-delay="${(i % 3) * 100}">
            ${cover}
            <div class="blog-list__body">
              ${p.tag ? `<p class="eyebrow">${escapeHtml(p.tag)}</p>` : ""}
              <h2 class="blog-list__title"><a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a></h2>
              <p class="blog-list__excerpt">${escapeHtml(p.excerpt || "")}</p>
              <div class="blog-list__row">
                <span class="blog-list__date">${formatDate(p.date)}</span>
                <span class="blog-list__time">${escapeHtml(p.readTime || "")}</span>
              </div>
            </div>
          </article>`;
  }).join("");
  return `<div class="blog-list">${items}</div>`;
}

function renderTestimonials(testimonials) {
  const items = Object.values(testimonials).map((t, i) => `
          <figure class="testimonial reveal" data-delay="${(i % 3) * 100}">
            <blockquote class="testimonial__quote">${escapeHtml(t.quote)}</blockquote>
            <figcaption class="testimonial__author">
              <span class="testimonial__author-name">${escapeHtml(t.name)}</span>
              <span class="testimonial__author-meta">${escapeHtml(t.meta || "")}</span>
            </figcaption>
          </figure>`).join("");
  return `<div class="testimonial-grid">${items}</div>`;
}

function renderEvents(events) {
  const items = Object.values(events).map((e) => `
          <li>
            <a class="event-item" href="${e.href || "/"}">
              <div class="event-item__date">
                <span class="event-item__day">${escapeHtml(e.date.day)}</span>
                <span class="event-item__month">${escapeHtml(e.date.month)}</span>
              </div>
              <h3 class="event-item__title">${escapeHtml(e.title)}</h3>
              <span class="event-item__meta">${escapeHtml(e.meta || "")}</span>
              <span class="event-item__cta">Записаться <span aria-hidden="true">→</span></span>
            </a>
          </li>`).join("");
  return `<ul class="event-list reveal" data-delay="100">${items}</ul>`;
}

function renderPostBody(post) {
  return mdToHtml(post.body || "");
}

// ───────── Сборка страниц ─────────

function buildPages(data) {
  // Подгружаем все HTML-страницы из src/pages (рекурсивно)
  const pages = [];
  function walk(dir, rel = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const s = path.join(dir, entry.name);
      const r = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(s, r);
      else if (entry.name === "index.html") pages.push({ src: s, rel });
    }
  }
  walk(PAGES_DIR);

  // Словарь рендера секций
  const sections = {
    TOURS_LIST: renderToursList(data.tours),
    PRODUCTS_GRID: renderProductsGrid(data.products),
    BLOG_LIST: renderBlogList(data.posts),
    BLOG_PREVIEW: renderBlogList(data.posts.slice(0, 3)),
    TESTIMONIALS: renderTestimonials(data.testimonials),
    EVENTS: renderEvents(data.events),
  };

  // Партиалы (нормализация имён: MOBILE_MENU→mobile-menu, HEADER→header)
  const partials = {};
  for (const f of fs.readdirSync(PARTIALS_DIR)) {
    const name = path.basename(f, path.extname(f));
    partials[name] = readFile(path.join(PARTIALS_DIR, f));
    partials[name.toUpperCase()] = partials[name];
    partials[name.toUpperCase().replace(/-/g, "_")] = partials[name];
  }

  for (const page of pages) {
    let html = readFile(page.src);

    // SEO entry (нужен для H1, BREADCRUMBS, title/description/canonical)
    const pageKey = page.rel === "" ? "/" : `/${page.rel.replace(/\/index\.html$/, "")}/`;
    const seoEntry = data.seo[pageKey] || data.seo.home;

    // Сначала секции с динамическими данными
    html = html.replace(/<!--\s*\{\{(\w+)\}\}\s*-->/g, (m, name) => sections[name] != null ? sections[name] : m);

    // Партиалы
    html = html.replace(/<!--\s*\{\{(\w+)\}\}\s*-->/g, (m, name) => partials[name] || m);

    // {{JSONLD}} → скрипт с JSON-LD
    html = html.replace(/<!--\s*\{\{JSONLD\}\}\s*-->/g,
      `<script type="application/ld+json">\n${JSON.stringify(buildJsonLdObject(data), null, 2)}\n</script>`);

    // {{HEAD}} → убираем маркер (страницы уже содержат свой <head>)
    html = html.replace(/<!--\s*\{\{HEAD\}\}\s*-->/g, "");

    // {{H1}} → заголовок страницы (из SEO-entries)
    html = html.replace(/\{\{H1\}\}/g, escapeHtml(seoEntry.h1 || seoEntry.title || ""));

    // {{BREADCRUMBS}} → навигационная цепочка
    html = html.replace(/<!--\s*\{\{BREADCRUMBS\}\}\s*-->/g, buildBreadcrumbs(page.rel, seoEntry));

    // Пост блога: POST_META / POST_EXCERPT / POST_COVER / POST_BODY
    const postMatch = page.rel.match(/^blog\/([^/]+)$/);
    if (postMatch) {
      const slug = postMatch[1];
      const post = data.posts.find((p) => p.slug === slug);
      if (post) {
        html = injectPost(html, post);
      }
    }

    // SEO
    html = injectSeo(html, seoEntry, data.site);

    // Шаблон подстановки
    html = html.replace(/\{\{SITE_NAME\}\}/g, data.site.brand?.shortName || data.site.brand?.name || "MIA IRE");
    html = html.replace(/\{\{SITE_FULL_NAME\}\}/g, data.site.brand?.name || "MIA IRE");
    html = html.replace(/\{\{SITE_TAGLINE\}\}/g, data.site.brand?.tagline || "");
    html = html.replace(/\{\{SITE_URL\}\}/g, data.site.url);
    html = html.replace(/\{\{PHONE_DISPLAY\}\}/g, data.site.contacts?.phone || "");
    html = html.replace(/\{\{PHONE_TEL\}\}/g, data.site.contacts?.phoneTel || "");
    html = html.replace(/\{\{EMAIL\}\}/g, data.site.contacts?.email || "");
    html = html.replace(/\{\{TELEGRAM_URL\}\}/g, data.site.contacts?.telegram || "#");
    html = html.replace(/\{\{INSTAGRAM_URL\}\}/g, data.site.contacts?.instagram || "#");
    html = html.replace(/\{\{LOCATION\}\}/g, data.site.contacts?.location || "");

    // Запись
    const out = path.join(DIST, page.rel, "index.html");
    writeFile(out, html);
  }

  // Генерация sitemap
  buildSitemap(data, pages);
  // robots.txt
  buildRobots(data.site);
  // JSON-LD
  buildJsonLd(data);
}

function injectSeo(html, seo, site) {
  if (!seo) return html;
  const title = seo.title || site.brand?.name;
  const description = seo.description || site.brand?.description;
  const canonical = seo.canonical || site.url;
  // <title>
  if (/<title>[^<]*<\/title>/.test(html)) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  } else {
    html = html.replace(/<\/head>/, `<title>${escapeHtml(title)}</title></head>`);
  }
  // description
  if (/<meta name="description"[^>]*>/.test(html)) {
    html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}">`);
  } else {
    html = html.replace(/<\/head>/, `<meta name="description" content="${escapeHtml(description)}"></head>`);
  }
  // canonical
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}">`);
  } else {
    html = html.replace(/<\/head>/, `<link rel="canonical" href="${canonical}"></head>`);
  }
  // Google Fonts (Cormorant Garamond + Manrope + Fraunces)
  if (!/<link[^>]+fonts\.googleapis\.com/.test(html)) {
    const fonts = [
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Manrope:wght@300;400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap">',
    ].join("\n    ");
    html = html.replace(/<\/head>/, `    ${fonts}\n  </head>`);
  }
  // Главный CSS (main.css) — без него страницы без стилей
  if (!/<link[^>]+href="[^"]*\/assets\/css\/main\.css/.test(html)) {
    html = html.replace(/<\/head>/, `    <link rel="stylesheet" href="/assets/css/main.css">\n  </head>`);
  }
  // Главный JS (main.js) — мобильное меню, scroll-reveal, форма
  if (!/<script[^>]+src="[^"]*\/assets\/js\/main\.js/.test(html)) {
    html = html.replace(/<\/body>/, `    <script src="/assets/js/main.js" defer></script>\n  </body>`);
  }
  return html;
}

function buildSitemap(data, pages) {
  const urls = new Set([data.site.url + "/"]);
  for (const p of pages) {
    const u = path.posix.join(data.site.url, p.rel.replace(/index\.html$/, ""));
    urls.add(u.endsWith("/") ? u : u + "/");
  }
  // посты блога
  for (const post of data.posts) {
    urls.add(path.posix.join(data.site.url, "blog", post.slug, ""));
  }
  const now = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls).map((u) => `  <url><loc>${u}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>
`;
  writeFile(path.join(DIST, "sitemap.xml"), xml);
}

function buildRobots(site) {
  const txt = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${site.url}/sitemap.xml
`;
  writeFile(path.join(DIST, "robots.txt"), txt);
}

function buildJsonLd(data) {
  const ld = buildJsonLdObject(data);
  writeFile(path.join(DIST, "jsonld.json"), JSON.stringify(ld, null, 2));
}

function buildJsonLdObject(data) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.site.brand?.name,
    url: data.site.url,
    description: data.site.brand?.description,
    sameAs: [
      data.site.contacts?.telegram,
      data.site.contacts?.instagram,
    ].filter(Boolean),
  };
}

function injectPost(html, post) {
  // meta: tag · date · readTime · author
  const metaParts = [];
  if (post.tag) metaParts.push(`<span>${escapeHtml(post.tag)}</span>`);
  if (post.date) {
    const date = new Date(post.date);
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    metaParts.push(`<time datetime="${escapeHtml(post.date)}">${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}</time>`);
  }
  if (post.readTime) metaParts.push(`<span>${escapeHtml(post.readTime)} чтения</span>`);
  if (post.author) metaParts.push(`<span>${escapeHtml(post.author)}</span>`);
  const metaSep = `<span aria-hidden="true">·</span>`;
  const metaHtml = metaParts.join(`\n              ${metaSep}\n              `);
  html = html.replace(/<!--\s*\{\{POST_META\}\}\s*-->/g, metaHtml);

  // excerpt
  html = html.replace(/\{\{POST_EXCERPT\}\}/g, escapeHtml(post.excerpt || ""));

  // cover
  const coverHtml = post.cover
    ? `<img src="${post.cover}" alt="${escapeHtml(post.coverAlt || post.title)}" width="1200" height="675" loading="lazy" decoding="async">`
    : "";
  html = html.replace(/<!--\s*\{\{POST_COVER\}\}\s*-->/g, coverHtml);

  // body
  html = html.replace(/<!--\s*\{\{POST_BODY\}\}\s*-->/g, mdToHtml(post.body || ""));

  return html;
}

function buildBreadcrumbs(rel, seoEntry) {
  // rel = "" для главной, "tours" для /tours/, "blog/sound-healing" для /blog/sound-healing/
  if (!rel) return "";
  const segments = rel.split("/").filter(Boolean);
  const items = [{ name: "Главная", href: "/" }];
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    path += "/" + segments[i];
    // Последний сегмент — текущая страница
    if (i === segments.length - 1) {
      items.push({ name: (seoEntry && seoEntry.breadcrumb) || (seoEntry && seoEntry.h1) || (seoEntry && seoEntry.title) || segments[i], href: null });
    } else {
      const labels = { blog: "Блог", tours: "Туры", shop: "Магазин", cacao: "Какао", about: "О нас", contacts: "Контакты", "sound-healing": "Церемония Звука" };
      items.push({ name: labels[segments[i]] || segments[i], href: path + "/" });
    }
  }
  const parts = items.map((it) => {
    if (!it.href) return `<span class="breadcrumbs__current" aria-current="page">${escapeHtml(it.name)}</span>`;
    return `<a class="breadcrumbs__link" href="${it.href}">${escapeHtml(it.name)}</a>`;
  });
  return `<nav class="breadcrumbs" aria-label="Хлебные крошки"><ol class="breadcrumbs__list">${parts.map((p) => `<li class="breadcrumbs__item">${p}</li>`).join('<li class="breadcrumbs__sep" aria-hidden="true">›</li>')}</ol></nav>`;
}

// ───────── Main ─────────

function main() {
  const t0 = Date.now();
  console.log("→ Читаю данные...");
  const data = loadData();

  // Чистим dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  console.log("→ Собираю страницы...");
  buildPages(data);

  console.log("→ Копирую ассеты...");
  copyDir(ASSETS_DIR, path.join(DIST, "assets"));

  console.log("→ Копирую админку (Decap CMS)...");
  copyDir(ADMIN_DIR, path.join(DIST, "admin"));

  // favicon
  const favicon = path.join(ROOT, "favicon.svg");
  if (fs.existsSync(favicon)) copyFile(favicon, path.join(DIST, "favicon.svg"));

  console.log(`✓ Сборка готова за ${Date.now() - t0} мс → ${path.relative(ROOT, DIST)}/`);
  console.log(`  Постов: ${data.posts.length} | Туров: ${Object.keys(data.tours).length} | Товаров: ${Object.keys(data.products).length} | Отзывов: ${Object.keys(data.testimonials).length} | Событий: ${Object.keys(data.events).length}`);
}

main();
