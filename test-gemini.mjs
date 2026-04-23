import fs from "fs";
import path from "path";

async function testGemini() {
  let key = process.env.GEMINI_API_KEY;
  if (!key) {
    try {
      const env = fs.readFileSync(".env", "utf8");
      const match = env.match(/GEMINI_API_KEY=(.*)/);
      if (match) key = match[1].trim();
    } catch (e) {}
  }
  if (!key) {
    try {
      const env = fs.readFileSync(".env.local", "utf8");
      const match = env.match(/GEMINI_API_KEY=(.*)/);
      if (match) key = match[1].trim();
    } catch (e) {}
  }
  if (!key) {
    console.log("No GEMINI_API_KEY found");
    return;
  }
  const model = "gemini-2.0-flash";
  const prompt = "Hello";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Gemini API error for model 2.0:", res.status, errorText);
  } else {
    const data = await res.json();
    console.log("Success for model 2.0:", !!data);
  }

  // Also test 1.5 flash
  const res2 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    }
  );

  if (!res2.ok) {
    const errorText = await res2.text();
    console.error("Gemini API error for model 1.5:", res2.status, errorText);
  } else {
    const data = await res2.json();
    console.log("Success for model 1.5:", !!data);
  }
}

testGemini();
