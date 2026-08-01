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
const PAGES_CONTENT_DIR = path.join(CONTENT_DIR, "pages");
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

// ───────── Page JSON & {{PAGE.*}} placeholder resolution ─────────

const PAGE_SLUG_MAP = {
  "index.html": "home",
  "about/index.html": "about",
  "tours/index.html": "tours",
  "cacao/index.html": "cacao",
  "sound-healing/index.html": "sound-healing",
  "shop/index.html": "shop",
  "contacts/index.html": "contacts",
  "blog/index.html": "blog",
};

function relPathToSlug(rel) {
  return PAGE_SLUG_MAP[rel] || PAGE_SLUG_MAP[path.posix.join(rel, "index.html")] || null;
}

function loadPageJson(slug) {
  if (!slug) return null;
  const jsonPath = path.join(PAGES_CONTENT_DIR, slug + ".json");
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFile(jsonPath));
  } catch {
    return null;
  }
}

function resolveNestedPath(obj, pathStr) {
  if (obj == null) return undefined;
  const segments = pathStr.split(".");
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (isNaN(idx) || idx < 0 || idx >= current.length) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      if (seg in current) {
        current = current[seg];
      } else {
        const numIdx = parseInt(seg, 10);
        if (!isNaN(numIdx) && Array.isArray(current)) {
          current = current[numIdx];
        } else {
          return undefined;
        }
      }
    } else {
      return undefined;
    }
  }
  return current;
}

function replacePagePlaceholders(html, pageJson) {
  if (!pageJson) return html;
  const PAGE_PLACEHOLDER_RE = /\{\{PAGE\.([^{}]+)\}\}/g;
  let result = html;
  let iterations = 0;
  const maxIterations = 20;
  while (iterations < maxIterations) {
    let replaced = false;
    result = result.replace(PAGE_PLACEHOLDER_RE, (match, pathStr) => {
      const value = resolveNestedPath(pageJson, pathStr.trim());
      if (value === undefined || value === null) {
        return match;
      }
      replaced = true;
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      return String(value);
    });
    if (!replaced) break;
    iterations++;
  }
  return result;
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
      `<li><span class="tour-card__day">${escapeHtml(p.day)}</span><span>${escapeHtml(p.text)}</span></li>`
    ).join("");
    const metaParts = [t.region, t.duration, t.group].filter(Boolean).map((part) => `<span>${escapeHtml(part)}</span>`).join("");
    return `
          <article class="tour-card reveal" data-delay="${(i % 3) * 100}">
            ${cover}
            <div class="tour-card__body">
              ${metaParts ? `<p class="tour-card__meta">${metaParts}</p>` : ""}
              <h2 class="tour-card__title">${escapeHtml(t.title)}</h2>
              <p class="tour-card__desc">${escapeHtml(t.desc || "")}</p>
              <ul class="tour-card__program">${programHtml}</ul>
              <div class="tour-card__price">
                <span class="tour-card__price-label">Стоимость</span>
                <span class="tour-card__price-value">${formatPrice(t.price)}</span>
                <span class="tour-card__price-unit">${escapeHtml(t.priceUnit || "с человека")}</span>
              </div>
              <a class="btn btn--primary tour-card__cta" href="/contacts/?tour=${encodeURIComponent(t.slug)}"><span>Записаться</span></a>
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
      ? `<div class="blog-item__media"><img src="${p.cover}" alt="${escapeHtml(p.coverAlt || p.title)}" loading="lazy" decoding="async"></div>`
      : `<div class="blog-item__media blog-item__media--empty" aria-hidden="true"></div>`;
    const meta = [
      p.tag ? `<span class="blog-item__tag">${escapeHtml(p.tag)}</span>` : "",
      p.date ? `<time datetime="${escapeHtml(p.date)}">${escapeHtml(p.dateDisplay || formatDate(p.date))}</time>` : "",
      p.readTime ? `<span>${escapeHtml(p.readTime)}</span>` : "",
    ].filter(Boolean).join('<span aria-hidden="true">·</span>');
    return `
          <article class="blog-item reveal" data-delay="${(i % 3) * 100}">
            ${cover}
            <div class="blog-item__body">
              ${meta ? `<p class="blog-item__meta">${meta}</p>` : ""}
              <h2 class="blog-item__title"><a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a></h2>
              <p class="blog-item__desc">${escapeHtml(p.excerpt || p.desc || "")}</p>
              <a class="blog-item__cta" href="/blog/${p.slug}/">Читать статью <span aria-hidden="true">→</span></a>
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

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function asText(value) {
  return value == null ? "" : String(value);
}

