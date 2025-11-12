# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package files first for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Disable optional dependencies for faster installs
ENV npm_config_optional=false
ENV CI=true

# Install dependencies (no workspace loop)
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy the rest of the project
COPY . .

# Build the Vite frontend
RUN cd client && npm run build

# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install lightweight static server
RUN npm install -g serve

# Copy build output from builder
COPY --from=builder /app/client/dist ./dist

# Expose and set environment port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start server
CMD ["npx", "serve", "-s", "dist", "-l", "0.0.0.0:8080"]
