
/**
 * Gmail Job Application Tracker
 *
 * Imports job application notification emails from Gmail
 * into a Google Spreadsheet.
 *
 * Features:
 * - Six-year historical email search
 * - Gmail API read-only access
 * - Batch processing and pagination
 * - Duplicate email detection
 * - Basic company and position extraction
 *
 * Required Google services:
 * - Gmail API v1
 *
 * Required OAuth scopes:
 * - gmail.readonly
 * - spreadsheets.currentonly
 */

const SHEET_NAME = "Applications";
const BATCH_SIZE = 10;
const IMPORT_COMPLETE_KEY = "JOB_APPLICATION_IMPORT_COMPLETE";
const PAGE_TOKEN_KEY = "JOB_APPLICATION_PAGE_TOKEN";


/**
 * Main import function.
 */
function importJobApplications() {

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("No active spreadsheet found.");
  }

  const sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error("Applications sheet not found.");
  }

  const props = PropertiesService.getScriptProperties();

  // Stop if historical import has already completed.
  if (props.getProperty(IMPORT_COMPLETE_KEY) === "true") {
    Logger.log("Historical import is already complete.");
    return;
  }

  // Search emails from the last six years.
  const query =
    'newer_than:6y {subject:application subject:applied "thank you for applying" "application received"}';

  // Read existing Gmail message IDs to prevent duplicates.
  const lastRow = sheet.getLastRow();

  const existingIds = new Set(
    lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 1)
          .getValues()
          .flat()
          .map(String)
      : []
  );

  // Resume from the previously saved page.
  const pageToken = props.getProperty(PAGE_TOKEN_KEY);

  const options = {
    q: query,
    maxResults: BATCH_SIZE
  };

  if (pageToken) {
    options.pageToken = pageToken;
  }

  const response = Gmail.Users.Messages.list("me", options);
  const messages = response.messages || [];

  let rows = [];
  let pageSuccessful = true;

  for (const item of messages) {

    if (existingIds.has(item.id)) {
      continue;
    }

    try {

      const msg = Gmail.Users.Messages.get("me", item.id, {
        format: "full"
      });

      const headers = msg.payload.headers || [];

      const getHeader = name => {
        const header = headers.find(
          item => item.name.toLowerCase() === name.toLowerCase()
        );

        return header ? header.value : "";
      };

      const subject = getHeader("Subject");
      const sender = getHeader("From");

      const date = new Date(Number(msg.internalDate));

      const body = getEmailBody(msg.payload);
      const content = subject + "\n" + body;

      const company = extractCompany(sender);
      const position = extractPosition(subject);

      const source = /linkedin/i.test(sender + content)
        ? "LinkedIn"
        : "Company / Other";

      rows.push([
        item.id,
        date,
        company,
        position,
        source,
        "Applied - needs review",
        date,
        subject
      ]);

      existingIds.add(item.id);

      // Reduce Gmail API quota pressure.
      Utilities.sleep(300);

    } catch (error) {

      Logger.log(
        "Could not process an email: " + error.message
      );

      pageSuccessful = false;
      break;
    }
  }

  // Write successfully processed emails.
  if (rows.length > 0) {

    sheet.getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      8
    ).setValues(rows);

  }

  // Advance pagination only after successful processing.
  if (pageSuccessful) {

    if (response.nextPageToken) {

      props.setProperty(
        PAGE_TOKEN_KEY,
        response.nextPageToken
      );

      Logger.log(
        "Imported " + rows.length +
        " emails. Run again for the next batch."
      );

    } else {

      props.deleteProperty(PAGE_TOKEN_KEY);
      props.setProperty(IMPORT_COMPLETE_KEY, "true");

      Logger.log(
        "Imported " + rows.length +
        " emails. Historical import complete!"
      );

    }

  } else {

    Logger.log(
      "Batch interrupted. Run again to retry."
    );

  }
}


/**
 * Extracts and decodes email content recursively.
 */
function getEmailBody(part) {

  if (!part) {
    return "";
  }

  let result = "";

  const data = part.body && part.body.data;

  if (
    typeof data === "string" &&
    data.length > 0
  ) {

    try {

      const decoded = Utilities.base64DecodeWebSafe(data);

      result += Utilities.newBlob(decoded)
        .getDataAsString("UTF-8");

    } catch (error) {

      Logger.log(
        "Skipping unreadable email content."
      );

    }
  }

  if (Array.isArray(part.parts)) {

    part.parts.forEach(child => {
      result += "\n" + getEmailBody(child);
    });

  }

  return result;
}


/**
 * Extracts a company name from the sender's email domain.
 */
function extractCompany(sender) {

  const match = sender.match(/@([^>\s]+)/i);

  if (!match) {
    return "Unknown";
  }

  const domain = match[1].toLowerCase();

  const commonPlatforms =
    /linkedin|gmail|googlemail|indeed|workday|greenhouse/;

  if (commonPlatforms.test(domain)) {
    return "Needs review";
  }

  const name = domain.split(".")[0];

  return name.charAt(0).toUpperCase() + name.slice(1);
}


/**
 * Extracts a job position from the email subject.
 */
function extractPosition(subject) {

  const patterns = [
    /application for (?:the position of )?(.+)/i,
    /applied for (.+)/i,
    /application received[:\s-]+(.+)/i
  ];

  for (const pattern of patterns) {

    const match = subject.match(pattern);

    if (match) {
      return match[1].trim();
    }

  }

  return "Needs review";
}