function getTextValue(value, preferredKeys = []) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value !== "object") return "";
  for (const key of preferredKeys) {
    if (value[key] != null && value[key] !== "") return String(value[key]);
  }
  const firstPrimitive = Object.values(value).find((item) => typeof item === "string" || typeof item === "number");
  return firstPrimitive == null ? "" : String(firstPrimitive);
}

function getTextList(list, preferredKeys = ["p", "item", "rule", "text", "value", "label"]) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => getTextValue(item, preferredKeys)).filter(Boolean);
}

function getObject(section, ...keys) {
  for (const key of keys) {
    if (section && section[key] && typeof section[key] === "object" && !Array.isArray(section[key])) {
      return section[key];
    }
  }
  return null;
}

function getArray(section, ...keys) {
  for (const key of keys) {
    if (Array.isArray(section && section[key])) {
      return section[key];
    }
  }
  return [];
}

function buildSectionId(index) {
  return `section-${index + 1}`;
}

function isExternalHref(href) {
  return /^https?:\/\//.test(href || "");
}

function buildLinkAttrs(href) {
  return isExternalHref(href) ? ' target="_blank" rel="noopener"' : "";
}

function renderSectionWrap(content, options = {}) {
  const className = options.small ? "section-sm" : "section";
  const id = options.id ? ` id="${options.id}"` : "";
  const style = options.elevated
    ? ' style="background: var(--bg-elevated); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);"'
    : "";
  return `<section class="${className}"${id}${style}><div class="container">${content}</div></section>`;
}

function renderSectionHead(section, options = {}) {
  const eyebrow = asText(section.eyebrow);
  const title = asText(section.title);
  const lede = asText(pickFirstDefined(section.lede, section.ledeText));
  if (!eyebrow && !title && !lede) return "";
  const id = options.titleId ? ` id="${options.titleId}"` : "";
  return `
        <div class="section-head reveal">
          <div class="section-head__top">
            ${eyebrow ? `<p class="eyebrow eyebrow--accent">${eyebrow}</p>` : ""}
            ${title ? `<h2 class="section-head__title"${id}>${title}</h2>` : ""}
            <span class="section-head__divider" aria-hidden="true"></span>
          </div>
          ${lede ? `<p class="section-head__lede">${lede}</p>` : ""}
        </div>`;
}

function renderImage(image, options = {}) {
  if (!image || !image.src) return "";
  const alt = escapeHtml(image.alt || "");
  const className = options.className ? ` class="${options.className}"` : "";
  const width = options.width ? ` width="${options.width}"` : "";
  const height = options.height ? ` height="${options.height}"` : "";
  const sizes = options.sizes ? ` sizes="${options.sizes}"` : "";
  const img = `<img src="${escapeHtml(image.src)}" alt="${alt}"${className}${width}${height} loading="lazy" decoding="async"${sizes}>`;
  if (!image.srcMobile) return img;
  return `<picture><source media="(max-width: 768px)" srcset="${escapeHtml(image.srcMobile)}">${img}</picture>`;
}

function renderAction(action, options = {}) {
  if (!action || !action.href || !action.label) return "";
  const btnSize = options.large ? " btn--lg" : "";
  const btnStyle = action.primary === false
    ? options.inverse
      ? "btn btn--ghost-inverse"
      : "btn btn--ghost"
    : "btn btn--primary";
  const icon = action.primary === false && !options.forceIcon
    ? ""
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
  return `<a class="${btnStyle}${btnSize}" href="${escapeHtml(action.href)}"${buildLinkAttrs(action.href)}><span>${escapeHtml(action.label)}</span>${icon}</a>`;
}

function renderActions(actions, options = {}) {
  if (!Array.isArray(actions) || !actions.length) return "";
  return actions.map((action) => renderAction(action, options)).join("");
}

function renderInlineLink(item) {
  if (!item) return "";
  const value = escapeHtml(item.value || "");
  if (!item.href) return value;
  return `<a href="${escapeHtml(item.href)}"${buildLinkAttrs(item.href)}>${value}</a>`;
}

function renderParagraphs(paragraphs) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

