import { readJSON } from '../src/utils'
import kexec from 'kexec'


readJSON('config/picasso.json').then(config => {
  const { dbHost, dbUser, dbPassword, dbName } = config
  kexec(`mysql -h ${dbHost} -u ${dbUser} -p${dbPassword}`);
})