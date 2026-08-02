FROM node:20-alpine

# Install build deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create DB directory
RUN mkdir -p /app/db

# Expose port
EXPOSE 3000

# Health check — hits the auth-free /api/health (200), not /api/auth/me
# which returns 401 when logged out and would mark the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "server.js"]
