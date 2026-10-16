# Zapstore releases

The Release workflow calls `zapstore.yml` after the signed APK has been attached
to the GitHub release. This works with both a reused CI artifact and a fresh
Android build. It is an explicit workflow call because events created using
GitHub's default token do not trigger other workflows.

The publisher downloads the exact `clink-vX.Y.Z.apk` and its checksum, verifies
the production package ID, version, ARM64 support, APK signature and Clink upload
certificate, then runs the pinned Zapstore CLI. Exact release and asset filters
prevent it from selecting a different release or a development build. Drafts
and prereleases are rejected. The GitHub APK download URL and release notes
are preserved. The CLI binary itself is pinned by version and SHA-256.

Publishing also renews the NIP-C1 proof linking the Android signing certificate
to the dedicated Nostr publisher. Proof generation happens before app publication
so a bad signing setup fails early. The helper detects JKS versus PKCS#12 from
the file contents and gives the pinned CLI the matching extension; Android's
`.keystore` filename alone does not identify the format.

The signed proof is sent after app publication, allowing first-time publisher
whitelisting to finish first. Network failures retry up to three times; explicit
relay rejection fails immediately. The job summary reports app publication and
certificate linking separately. A failed step does not rebuild or remove the
GitHub release.

## Publisher identity

Clink has a dedicated publisher, separate from anyone's wallet identity:

`npub18gufd4g8mrz9qanxja9svr9xmqteq48yhqhkflu7ajm6rzqqgwvq55l049`

Its public key is committed in the root `zapstore.yaml`. Once this configuration
is on the default branch, Zapstore can verify repository ownership and
automatically whitelist the publisher on its first publication.

GitHub Actions secrets required:

| Secret | Purpose |
| --- | --- |
| `ZAPSTORE_SIGN_WITH` | Dedicated publisher's Nostr signing key, or an unattended NIP-46 bunker URL |
| `CLINK_KEYSTORE_BASE64` | Existing Android production signing keystore |
| `CLINK_STORE_PASSWORD` | Existing keystore password; alias is `clink` |

The dedicated key is already configured in GitHub Secrets. Its private local
backup is `.local/zapstore/publisher.json` (ignored by Git and readable only by
the local owner). Back it up securely: GitHub Secrets cannot be read back.
Keep the same publisher identity and Android signing key across releases so
existing users continue to receive trusted updates. A bunker can replace the
stored signing key later while preserving the same identity.

## Retry a release

After this workflow is merged, use **Actions → Zapstore → Run workflow** and
enter the existing stable release tag, such as `v0.3.1`. This retries
distribution without rebuilding Android or creating another release. Keep the
default branch selected so the current publishing workflow and metadata run.
The main workflow serializes releases and Zapstore publishing is also serialized.

Edit `zapstore.yaml` to update listing copy and screenshots. Credentials belong
only in GitHub Secrets; do not commit private keys to the listing configuration.

## Validation

Run `node --test scripts/prepare-zapstore.test.mjs scripts/publish-zapstore-proof.test.mjs`
for release-selection, production APK and relay acknowledgement guards.
CI runs these checks alongside the app's normal checks. It also downloads the
same pinned CLI used in production and runs
`ZSP_BIN=/path/to/zsp node --test scripts/sign-zapstore-proof.test.mjs` against
temporary JKS and PKCS#12 keystores. These tests use throwaway keys and do not
publish to relays.

## v0.3.1 publishing incident

The first run successfully published the application, release and APK events,
but failed certificate linking with `load JKS: got invalid magic`. The actual
keystore was PKCS#12; its `.keystore` filename made zsp v0.4.17 select its JKS
loader. A public relay query confirmed that the v0.3.1 listing was present and
the ownership proof was missing. Retry v0.3.1 after merging the format fix;
there is no need to rebuild the APK or create another release.

References: [Zapstore publishing guide](https://zapstore.dev/docs/publish),
[pinned CLI source](https://github.com/zapstore/zsp/tree/v0.4.17),
[GitHub workflow trigger rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).
