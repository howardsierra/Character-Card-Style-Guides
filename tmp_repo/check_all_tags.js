import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

// Simple JSX tag parser
const tags = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Find all tags like <div, </div>, <span, </span>, <Button, </Button>, etc.
  // Ignore self-closing tags like <img />, <input />
  const regex = /<\/?([a-zA-Z0-9_.]+)[^>]*>/g;
  let match;
  
  while ((match = regex.exec(line)) !== null) {
    const fullTag = match[0];
    const tagName = match[1];
    
    // Ignore self-closing tags
    if (fullTag.endsWith('/>')) continue;
    
    // Ignore some known self-closing tags that might not have />
    if (['img', 'input', 'br', 'hr', 'path', 'circle', 'line', 'rect'].includes(tagName)) continue;
    
    if (fullTag.startsWith('</')) {
      if (tags.length === 0) {
        console.log(`Line ${i+1}: Found closing tag </${tagName}> but stack is empty`);
      } else {
        const lastTag = tags.pop();
        if (lastTag.name !== tagName) {
          console.log(`Line ${i+1}: Expected </${lastTag.name}> (from line ${lastTag.line}) but found </${tagName}>`);
        }
      }
    } else {
      tags.push({ name: tagName, line: i + 1 });
    }
  }
}

if (tags.length > 0) {
  console.log('Unclosed tags:');
  for (const tag of tags) {
    console.log(`Line ${tag.line}: <${tag.name}>`);
  }
} else {
  console.log('All tags balanced!');
}
