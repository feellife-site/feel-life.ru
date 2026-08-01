# Деплой MIA IRE (feel-life.ru) с Decap CMS

> **Рекомендованный путь:** Netlify. 10 минут настройки, клиенту выдаёшь invite / логин, и он сам редактирует без GitHub-токена.

---

## 0. Что уже сделано

✅ Структура контента для Decap CMS: `src/content/`
  - `posts/*.md` — статьи блога (Markdown + frontmatter)
  - `tours/*.json` — туры
  - `products/*.json` — товары
  - `testimonials/*.json` — отзывы
  - `events/*.json` — события
  - `settings/site.json` — настройки сайта (URL: `https://feel-life.ru`)

✅ Три конфига Decap CMS:
  - `config.yml` — **production** для Netlify (Netlify Identity + Git Gateway)
  - `config.local.yml` — для локальной разработки (test-repo, без логина)
  - `config.github.yml` — для production на Cloudflare Pages / Vercel / где угодно (GitHub OAuth)

✅ Авто-выбор конфига в `admin/index.html`:
  - на `localhost` → `config.local.yml` (без логина, правки в localStorage)
  - на проде → `config.yml` (Netlify Identity + Git Gateway)
  - вручную: `?config=config.github.yml`

✅ Билдер: `src/build.js` (читает content/, рендерит списки, копирует admin/ → dist/admin/)
✅ `package.json` со скриптами, `.gitignore`, `netlify.toml` (для деплоя на Netlify)
✅ Фото-виджеты во всех коллекциях (посты, туры, товары) — клиент сможет загружать картинки

---

## 1. Залить проект в GitHub (5 минут)

```bash
cd /home/mantresh/Documents/site
git init
git add .
git commit -m "Initial: MIA IRE + Decap CMS"
git branch -M main
# Создай пустой репозиторий на https://github.com/new (назови как угодно)
git remote add origin https://github.com/<ваш-логин>/<репозиторий>.git
git push -u origin main
```

---

## 2. Деплой на Netlify (5 минут, рекомендую)

Netlify — это и хостинг, и сервис аутентификации (Netlify Identity). Клиент логинится в админку по invite / email+паролю, без GitHub-токена в браузере.

### 2.1. Подключить репозиторий

1. https://app.netlify.com → **Add new site** → **Import from Git**
2. Выбери GitHub → репозиторий
3. Команды подхватятся автоматически из `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Deploy site** — первый билд запустится

### 2.2. Подключить домен `feel-life.ru`

1. **Domain settings** → **Add custom domain** → `feel-life.ru`
2. Netlify покажет NS-ы (например `dns1.p01.nsone.net` и т.д.)
3. У регистратора домена (reg.ru, regery, beget и т. п.) поменяй NS-ы на эти
4. Подожди 5–30 минут (распространение DNS)

### 2.3. Включить Identity (логин для админки)

1. **Site settings** → **Identity** → **Enable Identity**
2. В том же разделе **Identity** → **Services** → **Enable Git Gateway**
3. **Identity** → **Settings** → **Registration**: выбери **Invite only** (чтобы регистрировались только по приглашению)
4. **External providers** (опционально): можно включить Google / GitHub

### 2.4. Пригласить клиента

1. **Identity** → **Invite users** → email клиента
2. Клиент получит письмо со ссылкой «Accept the invite»
3. По ссылке клиент задаёт пароль
4. После этого на `https://feel-life.ru/admin/` появится кнопка **«Login with Netlify Identity»**

### 2.5. Готово

Клиент заходит на `https://feel-life.ru/admin/`, логинится, редактирует что хочет, жмёт **Publish**. Всё:
- Изменения коммитятся в GitHub
- Netlify автоматически пересобирает сайт
- Через 30 секунд новый контент в продакшене
- Загруженные фото уезжают в репозиторий

---

## 3. Деплой на Cloudflare Pages (альтернатива, без Netlify)

Бесплатно, быстро, но требует ручной настройки OAuth-прокси. Подходит если не хочешь зависеть от Netlify.

### 3.1. Подключить репозиторий

1. https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Node version: `20`

### 3.2. Подключить домен

**Custom domain** → добавить `feel-life.ru` (и `www.feel-life.ru`).
У регистратора сменить NS-ы на Cloudflare.

