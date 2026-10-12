import fs from 'node:fs/promises';
await fs.access('public/catalog.json');
await fs.access('cloud-config.json');
console.log('Cloud client ready');
