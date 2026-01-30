# HumanSign Cryptographic Keys

## Keys Included

### private.pem
- **Format**: PKCS8 (required for Web Crypto API)
- **Algorithm**: RSA-2048
- **Usage**: Signing documents within the extension
- **⚠️ IMPORTANT**: Keep this private! Anyone with this key can forge signatures

### public.pem  
- **Format**: X.509 PEM
- **Algorithm**: RSA-2048
- **Usage**: Verifying signatures (can be shared publicly)
- **Distribution**: Share this with anyone who needs to verify your signatures

## Key Format

The private key MUST be in PKCS8 format for the Web Crypto API:
```
-----BEGIN PRIVATE KEY-----
(base64 data)
-----END PRIVATE KEY-----
```

❌ PKCS1 format will NOT work:
```
-----BEGIN RSA PRIVATE KEY-----
```

## For Production Use

### Generating Your Own Keys

For production, generate your own key pair:

```bash
# Generate private key (PKCS8 format)
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key
openssl rsa -pubout -in private.pem -out public.pem
```

### Verifying Signatures

To verify a .humansign file, you'll need to:

1. Parse the JWS (JSON Web Signature)
2. Extract the payload and signature
3. Verify using the public key

Example verification script (Node.js):
```javascript
const fs = require('fs');
const crypto = require('crypto');

// Read the .humansign file
const jws = fs.readFileSync('document.humansign', 'utf8');
const [header64, payload64, signature64] = jws.split('.');

// Decode
const payload = JSON.parse(Buffer.from(payload64, 'base64url').toString());
console.log('Subject:', payload.subject);
console.log('Session:', payload.sessionIndex);
console.log('Events:', payload.chain.reduce((sum, b) => sum + b.events.length, 0));
console.log('Document hash:', payload.document_hash);

// Verify signature
const publicKey = fs.readFileSync('public.pem');
const verify = crypto.createVerify('RSA-SHA256');
verify.update(header64 + '.' + payload64);
const isValid = verify.verify(publicKey, signature64, 'base64url');

console.log('Signature valid:', isValid);
```

## Security Notes

1. **Private Key Storage**: 
   - The private key is bundled in the extension
   - Anyone who extracts the extension can get the key
   - For production: Use a secure key management solution

2. **Key Rotation**:
   - Generate new keys periodically
   - Keep old public keys for verifying historical signatures
   - Update extension with new private key

3. **Distribution**:
   - Share ONLY the public key
   - Never share or transmit the private key
   - Consider using a key server for public key distribution

## What's in a .humansign File?

The .humansign file is a JWS (JSON Web Signature) containing:

```json
{
  "subject": "author_id",
  "sessionIndex": 1,
  "rep": 1,
  "document_hash": "sha256_hash_of_document",
  "chain": [
    {
      "events": [[timestamp, "keydown"], [timestamp, "keyup"], ...],
      "prev_hash": "previous_block_hash",
      "block_hash": "this_block_hash"
    }
  ],
  "iat": 1706631234
}
```

The signature proves:
- The keystroke events were captured
- The timing patterns match human typing
- The document hash matches the content
- The author is who they claim to be (has the private key)

## Key Fingerprint

To get the public key fingerprint:
```bash
openssl rsa -pubin -in public.pem -outform DER | openssl dgst -sha256 | cut -d' ' -f2
```

This fingerprint can be used to identify your public key.

---

**Generated**: January 30, 2026
**Algorithm**: RSA-2048 with SHA-256
**Format**: PKCS8 (private) / X.509 (public)
