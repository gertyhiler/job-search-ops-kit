/**
 * HH.ru selectors and detection texts. Text-based locators are more resilient
 * than CSS, but markup changes happen; on mismatch we classify selector_broken
 * and route to the playwright-repair queue rather than guessing.
 */
export const HH = {
  respondButton: [
    '[data-qa="vacancy-response-link-top"]',
    '[data-qa="vacancy-response-link-bottom"]',
  ],
  respondButtonText: ["Откликнуться", "Откликнуться на вакансию"],
  alreadyAppliedText: [
    "Вы откликнулись",
    "Резюме отправлено",
    "Отклик отправлен",
  ],
  loginText: ["Войти", "Вход", "Авторизуйтесь"],
  authCookieName: "hhtoken",
  coverLetterToggleText: [
    "Сопроводительное письмо",
    "Добавить сопроводительное",
  ],
  coverLetterTextarea: [
    '[data-qa="vacancy-response-popup-form-letter-input"]',
    'textarea[name="text"]',
  ],
  submitButton: [
    '[data-qa="vacancy-response-submit-popup"]',
    '[data-qa="vacancy-response-letter-submit"]',
  ],
  submitButtonText: ["Откликнуться", "Отправить"],
  successText: ["Резюме доставлено", "Вы откликнулись", "Отклик доставлен"],
  questionnaireText: [
    "Заполните анкету",
    "ответьте на вопрос",
    "обязательные вопросы",
    "Тестовое задание",
  ],
  resumeChooserText: ["Выберите резюме", "Какое резюме отправить"],
  captchaText: [
    "captcha",
    "Подтвердите, что вы не робот",
    "необычная активность",
  ],
};
