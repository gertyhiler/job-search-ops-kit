---
id: payments-integrations
priority: 75
fallback: false
select:
  keywords:
    - { term: payments, weight: 3 }
    - { term: payment, weight: 3 }
    - { term: платеж, weight: 3 }
    - { term: bff, weight: 3 }
    - { term: integrations, weight: 3 }
    - { term: интеграц, weight: 3 }
  useCases:
    ids: [UC-08]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Делаю frontend с упором на интеграции: BFF, платёжные сценарии, API и быстрый вывод новых методов в прод.

{{facts}}

Буду рад обсудить ваши интеграционные задачи.

{{candidate_name}}
{{contact_footer}}
