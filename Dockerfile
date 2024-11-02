FROM docker.io/oven/bun:1.1.32-alpine

LABEL org.opencontainers.image.title="Hollo"
LABEL org.opencontainers.image.description="Federated single-user \
microblogging software"
LABEL org.opencontainers.image.url="https://docs.hollo.social/"
LABEL org.opencontainers.image.source="https://github.com/dahlia/hollo"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"

RUN apk add --no-cache ffmpeg jq libstdc++

COPY bun.lockb package.json /app/
WORKDIR /app/
RUN bun install --frozen-lockfile --no-cache

COPY . /app/

ARG VERSION
LABEL org.opencontainers.image.version="${VERSION}"
RUN \
  if [ "$VERSION" != "" ]; then \
    jq --arg version "$VERSION" '.version = $version' package.json > .pkg.json \
    && mv .pkg.json package.json; \
  fi

ENV LISTEN_PORT=3000
EXPOSE 3000
CMD ["bun", "run", "prod"]
