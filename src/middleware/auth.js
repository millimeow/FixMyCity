import {db} from '../db.js';
import {digest,fail} from '../services/security.js';
export async function session(req,res,next){
 const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fmc_session='))?.slice(12);
 if(raw&&/^[a-f0-9]{64}$/.test(raw)){const s=await db.session.findUnique({where:{id:digest(raw)},include:{user:true}});if(s&&s.expiresAt>new Date()){req.user=s.user;req.session=s;}}
 next();
}
export function requireUser(req,res,next){if(!req.user)fail(401,'Please sign in to continue.');next();}
export const roles=(...allowed)=>(req,res,next)=>{if(!req.user)fail(401,'Please sign in to continue.');if(!allowed.includes(req.user.role))fail(403,'Your account cannot perform this action.');next();};
export function csrf(req,res,next){
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
 const origin=req.headers.origin;
 if(origin&&origin!==`${req.protocol}://${req.get('host')}`)fail(403,'Cross-origin requests are not allowed.');
 if(req.session&&req.headers['x-csrf-token']!==req.session.csrf)fail(403,'Your session needs refreshing. Reload and try again.');
 }next();
}
const buckets=new Map();
export function throttle(req,res,next){const key=req.ip;const now=Date.now();const b=buckets.get(key)||{count:0,reset:now+900000};if(now>b.reset){b.count=0;b.reset=now+900000;}b.count++;buckets.set(key,b);if(b.count>50)fail(429,'Too many sign-in attempts. Try again in 15 minutes.');next();}
setInterval(()=>{for(const [key,b] of buckets)if(Date.now()>b.reset)buckets.delete(key);},60000).unref();
