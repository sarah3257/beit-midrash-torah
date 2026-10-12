import {betterAuth} from 'better-auth';
import {bearer} from 'better-auth/plugins';
import pg from 'pg';

export const origin=process.env.BETTER_AUTH_URL||'https://beit-midrash-torah.vercel.app';
export const auth=betterAuth({
 appName:'בית המדרש שלי',
 baseURL:origin,
 secret:process.env.BETTER_AUTH_SECRET,
 database:new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:20000}),
 emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128},
 session:{expiresIn:60*60*24*30,updateAge:60*60*24},
 rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-up/email':{window:3600,max:5},'/sign-in/email':{window:60,max:5}}},
 advanced:{useSecureCookies:origin.startsWith('https:'),ipAddress:{ipAddressHeaders:['x-real-ip']}},
 trustedOrigins:[origin],
 plugins:[bearer({requireSignature:true})]
});
