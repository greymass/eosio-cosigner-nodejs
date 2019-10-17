# ⚠️ WARNING: NO SAFEGUARDS/FILTERS ARE IMPLEMENTED

⚠️ Do not run this prototype in any sort of production environment at this point and risk the security of an account. This application is unfinished and being opened source for educational purposes.

---

Prototype: eosio-cosigner-nodejs
====

A nodejs service to cosign transactions for use within the [ONLY_BILL_FIRST_AUTHORIZER](https://github.com/EOSIO/spec-repo/blob/master/esr_contract_pays.md) system in EOSIO using the [EEP-7 Signing Request Protocol](https://github.com/eosio-eps/EEPs/blob/master/EEPS/eep-7.md).

Run with docker
---------------

```
docker build .
...
<container id>

docker run -d --name eosio-cosigner-nodejs \
    -p 8080:8080 \
    --env ACCOUNT="account" \
    --env PERMISSION="permission" \
    --env API="https://jungle.greymass.com" \
    --env PRIVATEKEY="5_WIF_PRIVATE_KEY_STRING" \
    <container id>
```
