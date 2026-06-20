import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

for (let i = 1560; i <= 1680; i++) {
  if (lines[i-1].includes('motion.div')) {
    console.log(`${i}: ${lines[i-1]}`);
  }
}
