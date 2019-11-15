const { cyan, dim, bold } = require('chalk')
const request = require('request-promise-native')
const open = require('open')
const input = require('./../utils/input')
const stringToBool = require('./../utils/stringToBool')
const picker = require('./../utils/picker')
const Spinner = require('./../utils/spinner')

const toBase64 = str => Buffer.from(str, 'utf8').toString('base64')

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

  console.log()
  console.log(bold('XXXXXXX'))
  const account = await picker(
    `targeted account: ${dim('(Use arrow keys and enter to choose)')}`,
    accounts.map(a => a.name),
    {
      default: 0
    }
  )

  console.log(`targeted account: ${account}`)

  const accountId = accounts.find(a => a.name === account).id

  // Select an account:
  // 1. Nicholas Bourdakos's Account (19552f679a1f1feba412927e04b32553)
  // 2. IBM (47b84451ab70b94737518f7640a9ee42) <-> 1323471
  // 3. David Okun Customer PoC Account (9b8365854de24dac80960ac3dbd8c7d5) <-> 1901679
  // 4. STEFAN KWIATKOWSKI's Account (8181f93cf3b742dbd2ab762ed3a2ae26)
  // 5. IBM CTO Brazil (65aa671b2a20403b99ca8dbd195d3dbf) <-> 1899847
  // Enter a number>

  //   Targeted account Nicholas Bourdakos's Account (19552f679a1f1feba412927e04b32553)

  // Targeted resource group default

  // Select a region (or press enter to skip):
  // 1. au-syd
  // 2. in-che
  // 3. jp-osa
  // 4. jp-tok
  // 5. kr-seo
  // 6. eu-de
  // 7. eu-gb
  // 8. us-south
  // 9. us-south-test
  // 10. us-east
  // Enter a number>

  // API endpoint:      https://cloud.ibm.com
  // Region:
  // User:              nicholas.bourdakos@ibm.com
  // Account:           Nicholas Bourdakos's Account (19552f679a1f1feba412927e04b32553)
  // Resource group:    default
  // CF API endpoint:
  // Org:
  // Space:

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

  await picker(
    `targeted account: ${dim('(Use arrow keys and enter to choose)')}`,
    objectStorageResources.resources.map(a => a.name),
    {
      default: 0
    }
  )

  const machineLearningResources = await request({
    url: machineLearningResourcesEndpoint,
    method: 'GET',
    headers: {
      Authorization: 'bearer ' + upgradedToken.access_token
    },
    json: true
  })

  await picker(
    `targeted account: ${dim('(Use arrow keys and enter to choose)')}`,
    machineLearningResources.resources.map(a => a.name),
    {
      default: 0
    }
  )
}
