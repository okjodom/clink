/**
 * Signs Android release builds with the upload key when its Gradle
 * properties are set (CLINK_UPLOAD_STORE_FILE, _STORE_PASSWORD), for
 * example through ORG_GRADLE_PROJECT_* environment variables in CI. The key
 * alias is always `clink`. The key password defaults to the store
 * password, as PKCS12 keystores have no separate one; _KEY_PASSWORD
 * overrides it. Without a store file, release builds keep Expo's default
 * debug signing so local `assembleRelease` still works.
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_CONFIG = `
        release {
            if (findProperty('CLINK_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('CLINK_UPLOAD_STORE_FILE'))
                storePassword findProperty('CLINK_UPLOAD_STORE_PASSWORD')
                keyAlias 'clink'
                keyPassword findProperty('CLINK_UPLOAD_KEY_PASSWORD') ?: findProperty('CLINK_UPLOAD_STORE_PASSWORD')
            }
        }`;

const RELEASE_SIGNING =
  "signingConfig findProperty('CLINK_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("CLINK_UPLOAD_STORE_FILE")) return mod;

    if (!/signingConfigs \{/.test(gradle)) throw new Error("withReleaseSigning: no signingConfigs block");
    gradle = gradle.replace(/signingConfigs \{/, `signingConfigs {${RELEASE_CONFIG}`);

    const release = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!release.test(gradle)) throw new Error("withReleaseSigning: no release signingConfig to replace");
    gradle = gradle.replace(release, `$1${RELEASE_SIGNING}`);

    mod.modResults.contents = gradle;
    return mod;
  });
};
