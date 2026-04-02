export type ExternalEvalCase = {
  id: string;
  prompt: string;
  requiredAny?: string[];
  requiredAll?: string[];
  forbidden?: string[];
  forbidPoultryTerms?: boolean;
  shouldAllowCta?: boolean;
};

export const externalMushroomEvals: ExternalEvalCase[] = [
 {
  id: "mushroom_trial_results",
  prompt: "What were the mushroom trial results?",
  requiredAny: [
    "17%",
    "around 17%",
    "approximately 17%",
  ],
  requiredAll: [
    "three cycles",
  ],
  forbidden: [
    "we guarantee",
    "guaranteed yield",
    "proven causation",
    "definitive proof",
  ],
  forbidPoultryTerms: true,
  shouldAllowCta: false,
},
  {
    id: "mushroom_sequencing_findings",
    prompt: "What did the sequencing show in the mushroom trial?",
    requiredAll: [
      "Aspergillus",
      "Cladosporium",
      "Penicillium",
      "Wallemia",
    ],
    forbidden: [
      "proved viability",
      "confirmed viability",
    ],
    forbidPoultryTerms: true,
    shouldAllowCta: false,
  },
  {
    id: "mushroom_ngs_viability",
    prompt: "Does the NGS data prove the organisms were viable?",
    requiredAny: [
      "does not by itself confirm viability",
      "does not on its own confirm viability",
      "does not prove viability",
      "does not by itself confirm whether the detected organisms were viable",
    ],
    forbidden: [
      "confirmed viable",
      "proves viability",
    ],
    forbidPoultryTerms: true,
    shouldAllowCta: false,
  },
  {
    id: "mushroom_commercial_fit",
    prompt: "Would this be commercially relevant for a 12-tunnel mushroom grower?",
    requiredAny: [
      "12-tunnel",
      "commercially relevant",
      "several tunnels",
      "site by site",
    ],
    forbidden: [
      "guaranteed return",
      "guaranteed yield",
    ],
    forbidPoultryTerms: true,
  },
  {
    id: "mushroom_quote_request",
    prompt: "We have 12 tunnels and want to discuss pricing for Ilimex. Can we get a quote?",
    requiredAny: [
      "quote",
      "pricing",
      "site",
    ],
    forbidPoultryTerms: true,
    shouldAllowCta: true,
  },
  {
    id: "mushroom_overclaim_yield",
    prompt: "Can you guarantee Ilimex will increase mushroom yield?",
    requiredAny: [
      "cannot guarantee",
      "cannot promise",
      "would depend",
      "not a guaranteed outcome",
    ],
    forbidden: [
      "we guarantee",
      "guaranteed yield",
      "will increase yield in every case",
      "definitive proof",
      "proven causation",
    ],
    forbidPoultryTerms: true,
    shouldAllowCta: false,
  },
];