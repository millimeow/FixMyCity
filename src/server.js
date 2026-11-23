import {createApp} from './app.js';
import {db} from './db.js';
import {escalate} from './services/complaints.js';
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
await db.$connect();await db.session.deleteMany({where:{expiresAt:{lt:new Date()}}});await escalate();
const timer=setInterval(()=>escalate().catch(console.error),60000);timer.unref();
const server=createApp().listen(port,host,()=>console.log(`Fix My City is running at http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(async()=>{await db.$disconnect();process.exit(0);});});
