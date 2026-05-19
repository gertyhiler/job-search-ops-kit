export interface PrivacyFinding {
  pattern: string;
  description: string;
  match: string;
}

export function scanText(text: string): PrivacyFinding[];
