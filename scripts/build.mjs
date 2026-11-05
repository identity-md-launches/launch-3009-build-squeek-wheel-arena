// The site is plain ES modules with no dependencies, so the production export is a copy of src/.
import { cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await cp('src', 'dist', { recursive: true });
console.log('Copied src/ to dist/.');
