# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package files for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install client dependencies
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy everything else
COPY . .

# Build the Vite frontend
WORKDIR /app/client
RUN npm run build


# -------------------------------
# Stage 2: Serve the built files
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install static file server
RUN npm install -g serve

# Copy built frontend files from builder
COPY --from=builder /app/client/dist ./dist

# Set environment and expose port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start server correctly
CMD ["serve", "-s", "dist", "-l", "8080"]
