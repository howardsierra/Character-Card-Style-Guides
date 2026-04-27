async function test() {
  const res = await fetch('https://openrouter.ai/api/v1/responses');
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text.substring(0, 200));
}
test();
