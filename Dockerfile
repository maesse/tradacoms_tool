# Multi-stage Dockerfile for building and serving the Vite SPA with nginx

# 1) Build stage
FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies (npm install handles cross-platform optional deps
# that npm ci rejects when lock file was generated on a different OS)
COPY package*.json ./
RUN npm install

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
