# Thinkers & Doers — S3 + Contentful

This package converts the uploaded bundled HTML into a normal static website suitable for Amazon S3. The visual design is retained, while Latest / Upcoming / Archive episodes are rendered from Contentful.

## Contentful
Create `episode` and `guest` content types using `CONTENTFUL-FIELDS.md`. In `js/contentful-config.js`, set `spaceId`, `environment`, `deliveryToken`, and `enabled: true`. Use a read-only Content Delivery API token — never a Content Management API token.

## S3
Upload the entire folder to S3, preserving `index.html`, `css/`, `js/`, `assets/`, and `content.json`. For production, use CloudFront in front of S3.

## Local test
Run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`.

## Editing episodes
After Contentful is connected, you do not edit episode HTML. Add/edit/publish Episode entries in Contentful. The page automatically puts them into Latest, Upcoming, or Archive based on the `status` field.

The `content.json` file is a local fallback so the page also works before Contentful is configured.
