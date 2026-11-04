import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from './server.mjs';

test('подарки сохраняются до ответа; повторная отправка и перезапуск не теряют данные', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'letter-test-'));
  let server;
  const start = async () => { server = createServer({ dataDir: dir }); await new Promise(r => server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${server.address().port}`; };
  const stop = () => new Promise(r => server.close(r));
  try {
    let url = await start(); const sessionId = randomUUID();
    const post = data => fetch(`${url}/api/entries`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    const gift = {id:randomUUID(), sessionId, type:'gift', text:'Свитер https://example.com/подарок'};
    assert.equal((await post({...gift, type:'reply'})).status, 409);
    assert.equal((await post({...gift, text:'   '})).status, 400);
    assert.equal((await post(gift)).status, 201);
    assert.equal((await post(gift)).status, 201);
    assert.equal((await readFile(path.join(dir, 'letters.jsonl'),'utf8')).trim().split('\n').length, 1);
    const patch = data => fetch(`${url}/api/entries`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await patch({...gift,sessionId:randomUUID(),text:'Чужая правка'})).status,404);
    assert.equal((await patch({...gift,text:' '})).status,400);
    const updated = await patch({...gift,text:'Красивый тёплый свитер'});
    assert.equal(updated.status,200);
    const edited = (await updated.json()).entry;
    assert.equal(edited.id,gift.id);
    assert.ok(edited.updatedAt);
    assert.equal((await patch({...gift,text:edited.text})).status,200);
    assert.equal((await readFile(path.join(dir,'letters.jsonl'),'utf8')).trim().split('\n').length,2);
    assert.equal((await post({id:randomUUID(),sessionId,type:'reply',text:'Нет'})).status, 201);
    await stop(); url = await start();
    const restored = await (await fetch(`${url}/api/entries?session=${sessionId}`)).json();
    assert.deepEqual(restored.entries.map(e => e.text), ['Красивый тёплый свитер','Нет']);
    assert.equal((await (await fetch(`${url}/api/entries?session=${randomUUID()}`)).json()).entries.length, 0);
    assert.equal((await fetch(`${url}/data/letters.jsonl`)).status, 404);
    assert.equal((await fetch(`${url}/api/entries`, {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify(gift)})).status, 403);
    assert.equal((await fetch(url)).status, 200);
    const preflight = await fetch(`${url}/api/entries`, {method:'OPTIONS',headers:{Origin:'https://nikitos812.github.io','Access-Control-Request-Method':'PATCH','Access-Control-Request-Headers':'content-type'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'https://nikitos812.github.io');
    const publicRead = await fetch(`${url}/api/entries?session=${sessionId}`, {headers:{Origin:'https://nikitos812.github.io'}});
    assert.equal(publicRead.status,200);
    assert.equal(publicRead.headers.get('access-control-allow-origin'),'https://nikitos812.github.io');
    assert.equal((await fetch(`${url}/api/entries?session=${sessionId}`, {headers:{Origin:'https://other.example'}})).status,403);
  } finally { if (server?.listening) await stop(); await rm(dir,{recursive:true,force:true}); }
});
