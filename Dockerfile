# Build stage for Go server
FROM golang:1.25-trixie AS go-builder

WORKDIR /build

# Copy Go module files first for better caching
COPY server/go.mod server/go.sum ./

# Copy all addon server modules (needed for go.mod replace directives)
COPY packages/ ../packages/

RUN go mod download

# Copy server source code
COPY server/ ./

# Build the server binary
RUN CGO_ENABLED=0 GOOS=linux go build -o tinycld .


# Build stage for web app
FROM node:24-trixie AS web-builder

WORKDIR /app

# Copy package files for better caching
COPY package.json package-lock.json ./
COPY packages/ ./packages/
RUN npm ci

# Copy source files needed for the web build
COPY app.json tsconfig.json vite.config.ts ./
COPY app/ ./app/
COPY components/ ./components/
COPY lib/ ./lib/
COPY ui/ ./ui/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY tinycld.addons.ts ./
COPY react-native.config.cjs ./

# Generate addon wiring and build web app
RUN npm run build:web


# Final runtime stage
FROM debian:bookworm-slim

ENV SENTRY_DSN=""

# Install CA certificates for HTTPS
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled server binary from go-builder
COPY --from=go-builder /build/tinycld ./tinycld

# Copy built web app, rename index.html to app.html for SPA fallback
COPY --from=web-builder /app/dist ./public
RUN mv ./public/index.html ./public/app.html

# Copy PocketBase migrations and hooks from the original context
COPY server/pb_migrations ./pb_migrations

# Create necessary directories
RUN mkdir -p pb_data types

EXPOSE 8080

CMD ["./tinycld", "serve", "--http=0.0.0.0:8080"]
