---
id: fullstack-product
priority: 80
fallback: false
select:
  keywords:
    - { term: fullstack, weight: 3 }
    - { term: фулстек, weight: 3 }
    - { term: full-stack, weight: 3 }
    - { term: node, weight: 3 }
    - { term: backend, weight: 3 }
  useCases:
    ids: [UC-07, UC-08]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Frontend-heavy fullstack: React/TypeScript на клиенте, уверенная работа с API, доведение фич от постановки до релиза.

{{facts}}

Готов обсудить ваши задачи и формат сотрудничества.

{{candidate_name}}
{{contact_footer}}
