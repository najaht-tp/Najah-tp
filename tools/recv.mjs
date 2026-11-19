import http from 'http'; import fs from 'fs';
http.createServer((q,r)=>{ r.setHeader('Access-Control-Allow-Origin','*'); r.setHeader('Access-Control-Allow-Headers','*'); if(q.method==='OPTIONS'){r.end();return}
 let b=''; q.on('data',c=>b+=c); q.on('end',()=>{ const m=b.match(/^data:image\/\w+;base64,(.*)$/); fs.writeFileSync('/private/tmp/claude-502/-Users-muhammadnajahtp-3307--claude-spares-spare-lK4fgu/db22d30c-730b-4750-9455-514faf70bacd/scratchpad/still.webp',Buffer.from(m[1],'base64')); r.end('ok'); console.log('saved', m[1].length) }) }).listen(5180,'127.0.0.1');
