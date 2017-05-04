echo """
CREATE DATABASE IF NOT EXISTS ${dbName};
  GRANT ALL PRIVILEGES ON ${dbName}.* TO '$dbUser'@'%';
""" | mysql -h $dbHost -u $dbUser -p $dbPassword
echo -n "created DB, granted permissions" 1>&2

# AWS credentials are stored in ~/.aws/
latestBackupName=`aws s3 ls s3://$dbS3BackupBucketName | egrep $dbS3BackupGrepPrefix | tail -n1 | awk '{print $4}'`
dbDownloadDir=/tmp/db-backups
dbFilename=$dbDownloadDir/$latestBackupName

if [ ! -f $dbFilename ]; then
  aws s3 cp s3://$dbS3BackupBucketName/$latestBackupName $dbFilename 1>&2
fi

pv --timer --eta $dbFilename | gunzip | mysql -h $dbHost -u $dbUser -p $dbPassword $dbName
