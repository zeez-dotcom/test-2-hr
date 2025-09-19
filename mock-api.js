const http = require('http');

const server = http.createServer((req, res) => {
  // Allow CORS and cookies for local dev if needed
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.url === '/api/me') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: '1', username: 'admin', role: 'admin' }));
    return;
  }

  // Default: 404 JSON
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(5001, '127.0.0.1', () => {
  console.log('Mock API listening on http://127.0.0.1:5001');
});
