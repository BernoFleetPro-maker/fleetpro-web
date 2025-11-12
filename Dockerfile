# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package files for dependency install
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm set cache /tmp/npm-cache --global
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy the rest of the project including client source
COPY . .

# Set working directory to client
WORKDIR /app/client

# Build the frontend
RUN npm run build

# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install lightweight static file server
RUN npm install -g serve

# Copy built frontend from builder stage
COPY --from=builder /app/client/dist ./dist

# Environment and port setup
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run production server
CMD ["serve", "-s", "dist", "-l", "8080"]
