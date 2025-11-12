# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Copy only package files first for caching
COPY package*.json ./
COPY client/package*.json ./client/

# ✅ Enable clean npm cache and faster installs
RUN npm set cache /tmp/npm-cache --global

# ✅ Install dependencies for client only
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy all remaining files
COPY . .

# Build Vite frontend
RUN cd client && npm run build


# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:22-alpine
WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/client/dist ./dist

# Environment + port
ENV NODE_ENV=production
ENV PORT=${PORT:-8080}
EXPOSE ${PORT}

# Start static server
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]