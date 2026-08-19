# Contentful setup

## Episode content type
- title — Short text
- episodeNumber — Integer
- status — Short text/dropdown: latest, upcoming, archive
- format — Short text
- durationMinutes — Integer
- description — Long text
- watchUrl — Short text
- stillImage — Media (one image)
- guests — References (many) → Guest

## Guest content type
- name — Short text
- role — Short text
- company — Short text
- image — Media (one image)

Keep exactly one episode as `latest` in normal use.