function renderDirectionIcon(index) {
  const icons = [
    '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
    '<path d="M12 2C8 2 5 5 5 9c0 3 1 4 2 5 1 1 2 1 2 2v2"></path><path d="M19 2c-1 0-2 1-2 3"></path><path d="M9 18h6"></path><path d="M10 22h4"></path>',
    '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>',
  ];
  return icons[index % icons.length];
}

function renderStaticEvents(items) {
  const rows = items.map((item) => `
          <li>
            <a class="event-item" href="${escapeHtml(item.href || "/contacts/")}">
              <div class="event-item__date">
                <span class="event-item__day">${escapeHtml(item.date?.day || "")}</span>
                <span class="event-item__month">${escapeHtml(item.date?.month || "")}</span>
              </div>
              <h3 class="event-item__title">${escapeHtml(item.title || "")}</h3>
              <span class="event-item__meta">${escapeHtml(item.meta || "")}</span>
              <span class="event-item__cta">Подробнее <span aria-hidden="true">→</span></span>
            </a>
          </li>`).join("");
  return `<ul class="event-list reveal" data-delay="100">${rows}</ul>`;
}

function renderStaticBlogItems(items) {
  const normalized = items.map((item) => ({
    slug: item.slug,
    tag: item.tag,
    date: item.date,
    dateDisplay: item.dateDisplay,
    readTime: item.readTime,
    title: item.title,
    excerpt: item.desc,
    cover: item.cover?.src || "",
    coverAlt: item.cover?.alt || item.title,
  }));
  return renderBlogList(normalized);
}

function renderNumberedGrid(items, gridClass) {
  const cards = items.map((item, index) => `
          <div class="numbered reveal" data-delay="${(index % 3) * 100}">
            ${item.num || item.year ? `<span class="numbered__num">${escapeHtml(item.num || item.year)}</span>` : ""}
            <h3 class="numbered__title">${escapeHtml(item.title || "")}</h3>
            ${item.desc ? `<p class="numbered__desc">${item.desc}</p>` : ""}
          </div>`).join("");
  return `<div class="${gridClass}">${cards}</div>`;
}

