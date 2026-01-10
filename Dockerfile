# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Production stage
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Copy package files and dependencies from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb ./
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY --from=builder /app/src ./src

# Create non-root user for security
RUN addgroup -g 1000 -S appgroup && \
    adduser -S appuser -u 1000 -G appgroup

# Create data directory for state persistence
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose the port (Fly.io uses PORT env var)
EXPOSE 8080

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
CMD ["bun", "run", "src/main.ts"]
