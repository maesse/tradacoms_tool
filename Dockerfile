# Multi-stage Dockerfile for building and serving the Vite SPA with nginx

# 1) Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies using lockfile when available for reproducible builds
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the app and build
COPY . .
RUN npm run build

# 2) Runtime stage
FROM nginx:alpine AS runtime

# Copy SPA-friendly nginx server config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built assets to nginx web root
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose default HTTP port
EXPOSE 80
