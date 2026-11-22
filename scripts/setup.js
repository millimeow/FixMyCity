import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,closeSync,openSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
if(existsSync('.env'))process.loadEnvFile('.env');
process.env.DATABASE_URL ||= 'file:./dev.db';
const url=process.env.DATABASE_URL;
if(!url.startsWith('file:'))throw new Error('This project requires a local SQLite file: database URL.');
const file=resolve('prisma',url.slice(5));mkdirSync(dirname(file),{recursive:true});
// Pre-create the SQLite file for consistent first-run behavior across Prisma engines.
if(!existsSync(file))closeSync(openSync(file,'ax',0o600));
for(const [command,args]of [['npx',['prisma','generate']],['npx',['prisma','migrate','deploy']],['node',['prisma/seed.js']]]){const result=spawnSync(command,args,{stdio:'inherit',env:process.env,shell:process.platform==='win32'});if(result.status!==0)process.exit(result.status||1);}
