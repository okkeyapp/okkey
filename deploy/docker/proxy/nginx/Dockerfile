# Edge nginx linked against OpenSSL ≥ 3.5 (X25519MLKEM768).
# Build context: deploy/docker/proxy/nginx

FROM debian:bookworm-slim AS build

ARG OPENSSL_VERSION=3.5.0
ARG NGINX_VERSION=1.28.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    libpcre3-dev \
    zlib1g-dev \
    perl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src

RUN curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" \
    | tar xz \
  && curl -fsSL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" \
    | tar xz

WORKDIR /src/openssl-${OPENSSL_VERSION}
RUN ./Configure --prefix=/usr/local/openssl --openssldir=/usr/local/openssl \
      shared zlib no-docs \
  && make -j"$(nproc)" \
  && make install_sw

WORKDIR /src/nginx-${NGINX_VERSION}
RUN ./configure \
      --prefix=/etc/nginx \
      --sbin-path=/usr/sbin/nginx \
      --modules-path=/usr/lib/nginx/modules \
      --conf-path=/etc/nginx/nginx.conf \
      --error-log-path=/var/log/nginx/error.log \
      --http-log-path=/var/log/nginx/access.log \
      --pid-path=/var/run/nginx.pid \
      --lock-path=/var/run/nginx.lock \
      --http-client-body-temp-path=/var/cache/nginx/client_temp \
      --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
      --with-cc-opt="-I/usr/local/openssl/include" \
      --with-ld-opt="-L/usr/local/openssl/lib -Wl,-rpath,/usr/local/openssl/lib" \
      --with-openssl=/src/openssl-${OPENSSL_VERSION} \
      --with-http_ssl_module \
      --with-http_v2_module \
      --with-http_realip_module \
      --without-http_autoindex_module \
      --without-http_ssi_module \
  && make -j"$(nproc)" \
  && make install

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    gettext-base \
    libpcre3 \
    zlib1g \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /etc/nginx/templates /etc/nginx/certs

COPY --from=build /usr/sbin/nginx /usr/sbin/nginx
COPY --from=build /usr/local/openssl /usr/local/openssl
COPY --from=build /etc/nginx /etc/nginx

ENV LD_LIBRARY_PATH=/usr/local/openssl/lib:/usr/local/openssl/lib64
ENV PATH="/usr/local/openssl/bin:${PATH}"

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/okkey.conf.template /etc/nginx/templates/okkey.conf.template
COPY conf.d/okkey-compat.conf.template /etc/nginx/templates/okkey-compat.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
  && /usr/local/openssl/bin/openssl version \
  && nginx -V

# 8443 = default OKKEY_COMPAT_HTTPS_PORT (classical compat; not used when compat off).
EXPOSE 80 443 8443
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
