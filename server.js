const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Root page
app.get('/', (req, res) => {
  const host = req.get('host');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🌐 HTTP Proxy for Telegram</title>
        <style>
            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
            .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .config { background: #e7f3ff; padding: 15px; border-radius: 5px; font-family: monospace; }
            .warning { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
            h1 { color: #0088cc; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌐 HTTP Proxy on Render</h1>
            
            <div class="status">
                <strong>✅ HTTP Proxy Online</strong><br>
                Ready for web requests
            </div>

            <h3>🧪 Test Endpoints:</h3>
            <div class="config">
                Health: <a href="/health">/health</a><br>
                Test: <a href="/proxy?url=https://httpbin.org/ip">/proxy?url=https://httpbin.org/ip</a><br>
                Telegram: <a href="/proxy?url=https://api.telegram.org">/proxy?url=https://api.telegram.org</a>
            </div>

            <div class="warning">
                <strong>⚠️ Note:</strong> This is a web proxy only. 
                For Telegram app, use Cloudflare WARP or VPN instead.
            </div>

            <h3>🔧 Usage:</h3>
            <div class="config">
                curl "https://${host}/proxy?url=https://httpbin.org/ip"<br>
                curl -H "Target-URL: https://httpbin.org/ip" https://${host}/proxy
            </div>

            <p><small>⚡ Web Proxy powered by Render.com</small></p>
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
    type: 'HTTP Web Proxy',
    timestamp: new Date().toISOString(),
    server: req.get('host')
  });
});

// Proxy endpoint with query parameter
app.all('/proxy', (req, res) => {
  const targetUrl = req.query.url || req.headers['target-url'];
  
  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Target URL required',
      usage: 'Use: /proxy?url=https://example.com or set Target-URL header'
    });
  }

  if (!targetUrl.startsWith('http')) {
    return res.status(400).json({ 
      error: 'Invalid URL format',
      provided: targetUrl,
      required: 'Must start with http:// or https://'
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
    delete options.headers['target-url'];
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

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Gateway timeout' });
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

// Start server
app.listen(PORT, () => {
  console.log(`🌐 HTTP Proxy server running on port ${PORT}`);
  console.log(`🔗 Proxy URL: https://proxy-tl.onrender.com`);
  
  setInterval(() => {
    console.log(`⏰ ${new Date().toISOString()} - Proxy alive`);
  }, 5 * 60 * 1000);
});