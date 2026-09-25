import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'};
createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 let path=resolve(root,'.'+pathname);
 if(!path.startsWith(root+'/')&&path!==root){res.writeHead(403).end();return;}
 try {if(!(await stat(path)).isFile())path=resolve(root,'index.html');}catch{path=resolve(root,'index.html');}
 try{res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(500).end('Build the web export first');}
}).listen(8081,'127.0.0.1');
