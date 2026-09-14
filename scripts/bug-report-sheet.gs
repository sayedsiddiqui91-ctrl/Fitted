/* Google Apps Script for the "Report a bug" sheet.
   Extensions → Apps Script in the sheet, paste this, then Deploy → New deployment → Web app
   (Execute as: Me · Who has access: Anyone). Put the web-app URL in FITTED_BUG_SHEET_URL on Vercel.
   Columns written: Name · Feature with problem · Comment · Page · Browser · Time */
function doPost(e) {
  var row = JSON.parse(e.postData.contents).row;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
