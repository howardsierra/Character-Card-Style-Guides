export const SCRIPT_GUIDE = `
THE ULTIMATE CHARACTER AI SCRIPTING MASTERY GUIDE (Summary)

Core Rules:
1. You can only modify context.character.personality and context.character.scenario.
2. You can read context.chat.last_message and context.chat.message_count.
3. Use ES5 JavaScript ONLY. No let/const, arrow functions, template literals, or modern array methods. Use var.
4. Always lowercase and pad messages for keyword matching:
   var last = context.chat.last_message.toLowerCase();
   var padded = " " + last + " ";
   if (padded.indexOf(" keyword ") !== -1) { ... }
5. Use += to append to personality/scenario, not = (unless you want to overwrite).
6. Use Math.random() for probability.
7. Use new Date().getHours() for time-based events.

Examples:
// Basic Keyword
var last = context.chat.last_message.toLowerCase();
var padded = " " + last + " ";
if (padded.indexOf(" hello ") !== -1) {
  context.character.personality += " Friendly and welcoming.";
}

// Message Count
var count = context.chat.message_count;
if (count > 10) {
  context.character.personality += ", more comfortable now.";
}

// Probability
if (Math.random() < 0.3) {
  context.character.scenario += " A distant bell tolls.";
}

// Time
var hour = new Date().getHours();
if (hour < 6 || hour > 22) {
  context.character.personality += ", sleepy.";
}

// Lorebook
var lore = [
  { key: "forest", text: " Trees surround you." },
  { key: "city", text: " Streets buzz." }
];
for (var i = 0; i < lore.length; i++) {
  if (padded.indexOf(" " + lore[i].key + " ") !== -1) {
    context.character.scenario += lore[i].text;
    break;
  }
}
`;
