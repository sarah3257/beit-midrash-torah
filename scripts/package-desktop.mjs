import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const result=await packager({dir:root,out:path.join(root,'desktop',version),name:'Beit Midrash',executableName:'BeitMidrash',platform:'win32',arch:'x64',icon:path.join(root,'public','app.ico'),asar:true,prune:true,overwrite:false,appCopyright:'בית המדרש שלי',win32metadata:{ProductName:'בית המדרש שלי',FileDescription:'כתיבת חידושי תורה',CompanyName:'Beit Midrash'},ignore:[/^\/(desktop|data|\.runtime|\.git|tests|screenshots|scripts|artifacts|cloud|api|.vercel)(\/|$)/,/^\/(Start|Stop)\./,/\.lnk$/, /^\/.env/]});
for(const folder of result)await fs.writeFile(path.join(folder,'desktop-config.json'),JSON.stringify({dataDir:path.join(root,'data')},null,2));
console.log('Desktop application:',result.join('\n'));
