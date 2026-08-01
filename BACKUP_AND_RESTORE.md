# Production backup and restore

This branch captures the public `oknproekt.ru` application as deployed on
2026-08-01. It contains the static pages, assets, Node lead backend, sitemap,
robots rules, and sanitized deployment configuration.

## Secrets

The production environment file is intentionally not stored in Git. Restore
`/etc/oknproekt/oknproekt.env` from an encrypted password manager or encrypted
off-site backup. The required variable names are documented in `.env.example`.

Private proxy routes are also excluded from the Git version of the nginx
configuration. The exact configuration is retained only in the encrypted or
local server-configuration archive.

## Restore the site files

1. Clone this repository and check out the required production tag or branch.
2. Copy the checkout to a new release directory under
   `/var/www/oknproekt/releases/<timestamp>`.
3. Set ownership to `www-data:www-data`.
4. Restore the production environment file with mode `0640` or stricter.
5. Point `/var/www/oknproekt/current` at the verified release.
6. Run `npm run check`, `nginx -t`, and restart `oknproekt.service`.
7. Verify the home page, service routes, sitemap, lead endpoint, analytics, and
   a real `404` response before removing the previous release.

## Minimum production checks

- `systemctl is-active oknproekt`
- `curl -I https://oknproekt.ru/`
- `curl -I https://oknproekt.ru/sitemap.xml`
- `curl -I https://oknproekt.ru/this-page-must-not-exist`
- one H1 and one canonical on every indexable page
- visible FAQ content matches `FAQPage` structured data

Do not test the lead form with a real submission unless the recipient expects
the Telegram notification.

## Create a fresh local archive

From a trusted Mac with the `okn-vps` SSH alias configured, run:

```bash
./scripts/backup_production.sh
```

The script does not restart or modify the public application. It packages the
current site and server configuration in `/tmp`, downloads the result, verifies
checksums, and removes the temporary VPS files.
