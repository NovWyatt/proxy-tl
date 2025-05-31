const express = require('express');
const net = require('net');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 10000;

// Generate MTProxy secret
const SECRET = process.env.SECRET || crypto.randomBytes(16).toString('hex');
const TAG = process.env.TAG || 'ee' + crypto.randomBytes(15).toString('hex');

console.log('🚀 MTProxy Server Starting...');
console.log('📝 Secret:', SECRET);
console.log('🏷️ Tag:', TAG);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'MTProxy Server Running ✅',
        port: PORT,
        secret: SECRET,
        tag: TAG,
        server: req.get('host'),
        timestamp: new Date().toISOString()
    });
});

// MTProxy info endpoint
app.get('/proxy-info', (req, res) => {
    const host = req.get('host');
    res.json({
        server: host,
        port: 443, // Cloudflare tunnel port
        secret: SECRET,
        tag: TAG,
        telegram_link: `tg://proxy?server=${host}&port=443&secret=${SECRET}`,
        instructions: {
            server: host,
            port: 443,
            secret: SECRET,
            type: 'MTProto'
        }
    });
});

// Simple HTTP proxy for Telegram API
app.use('/telegram', createProxyMiddleware({
    target: 'https://api.telegram.org',
    changeOrigin: true,
    pathRewrite: {
        '^/telegram': ''
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy error' });
    }
}));

// Handle CONNECT method for MTProxy
app.use((req, res, next) => {
    if (req.method === 'CONNECT') {
        // Handle CONNECT for MTProxy
        const [host, port] = req.url.split(':');
        
        // Telegram servers
        const telegramHosts = [
            '149.154.175.50',
            '149.154.167.51', 
            '149.154.175.100',
            '149.154.167.91',
            '149.154.171.5'
        ];
        
        if (telegramHosts.includes(host)) {
            const socket = net.connect(port || 443, host, () => {
                res.writeHead(200, 'Connection Established');
                res.end();
                
                socket.pipe(req.socket);
                req.socket.pipe(socket);
            });
            
            socket.on('error', (err) => {
                console.error('Socket error:', err);
                res.writeHead(500);
                res.end();
            });
        } else {
            res.writeHead(403);
            res.end('Forbidden');
        }
    } else {
        next();
    }
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🔧 Proxy info: http://localhost:${PORT}/proxy-info`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});