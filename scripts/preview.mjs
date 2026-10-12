import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:4173');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(503);return res.end('Forms are processed only by Netlify. Local preview does not send mail.');}
    const pathname=decodeURIComponent(url.pathname);
    let file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(path.resolve(root)+path.sep) && file!==path.resolve(root)){res.writeHead(403);return res.end();}
    const stat=await fs.stat(file).catch(()=>null);
    if(stat?.isDirectory())file=path.join(file,'index.html');
    const data=await fs.readFile(file).catch(()=>null);
    if(!data){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Robots-Tag':'noindex, nofollow'});res.end(data);
  } catch {res.writeHead(500);res.end('Preview error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173/ru/'));
