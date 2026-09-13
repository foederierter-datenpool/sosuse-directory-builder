FROM eclipse-temurin:21-jre-jammy AS java
FROM node:24-bookworm-slim

COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/java/openjdk/bin:${PATH}"
ENV GIT_TERMINAL_PROMPT=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system user.name "Sosuse pipeline" \
    && git config --system user.email "sosuse-pipeline@users.noreply.github.com" \
    && mkdir /workspace \
    && chown node:node /workspace

USER node
WORKDIR /workspace
CMD ["sh", "-c", ": \"${GITHUB_PUSH_TOKEN:?Set GH_PAGES_TOKEN in Coolify runtime variables}\"; exec sleep infinity"]
