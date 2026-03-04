// src/lib/revenue/scoring.ts
import { Intent, RevenueMeta, ScoreBand, Segment } from "./types";
import { includesAny, KW, normalizeText } from "./keywords";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function band(score: number): ScoreBand {
  if (score <= 34) return "0_34";
  if (score <= 59) return "35_59";
  if (score <= 79) return "60_79";
  return "80_100";
}
function negativeDamperPoints(message: string, signals: string[] = []): number {
  const t = normalizeText(message);
  if (!includesAny(t, KW.negativeDampers)) return 0;

  // Strongly downweight non-commercial / academic / "template answer" behaviours
  signals.push("negative_damper");
  return -35;
}
export function detectSegment(message: string): Segment {
  const t = normalizeText(message);

  // investor + distributor need to win even if other words present
  if (includesAny(t, KW.investor)) return "investor";
  if (includesAny(t, KW.distributor)) return "distributor";
  if (includesAny(t, KW.trial)) return "trial";

  if (includesAny(t, KW.mushroom)) return "mushroom";
  if (includesAny(t, KW.poultry)) return "poultry";
  return "unknown";
}

export function detectIntent(message: string): Intent {
  const t = normalizeText(message);

  if (includesAny(t, KW.investor)) return "investor";
  if (includesAny(t, KW.partnership)) return "partnership";
  if (includesAny(t, KW.order) && includesAny(t, KW.urgencyImmediate)) {
  return "high_intent";
}
  if (includesAny(t, KW.pricing)) return "commercial";
  if (includesAny(t, KW.trial)) return "trial";
  if (includesAny(t, KW.install)) return "technical";

  return "information";
}

/**
 * Very lightweight numeric extraction for houses/rooms.
 * Examples: "18 houses", "10 rooms", "we have 25 sheds"
 */
export function extractScale(message: string): { unit: "houses" | "rooms"; count: number } | undefined {
  const t = normalizeText(message);

  // basic number detection
  const m = t.match(/(\d{1,4})\s*(houses|house|sheds|shed|barns|barn|rooms|room|growing rooms|growing room)/);
  if (!m) return undefined;

  const count = Number(m[1]);
  if (!Number.isFinite(count) || count <= 0) return undefined;

  const unitRaw = m[2];
  const unit: "houses" | "rooms" = unitRaw.includes("room") ? "rooms" : "houses";
  return { unit, count };
}

export function extractTimeline(message: string): string | undefined {
  const t = normalizeText(message);
  if (includesAny(t, KW.urgencyImmediate)) return "immediate";
  if (includesAny(t, KW.urgencyQuarter)) return "this_quarter";
  if (includesAny(t, KW.urgencyYear)) return "this_year";
  return undefined;
}

function segmentMultiplier(segment: Segment): number {
  switch (segment) {
    case "poultry":
      return 1.25;
    case "mushroom":
      return 1.2;
    case "distributor":
      return 1.15;
    case "trial":
      return 1.05;
    case "investor":
      return 1.0;
    default:
      return 1.0;
  }
}

function scalePoints(scale?: { unit: "houses" | "rooms"; count: number }, signals: string[] = []): number {
  if (!scale) return 0;
  signals.push(`scale:${scale.unit}:${scale.count}`);
  let pts = 10; // mentions scale explicitly
  const n = scale.count;
  if (n >= 50) pts += 50;
  else if (n >= 25) pts += 35;
  else if (n >= 10) pts += 25;
  else if (n >= 5) pts += 12;
  return pts;
}

function timelinePoints(timeline?: string, signals: string[] = []): number {
  if (!timeline) return 0;
  signals.push(`timeline:${timeline}`);
  if (timeline === "immediate") return 20;
  if (timeline === "this_quarter") return 12;
  if (timeline === "this_year") return 8;
  return 8;
}

function intentPoints(intent: Intent, message: string, signals: string[] = []): number {
  const t = normalizeText(message);
  let pts = 0;

  if (intent === "commercial") {
    pts += 25;
    signals.push("intent:commercial");
  } else if (intent === "high_intent") {
    pts += 30;
    signals.push("intent:high_intent");
  } else if (intent === "trial") {
    pts += 18;
    signals.push("intent:trial");
  } else if (intent === "partnership") {
    pts += 20;
    signals.push("intent:partnership");
  } else if (intent === "investor") {
    pts += 12;
    signals.push("intent:investor");
  } else if (intent === "technical") {
    // no direct points; still valuable but not a purchase signal alone
    signals.push("intent:technical");
  } else {
    signals.push("intent:information");
  }

  // Authority/fit adders
  if (includesAny(t, KW.authority)) {
    pts += 10;
    signals.push("authority");
  }
  if (includesAny(t, KW.budget)) {
    pts += 10;
    signals.push("budget");
  }
  if (includesAny(t, KW.biosecurityPain)) {
    pts += 8;
    signals.push("biosecurity_pain");
  }

  return pts;
}

