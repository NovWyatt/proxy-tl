const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 10000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/tunnel'
});

app.use(express.json());

// Root page
app.get('/', (req, res) => {
  const host = req.get('host');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🌐 WebSocket Tunnel Proxy</title>
        <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .config { background: #e7f3ff; padding: 15px; border-radius: 5px; font-family: monospace; }
            .info { background: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
            h1 { color: #0088cc; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌐 WebSocket Tunnel Proxy</h1>
            
            <div class="status">
                <strong>✅ WebSocket Tunnel Active</strong><br>
                Alternative proxy method via WebSocket
            </div>

            <h3>📱 Connection Info:</h3>
            <div class="config">
                <strong>WebSocket URL:</strong> wss://${host}/tunnel<br>
                <strong>HTTP Proxy:</strong> https://${host}/proxy/*<br>
                <strong>Server:</strong> ${host}<br>
                <strong>Port:</strong> 443 (HTTPS)
            </div>

            <div class="info">
                <strong>💡 How it works:</strong><br>
                This creates a WebSocket tunnel that can bypass some proxy restrictions.
                Compatible with applications that support WebSocket proxying.
            </div>

            <h3>🧪 Test Endpoints:</h3>
            <div class="config">
                Health: <a href="/health">/health</a><br>
                Test HTTP: <a href="/proxy/https://httpbin.org/ip">/proxy/https://httpbin.org/ip</a><br>
                WebSocket: wss://${host}/tunnel
            </div>

            <h3>🔧 Usage Examples:</h3>
            <div class="config">
                # Test HTTP proxy<br>
                curl https://${host}/proxy/https://httpbin.org/ip<br><br>
                
                # Test Telegram API<br>
                curl https://${host}/proxy/https://api.telegram.org<br><br>
                
                # WebSocket connection<br>
                wscat -c wss://${host}/tunnel
            </div>

            <p><small>⚡ WebSocket Tunnel powered by Render.com</small></p>
        </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    type: 'WebSocket Tunnel Proxy',
    connections: wss.clients.size,
    timestamp: new Date().toISOString(),
    server: req.get('host')
  });
});

// HTTP proxy endpoint
app.use('/proxy/*', (req, res) => {
  const targetUrl = req.url.substring('/proxy/'.length);
  
  if (!targetUrl.startsWith('http')) {
    return res.status(400).json({ 
      error: 'Invalid URL',
      usage: 'Use: /proxy/https://example.com'
    });
  }

  console.log('Proxying request to:', targetUrl);

  try {
    const urlParts = url.parse(targetUrl);
    const isHttps = urlParts.protocol === 'https:';
    const protocol = isHttps ? https : http;
    
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.path,
      method: req.method,
      headers: {
        ...req.headers,
        'host': urlParts.hostname,
        'user-agent': 'Render-Proxy/1.0'
      }
    };

    // Remove proxy-specific headers
    delete options.headers['x-forwarded-for'];
    delete options.headers['x-forwarded-proto'];

    const proxyReq = protocol.request(options, (proxyRes) => {
      // Set CORS headers
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      
      res.status(proxyRes.statusCode);
      
      // Copy response headers
      Object.keys(proxyRes.headers).forEach(header => {
        res.set(header, proxyRes.headers[header]);
      });
      
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      res.status(500).json({ 
        error: 'Proxy request failed',
        message: err.message,
        target: targetUrl
      });
    });

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

// WebSocket tunnel handler
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'connect') {
        handleTunnelRequest(ws, data);
      } else if (data.type === 'data') {
        // Forward data through existing tunnel
        if (ws.targetSocket) {
          ws.targetSocket.write(Buffer.from(data.payload, 'base64'));
        }
      }
      
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (ws.targetSocket) {
      ws.targetSocket.destroy();
    }
  });
});

function handleTunnelRequest(ws, data) {
  const { hostname, port } = data;
  
  console.log(`Creating tunnel to ${hostname}:${port}`);
  
  const targetSocket = require('net').createConnection(port, hostname);
  
  targetSocket.on('connect', () => {
    console.log(`Tunnel established to ${hostname}:${port}`);
    ws.targetSocket = targetSocket;
    
    ws.send(JSON.stringify({
      type: 'connected',
      target: `${hostname}:${port}`
    }));
    
    targetSocket.on('data', (data) => {
      ws.send(JSON.stringify({
        type: 'data',
        payload: data.toString('base64')
      }));
    });
  });
  
  targetSocket.on('error', (error) => {
    console.error(`Tunnel error: ${error.message}`);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message
    }));
  });
  
  targetSocket.on('close', () => {
    ws.send(JSON.stringify({
      type: 'closed'
    }));
    ws.close();
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🌐 WebSocket Tunnel Proxy running on port ${PORT}`);
  console.log(`🔗 WebSocket URL: wss://proxy-tl.onrender.com/tunnel`);
  console.log(`📱 HTTP Proxy: https://proxy-tl.onrender.com/proxy/*`);
});