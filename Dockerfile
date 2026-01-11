# Build stage - includes devDependencies for building
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies including dev
RUN npm install --include=dev

# Verify vite is installed
RUN ls -la node_modules/.bin/ | head -20 || echo "No .bin directory"
RUN ls node_modules | grep vite || echo "No vite package"

# Copy source code
COPY . .

# Build the frontend using npm script
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm install --omit=dev

# Install backend production dependencies
WORKDIR /app/backend
RUN npm install --omit=dev

# Go back to app root
WORKDIR /app

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend source
COPY backend ./backend

# Expose port
EXPOSE 3000

# Set environment variable
ENV NODE_ENV=production

# Start the server
CMD ["node", "backend/server.js"]
