- **Add ten Indic locales**. Assamese (অসমীয়া), Hindi (हिन्दी), Tamil
  (தமிழ்), Telugu (తెలుగు), Gujarati (ગુજરાતી), Marathi (मराठी),
  Kannada (ಕನ್ನಡ), Malayalam (മലയാളം), Punjabi (ਪੰਜਾਬੀ), and Odia
  (ଓଡ଼ିଆ) are now selectable from the language picker. Translations
  are first-pass and would benefit from native-speaker review;
  technical loanwords (register, flag, byte, breakpoint) are kept in
  transliterated form, which matches how these languages handle
  programming jargon in practice. Numbers go through `toLocaleString`
  with the matching `xx-IN` tag. Urdu (RTL) is intentionally deferred
  — the layout doesn't yet handle right-to-left.
