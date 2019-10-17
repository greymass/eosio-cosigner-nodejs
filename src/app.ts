import * as config from 'config'
import * as http from 'http'
import { URL } from 'url'
import { logger } from './common'
import version from './version'

import { JsonRpc, Api } from 'eosjs'
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig'

const { SigningRequest } = require('eosio-signing-transport')

const ecc = require('eosjs-ecc')
const fetch = require('node-fetch')
const util = require('util')
const zlib = require('zlib')
const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()

export interface Cosigner {
    account: string,
    permission: string,
    private: string,
    public: string,
}

let cosigner:Cosigner = {
    account: config.get('account'),
    permission: config.get('permission'),
    private: String(config.get('privateKey')),
    public: String(ecc.privateToPublic(config.get('privateKey'), 'EOS')),
}

const signatureProvider = new JsSignatureProvider([cosigner.private])
const rpc = new JsonRpc(config.get('api'), { fetch })
const eos = new Api({
    rpc,
    signatureProvider,
    textDecoder,
    textEncoder,
})

const httpServer = http.createServer(handleRequest)

const signingRequestOpts = {
    textEncoder,
    textDecoder,
    zlib: {
        deflateRaw: (data: Buffer) => new Uint8Array(zlib.deflateRawSync(Buffer.from(data))),
        inflateRaw: (data: Buffer) => new Uint8Array(zlib.inflateRawSync(Buffer.from(data))),
    },
    abiProvider: {
        getAbi: async (account: string) => (await rpc.get_abi(account)).abi
    }
}

export interface SigningRequestCallback {
    a: string,
    bn: string,
    sig: string,
    t: string,
    tx: string,
}

async function handlePost(request: http.IncomingMessage, response: http.ServerResponse) {
    // Parse Request
    const data = await readBody(request)
    // Recreate transaction from signing request
    const req = SigningRequest.from(data.t, signingRequestOpts)
    const incomingTransaction = await req.getTransaction(`${cosigner.account}@${cosigner.permission}`)
    // Retrieve Chain ID
    const chainId = req.getChainId()
    // Retrieve ABIs
    const abis = await eos.getTransactionAbis(incomingTransaction)
    // Create copy of the transaction with the serialized actions
    const serializedActionsTransaction = {
        ...incomingTransaction,
        actions: await eos.serializeActions(incomingTransaction.actions)
    }
    // Serialize the entire transaction
    const serializedTransaction = eos.serializeTransaction(serializedActionsTransaction)
    // Retrieve available keys from signature provider
    const availableKeys = await eos.signatureProvider.getAvailableKeys()
    // Create a signature for the cosigner
    const cosignerTransaction = await eos.signatureProvider.sign({
        abis,
        chainId,
        // Bypass eosjs restrictions by tricking it into thinking
        // the public key provided is the only one required.
        requiredKeys: [cosigner.public],
        serializedTransaction,
    })
    // Combine signatures with the serialized transaction
    const combinedTransactionArgs = {
        serializedTransaction,
        signatures: [
            data.sig,
            ...cosignerTransaction.signatures,
        ]
    }
    // Push transaction
    const pushResponse = eos.pushSignedTransaction(combinedTransactionArgs)
    logger.info({tx: data.tx}, 'successfully pushed')
}

function readBody(request: http.IncomingMessage) {
    return new Promise<SigningRequestCallback>((resolve, reject) => {
        let body = ''
        request.on('error', reject)
        request.on('data', (chunk) => { body += chunk.toString() })
        request.on('end', () => resolve(JSON.parse(body)))
    })
}

function handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    if (request.method !== 'POST') {
        response.statusCode = 405
        response.write('Method not allowed')
        response.end()
        return
    }
    handlePost(request, response)
        .then(() => {
            response.statusCode = 200
            response.write('Ok')
            response.end()
        })
        .catch((error) => {
            logger.warn(error, 'error handling post request')
            response.statusCode = 400
            response.write('Bad request')
            response.end()
        })
}

export async function main() {
    const port = parseInt(config.get('port'), 10)
    if (!isFinite(port)) {
        throw new Error('Invalid port number')
    }
    logger.info({version}, 'starting')
    await new Promise((resolve, reject) => {
        httpServer.listen(port, resolve)
        httpServer.once('error', reject)
    })
    logger.info({port}, 'server running')
}

function ensureExit(code: number, timeout = 3000) {
    process.exitCode = code
    setTimeout(() => { process.exit(code) }, timeout)
}

if (module === require.main) {
    process.once('uncaughtException', (error) => {
        logger.error(error, 'Uncaught exception')
        ensureExit(1)
    })
    main().catch((error) => {
        logger.fatal(error, 'Unable to start application')
        ensureExit(1)
    })
}
