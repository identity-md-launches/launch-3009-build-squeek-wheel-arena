// Fails when dist/ is not a byte-for-byte copy of src/.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function files(root, dir = root) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(root, path)));
    else found.push(relative(root, path));
  }
  return found.sort();
}

const source = await files('src');
const built = await files('dist');
const problems = [];
for (const path of new Set([...source, ...built])) {
  if (!source.includes(path)) problems.push(`only in dist: ${path}`);
  else if (!built.includes(path)) problems.push(`missing from dist: ${path}`);
  else if (!(await readFile(join('src', path))).equals(await readFile(join('dist', path)))) {
    problems.push(`differs: ${path}`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`dist/ matches src/ across ${source.length} files.`);
