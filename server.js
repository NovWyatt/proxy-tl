const net = require('net');
const express = require('express');

const app = express();
const HTTP_PORT = process.env.PORT || 10000;
const SOCKS_PORT = 1080;

// Web interface
app.get('/', (req, res) => {
  const host = req.get('host');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🧦 SOCKS5 Proxy on Render</title>
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
            <h1>🧦 SOCKS5 Proxy on Render</h1>
            
            <div class="status">
                <strong>✅ SOCKS5 Server Online</strong><br>
                Advanced proxy server for applications
            </div>

            <h3>📱 Telegram Configuration:</h3>
            <div class="config">
                <strong>Proxy Type:</strong> SOCKS5<br>
                <strong>Server:</strong> ${host}<br>
                <strong>Port:</strong> ${SOCKS_PORT}<br>
                <strong>Username:</strong> <em>(leave empty)</em><br>
                <strong>Password:</strong> <em>(leave empty)</em>
            </div>

            <div class="warning">
                <strong>⚠️ Note:</strong> SOCKS5 proxy running on port ${SOCKS_PORT}. 
                This may work better than HTTP proxy for some applications.
            </div>

            <h3>🧪 Test Commands:</h3>
            <div class="config">
                # Test SOCKS5 proxy<br>
                curl --socks5 ${host}:${SOCKS_PORT} https://httpbin.org/ip<br><br>
                
                # Test with authentication<br>
                curl --socks5-hostname ${host}:${SOCKS_PORT} https://api.telegram.org
            </div>

            <p><small>⚡ SOCKS5 Proxy powered by Render.com</small></p>
        </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    type: 'SOCKS5 Proxy',
    socks_port: SOCKS_PORT,
    http_port: HTTP_PORT,
    timestamp: new Date().toISOString()
  });
});

// SOCKS5 Implementation
class SOCKS5Server {
  constructor(port) {
    this.port = port;
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🧦 SOCKS5 proxy listening on port ${this.port}`);
    });

    this.server.on('error', (err) => {
      console.error('SOCKS5 server error:', err);
    });
  }

  handleConnection(clientSocket) {
    console.log('New SOCKS5 connection from:', clientSocket.remoteAddress);
    
    clientSocket.on('data', (data) => {
      if (data.length < 2) return;

      // SOCKS5 greeting
      if (data[0] === 0x05) {
        if (data[1] === 0x01 && data[2] === 0x00) {
          // No authentication required
          clientSocket.write(Buffer.from([0x05, 0x00]));
        } else {
          clientSocket.end();
        }
        return;
      }

      // SOCKS5 request
      if (data[0] === 0x05 && data[1] === 0x01) {
        this.handleSOCKSRequest(clientSocket, data);
      }
    });

    clientSocket.on('error', (err) => {
      console.error('Client socket error:', err);
    });
  }

  handleSOCKSRequest(clientSocket, data) {
    try {
      let offset = 4; // Skip VER, CMD, RSV, ATYP
      
      let targetHost;
      let targetPort;

      // Parse address type
      const atyp = data[3];
      
      if (atyp === 0x01) { // IPv4
        targetHost = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        offset = 8;
      } else if (atyp === 0x03) { // Domain name
        const domainLength = data[4];
        targetHost = data.slice(5, 5 + domainLength).toString();
        offset = 5 + domainLength;
      } else {
        // Unsupported address type
        this.sendSOCKSResponse(clientSocket, 0x08);
        return;
      }

      targetPort = (data[offset] << 8) + data[offset + 1];

      console.log(`SOCKS5 connecting to: ${targetHost}:${targetPort}`);

      // Create connection to target
      const targetSocket = net.createConnection(targetPort, targetHost);

      targetSocket.on('connect', () => {
        console.log(`Connected to ${targetHost}:${targetPort}`);
        
        // Send success response
        this.sendSOCKSResponse(clientSocket, 0x00, targetHost, targetPort);
        
        // Pipe data between client and target
        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
      });

      targetSocket.on('error', (err) => {
        console.error(`Target connection error: ${err.message}`);
        this.sendSOCKSResponse(clientSocket, 0x05); // Connection refused
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });

    } catch (error) {
      console.error('SOCKS request parsing error:', error);
      this.sendSOCKSResponse(clientSocket, 0x01); // General failure
    }
  }

  sendSOCKSResponse(clientSocket, status, host = '0.0.0.0', port = 0) {
    const response = Buffer.alloc(10);
    response[0] = 0x05; // VER
    response[1] = status; // REP
    response[2] = 0x00; // RSV
    response[3] = 0x01; // ATYP (IPv4)
    
    // Bind address (0.0.0.0)
    response[4] = 0x00;
    response[5] = 0x00;
    response[6] = 0x00;
    response[7] = 0x00;
    
    // Bind port
    response[8] = (port >> 8) & 0xFF;
    response[9] = port & 0xFF;
    
    clientSocket.write(response);
  }
}

// Start SOCKS5 server
const socksServer = new SOCKS5Server(SOCKS_PORT);
socksServer.start();

// Start HTTP server for web interface
app.listen(HTTP_PORT, () => {
  console.log(`🌐 Web interface running on port ${HTTP_PORT}`);
  console.log(`🧦 SOCKS5 proxy running on port ${SOCKS_PORT}`);
  console.log(`🔗 Access: https://proxy-tl.onrender.com`);
});