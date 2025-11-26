// src/components/ChatWidget/StarterPrompts.tsx

"use client";

import React from "react";

type StarterPromptsVariant = "public" | "internal";

interface StarterPromptsProps {
  variant?: StarterPromptsVariant;
  onSelectPrompt: (prompt: string) => void;
}

const PUBLIC_STARTER_PROMPTS: string[] = [
  "How does Flufence work?",
  "What did your poultry trials find?",
  "Tell me about Ilimex as a company.",
  "How can Flufence support biosecurity on my farm?",
  "Is UVC safe for poultry or mushrooms?",
  "How do I get in touch with the Ilimex team?",
];

const INTERNAL_STARTER_PROMPTS: string[] = [
  "Draft an email explaining our poultry trial results to a farmer.",
  "Summarise the mushroom House 18 vs House 20 trial in bullet points.",
  "Rewrite this technical paragraph in simple language for a brochure.",
  "Prepare talking points for a meeting with an integrator.",
  "Create a script for a 5-minute presentation on Flufence.",
  "Draft a website section introducing Flufence to poultry producers.",
];

export const StarterPrompts: React.FC<StarterPromptsProps> = ({
  variant = "public",
  onSelectPrompt,
}) => {
  const prompts =
    variant === "internal" ? INTERNAL_STARTER_PROMPTS : PUBLIC_STARTER_PROMPTS;

  if (!prompts.length) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelectPrompt(prompt)}
          className="rounded-full border px-3 py-1 text-xs md:text-sm shadow-sm hover:bg-gray-100 transition"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
};

export default StarterPrompts;
