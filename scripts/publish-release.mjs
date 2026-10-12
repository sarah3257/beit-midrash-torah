import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const installer=`artifacts/Beit-Midrash-Setup-${version}.exe`;
const hash=createHash('sha256').update(await fs.readFile(installer)).digest('hex');
await fs.writeFile('artifacts/SHA256SUMS.txt',hash+'  '+installer.split('/').pop()+'\n');
await fs.writeFile('artifacts/RELEASE.md',`בית המדרש שלי ${version}\n\nמתקין Windows חינמי לעבודה ללא אינטרנט, כתיבה לפי מסכת/פרק/דף או נושאים אישיים, ייבוא Word וסנכרון ידני לחשבון בענן.\n\nהוראות התקנה: https://beit-midrash-torah.vercel.app/install.html\n\nקובץ ההתקנה אינו כולל כתבים אישיים. תוכנת Windows כרגע ללא חתימת מפרסם מסחרית.\n`);
const env={...process.env};
if(!env.GH_TOKEN){
 const result=spawnSync('C:/Program Files/Git/cmd/git.exe',['credential','fill'],{encoding:'utf8',input:'protocol=https\nhost=github.com\n\n',env:{...env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}});
 if(result.status!==0)throw Error('GitHub login required');
 env.GH_TOKEN=result.stdout.split('\n').find(line=>line.startsWith('password='))?.slice(9).trim();
}
if(!env.GH_TOKEN)throw Error('GitHub login required');
const args=['release','create','v'+version,installer,'artifacts/SHA256SUMS.txt','--repo','sarah3257/beit-midrash-torah','--title','בית המדרש שלי '+version,'--notes-file','artifacts/RELEASE.md'];
const result=spawnSync('C:/Program Files/GitHub CLI/gh.exe',args,{env,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
