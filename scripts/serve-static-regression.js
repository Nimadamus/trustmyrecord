#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.TMR_REGRESSION_PORT || 4173);

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function resolveRequest(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const clean = decoded.replace(/^\/+/, '');
  const requested = path.resolve(root, clean || 'index.html');
  if (!requested.startsWith(root)) return null;
  if (fs.existsSync(requested) && fs.statSync(requested).isDirectory()) {
    return path.join(requested, 'index.html');
  }
  if (!path.extname(requested)) {
    const indexFile = path.join(requested, 'index.html');
    if (fs.existsSync(indexFile)) return indexFile;
    const htmlFile = `${requested}.html`;
    if (fs.existsSync(htmlFile)) return htmlFile;
  }
  return requested;
}

const server = http.createServer((req, res) => {
  const file = resolveRequest(req.url || '/');
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, 'Not found');
    return;
  }
  const type = types.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Regression static server listening on http://127.0.0.1:${port}`);
});
