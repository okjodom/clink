# Changelog

## [0.3.0](https://github.com/okjodom/clink/compare/v0.2.1...v0.3.0) (2026-10-15)


### Features

* celebrate completed swaps and show agents what they earn ([98bdee1](https://github.com/okjodom/clink/commit/98bdee1a35a48757865c837002d13e39bf750ef6))
* clarify fee choices and pending transaction displays ([b8c23ff](https://github.com/okjodom/clink/commit/b8c23ff830b848648643dc15d336490502293d17))
* default bitcoin sends to lowest fees with speed choices ([b1d09e3](https://github.com/okjodom/clink/commit/b1d09e373af1a58f2a07c6b44006d46461b7b422))
* full-screen swap-complete moment, wherever you are in the app ([93be1f0](https://github.com/okjodom/clink/commit/93be1f01020a64794b4c09aa559673c4304415e2))
* rebrand to Clink, with dollars and USDT/USDC ([e5ffdd1](https://github.com/okjodom/clink/commit/e5ffdd1d71ae5cdb6305470b6d5f359de7ff32f5))
* show cached activity and streamline swap progress ([bde6888](https://github.com/okjodom/clink/commit/bde6888bf1fab2cca862f578ad5a3968fd302fde))
* simple, fiat-first wallet with the protocol out of the way ([66f6837](https://github.com/okjodom/clink/commit/66f68373577ac19602d6fe6531da3b8ff6ed91bb))
* simpler agent mode and swaps, in plain words ([d30f104](https://github.com/okjodom/clink/commit/d30f104de13ae1229dbd72a522d657c651712f39))
* simpler wallet card, in-app confirmations, collapsed swap details ([1a42aa4](https://github.com/okjodom/clink/commit/1a42aa4a0bae560f1c639f5c9568a4088efe6d3d))
* simplify activity and open payment details ([0705b0e](https://github.com/okjodom/clink/commit/0705b0e5682df61363cbdffc38746694c2d14190))
* simplify activity with search and filters ([ffe1e6d](https://github.com/okjodom/clink/commit/ffe1e6d3e21ca9b97c71185e5e37ed7d225a4e94))
* simplify Send and sync a private contact index ([43fc60b](https://github.com/okjodom/clink/commit/43fc60be09ecdd9e37b0a611a875129034eb2e1d))
* surface pending bitcoin deposits and link blockchain explorers ([dba724f](https://github.com/okjodom/clink/commit/dba724f8ffc161993994413205b99212f013c507))


### Bug Fixes

* cap agent margins at five percent ([b05128d](https://github.com/okjodom/clink/commit/b05128d26dcbe60dc1700739730d33b79c16b9de))
* clearer disputes, declines and cancels; confirm every final step ([676bfe6](https://github.com/okjodom/clink/commit/676bfe668f85331570fac0f1c6423ca434465249))
* close overdue swaps after checking their bitcoin locks ([44e4402](https://github.com/okjodom/clink/commit/44e44027db9fa868ab6f2aa96056839bcf5046f3))
* escrow swaps in a Lightning hold invoice ([722aa16](https://github.com/okjodom/clink/commit/722aa16721d30aaf6bffc396181dd93a5ce0b393))
* keep activity search and filter accessible while scrolling ([61b9eb8](https://github.com/okjodom/clink/commit/61b9eb861702baa6365a4c735b4c6b9430bc1be4))
* lead the finished swap with its pill, then the celebration ([3773cc9](https://github.com/okjodom/clink/commit/3773cc928c8c3a313233d006105c0a14e8feff6e))
* let agents receive, check and answer swap requests ([c0ca4c8](https://github.com/okjodom/clink/commit/c0ca4c8b9b35ce9ce866da24ac57f4bbdd6e6962))
* make Android navigation and tap feedback responsive ([49ddd2a](https://github.com/okjodom/clink/commit/49ddd2a4485b1ecc3919e78f064b80b552ee7dbe))
* name the other side in swaps and calm the online pulse ([3e5b109](https://github.com/okjodom/clink/commit/3e5b109736832ba61322b7456ae601fb281c8d19))
* one-tap cash payments and fewer repeated screens ([a3b2f71](https://github.com/okjodom/clink/commit/a3b2f71fa96a0101ac50fd1107889384bc81a4f8))
* parse APK signer output across build-tools formats ([8a2e47b](https://github.com/okjodom/clink/commit/8a2e47b3107c61b2f4b787c67152aebc61cf404c))
* plainer swap copy, cash-aware prompts and swap activity labels ([7af089d](https://github.com/okjodom/clink/commit/7af089d9c200e0ae4be339447b1e3ac1bafbf78b))
* polish from the first buy and sell rounds ([27c8140](https://github.com/okjodom/clink/commit/27c8140fd0b8e0314e8e208bd919348ce4745cb7))
* preserve exact amounts in bitcoin and spark requests ([7e5f36e](https://github.com/okjodom/clink/commit/7e5f36e379aab3bb395ba7e55a4901e4e1dd6fc3))
* preserve exact cross-chain quotes and include send fees ([060cdd2](https://github.com/okjodom/clink/commit/060cdd226aaaeb0238a50bfbe548e12ca4759c35))
* preserve scanning border in saved QR codes ([daaa817](https://github.com/okjodom/clink/commit/daaa817f92ad831fe9c718ca515681c53aca3331))
* reconcile returned swap locks before network synchronization ([1783fc5](https://github.com/okjodom/clink/commit/1783fc55ad680b0fc78fcc1f795ec830dcdc985d))
* refresh receive descriptions and filter unnamed contacts ([9c54049](https://github.com/okjodom/clink/commit/9c540496a9b8f9ec95e736bf4a7fa3f0b8404c62))
* say whose turn the swap clock is, and drop repeated rows ([8d98728](https://github.com/okjodom/clink/commit/8d9872811edb549769b47a3798bf6a6c7ae31c85))
* track bridge delivery and show blockchain transaction details ([235b33c](https://github.com/okjodom/clink/commit/235b33c1dda518a96f0d56e2daa59b2742f2a85f))
* uncut Sell card, full payee number, "Wallet" tab in both modes ([c0b5c76](https://github.com/okjodom/clink/commit/c0b5c7606dd6f24dbd7e9b39bd70c59a9ec64ad7))
* use header sharing and green fiat actions ([e29e68c](https://github.com/okjodom/clink/commit/e29e68c25801435eb1b456b730beacdfe274e41f))
* use one automatic writer for swap request expiry ([b22b2b1](https://github.com/okjodom/clink/commit/b22b2b1fb5a9d3daadb57b4eb6b0194d04277126))
* use standard payment icons in activity filters ([bae1c10](https://github.com/okjodom/clink/commit/bae1c10bda599beb73136577886933bd503a0682))
* use via consistently in swap activity ([04b0771](https://github.com/okjodom/clink/commit/04b07712dad1792e0676efd2b65fbb4059462569))


### Performance Improvements

* reduce startup derivation and relay publication waits ([e2a0419](https://github.com/okjodom/clink/commit/e2a0419cb1d4bc891ed1fb722aef9eab03734877))


### Documentation

* capture activity search and filters on Samsung ([2146ff2](https://github.com/okjodom/clink/commit/2146ff298cbf0e5905d7f83e8e55df1bb75f8a61))
* link the Breez Spark HTLC guide ([441a931](https://github.com/okjodom/clink/commit/441a931b7c4da608b113ed2dede0e7e1025fae91))

## [0.2.1](https://github.com/pontmore/pontspark/compare/v0.2.0...v0.2.1) (2026-10-04)


### Bug Fixes

* parse APK signer output across build-tools formats ([8a2e47b](https://github.com/pontmore/pontspark/commit/8a2e47b3107c61b2f4b787c67152aebc61cf404c))

## [0.2.0](https://github.com/pontmore/pontspark/compare/v0.1.1...v0.2.0) (2026-10-04)


### Features

* celebrate completed swaps and show agents what they earn ([98bdee1](https://github.com/pontmore/pontspark/commit/98bdee1a35a48757865c837002d13e39bf750ef6))
* full-screen swap-complete moment, wherever you are in the app ([93be1f0](https://github.com/pontmore/pontspark/commit/93be1f01020a64794b4c09aa559673c4304415e2))
* simpler wallet card, in-app confirmations, collapsed swap details ([1a42aa4](https://github.com/pontmore/pontspark/commit/1a42aa4a0bae560f1c639f5c9568a4088efe6d3d))


### Bug Fixes

* clearer disputes, declines and cancels; confirm every final step ([676bfe6](https://github.com/pontmore/pontspark/commit/676bfe668f85331570fac0f1c6423ca434465249))
* escrow swaps in a Lightning hold invoice ([722aa16](https://github.com/pontmore/pontspark/commit/722aa16721d30aaf6bffc396181dd93a5ce0b393))
* lead the finished swap with its pill, then the celebration ([3773cc9](https://github.com/pontmore/pontspark/commit/3773cc928c8c3a313233d006105c0a14e8feff6e))
* let agents receive, check and answer swap requests ([c0ca4c8](https://github.com/pontmore/pontspark/commit/c0ca4c8b9b35ce9ce866da24ac57f4bbdd6e6962))
* name the other side in swaps and calm the online pulse ([3e5b109](https://github.com/pontmore/pontspark/commit/3e5b109736832ba61322b7456ae601fb281c8d19))
* one-tap cash payments and fewer repeated screens ([a3b2f71](https://github.com/pontmore/pontspark/commit/a3b2f71fa96a0101ac50fd1107889384bc81a4f8))
* plainer swap copy, cash-aware prompts and swap activity labels ([7af089d](https://github.com/pontmore/pontspark/commit/7af089d9c200e0ae4be339447b1e3ac1bafbf78b))
* polish from the first buy and sell rounds ([27c8140](https://github.com/pontmore/pontspark/commit/27c8140fd0b8e0314e8e208bd919348ce4745cb7))
* say whose turn the swap clock is, and drop repeated rows ([8d98728](https://github.com/pontmore/pontspark/commit/8d9872811edb549769b47a3798bf6a6c7ae31c85))
* uncut Sell card, full payee number, "Wallet" tab in both modes ([c0b5c76](https://github.com/pontmore/pontspark/commit/c0b5c7606dd6f24dbd7e9b39bd70c59a9ec64ad7))

## [0.1.1](https://github.com/pontmore/pontspark/compare/v0.1.0...v0.1.1) (2026-10-04)


### Documentation

* link the Breez Spark HTLC guide ([441a931](https://github.com/pontmore/pontspark/commit/441a931b7c4da608b113ed2dede0e7e1025fae91))
