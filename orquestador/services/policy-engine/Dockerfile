# OPA standalone. Las políticas se montan como volumen en docker-compose.
FROM openpolicyagent/opa:0.68.0-rootless
COPY policies /policies
COPY data /data
EXPOSE 8181
ENTRYPOINT ["/opa"]
CMD ["run", "--server", "--addr=0.0.0.0:8181", "/policies", "/data"]
