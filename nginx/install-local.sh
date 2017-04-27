DEFAULT_NGINX_SSL_DIR=/etc/nginx/ssl
mkdir -p $DEFAULT_NGINX_SSL_DIR

DEFAULT_NGINX_DIR=/usr/local/etc/nginx/
cp `pwd`/nginx/qa-api.conf $DEFAULT_NGINX_DIR/sites-enabled/

scp -i ~/.ssh/staging.pem seminar1.vpcstaging:/etc/nginx/ssl/star.minervaproject.com.chained.crt $DEFAULT_NGINX_SSL_DIR
scp -i ~/.ssh/staging.pem seminar1.vpcstaging:/etc/nginx/ssl/star.minervaproject.com.key $DEFAULT_NGINX_SSL_DIR

echo "127.0.0.1 qa-instance-coordinator-local.minervaproject.com" >> /etc/hosts