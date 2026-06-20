import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

let cleanContent = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
cleanContent = cleanContent.replace(/\/\/.*/g, '');

const tags = [];
const regex = /<\/?([a-zA-Z0-9_.]+)[^>]*>/g;
let match;

let divCount = 0;

while ((match = regex.exec(cleanContent)) !== null) {
  const fullTag = match[0];
  const tagName = match[1];
  
  if (/\/>\s*$/.test(fullTag)) continue;
  if (['img', 'input', 'br', 'hr', 'path', 'circle', 'line', 'rect', 'svg'].includes(tagName)) continue;
  
  // Ignore typescript generics
  if (['ViewState', 'CharacterCard', 'AIProvider', 'ApiKeys', 'Record', 'string', 'SavedGuide', 'Set', 'UniverseData', 'CardTemplate', 'number', 'HTMLInputElement', 'HTMLDivElement'].includes(tagName)) continue;
  
  const upToMatch = cleanContent.substring(0, match.index);
  const lineNumber = (upToMatch.match(/\n/g) || []).length + 1;
  
  if (tagName === 'div') {
    if (fullTag.startsWith('</')) {
      divCount--;
      console.log(`Line ${lineNumber}: </div>, count=${divCount}`);
    } else {
      divCount++;
      console.log(`Line ${lineNumber}: <div>, count=${divCount}`);
    }
  }
}
