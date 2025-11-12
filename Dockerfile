# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only package files for caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy everything else
COPY . .

# Build the Vite frontend
WORKDIR /app/client
RUN npm run build


# -------------------------------
# Stage 2: Serve built files
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install lightweight static server
RUN npm install -g serve

# Copy the built dist folder from builder (check actual path)
COPY --from=builder /app/client/dist ./client/dist

# Environment and port
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Serve the correct folder path
CMD ["serve", "-s", "client/dist", "-l", "8080"]
