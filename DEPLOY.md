# Как выкатить изменения на сервер

Шпаргалка: компьютер → GitHub → сервер → перезапуск.
Репозиторий: `https://github.com/necrolimmin/SilkRail`, ветка `main`. Папка проекта на сервере: `/home/SilkRail`.

---

## 1. На своём компьютере: отправить изменения в GitHub

В терминале VS Code (PowerShell), из папки `D:\Project\railvision`:

```powershell
git status                        # что изменилось (красное — ещё не добавлено)
git add -A                        # добавить все изменения
git commit -m "Коротко, что сделано"
git push origin main              # отправить в GitHub
```

- База (`*.db`), папка `backend/data/`, файл `.env` и загруженные фото (`backend/static/uploads/`) **в git не попадают** — так и задумано, см. раздел 5.
- Если `git push` пишет `rejected ... fetch first` — в GitHub есть изменения, которых нет у вас. Сначала `git pull origin main`, потом снова `git push origin main`.

---

## 2. На сервере: забрать изменения

```bash
ssh <пользователь>@<адрес-сервера>
cd /home/SilkRail
git pull origin main
```

**Если `git pull` ругается** `Your local changes ... would be overwritten`, значит на сервере кто-то правил файлы руками:

```bash
git stash          # убрать ручные правки в сторону
git pull origin main
git stash drop     # выбросить их (если они нужны — пришлите вывод `git stash show -p`, разберём)
```

> Правило: код на сервере руками не меняем. Все правки — на компьютере, потом push → pull.

---

## 3. Перезапустить

Сначала узнайте, как запущен проект:

```bash
docker compose ps
```

### Если видите контейнеры `backend`, `frontend`, `db` (запуск через Docker)

```bash
docker compose up -d --build      # пересобрать и перезапустить всё (1–5 минут)
docker compose ps                 # все три должны быть "running" / "Up"
docker compose logs -f backend    # смотреть логи бэкенда, выход — Ctrl+C
```

Сайт: `http://<адрес-сервера>:8080`.

### Если контейнеров нет (запуск вручную)

```bash
# бэкенд
cd /home/SilkRail/backend
pip install -r requirements.txt   # если появились новые библиотеки
# остановить старый uvicorn (Ctrl+C в его окне, или найти процесс):
pkill -f "uvicorn app.main:app"
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > uvicorn.log 2>&1 &

# фронтенд
cd /home/SilkRail/frontend
npm install                       # если менялся package.json
npm run build                     # готовая сборка появится в frontend/dist
```

После перезапуска откройте сайт и нажмите **Ctrl+F5** (обновить без кэша).

---

## 4. Одноразовые шаги после конкретных обновлений

Выполнять **один раз**, только когда это обновление впервые попало на сервер.

### Обновление «Тошкент МТУ по схеме» (`app/sync_mtu.py`)

Приводит станции Тошкент МТУ к официальной схеме: названия, состав МТУ, новые станции.

Docker:
```bash
docker compose exec db pg_dump -U railvision railvision > ~/silkrail-before-mtu.sql   # копия базы
docker compose exec backend python -m app.sync_mtu            # сначала посмотреть, что изменится
docker compose exec backend python -m app.sync_mtu --apply    # применить
```

Без Docker:
```bash
cd /home/SilkRail/backend
python -m app.sync_mtu            # посмотреть
python -m app.sync_mtu --apply    # применить (копию SQLite-базы скрипт делает сам)
```

Если в просмотре много строк `skipped` — не применяйте, пришлите вывод: значит база на сервере собрана из других данных, чем на компьютере.

---

## 5. Что не переносится через git

| Что | Где | Как перенести |
|---|---|---|
| Ключ API отчётов МТУ | `backend/.env` | создать на сервере вручную (см. ниже) |
| База данных | `backend/railvision.db` (или PostgreSQL в Docker) | живёт на сервере, git её не трогает |
| Правки карты, сотрудники, пути, кадастр | `backend/data/*.json` | `scp` (см. ниже) |
| Загруженные фото, 360°, PDF | `backend/static/uploads/` | `scp -r` |

`backend/.env` на сервере:
```
EXTERNAL_API_URL=https://rabota.mtutoshkent.uz/api
EXTERNAL_API_KEY=<ключ>
EXTERNAL_API_BRANCHES=Toshkent MTU
```
После создания или изменения `.env` — перезапуск (раздел 3). Ключ никуда больше не вставлять: ни в код, ни в чат, ни в git.

Скопировать файл с компьютера на сервер (PowerShell на компьютере):
```powershell
scp backend\data\map_edits.json <пользователь>@<адрес-сервера>:/home/SilkRail/backend/data/
```

---

## 6. Если что-то сломалось

| Что видно | Что делать |
|---|---|
| «Server bilan xatolik» / данные не грузятся | бэкенд не перезапущен или упал: раздел 3, затем `docker compose logs --tail 100 backend` |
| Белый экран | Ctrl+F5; если не помогло — открыть F12 → Console и прислать красную ошибку |
| Старый вид после обновления | фронтенд не пересобран: `docker compose up -d --build` (или `npm run build`) и Ctrl+F5 |
| `git pull` ругается | раздел 2 |
| Новое обновление всё сломало | откат кода, ниже |

**Откат кода на предыдущую версию** (на сервере):
```bash
cd /home/SilkRail
git log --oneline -5              # список версий, первая строка — текущая
git checkout <хеш-нужной-версии>  # например: git checkout e4152fb
docker compose up -d --build
```
Вернуться обратно на свежую версию: `git checkout main`, затем снова `docker compose up -d --build`.
База и загруженные файлы при откате кода не меняются.

---

## Коротко: обычное обновление

```powershell
# компьютер
git add -A
git commit -m "что сделано"
git push origin main
```
```bash
# сервер
cd /home/SilkRail
git pull origin main
docker compose up -d --build
```
Затем Ctrl+F5 в браузере.
