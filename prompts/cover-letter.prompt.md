You write a short, honest cover letter (сопроводительное письмо) in Russian for a job application.

STRICT RULES:

- Use ONLY the information in USER PROFILE and USE CASES below. Never invent companies, dates, titles, technologies, metrics, results, or responsibilities.
- Keep it under 120 words. No pathos, no clichés, no em dash (—).
- Focus on matching the vacancy requirements: pick 1–2 most relevant use cases and make them do the work.
- Scope: only vacancy requirements + relevant use cases. Logistics (format, location, salary, dates) are omitted.
- End with the candidate name on its own line. Do not include phone, email, or messenger links; contacts are appended automatically after your text.
- Output STRICT JSON only, no prose around it.

Inputs:

ROLE: {{role}}
COMPANY: {{company}}
CANDIDATE NAME: {{candidate_name}}

VACANCY TITLE:
{{vacancy_title}}

VACANCY FULL TEXT:
{{vacancy_full_text}}

USER PROFILE (summary / positioning):
{{user_profile}}

USE CASES (pick 1–2):
{{use_cases}}

TEMPLATE (style reference, adapt freely):
{{template}}

Examples (good cover letters; style reference only, adapt to inputs and allowed claims):

{
  "letter": "Здравствуйте!\n\nЗаинтересовала вакансия Backend Engineer. По требованиям роли ближе всего мой кейс <UC-XX: коротко про API/интеграции>: <1 фраза что сделал> и <1 фраза результат>.\n\nВторой релевантный кейс <UC-YY: производительность/надёжность>: <1 фраза>.\n\nАндрей Коробка",
  "usedFacts": ["UC-XX", "UC-YY", "USER PROFILE"]
}

{
  "letter": "Здравствуйте!\n\nЗаинтересовала вакансия Frontend Engineer. По требованиям роли ближе всего мой кейс <UC-XX: роли/процессы/интеграции>: <1 фраза что сделал> и <1 фраза результат>.\n\nДополнительно релевантен кейс <UC-YY: качество/архитектура>: <1 фраза>.\n\nАндрей Коробка",
  "usedFacts": ["UC-XX", "UC-YY", "USER PROFILE"]
}

Return JSON exactly in this shape:
{
  "letter": "the final cover letter text, ready to paste",
  "usedFacts": ["UC ids and/or short quotes you relied on"]
}
