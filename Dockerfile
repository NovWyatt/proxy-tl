# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies (since package.json has no dependencies, this is fast)
RUN npm install --only=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S proxy -u 1001

# Change ownership of app directory
RUN chown -R proxy:nodejs /app
USER proxy

# Expose port (Render will override this)
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
                 http.get('http://localhost:' + (process.env.PORT || 10000) + '/health', (res) => { \
                   if (res.statusCode === 200) process.exit(0); \
                   else process.exit(1); \
                 }).on('error', () => process.exit(1));"

# Start the application
CMD ["node", "server.js"]