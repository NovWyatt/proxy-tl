// server.js - Hybrid HTTP + SOCKS5 Proxy Server for Render
// Supports HTTP proxy, CONNECT method, SOCKS5 proxy, and API endpoints

const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const HTTP_PORT = process.env.PORT || 10000;
const SOCKS5_PORT = process.env.SOCKS5_PORT || (HTTP_PORT + 1);
const NODE_ENV = process.env.NODE_ENV || 'production';

// SOCKS5 Protocol Constants
const SOCKS_VERSION = 5;
const AUTHENTICATION_METHODS = {
  NO_AUTH: 0x00,
  USERNAME_PASSWORD: 0x02
};
const COMMANDS = {
  CONNECT: 0x01
};
const ADDRESS_TYPES = {
  IPv4: 0x01,
  DOMAIN: 0x03,
  IPv6: 0x04
};

class HybridProxyServer {
  constructor() {
    this.httpServer = null;
    this.socks5Server = null;
    this.connections = new Set();
    this.stats = {
      httpRequests: 0,
      socks5Connections: 0,
      connectTunnels: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    // Optional SOCKS5 authentication
    this.socks5Auth = null; // Set to {username: 'user', password: 'pass'} for auth
  }

  start() {
    this.startHTTPServer();
    this.startSOCKS5Server();
  }

  startHTTPServer() {
    this.httpServer = http.createServer((req, res) => {
      this.stats.httpRequests++;
      
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
    this.httpServer.on('connect', (req, clientSocket, head) => {
      this.handleHTTPConnectTunnel(req, clientSocket, head);
    });

    // Error handling
    this.httpServer.on('error', (err) => {
      console.error('❌ HTTP Server error:', err);
      this.stats.errors++;
    });

    // Start HTTP server
    this.httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`🌐 HTTP Proxy Server running on port ${HTTP_PORT}`);
    });
  }

  startSOCKS5Server() {
    this.socks5Server = net.createServer((clientSocket) => {
      console.log('🧦 New SOCKS5 connection from:', clientSocket.remoteAddress);
      this.stats.socks5Connections++;
      this.connections.add(clientSocket);
      
      clientSocket.on('close', () => {
        this.connections.delete(clientSocket);
      });

      this.handleSOCKS5Connection(clientSocket);
    });

    this.socks5Server.on('error', (err) => {
      console.error('❌ SOCKS5 Server error:', err);
      this.stats.errors++;
    });

    // Start SOCKS5 server
    this.socks5Server.listen(SOCKS5_PORT, '0.0.0.0', () => {
      console.log(`🧦 SOCKS5 Proxy Server running on port ${SOCKS5_PORT}`);
      console.log(`📱 Perfect for Telegram and other apps!`);
      this.printStartupInfo();
    });
  }

