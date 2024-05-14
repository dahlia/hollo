FROM docker.io/oven/bun:1.1.8-alpine

RUN apk add --no-cache jq

COPY bun.lockb package.json /app/
WORKDIR /app/
RUN bun install --frozen-lockfile --no-cache

COPY . /app/

ARG VERSION
RUN \
  if [ "$VERSION" != "" ]; then \
    jq --arg version "$VERSION" '.version = $version' package.json > .pkg.json \
    && mv .pkg.json package.json; \
  fi

CMD ["bun", "run", "prod"]