### 3.3. OAuth-прокси через Cloudflare Worker

Используем готовый: https://github.com/vencax/netlify-cms-github-oauth-provider

**Создать GitHub OAuth App:**
1. https://github.com/settings/developers → **New OAuth App**
2. Application name: `Decap CMS for feel-life`
3. Homepage URL: `https://feel-life.ru`
4. Authorization callback URL: `https://decap-oauth.<поддомен>.workers.dev/auth/callback`
5. Сохрани **Client ID** и сгенерируй **Client secret**

**Задеплоить Worker:**
```bash
git clone https://github.com/vencax/netlify-cms-github-oauth-provider.git
cd netlify-cms-github-oauth-provider/cloudflare-worker
npm install
npx wrangler deploy
```

**Задать переменные** (Cloudflare Dashboard → Workers → твой воркер → Settings → Variables):

| Variable | Value |
|---|---|
| `GITHUB_CLIENT_ID` | из OAuth App |
| `GITHUB_CLIENT_SECRET` | из OAuth App |
| `GITHUB_REPO` | `ваш-логин/имя-репо` |
| `GITHUB_BRANCH` | `main` |

**Переключить конфиг админки** в `src/admin/index.html` или передать `?config=config.github.yml` (уже готов).

---

## 4. Деплой на GitHub Pages (если хостинг бесплатный и без регистрации)

Нужен GitHub Actions. Создай `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install --no-audit --no-fund
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    runs-on: ubuntu-latest
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

В репо: **Settings → Pages → Source: GitHub Actions**.

⚠️ С GitHub Pages придётся ещё поднять OAuth-прокси (как в п. 3.3) — иначе админка не сможет коммитить.

---

## 5. Локальная разработка (без GitHub)

```bash
npm run build      # собрать dist/
npm run start      # запустить dist/ на http://localhost:8000
# открыть http://localhost:8000/admin/
# авто-выберется config.local.yml (test-repo, без логина)
```

В test-repo режиме:
- ✅ Можно править контент, пробовать UI
- ✅ Изменения сохраняются в localStorage браузера
- ❌ На диск и на сайт ничего не идёт (для этого нужен GitHub)

Чтобы вытащить правки из test-repo: открой DevTools → Application → Local Storage → найди ключи `decap-cms.entries` (или похожие) → скопируй JSON → положи в `src/content/...`.

---

## 6. Структура проекта

```
.
├── src/
│   ├── _partials/          # Повторяющиеся фрагменты (header, footer, mobile-menu)
│   ├── admin/              # Decap CMS
│   │   ├── config.yml         # ← production (git-gateway + Netlify Identity)
│   │   ├── config.local.yml   # ← локальная разработка (test-repo)
│   │   ├── config.github.yml  # ← production на Cloudflare (GitHub OAuth)
│   │   └── index.html         # ← авто-выбор конфига по hostname
│   ├── assets/             # CSS, JS, шрифты, изображения
│   ├── content/            # ← Управляемый контент (Decap CMS редактирует это)
│   │   ├── events/
│   │   ├── posts/
│   │   ├── products/
│   │   ├── settings/
│   │   ├── testimonials/
│   │   └── tours/
│   ├── data/               # Статика, не редактируется через CMS
│   │   ├── directions.js
│   │   ├── navigation.js
│   │   ├── seo.js
│   │   └── site.js
│   ├── pages/              # HTML-страницы
│   ├── build.js            # Сборщик
│   └── favicon.svg
├── .gitignore
├── package.json
├── netlify.toml            # ← конфиг деплоя + Identity для Netlify
└── DEPLOY.md               # ← вы здесь
```

---

## 7. Что клиент может делать через админку

| Действие | Где в CMS |
|---|---|
| Изменить название сайта, контакты, соцсети | **Настройки сайта** |
| Добавить/изменить статью блога | **Блог → New / открыть существующую** |
| Загрузить фото обложки поста | **Блог → [статья] → Обложка → Upload** |
| Добавить/изменить тур | **Туры** |
| Добавить/изменить товар | **Магазин · Товары** |
| Добавить/изменить отзыв | **Отзывы** |
| Добавить ближайшее событие | **Ближайшие события** |

Все картинки и тексты — из админки. Изменения публикуются в один клик.

---

## 8. Команды

```bash
npm run build       # собрать dist/
npm run start       # запустить dist/ на http://localhost:8000
npm run dev         # build + start
npm run deploy      # собрать + закоммитить + запушить (с подтверждением)
npm run deploy:yes  # то же без подтверждения
./scripts/deploy.sh "сообщение"  # со своим commit message
```

---

## 8.1. Баннеры и изображения: размеры под мобайл + десктоп

Поскольку **большинство трафика — с мобильных**, на каждой странице с баннером используется `<picture>` с двумя версиями:

```html
<picture>
  <source media="(max-width: 768px)" srcset="…/hero-mobile.svg" sizes="100vw">
  <img src="…/hero.svg" sizes="100vw" …>
