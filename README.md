# Thinkers & Doers final video fix

Replace these files in GitHub:
- js/app.js
- js/contentful-config.js
- content.json

The new app:
- matches the target Latest Episode layout
- keeps the large left media panel + right content column
- reads Episode.video as a Contentful Asset
- opens the uploaded MP4 in a modal player
- keeps Guest fields from your current Guest model
- uses Contentful when enabled
- falls back to content.json

Important:
- The Contentful `video` field must be a single Media/Asset reference.
- The uploaded video asset must be published.
- Rotate the exposed Contentful Delivery API token before production.
