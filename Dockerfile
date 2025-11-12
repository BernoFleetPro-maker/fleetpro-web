# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy all project files
COPY . .

# Build frontend
WORKDIR /app/client
RUN npm run build


# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built dist folder from builder
COPY --from=builder /app/client/dist ./dist

# Environment
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# ✅ Serve the built static files
CMD ["serve", "-s", "dist", "-l", "8080"]
