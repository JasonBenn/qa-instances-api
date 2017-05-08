
eval "echo 'CREATE DATABASE IF NOT EXISTS $dbName;' | $pipeDataCmd"
echo "CREATE DATABASE IF NOT EXISTS $dbName | mysql ..." 1>&2

# AWS credentials are stored in ~/.aws/
echo "Fetching latest DB backup name..." 1>&2
latestBackupName=`aws s3 ls s3://$dbS3BackupBucketName | egrep $dbS3BackupGrepPrefix | tail -n1 | awk '{print $4}'`
dbDownloadDir=/tmp/db-backups
dbFilename=$dbDownloadDir/$latestBackupName

if [ ! -f $dbFilename ]; then
  aws s3 cp s3://$dbS3BackupBucketName/$latestBackupName $dbFilename 1>&2
fi

# pipe viewer output is automatically routed to stderr
eval "pv --timer --eta $dbFilename | gunzip | $pipeDataCmd $dbName"
