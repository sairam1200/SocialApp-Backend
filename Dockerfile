# ---------- Build Stage ----------
FROM node:22-bookworm AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev pkg-config && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ---------- Production Stage ----------
FROM node:22-bookworm

# Install FFmpeg + FFprobe
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# If you use Prisma, uncomment the next line:
# COPY --from=builder /app/prisma ./prisma

COPY --from=builder /app/public ./public

EXPOSE 8080

CMD ["node", "dist/main.js"]