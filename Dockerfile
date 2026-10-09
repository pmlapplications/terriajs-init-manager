# Builds the frontend and the documentation, and runs the API server, which
# also serves dist/ and the docs.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim AS docs
WORKDIR /app
COPY docs/requirements.txt docs/
RUN pip install --no-cache-dir -r docs/requirements.txt
# conf.py reads the version from package.json; the changelog page includes CHANGELOG.md.
COPY package.json CHANGELOG.md ./
COPY docs ./docs
RUN sphinx-build -W --keep-going -b html docs docs/_build/html

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DOCS_DIR=/app/docs-html
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
COPY --from=docs /app/docs/_build/html ./docs-html
# Init files written from the editor; served at /config. Mount a volume here to keep them.
RUN mkdir config && chown node:node config
USER node
EXPOSE 3000
CMD ["node", "server/index.ts"]
