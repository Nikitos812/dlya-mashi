import { spawn, execFile } from 'node:child_process';
import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = promisify(execFile);
const data = path.join(root, 'data');
await mkdir(data, { recursive: true });
await writeFile(path.join(data, 'tunnel-supervisor.pid'), String(process.pid));
const log = message => appendFile(path.join(data, 'public-tunnel.log'), `${new Date().toISOString()} ${message}\n`);
const git = args => run('git', args, { cwd: root, windowsHide: true, timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
let child, stopped = false;
let publishQueue = Promise.resolve();
async function publishEndpoint(apiBase) {
  await writeFile(path.join(root, 'public/config.json'), JSON.stringify({ apiBase }) + '\n');
  await log(`Соединение готово: ${apiBase}`);
  await git(['add', '--', 'public/config.json']);
  const diff = await git(['diff', '--cached', '--name-only', '--', 'public/config.json']);
  if (diff.stdout.trim()) await git(['commit', '--only', '-m', 'Update public server connection', '--', 'public/config.json']);
  await git(['push', 'github', 'main']);
  await log('Адрес сервера опубликован в GitHub Pages.');
}
function start() {
  if (stopped) return;
  let buffer = '', announced = false;
  child = spawn(path.join(root, '.deploy/cloudflared.exe'), ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3000'], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  writeFile(path.join(data,'tunnel.pid'),String(child.pid)).catch(()=>{});
  const output = chunk => {
    const text = chunk.toString(); log(text.trim()).catch(()=>{}); buffer = (buffer + text).slice(-12000);
    const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (url && !announced) {
      announced = true;
      publishQueue = publishQueue.then(async () => {
        for (let attempt=0; attempt<5; attempt++) {
          try { await publishEndpoint(url[0]); return; }
          catch(e) { await log(`Не удалось обновить GitHub, попытка ${attempt+1}: ${e.message}`); await new Promise(r=>setTimeout(r,15000)); }
        }
        await log('Обновление GitHub не завершено. Перезапусти start-public.ps1 после восстановления доступа.');
      });
    }
  };
  child.stdout.on('data',output); child.stderr.on('data',output);
  child.on('error',e=>log(`Ошибка запуска: ${e.message}`).catch(()=>{}));
  child.on('exit',()=>{ if (!stopped) { log('Соединение прервано. Повторный запуск через 15 секунд.').catch(()=>{}); setTimeout(start,15000); } });
}
function stop() { stopped = true; child?.kill(); process.exit(0); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
start();
