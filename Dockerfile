FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs build tools for native compilation
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Remove build tools after native modules are compiled
RUN apk del python3 make g++

COPY server.js db.js ./
COPY public/ public/

# Persist SQLite data via volume
RUN mkdir -p data
VOLUME /app/data

EXPOSE 3000

CMD ["node", "server.js"]
