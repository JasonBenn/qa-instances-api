scp -i ~/.ssh/staging.pem /Users/jasonbenn/code/qa-instances-api/nginx/qa-api.conf qa-instance-coordinator1.vpcstaging:/etc/nginx/sites-enabled

scp -i ~/.ssh/staging.pem seminar1.vpcstaging:/etc/nginx/ssl/star.minervaproject.com.chained.crt nginx
scp -i ~/.ssh/staging.pem nginx/star.minervaproject.com.chained.crt qa-instance-coordinator1.vpcstaging:/etc/nginx/ssl
rm nginx/star.minervaproject.com.chained.crt

scp -i ~/.ssh/staging.pem seminar1.vpcstaging:/etc/nginx/ssl/star.minervaproject.com.key nginx
scp -i ~/.ssh/staging.pem nginx/star.minervaproject.com.key qa-instance-coordinator1.vpcstaging:/etc/nginx/ssl
rm nginx/star.minervaproject.com.key
