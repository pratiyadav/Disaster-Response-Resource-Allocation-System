# Docker setup

## What is containerized

The current [`../compose.yaml`](../compose.yaml) defines one service: `frontend`. It builds [`../frontend/Dockerfile`](../frontend/Dockerfile) using `frontend/` as its build context and maps host port `8080` to container port `80`. There is no backend or database service yet.

The Dockerfile has two stages:

1. `node:22-alpine` copies the package manifests, runs `npm ci`, copies the frontend source, and runs the TypeScript/Vite production build.
2. `nginx:1.27-alpine` copies `frontend/nginx.conf` and the built `dist/` files, then serves them on port 80.

`frontend/.dockerignore` excludes local dependencies, build output, and local environment files from the build context. The static bundle contains no database credentials.

## Commands

Run from the repository root with Docker Compose installed:

```sh
docker compose up --build -d
```

Open `http://localhost:8080`. Check the health endpoint at `http://localhost:8080/healthz`. Stop and remove the running Compose containers with:

```sh
docker compose down
```

For source changes, rebuild with `docker compose up --build -d` again. Scenario edits live in the user's browser `localStorage`, not inside the container.

## Nginx behavior

`frontend/nginx.conf` serves the built `index.html` and assets. The `try_files` rule returns `index.html` for application paths, so client-side navigation can load directly. Built asset files get long-lived immutable caching. `/healthz` returns `ok`, and the Dockerfile health check requests that endpoint from within the container.

## Verification status and future expansion

`npm run build` passed, and the frontend was visually checked in a browser on desktop and mobile. **The Docker image and Compose stack have not been executed here because Docker was unavailable in the development environment.** The image build and health check should be run on a machine with Docker before relying on them.

When the backend exists, add its service, the PostGIS service, health checks, environment configuration, and any reverse-proxy/API routing needed by the frontend. Do not add placeholder credentials or claim the frontend is connected to those services before an end-to-end check passes.
