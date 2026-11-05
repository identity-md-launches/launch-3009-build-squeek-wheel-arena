// Serves dist/ under a subpath, the way a gateway does, so a broken relative URL shows up.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT) || 4173;
const PREFIX = '/preview/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!path.startsWith(PREFIX)) {
    response.writeHead(302, { Location: PREFIX });
    response.end();
    return;
  }
  const relative = normalize(path.slice(PREFIX.length) || 'index.html');
  if (relative.startsWith('..')) {
    response.writeHead(400);
    response.end();
    return;
  }
  try {
    const body = await readFile(join('dist', relative));
    response.writeHead(200, { 'Content-Type': TYPES[extname(relative)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(PORT, () => console.log(`Previewing dist/ at http://localhost:${PORT}${PREFIX}`));
