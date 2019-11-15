const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { cyan, dim, bold, green } = require('chalk')
const request = require('request-promise-native')
const open = require('open')
const input = require('./../utils/input')
const stringToBool = require('./../utils/stringToBool')
const picker = require('./../utils/picker')
const Spinner = require('./../utils/spinner')
const { eraseLines } = require('ansi-escapes')

const toBase64 = str => Buffer.from(str, 'utf8').toString('base64')

const CREDENTIAL_PATH = path.join(os.homedir(), '.cacli', 'credentials.json')

module.exports = async () => {
  const baseEndpoint = 'cloud.ibm.com'
  const endpointsEndpoint = `https://iam.${baseEndpoint}/identity/.well-known/openid-configuration`
  const accountsEndpoint = `https://accounts.${baseEndpoint}/coe/v2/accounts`
  const identityEndpoints = await request({
    url: endpointsEndpoint,
    method: 'GET',
    json: true
  })
  const passcodeEndpoint = identityEndpoints.passcode_endpoint
  const tokenEndpoint = identityEndpoints.token_endpoint
  console.log(
    `receive a One-Time Passcode from ${cyan.bold(
      passcodeEndpoint
    )} to proceed.`
  )
  const openInBrowser = stringToBool(
    await input('open the URL in the default browser? ', 'yes')
  )
  if (openInBrowser) {
    await open(passcodeEndpoint)
  }
  const otp = await input(`One-Time Passcode ${cyan.bold('❯')} `)

  const spinner = new Spinner()
  console.log()
  spinner.setMessage('Authenticating...')
  spinner.start()

  const token = await request({
    url: tokenEndpoint,
    method: 'POST',
    headers: {
      Authorization: `Basic ${toBase64('bx:bx')}`
    },
    form: {
      grant_type: 'urn:ibm:params:oauth:grant-type:passcode',
      passcode: otp
    },
    json: true
  })

  const accountsJson = await request({
    url: accountsEndpoint,
    method: 'GET',
    headers: {
      Authorization: 'bearer ' + token.access_token
    },
    json: true
  })

  if (accountsJson.next_url) {
    // TODO: check if there are more accounts
  }
  spinner.stop()

  const accounts = accountsJson.resources.map(i => {
    if (i.entity.bluemix_subscriptions[0].softlayer_account_id) {
      return {
        id: i.metadata.guid,
        name: `${i.entity.name} (${i.metadata.guid}) <-> ${i.entity.bluemix_subscriptions[0].softlayer_account_id}`
      }
    }
    return {
      id: i.metadata.guid,
      name: `${i.entity.name} (${i.metadata.guid})`
    }
  })

  let iAccount = 0
  if (accounts.length > 1) {
    iAccount = await picker(
      `${bold('Accounts')} ${dim('(Use arrow keys and enter to choose)')}`,
      accounts.map(a => a.name),
      {
        default: 0,
        returnIndex: true
      }
    )
  }

  const account = accounts[iAccount]
  console.log(`Account ${cyan.bold(account.name)}`)

  const accountId = account.id

  console.log()
  spinner.setMessage('Loading resources...')
  spinner.start()
  const upgradedToken = await request({
    url: tokenEndpoint,
    method: 'POST',
    headers: {
      Authorization: `Basic ${toBase64('bx:bx')}`
    },
    form: {
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      bss_account: accountId
    },
    json: true
  })

  const objectStorageResourcesEndpoint = `https://resource-controller.${baseEndpoint}/v2/resource_instances?resource_id=dff97f5c-bc5e-4455-b470-411c3edbe49c`
  const machineLearningResourcesEndpoint = `https://resource-controller.${baseEndpoint}/v2/resource_instances?resource_id=51c53b72-918f-4869-b834-2d99eb28422a`

  const objectStorageResources = await request({
    url: objectStorageResourcesEndpoint,
    method: 'GET',
    headers: {
      Authorization: 'bearer ' + upgradedToken.access_token
    },
    json: true
  })
  spinner.stop()

  if (objectStorageResources.next_url) {
    // TODO: check if there are more accounts
  }

  let iObjectStorage = 0
  if (objectStorageResources.resources.length > 1) {
    iObjectStorage = await picker(
      `${bold('Object Storage Instances')} ${dim(
        '(Use arrow keys and enter to choose)'
      )}`,
      objectStorageResources.resources.map(a => a.name),
      {
        default: 0,
        returnIndex: true
      }
    )
  }

  const objectStorage = objectStorageResources.resources[iObjectStorage]
  process.stdout.write(eraseLines(2))
  console.log(`Object Storage Instance ${cyan.bold(objectStorage.name)}`)

  console.log()
  spinner.start()
  const machineLearningResources = await request({
    url: machineLearningResourcesEndpoint,
    method: 'GET',
    headers: {
      Authorization: 'bearer ' + upgradedToken.access_token
    },
    json: true
  })
  spinner.stop()

  if (machineLearningResources.next_url) {
    // TODO: check if there are more accounts
  }

  let iMachineLearning = 0
  if (machineLearningResources.resources.length > 1) {
    iMachineLearning = await picker(
      `${bold('Machine Learning Instances')} ${dim(
        '(Use arrow keys and enter to choose)'
      )}`,
      machineLearningResources.resources.map(a => a.name),
      {
        default: 0,
        returnIndex: true
      }
    )
  }

  const machineLearning = machineLearningResources.resources[iMachineLearning]
  process.stdout.write(eraseLines(2))
  console.log(`Machine Learning Instance ${cyan.bold(machineLearning.name)}`)

  console.log()
  spinner.setMessage('Verifying...')
  spinner.start()

  const findCredential = await request({
    url: `https://resource-controller.${baseEndpoint}/v2/resource_keys?name=cloud-annotations-binding`,
    method: 'GET',
    headers: {
      Authorization: 'bearer ' + upgradedToken.access_token
    },
    json: true
  })

  let cosCredential = findCredential.resources[0]

  if (cosCredential === undefined) {
    cosCredential = await request({
      url: `https://resource-controller.${baseEndpoint}/v2/resource_keys`,
      method: 'POST',
      headers: {
        Authorization: 'bearer ' + upgradedToken.access_token
      },
      body: {
        name: 'cloud-annotations-binding',
        source: objectStorage.id,
        role: 'Writer',
        parameters: { HMAC: true }
      },
      json: true
    })
  }

  spinner.stop()
  console.log(`${green('success')} You are now logged in.`)

  fs.outputFileSync(
    CREDENTIAL_PATH,
    JSON.stringify({
      access_token: upgradedToken.access_token,
      machine_learning_instance: machineLearning,
      object_storage_instance: cosCredential
    })
  )
}
