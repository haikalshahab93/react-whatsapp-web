# syntax=docker/dockerfile:1

# ---- 1. Build the web app -------------------------------------------------------
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. Runtime: the API serves both the REST/Socket.IO endpoints and the build --
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/ ./
COPY --from=web /app/build /app/build

# Render/Railway inject PORT; the API defaults to 5000 locally.
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