  printStartupInfo() {
    console.log(`\n🚀 Hybrid Proxy Server Started Successfully!`);
    console.log(`📍 HTTP Proxy: Port ${HTTP_PORT}`);
    console.log(`🧦 SOCKS5 Proxy: Port ${SOCKS5_PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`⏰ Started: ${new Date().toISOString()}`);
    console.log(`🔗 Features: HTTP, HTTPS, CONNECT, SOCKS5, API`);
    console.log(`📊 Health Endpoint: http://localhost:${HTTP_PORT}/health`);
    console.log(`📱 Telegram Config: SOCKS5, Port ${SOCKS5_PORT}, No Auth`);
  }

  // HTTP Proxy Methods (existing code)
  addCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, CONNECT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target-URL, Proxy-Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Server', 'Hybrid-Proxy/1.0');
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
🚀 Hybrid HTTP + SOCKS5 Proxy Server

📍 Server: ${req.headers.host}
🌐 HTTP Proxy: Port ${HTTP_PORT} (API, CONNECT, Traditional)
🧦 SOCKS5 Proxy: Port ${SOCKS5_PORT} (TCP Tunneling)
📊 Uptime: ${uptime} seconds
🌍 Environment: ${NODE_ENV}

📱 PROXY CONFIGURATIONS:

   🌐 HTTP Proxy (Web, API, cURL):
   Host: ${req.headers.host}
   Port: ${HTTP_PORT}
   Type: HTTP/HTTPS
   
   🧦 SOCKS5 Proxy (Telegram, Apps):
   Host: ${req.headers.host}
   Port: ${SOCKS5_PORT}
   Type: SOCKS5
   Authentication: ${this.socks5Auth ? 'Username/Password' : 'None'}

🔧 USAGE EXAMPLES:

   💻 HTTP Proxy:
   curl -x ${req.headers.host}:${HTTP_PORT} http://httpbin.org/ip
   curl -x ${req.headers.host}:${HTTP_PORT} https://www.google.com
   
   🧦 SOCKS5 Proxy:
   curl --socks5 ${req.headers.host}:${SOCKS5_PORT} https://httpbin.org/ip
   
   📱 Telegram Config:
   Type: SOCKS5
   Server: ${req.headers.host}
   Port: ${SOCKS5_PORT}
   Username: ${this.socks5Auth ? this.socks5Auth.username : '(none)'}
   Password: ${this.socks5Auth ? '••••••••' : '(none)'}
   
   🔌 API Endpoint:
   curl "http://${req.headers.host}:${HTTP_PORT}/proxy" \\
     -H "X-Target-URL: https://httpbin.org/ip"

📊 ENDPOINTS:
   🏠 Info: /
   ❤️ Health: /health  
   🔌 API Proxy: /proxy
   📈 Stats: /stats

📈 CURRENT STATS:
   📤 HTTP Requests: ${this.stats.httpRequests}
   🧦 SOCKS5 Connections: ${this.stats.socks5Connections}
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
        type: 'Hybrid HTTP + SOCKS5 Proxy',
        version: '1.0.0',
        node_version: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        ports: {
          http: HTTP_PORT,
          socks5: SOCKS5_PORT
        },
        environment: NODE_ENV
      },
      features: {
        http_proxy: true,
        https_proxy: true,
        connect_method: true,
        socks5_proxy: true,
        tcp_tunneling: true,
        api_proxy: true,
        cors_enabled: true,
        telegram_support: true
      },
      statistics: {
        http_requests: this.stats.httpRequests,
        socks5_connections: this.stats.socks5Connections,
        connect_tunnels: this.stats.connectTunnels,
        active_connections: this.connections.size,
        error_count: this.stats.errors,
        requests_per_minute: Math.round(this.stats.httpRequests / (uptime / 60000))
      },
      authentication: {
        socks5_auth_enabled: !!this.socks5Auth,
        socks5_username: this.socks5Auth ? this.socks5Auth.username : null
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  // HTTP Proxy methods (keeping existing implementation)
  handleAPIProxy(req, res) {
    try {
      const targetUrl = req.headers['x-target-url'] || 
                       url.parse(req.url, true).query.url;

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Missing target URL',
          usage: 'Add X-Target-URL header or ?url= parameter'
        }));
        return;
      }

      if (!this.isValidUrl(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Invalid URL format'
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

      delete options.headers['host'];
      delete options.headers['x-target-url'];
      delete options.headers['proxy-connection'];
      
      options.headers['host'] = parsedUrl.host;
      options.headers['user-agent'] = options.headers['user-agent'] || 
        'Mozilla/5.0 (compatible; HybridProxy/1.0)';

      const protocol = isHttps ? https : http;
      const proxyReq = protocol.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'X-Proxy-Via': `HTTP-${type}`,
          'X-Proxy-Server': 'Hybrid-Proxy/1.0'
        });
        
        proxyRes.pipe(res);
      });

      proxyReq.setTimeout(30000, () => {
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway Timeout');
      });

      proxyReq.on('error', (err) => {
        console.error(`❌ ${type} Proxy Error:`, err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
        }
      });

      req.pipe(proxyReq);
    } catch (error) {
      console.error(`❌ ${type} Request Error:`, error);
      this.handleError(res, error);
    }
  }

  handleHTTPConnectTunnel(req, clientSocket, head) {
    try {
      const [targetHost, targetPort] = req.url.split(':');
      const port = parseInt(targetPort) || 443;

      console.log(`🔗 HTTP CONNECT Tunnel: ${targetHost}:${port}`);
      this.stats.connectTunnels++;
      this.connections.add(clientSocket);

      const serverSocket = net.createConnection(port, targetHost, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        console.log(`✅ HTTP Tunnel established: ${targetHost}:${port}`);

        serverSocket.pipe(clientSocket, { end: false });
        clientSocket.pipe(serverSocket, { end: false });
      });

      serverSocket.on('error', (err) => {
        console.error(`❌ HTTP CONNECT Error (${targetHost}:${port}):`, err.message);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
        this.connections.delete(clientSocket);
        this.stats.errors++;
      });

      clientSocket.on('close', () => {
        serverSocket.destroy();
        this.connections.delete(clientSocket);
      });

    } catch (error) {
      console.error('❌ HTTP CONNECT Error:', error);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      this.stats.errors++;
    }
  }

  // SOCKS5 Proxy Methods
  handleSOCKS5Connection(clientSocket) {
    let step = 'handshake';
    
    clientSocket.on('data', (data) => {
      try {
        if (step === 'handshake') {
          this.handleSOCKS5Handshake(clientSocket, data);
          step = this.socks5Auth ? 'auth' : 'request';
        } else if (step === 'auth') {
          this.handleSOCKS5Authentication(clientSocket, data);
          step = 'request';
        } else if (step === 'request') {
          this.handleSOCKS5ConnectRequest(clientSocket, data);
          step = 'tunnel';
        }
      } catch (error) {
        console.error('❌ SOCKS5 Error:', error);
        clientSocket.destroy();
      }
    });

    clientSocket.on('error', (err) => {
      console.error('❌ SOCKS5 client error:', err.message);
    });
  }

  handleSOCKS5Handshake(clientSocket, data) {
    if (data.length < 2) {
      throw new Error('Invalid SOCKS5 handshake');
    }

    const version = data[0];
    if (version !== SOCKS_VERSION) {
      throw new Error(`Unsupported SOCKS version: ${version}`);
    }

    const methodCount = data[1];
    const methods = [];
    for (let i = 2; i < 2 + methodCount; i++) {
      methods.push(data[i]);
    }

    console.log('🤝 SOCKS5 Handshake, methods:', methods);

    let chosenMethod;
    if (this.socks5Auth) {
      chosenMethod = methods.includes(AUTHENTICATION_METHODS.USERNAME_PASSWORD) 
        ? AUTHENTICATION_METHODS.USERNAME_PASSWORD 
        : 0xFF;
    } else {
      chosenMethod = methods.includes(AUTHENTICATION_METHODS.NO_AUTH) 
        ? AUTHENTICATION_METHODS.NO_AUTH 
        : 0xFF;
    }

    const response = Buffer.from([SOCKS_VERSION, chosenMethod]);
    clientSocket.write(response);

    if (chosenMethod === 0xFF) {
      throw new Error('No acceptable authentication methods');
    }
  }

  handleSOCKS5Authentication(clientSocket, data) {
    const version = data[0];
    const usernameLength = data[1];
    const username = data.slice(2, 2 + usernameLength).toString();
    const passwordLength = data[2 + usernameLength];
    const password = data.slice(3 + usernameLength, 3 + usernameLength + passwordLength).toString();

    console.log(`🔐 SOCKS5 Authentication: ${username}`);

    const success = this.socks5Auth && 
                   username === this.socks5Auth.username && 
                   password === this.socks5Auth.password;

    const response = Buffer.from([1, success ? 0 : 1]);
    clientSocket.write(response);

    if (!success) {
      throw new Error('SOCKS5 Authentication failed');
    }
  }

  handleSOCKS5ConnectRequest(clientSocket, data) {
    if (data.length < 4) {
      throw new Error('Invalid SOCKS5 connect request');
    }

    const version = data[0];
    const command = data[1];
    const addressType = data[3];

    if (version !== SOCKS_VERSION || command !== COMMANDS.CONNECT) {
      this.sendSOCKS5ErrorResponse(clientSocket, 0x07);
      throw new Error('Unsupported SOCKS5 command');
    }

    let targetHost, targetPort, offset = 4;

    if (addressType === ADDRESS_TYPES.IPv4) {
      targetHost = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
      offset = 8;
    } else if (addressType === ADDRESS_TYPES.DOMAIN) {
      const domainLength = data[4];
      targetHost = data.slice(5, 5 + domainLength).toString();
      offset = 5 + domainLength;
    } else {
      this.sendSOCKS5ErrorResponse(clientSocket, 0x08);
      throw new Error('Unsupported address type');
    }

    targetPort = (data[offset] << 8) | data[offset + 1];

    console.log(`🎯 SOCKS5 CONNECT: ${targetHost}:${targetPort}`);

    this.createSOCKS5Tunnel(clientSocket, targetHost, targetPort);
  }

  createSOCKS5Tunnel(clientSocket, targetHost, targetPort) {
    const targetSocket = net.createConnection(targetPort, targetHost);

    targetSocket.on('connect', () => {
      console.log(`✅ SOCKS5 Tunnel established: ${targetHost}:${targetPort}`);
      
      const response = Buffer.from([
        SOCKS_VERSION, 0x00, 0x00, ADDRESS_TYPES.IPv4,
        0x00, 0x00, 0x00, 0x00, // Bind address (0.0.0.0)
        0x00, 0x00 // Bind port (0)
      ]);
      clientSocket.write(response);

      targetSocket.pipe(clientSocket, { end: false });
      clientSocket.pipe(targetSocket, { end: false });
    });

    targetSocket.on('error', (err) => {
      console.error(`❌ SOCKS5 Target Error (${targetHost}:${targetPort}):`, err.message);
      this.sendSOCKS5ErrorResponse(clientSocket, 0x05);
      clientSocket.destroy();
    });

    targetSocket.on('close', () => {
      clientSocket.destroy();
    });

    clientSocket.on('close', () => {
      targetSocket.destroy();
    });
  }

  sendSOCKS5ErrorResponse(clientSocket, errorCode) {
    const response = Buffer.from([
      SOCKS_VERSION, errorCode, 0x00, ADDRESS_TYPES.IPv4,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00
    ]);
    clientSocket.write(response);
  }

  // Utility methods
  handleStats(req, res) {
    const uptime = Date.now() - this.stats.startTime;
    const stats = {
      server: 'Hybrid HTTP + SOCKS5 Proxy',
      uptime_ms: uptime,
      uptime_human: this.formatUptime(uptime),
      statistics: {
        http_requests: this.stats.httpRequests,
        socks5_connections: this.stats.socks5Connections,
        connect_tunnels: this.stats.connectTunnels,
        active_connections: this.connections.size,
        error_count: this.stats.errors
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
  }

  handle404(req, res) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      available_endpoints: ['/', '/health', '/proxy', '/stats'],
      proxy_types: ['HTTP', 'SOCKS5'],
      ports: { http: HTTP_PORT, socks5: SOCKS5_PORT }
    }));
  }

  handleError(res, error) {
    this.stats.errors++;
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
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
    console.log('🛑 Shutting down Hybrid Proxy Server...');
    
    this.connections.forEach(socket => {
      socket.destroy();
    });
    this.connections.clear();

    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('✅ HTTP server stopped');
      });
    }

    if (this.socks5Server) {
      this.socks5Server.close(() => {
        console.log('✅ SOCKS5 server stopped');
      });
    }
  }
}

// Create and start hybrid server
const proxy = new HybridProxyServer();

// Optional: Enable SOCKS5 authentication
// proxy.socks5Auth = { username: 'telegram', password: 'secure123' };

proxy.start();

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT');
  proxy.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM');
  proxy.stop();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  proxy.stop();
  process.exit(1);
});

console.log('🎯 Hybrid Proxy Server initialized - HTTP + SOCKS5 support!');