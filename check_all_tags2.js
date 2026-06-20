import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

// Remove all comments to avoid parsing tags inside comments
// JSX comments: {/* ... */}
// JS comments: // ...
let cleanContent = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
cleanContent = cleanContent.replace(/\/\/.*/g, '');

const tags = [];
const regex = /<\/?([a-zA-Z0-9_.]+)[^>]*>/g;
let match;

while ((match = regex.exec(cleanContent)) !== null) {
  const fullTag = match[0];
  const tagName = match[1];
  
  // Ignore self-closing tags
  if (fullTag.endsWith('/>')) continue;
  
  // Ignore known self-closing tags that might not have />
  if (['img', 'input', 'br', 'hr', 'path', 'circle', 'line', 'rect'].includes(tagName)) continue;
  
  // Get line number
  const upToMatch = cleanContent.substring(0, match.index);
  const lineNumber = (upToMatch.match(/\n/g) || []).length + 1;
  
  if (fullTag.startsWith('</')) {
    if (tags.length === 0) {
      console.log(`Line ${lineNumber}: Found closing tag </${tagName}> but stack is empty`);
    } else {
      const lastTag = tags.pop();
      if (lastTag.name !== tagName) {
        console.log(`Line ${lineNumber}: Expected </${lastTag.name}> (from line ${lastTag.line}) but found </${tagName}>`);
        // Try to recover by popping until we find the matching tag
        let found = false;
        for (let i = tags.length - 1; i >= 0; i--) {
          if (tags[i].name === tagName) {
            found = true;
            tags.length = i; // Pop all tags up to the matching one
            break;
          }
        }
        if (!found) {
          console.log(`  -> Could not find matching <${tagName}> in stack, ignoring closing tag.`);
          tags.push(lastTag); // Put it back
        }
      }
    }
  } else {
    tags.push({ name: tagName, line: lineNumber });
  }
}

if (tags.length > 0) {
  console.log('Unclosed tags remaining in stack:');
  for (const tag of tags) {
    console.log(`Line ${tag.line}: <${tag.name}>`);
  }
} else {
  console.log('All tags balanced!');
}
