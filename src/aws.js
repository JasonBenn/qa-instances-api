import { execFile } from 'child_process'

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

createDB()