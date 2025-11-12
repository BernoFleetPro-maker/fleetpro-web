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

# Install serve globally
RUN npm install -g serve

# Copy the built Vite app from builder
COPY --from=builder /app/client/dist /app/dist

# ✅ Ensure dist folder exists
RUN echo "Contents of /app/dist:" && ls -l /app/dist

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# ✅ Serve absolute path, ensure working directory is /app
WORKDIR /app
CMD ["serve", "-s", "/app/dist", "-l", "tcp://0.0.0.0:8080"]
