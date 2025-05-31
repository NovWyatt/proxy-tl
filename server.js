const http = require('http');
const net = require('net');
const url = require('url');

const PORT = process.env.PORT || 10000;
const SECRET = process.env.SECRET || '22c63e538806b501dd6d42ff87840a49';
const TAG = process.env.TAG || 'ee9108bcc34ba27af2299b8ce7e03626';

console.log('🚀 MTProxy Server Starting...');
console.log('📝 Secret:', SECRET);
console.log('🏷️ Tag:', TAG);

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, CONNECT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (parsedUrl.pathname === '/') {
        // Health check endpoint
        const response = {
            status: 'MTProxy Server Running ✅',
            port: PORT,
            secret: SECRET,
            tag: TAG,
            server: req.headers.host,
            timestamp: new Date().toISOString(),
            instructions: {
                telegram_setup: {
                    server: req.headers.host.replace(':' + PORT, ''),
                    port: 443,
                    secret: SECRET,
                    type: 'MTProto'
                }
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
        
    } else if (parsedUrl.pathname === '/proxy-info') {
        // MTProxy info endpoint
        const host = req.headers.host.replace(':' + PORT, '');
        const response = {
            server: host,
            port: 443,
            secret: SECRET,
            tag: TAG,
            telegram_link: `tg://proxy?server=${host}&port=443&secret=${SECRET}`,
            instructions: {
                server: host,
                port: 443,
                secret: SECRET,
                type: 'MTProto'
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
        
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Handle CONNECT requests for MTProxy
server.on('connect', (req, clientSocket, head) => {
    console.log('🔗 CONNECT request received:', req.url);
    
    // Parse target from CONNECT request
    const [host, port] = req.url.split(':');
    
    // List of allowed Telegram servers
    const telegramHosts = [
        '149.154.175.50',
        '149.154.167.51', 
        '149.154.175.100',
        '149.154.167.91',
        '149.154.171.5',
        '91.108.56.0',
        '91.108.4.0',
        '149.154.160.0',
        '149.154.164.0'
    ];
    
    // Check if connecting to Telegram servers
    const isTelegramHost = telegramHosts.some(tgHost => 
        host.includes(tgHost.split('.').slice(0, 3).join('.'))
    );
    
    if (isTelegramHost || host.includes('telegram') || port === '443') {
        console.log(`✅ Connecting to: ${host}:${port}`);
        
        // Create connection to Telegram server
        const serverSocket = net.connect(port || 443, host, () => {
            console.log(`🎯 Connected to ${host}:${port}`);
            
            // Send 200 Connection Established
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                             'Proxy-agent: MTProxy-Server\r\n' +
                             '\r\n');
            
            // Pipe data between client and server
            serverSocket.write(head);
            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);
        });
        
        serverSocket.on('error', (err) => {
            console.error('❌ Server socket error:', err.message);
            clientSocket.end('HTTP/1.1 500 Connection Failed\r\n\r\n');
        });
        
        clientSocket.on('error', (err) => {
            console.error('❌ Client socket error:', err.message);
            serverSocket.destroy();
        });
        
        serverSocket.on('end', () => {
            clientSocket.end();
        });
        
        clientSocket.on('end', () => {
            serverSocket.end();
        });
        
    } else {
        console.log(`❌ Blocked connection to: ${host}:${port}`);
        clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
});

// Handle regular HTTP requests
server.on('request', app);

// Start server
server.listen(PORT, () => {
    console.log(`🌐 MTProxy Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/`);
    console.log(`🔧 Proxy info: http://localhost:${PORT}/proxy-info`);
    console.log(`🔗 CONNECT method enabled for MTProxy`);
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