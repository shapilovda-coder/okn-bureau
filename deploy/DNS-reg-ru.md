# DNS for oknproekt.ru on Reg.ru

Point the domain to the VPS only after the server is ready to answer HTTP requests.

## DNS records

Create or update these records in the DNS zone for `oknproekt.ru`:

```text
Type  Host  Value
A     @     217.177.45.115
A     www   217.177.45.115
```

Use the default TTL, or `300` seconds while setting up the site.

## What to remove

- Remove old `A` records for `@` or `www` if they point to another IP.
- Remove `AAAA` records for `@` or `www` unless IPv6 is configured on the VPS.
- Do not remove MX records if email for the domain is used.
- Do not change NS records unless the DNS zone is managed outside Reg.ru.

## Reg.ru path

In the Reg.ru account, open the domain `oknproekt.ru`, then open DNS zone management and edit DNS records there. If the domain uses external DNS servers, make the same changes in that external DNS provider instead.

## Check propagation

```bash
dig +short oknproekt.ru A
dig +short www.oknproekt.ru A
```

Both commands should return:

```text
217.177.45.115
```

After DNS resolves to the VPS, issue HTTPS certificates with Certbot.
