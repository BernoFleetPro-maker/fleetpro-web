# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy only package files first for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies for both root and client
RUN npm install --workspace client

# Copy rest of the app files
COPY . .

# Build the client project
RUN npm run build --workspace client


# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:22-alpine

WORKDIR /app

# Install a lightweight static file server
RUN npm install -g serve

# Copy build output from builder
COPY --from=builder /app/client/dist ./dist

# Expose the port that Railway assigns
EXPOSE 8080

# Start the server
CMD ["serve", "-s", "dist", "-l", "8080"]
