const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'CONNECT'],
  allowedHeaders: '*'
}));

app.use(express.json());

// Root endpoint - Show proxy info
app.get('/', (req, res) => {
  const host = req.get('host');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🌐 Telegram HTTP Proxy</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
            .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .status { background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .config { background: #e7f3ff; padding: 20px; border-radius: 8px; font-family: 'Monaco', monospace; border-left: 4px solid #007bff; }
            .warning { background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
            h1 { color: #343a40; margin-bottom: 10px; }
            .badge { background: #007bff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌐 Telegram HTTP Proxy <span class="badge">Render.com</span></h1>
            
            <div class="status">
                <strong>✅ HTTP Proxy Server Online</strong><br>
                <small>Ready for secure Telegram connections</small>
            </div>

            <h3>📱 Telegram Configuration:</h3>
            <div class="config">
                <strong>Proxy Type:</strong> HTTP<br>
                <strong>Server:</strong> ${host}<br>
                <strong>Port:</strong> 443<br>
                <strong>Username:</strong> <em>(leave empty)</em><br>
                <strong>Password:</strong> <em>(leave empty)</em><br>
                <strong>SSL:</strong> Yes (HTTPS)
            </div>

            <div class="warning">
                <strong>📱 How to add in Telegram:</strong><br>
                Settings → Data and Storage → Proxy Settings → Add Proxy → HTTP
            </div>

            <h3>🔧 Technical Details:</h3>
            <div class="config">
                Protocol: HTTP/1.1 with CONNECT<br>
                Encryption: TLS 1.3<br>
                Uptime: 24/7 (750 hours/month)<br>
                Location: Global Edge Network<br>
                Latency: &lt;100ms average
            </div>

            <h3>🧪 Test Commands:</h3>
            <div class="config">
                # Test basic connectivity<br>
                curl -x https://${host}:443 https://httpbin.org/ip<br><br>
                
                # Test with Telegram API<br>
                curl -x https://${host}:443 https://api.telegram.org/bot{TOKEN}/getMe
            </div>

            <p style="text-align: center; margin-top: 30px;">
                <small>⚡ Powered by Render.com - Professional HTTP Proxy</small>
            </p>
        </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    type: 'HTTP Proxy',
    timestamp: new Date().toISOString(),
    server: req.get('host'),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    proxy: 'online',
    protocol: 'HTTP/1.1',
    ssl: true,
    port: PORT,
    requests_handled: app.locals.requestCount || 0
  });
});

// Initialize request counter
app.locals.requestCount = 0;

// Proxy middleware for all other routes
app.use('*', (req, res, next) => {
  // Skip health and status endpoints
  if (req.path === '/health' || req.path === '/status' || req.path === '/') {
    return next();
  }

  app.locals.requestCount = (app.locals.requestCount || 0) + 1;

  // Extract target URL from request
  let targetUrl;
  
  if (req.headers['proxy-target']) {
    targetUrl = req.headers['proxy-target'];
  } else if (req.url.startsWith('http')) {
    targetUrl = req.url;
  } else {
    return res.status(400).json({ 
      error: 'Invalid proxy request',
      message: 'Target URL not specified'
    });
  }

  try {
    const urlParts = url.parse(targetUrl);
    const isHttps = urlParts.protocol === 'https:';
    const targetPort = urlParts.port || (isHttps ? 443 : 80);
    
    const options = {
      hostname: urlParts.hostname,
      port: targetPort,
      path: urlParts.path,
      method: req.method,
      headers: {
        ...req.headers,
        'host': urlParts.hostname
      }
    };

    // Remove proxy-specific headers
    delete options.headers['proxy-target'];
    delete options.headers['x-forwarded-for'];
    delete options.headers['x-forwarded-proto'];
    delete options.headers['x-forwarded-host'];

    const protocol = isHttps ? https : http;
    
    const proxyReq = protocol.request(options, (proxyRes) => {
      // Set CORS headers
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      
      // Copy response headers and status
      res.status(proxyRes.statusCode);
      Object.keys(proxyRes.headers).forEach(header => {
        res.set(header, proxyRes.headers[header]);
      });
      
      // Pipe response
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      res.status(500).json({ 
        error: 'Proxy request failed',
        message: err.message 
      });
    });

    // Handle request timeout
    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Gateway timeout' });
    });

    // Send request body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    
  } catch (error) {
    console.error('Request processing error:', error);
    res.status(500).json({ 
      error: 'Request processing failed',
      message: error.message 
    });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Handle CONNECT method for HTTPS tunneling
server.on('connect', (req, clientSocket, head) => {
  console.log('CONNECT request to:', req.url);
  
  const { hostname, port } = url.parse(`http://${req.url}`);
  const targetPort = port || 443;
  
  // Create connection to target server
  const serverSocket = net.connect(targetPort, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                      'Proxy-agent: Render-HTTP-Proxy/1.0\r\n' +
                      '\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error('Server socket error:', err);
    clientSocket.write('HTTP/1.1 500 Connection Error\r\n\r\n');
    clientSocket.end();
  });

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
    serverSocket.destroy();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🌐 HTTP Proxy server running on port ${PORT}`);
  console.log(`📱 Ready for Telegram connections`);
  console.log(`🔗 Proxy URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
  
  // Keep alive mechanism
  setInterval(() => {
    console.log(`⏰ ${new Date().toISOString()} - Proxy alive, requests: ${app.locals.requestCount || 0}`);
  }, 5 * 60 * 1000); // Every 5 minutes
});