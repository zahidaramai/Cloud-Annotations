const fs = require('fs-extra')
const { green } = require('chalk')
const loadCredentials = require('./../utils/loadCredentials')
const optionsParse = require('./../utils/optionsParse')
const cosEndpointBuilder = require('./../utils/cosEndpointBuilder')
const input = require('./../utils/input')
const Spinner = require('./../utils/spinner')
const stringToBool = require('./../utils/stringToBool')
const progress = require('./../commands/progress')
const WML = require('./../api/wml')
const COS = require('ibm-cos-sdk')

const stillRunning = async (modelId, config) => {
  const shouldMonitor = stringToBool(
    await input(
      `Model is still training, would you like to monitor progress? `,
      'yes'
    )
  )

  if (shouldMonitor) {
    await progress([modelId], config)
  }
}

const downloadDir = async (cos, bucket, prefix, modelId, path) => {
  const files = await cos
    .listObjectsV2({ Bucket: bucket, Prefix: `${prefix}/${path}` })
    .promise()
    .then(data =>
      data.Contents.map(o => o.Key).filter(name => !name.endsWith('/'))
    )
  const promises = files.map(file => {
    const outputPath = `./${modelId}/` + file.replace(`${prefix}/`, '')
    return cos
      .getObject({
        Bucket: bucket,
        Key: file
      })
      .promise()
      .then(data => fs.outputFile(outputPath, data.Body))
  })
  await Promise.all(promises)
}

module.exports = async options => {
  const parser = optionsParse()
  parser.add('model_id')
  parser.add(['--config', '-c'])
  parser.add([true, '--coreml'])
  parser.add([true, '--tflite'])
  parser.add([true, '--tfjs'])
  parser.add([true, 'help', '--help', '-help', '-h'])
  const ops = parser.parse(options)

  if (ops.help) {
    console.log('cacli download <model_id> [--tflite] [--coreml] [--tfjs]')
    return process.exit()
  }
  if (!ops.model_id) {
    console.log('No Model ID provided')
    console.log('Usage: cacli download <model_id>')
    return process.exit(1)
  }

  const config = await loadCredentials()

  const run = await new WML(config).getTrainingRun(ops.model_id)

  const status = run.entity.status.state
  switch (status) {
    case 'pending':
    case 'running':
      await stillRunning(ops.model_id, config)
      break
    case 'completed':
      break
    case 'error':
    case 'failed':
    case 'canceled':
      console.log('Training was canceled or failed.')
      return process.exit()
  }

  const spinner = new Spinner()
  spinner.setMessage('Downloading model...')
  spinner.start()

  const {
    bucket,
    model_location
  } = run.entity.training_results_reference.location

  const { region, access_key_id, secret_access_key } = config.credentials.cos
  const cosConfig = {
    endpoint: cosEndpointBuilder(region, true),
    accessKeyId: access_key_id,
    secretAccessKey: secret_access_key
  }
  const cos = new COS.S3(cosConfig)
  let downloads = []

  if (ops.coreml) {
    downloads.push(
      downloadDir(cos, bucket, model_location, ops.model_id, 'model_ios')
    )
  }
  if (ops.tflite) {
    downloads.push(
      downloadDir(cos, bucket, model_location, ops.model_id, 'model_android')
    )
  }
  if (ops.tfjs) {
    downloads.push(
      downloadDir(cos, bucket, model_location, ops.model_id, 'model_web')
    )
  }

  // Default, download everything.
  if (downloads.length === 0) {
    downloads.push(downloadDir(cos, bucket, model_location, ops.model_id, ''))
  }

  await Promise.all(downloads)

  spinner.stop()
  console.log(`${green('success')} Download complete.`)
}
