FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

# Production uses PostgreSQL (prisma/postgres/schema.prisma).
RUN npx prisma generate --schema prisma/postgres/schema.prisma && npm run build && npm prune --omit=dev

# Applies database migrations, then starts the server.
CMD ["npm", "run", "docker-start"]
