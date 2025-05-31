# Dockerfile for HTTP Proxy on Render
FROM node:18-alpine

# Install packages for proxy functionality
RUN apk add --no-cache curl net-tools

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the proxy server
CMD ["node", "server.js"]