// server.js - Unified HTTP + SOCKS5 Proxy Server for Render
// Auto-detects protocol and routes to appropriate handler

const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const PORT = process.env.PORT || 10000;
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

class UnifiedProxyServer {
  constructor() {
    this.server = null;
    this.connections = new Set();
    this.stats = {
      httpRequests: 0,
      socks5Connections: 0,
      connectTunnels: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    // Optional SOCKS5 authentication (set to null for no auth)
    this.socks5Auth = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      console.log('📡 New connection from:', socket.remoteAddress);
      this.connections.add(socket);
      
      socket.on('close', () => {
        this.connections.delete(socket);
      });

      socket.on('error', (err) => {
        console.error('❌ Socket error:', err.message);
        this.connections.delete(socket);
      });

      // Protocol detection based on first data packet
      socket.once('data', (data) => {
        this.detectAndRouteProtocol(socket, data);
      });
    });

    this.server.on('error', (err) => {
      console.error('❌ Server error:', err);
      this.stats.errors++;
    });

    this.server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Unified Proxy Server running on port ${PORT}`);
      console.log(`🌐 HTTP/HTTPS Support: ✅`);
      console.log(`🧦 SOCKS5 Support: ✅`);
      console.log(`📱 Telegram Compatible: ✅`);
      console.log(`⏰ Started: ${new Date().toISOString()}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
    });
  }

  detectAndRouteProtocol(socket, firstData) {
    try {
      const dataStr = firstData.toString();
      
      // Detect HTTP requests
      const isHTTP = dataStr.startsWith('GET ') || 
                    dataStr.startsWith('POST ') || 
                    dataStr.startsWith('PUT ') || 
                    dataStr.startsWith('DELETE ') ||
                    dataStr.startsWith('HEAD ') ||
                    dataStr.startsWith('OPTIONS ') ||
                    dataStr.startsWith('CONNECT ');

      // Detect SOCKS5 handshake (version 5)
      const isSOCKS5 = firstData[0] === 0x05 && firstData.length >= 3;

      if (isHTTP) {
        console.log('🌐 Detected HTTP protocol');
        this.handleHTTPConnection(socket, firstData);
      } else if (isSOCKS5) {
        console.log('🧦 Detected SOCKS5 protocol');
        this.stats.socks5Connections++;
        this.handleSOCKS5Connection(socket, firstData);
      } else {
        console.log('❓ Unknown protocol, treating as HTTP');
        this.handleHTTPConnection(socket, firstData);
      }
    } catch (error) {
      console.error('❌ Protocol detection error:', error);
      socket.destroy();
    }
  }

  handleHTTPConnection(socket, firstData) {
    this.stats.httpRequests++;
    
    // Create HTTP parser
    const req = this.parseHTTPRequest(socket, firstData);
    const res = this.createHTTPResponse(socket);
    
    if (req && res) {
      this.routeHTTPRequest(req, res);
    }
  }

  parseHTTPRequest(socket, firstData) {
    try {
      // Simple HTTP request parsing
      const lines = firstData.toString().split('\r\n');
      const requestLine = lines[0].split(' ');
      const method = requestLine[0];
      const url = requestLine[1];
      const version = requestLine[2];

      // Parse headers
      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '') break;
        const [key, value] = lines[i].split(': ');
        if (key && value) {
          headers[key.toLowerCase()] = value;
        }
      }

      return {
        method,
        url,
        version,
        headers,
        socket
      };
    } catch (error) {
      console.error('❌ HTTP parsing error:', error);
      return null;
    }
  }

  createHTTPResponse(socket) {
    return {
      socket,
      headersSent: false,
      statusCode: 200,
      headers: {},
      
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        if (headers) {
          Object.assign(this.headers, headers);
        }
        this.sendHeaders();
      },
      
      sendHeaders() {
        if (this.headersSent) return;
        
        let response = `HTTP/1.1 ${this.statusCode} ${this.getStatusText()}\r\n`;
        for (const [key, value] of Object.entries(this.headers)) {
          response += `${key}: ${value}\r\n`;
        }
        response += '\r\n';
        
        this.socket.write(response);
        this.headersSent = true;
      },
      
      end(data) {
        if (!this.headersSent) {
          this.sendHeaders();
        }
        if (data) {
          this.socket.write(data);
        }
        this.socket.end();
      },
      
      write(data) {
        if (!this.headersSent) {
          this.sendHeaders();
        }
        this.socket.write(data);
      },
      
      getStatusText() {
        const statusTexts = {
          200: 'OK',
          400: 'Bad Request',
          404: 'Not Found',
          500: 'Internal Server Error',
          502: 'Bad Gateway'
        };
        return statusTexts[this.statusCode] || 'Unknown';
      }
    };
  }

  routeHTTPRequest(req, res) {
    try {
      // Add CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, CONNECT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target-URL');
      res.setHeader('Server', 'Unified-Proxy/1.0');

      // Handle OPTIONS
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Handle CONNECT method
      if (req.method === 'CONNECT') {
        this.handleHTTPConnect(req, res);
        return;
      }

      // Route based on path
      const parsedUrl = url.parse(req.url, true);
      
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
          if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
            this.handleHTTPProxy(req, res);
          } else {
            this.handle404(req, res);
          }
      }
    } catch (error) {
      console.error('❌ HTTP routing error:', error);
      this.handleError(res, error);
    }
  }

  handleRoot(req, res) {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const info = `
🚀 Unified HTTP + SOCKS5 Proxy Server

📍 Server: ${req.headers.host || 'localhost'}
📊 Port: ${PORT} (Auto-detect HTTP/SOCKS5)
⏰ Uptime: ${uptime} seconds
🌍 Environment: ${NODE_ENV}

📱 PROXY CONFIGURATIONS:

   🌐 HTTP Proxy (Web, API, cURL):
   Host: ${req.headers.host || 'localhost'}
   Port: ${PORT}
   Type: HTTP/HTTPS
   
   🧦 SOCKS5 Proxy (Telegram, Apps):
   Host: ${req.headers.host || 'localhost'}
   Port: ${PORT}
   Type: SOCKS5
   Authentication: ${this.socks5Auth ? 'Username/Password' : 'None'}

🔧 USAGE EXAMPLES:

   💻 HTTP Proxy:
   curl -x ${req.headers.host || 'localhost'}:${PORT} http://httpbin.org/ip
   
   🧦 SOCKS5 Proxy:
   curl --socks5 ${req.headers.host || 'localhost'}:${PORT} https://httpbin.org/ip
   
   📱 Telegram Config:
   Type: SOCKS5
   Server: ${req.headers.host || 'localhost'}
   Port: ${PORT}
   Username: ${this.socks5Auth ? this.socks5Auth.username : '(none)'}
   Password: ${this.socks5Auth ? '••••••••' : '(none)'}
   
   🔌 API Endpoint:
   curl "http://${req.headers.host || 'localhost'}:${PORT}/proxy" \\
     -H "X-Target-URL: https://httpbin.org/ip"

📊 CURRENT STATS:
   📤 HTTP Requests: ${this.stats.httpRequests}
   🧦 SOCKS5 Connections: ${this.stats.socks5Connections}
   🔗 CONNECT Tunnels: ${this.stats.connectTunnels}
   🔌 Active Connections: ${this.connections.size}
   ❌ Errors: ${this.stats.errors}

⏰ Server Time: ${new Date().toISOString()}
🔄 Status: Online and Ready
    `;

    res.setHeader('Content-Type', 'text/plain');
    res.writeHead(200);
    res.end(info);
  }

  handleHealth(req, res) {
    const uptime = Date.now() - this.stats.startTime;
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(uptime / 1000),
      server: {
        type: 'Unified HTTP + SOCKS5 Proxy',
        version: '1.0.0',
        port: PORT,
        environment: NODE_ENV
      },
      features: {
        http_proxy: true,
        https_proxy: true,
        connect_method: true,
        socks5_proxy: true,
        api_proxy: true,
        telegram_support: true,
        protocol_detection: true
      },
      statistics: {
        http_requests: this.stats.httpRequests,
        socks5_connections: this.stats.socks5Connections,
        connect_tunnels: this.stats.connectTunnels,
        active_connections: this.connections.size,
        error_count: this.stats.errors
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(health, null, 2));
  }

  handleAPIProxy(req, res) {
    const targetUrl = req.headers['x-target-url'] || 
                     url.parse(req.url, true).query.url;

    if (!targetUrl) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(400);
      res.end(JSON.stringify({
        error: 'Missing target URL',
        usage: 'Add X-Target-URL header or ?url= parameter'
      }));
      return;
    }

    console.log(`📤 API Proxy: ${req.method} ${targetUrl}`);
    this.proxyRequest(targetUrl, req, res);
  }

  handleHTTPProxy(req, res) {
    console.log(`📤 HTTP Proxy: ${req.method} ${req.url}`);
    this.proxyRequest(req.url, req, res);
  }

  proxyRequest(targetUrl, req, res) {
    try {
      const parsedUrl = url.parse(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const protocol = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: req.method,
        headers: { ...req.headers }
      };

      delete options.headers['host'];
      delete options.headers['x-target-url'];
      options.headers['host'] = parsedUrl.host;

      const proxyReq = protocol.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res.socket);
      });

      proxyReq.on('error', (err) => {
        console.error('❌ Proxy error:', err.message);
        res.writeHead(502);
        res.end('Bad Gateway');
      });

      proxyReq.end();
    } catch (error) {
      console.error('❌ Proxy request error:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  handleHTTPConnect(req, res) {
    try {
      const [targetHost, targetPort] = req.url.split(':');
      const port = parseInt(targetPort) || 443;

      console.log(`🔗 HTTP CONNECT: ${targetHost}:${port}`);
      this.stats.connectTunnels++;

      const targetSocket = net.createConnection(port, targetHost, () => {
        res.socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        console.log(`✅ HTTP CONNECT established: ${targetHost}:${port}`);

        targetSocket.pipe(res.socket);
        res.socket.pipe(targetSocket);
      });

      targetSocket.on('error', (err) => {
        console.error(`❌ CONNECT error: ${err.message}`);
        res.socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        res.socket.destroy();
      });

    } catch (error) {
      console.error('❌ CONNECT request error:', error);
      res.socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      res.socket.destroy();
    }
  }

  // SOCKS5 Implementation
  handleSOCKS5Connection(socket, firstData) {
    let step = 'handshake';
    
    // Process first data
    try {
      this.handleSOCKS5Handshake(socket, firstData);
      step = this.socks5Auth ? 'auth' : 'request';
    } catch (error) {
      console.error('❌ SOCKS5 handshake error:', error);
      socket.destroy();
      return;
    }

    // Handle subsequent data
    socket.on('data', (data) => {
      try {
        if (step === 'auth') {
          this.handleSOCKS5Authentication(socket, data);
          step = 'request';
        } else if (step === 'request') {
          this.handleSOCKS5Request(socket, data);
          step = 'tunnel';
        }
      } catch (error) {
        console.error('❌ SOCKS5 error:', error);
        socket.destroy();
      }
    });
  }

  handleSOCKS5Handshake(socket, data) {
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

    console.log('🤝 SOCKS5 handshake, methods:', methods);

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
    socket.write(response);

    if (chosenMethod === 0xFF) {
      throw new Error('No acceptable authentication methods');
    }
  }

  handleSOCKS5Authentication(socket, data) {
    if (!this.socks5Auth) return;

    const username = data.slice(2, 2 + data[1]).toString();
    const passwordLength = data[2 + data[1]];
    const password = data.slice(3 + data[1], 3 + data[1] + passwordLength).toString();

    const success = username === this.socks5Auth.username && 
                   password === this.socks5Auth.password;

    const response = Buffer.from([1, success ? 0 : 1]);
    socket.write(response);

    if (!success) {
      throw new Error('Authentication failed');
    }
  }

  handleSOCKS5Request(socket, data) {
    if (data.length < 4) {
      throw new Error('Invalid SOCKS5 request');
    }

    const version = data[0];
    const command = data[1];
    const addressType = data[3];

    if (version !== SOCKS_VERSION || command !== COMMANDS.CONNECT) {
      this.sendSOCKS5Error(socket, 0x07);
      throw new Error('Unsupported command');
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
      this.sendSOCKS5Error(socket, 0x08);
      throw new Error('Unsupported address type');
    }

    targetPort = (data[offset] << 8) | data[offset + 1];

    console.log(`🎯 SOCKS5 CONNECT: ${targetHost}:${targetPort}`);
    this.createSOCKS5Tunnel(socket, targetHost, targetPort);
  }

  createSOCKS5Tunnel(clientSocket, targetHost, targetPort) {
    const targetSocket = net.createConnection(targetPort, targetHost);

    targetSocket.on('connect', () => {
      console.log(`✅ SOCKS5 tunnel established: ${targetHost}:${targetPort}`);
      
      const response = Buffer.from([
        SOCKS_VERSION, 0x00, 0x00, ADDRESS_TYPES.IPv4,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      clientSocket.write(response);

      targetSocket.pipe(clientSocket);
      clientSocket.pipe(targetSocket);
    });

    targetSocket.on('error', (err) => {
      console.error(`❌ SOCKS5 target error: ${err.message}`);
      this.sendSOCKS5Error(clientSocket, 0x05);
      clientSocket.destroy();
    });

    targetSocket.on('close', () => {
      clientSocket.destroy();
    });

    clientSocket.on('close', () => {
      targetSocket.destroy();
    });
  }

  sendSOCKS5Error(socket, errorCode) {
    const response = Buffer.from([
      SOCKS_VERSION, errorCode, 0x00, ADDRESS_TYPES.IPv4,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    socket.write(response);
  }

  // Utility methods
  handleStats(req, res) {
    const stats = {
      server: 'Unified HTTP + SOCKS5 Proxy',
      uptime_ms: Date.now() - this.stats.startTime,
      statistics: this.stats,
      active_connections: this.connections.size
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(stats, null, 2));
  }

  handle404(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Not Found',
      available_endpoints: ['/', '/health', '/proxy', '/stats'],
      proxy_types: ['HTTP', 'SOCKS5'],
      port: PORT
    }));
  }

  handleError(res, error) {
    this.stats.errors++;
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(500);
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  }

  stop() {
    console.log('🛑 Shutting down server...');
    
    this.connections.forEach(socket => {
      socket.destroy();
    });
    this.connections.clear();

    if (this.server) {
      this.server.close(() => {
        console.log('✅ Server stopped');
      });
    }
  }
}

// Create and start server
const proxy = new UnifiedProxyServer();

// Optional: Enable SOCKS5 authentication
// proxy.socks5Auth = { username: 'telegram', password: 'secure123' };

proxy.start();

// Graceful shutdown
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

console.log('🎯 Unified Proxy Server - Ready for HTTP and SOCKS5!');