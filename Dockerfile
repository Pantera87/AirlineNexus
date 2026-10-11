# syntax=docker/docker-build:latest

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the application (Node 20 + Vite)
# ────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies in a dedicated layer for build caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy project sources and produce the static build
COPY . .
RUN npm run build

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — Serve static assets with nginx (no Node runtime needed)
# ────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Validate the nginx configuration at build time
RUN nginx -t

EXPOSE 80