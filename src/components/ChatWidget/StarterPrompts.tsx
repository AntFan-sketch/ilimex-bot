// src/components/ChatWidget/StarterPrompts.tsx

import React from "react";

type ChatMode = "public" | "internal";

export interface StarterPromptsProps {
  mode: ChatMode;
  onSelect: (prompt: string) => void;
  className?: string;
}

interface StarterPrompt {
  id: string;
  label: string;
  prompt: string;
  modes: ChatMode[]; // which modes this prompt should appear in
}

// Central list of prompts, aligned to your system prompts / evals
const STARTER_PROMPTS: StarterPrompt[] = [
  // PUBLIC MODE – website visitors, farmers, journalists
  {
    id: "pub-what-is-ilimex",
    label: "Who are Ilimex?",
    prompt: "Who is Ilimex and what does Flufence do?",
    modes: ["public"],
  },
  {
    id: "pub-how-flufence-works",
    label: "How does Flufence work?",
    prompt:
      "Can you explain in simple terms how Flufence works and how it affects the air in a poultry or mushroom house?",
    modes: ["public"],
  },
  {
    id: "pub-mushroom-trial",
    label: "Mushroom trial summary",
    prompt:
      "Please summarise the mushroom trial comparing House 18 and House 20 in clear, non-technical language.",
    modes: ["public"],
  },
  {
    id: "pub-poultry-trial-status",
    label: "Poultry trial status",
    prompt:
      "What is the current status of the poultry trials? Please explain what can and cannot be said at this stage.",
    modes: ["public"],
  },
  {
    id: "pub-pricing",
    label: "Ask about pricing",
    prompt:
      "How should I go about getting pricing for Flufence for my farm?",
    modes: ["public"],
  },

  // INTERNAL MODE – staff-only, drafting emails/slides
  {
    id: "int-email-farmer-poultry",
    label: "Email to farmer (poultry)",
    prompt:
      "Draft a polite email to a farmer explaining that the poultry trial is still being analysed and we cannot make performance or disease-related claims yet.",
    modes: ["internal"],
  },
  {
    id: "int-mushroom-slide-summary",
    label: "Slide text – mushrooms",
    prompt:
      "Write a short slide summary for internal use describing the mushroom trial (House 18 vs House 20), including more stable environmental conditions and the caveat that no pathogen-specific claims can be made until sequencing is analysed.",
    modes: ["internal"],
  },
  {
    id: "int-board-update",
    label: "Board update prompt",
    prompt:
      "Draft a short internal summary for a board update that explains what Flufence does, highlights the mushroom trial observations, and clearly states that poultry trial results are still being analysed with no performance claims yet.",
    modes: ["internal"],
  },
  {
    id: "int-rd-tax-note",
    label: "R&D tax caveat note",
    prompt:
      "Draft a short internal note reminding the team that any references to R&D tax credits or incentives must be checked by a qualified advisor and that IlimexBot cannot determine eligibility.",
    modes: ["internal"],
  },
];

export const StarterPrompts: React.FC<StarterPromptsProps> = ({
  mode,
  onSelect,
  className = "",
}) => {
  const promptsForMode = STARTER_PROMPTS.filter((p) =>
    p.modes.includes(mode),
  );

  if (promptsForMode.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap gap-2 mt-3 text-sm ${className}`}
    >
      {promptsForMode.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.prompt)}
          className="rounded-full border px-3 py-1 hover:bg-gray-100 transition text-left"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
};
