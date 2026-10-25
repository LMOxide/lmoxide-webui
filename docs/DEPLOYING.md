# Deploying

[← README](../README.md)

```sh
pnpm install
pnpm build                   # → dist/
```

Serve `dist/` as a single-page app: unknown paths fall back to `index.html`.

## Same origin (recommended)

By default the UI calls the API at `/api` on its own origin. Put both behind one reverse proxy:

| Path | Goes to |
|---|---|
| `/api/` | `lmoxide-api` (e.g. `127.0.0.1:8090`), with the `/api` prefix stripped |
| everything else | `dist/` |

Then set `LMOXIDE_API_TRUST_FORWARDED_FOR=true` on the API so its rate limits and audit log see
real client addresses.

<details>
<summary>Example: Caddy</summary>

```caddy
lmo.example.org {
	handle_path /api/* {
		reverse_proxy 127.0.0.1:8090
	}
	handle {
		root * /srv/lmoxide-webui/dist
		try_files {path} /index.html
		file_server
	}
}
```

</details>

<details>
<summary>Example: nginx</summary>

```nginx
server {
    server_name lmo.example.org;
    root /srv/lmoxide-webui/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / {
        try_files $uri /index.html;
    }
}
```

</details>

## API on another origin

Build with the API's URL and allow the UI's origin on the API:

```sh
VITE_API_URL=https://api.example.org pnpm build
```

```sh
LMOXIDE_API_CORS_ORIGINS=https://lmo.example.org lmoxide-api ...
```

## Under a sub-path

To serve the UI at e.g. `/admin/`, build with `pnpm build --base /admin/` and point the proxy's
fallback at `/admin/index.html`.

## Registration

The UI offers **Create an account** only if the API runs with `--open-registration`
(`LMOXIDE_API_OPEN_REGISTRATION`). Without it, admins create accounts from the console.