</picture>
```

Когда будете заменять SVG-плейсхолдеры на реальные фото, придерживайтесь схемы:

| Слот | Mobile (≤768px) | Desktop | Формат | Имена файлов |
|---|---|---|---|---|
| **Hero главная** (full-screen) | 750×1334 (1x) · 1500×2668 (2x retina) | 1920×1080 (1x) · 3840×2160 (2x retina) | WebP + JPEG fallback | `hero-mobile.webp`, `hero.webp` (+ `.jpg` fallback) |
| **Hero внутренняя** (split) | 750×1000 | 1200×800 | WebP + JPEG fallback | `hero-2-mobile.webp`, `hero-2.webp` |
| **Обложка поста** | 600×400 | 1200×675 | WebP | `cover.webp` |
| **Обложка тура** | 600×400 | 1200×675 | WebP | `cover.webp` |
| **Обложка товара** | 400×400 | 800×800 | WebP | `cover.webp` |
| **Галерея** | 600×600 | 1200×1200 | WebP | `gallery-N.webp` |
| **OG-превью** (для шеринга) | — | 1200×630 | JPEG | `og.jpg` |

**Почему так:**
- `sizes="100vw"` для полноэкранных — браузер знает, что займёт всю ширину viewport, и выберет подходящее разрешение
- WebP даёт **~30% меньше** JPEG при том же качестве
- 2x версия для retina (iPhone, Mac) — иначе картинка «мылит»
- Имена файлов фиксированные → клиент сможет загружать через CMS, а путь в `src/pages/*.html` менять не придётся (правите только при смене концепции)

**Структура в репо:**
```
src/assets/images/hero/
  ├── placeholder-hero.svg              ← десктоп-плейсхолдер (потом замените на hero.webp)
  ├── placeholder-hero-mobile.svg       ← мобильный плейсхолдер (потом замените на hero-mobile.webp)
  ├── placeholder-hero-2.svg
  └── placeholder-hero-2-mobile.svg
```

**Когда будете заменять:** положите реальные фото рядом (или в новую папку) и обновите `src` в `src/pages/index.html` и `src/pages/sound-healing/index.html`. Структура `<picture>` уже готова.

---

## 9. Чек-лист после первого деплоя

- [ ] Сайт открывается на `https://feel-life.ru`
- [ ] Админка открывается на `https://feel-life.ru/admin/`
- [ ] Кнопка «Login» работает (для Netlify — через Netlify Identity, для Cloudflare — через GitHub)
- [ ] Клиент приглашён, может войти
- [ ] Клиент может создать новую статью — она появляется в `/blog/`
- [ ] Коммит от админки уходит в `main` репозитория
- [ ] Хостинг (Netlify / Cloudflare Pages) перезапускает билд после push
- [ ] Новая статья появляется на сайте через ~30 секунд

---

## 10. Если что-то не работает

- **CMS показывает «Error: Not Found»** — проверьте `repo` в `config.yml` / `config.github.yml`
- **OAuth выдаёт 404** — неверный `base_url` или `auth_endpoint`
- **Кнопка «Login» есть, но не работает** — Identity не включён в Netlify
- **Изменения не появляются** — проверь что билд на хостинге запустился
- **Локально не открывается** — `http://localhost:8000/admin/?config=config.local.yml` + hard refresh (Ctrl+Shift+R)
- **Кеш админки** — добавь `?v=2` к URL, чтобы сбросить кеш config.yml
