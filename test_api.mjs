async function test() {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer placeholder"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        { role: "user", content: "Hello world" }
      ]
    })
  });
  console.log(res.status, await res.text());
}
test();
