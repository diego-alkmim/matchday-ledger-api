FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=builder /app ./
ENV NODE_ENV=production
CMD ["node", "dist/src/main.js"]
