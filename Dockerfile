# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Copy the full client folder before installing
COPY client ./client

# Install dependencies for the client only
RUN npm ci --prefix ./client --legacy-peer-deps

# Build the client project
RUN npm run build --prefix ./client

# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:22-alpine

WORKDIR /app

# Install lightweight static file server globally
RUN npm install -g serve

# Copy build output from builder
COPY --from=builder /app/client/dist ./dist

# Expose the port that Railway assigns
EXPOSE 8080

# Start the server
CMD ["serve", "-s", "dist", "-l", "8080"]
