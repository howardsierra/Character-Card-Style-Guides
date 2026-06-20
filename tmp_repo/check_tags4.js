import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

let divCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  const openDivs = (line.match(/<div/g) || []).length;
  const closeDivs = (line.match(/<\/div>/g) || []).length;
  
  divCount += openDivs - closeDivs;
  
  if (line.includes('</motion.div>')) {
    console.log(`Line ${i + 1}: </motion.div> found. Current div count: ${divCount}`);
  }
}
