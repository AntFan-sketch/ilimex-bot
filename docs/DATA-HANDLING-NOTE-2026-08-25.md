# IlimexBot Data Handling Note — 25 August 2026

This note documents the intended data flow after the August 2026 hardening pass. It is an engineering description, not legal advice.

## Public chat

- The browser sends recent conversation messages and a random conversation ID to `/api/chat-public`.
- The server uses the curated public Ilimex knowledge layer and the configured OpenAI model to answer.
- IP address and user-agent are hashed server-side for rate-limiting purposes; raw values are not intentionally written to the CRM.
- Anonymous chat does not create a CRM lead record and does not send lead-alert emails.
- If analytics are enabled, sampled short snippets may be stored after common email/phone patterns are redacted. Analytics are disabled by default in `.env.example`.

## Enquiry form

- The visitor explicitly supplies name, email, location and a message; phone and site details are optional.
- Recent chat context is included in the enquiry email, with message count/content capped.
- After email delivery succeeds, the application attempts to create/update a CRM record containing the submitted contact details and lead metadata.
- CRM persistence is best-effort. A CRM outage does not convert a successfully delivered enquiry email into a visitor-facing failure.

## Internal bot and uploads

- Internal chat, upload, CRM and evaluation endpoints require the server-side `ADMIN_DASH_TOKEN`.
- The token is not compiled into the application with a `NEXT_PUBLIC_` variable. The current UI keeps it in browser session storage after the authorised user enters it.
- Uploads are restricted to PDF/DOCX/TXT/MD, 10 MB maximum. Extracted text is capped at 300,000 characters.
- Uploaded internal text may be sent to the configured OpenAI API as model context. Staff should upload only material Ilimex is authorised to process through that service.

## Recommended governance

- Keep `ILIMEX_ANALYTICS_ENABLED=false` unless analytics are actively required.
- Define a retention period for CRM enquiries and any enabled chatbot analytics.
- Ensure the website privacy notice describes chatbot/enquiry processing and any third-party processor use.
- Replace the shared admin token with managed staff authentication/SSO if internal access expands beyond a very small trusted group.
