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

// TODO: sanitize the DB.
// source seminar_env/bin/activate; cd seminar; DJANGO_SETTINGS_MODULE=config.environments.staging server/manage.py sanitize_for_staging

// The above basically works.
// Next step: tear them down.
// But first, I need to get an instance started, and deployed.
// Just charge through the creation of everything first.
// Later I can tear down and test up/down.
// createDB()

// The region needs to be set manually, for some reason the env set in ~/.aws isn't taking.
aws.config.update({ region: 'us-east-1' })
const ec2 = new aws.EC2()
const opsworks = new aws.OpsWorks()

const waitForInstanceExists = instanceId => {
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#instanceExists-waiter
  if (!instanceId) instanceId = "i-0ad248b7dc45d8846"  // default: seminar-review1
  // Wait for instance to be ready, get IP address.
  ec2.waitFor('instanceExists', {InstanceIds: [instanceId]}, function(err, data) {
    if (err) console.log(err, err.stack);
    else {
      console.log(data);
      const ipAddress = data.Reservations[0].Instances[0].PublicIpAddress;
      // eventually, this should update DB and put IP address in.
    }
  });
}

const STACK_VPCSTAGING = "fd6cc57c-02fb-433c-bf04-00c1dfc7acdc"
const LAYER_SEMINAR_REVIEW = "3b6657ea-ee38-4586-8f9a-a404366e771b"

const defaultAwsCallback = (err, data) => {
  if (err) console.log(err, err.stack)
  else console.log(data)
}

// opsworks.describeStacks({}, defaultAwsCallback)

const instanceId = 'aa72efd0-79f7-4782-be3a-a807985fec34'

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createInstance-property
const createInstance = () => {
  opsworks.createInstance({
    StackId: STACK_VPCSTAGING,
    LayerIds: [LAYER_SEMINAR_REVIEW],
    InstanceType: "m3.large",
    Hostname: "seminar-review-features-lo-detail-page" // must not contain underscores
  }, (err, data) => {
    if (err) console.log(err, err.stack)
    else {
      const instanceId = data.InstanceId
      console.log(instanceId)
    }
  })
}

// createInstance()

const deleteInstance = instanceId => {
  opsworks.deleteInstance({
    InstanceId: instanceId
  }, defaultAwsCallback)
}

// deleteInstance(instanceId)

const startInstance = instanceId => {
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#startInstance-property
  opsworks.startInstance({
    InstanceId: instanceId
  }, defaultAwsCallback)
}

const TERMINAL_STATES = ["connection_lost", "online", "setup_failed", "start_failed", "stop_failed", "stopped"]
// states: booting|connection_lost|online|pending|rebooting|requested|running_setup|setup_failed|shutting_down|start_failed|stop_failed|stopped|stopping|terminated|terminating

const POLL_STATE_INTERVAL = 5000
const pollInstanceState = (instanceId, ignoreFirstState = "", callCount = 0, currentStatus = "") => {
  callCount += 1

  opsworks.describeInstances({
    InstanceIds: [instanceId]
  }, (err, data) => {
    if (err) console.log(err, err.stack)
    else {
      const status = data.Instances[0].Status

      if (status !== currentStatus) {
        currentStatus = status
        console.log(currentStatus)
        // send WSS with new state
      }

      if (ignoreFirstState === status) {
        // If the state is something we want to ignore, like "online" when we're stopping, then proceed even though it's a terminal state.
        setTimeout(pollInstanceState.bind(null, instanceId, ignoreFirstState, callCount, currentStatus), POLL_STATE_INTERVAL)
      } else {
        if (TERMINAL_STATES.includes(currentStatus) || callCount === 40) {
          console.log("finished!");
        } else {
          setTimeout(pollInstanceState.bind(null, instanceId, null, callCount, currentStatus), POLL_STATE_INTERVAL)
        }
      }

    }
  })
}

// startInstance(instanceId, "stopped")
// pollInstanceState(instanceId)

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#stopInstance-property
const stopInstance = instanceId => {
  opsworks.stopInstance({
    InstanceId: instanceId
  }, defaultAwsCallback)
}

// stopInstance(instanceId)
// pollInstanceState(instanceId, "online")

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createDeployment-property
const deployInstance = instanceId => {
  opsworks.createDeployment({
    StackId: STACK_VPCSTAGING,
    InstanceIds: [instanceId],
    Command: {
      Name: "execute_recipes",
      Args: {
        recipes: ["minerva-base-box::deploy"]
      }
    },
    CustomJson: JSON.stringify({
      deploy: {
        seminar_review: {
          environment_variables: {
            SEMINAR_URL: "https://seminar_review_features_lo_detail_page.minervaproject.com",
            DATABASE_DB: "review_features_lo_detail_page"
          }
        }

      }
    })
  }, defaultAwsCallback)
}

deployInstance(instanceId)
// pollInstanceState(instanceId, "online")











