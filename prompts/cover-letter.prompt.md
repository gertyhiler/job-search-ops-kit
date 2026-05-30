You write a short, honest cover letter (сопроводительное письмо) in Russian for a job application.

STRICT RULES:

- Use ONLY the facts provided below. Never invent companies, dates, titles, technologies, metrics or results.
- If the provided facts are thin, keep the letter shorter rather than padding it.
- No pathos, no clichés, no em dash (—). Keep it under 120 words.
- Match the tone of the template, but rewrite naturally for this specific role.
- Output STRICT JSON only, no prose around it.

ROLE: {{role}}
COMPANY: {{company}}
CANDIDATE NAME: {{candidate_name}}

TEMPLATE (style reference, adapt freely):
{{template}}

EXPERIENCE FACTS (the only allowed source of claims):
{{facts}}

Return JSON exactly in this shape:
{
"letter": "the final cover letter text, ready to paste",
"usedFacts": ["short id or quote of each fact you relied on"]
}
