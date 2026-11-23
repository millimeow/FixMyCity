import {db} from '../db.js';
import {email,password,text,hashPassword,verifyPassword,safeUser,token,digest,fail} from '../services/security.js';
const cookie=(res,raw,maxAge)=>res.cookie('fmc_session',raw,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='1',path:'/',maxAge});
async function openSession(req,res,user){if(req.session)await db.session.deleteMany({where:{id:req.session.id}});const raw=token();const csrf=token();await db.session.create({data:{id:digest(raw),csrf,userId:user.id,expiresAt:new Date(Date.now()+7*86400000)}});cookie(res,raw,7*86400000);return {user:safeUser(user),csrf};}
export async function register(req,res){const data={name:text(req.body.name,'Name',2,70),email:email(req.body.email),passwordHash:await hashPassword(password(req.body.password)),role:'CITIZEN'};if(await db.user.findUnique({where:{email:data.email}}))fail(409,'An account already uses this email.');const user=await db.user.create({data});res.status(201).json(await openSession(req,res,user));}
const dummy=await hashPassword('DummyPassword!123');
export async function login(req,res){const address=email(req.body.email);const p=text(req.body.password,'Password',1,128);const user=await db.user.findUnique({where:{email:address}});const valid=await verifyPassword(p,user?.passwordHash||dummy);if(!user||!valid)fail(401,'Email or password is incorrect.');res.json(await openSession(req,res,user));}
export async function logout(req,res){await db.session.deleteMany({where:{id:req.session.id}});cookie(res,'',0);res.json({ok:true});}
export function me(req,res){res.json({user:safeUser(req.user),csrf:req.session.csrf});}
