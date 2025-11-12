# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies for the client (cached layer)
RUN npm install --prefix ./client --legacy-peer-deps

# Copy full client source (after dependencies cached)
COPY client ./client

# Set build environment variables
ENV NODE_ENV=production
ENV VITE_API_URL=${VITE_API_URL:-https://fleetpro-backend-production.up.railway.app}

# Build the Vite project
RUN npm run build --prefix ./client

# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:22-alpine

# Working directory
WORKDIR /app

# Install lightweight static server globally
RUN npm install -g serve

# Copy build output from builder stage
COPY --from=builder /app/client/dist ./dist

# Expose port for Railway
EXPOSE 8080

# Define environment variable for serve (optional)
ENV PORT=8080
ENV NODE_ENV=production

# Start the server
CMD ["serve", "-s", "dist", "-l", "8080"]
