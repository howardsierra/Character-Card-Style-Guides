import * as fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

let divCount = 0;
let animatePresenceCount = 0;
let motionDivCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Count <AnimatePresence>
  if (line.includes('<AnimatePresence')) animatePresenceCount++;
  if (line.includes('</AnimatePresence>')) animatePresenceCount--;
  
  // Count <motion.div>
  if (line.includes('<motion.div')) motionDivCount++;
  if (line.includes('</motion.div>')) motionDivCount--;
  
  // Count <div>
  const openDivs = (line.match(/<div/g) || []).length;
  const closeDivs = (line.match(/<\/div>/g) || []).length;
  
  divCount += openDivs - closeDivs;
  
  if (line.includes('</AnimatePresence>')) {
    console.log(`Line ${i + 1}: </AnimatePresence> found. Current div count: ${divCount}, motion.div count: ${motionDivCount}`);
  }
}

console.log(`Final div count: ${divCount}`);
console.log(`Final motion.div count: ${motionDivCount}`);
console.log(`Final AnimatePresence count: ${animatePresenceCount}`);
