// ? HOW much info about an instance's state can I get from the API?
// Does Python have promises? If not, maybe Node/Express(? or the sinatra/flask equivalent for node) would be better for this.

// sqlite db: 
//   pulls table:
        // pr_id (fk)
        // pr_name (includes slashes)
        // hostname (normalized to be valid for AWS)
        // db_name (normalized to be valid for RDS, might entail truncation)
        // db_username (normalized to be valid for RDS, might entail truncation)
        // instance state: { stopped, setting-up, deploying, created }
        // instance ID ??? need for destroy APIs??
        // route53 url
        // SHA of most recent deploy
        // deploying: bool

// GET pulls/:pull_id
//   should connect a websocket
//   returns: current state of all activities, as derived by current progress
//   returns: { state: inactive|booting|setting-up|deploying|finished, data: { url: ... } }

// (client: on success, call GET, open a websocket)
// Creating seminar-jb-lo-index...
    // EC2: created|setting up...|deploying...| :green-check-mark: created
    // Route53 record: waiting on EC2... | :green-check-mark: created
    // RDS DB: :green-check-mark: created
    // RDS user: :green-check-mark: created
    // ^ after this: Done! For 1 second, then replace with `Review app: [seminar-jb-lo-index](url)`

// POST pulls (with :pull_id)
//   GET or CREATE w sqlite db.
//   spawn background worker that periodically posts websocket messages
//   returns: success|fail

// POST deploys (with :pull_id)
//   CREATE w sqlite db
//   spawn background worker that periodically posts websocket messages
//   UPDATE deploying
//   returns: success|fail

// DESTROY pulls (with :pull_id)
//   DESTROY if exists
//   spawn bg worker that periodically posts websocket messages
//   returns: success|fail

// (client: when destroying, allow user to create another app)
// Tearing down seminar-jb-lo-index... 
    // Route53 record: :green-check-mark: deleted
    // RDS DB: :green-check-mark: deleted
    // RDS user: :green-check-mark: deleted
    // EC2: stopping... | :green-check-mark: deleted
    // Deploying...
    // ^ after this: Done! For 1 second, then remove row.

// def push(pr_id, message):
    // pass

// BACKGROUND WORKER
// does all the AWS stuff, and after each call, posts websocket message.
// def create_review_app(pr_id, pr_name):
    // this will prob just receive the ID... chrome extension could extract from URL.
        // if so, will need github API for getting PR name.
    // hostname = normalize_to_hostname(pr_name)
    // db_name = normalize_to_db_name(pr_name)
    // db_username = normalize_to_db_username(pr_name)
    // INSERT pr_id, pr_name, hostname, db_name, db_username, initial state
    // PARALLEL:
        // create_instance(hostname)
            // UPDATE pr_id SET instance_id (wait, do I need this?)
                // POLL for updates every 3-10 seconds?
                    // ON new state: push(pr_id, message)
                    // ON end state: stop polling
                        // create route53 (can i do this before? when do i get the internal DNS for the EC2 instance that I need to point the record at?)
                        // INSERT route53 URL
                        // push(pr_id, message which includes URL)
        // create_db(db_name)
            // THEN create_db_user(db_name)
                // THEN GRANT privileges to user over db.
    // THEN:
        // create deployment. custom JSON will include db_name, db_user as env variables.

// def destroy_review_app(pr_id):
    // be able to destroy partial app - don't break on failure.
    // delete_instance
        // on success: UPDATE pr_id
    // delete_route53
        // on_success: UPDATE pr_id
    // delete db_name
        // on_success: UPDATE pr_id
    // delete db_username
        // on_success: UPDATE pr_id
    // WHEN all done:
        // delete record.

// def deploy(pr_id):
    // create deployment API - always use latest SHA
    // pass

// TASK: print pulls table. use jason's table command discovery.
// TASKs: one for each command, should take as args pr_id. that would be v helpful!

// chrome extension:
// should be able to extract URL PR ID, latest SHA
// HTML for rendering state of deploying/destroying app
// One fat row for:
    // Route53 record: :green-check-mark: created
    // RDS DB: :green-check-mark: created
    // RDS user: :green-check-mark: created
    // EC2: stopping... | :green-check-mark: created
    // ^ after this: Done! For 1 second, then remove row.
// Two skinny rows for: 
    // Review app: [seminar-jb-lo-index](url) at #da135c
    // [(Re)deploy latest commit] (say "Redeploy" if already at latest, otherwise say deploy)
    // [Create review app for this PR]

// Also: update local state and render with websocket messages.
// Set it up so that you pass a blob of data and render the whole thing 

