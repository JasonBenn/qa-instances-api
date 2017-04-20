import { execFile } from 'child_process'
import aws from 'aws-sdk'

const createDB = () => {
  // https://nodejs.org/api/child_process.html#child_process_child_process_execfile_file_args_options_callback
  execFile(process.cwd() + "/scripts/create-qa-instance-db.sh", null, {
    env: {
      dbName: "review_features_lo_detail_page"     
    }
  }, function(error, stdout, stderr) {
    console.log(error, stdout, stderr);
  });
}

// The above basically works.
// Next step: tear them down.
// But first, I need to get an instance started, and deployed.
// Just charge through the creation of everything first.
// Later I can tear down and test up/down.
// createDB()

// The region needs to be set manually, for some reason the env set in ~/.aws isn't taking.
aws.config.update({region:'us-west-2'});
const ec2 = new aws.EC2();

// Wait for instance to be ready, get IP address.
ec2.waitFor('instanceExists', {InstanceIds: ["i-0ad248b7dc45d8846"]}, function(err, data) {
  if (err) console.log(err, err.stack);
  else {
    console.log(data);
    const ipAddress = data.Reservations[0].Instances[0].PublicIpAddress;  // GOTCHA!!
  }
});
