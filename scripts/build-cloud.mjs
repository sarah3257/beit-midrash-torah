import fs from 'node:fs/promises';
import {build} from 'esbuild';
await fs.access('public/catalog.json');
await fs.access('cloud-config.json');
// Vercel's require instrumentation cannot load sanitize-html's ESM parser dependency.
await build({entryPoints:['node_modules/sanitize-html/index.js'],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:'cloud/vendor/sanitize.cjs'});
console.log('Cloud client ready');
