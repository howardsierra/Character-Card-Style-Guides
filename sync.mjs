import fs from 'fs';
import path from 'path';

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'scripts' || entry.name === 'tmp_repo') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir('./tmp_repo/src', './src');
fs.copyFileSync('./tmp_repo/package.json', './package.json');
fs.copyFileSync('./tmp_repo/index.html', './index.html');
if (fs.existsSync('./tmp_repo/tailwind.config.js')) {
  fs.copyFileSync('./tmp_repo/tailwind.config.js', './tailwind.config.js');
}
if (fs.existsSync('./tmp_repo/vite.config.ts')) {
   fs.copyFileSync('./tmp_repo/vite.config.ts', './vite.config.ts');
}

console.log('Synced successfully!');
