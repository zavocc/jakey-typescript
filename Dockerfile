FROM node:25-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Create user jakeybot with UID 1000, and directory /jakeybot
RUN useradd -u 1000 -m -d /jakeybot jakeybot
USER jakeybot

# Set the working directory to /jakeybot and copy the project files there
WORKDIR /jakeybot
COPY --chown=1000:1000 . /jakeybot

# Install production deps, separate from building process
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Install build deps and build
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /jakeybot/node_modules /jakeybot/node_modules
COPY --from=build /jakeybot/dist /jakeybot/dist
ENTRYPOINT [ "pnpm", "start" ]