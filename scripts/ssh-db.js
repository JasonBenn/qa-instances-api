import { readJSON } from '../src/utils'
import { exec } from 'child_process'
import kexec from 'kexec'


const { dbHost, dbUser, dbPassword, dbName } = readJSON('./config/picasso.json')
kexec(`mysql -h ${dbHost} -u ${dbUser} -p ${dbPassword} ${dbName}`)