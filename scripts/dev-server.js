// Zero-dependency static dev server. usage: node scripts/dev-server.js [dir]   (PORT env optional, default 5173)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), dir = path.resolve(root, process.argv[2] || '.'), pub = path.join(root, 'public'), port = process.env.PORT || 5173;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.endsWith('/'))
        u += 'index.html';
    const cands = [path.join(dir, u)];
    if (dir === root)
        cands.push(path.join(pub, u));
    const f = cands.find(c => c.startsWith(dir.startsWith(root) ? root : dir) && fs.existsSync(c) && fs.statSync(c).isFile());
    if (!f) {
        res.writeHead(404);
        return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Squado dev server: http://localhost:${port}`));
