import {createHash,timingSafeEqual} from 'node:crypto';
import type {RequestHandler} from 'express';

export function hostingConfig(env:NodeJS.ProcessEnv=process.env){
 const port=Number(env.PORT||3001);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid TCP port.');
 const hosted=env.GHOSTCOMMIT_HOSTED==='true'||env.RENDER==='true';
 const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173']);
 if(hosted){
  const publicUrl=env.GHOSTCOMMIT_PUBLIC_URL||env.RENDER_EXTERNAL_URL;
  if(!publicUrl)throw new Error('Hosted mode requires GHOSTCOMMIT_PUBLIC_URL or RENDER_EXTERNAL_URL.');
  let url:URL;try{url=new URL(publicUrl);}catch{throw new Error('The public URL must be an HTTPS origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('The public URL must be an HTTPS origin without a path.');
  origins.clear();origins.add(url.origin);
  // Keep the Render address available when a custom domain is configured.
  if(env.RENDER_EXTERNAL_URL){const renderUrl=new URL(env.RENDER_EXTERNAL_URL);if(renderUrl.protocol!=='https:'||renderUrl.username||renderUrl.password||renderUrl.pathname!=='/'||renderUrl.search||renderUrl.hash)throw new Error('Invalid Render public URL.');origins.add(renderUrl.origin);}
  if(!env.GHOSTCOMMIT_PASSWORD||env.GHOSTCOMMIT_PASSWORD.length<16)throw new Error('Hosted mode requires GHOSTCOMMIT_PASSWORD with at least 16 characters.');
 }
 const username=env.GHOSTCOMMIT_USERNAME||'admin';
 if(hosted&&(!username||username.includes(':')))throw new Error('The login username must not contain a colon.');
 return {port,hosted,host:hosted?'0.0.0.0':'127.0.0.1',origins,hosts:new Set([...origins].map(origin=>new URL(origin).host)),username,password:env.GHOSTCOMMIT_PASSWORD||''};
}

export function hostingGuard(config:ReturnType<typeof hostingConfig>):RequestHandler{
 const expected=createHash('sha256').update(`${config.username}:${config.password}`).digest();
 return (req,res,next)=>{
  // Render health probes get only the public health response, never workspace data.
  if(req.method==='GET'&&req.path==='/api/health')return next();
  if(!config.hosts.has(req.headers.host||''))return void res.status(403).json({error:'Unrecognized application host.'});
  const origin=req.headers.origin;
  // Following a link from Render/GitHub is a cross-site document navigation.
  // Admit that read-only page entry, but never cross-site API, iframe or fetch requests.
  const pageNavigation=req.method==='GET'&&req.path!=='/api'&&!req.path.startsWith('/api/')&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
  if((origin&&!config.origins.has(origin))||(req.headers['sec-fetch-site']==='cross-site'&&!pageNavigation))return void res.status(403).json({error:'Cross-site access is blocked.'});
  if(config.hosted){
   const match=/^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(req.headers.authorization||'');
   const actual=createHash('sha256').update(match?Buffer.from(match[1],'base64') : Buffer.alloc(0)).digest();
   if(!match||!timingSafeEqual(actual,expected)){
    res.setHeader('WWW-Authenticate','Basic realm="GhostCommit", charset="UTF-8"');
    return void res.status(401).send('Sign in to GhostCommit.');
   }
  }
  next();
 };
}
