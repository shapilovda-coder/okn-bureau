# ОКН.Проект

Static premium landing page for an architectural bureau working with cultural heritage properties in Moscow.

## Stack

- Static frontend: `index.html` + `assets/`
- Minimal Node.js backend for the lead form
- Telegram delivery for leads
- nginx on Ubuntu VPS
- HTTPS via Let's Encrypt

## Local Structure

```text
.
├── index.html
├── assets/
├── server/
│   └── server.js
├── deploy/
│   ├── nginx/oknproekt.ru.conf
│   ├── systemd/oknproekt.service
│   └── README-server.md
├── .env.example
├── .gitignore
└── package.json
```

## Local Run

```bash
cp .env.example .env
npm start
```

Open `http://127.0.0.1:3000`.

The form will only send leads after `TELEGRAM_BOT_TOKEN` is configured in `.env`.

## Production Notes

- Do not commit `.env`.
- Store Telegram bot token only on the VPS.
- nginx should serve static files and reverse-proxy `/api/lead` to `127.0.0.1:3000`.
- Use `systemd` to keep the backend running.
- DNS setup for Reg.ru is documented in `deploy/DNS-reg-ru.md`.
