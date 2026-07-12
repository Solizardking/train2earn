# OP-TEE Signer Provider

## Contents
- [Purpose](#purpose)
- [Files](#files)
- [ABI](#abi)
- [Signing protocol](#signing-protocol)
- [Build](#build)
- [Production boundary](#production-boundary)
- [Attestation caveat](#attestation-caveat)
- [Positioning](#positioning)

## Purpose
`web/solana-redpill-verifier/optee` adds an Arm TrustZone signer provider for the same `StoreProofV2` account model used by the TDX gateway.

The OP-TEE path replaces the Rust in-process signer with:

```text
gateway -> normal-world OP-TEE host CLI -> secure-world trusted app
```

The Solana proof format remains stable.

## Files
```text
optee/
+-- include/clawd_ta.h
+-- host/main.c
+-- host/Makefile
+-- ta/clawd_ta.c
+-- ta/Makefile
+-- ta/user_ta_header_defines.h
+-- README.md
+-- PROTOCOL.md
`-- POSITIONING.md
```

## ABI
Commands in `include/clawd_ta.h`:
- `CLAWD_TA_CMD_GET_PUBLIC_KEY`
- `CLAWD_TA_CMD_SIGN_PAYLOAD`
- `CLAWD_TA_CMD_GET_ATTESTATION_BINDING`

Sizes:
- payload hash: 32 bytes
- public key: 65 bytes, uncompressed SEC1
- signature: 65 bytes, `r[32] || s[32] || recovery_id[1]`
- attestation binding: 32 bytes

## Signing protocol
Input:

```text
signed_payload_hash[32]
```

Trusted app output:

```json
{
  "provider": "optee",
  "payload_hash": "<64 hex chars>",
  "public_key": "04...",
  "signature": "..."
}
```

The signature is over:

```text
keccak256(signed_payload_hash)
```

The gateway derives:

```text
signing_address = keccak256(public_key[1..65])[12..32]
```

Then it builds a native Solana secp256k1 instruction where:
- `signature = r || s || recovery_id`
- `eth_address = signing_address`
- `message = signed_payload_hash`

## Build
On an OP-TEE target with `optee_client` headers and `libteec`:

```bash
cd web/solana-redpill-verifier/optee/host
make TEEC_EXPORT=/usr

cd ../ta
make TA_DEV_KIT_DIR=/path/to/optee_os/out/<platform>/export-ta_arm64
```

Common Jetson-style install:

```bash
sudo install -m 0755 host/clawd-optee-signer /usr/sbin/clawd-optee-signer
sudo install -m 0444 ta/4b534c41-5744-5445-452d-5349474e4552.ta /lib/optee_armtz/
```

Sign a payload:

```bash
clawd-optee-signer --payload-hash <64-hex-char-signed-payload-hash>
```

## Production boundary
The current code isolates secp256k1 behind:
- `clawd_k1_public_key`
- `clawd_k1_sign_recoverable`

Before production, wire those functions to the board's approved secure-world secp256k1 backend. Do not silently switch to P-256; Solana's native verification path here is secp256k1.

## Attestation caveat
OP-TEE is not one universal remote-attestation product. Evidence depends on SoC, OEM boot chain, firmware, device keys, and certificate availability.

The Solana proof demonstrates that a claimed TEE signing key signed the payload. Off-chain policy must decide whether the OP-TEE platform evidence is acceptable.

## Positioning
Use this defensible wording:

```text
CLAWD is a self-hosted Solana TEE proof stack that anchors verified RedPill/TDX
and OP-TEE-compatible signer evidence into the same Solana StoreProofV2 PDA
model, using native secp256k1 verification for payload binding.
```

Avoid broad first-ever claims such as "first TEE on blockchain" or "first TEE attestation on Solana".
