const fs = require('fs');

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

let divCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  const openDivs = (line.match(/<div/g) || []).length;
  const closeDivs = (line.match(/<\/div>/g) || []).length;
  
  divCount += openDivs - closeDivs;
  
  if (line.includes('<AnimatePresence')) {
    console.log(`Line ${i + 1}: <AnimatePresence> found. Current div count: ${divCount}`);
  }
}
