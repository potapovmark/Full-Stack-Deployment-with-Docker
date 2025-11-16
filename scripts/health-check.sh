#!/bin/sh
set -e
docker-compose ps
curl -f http://localhost/health || exit 1
curl -f http://localhost/api/health || exit 1
curl -f http://localhost/nginx-status || exit 1


