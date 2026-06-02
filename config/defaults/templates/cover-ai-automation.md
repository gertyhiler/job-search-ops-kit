---
id: ai-automation
priority: 90
fallback: false
select:
  keywords:
    - { term: ai, weight: 3 }
    - { term: automation, weight: 3 }
    - { term: автоматиз, weight: 3 }
    - { term: llm, weight: 3 }
    - { term: ml, weight: 3 }
  useCases:
    ids: [UC-05]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Совмещаю продуктовый frontend на React/TypeScript с автоматизацией процессов и внедрением AI-инструментов в разработку.

{{facts}}

Буду рад рассказать подробнее и обсудить ваши задачи.

{{candidate_name}}
{{contact_footer}}
