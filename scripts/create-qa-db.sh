# dbName env is set by calling script.

echo """
CREATE DATABASE IF NOT EXISTS ${dbName};
GRANT ALL PRIVILEGES ON ${dbName}.* TO 'minerva_seminar'@'%';
""" | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G
echo -n "Created DB, granted permissions" 1>&2

# # To test the staging server:
# echo """
# SHOW DATABASES;
# DROP DATABASE ${dbName};
# """ | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G

# # To test tables on actual db:
# echo "SHOW TABLES;" | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName

# AWS credentials are stored in ~/.aws/
latestBackupName=`aws s3 ls s3://seminar-backups | egrep seminar-mke | tail -n1 | awk '{print $4}'`
dbDownloadDir=/tmp/db-backups
dbFilename=$dbDownloadDir/$latestBackupName
# IF file doesn't exist
if [ ! -f $dbFilename ]; then
  aws s3 cp s3://seminar-backups/$latestBackupName $dbFilename 1>&2
fi

# Dumping just the users table, putting it on staging.
# mysqldump -u root picasso users > user_dump.sql
# gzip user_dump.sql
# scp -i ~/.ssh/staging.pem user_dump.sql.gz qa-instance-coordinator1.vpcstaging:~/qa-instances-api
# dbFilename=/tmp/user_dump.sql.gz
# (gunzip -c $dbFilename | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName) 2>&1
# echo "select count(*) from users;" | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName

pv --timer --eta $dbFilename | gunzip | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName

# (temporary) prove that it works
# echo "select count(*) from users;" | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName

# pv $dbFilename | gunzip | mysql -h vpc-seminar-staging.cfgr60m9hv2x.us-west-2.rds.amazonaws.com -u minerva_seminar -p4d7EhK4G $dbName

# pv also doubles as cat.

# try: 
# without --size SIZE
# --eta
# --timer --eta
# --progress
# --interval SEC (default 1: 0.5?)

# adjust size of output to fit in github:
# --width
# --height

# if no output displaying:
#   --force (normally won't display unless terminal)