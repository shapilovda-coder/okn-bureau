# Публикация из облачного ChatGPT

## Рабочий процесс

1. ChatGPT создаёт отдельную ветку и Pull Request.
2. GitHub Actions проверяет маршруты, HTML, SEO, JSON-LD, sitemap и ресурсы.
3. Vercel создаёт Preview с `X-Robots-Tag: noindex, nofollow`.
4. После визуального согласования Pull Request сливается в `main`.
5. GitHub Actions собирает минимальный release-архив и передаёт его на VPS.
6. VPS создаёт резервную копию, переключает release и проверяет все маршруты.
7. При ошибке deploy-скрипт возвращает предыдущую версию.

## GitHub configuration

Repository secrets:

- `OKN_VPS_HOST`
- `OKN_VPS_PORT`
- `OKN_VPS_USER`
- `OKN_VPS_SSH_KEY`
- `OKN_VPS_KNOWN_HOSTS`

Repository variable:

- `OKN_VPS_DEPLOY_ENABLED=true`

До завершения первичной настройки переменная должна отсутствовать или иметь
значение `false`.

## Production safety

- Production публикуется только из `main`.
- Telegram token хранится только в `/etc/oknproekt/oknproekt.env` на VPS.
- Vercel не является production-хостингом и не получает домен `oknproekt.ru`.
- Форму на Preview не отправляют: `/api/lead` там намеренно не подключён.
