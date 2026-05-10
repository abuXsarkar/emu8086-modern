- **Classroom mode P6: Docker self-host**. New
  `packages/classroom-server/Dockerfile` builds a tiny Node + ws
  image (~110 MB on alpine) that serves the WebSocket relay on
  port 8787 with a `/healthz` endpoint and an unprivileged user.
  A workspace-root `docker-compose.yml` brings up the IDE and the
  classroom service together; the IDE remains usable standalone if
  the classroom container is skipped. README quickstart updated
  with the `openssl rand -base64 32` HMAC-secret recipe.
