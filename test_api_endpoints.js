async function test() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const json = await res.json();
  console.log("Total models:", json.data.length);
  console.log("First model keys:", Object.keys(json.data[0]));
  console.log("First model name:", json.data[0].name);
}
test();
