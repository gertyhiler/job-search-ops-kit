---
name: resume
description: Build or update the structured master resume (JSON) and render a polished PDF via Typst. Use when the user wants to edit their resume, create a variant, or produce a PDF to send.
---

# resume — master resume + PDF rendering

## Purpose

Maintain `data/resume/master-resume.json` (and variants) and render PDFs.

## When to use

Editing the resume, creating a role-specific variant, or producing a PDF.

## Inputs

- Existing `data/resume/master-resume.json` and `data/profile/*`.
- The user's edits / target role.

## Resume shape (JSON-Resume-ish)

`basics` (name, label, email, phone, location{city,countryCode}, summary, profiles[]),
`work[]` (company, position, startDate, endDate, location, highlights[]),
`skills[]` (name, keywords[]), `education[]`, `languages[]`, `projects[]`.

## Procedure

1. Read the current resume and the profile facts/evidence.
2. Apply the user's edits. Every bullet must trace to a real fact; if a strong case is in
   the profile but missing from the resume, propose adding it (it likely came from a
   `resume-gaps.md` suggestion produced by consolidation).
3. Write the JSON. For a variant, write `data/resume/variants/<name>.json`.
   (You may write resume JSON files directly since they are not memory; prefer keeping
   facts consistent with `experience-facts.md`.)
4. Render: `render_resume` (MCP) or `job-search resume render --variant <name>`. Confirm
   the PDF path and that Typst succeeded.

## Safety

Evidence policy. Never add unverifiable achievements or inflated titles/dates.

## Acceptance

Updated resume JSON renders to a clean PDF in `data/exports/resume/`.
