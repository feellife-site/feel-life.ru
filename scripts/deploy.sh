#!/usr/bin/env bash
# ============================================================
#  deploy.sh — деплой проекта на GitHub
# ============================================================
#  Что делает:
#    1. Проверяет, что мы в git-репо
#    2. Смотрит remote (origin = github)
#    3. Показывает что изменилось (git status)
#    4. Спрашивает подтверждение
#    5. Собирает dist/ (npm run build)
#    6. Проверяет, что .trae/, node_modules/, dist/ не попадут
#    7. Коммитит и пушит в origin/main
#
#  Использование:
#    ./scripts/deploy.sh                  → с интерактивным подтверждением
#    ./scripts/deploy.sh "сообщение"      → со своим сообщением коммита
#    ./scripts/deploy.sh --yes "msg"      → без подтверждения
# ============================================================

set -e

# ── Цвета ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Аргументы ──
ASSUME_YES=0
COMMIT_MSG=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    *)        COMMIT_MSG="$arg" ;;
  esac
done

# ── Проверки ──
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "${RED}✗ Это не git-репозиторий${NC}"
  exit 1
fi

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Remote
ORIGIN_URL=$(git config --get remote.origin.url || echo "")
if [ -z "$ORIGIN_URL" ]; then
  echo -e "${RED}✗ Не настроен remote origin${NC}"
  echo "  Добавь: git remote add origin https://github.com/<user>/<repo>.git"
  exit 1
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Чистый ли репо
if [ -n "$(git status --porcelain)" ]; then
  HAS_CHANGES=1
else
  HAS_CHANGES=0
fi

# ── Старт ──
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Deploy → $ORIGIN_URL${NC}"
echo -e "${BOLD}  Branch: $BRANCH${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$HAS_CHANGES" = "0" ]; then
  echo -e "${GREEN}✓ Нет изменений для коммита${NC}"
  echo "  Но всё равно пробую запушить (если remote впереди)..."
  git push origin "$BRANCH" 2>&1 || true
  exit 0
fi

# ── Что изменилось ──
echo -e "\n${BLUE}Изменения:${NC}"
git status --short

# Защита от .trae/, node_modules/, dist/
# Ловим только ДОБАВЛЕНИЕ (? или A в первой колонке), не удаление (D)
BAD_FILES=$(git status --porcelain | awk '$1 == "??" || $1 ~ /^A/ {print $2}' | grep -E "^\.trae/|^\.vscode/|^\.idea/|node_modules/|^dist/" || true)
if [ -n "$BAD_FILES" ]; then
  echo -e "\n${RED}✗ Обнаружены файлы, которые НЕ должны попадать в репо:${NC}"
  echo "$BAD_FILES"
  echo -e "${YELLOW}Проверь .gitignore${NC}"
  exit 1
fi

# ── Подтверждение ──
if [ "$ASSUME_YES" = "0" ]; then
  echo -e "\n${YELLOW}Продолжить? [y/N]${NC}"
  read -r REPLY
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *) echo "Отменено"; exit 0 ;;
  esac
fi

# ── Билд ──
echo -e "\n${BLUE}→ Собираю dist/...${NC}"
npm run build --silent

# ── Stage (только src/, конфиги, скрипты) ──
echo -e "${BLUE}→ Добавляю файлы...${NC}"
git add .gitignore package.json netlify.toml DEPLOY.md PROJECT.md src/ scripts/

# Сообщение по умолчанию
if [ -z "$COMMIT_MSG" ]; then
  CHANGED=$(git status --porcelain | wc -l | tr -d ' ')
  COMMIT_MSG="deploy: update site ($CHANGED files)"
fi

# ── Коммит ──
echo -e "${BLUE}→ Коммичу: ${BOLD}$COMMIT_MSG${NC}"
git commit -m "$COMMIT_MSG"

# ── Push ──
echo -e "${BLUE}→ Пушу в origin/$BRANCH...${NC}"
git push origin "$BRANCH"

echo -e "\n${GREEN}✓ Залито. Netlify/Cloudflare подхватит автоматически.${NC}"
echo -e "  ${BOLD}https://github.com/$(echo "$ORIGIN_URL" | sed 's|.*github.com[:/]||;s|\.git$||')${NC}"
