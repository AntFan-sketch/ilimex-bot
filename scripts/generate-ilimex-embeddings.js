// scripts/generate-ilimex-embeddings.js

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// Inline knowledge pack just for embedding generation
// (This can be duplicated from your TS file – it's a one-off tooling script.)
const ILIMEX_KNOWLEDGE_PACK = [
  {
    id: "company-boilerplate",
    title: "Company Boilerplate",
    text: `Ilimex is a Northern Ireland–based biosecurity technology company developing UVC-based air-sterilisation systems for agricultural environments. 
Flufence™ uses high-efficiency UVC irradiation to reduce airborne microbial load, improve environmental stability, and support more consistent production cycles. 
Ilimex works with farmers, producers, universities, and research laboratories to conduct trials in poultry, mushrooms, and other sectors.`,
  },
  {
    id: "flufence-how-it-works",
    title: "Flufence – High-Level Mechanism",
    text: `Flufence™ draws air through a sealed UVC chamber, exposes airborne microbes to UVC, and returns treated air. 
UVC is fully contained inside the chamber and does not enter the environment. 
The system produces no ozone and no residues. 
It complements existing ventilation and hygiene practices, not replacing them.`,
  },
  {
    id: "poultry-summary",
    title: "Poultry Trial Summary",
    text: `In commercial poultry trials, Flufence™ was run continuously. 
Observed findings included improved environmental stability, smoother temperature and humidity profiles, calmer and more uniform flocks, and more consistent flock outcomes. 
Trials to date suggest a cleaner and more stable air environment may reduce stress factors. 
Results vary by site and depend on management, ventilation, and operational conditions.`,
  },
  {
    id: "mushroom-summary",
    title: "Mushroom Trial – House 18 vs House 20",
    text: `In a mushroom trial, Flufence™ was installed in House 18, with House 20 as control. 
House 18 showed more consistent yields and more stable environmental conditions across cycles. 
A working hypothesis is that cleaner, more stable air may reduce crop stress. 
Sequencing data is pending and pathogen-specific effects cannot yet be claimed.`,
  },
  {
    id: "faq-air-safety",
    title: "FAQ – Air Safety",
    text: `UVC is contained inside the Flufence™ chamber and does not enter the room. 
The treated air is safe for poultry, mushrooms, and workers when installed and operated as designed.`,
  },
  {
    id: "faq-ventilation",
    title: "FAQ – Ventilation",
    text: `Flufence™ does not replace ventilation. 
It complements ventilation by treating the circulating air and enhancing environmental stability.`,
  },
  {
    id: "faq-yield",
    title: "FAQ – Yield Guarantees",
    text: `Flufence™ cannot guarantee increased yield. 
Trials to date suggest improved environmental stability and more consistent outcomes, but results vary by site.`,
  },
];

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set in the environment.");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  console.log("Generating embeddings for Ilimex Knowledge Pack...");

  const results = [];

  for (const chunk of ILIMEX_KNOWLEDGE_PACK) {
    console.log("Embedding chunk:", chunk.id);

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
  }

  const outFile = path.join(process.cwd(), "src/data/ilimex-embeddings.json");

  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log("Embeddings written to:", outFile);
}

run().catch((err) => {
  console.error("Error generating embeddings:", err);
  process.exit(1);
});
