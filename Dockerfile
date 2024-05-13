FROM docker.io/oven/bun:1.1.8-alpine

COPY bun.lockb package.json /app/
WORKDIR /app/
RUN bun install --frozen-lockfile --no-cache

COPY . /app/

CMD ["bun", "run", "prod"]
