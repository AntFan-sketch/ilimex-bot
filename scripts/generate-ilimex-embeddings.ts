// scripts/generate-ilimex-embeddings.ts

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { ILIMEX_KNOWLEDGE_PACK } from "../src/data/ilimex-knowledge-pack";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function run() {
  console.log("Generating embeddings for Ilimex Knowledge Pack...");

  const results = [];

  for (const chunk of ILIMEX_KNOWLEDGE_PACK) {
    const embedding = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: chunk.text,
    });

    results.push({
      id: chunk.id,
      title: chunk.title,
      text: chunk.text,
      embedding: embedding.data[0].embedding,
    });

    console.log("Embedded chunk:", chunk.id);
  }

  const outFile = path.join(process.cwd(), "src/data/ilimex-embeddings.json");

  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log("Embeddings written to:", outFile);
}

run();
