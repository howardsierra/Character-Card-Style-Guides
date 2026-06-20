const fetch = require('node-fetch');
async function test() {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY || 'fake_key'}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: "Hello world"
    })
  });
  console.log(res.status, await res.text());
}
test();
