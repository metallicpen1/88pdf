# 88pdf

**88pdf** is a Chrome Extension that lets you search for text across all open PDFs simultaneously .
## Features

- **Global PDF Search:** Search through all open PDF tabs at once.
- **Side Panel Interface:** Keep your results visible while you browse.
- **Deep Linking:** Click a result to jump to the exact page in the target PDF.
- **Smart Caching:** Uses IndexedDB to make subsequent searches nearly instantaneous.
- **Offscreen Processing:** Uses the Chrome Offscreen API for high-performance parsing.

## Installation (Development Mode)

1. Clone or download this repository.
2. Ensure [PDF.js](https://mozilla.github.io/pdf.js/) files are in `lib/pdfjs/`.
3. Go to `chrome://extensions/` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extension folder.

##  Usage

1. Open PDF file(s) via Google Chrome.
2. Click the **88pdf** icon to open the Side Panel.
3. **Note:** For local `file://` URLs, enable **"Allow access to file URLs"** in the extension settings.
4. Enter your search query and press Enter.

## ⚖️ License

Copyright © 2026 **88tools** ([88tools.net](https://88tools.net))

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

### Commercial Use Prohibited
This license allows for personal, educational, and research use. **Commercial use, including selling this software, using it for-profit, or bundling it with paid products, is strictly prohibited.**

### Permitted Use
- **Personal Use:** Hobby projects, personal study, and private entertainment.
- **Noncommercial Organizations:** Use by schools, charities, public research, and government institutions is permitted.

---
*Note: This project includes PDF.js, which is licensed under the Apache License 2.0. The non-commercial restriction applies to the unique integration logic, UI, and branding of 88pdf.*
