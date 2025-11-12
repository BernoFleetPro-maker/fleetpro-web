# -------------------------------
# Stage 1: Build the Vite frontend
# -------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy only necessary files first for cache efficiency
COPY package*.json ./ 
COPY client/package*.json ./client/

# Install client dependencies
RUN cd client && npm install --legacy-peer-deps --no-audit --progress=false

# Copy the rest of the app
COPY . .

# Build the Vite app
WORKDIR /app/client
RUN npm run build


# -------------------------------
# Stage 2: Serve the built app
# -------------------------------
FROM node:20-alpine
WORKDIR /app

# Install static file server
RUN npm install -g serve

# Copy Vite build output from builder
COPY --from=builder /app/client/dist ./dist

# Expose port and start
ENV PORT=8080
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
