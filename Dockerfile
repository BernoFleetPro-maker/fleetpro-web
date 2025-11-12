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

# Copy built files
COPY --from=builder /app/client/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# ✅ DEBUG: List directory structure so we can see where dist actually is
RUN echo "---- FILE STRUCTURE ----" && ls -R /app

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["serve", "-s", "dist", "-l", "8080"]
