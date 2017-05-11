# This file is for first-time API server setup. Run from your personal machine.

scp -i ~/.ssh/staging.pem ./config/aws.json ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/config
scp -i ~/.ssh/staging.pem ./config/picasso.json ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/config

# Upload staging.pem
scp -i ~/.ssh/staging.pem ~/.ssh/staging.pem qa-instance-coordinator1.vpcstaging:/home/ubuntu/.ssh/staging.pem
