FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget unzip

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

EXPOSE 8090

CMD ["/pb/start.sh"]
