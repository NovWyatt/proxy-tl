const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 10000;

console.log('🚀 Simple Telegram Proxy Starting...');

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (parsedUrl.pathname === '/') {
        // Health check
        const response = {
            status: 'Telegram Proxy Server Running ✅',
            port: PORT,
            server: req.headers.host,
            timestamp: new Date().toISOString(),
            setup_instructions: {
                telegram_desktop: 'Settings → Advanced → Connection type → Use custom proxy → HTTP Proxy',
                telegram_mobile: 'Settings → Data and Storage → Proxy Settings → Add Proxy → HTTP',
                server: req.headers.host.replace(':' + PORT, ''),
                port: 443,
                username: '',
                password: '',
                type: 'HTTP Proxy'
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
        
    } else if (parsedUrl.pathname.startsWith('/telegram/')) {
        // Proxy to Telegram API
        const telegramPath = req.url.replace('/telegram', '');
        const telegramUrl = `https://api.telegram.org${telegramPath}`;
        const parsedTgUrl = url.parse(telegramUrl);
        
        const options = {
            hostname: parsedTgUrl.hostname,
            port: 443,
            path: parsedTgUrl.path,
            method: req.method,
            headers: {
                ...req.headers,
                host: parsedTgUrl.hostname
            }
        };
        
        const proxyReq = https.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error' }));
        });
        
        req.pipe(proxyReq);
        
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🔧 Ready for HTTP proxy connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down gracefully');
    server.close(() => process.exit(0));
});