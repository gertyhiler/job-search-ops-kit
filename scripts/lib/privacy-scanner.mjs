const PATTERNS = [
  {
    id: "email",
    description: "email address",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  },
  {
    id: "hh-resume",
    description: "hh.ru resume URL or resume identifier",
    regex: /https?:\/\/[^"'`\s]*hh\.ru\/resume\/[^\s"'`]+|resume_id=[A-Za-z0-9_-]+/gi
  },
  {
    id: "absolute-path",
    description: "absolute user path",
    regex: /(?:^|[\s"'`])(\/Users\/[^\s"'`]+|[A-Za-z]:\\Users\\[^\s"'`]+)/g
  },
  {
    id: "secret-assignment",
    description: "secret-like assignment",
    regex: /\b(?:TOKEN|SECRET|PASSWORD|API_KEY|REFRESH_TOKEN|ACCESS_TOKEN)\b\s*[:=]\s*["']?([A-Za-z0-9_\-]{12,})/gi
  },
  {
    id: "openai-key",
    description: "OpenAI-style API key",
    regex: /\bsk-[A-Za-z0-9]{10,}\b/g
  }
];

function isAllowedPlaceholder(match) {
  return /replace-me|example|your_|dummy|placeholder|\$\{env:/i.test(match);
}

function scanPhones(text) {
  const findings = [];

  for (const match of text.matchAll(/(?:\+?\d[\d()\-\s]{8,}\d)/g)) {
    const value = match[0].trim();
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10) {
      continue;
    }
    if (!/[+\s()]/.test(value)) {
      continue;
    }

    findings.push({
      pattern: "phone",
      description: "phone number",
      match: value
    });
  }

  return findings;
}

export function scanText(text) {
  const findings = [...scanPhones(text)];

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0].trim();
      if (isAllowedPlaceholder(value)) {
        continue;
      }

      findings.push({
        pattern: pattern.id,
        description: pattern.description,
        match: value
      });
    }
  }

  return findings;
}
