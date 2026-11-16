# Gmail Job Application Tracker

A Google Apps Script project that searches Gmail for likely job application confirmation emails and records them in a Google Sheets tracker.

> **Status: working prototype.** The basic import has successfully written records in batches of 10. The full six-year historical backfill, broader search coverage, extraction accuracy, and daily automation still need to be validated.

## What it does

- Searches Gmail for likely application-related messages.
- Reads message metadata and available plain-text MIME body parts through the Gmail API.
- Adds records to a Google Sheet.
- Uses the Gmail message ID to avoid duplicate imports.
- Processes messages in small batches to reduce Gmail API quota pressure.
- Uses read-only Gmail access; sending or deleting messages is not required.

## Spreadsheet columns

Create a Google Sheet named `Job Application Tracker` with a worksheet named `Applications`. Put these headers in row 1, in this exact order:

| Column | Header |
|---|---|
| A | Email ID |
| B | Application Date |
| C | Company |
| D | Position |
| E | Source |
| F | Status |
| G | Last Communication |
| H | Email Subject |

The following fields were intentionally removed from the requested layout: Job URL, Contact Person, Contact Email, Location, and Follow-up Date.

## Architecture

```text
Gmail inbox
   │ Gmail search + Gmail API (read-only)
   ▼
Google Apps Script
   │ parse headers/body, deduplicate by message ID
   ▼
Google Sheets / Applications
```

## Requirements

- A Google account with Gmail and Google Sheets.
- A Google Sheet called `Job Application Tracker`.
- Google Apps Script attached to that spreadsheet.
- The Advanced Gmail service enabled in Apps Script (Gmail API v1).
- Gmail API enabled in the associated Google Cloud project if prompted.

## OAuth scopes

The intended scopes are:

```json
[
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets.currentonly"
]
```

The first permits reading Gmail messages. The second limits spreadsheet access to the current spreadsheet. Review the Apps Script manifest and authorization screen carefully. Do not approve Gmail send, compose, modify, or delete permissions for this read-only importer.

## Setup

1. Create the spreadsheet and `Applications` worksheet.
2. Add the eight headers listed above in row 1.
3. Open **Extensions → Apps Script** from the spreadsheet.
4. In Apps Script, open **Services** and add **Gmail API** (version v1).
5. Enable the Gmail API in the linked Google Cloud project if Google prompts you.
6. Add the Apps Script source and manifest. The importer relies on helper functions such as `getEmailBody`, `extractCompany`, and `extractPosition`; make sure all referenced functions are present.
7. Save and run `importJobApplications`.
8. Review the authorization scopes and grant only the required read-only/current-spreadsheet access.

## Six-year historical import

The requested target is the rolling last six years. For example, on 16 November 2026, the target starts around 16 November 2020.

A Gmail query can include:

```javascript
const query =
  'newer_than:6y {subject:application subject:applied "thank you for applying" "application received"}';
```

The importer was configured to process up to 10 messages per execution because larger/faster batches previously triggered Gmail API quota errors. A saved page token in Apps Script Properties allows the import to continue on later runs.

### Important pagination precautions

- Do not change the Gmail query while a paginated import is in progress.
- Continue running the importer until it reports that the historical import is complete.
- Verify the oldest date in the sheet; seeing only 2026 dates in early batches is expected because Gmail search results are generally newest-first.
- If changing the query after an import has started, deliberately reset the saved page token and completion flag so the new search starts from the beginning.
- Keep the existing-ID check. It protects against duplicate rows when restarting a search.
- If a quota error occurs, wait before retrying.
- Do not delete imported rows merely to restart pagination.

The current query is only a first-pass filter. It searches a limited set of subject phrases and may miss application confirmations with different wording.

## Current extraction behavior

| Field | Current method | Limitation |
|---|---|---|
| Application Date | Gmail internal message timestamp | Usually reflects when the email arrived, not necessarily the exact application submission time. |
| Company | Sender domain | May identify an ATS vendor such as Workday or Greenhouse instead of the employer. |
| Position | Subject-line pattern matching | Often misses titles embedded in the email body. |
| Source | Detects “LinkedIn” in sender/content | Other job boards and ATS providers may be classified as Company / Other. |
| Status | Fixed initial value | Does not yet detect interviews, rejections, or offers. |
| Last Communication | Initially same as message date | Does not yet consolidate a complete email thread. |

Some emails are HTML-only or have nested MIME structures. The body parser should handle missing parts safely and may need an HTML-to-text fallback for better extraction.

## Known limitations

1. **Incomplete search coverage:** only a small set of subject phrases is searched. Expand and test the query against real confirmation examples.
2. **Heuristic extraction:** company and position fields are best-effort and require review.
3. **Message-level records:** multiple messages in one application thread can be recorded separately unless thread-level grouping is added.
4. **Quota constraints:** a large historical search can require many executions.
5. **No daily trigger yet:** scheduled automatic imports are a planned improvement, not part of the validated prototype.
6. **No lifecycle detection yet:** interview invitations, rejections, offers, and follow-up status changes are not currently classified.

## Roadmap

- [ ] Complete and verify the six-year historical backfill.
- [ ] Expand Gmail search terms and sender patterns.
- [ ] Improve MIME parsing and support HTML-only messages.
- [ ] Extract actual employer and role from common ATS templates.
- [ ] Group related messages by Gmail thread.
- [ ] Detect interview, rejection, and offer messages.
- [ ] Add a daily time-driven trigger.
- [ ] Add error handling and a clear import-progress summary.

## Privacy and repository hygiene

This project processes private email. When publishing to GitHub:

- Never commit spreadsheet exports or real application records.
- Never publish email bodies, addresses, message IDs, access tokens, or personal execution logs.
- Do not include OAuth credentials or account-specific configuration.
- Consider adding a license before accepting reuse or contributions.

Suggested repository layout:

```text
gmail-job-application-tracker/
├── README.md
├── index.html
├── styles.css
├── apps-script/
│   ├── Code.gs
│   └── appsscript.json
└── LICENSE
```

The Apps Script source and manifest should be added after removing account-specific information and testing the final version.

## Project report

See [`index.html`](index.html) for the formatted project report. It can be published with GitHub Pages.
