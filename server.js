// server.js - Complete TCP Proxy Server for Render
// Supports HTTP proxy, CONNECT method, and API endpoints

const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'production';

class RenderTCPProxy {
  constructor() {
    this.server = null;
    this.connections = new Set();
    this.stats = {
      requests: 0,
      connectTunnels: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  start() {
    this.server = http.createServer((req, res) => {
      this.stats.requests++;
      
      // Add comprehensive CORS headers
      this.addCorsHeaders(res);
      
      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Route requests to appropriate handlers
      this.routeRequest(req, res);
    });

    // Handle CONNECT method for HTTPS tunneling
    this.server.on('connect', (req, clientSocket, head) => {
      this.handleConnectTunnel(req, clientSocket, head);
    });

    // Error handling
    this.server.on('error', (err) => {
      console.error('❌ Server error:', err);
      this.stats.errors++;
    });

    // Start listening
    this.server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Render TCP Proxy Server started`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`⏰ Started: ${new Date().toISOString()}`);
      console.log(`🔗 CONNECT Support: ✅ Enabled`);
      console.log(`📊 Health Endpoint: /health`);
    });
  }

  addCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, CONNECT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target-URL, Proxy-Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Server', 'Render-TCP-Proxy/1.0');
  }

  routeRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    try {
      switch (parsedUrl.pathname) {
        case '/':
          this.handleRoot(req, res);
          break;
        case '/health':
          this.handleHealth(req, res);
          break;
        case '/proxy':
          this.handleAPIProxy(req, res);
          break;
        case '/stats':
          this.handleStats(req, res);
          break;
        default:
          // Traditional HTTP proxy (full URL in request)
          if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
            this.handleHTTPProxy(req, res);
          } else {
            this.handle404(req, res);
          }
      }
    } catch (error) {
      console.error('❌ Request routing error:', error);
      this.handleError(res, error);
    }
  }

  handleRoot(req, res) {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const info = `
🚀 Render TCP Proxy Server - Full CONNECT Support

📍 Server: ${req.headers.host}
🔗 CONNECT Method: ✅ Full TCP Tunneling Support
📊 Uptime: ${uptime} seconds
🌐 Environment: ${NODE_ENV}

📱 PROXY CONFIGURATION:
   Host: ${req.headers.host}
   Port: 443 (HTTPS) / 80 (HTTP)
   Type: HTTP/HTTPS with CONNECT
   Protocol: TCP Tunneling Supported

🔧 USAGE EXAMPLES:

   💻 Command Line:
   curl -x ${req.headers.host}:80 https://www.google.com
   curl -x ${req.headers.host}:80 http://httpbin.org/ip
   
   📱 Browser/App Config:
   HTTP Proxy: ${req.headers.host}:443
   HTTPS Proxy: ${req.headers.host}:443
   
   🔌 API Endpoint:
   curl "https://${req.headers.host}/proxy" \\
     -H "X-Target-URL: https://httpbin.org/ip"

📊 ENDPOINTS:
   🏠 Info: /
   ❤️ Health: /health  
   🔌 API Proxy: /proxy
   📈 Stats: /stats

📈 CURRENT STATS:
   📤 Total Requests: ${this.stats.requests}
   🔗 CONNECT Tunnels: ${this.stats.connectTunnels}
   🔌 Active Connections: ${this.connections.size}
   ❌ Errors: ${this.stats.errors}

⏰ Server Time: ${new Date().toISOString()}
🔄 Status: Online and Ready
    `;

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(info);
  }

  handleHealth(req, res) {
    const uptime = Date.now() - this.stats.startTime;
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime / 1000),
      uptime_human: this.formatUptime(uptime),
      server: {
        type: 'Render TCP Proxy',
        version: '1.0.0',
        node_version: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        port: PORT,
        environment: NODE_ENV
      },
      features: {
        http_proxy: true,
        https_proxy: true,
        connect_method: true,
        tcp_tunneling: true,
        api_proxy: true,
        cors_enabled: true,
        persistent_connections: true
      },
      statistics: {
        total_requests: this.stats.requests,
        connect_tunnels: this.stats.connectTunnels,
        active_connections: this.connections.size,
        error_count: this.stats.errors,
        requests_per_minute: Math.round(this.stats.requests / (uptime / 60000))
      },
      performance: {
        cpu_usage: process.cpuUsage(),
        memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        load_average: process.loadavg ? process.loadavg() : 'N/A'
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  handleAPIProxy(req, res) {
    try {
      const targetUrl = req.headers['x-target-url'] || 
                       url.parse(req.url, true).query.url;

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Missing target URL',
          usage: 'Add X-Target-URL header or ?url= parameter',
          examples: {
            header: 'X-Target-URL: https://httpbin.org/ip',
            query: '?url=https://httpbin.org/ip'
          }
        }));
        return;
      }

      if (!this.isValidUrl(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Invalid URL format',
          provided: targetUrl,
          expected: 'https://example.com/path'
        }));
        return;
      }

      console.log(`📤 API Proxy: ${req.method} ${targetUrl}`);
      this.proxyRequest(targetUrl, req, res, 'API');

    } catch (error) {
      console.error('❌ API Proxy Error:', error);
      this.handleError(res, error);
    }
  }

  handleHTTPProxy(req, res) {
    try {
      const targetUrl = req.url;
      console.log(`📤 HTTP Proxy: ${req.method} ${targetUrl}`);
      this.proxyRequest(targetUrl, req, res, 'HTTP');
    } catch (error) {
      console.error('❌ HTTP Proxy Error:', error);
      this.handleError(res, error);
    }
  }

  proxyRequest(targetUrl, req, res, type) {
    try {
      const parsedUrl = url.parse(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const targetPort = parsedUrl.port || (isHttps ? 443 : 80);

      const options = {
        hostname: parsedUrl.hostname,
        port: targetPort,
        path: parsedUrl.path,
        method: req.method,
        headers: { ...req.headers },
        timeout: 30000
      };

      // Clean up headers
      delete options.headers['host'];
      delete options.headers['x-target-url'];
      delete options.headers['proxy-connection'];
      
      // Set proper host header
      options.headers['host'] = parsedUrl.host;
      options.headers['user-agent'] = options.headers['user-agent'] || 
        'Mozilla/5.0 (compatible; RenderProxy/1.0)';

      const protocol = isHttps ? https : http;
      const proxyReq = protocol.request(options, (proxyRes) => {
        // Copy response headers
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'X-Proxy-Via': `Render-${type}`,
          'X-Proxy-Server': 'TCP-Proxy/1.0'
        });
        
        // Pipe response data
        proxyRes.pipe(res);
      });

      // Handle timeouts
      proxyReq.setTimeout(30000, () => {
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      });

      // Handle errors
      proxyReq.on('error', (err) => {
        console.error(`❌ ${type} Proxy Error:`, err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Gateway',
            message: err.message,
            target: targetUrl,
            timestamp: new Date().toISOString()
          }));
        }
      });

      // Pipe request data
      req.pipe(proxyReq);

    } catch (error) {
      console.error(`❌ ${type} Request Error:`, error);
      this.handleError(res, error);
    }
  }

  handleConnectTunnel(req, clientSocket, head) {
    try {
      const [targetHost, targetPort] = req.url.split(':');
      const port = parseInt(targetPort) || 443;

      console.log(`🔗 CONNECT Tunnel: ${targetHost}:${port}`);
      this.stats.connectTunnels++;

      // Track connection
      this.connections.add(clientSocket);

      // Create connection to target server
      const serverSocket = net.createConnection(port, targetHost, () => {
        // Send success response to client
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        console.log(`✅ Tunnel established: ${targetHost}:${port}`);

        // Start data tunneling
        serverSocket.pipe(clientSocket, { end: false });
        clientSocket.pipe(serverSocket, { end: false });
      });

      // Handle server connection errors
      serverSocket.on('error', (err) => {
        console.error(`❌ CONNECT Server Error (${targetHost}:${port}):`, err.message);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
        this.connections.delete(clientSocket);
        this.stats.errors++;
      });

      // Handle client errors
      clientSocket.on('error', (err) => {
        console.error(`❌ CONNECT Client Error:`, err.message);
        serverSocket.destroy();
        this.connections.delete(clientSocket);
      });

      // Clean up on close
      clientSocket.on('close', () => {
        serverSocket.destroy();
        this.connections.delete(clientSocket);
        console.log(`🔌 Tunnel closed: ${targetHost}:${port}`);
      });

      serverSocket.on('close', () => {
        clientSocket.destroy();
        this.connections.delete(clientSocket);
      });

      // Handle connection timeout
      serverSocket.setTimeout(300000, () => { // 5 minutes
        console.log(`⏰ Tunnel timeout: ${targetHost}:${port}`);
        serverSocket.destroy();
        clientSocket.destroy();
      });

    } catch (error) {
      console.error('❌ CONNECT Request Error:', error);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      this.stats.errors++;
    }
  }

  handleStats(req, res) {
    const uptime = Date.now() - this.stats.startTime;
    const stats = {
      server: 'Render TCP Proxy',
      uptime_ms: uptime,
      uptime_human: this.formatUptime(uptime),
      statistics: {
        total_requests: this.stats.requests,
        connect_tunnels: this.stats.connectTunnels,
        active_connections: this.connections.size,
        error_count: this.stats.errors,
        success_rate: `${((this.stats.requests - this.stats.errors) / Math.max(this.stats.requests, 1) * 100).toFixed(2)}%`
      },
      performance: {
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        requests_per_second: Math.round(this.stats.requests / (uptime / 1000))
      },
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
  }

  handle404(req, res) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'Invalid endpoint',
      available_endpoints: [
        '/ - Server information',
        '/health - Health check', 
        '/proxy - API proxy endpoint',
        '/stats - Server statistics',
        'http://example.com - HTTP proxy'
      ],
      usage: 'Use as HTTP proxy or API endpoint',
      timestamp: new Date().toISOString()
    }));
  }

  handleError(res, error) {
    this.stats.errors++;
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  isValidUrl(string) {
    try {
      const parsed = new URL(string);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  stop() {
    console.log('🛑 Shutting down TCP Proxy Server...');
    
    // Close all active connections
    this.connections.forEach(socket => {
      socket.destroy();
    });
    this.connections.clear();

    // Close server
    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server stopped gracefully');
      });
    }
  }
}

// Create and start server
const proxy = new RenderTCPProxy();
proxy.start();

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT (Ctrl+C)');
  proxy.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM (deployment/restart)');
  proxy.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  proxy.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚫 Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejections in production
});

// Health check for Render platform
setInterval(() => {
  console.log(`💓 Heartbeat - Uptime: ${proxy.formatUptime(Date.now() - proxy.stats.startTime)}, Connections: ${proxy.connections.size}`);
}, 300000); // Every 5 minutes

console.log('🎯 TCP Proxy Server initialized and ready for connections');