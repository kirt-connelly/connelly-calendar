// ============================================================
//  CONNELLY FAMILY CALENDAR — CONFIGURATION
//  Edit this file to set your password and Google Calendar IDs
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  //  PASSWORD
  //  Change this to whatever your family will use to log in.
  //  This is a simple hashed password (SHA-256).
  //  To generate a new hash, visit: https://emn178.github.io/online-tools/sha256.html
  //  Default password is: connelly2026
  // ----------------------------------------------------------
  passwordHash: "5d5bddb577102d0a960bcf6fea9050c10fe5e9feddcb5c2170ccab872db9ee87",
  // NOTE: Replace the above hash with your own! The default above is a placeholder.
  // Steps:
  //   1. Go to https://emn178.github.io/online-tools/sha256.html
  //   2. Type your chosen password
  //   3. Copy the hash and paste it above

  // ----------------------------------------------------------
  //  CALENDARS
  //  For each calendar:
  //    name    — display name shown in the legend
  //    color   — dot and event color (hex)
  //    textColor — text on the event pill (should contrast with color)
  //    id      — your Google Calendar ID (see README for how to find it)
  // ----------------------------------------------------------
  calendars: [
    {
      name: "Family",
      color: "#639922",
      bgColor: "#c0dd97",
      textColor: "#27500a",
      id: "6pf29ltmva9512p5mbt889shgk@group.calendar.google.com"
    },
    {
      name: "Other",
      color: "#378add",
      bgColor: "#b5d4f4",
      textColor: "#0c447c",
      id: "kirt@connellyfamily.org"
    },
    {
      name: "Work",
      color: "#ef9f27",
      bgColor: "#fac775",
      textColor: "#633806",
      id: "jodie@connellyfamily.org"
    }
  ],

  // ----------------------------------------------------------
  //  SITE BRANDING  (optional tweaks)
  // ----------------------------------------------------------
  siteName: "Connelly Family Calendar",
  siteSubtitle: "connellyfamily.org",
  headerColor: "#1a3a2a"   // dark green header background

};
