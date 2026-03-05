import crypto from "crypto";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function redactSnippet(text: string, maxLen = 120) {
  const s = String(text ?? "");

  const noEmails = s.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted-email]"
  );

  const noPhones = noEmails.replace(
    /(\+?\d[\d\s().-]{7,}\d)/g,
    "[redacted-phone]"
  );

  const compact = noPhones.replace(/\s+/g, " ").trim();
  return compact.slice(0, maxLen);
}

export function shouldSample(sampleRate: number, stableKey: string) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  const h = crypto.createHash("sha256").update(stableKey).digest();
  const bucket = h[0] / 255; // 0..1
  return bucket < sampleRate;
}