function segmentAdders(segment: Segment, message: string, signals: string[] = []): number {
  const t = normalizeText(message);
  let pts = 0;

  if (segment === "mushroom") {
    if (includesAny(t, ["yield", "flush", "consistency", "disease treatments"])) {
      pts += 10;
      signals.push("mushroom:value_signal");
    }
    if (includesAny(t, ["agaricus", "exotics", "tunnel", "growing room"])) {
      pts += 8;
      signals.push("mushroom:context");
    }
  }

  if (segment === "poultry") {
    if (includesAny(t, ["broiler", "layer", "hatchery", "integrator"])) {
      pts += 10;
      signals.push("poultry:context");
    }
    if (includesAny(t, ["mortality", "ammonia", "pathogen", "ventilation"])) {
      pts += 8;
      signals.push("poultry:pain");
    }
	if (includesAny(t, ["integrator", "hatchery group", "processor", "corporate"])) {
  pts += 20;
  signals.push("poultry:integrator_level");
	}
  }

  if (segment === "distributor") {
    if (includesAny(t, ["territory", "uk", "ireland", "eu", "us", "middle east", "asia"])) {
      pts += 15;
      signals.push("dist:territory");
    }
    if (includesAny(t, ["margin", "margins", "pricing", "exclusive", "exclusivity"])) {
      pts += 10;
      signals.push("dist:commercial_terms");
    }
  }

  if (segment === "trial") {
    if (includesAny(t, ["ngs", "protocol", "sampling", "swab", "litter", "water"])) {
      pts += 12;
      signals.push("trial:method");
    }
    if (includesAny(t, ["multi-site", "multiple sites", "several sites"])) {
      pts += 18;
      signals.push("trial:multi_site");
    }
  }

  if (segment === "investor") {
    if (includesAny(t, ["check size", "cheque size", "timeline", "ic", "investment committee"])) {
      pts += 10;
      signals.push("inv:process");
    }
    if (includesAny(t, ["strategic partnership", "capital plus"])) {
      pts += 12;
      signals.push("inv:strategic");
    }
  }

  return pts;
}

export function getQualificationQuestion(segment: Segment): string {
  switch (segment) {
    case "mushroom":
      return "To give you a meaningful assessment — roughly how many growing rooms are you operating today?";
    case "poultry":
      return "So I can size this properly — how many houses would you potentially deploy across?";
    case "distributor":
      return "Which territory would you be looking to represent?";
    case "trial":
      return "Would this be a single-site pilot or a multi-site validation?";
    case "investor":
      return "Are you evaluating this from an investment perspective or a strategic partnership perspective?";
    default:
      return "To tailor this — roughly what scale are you thinking (e.g., number of houses/rooms)?";
  }
}

export type ScoreInputs = {
  message: string;
  ctaOpened?: boolean;
  leadStarted?: boolean;
  leadSubmitted?: boolean;
  returnedSession?: boolean;
  messageCount?: number; // user messages in session
  clickedContact?: boolean;
  qualificationAsked?: boolean; // from sessionStorage
};

export function scoreLead(inputs: ScoreInputs): RevenueMeta {
  const { message } = inputs;
  const signals: string[] = [];

  const segment = detectSegment(message);
  const intent = detectIntent(message);
  const scale = extractScale(message);
  const timeline = extractTimeline(message);

  let base = 0;
  base += intentPoints(intent, message, signals);
  base += negativeDamperPoints(message, signals);
  base += scalePoints(scale, signals);
  base += timelinePoints(timeline, signals);
  base += segmentAdders(segment, message, signals);

  // Behavioural signals
  if (inputs.ctaOpened) {
    base += 12;
    signals.push("cta_opened");
  }
  if (inputs.leadStarted) {
    base += 10;
    signals.push("lead_started");
  }
  if (inputs.leadSubmitted) {
    base += 35;
    signals.push("lead_submitted");
  }
  if (inputs.returnedSession) {
    base += 8;
    signals.push("returned_session");
  }
  if ((inputs.messageCount ?? 0) >= 6) {
    base += 6;
    signals.push("deep_session");
  }
  if (inputs.clickedContact) {
    base += 10;
    signals.push("clicked_contact");
  }

  // If lead submitted, force minimum score 70 (as agreed)
  if (inputs.leadSubmitted) base = Math.max(base, 70);

  // Apply multiplier and clamp
  const mult = segmentMultiplier(segment);
  let finalScore = Math.round(base * mult);
  finalScore = clamp(finalScore);

  const scoreBand = band(finalScore);

   // Hybrid qualifier
  const alreadyAsked = !!inputs.qualificationAsked;
  const isDamped = signals.includes("negative_damper");

  const qualifiesIntent =
    intent === "commercial" ||
    intent === "high_intent" ||
    intent === "trial" ||
    intent === "partnership";

  // Ask only when it makes sense (and never on damped / academic / template-answer flows)
  const enoughContext = (inputs.messageCount ?? 0) >= 2;

  const askQualification =
    !isDamped &&
    !alreadyAsked &&
    enoughContext &&
    qualifiesIntent &&
    (scoreBand === "60_79" || scoreBand === "80_100");

  const qualificationQuestion = askQualification ? getQualificationQuestion(segment) : undefined;

  return {
    intent,
    segment,
    leadScore: finalScore,
    scoreBand,
    signals,
    scale,
    timeline,
    askQualification,
    qualificationQuestion,
  };
}