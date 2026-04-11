# VPS Deployment

Minimal production model:

- GitHub stores the repository.
- VPS pulls the repository.
- nginx serves `index.html` and `assets/`.
- Node.js handles only `POST /api/lead`.
- systemd keeps the Node.js backend running.

## 1. Server Packages

```bash
apt update
apt install -y nginx git curl certbot python3-certbot-nginx
```

Install Node.js 20 LTS or newer before enabling the backend.

Before production launch, replace the initial root password from the hosting panel and prefer SSH keys for regular access.

## 2. Project Folder

```bash
mkdir -p /var/www/oknproekt
cd /var/www/oknproekt
git clone YOUR_GITHUB_REPO_URL current
chown -R www-data:www-data /var/www/oknproekt
```

## 3. Environment

```bash
mkdir -p /etc/oknproekt
nano /etc/oknproekt/oknproekt.env
chmod 600 /etc/oknproekt/oknproekt.env
chown root:www-data /etc/oknproekt/oknproekt.env
```

Example:

```bash
PORT=3000
HOST=127.0.0.1
PUBLIC_DIR=/var/www/oknproekt/current
TELEGRAM_BOT_USERNAME=dmitry_helper_bot
TELEGRAM_BOT_TOKEN=replace_with_real_token
TELEGRAM_CHAT_ID=144216447
```

Keep the real Telegram token only in this server file. Do not commit it to GitHub and do not place it in `index.html`.

## 4. systemd

```bash
cp /var/www/oknproekt/current/deploy/systemd/oknproekt.service /etc/systemd/system/oknproekt.service
systemctl daemon-reload
systemctl enable --now oknproekt
systemctl status oknproekt
```

## 5. nginx

```bash
cp /var/www/oknproekt/current/deploy/nginx/oknproekt.ru.conf /etc/nginx/sites-available/oknproekt.ru
ln -s /etc/nginx/sites-available/oknproekt.ru /etc/nginx/sites-enabled/oknproekt.ru
nginx -t
systemctl reload nginx
```

## 6. HTTPS

After DNS A records point to the VPS:

```bash
certbot --nginx -d oknproekt.ru -d www.oknproekt.ru
```

See `deploy/DNS-reg-ru.md` for the exact DNS records.

## 7. Manual Deploy

```bash
cd /var/www/oknproekt/current
git pull
systemctl restart oknproekt
systemctl reload nginx
```