function renderSplitContent(section) {
  const content = [];
  if (section.eyebrow) content.push(`<p class="eyebrow">${section.eyebrow}</p>`);
  if (section.title) content.push(`<h2 class="h-2">${section.title}</h2>`);
  if (section.lede) content.push(`<p class="lede">${section.lede}</p>`);
  if (section.subheading) content.push(`<h3 class="h-3">${section.subheading}</h3>`);
  const paragraphs = getTextList(getArray(section, "paragraphs"));
  if (paragraphs.length) content.push(renderParagraphs(paragraphs));
  const body = asText(section.body);
  if (body) content.push(`<p>${body}</p>`);
  const list = getTextList(getArray(section, "list", "rules"));
  if (list.length) {
    content.push(`<ul class="dotted-list">${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
  }
  if (section.closing) content.push(`<p>${section.closing}</p>`);
  if (section.cta && section.cta.href && section.cta.label) {
    content.push(`<a class="btn btn--link" href="${escapeHtml(section.cta.href)}"${buildLinkAttrs(section.cta.href)}><span>${escapeHtml(section.cta.label)}</span></a>`);
  }
  return content.join("");
}

function renderFormFields(fields) {
  return fields.map((field) => {
    const name = escapeHtml(field.name || "");
    const label = escapeHtml(field.label || "");
    const required = field.required ? " required" : "";
    const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
    if (field.type === "textarea") {
      const rows = field.rows ? ` rows="${field.rows}"` : ' rows="4"';
      return `
              <div class="form__field">
                <label class="form__label" for="${name}">${label}</label>
                <textarea class="form__textarea" id="${name}" name="${name}"${rows}${placeholder}${required}></textarea>
                <span class="form__error"></span>
              </div>`;
    }
    if (field.type === "select") {
      const options = (field.options || []).map((option) =>
        `<option value="${escapeHtml(option.value || "")}">${escapeHtml(option.label || "")}</option>`
      ).join("");
      return `
              <div class="form__field">
                <label class="form__label" for="${name}">${label}</label>
                <select class="form__input" id="${name}" name="${name}"${required}>
                  ${options}
                </select>
                <span class="form__error"></span>
              </div>`;
    }
    return `
              <div class="form__field">
                <label class="form__label" for="${name}">${label}</label>
                <input class="form__input" type="${escapeHtml(field.type || "text")}" id="${name}" name="${name}"${placeholder}${required}>
                <span class="form__error"></span>
              </div>`;
  }).join("");
}

function renderPageSection(section, index, pageSlug, data) {
  const sectionId = buildSectionId(index);
  const items = getArray(section, "items");
  const cards = getArray(section, "cards");
  const timeline = getArray(section, "timeline", "items");
  const faqItems = getArray(section, "faq", "items");
  const blogItems = getArray(section, "blogItems", "items");
  const eventsStatic = getArray(section, "eventsStatic", "items");
  const actions = getArray(section, "actions");
  const contacts = getObject(section, "contacts", "contactsBlock");
  const form = getObject(section, "form");
  const image = getObject(section, "image");
  const poster = getObject(section, "poster");

  switch (section.type) {
    case "directions": {
      const blocks = items.map((item, itemIndex) => `
          <a class="direction-card reveal" href="${escapeHtml(item.href || "#")}" data-delay="${itemIndex * 100}">
            <span class="direction-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${renderDirectionIcon(itemIndex)}</svg>
            </span>
            <h3 class="direction-card__title">${escapeHtml(item.title || "")}</h3>
            <p class="direction-card__desc">${escapeHtml(item.desc || "")}</p>
            <span class="direction-card__cta">${escapeHtml(item.cta || "Подробнее")} <span aria-hidden="true">→</span></span>
          </a>`).join("");
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<div class="grid grid-2">${blocks}</div>`, { id: sectionId });
    }
    case "stats": {
      const stats = items.map((item, itemIndex) => `
          <div class="stat reveal" data-delay="${itemIndex * 100}">
            <span class="stat__num"><em>${escapeHtml(item.num || item.prefix || "")}</em></span>
            <span class="stat__label">${escapeHtml(item.label || "")}</span>
          </div>`).join("");
      return renderSectionWrap(`<div class="stat-band">${stats}</div>`, { id: sectionId, small: true });
    }
    case "about-preview":
    case "about-author":
    case "about-practice":
    case "split":
    case "split-reverse": {
      const reverse = section.type === "split-reverse";
      const mediaHtml = image?.src ? `
          <div class="split__media reveal" data-delay="${reverse ? 0 : 100}">
            ${renderImage(image, { width: 1025, height: 1280, sizes: '(max-width: 768px) 100vw, 50vw' })}
          </div>` : "";
      const bodyHtml = `
          <div class="split__body reveal" data-delay="${reverse ? 100 : 0}">
            ${renderSplitContent(section)}
          </div>`;
      return renderSectionWrap(`<div class="split${reverse ? " split--reverse" : ""}">${reverse ? bodyHtml + mediaHtml : mediaHtml + bodyHtml}</div>`, {
        id: sectionId,
        elevated: section.type === "about-practice",
      });
    }
    case "events":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderEvents(data.events)}`, { id: sectionId });
    case "testimonials":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderTestimonials(data.testimonials)}`, { id: sectionId });
    case "blog-preview":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderBlogList(data.posts.slice(0, 3))}`, { id: sectionId });
    case "blog-list":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${blogItems.length ? renderStaticBlogItems(blogItems) : renderBlogList(data.posts)}`, { id: sectionId });
    case "tours-list":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderToursList(data.tours)}`, { id: sectionId, elevated: pageSlug === "tours" });
    case "products":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderProductsGrid(data.products)}${section.serviceNote ? `<p class="service-note">${section.serviceNote}</p>` : ""}`, { id: sectionId });
    case "approach":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(items, "grid grid-2")}`, { id: sectionId });
    case "included":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(items, "grid grid-3")}`, { id: sectionId });
    case "delivery":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(items, "grid grid-3")}`, { id: sectionId, elevated: true });
    case "values":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(items, "grid grid-3")}`, { id: sectionId, elevated: true });
    case "why-abkhazia":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(items, "grid grid-2")}`, { id: sectionId });
    case "timeline":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderNumberedGrid(timeline, "grid grid-2")}`, { id: sectionId });
    case "process": {
      const steps = getArray(section, "steps").map((item, itemIndex) => `
          <div class="process__step reveal" data-delay="${itemIndex * 100}">
            <h3 class="process__step-title">${escapeHtml(item.title || "")}</h3>
            <p class="process__step-desc">${escapeHtml(item.desc || "")}</p>
          </div>`).join("");
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<div class="process">${steps}</div>`, { id: sectionId, elevated: true });
    }
    case "preparation": {
      const list = getTextList(getArray(section, "items", "rules"));
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<ul class="dotted-list reveal" data-delay="100" style="max-width: 760px;">${list.map((item, itemIndex) => `<li><span>${itemIndex + 1}</span>${item}</li>`).join("")}</ul>`, { id: sectionId, elevated: true });
    }
    case "events-static":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}${renderStaticEvents(eventsStatic)}`, { id: sectionId });
    case "video":
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<div class="video-poster reveal" data-delay="100">${renderImage(poster, { width: 1600, height: 900 })}<button class="video-poster__play" type="button" data-video-play aria-label="Запустить видео"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></button></div>`, { id: sectionId });
    case "formats": {
      const formatItems = (items.length ? items : cards).map((item, itemIndex) => {
        const paragraphs = getTextList(getArray(item, "paragraphs"), ["p", "item", "text", "value"]);
        return `
          <div class="reveal" data-delay="${(itemIndex % 4) * 100}">
            <h3 class="h-3">${escapeHtml(item.title || "")}</h3>
            ${paragraphs.length ? renderParagraphs(paragraphs) : item.desc ? `<p>${item.desc}</p>` : ""}
          </div>`;
      }).join("");
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<div class="grid grid-2">${formatItems}</div>`, { id: sectionId, elevated: true });
    }
    case "contacts-grid": {
      const contactItems = getArray(contacts || {}, "items");
      const contactBlocks = contactItems.map((item) => `
              <div class="contact-block">
                <span class="contact-block__label">${escapeHtml(item.label || "")}</span>
                <span class="contact-block__value">${renderInlineLink(item)}</span>
                ${item.note ? `<p class="contact-block__note">${item.note}</p>` : ""}
              </div>`).join("");
      const formFields = getArray(form || {}, "fields");
      return renderSectionWrap(`
        <div class="contacts-grid">
          <div class="reveal">
            ${contacts?.eyebrow ? `<p class="eyebrow">${contacts.eyebrow}</p>` : ""}
            ${contacts?.title ? `<h2 class="h-2" style="margin-bottom: var(--space-8);">${contacts.title}</h2>` : ""}
            ${contactBlocks}
          </div>
          <div class="reveal" data-delay="100">
            ${form?.eyebrow ? `<p class="eyebrow">${form.eyebrow}</p>` : ""}
            ${form?.title ? `<h2 class="h-2" style="margin-bottom: var(--space-4);">${form.title}</h2>` : ""}
            ${form?.lede ? `<p style="color: var(--ink-muted); margin-bottom: var(--space-8);">${form.lede}</p>` : ""}
            <form class="form" data-contact-form novalidate>
              ${renderFormFields(formFields)}
              ${form?.agreement ? `<label class="form__check"><input type="checkbox" name="agree" required><span>${form.agreement}</span></label>` : ""}
              <div class="form__status" data-form-status></div>
              <button class="btn btn--primary btn--lg form__submit" type="submit">
                <span>${escapeHtml(form?.submitLabel || "Отправить заявку")}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </form>
          </div>
        </div>`, { id: sectionId });
    }
    case "faq": {
      const rows = faqItems.map((item) => `
          <div class="faq__item" data-open="false">
            <button class="faq__trigger" type="button" aria-expanded="false">
              <span>${escapeHtml(item.question || "")}</span>
            </button>
            <div class="faq__content">
              <div class="faq__content-inner">
                <p>${item.answer || ""}</p>
              </div>
            </div>
          </div>`).join("");
      return renderSectionWrap(`${renderSectionHead(section, { titleId: `${sectionId}-title` })}<div class="faq" style="max-width: 880px; margin: 0 auto;">${rows}</div>`, { id: sectionId, elevated: true });
    }
    case "cta": {
      const contactsHtml = contacts && getArray(contacts, "items").length
        ? `<div class="reveal" data-delay="200"><div class="cta-section__contacts">${contacts.label ? `<span class="cta-section__contacts-label">${escapeHtml(contacts.label)}</span>` : ""}${getArray(contacts, "items").map((item) => renderInlineLink(item)).join("")}</div></div>`
        : contacts && (contacts.email || contacts.phone || contacts.telegram)
          ? `<div class="reveal" data-delay="200"><div class="cta-section__contacts">${contacts.label ? `<span class="cta-section__contacts-label">${escapeHtml(contacts.label)}</span>` : ""}${contacts.email ? `<a href="mailto:${escapeHtml(contacts.email)}">${escapeHtml(contacts.email)}</a>` : ""}${contacts.phone ? `<a href="tel:${escapeHtml(contacts.phoneTel || contacts.phone)}">${escapeHtml(contacts.phone)}</a>` : ""}${contacts.telegram ? `<a href="${escapeHtml(contacts.telegramUrl || "#")}"${buildLinkAttrs(contacts.telegramUrl || "")}>${escapeHtml(contacts.telegram)}</a>` : ""}</div></div>`
          : "";
      return `
    <section class="cta-section" id="${sectionId}" aria-labelledby="${sectionId}-title">
      <div class="container">
        <div class="cta-section__inner">
          <div class="reveal">
            ${section.eyebrow ? `<p class="eyebrow eyebrow--inverse">${section.eyebrow}</p>` : ""}
            ${section.title ? `<h2 class="cta-section__title" id="${sectionId}-title">${section.title}</h2>` : ""}
            ${section.lede ? `<p class="cta-section__lede">${section.lede}</p>` : ""}
            ${actions.length ? `<div class="cta-section__actions">${renderActions(actions, { inverse: true, large: true, forceIcon: true })}</div>` : ""}
          </div>
          ${contactsHtml}
        </div>
      </div>
    </section>`;
    }
    default: {
      const paragraphs = getTextList(getArray(section, "paragraphs"));
      const fallbackContent = `${renderSectionHead(section, { titleId: `${sectionId}-title` })}${paragraphs.length ? renderParagraphs(paragraphs) : ""}`;
      return fallbackContent ? renderSectionWrap(fallbackContent, { id: sectionId }) : "";
    }
  }
}

function renderPageHero(pageSlug, pageJson, seoEntry) {
  const hero = pageJson?.hero || {};
  const title = asText(pickFirstDefined(hero.title, seoEntry?.h1, seoEntry?.title));
  const eyebrow = asText(hero.eyebrow);
  const lede = asText(pickFirstDefined(hero.lede, hero.subtitle));
  if (pageSlug === "home") {
    const actions = getArray(hero, "actions");
    const meta = getArray(hero, "meta");
    const bg = getObject(hero, "bg");
    const firstSectionId = buildSectionId(0);
    return `
    <section class="hero hero--full" aria-label="Главный экран">
      <div class="hero__bg">
        ${bg ? renderImage(bg, { width: 1920, height: 1080, sizes: "100vw" }) : ""}
      </div>
      <div class="hero__inner">
        ${eyebrow ? `<p class="eyebrow eyebrow--inverse" style="color: var(--ink-inverse-muted);"><span style="color: var(--ink-inverse-muted);">${eyebrow}</span></p>` : ""}
        ${title ? `<h1 class="hero__title">${title}</h1>` : ""}
        ${hero.subtitle ? `<p class="hero__subtitle">${hero.subtitle}</p>` : ""}
        ${actions.length ? `<div class="hero__actions">${renderActions(actions, { inverse: true, large: true, forceIcon: true })}</div>` : ""}
        ${meta.length ? `<dl class="hero__meta">${meta.map((item) => `<div class="hero__meta-item"><dt class="hero__meta-label">${escapeHtml(item.label || "")}</dt><dd class="hero__meta-value">${escapeHtml(item.value || "")}</dd></div>`).join("")}</dl>` : ""}
      </div>
      <a href="#${firstSectionId}" class="hero__scroll" aria-label="Прокрутить вниз">Прокрутить вниз</a>
    </section>`;
  }
  return `
    <section class="subhero" aria-labelledby="page-title">
      <div class="container">
        ${buildBreadcrumbs(pageSlug === "home" ? "" : pageSlug, seoEntry)}
        ${eyebrow ? `<p class="eyebrow eyebrow--accent">${eyebrow}</p>` : ""}
        ${title ? `<h1 class="subhero__title" id="page-title">${title}</h1>` : ""}
        ${lede ? `<p class="subhero__lede">${lede}</p>` : ""}
      </div>
    </section>`;
}

function renderStickyCta(pageJson) {
  const sectionAction = (pageJson.sections || [])
    .find((section) => section.type === "cta" && Array.isArray(section.actions) && section.actions.length)
    ?.actions?.find((action) => action.primary !== false)
    || (pageJson.sections || [])
      .find((section) => section.type === "cta" && Array.isArray(section.actions) && section.actions.length)
      ?.actions?.[0];
  const heroAction = Array.isArray(pageJson.hero?.actions) ? pageJson.hero.actions[0] : null;
  const action = sectionAction || heroAction;
  if (!action || !action.href || !action.label) return "";
  return `
  <div class="sticky-cta">
    <a class="btn btn--primary" href="${escapeHtml(action.href)}"${buildLinkAttrs(action.href)}>
      <span>${escapeHtml(action.label)}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
    </a>
  </div>`;
}

function buildManagedPageFragments(pageSlug, pageJson, seoEntry, data) {
  return {
    skipLink: "Перейти к содержимому",
    heroHtml: renderPageHero(pageSlug, pageJson, seoEntry),
    sectionsHtml: (pageJson.sections || []).map((section, index) => renderPageSection(section, index, pageSlug, data)).join("\n"),
    stickyCtaHtml: renderStickyCta(pageJson),
  };
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
    const pageSlug = relPathToSlug(page.rel);
    const pageJson = loadPageJson(pageSlug);

    // SEO entry (нужен для H1, BREADCRUMBS, title/description/canonical)
    const pageKey = page.rel === "" ? "/" : `/${page.rel.replace(/\/index\.html$/, "")}/`;
    const seoEntry = data.seo[pageKey] || data.seo.home;
    const managedPage = pageJson ? buildManagedPageFragments(pageSlug, pageJson, seoEntry, data) : null;

    // Загрузка page-specific JSON и замена {{PAGE.*}} (оставляем как fallback для старых шаблонов)
    html = replacePagePlaceholders(html, pageJson);
    html = html.replace(/\{\{PAGE_SKIP_LINK\}\}/g, managedPage?.skipLink || "Перейти к содержимому");
    html = html.replace(/<!--\s*\{\{PAGE_HERO\}\}\s*-->/g, managedPage?.heroHtml || "");
    html = html.replace(/<!--\s*\{\{PAGE_SECTIONS\}\}\s*-->/g, managedPage?.sectionsHtml || "");
    html = html.replace(/<!--\s*\{\{PAGE_STICKY_CTA\}\}\s*-->/g, managedPage?.stickyCtaHtml || "");

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
    html = html.replace(/\{\{LOCATION_NOTE\}\}/g, data.site.contacts?.locationNote || "");

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
  // favicon / apple-touch-icon — берём .ico/.png если есть, иначе /favicon.png
  const faviconHref = fs.existsSync(path.join(DIST, "favicon.ico"))
    ? "/favicon.ico"
    : fs.existsSync(path.join(DIST, "favicon.png"))
    ? "/favicon.png"
    : null;
  if (faviconHref && !/<link rel="icon"[^>]*>/.test(html)) {
    const icons = [
      `<link rel="icon" type="${faviconHref.endsWith(".ico") ? "image/x-icon" : "image/png"}" href="${faviconHref}">`,
      `<link rel="apple-touch-icon" href="${faviconHref}">`,
    ].join("\n    ");
    html = html.replace(/<\/head>/, `    ${icons}\n  </head>`);
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
  // Netlify Identity Widget — обработка приглашений и сброса пароля Decap CMS
  if (!/identity\.netlify\.com\/v1\/netlify-identity-widget/.test(html)) {
    html = html.replace(/<\/head>/, `    <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>\n  </head>`);
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

  // favicon (ICO/PNG в src/) — копируем ДО сборки страниц, чтобы injectSeo их видел
  for (const name of ["favicon.ico", "favicon.png"]) {
    const src = path.join(SRC, name);
    if (fs.existsSync(src)) copyFile(src, path.join(DIST, name));
  }

  console.log("→ Собираю страницы...");
  buildPages(data);

  console.log("→ Копирую ассеты...");
  copyDir(ASSETS_DIR, path.join(DIST, "assets"));

  console.log("→ Копирую админку (Decap CMS)...");
  copyDir(ADMIN_DIR, path.join(DIST, "admin"));

  console.log(`✓ Сборка готова за ${Date.now() - t0} мс → ${path.relative(ROOT, DIST)}/`);
  console.log(`  Постов: ${data.posts.length} | Туров: ${Object.keys(data.tours).length} | Товаров: ${Object.keys(data.products).length} | Отзывов: ${Object.keys(data.testimonials).length} | Событий: ${Object.keys(data.events).length}`);
}

main();
