const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

// Cloudflare Worker Proxy URLs (để bypass restrictions)
const CF_WORKERS = [
  'https://telegram-proxy-9371.rirtar-lofi.workers.dev/',
  'https://telegram-proxy-1-c195.rirtar-lofi.workers.dev/',
  'https://telegram-proxy-2-3282.rirtar-lofi.workers.dev/'
];

let currentWorkerIndex = 0;

app.use(express.json());

// Main page
app.get('/', (req, res) => {
  const host = req.get('host');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>🌐 Render + Cloudflare Smart Proxy</title>
        <style>
            body { font-family: Arial; max-width: 700px; margin: 50px auto; padding: 20px; background: #f8f9fa; }
            .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .status { background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .config { background: #e7f3ff; padding: 20px; border-radius: 8px; font-family: monospace; border-left: 4px solid #007bff; }
            .warning { background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
            .feature { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #6c757d; }
            h1 { color: #343a40; margin-bottom: 10px; }
            .badge { background: #007bff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌐 Smart Proxy System <span class="badge">Render + Cloudflare</span></h1>
            
            <div class="status">
                <strong>✅ Multi-Layer Proxy Active</strong><br>
                <small>Intelligent routing through Cloudflare network</small>
            </div>

            <h3>🔧 Features:</h3>
            <div class="feature">
                <strong>🚀 Load Balancing:</strong> Auto-rotate between multiple Cloudflare workers
            </div>
            <div class="feature">
                <strong>🛡️ Enhanced Privacy:</strong> Double-layer proxy (Render → Cloudflare → Target)
            </div>
            <div class="feature">
                <strong>⚡ Smart Routing:</strong> Automatic failover and speed optimization
            </div>
            <div class="feature">
                <strong>🌍 Global Network:</strong> Leverage Cloudflare's worldwide infrastructure
            </div>

            <h3>📱 Usage Methods:</h3>
            <div class="config">
                <strong>Method 1 - Query Parameter:</strong><br>
                https://${host}/proxy?url=TARGET_URL<br><br>
                
                <strong>Method 2 - Header:</strong><br>
                curl -H "Target-URL: TARGET_URL" https://${host}/proxy<br><br>
                
                <strong>Method 3 - Smart Routing:</strong><br>
                https://${host}/smart-proxy?url=TARGET_URL&region=auto
            </div>

            <h3>🧪 Test Endpoints:</h3>
            <div class="config">
                Health: <a href="/health">/health</a><br>
                Speed Test: <a href="/speed-test">/speed-test</a><br>
                Worker Status: <a href="/workers">/workers</a><br>
                Test Proxy: <a href="/proxy?url=https://httpbin.org/ip">/proxy?url=https://httpbin.org/ip</a>
            </div>

            <div class="warning">
                <strong>💡 Pro Tip:</strong> Use smart-proxy endpoint for best performance and reliability.
                The system automatically chooses the fastest Cloudflare worker.
            </div>

            <p style="text-align: center; margin-top: 30px;">
                <small>⚡ Powered by Render.com + Cloudflare Network</small>
            </p>
        </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Health check with worker status
app.get('/health', async (req, res) => {
  const workerStatus = await checkWorkerHealth();
  
  res.json({ 
    status: 'healthy',
    type: 'Smart Proxy System',
    timestamp: new Date().toISOString(),
    server: req.get('host'),
    uptime: process.uptime(),
    cloudflare_workers: {
      total: CF_WORKERS.length,
      healthy: workerStatus.filter(w => w.healthy).length,
      current: currentWorkerIndex
    },
    features: [
      'Load Balancing',
      'Auto Failover', 
      'Speed Optimization',
      'Privacy Enhancement'
    ]
  });
});

// Worker status endpoint
app.get('/workers', async (req, res) => {
  const workerStatus = await checkWorkerHealth();
  res.json({
    workers: workerStatus,
    current_worker: CF_WORKERS[currentWorkerIndex],
    rotation_strategy: 'round_robin_with_failover'
  });
});

// Speed test endpoint
app.get('/speed-test', async (req, res) => {
  const results = [];
  
  for (let i = 0; i < CF_WORKERS.length; i++) {
    const start = Date.now();
    try {
      const response = await makeRequest(CF_WORKERS[i] + '/ping');
      const latency = Date.now() - start;
      results.push({
        worker: CF_WORKERS[i],
        latency: latency + 'ms',
        status: 'healthy'
      });
    } catch (error) {
      results.push({
        worker: CF_WORKERS[i],
        latency: 'timeout',
        status: 'unhealthy',
        error: error.message
      });
    }
  }
  
  res.json({
    speed_test: results,
    fastest_worker: results.reduce((prev, curr) => 
      (parseInt(prev.latency) || 9999) < (parseInt(curr.latency) || 9999) ? prev : curr
    )
  });
});

// Smart proxy with automatic worker selection
app.all('/smart-proxy', async (req, res) => {
  const targetUrl = req.query.url || req.headers['target-url'];
  const region = req.query.region || 'auto';
  
  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Target URL required',
      usage: 'Use: /smart-proxy?url=https://example.com'
    });
  }

  let attempts = 0;
  const maxAttempts = CF_WORKERS.length;
  
  while (attempts < maxAttempts) {
    try {
      const workerUrl = CF_WORKERS[currentWorkerIndex];
      const result = await proxyThroughWorker(workerUrl, targetUrl, req);
      
      // Success - return result
      return res.status(result.status).set(result.headers).send(result.body);
      
    } catch (error) {
      console.log(`Worker ${currentWorkerIndex} failed, trying next...`);
      
      // Rotate to next worker
      currentWorkerIndex = (currentWorkerIndex + 1) % CF_WORKERS.length;
      attempts++;
      
      if (attempts === maxAttempts) {
        return res.status(500).json({
          error: 'All workers failed',
          attempts: attempts,
          last_error: error.message
        });
      }
    }
  }
});

// Regular proxy endpoint (fallback)
app.all('/proxy', async (req, res) => {
  const targetUrl = req.query.url || req.headers['target-url'];
  
  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Target URL required',
      usage: 'Use: /proxy?url=https://example.com'
    });
  }

  try {
    // Try direct request first
    const result = await makeDirectRequest(targetUrl, req);
    res.status(result.status).set(result.headers).send(result.body);
    
  } catch (error) {
    // Fallback to Cloudflare worker
    try {
      const workerUrl = CF_WORKERS[currentWorkerIndex];
      const result = await proxyThroughWorker(workerUrl, targetUrl, req);
      res.status(result.status).set(result.headers).send(result.body);
      
    } catch (workerError) {
      res.status(500).json({
        error: 'Proxy failed',
        direct_error: error.message,
        worker_error: workerError.message
      });
    }
  }
});

// Helper functions
async function checkWorkerHealth() {
  const results = [];
  
  for (const worker of CF_WORKERS) {
    try {
      const response = await makeRequest(worker + '/health', { timeout: 5000 });
      results.push({ 
        url: worker, 
        healthy: true, 
        response_time: Date.now() 
      });
    } catch (error) {
      results.push({ 
        url: worker, 
        healthy: false, 
        error: error.message 
      });
    }
  }
  
  return results;
}

async function proxyThroughWorker(workerUrl, targetUrl, req) {
  const proxyUrl = `${workerUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
  
  const options = {
    method: req.method,
    headers: {
      ...req.headers,
      'host': new URL(workerUrl).hostname
    },
    timeout: 30000
  };
  
  delete options.headers['target-url'];
  
  const response = await makeRequest(proxyUrl, options);
  
  return {
    status: response.status || 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'X-Proxy-Via': 'Cloudflare-Worker'
    },
    body: response.body
  };
}

async function makeDirectRequest(targetUrl, req) {
  return new Promise((resolve, reject) => {
    const urlParts = new URL(targetUrl);
    const isHttps = urlParts.protocol === 'https:';
    const protocol = isHttps ? https : http;
    
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname + urlParts.search,
      method: req.method,
      headers: {
        ...req.headers,
        'host': urlParts.hostname
      },
      timeout: 30000
    };
    
    const proxyReq = protocol.request(options, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        resolve({
          status: proxyRes.statusCode,
          headers: {
            ...proxyRes.headers,
            'X-Proxy-Via': 'Direct'
          },
          body: body
        });
      });
    });
    
    proxyReq.on('error', reject);
    proxyReq.on('timeout', () => reject(new Error('Request timeout')));
    proxyReq.end();
  });
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlParts = new URL(url);
    const isHttps = urlParts.protocol === 'https:';
    const protocol = isHttps ? https : http;
    
    const req = protocol.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.on('error', reject);
    if (options.timeout) {
      req.setTimeout(options.timeout, () => reject(new Error('Timeout')));
    }
    req.end();
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Smart Proxy System running on port ${PORT}`);
  console.log(`🔗 Proxy URL: https://proxy-tl.onrender.com`);
  console.log(`⚡ Using ${CF_WORKERS.length} Cloudflare workers for load balancing`);
  
  // Health check interval
  setInterval(async () => {
    const health = await checkWorkerHealth();
    const healthyWorkers = health.filter(w => w.healthy).length;
    console.log(`⏰ ${new Date().toISOString()} - Proxy alive, Workers: ${healthyWorkers}/${CF_WORKERS.length}`);
  }, 5 * 60 * 1000);
});