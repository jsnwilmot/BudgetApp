// Test-only tripwires. Analysis may read; it may never write files or use network/children.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const denied = () => { throw new Error('GUARD_DENIED'); };
for (const mod of [fs,fsp]) for (const name of Object.keys(mod)) {
  if (/^(write|append|f?truncate|unlink|rm|rmdir|mkdir|rename|copy|cp|link|symlink|f?chmod|f?chown|f?utimes|mkdtemp|createWriteStream)/i.test(name) && typeof mod[name]==='function') mod[name]=denied;
}
const writeMask=fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND;
for(const name of ['open','openSync']) {
  const original=fs[name];fs[name]=(path,flags,...rest)=>{
    if ((typeof flags==='string' && flags!=='r') || (typeof flags==='number' && (flags & writeMask))) return denied();
    return original(path,flags,...rest);
  };
}
net.Socket.prototype.connect=denied;
for(const name of Object.keys(dns.promises)) if(typeof dns.promises[name]==='function' && /^(lookup|resolve|reverse)/.test(name)) dns.promises[name]=denied;
const originalOpen=fsp.open;
fsp.open=async (path,flags,...rest)=>{
  if (typeof flags!=='number' || (flags & writeMask)) return denied();
  const handle=await originalOpen(path,flags,...rest);
  return new Proxy(handle,{get(target,key){if(key==='then') return undefined; if(!['stat','read','close'].includes(key)) return denied;return target[key].bind(target);}});
};
for(const [mod,names] of [[http,['request','get','createServer']],[https,['request','get','createServer']],[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[dgram,['createSocket']],[dns,['lookup','resolve']],[child,['exec','execFile','fork','spawn','execSync','execFileSync','spawnSync']]]) for(const name of names) mod[name]=denied;
globalThis.fetch=denied; globalThis.WebSocket=denied;
syncBuiltinESMExports();
