# Build stage - includes devDependencies for building
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install ALL dependencies (including devDependencies for vite)
RUN npm ci

# Install backend dependencies
RUN cd backend && npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --omit=dev

# Install backend production dependencies
RUN cd backend && npm ci --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend source
COPY backend ./backend

# Copy other necessary files
COPY .digitalocean ./digitalocean

# Expose port
EXPOSE 3001

# Set environment variable
ENV NODE_ENV=production

# Start the server
CMD ["node", "backend/server.js"]

