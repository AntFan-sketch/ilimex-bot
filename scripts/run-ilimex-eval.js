// scripts/run-ilimex-eval.js

require("dotenv").config({ path: ".env.local" }); // for Next API + OpenAI
const path = require("path");
const fs = require("fs");

// Node 18+ has global fetch. If on older Node, you'd need node-fetch.
if (typeof fetch !== "function") {
  console.error("Global fetch is not available in this Node version.");
  process.exit(1);
}

const evalPath = path.join(
  process.cwd(),
  "src",
  "data",
  "ilimex-eval.json",
);

if (!fs.existsSync(evalPath)) {
  console.error("Eval file not found at:", evalPath);
  process.exit(1);
}

const tests = JSON.parse(fs.readFileSync(evalPath, "utf8"));

async function runTest(test) {
  const endpoint =
    test.mode === "internal"
      ? "http://localhost:3000/api/chat-internal"
      : "http://localhost:3000/api/chat-public";

  const body = {
    messages: [
      {
        role: "user",
        content: test.question,
      },
    ],
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      id: test.id,
      ok: false,
      error: `Request failed: ${err.message}`,
      content: "",
    };
  }

  if (!response.ok) {
    return {
      id: test.id,
      ok: false,
      error: `HTTP ${response.status} ${response.statusText}`,
      content: "",
    };
  }

  const data = await response.json();
  const content = data?.message?.content || "";

  const lower = content.toLowerCase();

  const missingIncludes = (test.must_include || []).filter(
    (needle) =>
      needle &&
      !lower.includes(needle.toLowerCase()),
  );

  const presentForbidden = (test.must_not_include || []).filter(
    (needle) =>
      needle &&
      lower.includes(needle.toLowerCase()),
  );

  const ok = missingIncludes.length === 0 && presentForbidden.length === 0;

  return {
    id: test.id,
    mode: test.mode,
    category: test.category,
    ok,
    missingIncludes,
    presentForbidden,
    content,
  };
}

async function main() {
  console.log("Running IlimexBot evaluation...");
  console.log(
    `Tests loaded: ${tests.length}. Make sure your Next.js dev server is running on http://localhost:3000`,
  );

  const results = [];

  for (const test of tests) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runTest(test);
    results.push(result);

    if (!result.ok) {
      console.log(
        `❌ ${test.id} [${test.mode}/${test.category}] failed`,
      );
      if (result.error) {
        console.log("   Error:", result.error);
      } else {
        if (result.missingIncludes.length > 0) {
          console.log(
            "   Missing must_include:",
            result.missingIncludes,
          );
        }
        if (result.presentForbidden.length > 0) {
          console.log(
            "   present forbidden:",
            result.presentForbidden,
          );
        }
      }
    } else {
      console.log(`✅ ${test.id} [${test.mode}/${test.category}] passed`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  console.log("\n=== SUMMARY ===");
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);

  // Optional: write a detailed report
  const reportPath = path.join(
    process.cwd(),
    "ilimex-eval-report.json",
  );
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log("Detailed report written to:", reportPath);
}

main().catch((err) => {
  console.error("Unexpected error in evaluator:", err);
  process.exit(1);
});
