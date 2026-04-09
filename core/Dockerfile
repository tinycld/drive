# Generate addon wiring (produces server/addon_extensions.go and other generated files)
FROM node:24-trixie AS addon-generator

WORKDIR /app

COPY package.json package-lock.json vite.config.ts ./
COPY packages/ ./packages/
RUN npm ci

COPY scripts/ ./scripts/
COPY server/ ./server/
COPY tinycld.addons.ts ./

# Remove broken symlinks (absolute paths from dev machine don't resolve in Docker)
RUN find server/pb_migrations server/pb_hooks -type l -delete 2>/dev/null || true

RUN npm run addons:generate

# Dereference symlinks so COPY in later stages gets real files
RUN find server/pb_migrations server/pb_hooks -type l -exec sh -c 'target=$(readlink "$1") && rm "$1" && cp "$target" "$1"' _ {} \; 2>/dev/null || true


# Build stage for Go server
FROM golang:1.25-trixie AS go-builder

WORKDIR /build

# Copy Go module files first for better caching
COPY server/go.mod server/go.sum ./

# Copy shared Go packages (needed for go.mod replace directives)
COPY server/mailer/ ./mailer/
COPY server/textextract/ ./textextract/

# Copy all addon server modules (needed for go.mod replace directives)
COPY packages/ ../packages/

RUN go mod download

# Copy server source code
COPY server/ ./

# Copy generated addon extensions from generator stage
COPY --from=addon-generator /app/server/addon_extensions.go ./addon_extensions.go

# Build the server binary
RUN CGO_ENABLED=0 GOOS=linux go build -o tinycld .


# Build stage for web app
FROM node:24-trixie AS web-builder

WORKDIR /app

# Copy package files for better caching
COPY package.json package-lock.json vite.config.ts ./
COPY packages/ ./packages/
RUN npm ci

# Copy source files needed for the web build
COPY app.json tsconfig.json ./
COPY app/ ./app/
COPY components/ ./components/
COPY lib/ ./lib/
COPY ui/ ./ui/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY tinycld.addons.ts ./
COPY react-native.config.cjs tamagui.config.ts ./

# Copy generated addon wiring from generator stage
COPY --from=addon-generator /app/lib/generated/ ./lib/generated/
COPY --from=addon-generator /app/app/a/ ./app/a/

# Build web app directly (skip prebuild:web which re-runs addons:generate)
ARG ONE_SERVER_URL
ENV ONE_SERVER_URL=${ONE_SERVER_URL}
RUN npx one build


# Final runtime stage
FROM debian:bookworm-slim

ENV SENTRY_DSN=""
ENV SERVE_ON_DOMAINS=""

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
COPY --from=web-builder /app/dist/client ./public
RUN mv ./public/index.html ./public/app.html

# Copy migrations from addon-generator where symlinks were resolved
COPY --from=addon-generator /app/server/pb_migrations ./pb_migrations

# Create necessary directories
RUN mkdir -p pb_data types

COPY config/dokku.app.json ./app.json

# 7090: default HTTP (backward compat / dev)
# 80/443: autocert HTTP/HTTPS (production with domain)
# 993: IMAPS (implicit TLS)
# 465: SMTPS (implicit TLS)
EXPOSE 80 443 993 465

# When SERVE_ON_DOMAINS is set (space-separated), serve with autocert on those domains.
# Otherwise fall back to plain HTTP on port 7090.
#   dokku config:set myapp SERVE_ON_DOMAINS="tinycld.com tinycld.org www.tinycld.org"
CMD if [ -n "$SERVE_ON_DOMAINS" ]; then \
        exec ./tinycld serve $SERVE_ON_DOMAINS; \
    else \
        exec ./tinycld serve --http=0.0.0.0:7090; \
    fi
