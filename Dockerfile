FROM beveradb/docker-apache-php7-fpm

# Download Ghostscript
WORKDIR /tmp
RUN curl -L https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs927/ghostscript-9.27-linux-x86_64.tgz --output gs.tgz
RUN tar zxvf gs.tgz
RUN mv ghostscript-9.27-linux-x86_64/gs-927-linux-x86_64 /usr/bin/gs

# Copy files to www-root

COPY index.php composer.json /var/www/html/

# Composer
RUN curl -sS https://getcomposer.org/installer | php \
    && mv composer.phar /usr/local/bin/composer \
    && chmod a+x /usr/local/bin/composer

RUN chmod u+w /var/www/html
RUN chown -R www-data:www-data /var/www/html/
RUN rm /var/www/html/index.html

WORKDIR /var/www/html
USER www-data
RUN composer --no-cache update

USER root
