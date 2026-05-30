export interface WeightedKeyword {
  kw: string;
  w: number;
}

export const POSITIVE_KEYWORDS: WeightedKeyword[] = [
  { kw: "react", w: 18 },
  { kw: "typescript", w: 16 },
  { kw: "next", w: 8 },
  { kw: "frontend", w: 14 },
  { kw: "фронтенд", w: 14 },
  { kw: "архитектур", w: 6 },
  { kw: "admin", w: 5 },
  { kw: "админ", w: 5 },
  { kw: "форм", w: 3 },
  { kw: "cms", w: 4 },
  { kw: "sso", w: 4 },
  { kw: "keycloak", w: 4 },
  { kw: "analytics", w: 3 },
  { kw: "аналитик", w: 3 },
  { kw: "payment", w: 3 },
  { kw: "платеж", w: 3 },
  { kw: "product", w: 4 },
  { kw: "продукт", w: 4 },
  { kw: "automation", w: 3 },
  { kw: "feature flag", w: 2 },
];

export const RISK_KEYWORDS: WeightedKeyword[] = [
  { kw: "gambling", w: 60 },
  { kw: "casino", w: 60 },
  { kw: "ставк", w: 40 },
  { kw: "букмекер", w: 50 },
  { kw: "betting", w: 60 },
  { kw: "adult", w: 60 },
  { kw: "18+", w: 30 },
  { kw: "crypto", w: 20 },
  { kw: "крипт", w: 20 },
  { kw: "тестовое задание", w: 15 },
  { kw: "test assignment", w: 15 },
];

export const SENSITIVE_KEYWORDS: string[] = [
  "релокац",
  "relocation",
  "гражданств",
  "citizenship",
  "виза",
  "visa",
  "переезд",
];

export const MISMATCH_KEYWORDS: string[] = [
  "1с",
  "1c",
  "битрикс",
  "bitrix",
  "qa",
  "тестировщик",
  "devops",
];
