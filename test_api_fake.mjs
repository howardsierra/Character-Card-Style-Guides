async function test() {
  const res = await fetch("https://api.openai.com/v1/fake_endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer placeholder"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: "Hello world"
    })
  });
  console.log(res.status, await res.text());
}
test();
