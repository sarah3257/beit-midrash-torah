import express from 'express';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {auth,origin} from './auth.mjs';
import {accountRepository} from './db.mjs';
import {createApp} from '../server.mjs';

export const cloudApp=express();
cloudApp.disable('x-powered-by');
cloudApp.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});next();});
cloudApp.get('/api/runtime',(_req,res)=>res.json({local:false,url:origin,ready:!!process.env.DATABASE_URL}));
cloudApp.use((req,res,next)=>{if(!process.env.DATABASE_URL)return res.status(503).json({error:'ספריית הענן בהקמה. נדרש להשלים את חיבור מסד הנתונים. בינתיים אפשר להוריד את התוכנה ולכתוב במחשב.'});next();});
cloudApp.all('/api/auth/*',toNodeHandler(auth));
cloudApp.use(async(req,res,next)=>{
 try{
  const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
  if(!session)return res.status(401).json({error:'יש להתחבר לחשבון כדי לפתוח את הספרייה'});
  const user={id:session.user.id,email:session.user.email,name:session.user.name};
  const app=await createApp('/tmp/torah-cloud',{repository:accountRepository(user.id),origin,user});
  app(req,res,next);
 }catch(e){next(e);}
});
cloudApp.use((error,_req,res,_next)=>{console.error('Cloud request failed:',error.code||error.name);res.status(error.status||500).json({error:error.status?error.message:'הענן לא השלים את הבקשה. נסה שוב בעוד רגע.'});});
