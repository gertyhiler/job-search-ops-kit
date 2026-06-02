---
id: ecommerce-performance
priority: 85
fallback: false
select:
  keywords:
    - { term: ecommerce, weight: 3 }
    - { term: e-commerce, weight: 3 }
    - { term: checkout, weight: 3 }
    - { term: next.js, weight: 3 }
    - { term: nextjs, weight: 3 }
    - { term: ssr, weight: 3 }
    - { term: high load, weight: 3 }
    - { term: rps, weight: 3 }
  useCases:
    ids: [UC-06, UC-07]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Специализируюсь на e-commerce frontend: Next.js SSR под нагрузкой, checkout/user journey и производительность на проде.

{{facts}}

Готов обсудить ваши задачи по масштабированию и конверсии.

{{candidate_name}}
{{contact_footer}}
