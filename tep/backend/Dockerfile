FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget unzip nodejs npm

ARG PB_VERSION=0.22.14

RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -O /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /pb/ && \
    rm /tmp/pb.zip && \
    chmod +x /pb/pocketbase

COPY pb_hooks/     /pb/pb_hooks/
COPY pb_migrations/ /pb/pb_migrations/
COPY start.sh      /pb/start.sh
RUN chmod +x /pb/start.sh

# Internal DOCX generation service (real OOXML .docx via the `docx` npm
# package). Only listens on 127.0.0.1 -- never reachable from outside the
# container. PocketBase's pb_hooks/main.pb.js is the single public proxy
# to it (see the /api/docx/generate route).
COPY docx-service/package.json docx-service/package-lock.json /docx-service/
RUN cd /docx-service && npm install --omit=dev --no-audit --no-fund
COPY docx-service/server.js /docx-service/server.js
COPY docx-service/lib/      /docx-service/lib/

EXPOSE 8090

CMD ["/pb/start.sh"]
