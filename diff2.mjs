import fs from 'fs';
import path from 'path';

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      getFiles(res, files);
    } else {
      files.push(res);
    }
  }
  return files;
}

const srcFiles = getFiles('./src').map(f => path.relative('./src', f));
const tmpFiles = getFiles('./tmp_repo/src').map(f => path.relative('./tmp_repo/src', f));

const allFiles = new Set([...srcFiles, ...tmpFiles]);

const diffs = [];
for (const f of allFiles) {
  const p1 = path.join('./src', f);
  const p2 = path.join('./tmp_repo/src', f);
  if (!fs.existsSync(p1)) {
    diffs.push(`ADDED in repo: ${f}`);
  } else if (!fs.existsSync(p2)) {
    diffs.push(`REMOVED in repo: ${f}`);
  } else {
    const c1 = fs.readFileSync(p1, 'utf-8');
    const c2 = fs.readFileSync(p2, 'utf-8');
    if (c1 !== c2 && f !== 'lib/api.ts') {
      diffs.push(`MODIFIED: ${f}`);
    }
  }
}

console.log(diffs.join('\n'));
