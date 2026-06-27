import { getGoogleAccessToken } from "./google_service_account.mjs";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

async function driveJson(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

export class GoogleDriveClient {
  constructor({ credentialsPath }) {
    this.credentialsPath = credentialsPath;
    this.token = null;
  }

  async accessToken() {
    if (!this.token) {
      this.token = await getGoogleAccessToken(this.credentialsPath, [DRIVE_SCOPE, SHEETS_SCOPE]);
    }
    return this.token;
  }

  async findSpreadsheetInFolder(folderId, name) {
    const token = await this.accessToken();
    const query = [
      `'${folderId}' in parents`,
      `name = '${String(name).replaceAll("'", "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.spreadsheet'",
      "trashed = false",
    ].join(" and ");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "files(id,name,webViewLink)");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    const data = await driveJson(token, url);
    return data.files?.[0] || null;
  }

  async createSpreadsheetInFolder(folderId, name) {
    const token = await this.accessToken();
    return driveJson(
      token,
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: [folderId],
        }),
      },
    );
  }

  async findOrCreateSpreadsheet(folderId, name) {
    return (
      (await this.findSpreadsheetInFolder(folderId, name)) ||
      this.createSpreadsheetInFolder(folderId, name)
    );
  }
}
