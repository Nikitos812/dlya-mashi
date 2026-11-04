import http from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createServer({ dataDir = path.join(root, 'data'), allowedOrigins = ['https://nikitos812.github.io'] } = {}) {
  const file = path.join(dataDir, 'letters.jsonl');
  let queue = Promise.resolve();
  async function records() {
    await queue;
    try {
      const history = (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
      return [...new Map(history.map(entry => [`${entry.sessionId}:${entry.id}`, entry])).values()];
    }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  return http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/entries') {
        const origin = req.headers.origin;
        const originAllowed = !origin || new URL(origin).host === req.headers.host || allowedOrigins.includes(origin);
        if (!originAllowed) return send(403, { error: 'Запрос с другого сайта отклонён.' });
        if (origin && allowedOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
          return res.end();
        }
        if (req.method === 'GET') {
          const sessionId = url.searchParams.get('session');
          if (!uuid.test(sessionId || '')) return send(400, { error: 'Некорректный номер письма.' });
          return send(200, { entries: (await records()).filter(r => r.sessionId === sessionId) });
        }
        if (!['POST', 'PATCH'].includes(req.method)) return send(405, { error: 'Метод не поддерживается.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Ожидается JSON.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 12000) return send(413, { error: 'Слишком длинное сообщение.' }); }
        let input;
        try { input = JSON.parse(body); } catch { return send(400, { error: 'Некорректный запрос.' }); }
        if (!input || !uuid.test(input.sessionId || '') || !uuid.test(input.id || '') || !['gift', 'reply'].includes(input.type) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) return send(400, { error: 'Напиши от 1 до 2000 символов.' });
        if (req.method === 'PATCH' && input.type !== 'gift') return send(400, { error: 'Можно редактировать только подарки.' });
        const entry = { id: input.id, sessionId: input.sessionId, type: input.type, text: input.text.trim(), createdAt: new Date().toISOString() };
        let result;
        const work = queue.then(async () => {
          let existing = [];
          try { existing = (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(JSON.parse); } catch (e) { if (e.code !== 'ENOENT') throw e; }
          const duplicate = existing.findLast(r => r.id === entry.id && r.sessionId === entry.sessionId);
          if (req.method === 'PATCH') {
            if (!duplicate || duplicate.type !== 'gift') { result = null; return; }
            if (duplicate.text === entry.text) { result = duplicate; return; }
            const updated = { ...duplicate, text: entry.text, updatedAt: entry.createdAt };
            await appendFile(file, JSON.stringify(updated) + '\n', 'utf8');
            result = updated;
            return;
          }
          if (duplicate) { result = duplicate; return; }
          if (entry.type === 'reply' && !existing.some(r => r.sessionId === entry.sessionId && r.type === 'gift')) { result = null; return; }
          await mkdir(dataDir, { recursive: true });
          await appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
          result = entry;
        });
        queue = work.catch(() => {});
        await work;
        if (req.method === 'PATCH') return result ? send(200, { entry: result }) : send(404, { error: 'Подарок не найден.' });
        return result ? send(201, { entry: result }) : send(409, { error: 'Сначала добавь хотя бы один подарок.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Метод не поддерживается.' });
      const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/config.json': ['config.json', 'application/json'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/api.js': ['api.js', 'text/javascript; charset=utf-8'], '/christmas.png': ['christmas.png', 'image/png'], '/caveat.ttf': ['caveat.ttf', 'font/ttf'], '/FONT-LICENSE.txt': ['FONT-LICENSE.txt', 'text/plain; charset=utf-8'] };
      const asset = assets[url.pathname];
      if (!asset) return send(404, { error: 'Страница не найдена.' });
      const content = await readFile(path.join(root, 'public', asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) { console.error('Ошибка сервера:', e.message); if (!res.headersSent) send(500, { error: 'Не удалось сохранить. Попробуй ещё раз.' }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, '0.0.0.0', () => console.log(`Открытка: http://localhost:${port}`));
}
